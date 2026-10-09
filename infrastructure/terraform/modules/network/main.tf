# VPC for Cloud Run Direct VPC egress, Cloud NAT with one reserved IP (the IP FatSecret
# whitelists), and Private Service Access so Cloud SQL gets a private IP.

resource "google_compute_network" "main" {
  name                    = var.name
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"
}

# Cloud Run instances take their IPs from this subnet (Direct VPC egress). Each instance
# uses about two IPs and Cloud Run keeps extra headroom while scaling, so a /24 leaves
# ample room for min 1 / max 3 instances of each service.
resource "google_compute_subnetwork" "run" {
  name                     = "${var.name}-run"
  region                   = var.region
  network                  = google_compute_network.main.id
  ip_cidr_range            = var.run_subnet_cidr
  private_ip_google_access = true
}

resource "google_compute_router" "main" {
  name    = "${var.name}-router"
  region  = var.region
  network = google_compute_network.main.id
}

# Every outbound call (FatSecret, Stripe, Google APIs) leaves from this IP. Changing it
# means re-whitelisting at FatSecret, so Terraform refuses to destroy it.
resource "google_compute_address" "nat" {
  name         = "${var.name}-nat-ip"
  region       = var.region
  address_type = "EXTERNAL"
  network_tier = "PREMIUM"

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_compute_router_nat" "main" {
  name                               = "${var.name}-nat"
  region                             = var.region
  router                             = google_compute_router.main.name
  nat_ip_allocate_option             = "MANUAL_ONLY"
  nat_ips                            = [google_compute_address.nat.self_link]
  source_subnetwork_ip_ranges_to_nat = "LIST_OF_SUBNETWORKS"

  subnetwork {
    name                    = google_compute_subnetwork.run.id
    source_ip_ranges_to_nat = ["ALL_IP_RANGES"]
  }

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

# Private Service Access: a reserved range peered with Google's service network, from
# which Cloud SQL assigns its private IP.
resource "google_compute_global_address" "private_services" {
  name          = "${var.name}-private-services"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = var.private_services_prefix_length
  network       = google_compute_network.main.id
}

resource "google_service_networking_connection" "private_services" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_services.name]
}
