variable "project" {
  description = "Project name, used to prefix resources."
  type        = string
  default     = "who-pays-now"
}

variable "aws_region" {
  description = "AWS region to deploy into."
  type        = string
  default     = "eu-central-1"
}

variable "lambda_zip" {
  description = "Path to the built backend Lambda package (self-contained, provided.al2023)."
  type        = string
  default     = "../../backend/artifact/lambda.zip"
}

variable "lambda_memory" {
  description = "Lambda memory (MB)."
  type        = number
  default     = 512
}

variable "lambda_timeout" {
  description = "Lambda timeout (seconds)."
  type        = number
  default     = 15
}

variable "log_retention_days" {
  description = "CloudWatch log retention for the Lambda."
  type        = number
  default     = 14
}
