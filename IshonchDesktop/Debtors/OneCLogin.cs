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
          const rect = (id) => { const e = document.getElementById(id); if (!e || !e.offsetParent) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), v: e.value || '' }; };
          return JSON.stringify({
            login: rect('authWindow_basic_login'), pass: rect('authWindow_basic_password'), ok: rect('authWindow_basic_okButton'),
            main: !!document.querySelector('#openedCell_cont, [id^="themesCell_theme_"]'),
            err: [...document.querySelectorAll('[id^="authWindow"]')].filter(e => e.offsetParent && /ошибк|неверн|не удалось|Error|Incorrect/i.test(e.textContent) && e.children.length === 0).map(e => e.textContent.trim().slice(0, 120))[0] || ''
          });
        })()
        """;

    sealed record State(Pt? Login, Pt? Pass, Pt? Ok, bool Main, string Err);
    sealed record Pt(int X, int Y, string V);

    static async Task<State> ReadAsync(CoreWebView2 core)
    {
        var raw = await core.ExecuteScriptAsync(StateJs);
        var json = JsonSerializer.Deserialize<string>(raw) ?? "{}";
        using var doc = JsonDocument.Parse(json);
        var r = doc.RootElement;
        static Pt? P(JsonElement e) => e.ValueKind == JsonValueKind.Object ? new Pt(e.GetProperty("x").GetInt32(), e.GetProperty("y").GetInt32(), e.GetProperty("v").GetString() ?? "") : null;
        return new State(P(r.GetProperty("login")), P(r.GetProperty("pass")), P(r.GetProperty("ok")), r.GetProperty("main").GetBoolean(), r.GetProperty("err").GetString() ?? "");
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
        // 2) foydalanuvchi va parol
        if (!string.Equals(s.Login!.V.Trim(), user.Trim(), StringComparison.OrdinalIgnoreCase))
        {
            await CdpInput.ClickAsync(core, s.Login.X, s.Login.Y);
            await Task.Delay(200, ct);
            await CdpInput.KeyAsync(core, "a", 2);
            await CdpInput.InsertAsync(core, user.Trim());
            await Task.Delay(300, ct);
        }
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
