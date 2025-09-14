
# Backend (Render)
- Skydd för admin-endpoints via `x-admin-key` (env: `ADMIN_API_KEY`)
- Tabeller för jobs och candidates ingår

## Endpoints
- Public:
  - `GET /api/jobs`, `GET /api/jobs/:id`
  - `POST /api/candidates` (ansökan)
- Admin (kräver header `x-admin-key`):
  - `POST /api/jobs`, `PUT /api/jobs/:id`, `DELETE /api/jobs/:id`
  - `GET /api/candidates?job_id=...`, `PUT /api/candidates/:id`
- Övrigt enligt tidigare: orders, invoices (+PDF), export CSV (kan läggas till igen vid behov), payrolls (+PDF), consultant shifts.

## Deploy
- Skapa Web Service på Render, env enligt `.env.example`
- Kör `db/schema.sql` mot Postgres
