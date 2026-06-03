namespace WhoPaysNow.Api;

/// <summary>Pure domain helpers: colour palette and turn resolution.</summary>
public static class Domain
{
    /// <summary>Playful accent palette, shared with the frontend theme.</summary>
    public static readonly string[] Palette =
    {
        "oklch(0.62 0.19 285)", // violet
        "oklch(0.68 0.18 28)",  // coral
        "oklch(0.68 0.13 165)", // mint
        "oklch(0.76 0.14 75)",  // amber
        "oklch(0.66 0.14 235)", // sky
        "oklch(0.69 0.17 350)", // pink
        "oklch(0.64 0.16 140)", // green
        "oklch(0.70 0.15 55)",  // orange
        "oklch(0.60 0.16 300)", // purple
        "oklch(0.66 0.13 195)", // teal
    };

    /// <summary>Pick the next palette colour not already taken (falls back to round-robin).</summary>
    public static string NextColor(IEnumerable<string> taken)
    {
        var used = new HashSet<string>(taken);
        foreach (var c in Palette)
            if (!used.Contains(c))
                return c;
        // all taken: round-robin by count
        return Palette[used.Count % Palette.Length];
    }

    /// <summary>
    /// Whose turn is it to pay in this category? Balance-based and fair: the
    /// member who has paid the fewest times goes next; ties break by join order.
    /// Returns null when there are no members.
    /// </summary>
    public static string? CurrentPayer(IReadOnlyList<Member> members, IReadOnlyDictionary<string, int> payCounts)
    {
        Member? best = null;
        var bestCount = int.MaxValue;
        foreach (var m in members.OrderBy(m => m.Seq))
        {
            var count = payCounts.TryGetValue(m.Id, out var c) ? c : 0;
            if (count < bestCount)
            {
                bestCount = count;
                best = m;
            }
        }
        return best?.Id;
    }
}
