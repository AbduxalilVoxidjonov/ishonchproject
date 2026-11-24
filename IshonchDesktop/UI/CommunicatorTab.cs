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
        pay.Controls.AddRange(new Control[] { confirmReal, sellBtn });

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

    /// <summary>
    /// Jadvalni qayta chizadi. Jadvalning o'z hodisasi (CellEndEdit, ochiq ro'yxat va h.k.) ichida qatorlarni o'chirib bo'lmaydi —
    /// «reentrant call to SetCurrentCellAddressCore» xatosi chiqadi. Shuning uchun tahrir tugatiladi, kerak bo'lsa keyingi
    /// xabarlar sikliga qoldiriladi.
    /// </summary>
    int refreshRetries;

    void RefreshGrid()
    {
        if (IsDisposed) return;
        try
        {
            if (grid.IsCurrentCellInEditMode) grid.EndEdit();
            grid.CurrentCell = null;
            grid.Rows.Clear();
        }
        catch (InvalidOperationException e)
        {
            // Jadval hali o'z hodisasini tugatmagan: biroz keyin qayta chiziladi (ko'pi bilan 5 marta)
            if (IsHandleCreated && ++refreshRetries <= 5) BeginInvoke(RefreshGrid);
            else { refreshRetries = 0; IshonchDesktop.Models.Log.Error("E-POS jadvalini yangilash", e); }
            return;
        }
        refreshRetries = 0;
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
        // CellEndEdit ichida qatorlarni o'chirib bo'lmaydi — hodisa tugagach qayta chiziladi
        BeginInvoke(RefreshGrid);
    }

    // ---- IKPU (soliq tarixidan) va qadoq kodlari (Communicator bazasidan) ---------------------

    async Task FillIkpuAndPackagesAsync()
    {
        SetBusy(true);
        try
        {
            // Markirovka kodlarining IKPU si my.soliq.uz dan olinadi — har firmaning o'z soliq tabi bor va unga ERI kalit bilan
            // kirilgan bo'lishi kerak. Kirilmagan bo'lsa har kod alohida «topilmadi» bo'lib, sabab ko'rinmay qolardi.
            // (30 ta kod bo'lsa oyna bir necha daqiqa «aylanib» turardi.) Endi oldindan tekshiriladi va kirilmagan bo'lsa soliq.uz
            // so'rovlari tashlab ketiladi; qadoq kodlari baribir Communicator dan olinadi.
            // my.soliq.uz faqat IKPU uchun kerak: 1C hujjatida IKPU bor bo'lsa sotish usiz ham mumkin (kodlarning IKPU si
            // qo'shimcha tekshiruv, xolos); IKPU yo'q tovar bo'lsagina kirish shart.
            var soliqReady = true;
            if (lines.Any(l => l.IsMarked && l.Source.Codes.Any(c => !l.CodeMxik.ContainsKey(c))))
            {
                Log("my.soliq.uz ga kirilganligi tekshirilmoqda…");
                soliqReady = await SoliqBridge.IsLoggedInAsync(getSoliqTab);
                if (!soliqReady && lines.Any(l => l.IsMarked && l.ClassCode.Length != 17))
                    Problem(SoliqBridge.NotLoggedInMessage + ". Shu firmaning my.soliq.uz tabi asosiy oynada ochildi — kirgach «" + ikpuBtn.Text + "» tugmasini qayta bosing (IKPU si yo'q tovarlar uchun kerak).");
                else if (!soliqReady)
                    Log("my.soliq.uz ga kirilmagan — kodlarning IKPU tekshiruvi o'tkazib yuborildi (IKPU 1C hujjatidan olingan, sotish mumkin). Tekshirish kerak bo'lsa: asosiy oynadagi my.soliq.uz tabiga kiring va «" + ikpuBtn.Text + "» ni qayta bosing.");
            }
            foreach (var l in lines)
            {
                if (l.IsMarked)
                {
                    // Har bir kodning MXIK i my.soliq.uz dan (panel tekshirganlari qayta so'ralmaydi)
                    foreach (var code in soliqReady ? l.Source.Codes.Where(c => !l.CodeMxik.ContainsKey(c)).ToList() : new List<string>())
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
        // Oyna ish tugamasdan yopilgan (masalan soliq tabi uzoq ochilganda): xato emas, shunchaki to'xtaydi
        catch (ObjectDisposedException) when (IsDisposed || Disposing) { return; }
        catch (Exception e) when (e is UzposException or IOException or HttpRequestException or TaskCanceledException) { Problem("Xato: " + e.Message); }
        finally { if (!IsDisposed && !Disposing) { SetBusy(false); RefreshGrid(); } }
    }

    // ---- kodlarni tekshirish (sotishsiz) ----------------------------------------------------

    async Task CheckCodesAsync()
    {
        SetBusy(true);
        try
        {
            var bad = 0;
            var checkedCount = 0;
            var soliqReady = await SoliqBridge.IsLoggedInAsync(getSoliqTab);
            Log(soliqReady
                ? "Kodlar my.soliq.uz da tekshirilmoqda (u aniqlay olmaganlari — fiskal modulda)…"
                : "my.soliq.uz ga kirilmagan — kodlar fiskal modul orqali tekshirilmoqda (my.soliq.uz da tekshirish uchun asosiy oynadagi soliq tabiga kiring)…");
            var via = new Dictionary<string, int>();
            foreach (var l in lines.Where(l => l.IsMarked && (soliqReady || l.ClassCode.Length == 17)))
                foreach (var code in l.Source.Codes)
                {
                    var r = await CheckCodeAsync(l, code, soliqReady);
                    checkedCount++;
                    via[r.Via] = via.GetValueOrDefault(r.Via) + 1;
                    if (!r.Ok) { bad++; Log($"✗ {l.Name}: {Mask(code)} — {r.Reason}."); }
                }
            var how = string.Join(", ", via.Select(p => $"{p.Key}: {p.Value}"));
            Log(bad == 0 ? $"✓ Barcha {checkedCount} ta kod yaroqli va sotilmagan ({how})." : $"{bad} / {checkedCount} ta kod muammoli ({how}).");
        }
        catch (Exception e) when (e is UzposException or IOException or HttpRequestException or TaskCanceledException)
        {
            Problem("Kodlarni tekshirib bo'lmadi: " + e.Message + " — my.soliq.uz da tekshirish uchun asosiy oynadagi soliq tabiga ERI kalit bilan kiring va qayta bosing.");
        }
        finally { SetBusy(false); }
    }

    /// <summary>
    /// Bitta markirovka kodini tekshiradi. my.soliq.uz ga kirilgan bo'lsa — avval o'sha yerda (kodning egasi va holati: boshqa
    /// STIR da yoki sotilgan bo'lsa — yaroqsiz); u aniq javob bermasa yoki kirilmagan bo'lsa — fiskal modul (Communicator) orqali.
    /// Shunda fiskal modul ishlamay turganda ham kodlarni tekshirish mumkin.
    /// </summary>
    async Task<(bool Ok, string Reason, string Via)> CheckCodeAsync(SaleLine l, string code, bool soliqReady)
    {
        if (soliqReady)
        {
            var raw = System.Text.Json.JsonSerializer.SerializeToElement(await SoliqBridge.CheckAsync(getSoliqTab, code, baseEntry.Inn));
            var verdict = raw.TryGetProperty("verdict", out var v) ? v.GetString() : "unknown";
            if (verdict == "available") return (true, "", "my.soliq.uz");
            if (verdict == "sold")
            {
                var why = raw.TryGetProperty("operation", out var op) && op.GetString() is { Length: > 0 } o ? $" ({o})" : "";
                return (false, "sotilgan yoki boshqa STIR da" + why + " — my.soliq.uz", "my.soliq.uz");
            }
            // «unknown» (topilmadi, tarix tushunarsiz): fiskal moduldan so'raladi
        }
        if (l.ClassCode.Length != 17) return (false, "tekshirib bo'lmadi: tovarning IKPU si yo'q", "tekshirilmadi");
        var r = await client.ValidateMarkingAsync(code, l.ClassCode);
        if (!r.IsValid) return (false, "kod yaroqsiz yoki IKPU ga mos emas (E-POS)", "fiskal modul");
        if (r.AlreadySold) return (false, "allaqachon sotilgan (E-POS)", "fiskal modul");
        return (true, "", "fiskal modul");
    }

    // ---- sotish -------------------------------------------------------------------------------

    async Task SellAsync()
    {
        if (receipt is null) return;
        if (soldLog.WhenSold(receipt.ReceiptId) is { } when)
        {
            if (!soldLog.IsPending(receipt.ReceiptId))
            {
                Log($"Bu chek allaqachon sotilgan ({when}). Sotilmadi.");
                return;
            }
            // Avval yuborilgan, lekin javob kelmagan: sotilgani noma'lum. Ilgari bu ham «sotilgan» deb ko'rsatilardi.
            var ask = $"Bu chek avval yuborilgan ({when}), lekin fiskal moduldan javob kelmagan — sotilgani NOMA'LUM." + Environment.NewLine + Environment.NewLine +
                      "Avval Communicator dagi so'nggi cheklarni tekshiring: chek u yerda bo'lsa — «No» ni bosing (ikki marta sotilmasin)." + Environment.NewLine + Environment.NewLine +
                      "Chek u yerda yo'q bo'lsa, qayta yuborilsinmi?";
            if (MessageBox.Show(this, ask, "Chek natijasi noaniq", MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) != DialogResult.Yes)
            {
                Log($"Chek avval yuborilgan ({when}), natijasi noaniq — qayta yuborilmadi.");
                return;
            }
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

        // Sotishdan oldin har bir kod tekshiriladi (my.soliq.uz, u bilmasa — fiskal modul): yaroqsiz yoki sotilgan kod bo'lsa
        // chek yuborilmaydi
        SetBusy(true);
        var rejected = new List<(SaleLine Line, string Code, string Reason, bool Confirmed)>();
        try
        {
            var soliqReady = lines.Any(l => l.IsMarked) && await SoliqBridge.IsLoggedInAsync(getSoliqTab);
            foreach (var l in lines.Where(l => l.IsMarked))
                foreach (var code in l.Source.Codes.Take((int)Math.Ceiling(l.Source.Quantity)))
                {
                    var r = await CheckCodeAsync(l, code, soliqReady);
                    // «Sotilgan» deb faqat my.soliq.uz tasdiqlagan kod hisoblanadi; fiskal modulning o'zi rad etgani — hali hukm emas
                    if (!r.Ok) rejected.Add((l, code, r.Reason, r.Via == "my.soliq.uz"));
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
            foreach (var (l, code, reason, _) in rejected) Log($"✗ {l.Name}: {Mask(code)} — {reason}.");
            // «Sotib bo'lmaydigan markirovkalar» ro'yxatiga faqat my.soliq.uz tasdiqlagan kodlar yoziladi. Fiskal modul rad etgan,
            // lekin my.soliq.uz da tekshirilmagan kod sotilgan degani emas (modul xato bergan bo'lishi mumkin) — ro'yxatga kirmaydi.
            var confirmed = rejected.Where(x => x.Confirmed).ToList();
            if (confirmed.Count > 0)
                UnsellableStore.AddCodes(baseEntry, ZoomStore.Settings?.GetMarked(baseEntry.ProfileKey).Warehouse ?? "", confirmed.Select(x => (x.Line.Name, x.Code, x.Reason)));
            var unsure = rejected.Count - confirmed.Count;
            Problem(unsure == 0
                ? $"{rejected.Count} ta kod sotilmaydi (my.soliq.uz tasdiqladi) — chek yuborilmadi. Bu tovarlarni 1C hujjatidan olib tashlab, chekni qayta yig'ing."
                : $"{rejected.Count} ta kod o'tmadi — chek yuborilmadi. Ulardan {unsure} tasini faqat fiskal modul rad etdi, my.soliq.uz da tekshirilmagan: bular «sotilgan» deb belgilanmadi. Asosiy oynadagi my.soliq.uz tabiga kirib «{checkBtn.Text}» ni bosing — haqiqiy holati o'sha yerda ko'rinadi.");
            return;
        }
        var total = SaleBuilder.Total(items);
        var cash = 0L; // faqat karta
        var card = total;

        var text = "Bu HAQIQIY fiskal chek yaratadi va OFD ga yuboriladi.\n\n"
            + $"Tovarlar: {lines.Count} xil, {lines.Sum(l => l.Source.Quantity)} dona ({items.Count} qator)\n"
            + $"Jami: {total / 100m:N2} so'm\nTo'lov: Karta\n\nDavom etamizmi?";
        if (MessageBox.Show(this, text, "Chekni sotish", MessageBoxButtons.YesNo, MessageBoxIcon.Warning, MessageBoxDefaultButton.Button2) != DialogResult.Yes)
            return;

        SetBusy(true);
        try
        {
            // Ikki marta bosishdan saqlanish: yuborishdan OLDIN belgilanadi
            // (javob kelmasa shu belgi qoladi — «natija noaniq»; fiskal modul rad etsa — olib tashlanadi)
            soldLog.Mark(receipt.ReceiptId, SoldLog.Pending);
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
        catch (UzposException e) when (e.Definite)
        {
            // Fiskal modul chekni rad etdi: chek yaratilmagan — «sotilgan» belgisi olib tashlanadi, tuzatib qayta yuborish mumkin
            soldLog.Unmark(receipt.ReceiptId);
            Problem("✗ Chek SOTILMADI — fiskal modul rad etdi: " + e.Message);
            Log("  Chek yaratilmagan. Xatoni tuzatib «Sotish» ni qayta bosish mumkin.");
        }
        catch (Exception e) when (e is UzposException or IOException)
        {
            Problem("✗ Chek natijasi NOANIQ: " + e.Message);
            Log("  Fiskal moduldan javob kelmadi — chek yaratilgan bo'lishi ham, yaratilmagan bo'lishi ham mumkin. Communicator dagi so'nggi chekni tekshiring; yo'q bo'lsa «Sotish» ni qayta bosing (dastur so'raydi).");
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
        StartPosition = FormStartPosition.CenterScreen;
        ShowInTaskbar = true;
        tab = new CommunicatorTab(baseEntry, getSoliqTab, receipt) { Dock = DockStyle.Fill };
        Controls.Add(tab);
    }

    /// <summary>
    /// Oynani alohida (modal bo'lmagan) oyna qilib ochadi va yopilganda sotuv natijasini qaytaradi. Ilgari oyna modal edi:
    /// u ochiq turganda asosiy oynadagi my.soliq.uz tabiga o'tib ERI kalit bilan kirib bo'lmasdi — endi asosiy oyna ishlayveradi.
    /// </summary>
    public Task<SaleResult?> ShowAsync()
    {
        var done = new TaskCompletionSource<SaleResult?>();
        FormClosed += (_, _) => done.TrySetResult(Result);
        Show();
        Activate();
        return done.Task;
    }
}
