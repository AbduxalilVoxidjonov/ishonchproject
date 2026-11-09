using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using IshonchDesktop.Marking;
using IshonchDesktop.UI;

namespace IshonchDesktop.Debtors;

public enum LoginResult { AlreadyIn, LoggedIn }

/// <summary>1C veb-mijozining kirish oynasi: foydalanuvchi nomi va parol yoziladi, «Войти» bosiladi. Parol hech qayerda saqlanmaydi.</summary>
public static class OneCLogin
{
    const string StateJs = """
        (() => {
          const rect = (id, withValue) => { const e = document.getElementById(id); if (!e || !e.offsetParent) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), v: withValue ? (e.value || '') : '' }; };
          return JSON.stringify({
            login: rect('authWindow_basic_login', true), arrow: rect('authWindow_basic_loginList', false), pass: rect('authWindow_basic_password', false), ok: rect('authWindow_basic_okButton', false),
            main: !!document.querySelector('#openedCell_cont, [id^="themesCell_theme_"]'),
            err: [...document.querySelectorAll('[id^="authWindow"]')].filter(e => e.offsetParent && /ошибк|неверн|не удалось|Error|Incorrect/i.test(e.textContent) && e.children.length === 0).map(e => e.textContent.trim().slice(0, 120))[0] || ''
          });
        })()
        """;

    sealed record State(Pt? Login, Pt? Arrow, Pt? Pass, Pt? Ok, bool Main, string Err);
    sealed record Pt(int X, int Y, string V);

    static async Task<State> ReadAsync(CoreWebView2 core)
    {
        var raw = await core.ExecuteScriptAsync(StateJs);
        var json = JsonSerializer.Deserialize<string>(raw) ?? "{}";
        using var doc = JsonDocument.Parse(json);
        var r = doc.RootElement;
        static Pt? P(JsonElement e) => e.ValueKind == JsonValueKind.Object ? new Pt(e.GetProperty("x").GetInt32(), e.GetProperty("y").GetInt32(), e.GetProperty("v").GetString() ?? "") : null;
        return new State(P(r.GetProperty("login")), P(r.GetProperty("arrow")), P(r.GetProperty("pass")), P(r.GetProperty("ok")), r.GetProperty("main").GetBoolean(), r.GetProperty("err").GetString() ?? "");
    }


    static async Task<string> LoginValueAsync(CoreWebView2 core) => (await ReadAsync(core)).Login?.V.Trim() ?? "";

    static async Task PickUserAsync(CoreWebView2 core, State s, string user, CancellationToken ct)
    {
        if (string.Equals(s.Login!.V.Trim(), user, StringComparison.OrdinalIgnoreCase)) return;
        // a) ro'yxatni ochib, aniq shu nomli bandni bosamiz
        if (s.Arrow is { } arrow)
        {
            await CdpInput.ClickAsync(core, arrow.X, arrow.Y);
            await Task.Delay(1200, ct);
            var find = "(() => { const want = " + JsonSerializer.Serialize(user.ToLowerInvariant()) + "; const l = [...document.querySelectorAll('li,div,span')].filter(e => e.offsetParent && e.children.length === 0 && e.tagName !== 'INPUT' && !/^authWindow_basic_(login|password)/.test(e.id) && e.textContent.trim().toLowerCase() === want); const e = l[l.length - 1]; if (!e) return null; const r = e.getBoundingClientRect(); return JSON.stringify({ x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }); })()";
            for (var i = 0; i < 6; i++)
            {
                var raw = await core.ExecuteScriptAsync(find);
                if (raw != "null")
                {
                    using var doc = JsonDocument.Parse(JsonSerializer.Deserialize<string>(raw)!);
                    await CdpInput.ClickAsync(core, doc.RootElement.GetProperty("x").GetInt32(), doc.RootElement.GetProperty("y").GetInt32());
                    await Task.Delay(700, ct);
                    if (string.Equals(await LoginValueAsync(core), user, StringComparison.OrdinalIgnoreCase)) return;
                    break;
                }
                await Task.Delay(500, ct);
            }
        }
        // b) yozib, 1C to'ldirgan ortiqcha qismni (belgilangan) o'chirib tashlaymiz
        var cur = await ReadAsync(core);
        await CdpInput.ClickAsync(core, cur.Login!.X, cur.Login.Y);
        await Task.Delay(200, ct);
        await CdpInput.KeyAsync(core, "a", 2);
        await CdpInput.InsertAsync(core, user);
        await Task.Delay(400, ct);
        await CdpInput.KeyAsync(core, "Delete");
        await Task.Delay(400, ct);
        var v = await LoginValueAsync(core);
        if (!string.Equals(v, user, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException($"Foydalanuvchi «{user}» ro'yxatdan topilmadi (maydonda: «{v}»)");
    }

    /// <summary>
    /// Baza ochilishini kutadi; kirish oynasi chiqsa foydalanuvchi va parolni yozib kiradi. Kirib bo'lmasa xato tashlaydi
    /// (noto'g'ri parol bilan ko'p urinish foydalanuvchini bloklab qo'ymasligi uchun qayta urinilmaydi).
    /// </summary>
    public static async Task<LoginResult> EnsureAsync(WebTab tab, string user, string password, CancellationToken ct)
    {
        await tab.Ready;
        var core = tab.Core ?? throw new InvalidOperationException("1C tabi tayyor emas");
        var until = DateTime.UtcNow.AddMinutes(3);
        State s;
        // 1) kirish oynasi yoki asosiy oyna paydo bo'lguncha
        while (true)
        {
            ct.ThrowIfCancellationRequested();
            s = await ReadAsync(core);
            if (s.Main) return LoginResult.AlreadyIn;
            if (s.Login is not null && s.Pass is not null && s.Ok is not null) break;
            if (DateTime.UtcNow > until) throw new InvalidOperationException("1C kirish oynasi 3 daqiqada chiqmadi");
            await Task.Delay(500, ct);
        }
        // 2) foydalanuvchini ro'yxatdan topib tanlaymiz (yozilganda 1C boshqa, uzunroq nomni to'ldirib yuborishi mumkin)
        await PickUserAsync(core, s, user.Trim(), ct);
        s = await ReadAsync(core);
        await CdpInput.ClickAsync(core, s.Pass!.X, s.Pass.Y);
        await Task.Delay(200, ct);
        await CdpInput.InsertAsync(core, password);
        await Task.Delay(300, ct);
        await CdpInput.KeyAsync(core, "Enter");
        // 3) kirish natijasi
        until = DateTime.UtcNow.AddMinutes(3);
        var clickedOk = false;
        while (DateTime.UtcNow < until)
        {
            ct.ThrowIfCancellationRequested();
            await Task.Delay(1000, ct);
            var cur = await ReadAsync(core);
            if (cur.Main) return LoginResult.LoggedIn;
            if (!clickedOk && cur.Ok is not null && DateTime.UtcNow > until.AddMinutes(-2.3))
            {
                // Enter ishlamagan bo'lsa — tugmani bosamiz (bir marta)
                clickedOk = true;
                await CdpInput.ClickAsync(core, cur.Ok.X, cur.Ok.Y);
            }
            if (cur.Err.Length > 0) throw new InvalidOperationException("Kirish rad etildi: " + cur.Err);
        }
        throw new InvalidOperationException("Kirib bo'lmadi (foydalanuvchi yoki parol noto'g'ri bo'lishi mumkin)");
    }
}
