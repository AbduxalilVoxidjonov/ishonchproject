namespace IshonchDesktop.UI;

/// <summary>Dastur belgisi (Resources\app.ico, exe ichiga joylangan): oyna uchun va katta rasm sifatida.</summary>
public static class AppIcon
{
    static Stream? Open() => typeof(AppIcon).Assembly.GetManifestResourceStream("app.ico");

    /// <summary>Oyna belgisi (Windows o'zi kerakli o'lchamni tanlaydi); topilmasa null.</summary>
    public static Icon? ForWindow()
    {
        try { using var s = Open(); return s is null ? null : new Icon(s); }
        catch { return null; }
    }

    /// <summary>Berilgan o'lchamdagi aniq rasm (ico ichidagi eng mos nusxadan); topilmasa null.</summary>
    public static Bitmap? Image(int size)
    {
        try
        {
            using var s = Open();
            if (s is null) return null;
            using var ico = new Icon(s, size, size);
            return ico.ToBitmap();
        }
        catch { return null; }
    }
}
