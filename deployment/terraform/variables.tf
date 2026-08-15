variable "aws_region" {
  description = "AWS region with at least three enabled Availability Zones."
  type        = string

  validation {
    condition     = can(regex("^[a-z]{2}-[a-z]+-[0-9]+$", var.aws_region))
    error_message = "aws_region must look like ap-northeast-1 or us-east-1."
  }
}

variable "environment" {
  description = "Deployment environment. Production uses a separate AWS account and remote state."
  type        = string

  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "environment must be development, staging, or production."
  }
}

variable "name_prefix" {
  description = "Short immutable environment prefix, for example hidotpay-production."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,40}$", var.name_prefix))
    error_message = "name_prefix must be lowercase letters, digits, and hyphens."
  }
}

variable "vpc_cidr" {
  description = "Private VPC address range. It must not overlap the corporate or database network."
  type        = string
  default     = "10.70.0.0/16"

  validation {
    condition     = can(cidrnetmask(var.vpc_cidr))
    error_message = "vpc_cidr must be a valid IPv4 CIDR range."
  }
}

variable "kubernetes_version" {
  description = "EKS Kubernetes minor version approved by the platform change process."
  type        = string
  default     = "1.35"

  validation {
    condition     = can(regex("^[0-9]+\\.[0-9]+$", var.kubernetes_version))
    error_message = "kubernetes_version must be a major.minor value."
  }
}

variable "node_instance_types" {
  description = "On-demand node types for the financial worker pool."
  type        = list(string)
  default     = ["m7i.large"]

  validation {
    condition     = length(var.node_instance_types) > 0
    error_message = "At least one node instance type is required."
  }
}
