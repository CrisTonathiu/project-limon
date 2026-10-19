# Uptime check and alerts, all sent by email to var.alert_email.
#
#   uptime     api.projectlimon.com/health fails from 2+ regions
#   api 5xx    more than 5 server errors in 5 minutes
#   jobs-dlq   any message waiting in the dead-letter subscription (a job failed 5 times)
#   Cloud SQL  CPU or disk above 80% for 10 minutes
#
# Incidents close by themselves a day after the condition clears.

locals {
  alert_auto_close = "86400s"
}

resource "google_monitoring_notification_channel" "email" {
  display_name = "Limon alerts (email)"
  type         = "email"
  labels = {
    email_address = var.alert_email
  }
  depends_on = [google_project_service.apis]
}

# ─── Uptime ────────────────────────────────────────────────────────────────────────────

resource "google_monitoring_uptime_check_config" "api_health" {
  display_name = "api /health"
  period       = "300s"
  # The api scales to zero, so a check can land on a cold start (a few seconds).
  timeout = "30s"

  http_check {
    path         = "/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = var.api_domain
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_monitoring_alert_policy" "api_down" {
  display_name          = "api is down"
  combiner              = "OR"
  notification_channels = [google_monitoring_notification_channel.email.id]

  conditions {
    display_name = "/health failing"
    condition_threshold {
      filter          = "metric.type=\"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type=\"uptime_url\" AND metric.label.check_id=\"${google_monitoring_uptime_check_config.api_health.uptime_check_id}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "60s"

      # Counts the checker regions whose latest result failed.
      aggregations {
        alignment_period     = "1200s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.*"]
      }
    }
  }

  alert_strategy {
    auto_close = local.alert_auto_close
  }

  documentation {
    content = "https://${var.api_domain}/health is failing. Check the `api` service's revisions and logs in Cloud Run."
  }
}

# ─── api 5xx ───────────────────────────────────────────────────────────────────────────

resource "google_monitoring_alert_policy" "api_5xx" {
  display_name          = "api 5xx errors"
  combiner              = "OR"
  notification_channels = [google_monitoring_notification_channel.email.id]

  conditions {
    display_name = "More than 5 server errors in 5 minutes"
    condition_threshold {
      filter          = "metric.type=\"run.googleapis.com/request_count\" AND resource.type=\"cloud_run_revision\" AND resource.label.service_name=\"${google_cloud_run_v2_service.api.name}\" AND metric.label.response_code_class=\"5xx\""
      comparison      = "COMPARISON_GT"
      threshold_value = 5
      duration        = "0s"

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
    }
  }

  alert_strategy {
    auto_close = local.alert_auto_close
  }

  documentation {
    content = "The `api` service is answering 5xx. Look for errors in its Cloud Run logs."
  }
}

# ─── Jobs ──────────────────────────────────────────────────────────────────────────────

resource "google_monitoring_alert_policy" "jobs_dead_lettered" {
  display_name          = "Job dead-lettered"
  combiner              = "OR"
  notification_channels = [google_monitoring_notification_channel.email.id]

  conditions {
    display_name = "Messages waiting in jobs-dlq"
    condition_threshold {
      filter          = "metric.type=\"pubsub.googleapis.com/subscription/num_undelivered_messages\" AND resource.type=\"pubsub_subscription\" AND resource.label.subscription_id=\"${google_pubsub_subscription.jobs_dlq.name}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MAX"
      }
    }
  }

  alert_strategy {
    auto_close = local.alert_auto_close
  }

  documentation {
    content = <<-EOT
      A job failed 5 deliveries and went to `jobs-dlq`. Inspect it, fix the cause, then acknowledge it:
      `gcloud pubsub subscriptions pull jobs-dlq --limit=10` (add `--auto-ack` once handled).
      The alert clears when the subscription is empty.
    EOT
  }
}

# ─── Cloud SQL ─────────────────────────────────────────────────────────────────────────

resource "google_monitoring_alert_policy" "database_resources" {
  display_name          = "Cloud SQL CPU or disk high"
  combiner              = "OR"
  notification_channels = [google_monitoring_notification_channel.email.id]

  dynamic "conditions" {
    for_each = {
      "CPU above 80%"  = "cloudsql.googleapis.com/database/cpu/utilization"
      "Disk above 80%" = "cloudsql.googleapis.com/database/disk/utilization"
    }
    content {
      display_name = conditions.key
      condition_threshold {
        filter          = "metric.type=\"${conditions.value}\" AND resource.type=\"cloudsql_database\" AND resource.label.database_id=\"${var.project_id}:${module.database.instance_name}\""
        comparison      = "COMPARISON_GT"
        threshold_value = 0.8
        duration        = "600s"

        aggregations {
          alignment_period   = "300s"
          per_series_aligner = "ALIGN_MEAN"
        }
      }
    }
  }

  alert_strategy {
    auto_close = local.alert_auto_close
  }

  documentation {
    content = "`${module.database.instance_name}` (db-f1-micro) is running hot. Check Query Insights, or set a larger `tier` on the database module (database.tf)."
  }
}
