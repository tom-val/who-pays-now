using WhoPaysNow.Api;
using Xunit;

namespace WhoPaysNow.Tests;

public class ColorTests
{
    [Fact]
    public void NextColor_picks_first_unused()
    {
        var taken = new[] { Domain.Palette[0], Domain.Palette[1] };
        Assert.Equal(Domain.Palette[2], Domain.NextColor(taken));
    }

    [Fact]
    public void NextColor_wraps_when_all_used()
    {
        var all = Domain.Palette.ToList();
        var next = Domain.NextColor(all);
        Assert.Contains(next, Domain.Palette);
    }
}

public class TurnTests
{
    private static Member M(string id, long seq) => new(id, id, "c", seq);

    [Fact]
    public void Empty_group_has_no_payer()
        => Assert.Null(Domain.CurrentPayer([], new Dictionary<string, int>()));

    [Fact]
    public void First_turn_goes_to_earliest_joiner()
    {
        var members = new[] { M("b", 2), M("a", 1), M("c", 3) };
        Assert.Equal("a", Domain.CurrentPayer(members, new Dictionary<string, int>()));
    }

    [Fact]
    public void Lowest_count_pays_next()
    {
        var members = new[] { M("a", 1), M("b", 2) };
        var counts = new Dictionary<string, int> { ["a"] = 2, ["b"] = 1 };
        Assert.Equal("b", Domain.CurrentPayer(members, counts));
    }

    [Fact]
    public void Ties_break_by_join_order()
    {
        var members = new[] { M("a", 1), M("b", 2) };
        var counts = new Dictionary<string, int> { ["a"] = 1, ["b"] = 1 };
        Assert.Equal("a", Domain.CurrentPayer(members, counts));
    }

    [Fact]
    public void Rotation_cycles_through_everyone_fairly()
    {
        var members = new[] { M("a", 1), M("b", 2), M("c", 3) };
        var counts = new Dictionary<string, int>();
        var order = new List<string>();
        for (var i = 0; i < 6; i++)
        {
            var payer = Domain.CurrentPayer(members, counts)!;
            order.Add(payer);
            counts[payer] = counts.GetValueOrDefault(payer) + 1;
        }
        Assert.Equal(new[] { "a", "b", "c", "a", "b", "c" }, order);
    }
}
