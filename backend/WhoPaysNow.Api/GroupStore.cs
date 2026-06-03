using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;

namespace WhoPaysNow.Api;

/// <summary>Raised when the payer the client expected no longer matches (retry).</summary>
public class StaleTurnException() : Exception("The turn changed before this payment was recorded");

/// <summary>
/// Single-table DynamoDB access for groups. Layout:
///   PK = GROUP#&lt;id&gt;
///   SK = META | MEMBER#&lt;id&gt; | CATEGORY#&lt;id&gt;
/// A single Query on PK returns the entire group state in one round-trip.
/// </summary>
public class GroupStore(IAmazonDynamoDB db, string tableName)
{
    private const string MetaSk = "META";
    private const string MemberPrefix = "MEMBER#";
    private const string CategoryPrefix = "CATEGORY#";

    private static string Pk(string groupId) => $"GROUP#{groupId}";

    private static AttributeValue S(string v) => new() { S = v };
    private static AttributeValue N(long v) => new() { N = v.ToString() };

    // ---------------------------------------------------------------- read

    public async Task<GroupState?> GetGroupAsync(string groupId, CancellationToken ct = default)
    {
        var resp = await db.QueryAsync(new QueryRequest
        {
            TableName = tableName,
            KeyConditionExpression = "PK = :pk",
            ExpressionAttributeValues = new() { [":pk"] = S(Pk(groupId)) },
        }, ct);

        GroupMeta? meta = null;
        var members = new List<Member>();
        var categories = new List<Category>();

        foreach (var item in resp.Items)
        {
            var sk = item["SK"].S;
            if (sk == MetaSk)
                meta = new GroupMeta(groupId, item["name"].S, long.Parse(item["createdAt"].N));
            else if (sk.StartsWith(MemberPrefix))
                members.Add(ReadMember(item));
            else if (sk.StartsWith(CategoryPrefix))
                categories.Add(ReadCategory(item));
        }

        if (meta is null) return null;

        var sortedMembers = members.OrderBy(m => m.Seq).ToList();
        var memberDtos = sortedMembers.Select(m => new MemberDto(m.Id, m.Name, m.Color)).ToList();
        var categoryDtos = categories
            .OrderBy(c => c.Seq)
            .Select(c => new CategoryDto(c.Id, c.Name, c.Emoji, c.PayCounts,
                Domain.CurrentPayer(sortedMembers, c.PayCounts)))
            .ToList();

        return new GroupState(meta.Id, meta.Name, meta.CreatedAt, memberDtos, categoryDtos);
    }

    private static Member ReadMember(Dictionary<string, AttributeValue> item) =>
        new(item["id"].S, item["name"].S, item["color"].S, long.Parse(item["seq"].N));

    private static Category ReadCategory(Dictionary<string, AttributeValue> item)
    {
        var counts = new Dictionary<string, int>();
        if (item.TryGetValue("payCounts", out var pc) && pc.M is not null)
            foreach (var kv in pc.M)
                counts[kv.Key] = int.Parse(kv.Value.N);
        return new Category(
            item["id"].S, item["name"].S, item.GetValueOrDefault("emoji")?.S ?? "",
            long.Parse(item["seq"].N), long.Parse(item.GetValueOrDefault("rev")?.N ?? "0"), counts);
    }

    private async Task<List<Member>> GetMembersAsync(string groupId, CancellationToken ct)
    {
        var resp = await db.QueryAsync(new QueryRequest
        {
            TableName = tableName,
            KeyConditionExpression = "PK = :pk AND begins_with(SK, :sk)",
            ExpressionAttributeValues = new() { [":pk"] = S(Pk(groupId)), [":sk"] = S(MemberPrefix) },
        }, ct);
        return resp.Items.Select(ReadMember).OrderBy(m => m.Seq).ToList();
    }

    // -------------------------------------------------------------- groups

    /// <summary>
    /// Create a group under a freshly generated unique id. The display name is
    /// stored as-is and need not be unique — people join by id (shared link).
    /// </summary>
    public async Task<GroupState> CreateGroupAsync(string name, long now, CancellationToken ct = default)
    {
        for (var attempt = 0; attempt < 5; attempt++)
        {
            var id = Guid.NewGuid().ToString("N");
            try
            {
                await db.PutItemAsync(new PutItemRequest
                {
                    TableName = tableName,
                    Item = new()
                    {
                        ["PK"] = S(Pk(id)),
                        ["SK"] = S(MetaSk),
                        ["name"] = S(name),
                        ["createdAt"] = N(now),
                    },
                    ConditionExpression = "attribute_not_exists(PK)",
                }, ct);
                return new GroupState(id, name, now, [], []);
            }
            catch (ConditionalCheckFailedException)
            {
                // Astronomically unlikely id collision — just try another.
            }
        }
        throw new InvalidOperationException("Could not allocate a unique group id");
    }

    public async Task<bool> GroupExistsAsync(string id, CancellationToken ct = default)
    {
        var resp = await db.GetItemAsync(new GetItemRequest
        {
            TableName = tableName,
            Key = new() { ["PK"] = S(Pk(id)), ["SK"] = S(MetaSk) },
            ProjectionExpression = "PK",
        }, ct);
        return resp.IsItemSet;
    }

