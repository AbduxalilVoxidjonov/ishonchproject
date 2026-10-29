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
    readonly UzposClient client = new();
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

    const int ColName = 0, ColQty = 1, ColCodes = 2, ColIkpu = 3, ColPack = 4, ColPrice = 5, ColState = 6;

    public CommunicatorTab(BaseEntry baseEntry, Func<Task<WebTab>> getSoliqTab, MarkingReceipt? preset = null)
    {
        this.preset = preset;
        this.baseEntry = baseEntry;
        this.getSoliqTab = getSoliqTab;
        map = new ProductMap(baseEntry);
        soldLog = new SoldLog(baseEntry);
        Dock = DockStyle.Fill;
        Padding = new Padding(12);
        Font = new Font("Segoe UI", 9.5f);

        portBox.Items.AddRange(new object[] { "3448", "3449", "3450" });
        portBox.SelectedIndex = 0;
        payType.Items.AddRange(new object[] { "Naqd", "Karta" });
        payType.SelectedIndex = 0;

        foreach (var (title, weight, ro) in new[] { ("1C tovari", 26, true), ("Dona", 5, true), ("Kodlar", 6, true),
                     ("IKPU (MXIK)", 16, false), ("Qadoq kodi", 10, false), ("Narx (1C)", 10, true), ("Holat", 27, true) })
            grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = title, FillWeight = weight, ReadOnly = ro });

        var top = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true, WrapContents = true };
        top.Controls.AddRange(new Control[] { status, new Label { Text = "Fiskal port:", AutoSize = true, Padding = new Padding(0, 6, 0, 0) }, portBox, refreshBtn });
        var actions = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true, WrapContents = true, Padding = new Padding(0, 6, 0, 6) };
        actions.Controls.AddRange(new Control[] { loadBtn, ikpuBtn, checkBtn });
        var pay = new FlowLayoutPanel { Dock = DockStyle.Bottom, AutoSize = true, WrapContents = true, Padding = new Padding(0, 6, 0, 6) };
        pay.Controls.AddRange(new Control[] { new Label { Text = "To'lov:", AutoSize = true, Padding = new Padding(0, 6, 0, 0) }, payType, confirmReal, sellBtn });

        Controls.Add(grid);
        Controls.Add(summary);
        Controls.Add(pay);
        Controls.Add(logBox);
        Controls.Add(actions);
        Controls.Add(top);

        refreshBtn.Click += async (_, _) => await RefreshStatusAsync();
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

    // ---- holat -----------------------------------------------------------------------------

    async Task RefreshStatusAsync()
    {
        status.ForeColor = Color.DarkOrange;
        status.Text = "Tekshirilmoqda…";
        if (!await client.IsAliveAsync())
        {
            status.Text = "E-POS Communicator: ISHLAMAYAPTI (dasturni oching)";
            status.ForeColor = Color.Firebrick;
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
        }
    }

    /// <summary>Holat qatoriga qaysi fiskal modul ulanganini qo'shadi (TerminalID / FactoryID).</summary>
    async Task ShowModuleAsync()
    {
        var name = await client.GetModuleNameAsync();
        status.Text += name is null ? " — modul raqami aniqlanmadi" : $" — ulangan modul: {name}";
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
            var i = grid.Rows.Add(l.Name, l.Source.Quantity, l.Source.Codes.Count, l.ClassCode, l.PackageCode,
                l.Source.UnitPrice.ToString("N0"), problem ?? "tayyor");
            grid.Rows[i].DefaultCellStyle.ForeColor = problem is null ? SystemColors.ControlText : Color.Firebrick;
        }
        var total = lines.Sum(l => l.Source.UnitPrice * l.Source.Quantity);
        summary.Text = lines.Count == 0 ? "" : $"Chek jami: {total:N0} so'm";
        UpdateButtons();
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
                if (l.ClassCode.Length != 17 && l.IsMarked)
                {
                    var found = await SoliqBridge.LookupProductAsync(getSoliqTab, l.Source.Codes[0]);
                    if (found.Mxik.Length == 17) { l.ClassCode = found.Mxik; if (found.Barcode.Length > 0) l.Barcode = found.Barcode; Log($"{l.Name}: IKPU {found.Mxik} (soliq: {found.Product})."); }
                    else Log($"{l.Name}: IKPU topilmadi ({found.Reason}). Qo'lda kiriting.");
                }
                if (l.ClassCode.Length == 17 && l.PackageCode.Length == 0)
                {
                    var packages = await client.GetPackagesAsync(l.ClassCode);
                    if (packages.Count > 0)
                    {
                        l.PackageCode = packages[0].Code;
                        Log($"{l.Name}: qadoq {packages[0].Code} ({packages[0].Name}){(packages.Count > 1 ? $", yana {packages.Count - 1} ta variant bor, kerak bo'lsa qo'lda o'zgartiring" : "")}.");
                    }
                    else Log($"{l.Name}: qadoq topilmadi (IKPU Communicator bazasida yo'q).");
                }
                map.Save(l);
            }
        }
        catch (Exception e) when (e is UzposException or IOException) { Log("Xato: " + e.Message); }
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
        catch (Exception e) when (e is UzposException or IOException) { Log("Xato: " + e.Message); }
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
            Result = result;
            Log($"✓ Chek yaratildi: №{result.ReceiptSeq}, fiskal belgi {result.FiscalSign}, {result.DateTime}");
            if (result.QrCodeUrl.Length > 0) Log("  QR: " + result.QrCodeUrl);
            File.AppendAllText(Path.Combine(Paths.AppData, "uzpos-sales.log"),
                $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} baza={baseEntry.Db} 1C-chek={receipt.ReceiptId} chek={result.ReceiptSeq} fp={result.FiscalSign} jami={total}{Environment.NewLine}");
            confirmReal.Checked = false;
        }
        catch (Exception e) when (e is UzposException or IOException)
        {
            Log("✗ Chek yaratilmadi: " + e.Message);
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
        Size = new Size(1100, 760);
        MinimumSize = new Size(820, 560);
        StartPosition = FormStartPosition.CenterParent;
        tab = new CommunicatorTab(baseEntry, getSoliqTab, receipt) { Dock = DockStyle.Fill };
        Controls.Add(tab);
    }
}
