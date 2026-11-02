using IshonchDesktop.Epos;
using IshonchDesktop.Marking;
using IshonchDesktop.Models;

namespace IshonchDesktop.UI;

/// <summary>
/// "E-POS orqali sotish": 1C dagi tayyor markirovkali chekni (tovarlar + kodlar) E-POS Communicator orqali
/// fiskal chek qilib sotadi. Sotish HAQIQIY fiskal chek yaratadi, shuning uchun alohida tasdiq belgisi va
/// savol oynasi bor; bir 1C cheki ikki marta sotilmaydi.
/// </summary>
public sealed class CommunicatorTab : UserControl
{
    readonly BaseEntry baseEntry;
    readonly Func<Task<WebTab>> getSoliqTab;
    /// <summary>Shu bazaning E-POS i: Communicator manzili va biriktirilgan fiskal modul (har baza — o'zinikiga).</summary>
    readonly EposPrefs epos;
    UzposClient client;
    /// <summary>Hozir ulangan fiskal modul (Terminal/FactoryID; aniqlanmagan bo'lsa null).</summary>
    string? connectedModule;
    readonly TextBox urlBox = new() { Width = 250 };
    readonly Label bindLabel = new() { AutoSize = true, Padding = new Padding(8, 6, 0, 0), ForeColor = Color.DimGray };
    readonly Button unbindBtn = new() { Text = "Modulni almashtirish", AutoSize = true };
    readonly ProductMap map;
    readonly SoldLog soldLog;
    readonly List<SaleLine> lines = new();
    readonly MarkingReceipt? preset;
    MarkingReceipt? receipt;

    /// <summary>Muvaffaqiyatli sotuv natijasi (sotilmagan bo'lsa null).</summary>
    public SaleResult? Result { get; private set; }

