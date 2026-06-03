using Amazon.DynamoDBv2;
using Amazon.DynamoDBv2.Model;

namespace WhoPaysNow.Api;

/// <summary>
/// Creates the single table when missing. Only used for local development
/// (DynamoDB Local) — in AWS the table is provisioned by Terraform.
/// </summary>
public static class TableBootstrap
{
    public static async Task EnsureTableAsync(IAmazonDynamoDB db, string tableName)
    {
        try
        {
            await db.DescribeTableAsync(tableName);
            return; // already exists
        }
        catch (ResourceNotFoundException) { /* create below */ }

        await db.CreateTableAsync(new CreateTableRequest
        {
            TableName = tableName,
            BillingMode = BillingMode.PAY_PER_REQUEST,
            KeySchema =
            [
                new KeySchemaElement("PK", KeyType.HASH),
                new KeySchemaElement("SK", KeyType.RANGE),
            ],
            AttributeDefinitions =
            [
                new AttributeDefinition("PK", ScalarAttributeType.S),
                new AttributeDefinition("SK", ScalarAttributeType.S),
            ],
        });
    }
}
