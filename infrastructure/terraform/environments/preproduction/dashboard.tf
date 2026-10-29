# The public `dashboard` Cloud Run service (apps/dashboard/Dockerfile) and its custom domain.
#
#   Nutritionists ─HTTPS─▶ app.projectlimon.com (domain mapping, Google-managed certificate)
#                            └─▶ dashboard ─/api/v1 proxy─▶ api.projectlimon.com
#
# The browser only talks to the dashboard: the Firebase session cookie is httpOnly and the
# proxy forwards it to the api server to server (D5, docs/architecture/authentication.md).
# No VPC access: the dashboard never touches Cloud SQL. Like the api's, the Hostinger CNAME
# is added by hand.

resource "google_cloud_run_v2_service" "dashboard" {
  name                = "dashboard"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = google_service_account.dashboard.email

    # Scales to zero like the api; a nutritionist can wait on a cold start in preproduction.
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    containers {
      image = local.placeholder_service_image

      ports {
        container_port = 3000 # PORT in apps/dashboard/Dockerfile
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        cpu_idle          = true
        startup_cpu_boost = true
      }

      # Read at request time (lib/server-env.ts), so the same image serves every environment.
      # The Firebase web config is public: it ends up in the sign-in page.
      dynamic "env" {
        for_each = {
          APP_ENV              = "preproduction"
          AUTH_PROVIDER        = "identity-platform"
          GCP_PROJECT_ID       = var.project_id
          API_BASE_URL         = "https://${var.api_domain}"
          DASHBOARD_ORIGIN     = "https://${var.dashboard_domain}"
          FIREBASE_API_KEY     = google_identity_platform_config.main.client[0].api_key
          FIREBASE_AUTH_DOMAIN = "${google_identity_platform_config.main.client[0].firebase_subdomain}.firebaseapp.com"
        }
        content {
          name  = env.key
          value = env.value
        }
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
}

# Public: sign-in is the app's job (the session cookie, checked by middleware.ts and the api).
resource "google_cloud_run_v2_service_iam_member" "dashboard_public" {
  name     = google_cloud_run_v2_service.dashboard.name
  location = google_cloud_run_v2_service.dashboard.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_domain_mapping" "dashboard" {
  name     = var.dashboard_domain
  location = var.region

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.dashboard.name
  }
}
