using System.Text.Json;
using System.Text.Json.Nodes;
using IshonchDesktop.Models;
using IshonchDesktop.UI;
using Microsoft.Web.WebView2.Core;

namespace IshonchDesktop.Crm;

/// <summary>Bitta o'zgarish: ariza, eski va yangi holat.</summary>
public sealed record CrmChange(string Id, string PartnerId, string Partner, string Firm, string OldStatus, string NewStatus, string When, bool IsNew, string NewKey = "", string Uid = "");

/// <summary>Kuzatuvdagi ariza holati (oldingi tekshiruvdan).</summary>
/// <param name="Uid">Jadvaldagi «Юник ID» (masalan c_2325) — qatorni aniq topish uchun.</param>
public sealed record CrmItemState(string Id, string PartnerId, string Partner, string Firm, string StatusKey, string StatusName, string Entered, string Uid = "");

/// <summary>
/// «Масъул бўлим: Бухгалтерия» dagi to'lov arizalarini kuzatadi: har daqiqada CRM API dan (sahifaning o'z sessiyasi bilan,
/// faqat o'qish) ro'yxat olinadi, oldingisi bilan solishtiriladi. Yangi kelgan yoki holati o'zgargan bo'lsa — Windows
/// bildirishnomasi (tray), tab nomida son va CRM sahifasi tepasida ro'yxat. Ishonch boshqa tabda yoki yig'ilgan (minimize)
/// holatda ham ishlaydi. Birinchi tekshiruv faqat boshlang'ich holatni eslab qoladi (eski arizalar uchun xabar chiqmaydi).
/// </summary>
public sealed class CrmWatcher : IDisposable
{
    public static TimeSpan Interval { get; set; } = TimeSpan.FromSeconds(60);
    static string StateFile => Path.Combine(Paths.AppData, "crm-kuzatuv.json");
    /// <summary>Hali dolzarb xabarlar (holati o'zgarmaguncha qatorlar qizil ramkada turadi) — qayta ochilganda ham saqlanadi.</summary>
    static string ChangesFile => Path.Combine(Paths.AppData, "crm-xabarlar.json");

    readonly WebTab tab;
    readonly System.Windows.Forms.Timer timer = new();
    readonly NotifyIcon tray = new() { Text = "Ishonch — Main Ishonch kuzatuvi" };
    readonly List<CrmChange> unseen = new();
    Dictionary<string, CrmItemState>? state;
    bool running;

    /// <summary>Ko'rilmagan o'zgarishlar soni o'zgarganda (tab nomidagi son uchun).</summary>
    public event Action<int>? UnseenChanged;

    /// <summary>Hozirgi kuzatuvchi (Main Ishonch tabi ochiq bo'lsa) — oyna ✕ bilan yopilganda tray'da qolish uchun.</summary>
    public static CrmWatcher? Current { get; private set; }

    public CrmWatcher(WebTab tab)
    {
        this.tab = tab;
        Current = this;
        var menu = new ContextMenuStrip();
        menu.Items.Add("Ishonch'ni ochish", null, (_, _) => Focus());
        menu.Items.Add("Hozir tekshirish", null, async (_, _) => await CheckAsync());
        menu.Items.Add("Didox parolini o'zgartirish", null, async (_, _) =>
        {
            if (await DidoxPasswordForm.AskAsync(tab.FindForm(), "") is { } p) DidoxContracts.SaveOwnPassword(p);
        });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Chiqish", null, (_, _) => Exit());
        tray.ContextMenuStrip = menu;
        tray.Icon = AppIcon.ForWindow() ?? SystemIcons.Information;
        tray.Visible = true;
        tray.BalloonTipClicked += (_, _) => Focus();
        tray.DoubleClick += (_, _) => Focus();
        state = Load();
        unseen.AddRange(LoadChanges());
        timer.Interval = (int)Interval.TotalMilliseconds;
        timer.Tick += async (_, _) => await CheckAsync();
        timer.Start();
        _ = DelayedFirstAsync();
    }

    async Task DelayedFirstAsync()
    {
        await Task.Delay(15000); // sahifa va kirish tayyor bo'lsin
        await CheckAsync();
    }

    public IReadOnlyList<CrmChange> Unseen => unseen;

    /// <summary>Saqlangan xabarlar sonini tab nomiga va sahifaga qayta yuboradi (ishga tushganda).</summary>
    public void Refresh()
    {
        UnseenChanged?.Invoke(unseen.Count);
        Post();
    }

    /// <summary>Foydalanuvchi ko'rdi: ro'yxat tozalanadi.</summary>
    public void MarkSeen()
    {
        unseen.Clear();
        SaveChanges();
        UnseenChanged?.Invoke(0);
        Post();
    }

