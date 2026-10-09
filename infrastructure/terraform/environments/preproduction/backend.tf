terraform {
  required_version = ">= 1.9"

  # Created by hand once (docs/roadmap/gcp-migration.md, phase 0). Versioned, so an
  # earlier state can be restored from the bucket's noncurrent versions.
  backend "gcs" {
    bucket = "limon-tfstate-a175b1"
    prefix = "preproduction"
  }

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region

  default_labels = {
    project     = "limon"
    environment = "preproduction"
  }
}
