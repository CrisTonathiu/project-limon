# Identity Platform (phase 4): patients' and nutritionists' logins, replacing Cognito.
# Multi-tenancy on: each practice gets its own identity tenant, created by the API at
# nutritionist sign-up (or `admin identity-tenant` for existing practices), never here,
# so the same email can be a patient of several nutritionists (ADR-006).
# Nutritionists sign in at the project level, outside any tenant.

resource "google_identity_platform_config" "main" {
  provider = google.quota

  # Email + password at the project level (nutritionists). Each tenant enables its own.
  sign_in {
    allow_duplicate_emails = false

    email {
      enabled           = true
      password_required = true
    }

    # Off, but the API always returns it: declared so plans don't show a change.
    phone_number {
      enabled = false
    }
  }

  multi_tenant {
    allow_tenants = true
  }

  # Verification and password-reset links open on this domain.
  authorized_domains = [
    "localhost",
    "${var.project_id}.firebaseapp.com",
    "${var.project_id}.web.app",
  ]

  depends_on = [google_project_service.apis]
}
