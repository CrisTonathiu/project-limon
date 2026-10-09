variable "name" {
  description = "Cloud SQL instance name."
  type        = string
}

variable "region" {
  type = string
}

variable "network_id" {
  description = "VPC the private IP is allocated in."
  type        = string
}

variable "private_services_connection" {
  description = "The network module's Private Service Access connection; the instance waits for it."
  type        = string
}

variable "tier" {
  type    = string
  default = "db-f1-micro"
}

variable "disk_size_gb" {
  description = "Starting size; the disk grows automatically."
  type        = number
  default     = 10
}

variable "backup_retention_days" {
  type    = number
  default = 7
}

variable "database_name" {
  type    = string
  default = "limon"
}

variable "owner_user" {
  description = "Owns the schema and runs migrations (DATABASE_MIGRATION_URL)."
  type        = string
  default     = "limon_owner"
}

variable "owner_password_secret" {
  description = "Secret Manager secret id holding the owner password."
  type        = string
}

variable "owner_password_version" {
  description = "Bump after adding a new version of the owner password secret, so Terraform resends it."
  type        = number
}

variable "labels" {
  type    = map(string)
  default = {}
}