    /// <summary>Oyna tray'ga yashirilganda bir marta eslatma.</summary>
    public void ShowHiddenTip() =>
        tray.ShowBalloonTip(6000, "Ishonch fonda ishlayapti",
            "Main Ishonch (Бухгалтерия) kuzatuvi davom etadi — o'zgarish bo'lsa xabar beriladi. Butunlay chiqish: shu belgidagi menyu → «Chiqish».",
            ToolTipIcon.Info);

    void Exit()
    {
        if (tab.FindForm() is MainForm f) { f.ExitRequested = true; f.Close(); }
        else Application.Exit();
    }

    void Focus()
    {
        var form = tab.FindForm();
        if (form is null) return;
        if (form.WindowState == FormWindowState.Minimized) form.WindowState = FormWindowState.Normal;
        form.Show();
        form.Activate();
        if (tab.Parent is TabPage page && page.Parent is TabControl tc) tc.SelectedTab = page;
    }

    // ---- tekshirish ---------------------------------------------------------------------------

    /// <summary>
    /// Sahifa ichida bajariladi (sahifaning o'z kirish tokeni bilan; token C# ga chiqmaydi): Бухгалтерия arizalari, sahifalab.
    /// </summary>
    const string FetchJs = """
        (async () => {
          let t = localStorage.getItem('jwtAccessToken') || '';
          try { const j = JSON.parse(t); if (typeof j === 'string') t = j; } catch {}
          if (!t) return JSON.stringify({ error: 'login' });
          const out = [];
          for (let page = 0; page < 20; page++) {
            const r = await fetch('/payment-platform/api/v1/contract/payment-applications?page=' + page + '&size=100&responsibleDepartment=ACCOUNTING',
              { headers: { Authorization: 'Bearer ' + t } });
            if (r.status === 401 || r.status === 403) return JSON.stringify({ error: 'login' });
            if (!r.ok) return JSON.stringify({ error: 'HTTP ' + r.status });
            const j = await r.json();
            for (const x of j.items || []) out.push({
              id: x.id, pid: String((x.partner || {}).id || ''), partner: (x.partner || {}).title || '',
              firm: (x.trustFirm || {}).title || '', key: (x.status || {}).key || '', name: (x.status || {}).name || '',
              entered: x.statusEnteredAt || x.updatedAt || '',
              uid: (String(x.requestUniqueId || '').match(/(\d+)$/) ? 'c_' + String(x.requestUniqueId).match(/(\d+)$/)[1] : '') });
            if (page + 1 >= (j.totalPages || 1)) break;
          }
          return JSON.stringify({ items: out });
        })()
        """;

    public async Task CheckAsync()
    {
        if (running || tab.Core is not { } core) return;
        if (!(core.Source ?? "").Contains("main.ishonchsale.uz")) return;
        running = true;
        try
        {
            // ExecuteScriptAsync Promise ni kutmaydi — DevTools Runtime.evaluate (awaitPromise) ishlatiladi
            var args = JsonSerializer.Serialize(new { expression = FetchJs, awaitPromise = true, returnByValue = true });
            var raw = await core.CallDevToolsProtocolMethodAsync("Runtime.evaluate", args);
            var json = JsonNode.Parse(raw)?["result"]?["value"]?.ToString();
            if (string.IsNullOrEmpty(json)) { Log.Write("CRM kuzatuv: javob bo'sh"); return; }
            var root = JsonNode.Parse(json);
            if (root?["error"] is { } err) { Log.Write("CRM kuzatuv: " + err); return; }
            var items = (root?["items"] as JsonArray ?? new()).Select(x => new CrmItemState(
                S(x?["id"]), S(x?["pid"]), S(x?["partner"]), S(x?["firm"]), S(x?["key"]), S(x?["name"]), S(x?["entered"]), S(x?["uid"]))).ToList();
            var changes = Diff(state, items);
            state = items.GroupBy(i => i.Id).ToDictionary(g => g.Key, g => g.First());
            // Ro'yxatdagi ariza holati yana o'zgargan yoki Бухгалтерия'dan chiqib ketgan bo'lsa — o'zi olib tashlanadi
            var before = unseen.Count;
            unseen.RemoveAll(u => !Still(u, state));
            if (unseen.Count != before && changes.Count == 0) { UnseenChanged?.Invoke(unseen.Count); Post(); SaveChanges(); }
            Save(state);
            if (changes.Count > 0) Notify(changes);
        }
        catch (Exception e) { Log.Error("CRM kuzatuv", e); }
        finally { running = false; }
    }

