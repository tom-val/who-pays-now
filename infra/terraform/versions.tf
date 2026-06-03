terraform {
  required_version = ">= 1.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
  }

  # Remote state lives in S3. The bucket, region and lock table are supplied by
  # CI via `-backend-config` (see .github/workflows/deploy.yml) so this block
  # stays partial and reusable. The state bucket + lock table are created once
  # by ../bootstrap.sh. For local use, run `terraform init -backend=false`.
  backend "s3" {
    key = "who-pays-now/terraform.tfstate"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = var.project
      ManagedBy = "terraform"
    }
  }
}

# CloudFront ACM certs (if a custom domain is ever added) must live in us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project   = var.project
      ManagedBy = "terraform"
    }
  }
}
