output "nat_ip" {
  description = "Fixed outbound IP for api and worker. Whitelist it at FatSecret."
  value       = module.network.nat_ip
}

output "artifact_registry" {
  description = "Docker image prefix."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.limon.repository_id}"
}

output "database" {
  value = {
    instance   = module.database.instance_name
    private_ip = module.database.private_ip
  }
}

output "service_accounts" {
  value = {
    api         = google_service_account.api.email
    worker      = google_service_account.worker.email
    scheduler   = google_service_account.scheduler.email
    pubsub_push = google_service_account.pubsub_push.email
    deployer    = google_service_account.deployer.email
  }
}
