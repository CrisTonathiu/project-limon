# ADR-009: Per-tenant store accounts with platform-provisioned mailboxes

**Status:** Accepted (operational details pending) · 2026-09-17

## Context
Each nutritionist gets an independently published app. Apple guideline 4.2.6 says apps built from a commercialized template service should be submitted from the client's own developer account. The platform still needs to operate builds and submissions on the tenant's behalf, and developer accounts are tied to an email address that must stay under platform control for automation and continuity.

## Decision
For each tenant the platform provisions a mailbox on its own domain (e.g. `maria@apps.<platform-domain>`) and uses it to enrol a developer account **owned by that nutritionist** (or their business), per store. The platform holds delegated access (App Store Connect users/API keys, Play Console users) to run builds, submissions and releases.

Modelled as `TenantStoreAccount` (one per tenant per platform): `accountType` (`INDIVIDUAL` | `ORGANIZATION`), `accountEmail`, `externalAccountId` (Apple Team ID / Play developer ID), `status` (`MAILBOX_CREATED → ENROLLMENT_INVITED → ENROLLED → ACCESS_GRANTED → SUSPENDED`), and `apiCredentialRef` pointing at Secrets Manager — credentials are never stored in the database. `tenants.operations_email` holds the provisioned mailbox.

## Alternatives considered
- **All apps under one platform developer account** — simplest, but runs directly into 4.2.6 and risks the whole portfolio on one account's standing.
- **Nutritionist uses their own personal email** — no platform automation, no continuity if they lose access, and manual enrolment support every time.

## Consequences
+ Aligns with store policy; each nutritionist is the legal publisher and receives store revenue directly.
+ One mailbox pattern makes enrolment, verification codes and store correspondence automatable.
− Enrolment cannot be fully automated: identity verification is per person, an organization account needs a D-U-N-S number, and each account carries an annual Apple fee.
− **Google Play:** personal developer accounts created recently must run closed testing with testers before production access; organization accounts are treated differently. This changes onboarding time — verify current requirements before promising launch dates.
− Store notifications and API credentials are per account, so provider events must be routed to the right tenant.
− Offboarding needs a defined path for transferring or retiring the account and mailbox.

## Open operational questions
1. Mailbox infrastructure: SES receiving with forwarding, or hosted mail (Workspace/Microsoft 365)?
2. Who pays the Apple Developer Program fee — platform (bundled in the subscription) or nutritionist?
3. Individual vs organization accounts by default in Mexico (organization requires a D-U-N-S number and a registered entity).
4. Offboarding: transfer the app to the nutritionist, or delist?
