namespace WhoPaysNow.Api;

/// <summary>A member of a group — one person, with their own colour.</summary>
public record Member(string Id, string Name, string Color, long Seq);

/// <summary>
/// A spending category (Restaurant, Gas, Coffee, …). Each category keeps its
/// own independent payment tally so turns rotate per-category.
/// </summary>
public record Category(
    string Id,
    string Name,
    string Emoji,
    long Seq,
    long Rev,
    Dictionary<string, int> PayCounts);

/// <summary>Top-level group metadata.</summary>
public record GroupMeta(string Id, string Name, long CreatedAt);

/// <summary>The whole state of a group, returned by GET /groups/{id}.</summary>
public record GroupState(
    string Id,
    string Name,
    long CreatedAt,
    IReadOnlyList<MemberDto> Members,
    IReadOnlyList<CategoryDto> Categories);

public record MemberDto(string Id, string Name, string Color);

/// <summary>
/// Category as seen by the client — includes the computed current payer so the
/// frontend never has to re-derive turn logic.
/// </summary>
public record CategoryDto(
    string Id,
    string Name,
    string Emoji,
    IReadOnlyDictionary<string, int> PayCounts,
    string? CurrentPayerId);

// ---- request bodies ----
public record CreateGroupRequest(string Name);
public record AddMemberRequest(string Name, string? Color);
public record UpsertCategoryRequest(string Name, string? Emoji);
public record PayRequest(string? ExpectedPayerId);
