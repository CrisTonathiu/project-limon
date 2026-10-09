output "network_id" {
  value = google_compute_network.main.id
}

output "network_name" {
  value = google_compute_network.main.name
}

output "run_subnet_id" {
  value = google_compute_subnetwork.run.id
}

output "run_subnet_name" {
  value = google_compute_subnetwork.run.name
}

output "nat_ip" {
  description = "Fixed outbound IP. Whitelist it at FatSecret."
  value       = google_compute_address.nat.address
}

output "private_services_connection" {
  description = "Depend on this before creating a Cloud SQL instance with a private IP."
  value       = google_service_networking_connection.private_services.id
}
