The API does not own schema or migrations — those live in `packages/database`.
This folder is reserved for API-specific database concerns (e.g. read-model queries) if they ever appear.
All tenant data access goes through `withTenant()` from `@limon/database`.
