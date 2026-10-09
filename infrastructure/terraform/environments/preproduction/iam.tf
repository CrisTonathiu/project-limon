# Service accounts and their project-level roles. Roles scoped to a single resource are
# granted next to that resource when it's created:
#   - Pub/Sub publisher (api) and subscriber (worker) on the `jobs` topic: phase 5
#   - Cloud Run invoker on `worker` for `scheduler` and `pubsub-push`: phase 5
#   - Storage object admin on the tenant bucket (api, worker): phase 6
#   - Workload Identity Federation for `deployer`: phase 8
# Secret access is granted per secret in modules/secrets.

resource "google_service_account" "api" {
  account_id   = "limon-api"
  display_name = "Cloud Run service: api"
  depends_on   = [google_project_service.apis]
}

resource "google_service_account" "worker" {
  account_id   = "limon-worker"
  display_name = "Cloud Run service: worker (jobs, scheduled maintenance, migrate job)"
  depends_on   = [google_project_service.apis]
}

resource "google_service_account" "scheduler" {
  account_id   = "limon-scheduler"
  display_name = "Cloud Scheduler → worker"
  depends_on   = [google_project_service.apis]
}

resource "google_service_account" "pubsub_push" {
  account_id   = "limon-pubsub-push"
  display_name = "Pub/Sub push subscription → worker"
  depends_on   = [google_project_service.apis]
}

resource "google_service_account" "deployer" {
  account_id   = "limon-deployer"
  display_name = "CI: build, push and deploy"
  depends_on   = [google_project_service.apis]
}

locals {
  # Both services connect to Cloud SQL and manage Identity Platform tenants and users
  # (account deletion on api, DeleteTenantData on worker).
  runtime_roles = [
    "roles/cloudsql.client",
    "roles/identitytoolkit.admin",
  ]

  deployer_roles = [
    "roles/run.admin",
  ]
}

resource "google_project_iam_member" "api" {
  for_each = toset(local.runtime_roles)
  project  = var.project_id
  role     = each.value
  member   = google_service_account.api.member
}

resource "google_project_iam_member" "worker" {
  for_each = toset(local.runtime_roles)
  project  = var.project_id
  role     = each.value
  member   = google_service_account.worker.member
}

# V4 signed URLs for Cloud Storage: with no key file, the api signs through the IAM
# signBlob API, which needs token creator on its own service account.
resource "google_service_account_iam_member" "api_signs_as_itself" {
  service_account_id = google_service_account.api.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = google_service_account.api.member
}

resource "google_project_iam_member" "deployer" {
  for_each = toset(local.deployer_roles)
  project  = var.project_id
  role     = each.value
  member   = google_service_account.deployer.member
}

resource "google_artifact_registry_repository_iam_member" "deployer_pushes" {
  location   = google_artifact_registry_repository.limon.location
  repository = google_artifact_registry_repository.limon.name
  role       = "roles/artifactregistry.writer"
  member     = google_service_account.deployer.member
}

# Deploying a service or job that runs as another service account requires actAs on it.
resource "google_service_account_iam_member" "deployer_acts_as" {
  for_each = {
    api    = google_service_account.api.name
    worker = google_service_account.worker.name
  }
  service_account_id = each.value
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.deployer.member
}
