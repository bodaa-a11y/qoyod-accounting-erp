# ZATCA integration foundation

This migration adds tenant-scoped seller configuration, per-invoice XML/hash records, and a submission audit table.

## Apply

Back up the Neon database first, then run:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migration_003_zatca.sql
```

Alternatively, apply the SQL in the Neon SQL Editor after reviewing it.

## API endpoints (all require Bearer authentication and entity access)

- `GET /api/entities/:entityId/zatca/settings`
- `PUT /api/entities/:entityId/zatca/settings` (admin/CFO only)
- `GET /api/entities/:entityId/zatca/readiness`
- `POST /api/entities/:entityId/zatca/invoices/:invoiceId/prepare`
- `GET /api/entities/:entityId/zatca/invoices/:invoiceId`
- `GET /api/entities/:entityId/zatca/submissions`

## Important limitation

This is an integration foundation, not production-ready ZATCA compliance. The current XML builder is a development preview only. It does not implement ZATCA XML digital signatures, certificate/CSID onboarding, complete official UBL/Schematron validation, production API calls, previous-invoice-hash chaining, or robust invoice-type/tax-exemption handling. The `prepare` endpoint deliberately does not submit invoices. Do not use generated XML to issue real invoices until the remaining work is implemented and validated with the current official ZATCA SDK and sandbox.
