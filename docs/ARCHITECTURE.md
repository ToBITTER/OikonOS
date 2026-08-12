# OikonOS production architecture

OikonOS is a multi-tenant modular monolith. This preserves transactional
consistency for sales and inventory while giving each domain a clean extraction
boundary if scale later requires separate services.

## Domain boundaries

- Identity: users, sessions, verification, recovery
- Organizations: tenants, memberships, locations, roles and permissions
- Catalog: categories, products, pricing and barcodes
- Inventory: on-hand levels, reservations, movements and transfers
- Commerce: register shifts, sales, payments, returns and refunds
- Procurement: suppliers, purchase orders, receipts and supplier balances
- CRM: customers, segments and purchase history
- Finance: expenses, cash reconciliation, revenue and margin reporting
- Intelligence: metric snapshots, anomaly detection and narrative insights
- Platform: audit trail, idempotency, files, notifications and webhooks

Every tenant-owned table carries `organization_id`. Repository calls require a
tenant context; tenant identifiers must never be accepted from request bodies.

## Transaction boundary for checkout

1. Lock the selected inventory rows with `SELECT ... FOR UPDATE`.
2. Validate available quantity (`quantity - reserved_quantity`).
3. Create the sale and immutable line snapshots.
4. Create or confirm the idempotent payment.
5. Decrement inventory with optimistic version checks.
6. Append stock movements with resulting balances.
7. Complete the sale and shift cash totals.
8. Append an audit event and commit.

Any failure rolls back the entire operation. Dashboard and AI workloads consume
committed records only and never participate in checkout latency.

## Security baseline

- 15-minute access tokens and rotating hashed refresh sessions
- Membership-based roles with explicit permission overrides
- Tenant scoping at repository boundaries and PostgreSQL RLS as defence in depth
- Rate limits for identity and mutation endpoints
- Idempotency keys for sales, payments, refunds and stock receipts
- Password hashing, secure HTTP-only cookies, strict CORS and security headers
- Immutable audit records for financial, inventory and access-control changes
- Secrets supplied by the deployment platform; none committed to source control
