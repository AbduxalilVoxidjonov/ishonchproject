namespace IshonchDesktop.Unmarked;

/// <summary>
/// Jarayonni pauza qilish: <see cref="Pause"/> dan keyin <see cref="WaitAsync"/> chaqirgan har bir amal <see cref="Resume"/> gacha
/// kutadi va shu joyidan davom etadi. <see cref="Now"/> — pauzada o'tgan vaqtni hisobga olmaydigan soat (kutish muddatlari uchun).
/// </summary>
public sealed class PauseGate
{
    readonly object sync = new();
    TaskCompletionSource? resume;
    long pausedAt;
    long pausedTotal;

    public bool Paused { get { lock (sync) return resume is not null; } }

    /// <summary>Pauza yoki davom etish holati o'zgarganda.</summary>
    public event Action<bool>? Changed;

    public void Pause()
    {
        lock (sync)
        {
            if (resume is not null) return;
            resume = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            pausedAt = Environment.TickCount64;
        }
        Changed?.Invoke(true);
    }

    public void Resume()
    {
        TaskCompletionSource? r;
        lock (sync)
        {
            r = resume;
            if (r is null) return;
            pausedTotal += Environment.TickCount64 - pausedAt;
            resume = null;
        }
        r.TrySetResult();
        Changed?.Invoke(false);
    }

    public long Now
    {
        get
        {
            lock (sync)
            {
                var now = Environment.TickCount64;
                return now - pausedTotal - (resume is not null ? now - pausedAt : 0);
            }
        }
    }

    public Task WaitAsync(CancellationToken ct)
    {
        Task? t;
        lock (sync) t = resume?.Task;
        return t is null ? Task.CompletedTask : t.WaitAsync(ct);
    }
}
