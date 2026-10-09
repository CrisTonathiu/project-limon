# Cloud SQL and the `migrate` Cloud Run Job (bootstrap limon_app → prisma migrate deploy → seed).

module "database" {
  source = "../../modules/database"

  name                        = "limon-pre"
  region                      = var.region
  network_id                  = module.network.network_id
  private_services_connection = module.network.private_services_connection
  owner_password_secret       = module.secrets.secret_ids["db-owner-password"]
  owner_password_version      = 3
  labels                      = { project = "limon", environment = "preproduction" }
}

locals {
  # Placeholder until the first image is pushed. Deploys change the image with
  # `gcloud run jobs update migrate --image=...`, so Terraform ignores it afterwards.
  placeholder_job_image = "us-docker.pkg.dev/cloudrun/container/job:latest"
}

# Image: packages/database/Dockerfile. Its entrypoint assembles DATABASE_URL (limon_app) and
# DATABASE_MIGRATION_URL (limon_owner) from the variables below, then runs the command,
# so a one-off run can override it, e.g. the RLS tests:
#   gcloud run jobs execute migrate --region us-east1 --wait \
#     --args=npx,vitest,run,test/integration/tenant-isolation.test.ts
resource "google_cloud_run_v2_job" "migrate" {
  name                = "migrate"
  location            = var.region
  deletion_protection = false

  template {
    task_count = 1

    template {
      service_account = google_service_account.worker.email
      max_retries     = 0
      timeout         = "600s"

      containers {
        image = local.placeholder_job_image

        resources {
          limits = {
            cpu    = "1"
            memory = "1Gi"
          }
        }

        env {
          name  = "DB_HOST"
          value = module.database.private_ip
        }

        env {
          name = "DB_OWNER_PASSWORD"
          value_source {
            secret_key_ref {
              secret  = module.secrets.secret_ids["db-owner-password"]
              version = "latest"
            }
          }
        }

        env {
          name = "DB_APP_PASSWORD"
          value_source {
            secret_key_ref {
              secret  = module.secrets.secret_ids["db-app-password"]
              version = "latest"
            }
          }
        }

        # The seed's dev tenants: preproduction keeps only Carlos (invite-only).
        env {
          name  = "SEED_TENANTS"
          value = "carlos-nutrition"
        }
      }

      # Only the database's private range goes through the VPC; the job needs no NAT.
      vpc_access {
        egress = "PRIVATE_RANGES_ONLY"
        network_interfaces {
          network    = module.network.network_name
          subnetwork = module.network.run_subnet_name
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [module.secrets]
}
