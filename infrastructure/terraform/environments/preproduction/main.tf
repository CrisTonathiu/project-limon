# `preproduction`: the only cloud environment during the MVP pilot (docs/roadmap/gcp-migration.md).
# This file holds the foundation: project APIs, network, container registry and secrets.
# Service accounts and their roles are in iam.tf.

locals {
  apis = [
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "servicenetworking.googleapis.com",
    "compute.googleapis.com",
    "pubsub.googleapis.com",
    "cloudscheduler.googleapis.com",
    "secretmanager.googleapis.com",
    "artifactregistry.googleapis.com",
    "identitytoolkit.googleapis.com",
    "iamcredentials.googleapis.com",
    "iam.googleapis.com",
    "monitoring.googleapis.com",
    "logging.googleapis.com",
  ]

  # Values are set by hand; see modules/secrets. Stripe's secrets are added with billing.
  secret_ids = [
    "db-app-password",
    "db-owner-password",
    "fatsecret-client-id",
    "fatsecret-client-secret",
  ]
}

resource "google_project_service" "apis" {
  for_each = toset(local.apis)
  service  = each.value

  # Leave the APIs on if this configuration is ever destroyed; turning one off can
  # break resources Terraform doesn't manage.
  disable_on_destroy = false
}

module "network" {
  source = "../../modules/network"

  name   = "limon"
  region = var.region

  depends_on = [google_project_service.apis]
}

resource "google_artifact_registry_repository" "limon" {
  repository_id = "limon"
  location      = var.region
  format        = "DOCKER"
  description   = "Images for the api, worker and migrate job."

  # Keep the 10 most recent images; delete anything older than 30 days beyond that.
  cleanup_policy_dry_run = false
  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 10
    }
  }
  cleanup_policies {
    id     = "delete-old"
    action = "DELETE"
    condition {
      older_than = "2592000s"
    }
  }

  depends_on = [google_project_service.apis]
}

module "secrets" {
  source = "../../modules/secrets"

  region     = var.region
  secret_ids = local.secret_ids
  accessors = [
    google_service_account.api.member,
    google_service_account.worker.member,
  ]

  depends_on = [google_project_service.apis]
}
