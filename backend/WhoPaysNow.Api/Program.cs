using Amazon.DynamoDBv2;
using WhoPaysNow.Api;

var builder = WebApplication.CreateBuilder(args);

// Run as a Lambda when hosted on AWS; falls through to Kestrel for `dotnet run`.
builder.Services.AddAWSLambdaHosting(LambdaEventSource.HttpApi);

builder.Services.AddSingleton<IAmazonDynamoDB>(_ =>
{
    var serviceUrl = builder.Configuration["DynamoDb:ServiceUrl"];
    if (!string.IsNullOrWhiteSpace(serviceUrl))
    {
        // Local development against DynamoDB Local.
        var cfg = new AmazonDynamoDBConfig { ServiceURL = serviceUrl };
        return new AmazonDynamoDBClient("local", "local", cfg);
    }
    return new AmazonDynamoDBClient();
});

builder.Services.AddSingleton(sp =>
{
    var table = builder.Configuration["DynamoDb:TableName"] ?? "who-pays-now";
    return new GroupStore(sp.GetRequiredService<IAmazonDynamoDB>(), table);
});

// Permissive CORS — the PWA is served from a different origin (CloudFront / localhost)
// and there is no auth or cookies involved.
var corsPolicy = "pwa";
builder.Services.AddCors(o => o.AddPolicy(corsPolicy, p =>
    p.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod()));

var app = builder.Build();
app.UseCors(corsPolicy);

// Local dev convenience: ensure the table exists when pointing at DynamoDB Local.
if (app.Environment.IsDevelopment() && !string.IsNullOrWhiteSpace(builder.Configuration["DynamoDb:ServiceUrl"]))
{
    var db = app.Services.GetRequiredService<IAmazonDynamoDB>();
    var table = builder.Configuration["DynamoDb:TableName"] ?? "who-pays-now";
    await TableBootstrap.EnsureTableAsync(db, table);
}

long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

// ---- groups -------------------------------------------------------------

app.MapPost("/groups", async (CreateGroupRequest req, GroupStore store, CancellationToken ct) =>
{
    var name = (req.Name ?? "").Trim();
    if (name.Length is < 2 or > 60)
        return Results.BadRequest(new { error = "Name must be 2–60 characters." });

    var group = await store.CreateGroupAsync(name, Now(), ct);
    return Results.Created($"/groups/{group.Id}", group);
});

app.MapGet("/groups/{id}", async (string id, GroupStore store, CancellationToken ct) =>
{
    var group = await store.GetGroupAsync(id, ct);
    return group is null ? Results.NotFound() : Results.Ok(group);
});

// ---- members ------------------------------------------------------------

app.MapPost("/groups/{id}/members", async (string id, AddMemberRequest req, GroupStore store, CancellationToken ct) =>
{
    var name = (req.Name ?? "").Trim();
    if (name.Length is < 1 or > 30)
        return Results.BadRequest(new { error = "Name must be 1–30 characters." });
    if (!await store.GroupExistsAsync(id, ct))
        return Results.NotFound();

    var member = await store.AddMemberAsync(id, name, req.Color, Now(), ct);
    return Results.Created($"/groups/{id}/members/{member.Id}", member);
});

app.MapDelete("/groups/{id}/members/{memberId}", async (string id, string memberId, GroupStore store, CancellationToken ct) =>
{
    await store.RemoveMemberAsync(id, memberId, ct);
    return Results.NoContent();
});

// ---- categories ---------------------------------------------------------

app.MapPost("/groups/{id}/categories", async (string id, UpsertCategoryRequest req, GroupStore store, CancellationToken ct) =>
{
    var name = (req.Name ?? "").Trim();
    if (name.Length is < 1 or > 40)
        return Results.BadRequest(new { error = "Name must be 1–40 characters." });
    if (!await store.GroupExistsAsync(id, ct))
        return Results.NotFound();

    var category = await store.AddCategoryAsync(id, name, req.Emoji, Now(), ct);
    return Results.Created($"/groups/{id}/categories/{category.Id}", category);
});

app.MapPut("/groups/{id}/categories/{categoryId}", async (string id, string categoryId, UpsertCategoryRequest req, GroupStore store, CancellationToken ct) =>
{
    var name = (req.Name ?? "").Trim();
    if (name.Length is < 1 or > 40)
        return Results.BadRequest(new { error = "Name must be 1–40 characters." });
    try
    {
        await store.UpdateCategoryAsync(id, categoryId, name, req.Emoji, ct);
        return Results.NoContent();
    }
    catch (Amazon.DynamoDBv2.Model.ConditionalCheckFailedException)
    {
        return Results.NotFound();
    }
});

app.MapDelete("/groups/{id}/categories/{categoryId}", async (string id, string categoryId, GroupStore store, CancellationToken ct) =>
{
    await store.DeleteCategoryAsync(id, categoryId, ct);
    return Results.NoContent();
});

// ---- pay (advance the turn) --------------------------------------------

app.MapPost("/groups/{id}/categories/{categoryId}/pay", async (string id, string categoryId, PayRequest? req, GroupStore store, CancellationToken ct) =>
{
    for (var attempt = 0; attempt < 4; attempt++)
    {
        try
        {
            var category = await store.PayAsync(id, categoryId, req?.ExpectedPayerId, ct);
            return Results.Ok(category);
        }
        catch (StaleTurnException)
        {
            // Optimistic-concurrency clash — re-read and retry unless the client
            // pinned an expected payer (in which case the turn genuinely moved).
            if (req?.ExpectedPayerId is not null)
                return Results.Conflict(new { error = "The turn already moved on. Refresh and try again." });
        }
        catch (KeyNotFoundException)
        {
            return Results.NotFound();
        }
        catch (InvalidOperationException ex)
        {
            return Results.BadRequest(new { error = ex.Message });
        }
    }
    return Results.Conflict(new { error = "Too much contention, please try again." });
});

app.Run();
