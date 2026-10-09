# Cloud SQL for PostgreSQL with a private IP only, the `limon` database and its owner role.
# The runtime role (`limon_app`, NOBYPASSRLS) is created by the migrate job, not here:
# packages/database/prisma/bootstrap-role.ts.

resource "google_sql_database_instance" "main" {
  name             = var.name
  region           = var.region
  database_version = "POSTGRES_16"

  # Terraform-side guard; the API-side one is settings.deletion_protection_enabled.
  # Both hold pilot health data, so turning either off is a deliberate two-step change.
  deletion_protection = true

  settings {
    edition           = "ENTERPRISE" # shared-core tiers aren't available on Enterprise Plus
    tier              = var.tier
    availability_type = "ZONAL"

    disk_type       = "PD_SSD"
    disk_size       = var.disk_size_gb
    disk_autoresize = true

    deletion_protection_enabled = true

    ip_configuration {
      ipv4_enabled    = false
      private_network = var.network_id
    }

    backup_configuration {
      enabled                        = true
      start_time                     = "08:00" # UTC; 02:00 in Mexico City
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = var.backup_retention_days

      backup_retention_settings {
        retained_backups = var.backup_retention_days
      }
    }

    # Sunday 03:00 in Mexico City (09:00 UTC).
    maintenance_window {
      day  = 7
      hour = 9
    }

    user_labels = var.labels
  }

  depends_on = [var.private_services_connection]
}

resource "google_sql_database" "main" {
  name     = var.database_name
  instance = google_sql_database_instance.main.name
}

# The password is read from Secret Manager at apply time and sent write-only, so it never
# reaches the Terraform state. After adding a new secret version, bump
# owner_password_version so Terraform sends it again.
ephemeral "google_secret_manager_secret_version" "owner_password" {
  secret = var.owner_password_secret
}

resource "google_sql_user" "owner" {
  name                = var.owner_user
  instance            = google_sql_database_instance.main.name
  password_wo         = ephemeral.google_secret_manager_secret_version.owner_password.secret_data
  password_wo_version = var.owner_password_version
}
