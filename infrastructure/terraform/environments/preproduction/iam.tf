# Service accounts and their project-level roles. Roles scoped to a single resource are
# granted next to that resource when it's created:
#   - Pub/Sub publisher (api, worker) on the `jobs` topic, and Cloud Run invoker on `worker`
#     for `scheduler` and `pubsub-push`: jobs.tf. The worker needs no subscriber role: Pub/Sub
#     pushes to it.
#   - Storage object admin on the tenant bucket (api, worker): storage.tf
#   - Workload Identity Federation for `deployer` (GitHub Actions): cicd.tf
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

resource "google_service_account" "dashboard" {
  account_id   = "limon-dashboard"
  display_name = "Cloud Run service: dashboard"
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

# The dashboard only mints session cookies (app/api/session); verifying ID tokens and
# cookies needs no role. identitytoolkit.admin would also let it manage every user.
resource "google_project_iam_custom_role" "session_minter" {
  role_id     = "limonSessionMinter"
  title       = "Limon: create Identity Platform session cookies"
  permissions = ["firebaseauth.users.createSession"]
}

resource "google_project_iam_member" "dashboard_session_minter" {
  project = var.project_id
  role    = google_project_iam_custom_role.session_minter.name
  member  = google_service_account.dashboard.member
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
    api       = google_service_account.api.name
    worker    = google_service_account.worker.name
    dashboard = google_service_account.dashboard.name
  }
  service_account_id = each.value
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.deployer.member
}
