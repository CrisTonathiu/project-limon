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