    static string S(JsonNode? n) => n?.ToString() ?? "";

    /// <summary>Xabar hali dolzarbmi: ariza Бухгалтерия ro'yxatida va o'sha (xabar qilingan) holatda turibdi.</summary>
    public static bool Still(CrmChange c, IReadOnlyDictionary<string, CrmItemState> now) =>
        now.TryGetValue(c.Id, out var i) && i.StatusKey == c.NewKey;

    /// <summary>Oldingi holat bilan solishtirish: yangi kelganlar va holati o'zgarganlar. Oldingi holat yo'q bo'lsa — hech narsa.</summary>
    public static List<CrmChange> Diff(Dictionary<string, CrmItemState>? before, IEnumerable<CrmItemState> now)
    {
        var res = new List<CrmChange>();
        if (before is null) return res;
        foreach (var i in now)
        {
            if (!before.TryGetValue(i.Id, out var b))
                res.Add(new CrmChange(i.Id, i.PartnerId, i.Partner, i.Firm, "", i.StatusName, i.Entered, true, i.StatusKey, i.Uid));
            else if (b.StatusKey != i.StatusKey)
                res.Add(new CrmChange(i.Id, i.PartnerId, i.Partner, i.Firm, b.StatusName, i.StatusName, i.Entered, false, i.StatusKey, i.Uid));
        }
        return res;
    }

    void Notify(List<CrmChange> changes)
    {
        unseen.RemoveAll(u => changes.Any(c => c.Id == u.Id));
        unseen.InsertRange(0, changes);
        SaveChanges();
        UnseenChanged?.Invoke(unseen.Count);
        Post();
        var first = changes[0];
        // Windows bildirishnomasi 3–4 qatordan keyin kesadi: asosiy chaqiriq sarlavhada, matn qisqa
        var text = $"T.ID {first.PartnerId} — {Short(first.Partner, 38)}\n" + (first.IsNew ? "Yangi: " : "Holat: ") + Short(first.NewStatus, 55);
        if (changes.Count > 1) text += $"\n…va yana {changes.Count - 1} ta. Bosing — Main Ishonch ochiladi.";
        else text += "\nBosing — Main Ishonch ochiladi.";
        var title = changes.Count == 1 ? "🔔 Main'dan yangi xabar — shartnomani ko'ring" : $"🔔 Main'dan {changes.Count} ta yangi xabar — ko'ring";
        tray.ShowBalloonTip(15000, title, text, ToolTipIcon.Info);
        Log.Write($"CRM kuzatuv: {changes.Count} ta o'zgarish");
    }

    static string Short(string s, int n = 60) => s.Length <= n ? s : s[..n] + "…";

    /// <summary>Sahifaga ko'rilmagan o'zgarishlar ro'yxatini yuboradi (tepadagi banner va qatorlar belgisi uchun).</summary>
    public void Post()
    {
        try
        {
            tab.Core?.PostWebMessageAsJson(JsonSerializer.Serialize(new
            {
                kind = "crmChanges",
                items = unseen.Select(c => new { c.PartnerId, c.Uid, c.Partner, c.Firm, c.OldStatus, c.NewStatus, c.When, c.IsNew }),
            }, new JsonSerializerOptions(JsonSerializerDefaults.Web)));
        }
        catch { /* sahifa yopilgan */ }
    }

    static List<CrmChange> LoadChanges()
    {
        try { return File.Exists(ChangesFile) ? JsonSerializer.Deserialize<List<CrmChange>>(File.ReadAllText(ChangesFile)) ?? new() : new(); }
        catch { return new(); }
    }

    void SaveChanges()
    {
        try
        {
            var tmp = ChangesFile + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(unseen));
            File.Move(tmp, ChangesFile, overwrite: true);
        }
        catch (Exception e) { Log.Error("CRM kuzatuv (xabarlar)", e); }
    }

    static Dictionary<string, CrmItemState>? Load()
    {
        try { return File.Exists(StateFile) ? JsonSerializer.Deserialize<Dictionary<string, CrmItemState>>(File.ReadAllText(StateFile)) : null; }
        catch { return null; }
    }

    static void Save(Dictionary<string, CrmItemState> s)
    {
        try
        {
            var tmp = StateFile + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(s));
            File.Move(tmp, StateFile, overwrite: true);
        }
        catch (Exception e) { Log.Error("CRM kuzatuv (saqlash)", e); }
    }

    public void Dispose()
    {
        if (Current == this) Current = null;
        timer.Dispose();
        tray.Visible = false;
        tray.Dispose();
    }
}
