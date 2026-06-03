# Single-table store. PK = GROUP#<id>, SK = META | MEMBER#<id> | CATEGORY#<id>.
# On-demand billing — traffic is spiky and low, so we never manage capacity.
resource "aws_dynamodb_table" "groups" {
  name         = var.project
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "PK"
  range_key    = "SK"

  attribute {
    name = "PK"
    type = "S"
  }

  attribute {
    name = "SK"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }
}