    readonly Label status = new() { AutoSize = true, Padding = new Padding(0, 6, 12, 0) };
    readonly ComboBox portBox = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 70 };
    readonly Button refreshBtn = new() { Text = "Holatni yangilash", AutoSize = true };
    readonly Button loadBtn = new() { Text = "1C chekidan yuklash", AutoSize = true };
    readonly Button ikpuBtn = new() { Text = "IKPU va qadoqni to'ldirish", AutoSize = true };
    readonly Button checkBtn = new() { Text = "Kodlarni tekshirish", AutoSize = true };
    readonly ComboBox payType = new() { DropDownStyle = ComboBoxStyle.DropDownList, Width = 90 };
    readonly CheckBox confirmReal = new() { Text = "Bu HAQIQIY fiskal chek yaratishini tushunaman", AutoSize = true, ForeColor = Color.Firebrick };
    readonly Button sellBtn = new() { Text = "Sotish (fiskal chek)", AutoSize = true };
    readonly Label summary = new() { Dock = DockStyle.Bottom, AutoSize = true, Padding = new Padding(0, 6, 0, 0), Font = new Font("Segoe UI", 10f, FontStyle.Bold) };
    readonly DataGridView grid = new()
    {
        Dock = DockStyle.Fill, AllowUserToAddRows = false, AllowUserToDeleteRows = false,
        SelectionMode = DataGridViewSelectionMode.FullRowSelect, MultiSelect = false, RowHeadersVisible = false,
        AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill, BackgroundColor = SystemColors.Window,
    };
    readonly TextBox logBox = new() { Dock = DockStyle.Bottom, Height = 120, Multiline = true, ReadOnly = true, ScrollBars = ScrollBars.Vertical };

    const int ColName = 0, ColQty = 1, ColCodes = 2, ColMarks = 3, ColIkpu = 4, ColPack = 5,
        ColNetPrice = 6, ColNetSum = 7, ColVatRate = 8, ColVatSum = 9, ColTotal = 10, ColState = 11;

    public CommunicatorTab(BaseEntry baseEntry, Func<Task<WebTab>> getSoliqTab, MarkingReceipt? preset = null)
    {
        this.preset = preset;
        this.baseEntry = baseEntry;
        this.getSoliqTab = getSoliqTab;
        map = new ProductMap(baseEntry);
        soldLog = new SoldLog(baseEntry);
        epos = ZoomStore.Settings?.GetEpos(baseEntry.ProfileKey) ?? new EposPrefs();
        client = new UzposClient(epos.Url);
        urlBox.Text = epos.Url;
        Dock = DockStyle.Fill;
        Padding = new Padding(12);
        Font = new Font("Segoe UI", 9.5f);

        portBox.Items.AddRange(new object[] { "3448", "3449", "3450" });
        portBox.SelectedIndex = 0;
        payType.Items.AddRange(new object[] { "Naqd", "Karta" });
        payType.SelectedIndex = 0;

        // Narx ustunlari 1C hujjatidagi kabi: Narx va Summa — QQS'siz, keyin % QQS, QQS summasi va Jami (QQS bilan = «Всего»)
        foreach (var (title, weight, ro) in new[] { ("1C tovari", 20, true), ("Dona", 5, true), ("Kod", 4, true),
                     ("Markirovkalar", 16, false), ("IKPU (MXIK)", 13, false), ("Qadoq", 6, false),
                     ("Narx", 11, true), ("Summa", 12, true), ("QQS %", 6, true), ("QQS", 11, true), ("Jami", 12, true), ("Holat", 15, true) })
        {
            // «Markirovkalar» — ochiladigan ro'yxat: shu qatorda sotilayotgan har bir dona uchun uning kodi
            DataGridViewColumn col = title == "Markirovkalar"
                ? new DataGridViewComboBoxColumn { DisplayStyle = DataGridViewComboBoxDisplayStyle.DropDownButton, FlatStyle = FlatStyle.Flat }
                : new DataGridViewTextBoxColumn { ReadOnly = ro };
            col.HeaderText = title;
            col.FillWeight = weight;
            grid.Columns.Add(col);
        }
        foreach (var col in new[] { ColQty, ColCodes, ColNetPrice, ColNetSum, ColVatRate, ColVatSum, ColTotal })
            grid.Columns[col].DefaultCellStyle.Alignment = DataGridViewContentAlignment.MiddleRight;
        grid.DataError += (_, e) => e.ThrowException = false; // ro'yxatdagi matn o'zgarsa ham xato oynasi chiqmasin
        grid.EditingControlShowing += (_, e) =>
        {
            if (e.Control is ComboBox box) box.DropDownWidth = Math.Max(box.Width, 520);
        };

        var top = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true, WrapContents = true };
        top.Controls.AddRange(new Control[] { status, new Label { Text = "Fiskal port:", AutoSize = true, Padding = new Padding(0, 6, 0, 0) }, portBox, refreshBtn });
        // Har baza o'z Communicator iga (1C dagi «Интеграции с системами параметры» kabi) va o'z fiskal moduliga ulanadi
        var eposRow = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true, WrapContents = true };
        eposRow.Controls.AddRange(new Control[] { new Label { Text = $"{baseEntry.Db} uchun Communicator:", AutoSize = true, Padding = new Padding(0, 6, 0, 0) }, urlBox, bindLabel, unbindBtn });
        var actions = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true, WrapContents = true, Padding = new Padding(0, 6, 0, 6) };
        actions.Controls.AddRange(new Control[] { loadBtn, ikpuBtn, checkBtn });
        var pay = new FlowLayoutPanel { Dock = DockStyle.Bottom, AutoSize = true, WrapContents = true, Padding = new Padding(0, 6, 0, 6) };
        pay.Controls.AddRange(new Control[] { new Label { Text = "To'lov:", AutoSize = true, Padding = new Padding(0, 6, 0, 0) }, payType, confirmReal, sellBtn });

        Controls.Add(grid);
        Controls.Add(summary);
        Controls.Add(pay);
        Controls.Add(logBox);
        Controls.Add(actions);
        Controls.Add(eposRow);
        Controls.Add(top);

        refreshBtn.Click += async (_, _) => await RefreshStatusAsync();
        urlBox.Leave += async (_, _) => await ChangeUrlAsync();
        urlBox.KeyDown += async (_, e) => { if (e.KeyCode == Keys.Enter) { e.SuppressKeyPress = true; await ChangeUrlAsync(); } };
        unbindBtn.Click += (_, _) =>
        {
            if (epos.Module.Length == 0) return;
            if (MessageBox.Show(this, $"{baseEntry.Db} bazasi «{epos.Module}» fiskal moduliga biriktirilgan.\nBiriktirish olib tashlansinmi? Keyingi sotuvda hozir ulangan modul biriktiriladi.",
                    AppInfo.DisplayName, MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) != DialogResult.Yes) return;
            epos.Module = "";
            ZoomStore.Settings?.Save();
            Log("Fiskal modul biriktirilishi olib tashlandi.");
            ShowBinding();
        };
        ShowBinding();
        portBox.SelectedIndexChanged += async (_, _) =>
        {
            if (settingPort) return;
            client.FiscalPort = int.Parse((string)portBox.SelectedItem!);
            await RefreshStatusAsync();
        };
        loadBtn.Click += (_, _) => LoadReceipt();
        ikpuBtn.Click += async (_, _) => await FillIkpuAndPackagesAsync();
        checkBtn.Click += async (_, _) => await CheckCodesAsync();
        sellBtn.Click += async (_, _) => await SellAsync();
        confirmReal.CheckedChanged += (_, _) => UpdateButtons();
        grid.CellEndEdit += (_, e) => OnCellEdited(e.RowIndex, e.ColumnIndex);

        UpdateButtons();
        Load += async (_, _) =>
        {
            await RefreshStatusAsync();
            if (preset is null) return;
            // 1C panelidan kelgan tayyor chek: o'zi yuklanadi, IKPU va qadoq avtomatik to'ldiriladi
            loadBtn.Visible = false;
            LoadReceipt();
            await FillIkpuAndPackagesAsync();
        };
    }

    // ---- bazaning E-POS i -----------------------------------------------------------------------

    async Task ChangeUrlAsync()
    {
        var url = urlBox.Text.Trim();
        if (url.Length == 0 || url == epos.Url) return;
        if (!url.Contains("://")) url = "http://" + url;
        if (!Uri.TryCreate(url, UriKind.Absolute, out var u)) { Log("Communicator manzili noto'g'ri: " + url); urlBox.Text = epos.Url; return; }
        if (u.AbsolutePath is "" or "/") url = $"{u.Scheme}://{u.Authority}/uzpos";
        epos.Url = url;
        urlBox.Text = url;
        ZoomStore.Settings?.Save();
        client.Dispose();
        client = new UzposClient(url) { FiscalPort = int.Parse((string)portBox.SelectedItem!) };
        Log($"{baseEntry.Db} uchun Communicator: {url}");
        await RefreshStatusAsync();
    }

    void ShowBinding()
    {
        bindLabel.Text = epos.Module.Length == 0
            ? "Fiskal modul: biriktirilmagan (birinchi sotuvda biriktiriladi)"
            : $"Biriktirilgan modul: {epos.Module}" + (connectedModule is not null && connectedModule != epos.Module ? "  ⚠ hozir boshqa modul ulangan!" : "");
        bindLabel.ForeColor = connectedModule is not null && epos.Module.Length > 0 && connectedModule != epos.Module ? Color.Firebrick : Color.DimGray;
        unbindBtn.Visible = epos.Module.Length > 0;
    }

    // ---- holat -----------------------------------------------------------------------------

    async Task RefreshStatusAsync()
    {
        status.ForeColor = Color.DarkOrange;
        status.Text = "Tekshirilmoqda…";
        if (!await client.IsAliveAsync())
        {
            status.Text = "E-POS Communicator: ISHLAMAYAPTI (dasturni oching)";
            status.ForeColor = Color.Firebrick;
            ProblemLog.Report(Feature.Epos, "warn", status.Text, baseEntry);
            return;
        }
        var version = await SafeAsync(client.GetVersionAsync, "?");
        try
        {
            await client.GetStatusAsync();
            status.Text = $"{version}: fiskal modul ishlayapti (port {client.FiscalPort})";
            status.ForeColor = Color.SeaGreen;
            await ShowModuleAsync();
        }
        catch (UzposException e)
        {
            // Tanlangan portda modul yo'q — boshqa portlarni sinab ko'ramiz (FiscalDriveAPI 3448, FiscalDriveService 3449/3450)
            if (await client.DetectPortAsync() is { } found)
            {
                settingPort = true;
                portBox.SelectedItem = found.ToString();
                settingPort = false;
                status.Text = $"{version}: fiskal modul ishlayapti (port {found} avtomatik topildi)";
                status.ForeColor = Color.SeaGreen;
                await ShowModuleAsync();
                return;
            }
            status.Text = $"{version}: fiskal modul ISHLAMAYAPTI ({e.Message.Trim()}) — ulanganini tekshiring";
            status.ForeColor = Color.Firebrick;
            ProblemLog.Report(Feature.Epos, "warn", status.Text, baseEntry);
        }
    }

    /// <summary>Holat qatoriga qaysi fiskal modul ulanganini qo'shadi (TerminalID / FactoryID).</summary>
    async Task ShowModuleAsync()
    {
        var name = await client.GetModuleNameAsync();
        connectedModule = name;
        status.Text += name is null ? " — modul raqami aniqlanmadi" : $" — ulangan modul: {name}";
        ShowBinding();
    }

    bool settingPort;

    static async Task<string> SafeAsync(Func<Task<string>> f, string fallback)
    {
        try { return await f(); } catch { return fallback; }
    }

    // ---- 1C chekini yuklash -----------------------------------------------------------------

    void LoadReceipt()
    {
        receipt = preset ?? MarkingReceipt.Load(baseEntry);
        lines.Clear();
        if (receipt is null) { Log("1C dan o'tkazilgan tovarlar topilmadi. Avval Markirovkali chek panelida chek tayyorlang."); RefreshGrid(); return; }
        if (!receipt.Finished) Log("Diqqat: chek hali to'liq tugamagan (1C dagi hujjat yarim to'ldirilgan bo'lishi mumkin).");
        if (soldLog.WhenSold(receipt.ReceiptId) is { } when)
            Log($"DIQQAT: bu chek allaqachon sotilgan: {when}. Ikki marta sotmang.");
        foreach (var l in receipt.Lines)
        {
            var line = new SaleLine { Source = l };
            map.Apply(line);
            // 1C hujjatidagi IKPU — eng to'g'risi: eslab qolingan (balki eski/noto'g'ri) qiymatdan ustun turadi
            if (l.Ikpu.Length == 17 && l.Ikpu != line.ClassCode)
            {
                if (line.ClassCode.Length > 0) Log($"{l.Name}: IKPU 1C dagi bo'yicha olindi ({l.Ikpu}, oldin {line.ClassCode} edi).");
                line.ClassCode = l.Ikpu;
                line.PackageCode = "";
            }
            if (l.CodeIkpu is { } known)
                foreach (var (code, mxik) in known) line.CodeMxik[code] = mxik;
            if (l.VatPercent is { } vat and >= 0 and <= 100) line.VatPercent = vat;
            lines.Add(line);
        }
        Log($"{lines.Count} xil tovar, {lines.Sum(l => l.Source.Quantity)} dona yuklandi.");
        RefreshGrid();
    }

    void RefreshGrid()
    {
        grid.Rows.Clear();
        foreach (var l in lines)
        {
            var problem = l.Problem();
            var i = grid.Rows.Add(l.Name, l.Source.Quantity.ToString("0.###"), l.Source.Codes.Count, null, l.ClassCode, l.PackageCode,
                l.NetPrice.ToString("N2"), l.NetSum.ToString("N2"), l.VatPercent + "%", l.VatSum.ToString("N2"), l.Total.ToString("N2"), problem ?? "tayyor");
            var marks = (DataGridViewComboBoxCell)grid.Rows[i].Cells[ColMarks];
            marks.Items.Clear();
            var shown = MarkItems(l);
            marks.Items.AddRange(shown.Cast<object>().ToArray());
            marks.Value = shown.Count > 0 ? shown[0] : null;
            grid.Rows[i].DefaultCellStyle.ForeColor = problem is null ? SystemColors.ControlText : Color.Firebrick;
        }
        var total = lines.Sum(l => l.Total);
        summary.Text = lines.Count == 0 ? ""
            : $"Summa: {lines.Sum(l => l.NetSum):N2}   QQS: {lines.Sum(l => l.VatSum):N2}   Chek jami: {total:N2} so'm (1C dagi «Всего» bilan bir xil)";
        UpdateButtons();
    }

    /// <summary>
    /// Ochiladigan ro'yxat elementlari: sotiladigan dona soniga teng kodlar (tartib raqami, to'liq kod va — ma'lum bo'lsa —
    /// MXIK; tovar IKPU sidan farq qilsa ✗ bilan). Markirovkasiz tovarda — bitta izoh.
    /// </summary>
    static List<string> MarkItems(SaleLine l)
    {
        if (!l.IsMarked) return new() { "— markirovkasiz —" };
        var count = (int)Math.Min(l.Source.Codes.Count, Math.Ceiling(l.Source.Quantity));
        var items = new List<string>();
        for (var k = 0; k < count; k++)
        {
            var code = l.Source.Codes[k];
            var mxik = l.CodeMxik.TryGetValue(code, out var m) ? m : "";
            var mark = mxik.Length == 0 ? "" : mxik == l.ClassCode || l.ClassCode.Length != 17 ? $"  (MXIK {mxik})" : $"  ✗ boshqa IKPU {mxik}";
            items.Add($"{k + 1}. {code}{mark}");
        }
        return items;
    }

    void OnCellEdited(int row, int col)
    {
        if (row < 0 || row >= lines.Count || col is not (ColIkpu or ColPack)) return;
        var line = lines[row];
        var text = Convert.ToString(grid.Rows[row].Cells[col].Value)?.Trim() ?? "";
        if (col == ColIkpu) line.ClassCode = text; else line.PackageCode = text;
        map.Save(line);
        RefreshGrid();
    }

    // ---- IKPU (soliq tarixidan) va qadoq kodlari (Communicator bazasidan) ---------------------

    async Task FillIkpuAndPackagesAsync()
    {
        SetBusy(true);
        try
        {
            foreach (var l in lines)
            {
                if (l.IsMarked)
                {
                    // Har bir kodning MXIK i my.soliq.uz dan (panel tekshirganlari qayta so'ralmaydi)
                    foreach (var code in l.Source.Codes.Where(c => !l.CodeMxik.ContainsKey(c)))
                    {
                        var found = await SoliqBridge.LookupProductAsync(getSoliqTab, code);
                        if (found.Mxik.Length == 17) l.CodeMxik[code] = found.Mxik;
                        if (found.Barcode.Length > 0) l.Barcode ??= found.Barcode;
                    }
                    if (l.ClassCode.Length != 17)
                    {
                        // 1C dagi IKPU noma'lum: kodlarning ko'pchiligi qaysi MXIK da bo'lsa — shu
                        var common = l.CodeMxik.Values.GroupBy(m => m).OrderByDescending(g => g.Count()).FirstOrDefault()?.Key;
                        if (common is not null) { l.ClassCode = common; Log($"{l.Name}: IKPU {common} (kodlar bo'yicha, soliq.uz)."); }
                        else Log($"{l.Name}: IKPU topilmadi. Qo'lda kiriting.");
                    }
                    foreach (var bad in l.WrongIkpuCodes())
                        Log($"✗ {l.Name}: kod {Mask(bad)} boshqa IKPU da ({l.CodeMxik[bad]}, tovarniki {l.ClassCode}) — sotib bo'lmaydi.");
                }
                map.Save(l);
            }
            // Qadoq kodlari — Communicator dan; u ishlamasa ham yuqoridagi IKPU lar saqlanib qoladi
            foreach (var l in lines)
            {
                if (l.ClassCode.Length == 17 && l.PackageCode.Length == 0)
                {
                    var packages = await client.GetPackagesAsync(l.ClassCode);
                    if (packages.Count > 0)
                    {
                        // Chekda o'lchov birligi «dona» bo'ladi (soliq.uz dagi fiskal chekdagi kabi): «dona/шт» qadog'i afzal
                        var pick = SaleBuilder.PreferPiece(packages, weight: l.Source.Quantity != decimal.Truncate(l.Source.Quantity));
                        l.PackageCode = pick.Code;
                        Log($"{l.Name}: qadoq {pick.Code} ({pick.Name}){(packages.Count > 1 ? $", yana {packages.Count - 1} ta variant bor, kerak bo'lsa qo'lda o'zgartiring" : "")}.");
                    }
                    else Log($"{l.Name}: qadoq topilmadi (IKPU Communicator bazasida yo'q).");
                }
                map.Save(l);
            }
        }
        catch (Exception e) when (e is UzposException or IOException) { Problem("Xato: " + e.Message); }
        finally { SetBusy(false); RefreshGrid(); }
    }

    // ---- kodlarni tekshirish (sotishsiz) ----------------------------------------------------

    async Task CheckCodesAsync()
    {
        SetBusy(true);
        try
        {
            var bad = 0;
            foreach (var l in lines.Where(l => l.IsMarked && l.ClassCode.Length == 17))
                foreach (var code in l.Source.Codes)
                {
                    var r = await client.ValidateMarkingAsync(code, l.ClassCode);
                    if (!r.IsValid) { bad++; Log($"✗ {l.Name}: kod yaroqsiz ({Mask(code)})."); }
                    else if (r.AlreadySold) { bad++; Log($"✗ {l.Name}: kod allaqachon sotilgan ({Mask(code)})."); }
                }
            Log(bad == 0 ? "✓ Barcha kodlar yaroqli va sotilmagan." : $"{bad} ta kod muammoli.");
        }
        catch (Exception e) when (e is UzposException or IOException) { Problem("Xato: " + e.Message); }
        finally { SetBusy(false); }
    }

    // ---- sotish -------------------------------------------------------------------------------

    async Task SellAsync()
    {
        if (receipt is null) return;
        if (soldLog.WhenSold(receipt.ReceiptId) is { } when)
        {
            Log($"Bu chek allaqachon sotilgan ({when}). Sotilmadi.");
            return;
        }

        List<SaleItem> items;
        try { items = SaleBuilder.Build(lines); }
        catch (ArgumentException e) { Log("Chek tayyor emas: " + e.Message); return; }

        // Bu bazaning cheki faqat shu bazaga biriktirilgan fiskal modulga ketadi (boshqa baza moduli emas)
        var module = await client.GetModuleNameAsync();
        connectedModule = module;
        ShowBinding();
        if (module is null) { Problem("Ulangan fiskal modul aniqlanmadi — chek yuborilmadi («Holatni yangilash» ni bosing)."); return; }
        if (epos.Module.Length > 0 && module != epos.Module)
        {
            Problem($"{baseEntry.Db} bazasi «{epos.Module}» fiskal moduliga biriktirilgan, hozir esa «{module}» ulangan — chek yuborilmadi. " +
                    "Shu bazaning E-POS iga ulaning (yoki modul haqiqatan almashgan bo'lsa «Modulni almashtirish»).");
            return;
        }

        // Sotishdan oldin har bir kod Communicator orqali tekshiriladi: yaroqsiz yoki sotilgan kod bo'lsa chek yuborilmaydi
        SetBusy(true);
        var rejected = new List<(SaleLine Line, string Code, string Reason)>();
        try
        {
            foreach (var l in lines.Where(l => l.IsMarked))
                foreach (var code in l.Source.Codes.Take((int)Math.Ceiling(l.Source.Quantity)))
                {
                    var r = await client.ValidateMarkingAsync(code, l.ClassCode);
                    if (!r.IsValid) rejected.Add((l, code, "kod yaroqsiz yoki IKPU ga mos emas (E-POS)"));
                    else if (r.AlreadySold) rejected.Add((l, code, "allaqachon sotilgan (E-POS)"));
                }
        }
        catch (Exception e) when (e is UzposException or IOException or HttpRequestException)
        {
            Problem("Kodlarni tekshirib bo'lmadi: " + e.Message + ". Sotilmadi.");
            SetBusy(false);
            return;
        }
        SetBusy(false);
        if (rejected.Count > 0)
        {
            foreach (var (l, code, reason) in rejected) Log($"✗ {l.Name}: {Mask(code)} — {reason}.");
            UnsellableStore.AddCodes(baseEntry, ZoomStore.Settings?.GetMarked(baseEntry.ProfileKey).Warehouse ?? "", rejected.Select(x => (x.Line.Name, x.Code, x.Reason)));
            Problem($"{rejected.Count} ta kod sotilmaydi — chek yuborilmadi. Bu tovarlarni 1C hujjatidan olib tashlab, chekni qayta yig'ing.");
            return;
        }
        var total = SaleBuilder.Total(items);
        var cash = payType.SelectedIndex == 0 ? total : 0;
        var card = payType.SelectedIndex == 1 ? total : 0;

        var text = "Bu HAQIQIY fiskal chek yaratadi va OFD ga yuboriladi.\n\n"
            + $"Tovarlar: {lines.Count} xil, {lines.Sum(l => l.Source.Quantity)} dona ({items.Count} qator)\n"
            + $"Jami: {total / 100m:N2} so'm\nTo'lov: {payType.SelectedItem}\n\nDavom etamizmi?";
        if (MessageBox.Show(this, text, "Chekni sotish", MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) != DialogResult.Yes)
            return;

        SetBusy(true);
        try
        {
            // Ikki marta bosishdan saqlanish: yuborishdan OLDIN belgilanadi
            soldLog.Mark(receipt.ReceiptId, "yuborildi");
            var result = await client.SaleAsync(items, cash, card, "1C-" + receipt.ReceiptId, confirmRealFiscalReceipt: true);
            soldLog.Mark(receipt.ReceiptId, $"chek №{result.ReceiptSeq}, FP {result.FiscalSign}");
            if (epos.Module.Length == 0)
            {
                // Birinchi sotuv: shu baza shu fiskal modulga biriktiriladi
                epos.Module = module;
                ZoomStore.Settings?.Save();
                Log($"{baseEntry.Db} bazasi «{module}» fiskal moduliga biriktirildi — keyingi cheklar faqat shu modulga yuboriladi.");
                ShowBinding();
            }
            Result = result;
            Log($"✓ Chek yaratildi: №{result.ReceiptSeq}, fiskal belgi {result.FiscalSign}, {result.DateTime}");
            if (result.QrCodeUrl.Length > 0) Log("  QR: " + result.QrCodeUrl);
            File.AppendAllText(Path.Combine(Paths.AppData, "uzpos-sales.log"),
                $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} baza={baseEntry.Db} 1C-chek={receipt.ReceiptId} chek={result.ReceiptSeq} fp={result.FiscalSign} jami={total}{Environment.NewLine}");
            confirmReal.Checked = false;
        }
        catch (Exception e) when (e is UzposException or IOException)
        {
            Problem("✗ Chek yaratilmadi: " + e.Message);
            Log("  Agar xato 'javob bermadi' bo'lsa, chek yaratilgan bo'lishi mumkin: Communicator dagi so'nggi chekni tekshiring.");
        }
        finally { SetBusy(false); }
    }

    // ---- yordamchilar -----------------------------------------------------------------------------

    static string Mask(string code) => code.Length <= 10 ? code : code[..6] + "…" + code[^4..];

    void SetBusy(bool busy)
    {
        UseWaitCursor = busy;
        foreach (var b in new[] { loadBtn, ikpuBtn, checkBtn, sellBtn, refreshBtn }) b.Enabled = !busy;
        if (!busy) UpdateButtons();
    }

    void UpdateButtons()
    {
        var any = lines.Count > 0;
        ikpuBtn.Enabled = any;
        checkBtn.Enabled = any;
        sellBtn.Enabled = any && lines.All(l => l.Problem() is null) && confirmReal.Checked;
    }

    void Log(string text) => logBox.AppendText($"[{DateTime.Now:HH:mm:ss}] {text}{Environment.NewLine}");

    /// <summary>Xato: oynaga va muammolar jurnaliga.</summary>
    void Problem(string text)
    {
        Log(text);
        ProblemLog.Report(Feature.Epos, "err", text, baseEntry);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) client.Dispose();
        base.Dispose(disposing);
    }
}

/// <summary>1C paneldagi "E-POS orqali sotish" tugmasi ochadigan oyna: tovarlar, IKPU, to'lov, tasdiq va sotish.</summary>
public sealed class SaleDialog : Form
{
    readonly CommunicatorTab tab;

    public SaleResult? Result => tab.Result;

    public SaleDialog(BaseEntry baseEntry, Func<Task<WebTab>> getSoliqTab, MarkingReceipt receipt)
    {
        Text = "E-POS orqali sotish — " + baseEntry.Firm;
        // 1C dagi kabi narx ustunlari ko'p: kengroq ochiladi (ekrandan katta bo'lmasin)
        var screen = Screen.FromPoint(Cursor.Position).WorkingArea;
        Size = new Size(Math.Min(1500, screen.Width - 40), Math.Min(800, screen.Height - 40));
        MinimumSize = new Size(900, 560);
        StartPosition = FormStartPosition.CenterParent;
        tab = new CommunicatorTab(baseEntry, getSoliqTab, receipt) { Dock = DockStyle.Fill };
        Controls.Add(tab);
    }
}
