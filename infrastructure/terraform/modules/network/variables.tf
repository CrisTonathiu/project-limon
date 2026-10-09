variable "name" {
  description = "VPC name; also the prefix for the subnet, router, NAT and IP."
  type        = string
}

variable "region" {
  type = string
}

variable "run_subnet_cidr" {
  description = "Subnet for Cloud Run Direct VPC egress."
  type        = string
  default     = "10.10.0.0/24"
}

variable "private_services_prefix_length" {
  description = "Size of the Private Service Access range (Cloud SQL private IPs)."
  type        = number
  default     = 20
}
