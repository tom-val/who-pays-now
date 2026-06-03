data "aws_caller_identity" "current" {}

# ---- IAM ----------------------------------------------------------------

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${var.project}-lambda"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "dynamo" {
  statement {
    actions = [
      "dynamodb:GetItem",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:Query",
    ]
    resources = [
      aws_dynamodb_table.groups.arn,
      "${aws_dynamodb_table.groups.arn}/index/*",
    ]
  }
}

resource "aws_iam_role_policy" "dynamo" {
  name   = "${var.project}-dynamo"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.dynamo.json
}

# ---- function -----------------------------------------------------------

resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.project}-api"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "api" {
  function_name = "${var.project}-api"
  role          = aws_iam_role.lambda.arn

  # Self-contained .NET executable on the custom runtime.
  runtime       = "provided.al2023"
  handler       = "bootstrap"
  architectures = ["arm64"]

  filename         = var.lambda_zip
  source_code_hash = filebase64sha256(var.lambda_zip)

  memory_size = var.lambda_memory
  timeout     = var.lambda_timeout

  environment {
    variables = {
      DynamoDb__TableName    = aws_dynamodb_table.groups.name
      ASPNETCORE_ENVIRONMENT = "Production"
    }
  }

  depends_on = [aws_cloudwatch_log_group.lambda]
}
