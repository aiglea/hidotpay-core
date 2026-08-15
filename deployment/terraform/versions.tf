terraform {
  required_version = ">= 1.6.0"

  # Production state belongs in an encrypted, versioned remote backend. Backend
  # coordinates are deliberately supplied at `terraform init`, never in Git.
  backend "s3" {}

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.47.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      ManagedBy   = "terraform"
      Project     = "hidotpay-financial"
    }
  }
}
