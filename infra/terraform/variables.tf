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

variable "domain_name" {
  description = "Custom domain for the PWA (CloudFront alias). Empty = use the default *.cloudfront.net name only."
  type        = string
  default     = "whopays.valiunas.dev"
}

variable "acm_certificate_arn" {
  description = "ARN of an existing ACM cert in us-east-1 covering domain_name (e.g. the *.valiunas.dev wildcard). Required when domain_name is set."
  type        = string
  default     = "arn:aws:acm:us-east-1:054630617930:certificate/b65a278b-6ba4-4ed0-b5f4-87e0dd9e9210"
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
