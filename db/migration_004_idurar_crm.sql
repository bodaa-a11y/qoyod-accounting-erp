-- Migration 004: IDURAR ERP/CRM integration modules
-- Adds CRM Leads, Sales Deals/Pipeline, Partial Invoice Payments tracking, Quotes/Proformas, and Expense Categories.
-- All monetary columns are BIGINT halalas.

-- 1. CRM Leads (العملاء المتوقعين / المحتملين)
CREATE TABLE IF NOT EXISTS crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  company VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  source VARCHAR(50) NOT NULL DEFAULT 'direct' CHECK (source IN ('website', 'social_media', 'referral', 'direct', 'ad', 'other')),
  status VARCHAR(50) NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost')),
  estimated_value_halalas BIGINT NOT NULL DEFAULT 0 CHECK (estimated_value_halalas >= 0),
  notes TEXT,
  assigned_to VARCHAR(100),
  converted_to_customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_leads_entity_status ON crm_leads(entity_id, status);

-- 2. CRM Deals / Pipeline (الصفقات ومسار المبيعات)
CREATE TABLE IF NOT EXISTS crm_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  stage VARCHAR(50) NOT NULL DEFAULT 'discovery' CHECK (stage IN ('discovery', 'proposal', 'negotiation', 'won', 'lost')),
  amount_halalas BIGINT NOT NULL DEFAULT 0 CHECK (amount_halalas >= 0),
  probability_percent INT NOT NULL DEFAULT 50 CHECK (probability_percent BETWEEN 0 AND 100),
  expected_close_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crm_deals_entity_stage ON crm_deals(entity_id, stage);

-- 3. Invoice Payments (تتبع سداد الفواتير والدفعات الجزئية)
CREATE TABLE IF NOT EXISTS invoice_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  payment_number VARCHAR(100) NOT NULL,
  amount_halalas BIGINT NOT NULL CHECK (amount_halalas > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  method VARCHAR(50) NOT NULL DEFAULT 'bank_transfer' CHECK (method IN ('cash', 'bank_transfer', 'pos', 'check', 'other')),
  reference_number VARCHAR(100),
  notes TEXT,
  journal_id UUID REFERENCES journals(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id);

-- 4. Quotes & Proforma Invoices (عروض الأسعار والفواتير المبدئية)
CREATE TABLE IF NOT EXISTS quotes_proformas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE RESTRICT,
  doc_type VARCHAR(50) NOT NULL DEFAULT 'quote' CHECK (doc_type IN ('quote', 'proforma')),
  code VARCHAR(100) NOT NULL,
  issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'converted')),
  subtotal_halalas BIGINT NOT NULL DEFAULT 0 CHECK (subtotal_halalas >= 0),
  vat_halalas BIGINT NOT NULL DEFAULT 0 CHECK (vat_halalas >= 0),
  total_halalas BIGINT NOT NULL DEFAULT 0 CHECK (total_halalas >= 0),
  terms TEXT,
  notes TEXT,
  converted_to_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_quotes_proformas_entity ON quotes_proformas(entity_id, doc_type);

-- 5. Expense Categories (تصنيفات المصروفات المتقدمة)
CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
