# The public `api` Cloud Run service (apps/api/Dockerfile) and its custom domain.
#
#   Patient apps ─HTTPS─▶ api.projectlimon.com (domain mapping, Google-managed certificate)
#                           └─▶ api ─ALL_TRAFFIC─▶ VPC ─▶ Cloud SQL (private IP) · Cloud NAT (35.243.170.34)
#
# The domain mapping only works once `projectlimon.com` is verified in Google Search Console
# by the account that runs `terraform apply`. The Hostinger CNAME is added by hand.

locals {
  # Shared by api and worker (jobs.tf): same image, same configuration.
  service_env = {
    APP_ENV           = "preproduction"
    AUTH_PROVIDER     = "identity-platform"
    GCP_PROJECT_ID    = var.project_id
    PUBSUB_JOBS_TOPIC = google_pubsub_topic.jobs.name
    GCS_TENANT_BUCKET = google_storage_bucket.tenant_assets.name
    DB_HOST           = module.database.private_ip
  }

  # Environment variable → Secret Manager id.
  service_secrets = {
    DB_APP_PASSWORD         = "db-app-password"
    FATSECRET_CLIENT_ID     = "fatsecret-client-id"
    FATSECRET_CLIENT_SECRET = "fatsecret-client-secret"
  }
}

resource "google_cloud_run_v2_service" "api" {
  name                = "api"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = google_service_account.api.email

    # Scales to zero for the pilot (≈ US$10/month saved), so the first request after a quiet
    # period waits for a cold start. TODO(production): min 1, so no patient ever waits on one
    # (docs/roadmap/gcp-migration.md, "Before production").
    scaling {
      min_instance_count = 0
      max_instance_count = 3
    }

    # The image's CMD (`node dist/server.js`) is the api, so unlike the worker no command
    # is needed, but the placeholder image still has to be swapped by the first deploy.
    containers {
      image = local.placeholder_service_image

      ports {
        container_port = 4000 # API_PORT's default
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        # Request-based billing: the warm instance is billed at the idle rate between
        # requests. Nothing runs in the background (jobs go to Pub/Sub).
        cpu_idle          = true
        startup_cpu_boost = true
      }

      startup_probe {
        http_get {
          path = "/health"
        }
        period_seconds    = 3
        failure_threshold = 20
      }

      dynamic "env" {
        for_each = local.service_env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = local.service_secrets
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = module.secrets.secret_ids[env.value]
              version = "latest"
            }
          }
        }
      }
    }

    # All outbound traffic goes through the VPC, so FatSecret sees the whitelisted NAT IP.
    vpc_access {
      egress = "ALL_TRAFFIC"
      network_interfaces {
        network    = module.network.network_name
        subnetwork = module.network.run_subnet_name
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [module.secrets]
}

# Public: authentication is the app's job (Identity Platform tokens, apps/api/src/middleware).
resource "google_cloud_run_v2_service_iam_member" "api_public" {
  name     = google_cloud_run_v2_service.api.name
  location = google_cloud_run_v2_service.api.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Pre-GA on Cloud Run, but fine for preproduction; production gets a load balancer instead.
resource "google_cloud_run_domain_mapping" "api" {
  name     = var.api_domain
  location = var.region

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.api.name
  }
}
