variable "project_id" {
  type    = string
  default = "limon-preproduction"
}

variable "region" {
  type    = string
  default = "us-east1"
}

variable "api_domain" {
  description = "Custom domain for the api. Verify its parent domain in Search Console first."
  type        = string
  default     = "api.projectlimon.com"
}

variable "dashboard_domain" {
  description = "Custom domain for the nutritionist dashboard (dashboard.tf)."
  type        = string
  default     = "app.projectlimon.com"
}

variable "github_repository" {
  description = "owner/name of the repository whose main-branch workflows may deploy (cicd.tf)."
  type        = string
  default     = "CrisTonathiu/project-limon"
}

# No default: the repository is public. Set it in terraform.tfvars (gitignored) or TF_VAR_alert_email.
variable "alert_email" {
  description = "Where monitoring alerts are sent (monitoring.tf)."
  type        = string
}
