namespace IshonchDesktop.Models;

/// <summary>Tab/panel masshtabini eslab qoladi (kalit — profil nomi, "panel" yoki "home").</summary>
public static class ZoomStore
{
    public static Settings? Settings { get; set; }

    public static double Get(string key) => Settings?.GetZoom(key) ?? 1.0;

    public static void Set(string key, double zoom)
    {
        if (Settings is null) return;
        Settings.SetZoom(key, zoom);
        Settings.Save();
    }
}
