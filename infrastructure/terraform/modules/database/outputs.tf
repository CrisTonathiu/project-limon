output "instance_name" {
  value = google_sql_database_instance.main.name
}

output "connection_name" {
  value = google_sql_database_instance.main.connection_name
}

output "private_ip" {
  description = "DB_HOST for the api, worker and migrate job."
  value       = google_sql_database_instance.main.private_ip_address
}
