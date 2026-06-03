output "api_base_url" {
  description = "Base URL of the HTTP API — set as VITE_API_BASE when building the frontend."
  value       = aws_apigatewayv2_api.http.api_endpoint
}

output "cloudfront_url" {
  description = "Public URL of the PWA."
  value       = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}

output "frontend_bucket" {
  description = "S3 bucket the built frontend is synced to."
  value       = aws_s3_bucket.frontend.bucket
}

output "cloudfront_distribution_id" {
  description = "Distribution id, used for cache invalidation after a frontend deploy."
  value       = aws_cloudfront_distribution.frontend.id
}

output "dynamodb_table" {
  value = aws_dynamodb_table.groups.name
}
