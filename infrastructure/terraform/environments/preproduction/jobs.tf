# Background work: the `worker` Cloud Run service, the Pub/Sub `jobs` topic that pushes to it,
# and the Cloud Scheduler jobs that call its maintenance endpoints (apps/api/src/jobs/worker-app.ts).
#
#   api ─publish─▶ jobs ─push (OIDC: limon-pubsub-push)─▶ worker POST /jobs
#                    └─ 5 failed deliveries ─▶ jobs-dlq (kept 7 days; pull it to inspect)
#   Cloud Scheduler (OIDC: limon-scheduler) ─▶ worker POST /maintenance/*

locals {
  # Placeholder until the first image is pushed. Deploys change the image (and the command)
  # with `gcloud run deploy worker ...`, so Terraform ignores them afterwards.
  placeholder_service_image = "us-docker.pkg.dev/cloudrun/container/hello:latest"

  # The longest a job or maintenance run may take; Pub/Sub's ack deadline maximum.
  job_timeout_seconds = 600

  # Mexico City has no daylight saving time since 2022, so these never shift.
  scheduler_time_zone = "America/Mexico_City"
}

data "google_project" "this" {}

# ─── worker ────────────────────────────────────────────────────────────────────────────

# Same image and environment as the api (api.tf), different command. Private: no allUsers invoker, only the
# Pub/Sub push and Scheduler service accounts below.
resource "google_cloud_run_v2_service" "worker" {
  name                = "worker"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = google_service_account.worker.email
    timeout         = "${local.job_timeout_seconds}s"

    # Scales to zero between jobs. Two instances at most: more would only duplicate
    # FatSecret calls if two cache refreshes ever overlapped.
    scaling {
      min_instance_count = 0
      max_instance_count = 2
    }

    # No `command` here: the placeholder image has no Node.js and wouldn't start. The deploy
    # sets both, e.g. `gcloud run deploy worker --image=… --command=node --args=dist/jobs/worker.js`.
    containers {
      image = local.placeholder_service_image

      ports {
        container_port = 4001 # WORKER_PORT's default
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        # CPU only while a request is in flight; every job runs inside its request.
        cpu_idle = true
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
      template[0].containers[0].command,
      template[0].containers[0].args,
      client,
      client_version,
    ]
  }

  depends_on = [module.secrets]
}

resource "google_cloud_run_v2_service_iam_member" "worker_invokers" {
  for_each = {
    pubsub_push = google_service_account.pubsub_push.member
    scheduler   = google_service_account.scheduler.member
  }
  name     = google_cloud_run_v2_service.worker.name
  location = google_cloud_run_v2_service.worker.location
  role     = "roles/run.invoker"
  member   = each.value
}

# ─── Pub/Sub ───────────────────────────────────────────────────────────────────────────

resource "google_pubsub_topic" "jobs" {
  name       = "jobs"
  depends_on = [google_project_service.apis]
}

resource "google_pubsub_topic" "jobs_dlq" {
  name       = "jobs-dlq"
  depends_on = [google_project_service.apis]
}

# The worker publishes too: a handler may enqueue follow-up jobs.
resource "google_pubsub_topic_iam_member" "jobs_publishers" {
  for_each = {
    api    = google_service_account.api.member
    worker = google_service_account.worker.member
  }
  topic  = google_pubsub_topic.jobs.name
  role   = "roles/pubsub.publisher"
  member = each.value
}

resource "google_pubsub_subscription" "jobs_worker" {
  name  = "jobs-worker"
  topic = google_pubsub_topic.jobs.id

  # The worker must answer within this; Cloud Run's request timeout matches it.
  ack_deadline_seconds       = local.job_timeout_seconds
  message_retention_duration = "604800s" # 7 days

  push_config {
    push_endpoint = "${google_cloud_run_v2_service.worker.uri}/jobs"
    oidc_token {
      service_account_email = google_service_account.pubsub_push.email
      audience              = google_cloud_run_v2_service.worker.uri
    }
  }

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.jobs_dlq.id
    max_delivery_attempts = 5
  }

  expiration_policy {
    ttl = "" # never expire, even with no traffic
  }
}

# Without a subscription, messages sent to jobs-dlq would be dropped.
resource "google_pubsub_subscription" "jobs_dlq" {
  name  = "jobs-dlq"
  topic = google_pubsub_topic.jobs_dlq.id

  message_retention_duration = "604800s" # 7 days

  expiration_policy {
    ttl = ""
  }
}

# Dead-lettering is done by the Pub/Sub service agent: it must publish to jobs-dlq and
# acknowledge the original message on jobs-worker.
locals {
  pubsub_service_agent = "serviceAccount:service-${data.google_project.this.number}@gcp-sa-pubsub.iam.gserviceaccount.com"
}

resource "google_pubsub_topic_iam_member" "dlq_publisher" {
  topic  = google_pubsub_topic.jobs_dlq.name
  role   = "roles/pubsub.publisher"
  member = local.pubsub_service_agent
}

resource "google_pubsub_subscription_iam_member" "dlq_source_subscriber" {
  subscription = google_pubsub_subscription.jobs_worker.name
  role         = "roles/pubsub.subscriber"
  member       = local.pubsub_service_agent
}

# ─── Cloud Scheduler ───────────────────────────────────────────────────────────────────

resource "google_cloud_scheduler_job" "food_cache" {
  name             = "food-cache-refresh"
  description      = "Purge and refresh the shared FatSecret cache (apps/api/src/jobs/food-cache-maintenance.ts)."
  region           = var.region
  schedule         = "*/15 * * * *"
  time_zone        = local.scheduler_time_zone
  attempt_deadline = "${local.job_timeout_seconds}s"

  # A failed run is simply retried by the next one, 15 minutes later.
  retry_config {
    retry_count = 0
  }

  http_target {
    uri         = "${google_cloud_run_v2_service.worker.uri}/maintenance/food-cache"
    http_method = "POST"
    oidc_token {
      service_account_email = google_service_account.scheduler.email
      audience              = google_cloud_run_v2_service.worker.uri
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_cloud_scheduler_job" "weekly_plans" {
  name             = "weekly-plans"
  description      = "Generate next week's meal plans (MVP week 4)."
  region           = var.region
  schedule         = "0 3 * * 0" # Sundays, 03:00
  time_zone        = local.scheduler_time_zone
  attempt_deadline = "${local.job_timeout_seconds}s"

  # The endpoint answers 501 until the Sunday job is built (docs/roadmap/mvp-roadmap.md, week 4).
  paused = true

  retry_config {
    retry_count          = 2
    min_backoff_duration = "300s"
  }

  http_target {
    uri         = "${google_cloud_run_v2_service.worker.uri}/maintenance/weekly-plans"
    http_method = "POST"
    oidc_token {
      service_account_email = google_service_account.scheduler.email
      audience              = google_cloud_run_v2_service.worker.uri
    }
  }

  depends_on = [google_project_service.apis]
}
