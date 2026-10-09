# Secret Manager entries. Terraform creates the secrets and grants access; the values are
# added by hand (`gcloud secrets versions add <id> --data-file=-`) so they never reach
# the Terraform state.

resource "google_secret_manager_secret" "this" {
  for_each  = toset(var.secret_ids)
  secret_id = each.value

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }
}

resource "google_secret_manager_secret_iam_member" "accessor" {
  for_each = {
    for pair in setproduct(var.secret_ids, var.accessors) : "${pair[0]}|${pair[1]}" => {
      secret = pair[0]
      member = pair[1]
    }
  }

  secret_id = google_secret_manager_secret.this[each.value.secret].id
  role      = "roles/secretmanager.secretAccessor"
  member    = each.value.member
}
