-- Qoyod Accounting ERP — Comprehensive PostgreSQL Schema
-- Strict Double-Entry Accounting, Multitenant Entity Isolation, Integer Money (Halalas)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Users & Authentication
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'accountant', -- 'admin', 'accountant', 'cashier', 'viewer'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Entities / Businesses (Multitenant Partitioning)
CREATE TABLE IF NOT EXISTS entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  vat_number VARCHAR(50),
  cr_number VARCHAR(50),
  currency VARCHAR(10) NOT NULL DEFAULT 'SAR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Entity Membership & Roles
CREATE TABLE IF NOT EXISTS user_entities (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL DEFAULT 'accountant',
  PRIMARY KEY (user_id, entity_id)
);

-- 3. Chart of Accounts (COA)
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  name_en VARCHAR(255),
  type VARCHAR(50) NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  sub_type VARCHAR(50) NOT NULL DEFAULT 'general',
  parent_id UUID REFERENCES accounts(id) ON DELETE RESTRICT,
  level INT NOT NULL DEFAULT 1,
  nature VARCHAR(10) NOT NULL DEFAULT 'debit' CHECK (nature IN ('debit', 'credit')),
  is_group BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_entity_account_code UNIQUE (entity_id, code)
);

CREATE INDEX IF NOT EXISTS idx_accounts_entity ON accounts(entity_id);
CREATE INDEX IF NOT EXISTS idx_accounts_parent ON accounts(parent_id);

-- 4. Document Sequences for Gapless Auditable Numbering
CREATE TABLE IF NOT EXISTS doc_sequences (
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  doc_type VARCHAR(50) NOT NULL,
  prefix VARCHAR(20) NOT NULL,
  last_number INT NOT NULL DEFAULT 0,
  PRIMARY KEY (entity_id, doc_type)
);

-- 5. Customers & Vendors
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  vat_number VARCHAR(50),
  phone VARCHAR(50),
  email VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_entity ON customers(entity_id);

-- 6. Sales Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  invoice_number VARCHAR(100) NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE,
  status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'paid', 'cancelled')),
  subtotal_halalas BIGINT NOT NULL DEFAULT 0 CHECK (subtotal_halalas >= 0),
  vat_halalas BIGINT NOT NULL DEFAULT 0 CHECK (vat_halalas >= 0),
  total_halalas BIGINT NOT NULL DEFAULT 0 CHECK (total_halalas >= 0),
  paid_halalas BIGINT NOT NULL DEFAULT 0 CHECK (paid_halalas >= 0),
  idempotency_key VARCHAR(255),
  journal_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_entity_invoice_idempotency UNIQUE (entity_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_invoices_entity ON invoices(entity_id);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);

CREATE TABLE IF NOT EXISTS invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  revenue_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  description TEXT NOT NULL,
  qty NUMERIC(14, 4) NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit_price_halalas BIGINT NOT NULL DEFAULT 0 CHECK (unit_price_halalas >= 0),
  vat_rate NUMERIC(5, 2) NOT NULL DEFAULT 15,
  subtotal_halalas BIGINT NOT NULL DEFAULT 0,
  vat_halalas BIGINT NOT NULL DEFAULT 0,
  total_halalas BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_inv ON invoice_lines(invoice_id);

-- 7. Receipts & Payments Vouchers
CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  receipt_number VARCHAR(100) NOT NULL,
  amount_halalas BIGINT NOT NULL CHECK (amount_halalas > 0),
  cash_account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  method VARCHAR(50) NOT NULL DEFAULT 'cash',
  notes TEXT,
  journal_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receipts_entity ON receipts(entity_id);
CREATE INDEX IF NOT EXISTS idx_receipts_inv ON receipts(invoice_id);

-- 8. General Ledger & Journal Entries
CREATE TABLE IF NOT EXISTS journals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  journal_number VARCHAR(100) NOT NULL,
  date DATE NOT NULL,
  description TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'posted' CHECK (status IN ('posted', 'reversed')),
  source_type VARCHAR(50) NOT NULL DEFAULT 'manual', -- 'manual', 'invoice', 'receipt'
  source_id UUID,
  total_halalas BIGINT NOT NULL DEFAULT 0 CHECK (total_halalas >= 0),
  reversed_by_id UUID REFERENCES journals(id),
  reverse_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_journals_entity ON journals(entity_id);
CREATE INDEX IF NOT EXISTS idx_journals_date ON journals(date);

CREATE TABLE IF NOT EXISTS journal_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id UUID NOT NULL REFERENCES journals(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  debit_halalas BIGINT NOT NULL DEFAULT 0 CHECK (debit_halalas >= 0),
  credit_halalas BIGINT NOT NULL DEFAULT 0 CHECK (credit_halalas >= 0),
  description TEXT
);

CREATE INDEX IF NOT EXISTS idx_journal_lines_jrn ON journal_lines(journal_id);
CREATE INDEX IF NOT EXISTS idx_journal_lines_acc ON journal_lines(account_id);

-- 9. Immutable Audit Log
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGSERIAL PRIMARY KEY,
  entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id_ref TEXT,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);

-- Audit Log Trigger: Disallow Update and Delete
CREATE OR REPLACE FUNCTION prevent_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'سجلات التدقيق الأمني (Audit Log) غير قابلة للتعديل أو الحذف إطلاقاً';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_log_immutable ON audit_log;
CREATE TRIGGER trg_audit_log_immutable
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW
EXECUTE FUNCTION prevent_audit_log_modification();
