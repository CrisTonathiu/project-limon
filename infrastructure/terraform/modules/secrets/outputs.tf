output "secret_ids" {
  description = "Secret id → full resource id."
  value       = { for id, s in google_secret_manager_secret.this : id => s.id }
}
