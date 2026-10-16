# Tenant files: one private bucket, keys under tenants/{tenantId}/ (packages/tenant/src/storage.ts).
# Nothing is public: the api hands out short-lived V4 signed URLs (apps/api/src/infrastructure/storage.ts),
# signing through IAM as itself (token creator on its own service account, iam.tf).

resource "google_storage_bucket" "tenant_assets" {
  name     = "limon-pre-tenant-assets"
  location = var.region

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  # Holds patient files: Terraform refuses to delete the bucket while it has objects.
  force_destroy = false

  versioning {
    enabled = true
  }

  # Scratch uploads expire after a day.
  lifecycle_rule {
    condition {
      age            = 1
      matches_prefix = ["tmp/"]
    }
    action {
      type = "Delete"
    }
  }

  # Overwritten or deleted objects are kept 30 days, then removed.
  lifecycle_rule {
    condition {
      days_since_noncurrent_time = 30
      with_state                 = "ARCHIVED"
    }
    action {
      type = "Delete"
    }
  }

  depends_on = [google_project_service.apis]
}

# api: signed URLs. worker: DeleteTenantData removes a tenant's prefix.
resource "google_storage_bucket_iam_member" "tenant_assets_admins" {
  for_each = {
    api    = google_service_account.api.member
    worker = google_service_account.worker.member
  }
  bucket = google_storage_bucket.tenant_assets.name
  role   = "roles/storage.objectAdmin"
  member = each.value
}
