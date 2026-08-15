output "cluster_name" {
  description = "Private EKS cluster name; access requires an approved private-network operator role."
  value       = aws_eks_cluster.financial.name
}

output "cluster_endpoint" {
  description = "Private EKS control-plane endpoint."
  value       = aws_eks_cluster.financial.endpoint
}

output "private_subnet_ids" {
  description = "Three private subnets intended for financial workloads."
  value       = values(aws_subnet.private)[*].id
}

output "workload_node_group" {
  description = "Three-AZ on-demand worker node group."
  value       = aws_eks_node_group.financial.node_group_name
}
