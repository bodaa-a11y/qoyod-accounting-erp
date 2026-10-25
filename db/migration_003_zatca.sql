-- ZATCA FATOORA integration foundation. Apply with: psql "$DATABASE_URL" -f db/migration_003_zatca.sql
CREATE TABLE IF NOT EXISTS zatca_entity_settings (
  entity_id UUID PRIMARY KEY REFERENCES entities(id) ON DELETE CASCADE,
  seller_name_ar VARCHAR(255),
  seller_name_en VARCHAR(255),
  building_number VARCHAR(10),
  street_name VARCHAR(255),
  district VARCHAR(255),
  city VARCHAR(100),
  postal_code VARCHAR(10),
  country_code CHAR(2) NOT NULL DEFAULT 'SA',
  vat_number VARCHAR(15),
  cr_number VARCHAR(20),
  invoice_type VARCHAR(20) NOT NULL DEFAULT 'both' CHECK (invoice_type IN ('standard','simplified','both')),
  environment VARCHAR(20) NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','simulation','production')),
  device_solution_name VARCHAR(255),
  device_solution_version VARCHAR(100),
  device_serial_number VARCHAR(255),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS zatca_invoice_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  uuid UUID NOT NULL,
  invoice_hash TEXT,
  xml_content TEXT,
  invoice_type_code VARCHAR(10),
  submission_status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (submission_status IN ('draft','ready_for_validation','validated','pending','reported','cleared','rejected','error')),
  zatca_response JSONB,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entity_id, invoice_id),
  UNIQUE(entity_id, uuid)
);
CREATE INDEX IF NOT EXISTS idx_zatca_records_entity_status ON zatca_invoice_records(entity_id, submission_status);

CREATE TABLE IF NOT EXISTS zatca_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  operation VARCHAR(20) NOT NULL CHECK (operation IN ('reporting','clearance','validation')),
  request_id UUID NOT NULL DEFAULT gen_random_uuid(),
  response_status INTEGER,
  response_body JSONB,
  outcome VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending','success','rejected','error')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(entity_id, request_id)
);
CREATE INDEX IF NOT EXISTS idx_zatca_submissions_invoice ON zatca_submissions(entity_id, invoice_id, created_at DESC);
