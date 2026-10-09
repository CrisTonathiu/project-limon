variable "region" {
  description = "The only region the secrets are replicated to."
  type        = string
}

variable "secret_ids" {
  type = list(string)
}

variable "accessors" {
  description = "IAM members (e.g. serviceAccount:...) that can read every secret."
  type        = list(string)
}