    // ------------------------------------------------------------- members

    public async Task<MemberDto> AddMemberAsync(string groupId, string name, string? color, long seq, CancellationToken ct = default)
    {
        var existing = await GetMembersAsync(groupId, ct);
        var chosen = string.IsNullOrWhiteSpace(color)
            ? Domain.NextColor(existing.Select(m => m.Color))
            : color;
        var id = Ids.Short();

        await db.PutItemAsync(new PutItemRequest
        {
            TableName = tableName,
            Item = new()
            {
                ["PK"] = S(Pk(groupId)),
                ["SK"] = S(MemberPrefix + id),
                ["id"] = S(id),
                ["name"] = S(name),
                ["color"] = S(chosen),
                ["seq"] = N(seq),
            },
        }, ct);

        return new MemberDto(id, name, chosen);
    }

    public async Task RemoveMemberAsync(string groupId, string memberId, CancellationToken ct = default)
    {
        await db.DeleteItemAsync(new DeleteItemRequest
        {
            TableName = tableName,
            Key = new() { ["PK"] = S(Pk(groupId)), ["SK"] = S(MemberPrefix + memberId) },
        }, ct);
    }

    // ---------------------------------------------------------- categories

    public async Task<CategoryDto> AddCategoryAsync(string groupId, string name, string? emoji, long seq, CancellationToken ct = default)
    {
        var id = Ids.Short();
        await db.PutItemAsync(new PutItemRequest
        {
            TableName = tableName,
            Item = new()
            {
                ["PK"] = S(Pk(groupId)),
                ["SK"] = S(CategoryPrefix + id),
                ["id"] = S(id),
                ["name"] = S(name),
                ["emoji"] = S(emoji ?? ""),
                ["seq"] = N(seq),
                ["rev"] = N(0),
                ["payCounts"] = new AttributeValue { M = new() },
            },
        }, ct);

        var members = await GetMembersAsync(groupId, ct);
        var empty = new Dictionary<string, int>();
        return new CategoryDto(id, name, emoji ?? "", empty, Domain.CurrentPayer(members, empty));
    }

    public async Task UpdateCategoryAsync(string groupId, string categoryId, string name, string? emoji, CancellationToken ct = default)
    {
        await db.UpdateItemAsync(new UpdateItemRequest
        {
            TableName = tableName,
            Key = new() { ["PK"] = S(Pk(groupId)), ["SK"] = S(CategoryPrefix + categoryId) },
            UpdateExpression = "SET #n = :name, emoji = :emoji",
            ConditionExpression = "attribute_exists(PK)",
            ExpressionAttributeNames = new() { ["#n"] = "name" },
            ExpressionAttributeValues = new() { [":name"] = S(name), [":emoji"] = S(emoji ?? "") },
        }, ct);
    }

    public async Task DeleteCategoryAsync(string groupId, string categoryId, CancellationToken ct = default)
    {
        await db.DeleteItemAsync(new DeleteItemRequest
        {
            TableName = tableName,
            Key = new() { ["PK"] = S(Pk(groupId)), ["SK"] = S(CategoryPrefix + categoryId) },
        }, ct);
    }

    /// <summary>
    /// Record that the current payer paid, advancing the turn. Uses optimistic
    /// concurrency on the category `rev` so two simultaneous taps can't double
    /// count. Caller should retry on <see cref="StaleTurnException"/>.
    /// </summary>
    public async Task<CategoryDto> PayAsync(string groupId, string categoryId, string? expectedPayerId, CancellationToken ct = default)
    {
        var getCat = await db.GetItemAsync(new GetItemRequest
        {
            TableName = tableName,
            Key = new() { ["PK"] = S(Pk(groupId)), ["SK"] = S(CategoryPrefix + categoryId) },
        }, ct);
        if (!getCat.IsItemSet) throw new KeyNotFoundException("category");

        var category = ReadCategory(getCat.Item);
        var members = await GetMembersAsync(groupId, ct);

        var payerId = Domain.CurrentPayer(members, category.PayCounts);
        if (payerId is null) throw new InvalidOperationException("No members to take a turn");
        if (expectedPayerId is not null && expectedPayerId != payerId)
            throw new StaleTurnException();

        var newCount = (category.PayCounts.TryGetValue(payerId, out var c) ? c : 0) + 1;
        try
        {
            await db.UpdateItemAsync(new UpdateItemRequest
            {
                TableName = tableName,
                Key = new() { ["PK"] = S(Pk(groupId)), ["SK"] = S(CategoryPrefix + categoryId) },
                UpdateExpression = "SET payCounts.#m = :n, rev = :newRev",
                ConditionExpression = "rev = :curRev",
                ExpressionAttributeNames = new() { ["#m"] = payerId },
                ExpressionAttributeValues = new()
                {
                    [":n"] = N(newCount),
                    [":newRev"] = N(category.Rev + 1),
                    [":curRev"] = N(category.Rev),
                },
            }, ct);
        }
        catch (ConditionalCheckFailedException)
        {
            throw new StaleTurnException();
        }

        var updated = new Dictionary<string, int>(category.PayCounts) { [payerId] = newCount };
        return new CategoryDto(category.Id, category.Name, category.Emoji, updated,
            Domain.CurrentPayer(members, updated));
    }
}
