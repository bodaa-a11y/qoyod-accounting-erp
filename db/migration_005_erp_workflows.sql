-- db/migration_005_erp_workflows.sql
-- Complete ERP System Workflow, Document Lifecycle & Approvals Architecture

-- 1. Update Invoices Status Constraint and Approval Columns
DO $$
BEGIN
  -- Drop existing check constraint on invoices status if present
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE table_name = 'invoices' AND constraint_name = 'invoices_status_check'
  ) THEN
    ALTER TABLE invoices DROP CONSTRAINT invoices_status_check;
  END IF;
END $$;

ALTER TABLE invoices 
  ADD CONSTRAINT invoices_status_check 
  CHECK (status IN ('draft', 'pending_approval', 'approved', 'posted', 'partially_paid', 'paid', 'completed', 'cancelled', 'reversed'));

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS approved_by VARCHAR(100);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS quote_id UUID REFERENCES quotes_proformas(id) ON DELETE SET NULL;

-- 2. Update Purchase Invoices Status and Approvals
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE table_name = 'purchase_invoices' AND constraint_name = 'purchase_invoices_status_check'
  ) THEN
    ALTER TABLE purchase_invoices DROP CONSTRAINT purchase_invoices_status_check;
  END IF;
END $$;

ALTER TABLE purchase_invoices 
  ADD CONSTRAINT purchase_invoices_status_check 
  CHECK (status IN ('draft', 'pending_approval', 'approved', 'posted', 'partially_paid', 'paid', 'completed', 'cancelled', 'reversed'));

ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS approved_by VARCHAR(100);
ALTER TABLE purchase_invoices ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- 3. Update Quotes Proformas Status
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE table_name = 'quotes_proformas' AND constraint_name = 'quotes_proformas_status_check'
  ) THEN
    ALTER TABLE quotes_proformas DROP CONSTRAINT quotes_proformas_status_check;
  END IF;
END $$;

ALTER TABLE quotes_proformas 
  ADD CONSTRAINT quotes_proformas_status_check 
  CHECK (status IN ('draft', 'pending_approval', 'approved', 'sent', 'accepted', 'declined', 'converted', 'rejected'));

-- 4. Workflow Approvals Queue Table
CREATE TABLE IF NOT EXISTS workflow_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  doc_type VARCHAR(50) NOT NULL, -- 'invoice', 'purchase', 'quote', 'journal', 'payment'
  doc_id UUID NOT NULL,
  doc_number VARCHAR(100) NOT NULL,
  amount_halalas BIGINT NOT NULL DEFAULT 0,
  requested_by VARCHAR(100) NOT NULL DEFAULT 'النظام',
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  notes TEXT,
  action_by VARCHAR(100),
  action_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_approvals_entity_status ON workflow_approvals(entity_id, status);

-- 5. Stock Transfers Table
CREATE TABLE IF NOT EXISTS stock_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  transfer_number VARCHAR(100) NOT NULL,
  from_warehouse VARCHAR(100) NOT NULL DEFAULT 'المستودع الرئيسي',
  to_warehouse VARCHAR(100) NOT NULL DEFAULT 'مستودع المعرض',
  transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status VARCHAR(50) NOT NULL DEFAULT 'completed' CHECK (status IN ('draft', 'pending', 'completed', 'cancelled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Stock Adjustments Table
CREATE TABLE IF NOT EXISTS stock_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  adjustment_number VARCHAR(100) NOT NULL,
  warehouse VARCHAR(100) NOT NULL DEFAULT 'المستودع الرئيسي',
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  system_qty NUMERIC(15, 3) NOT NULL,
  actual_qty NUMERIC(15, 3) NOT NULL,
  diff_qty NUMERIC(15, 3) NOT NULL,
  reason VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'posted' CHECK (status IN ('draft', 'pending', 'posted', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Document Sequences for new workflows
INSERT INTO doc_sequences (entity_id, doc_type, prefix, last_number)
SELECT id, 'quote', 'QUOT-', 100 FROM entities
ON CONFLICT (entity_id, doc_type) DO NOTHING;

INSERT INTO doc_sequences (entity_id, doc_type, prefix, last_number)
SELECT id, 'so', 'SO-', 100 FROM entities
ON CONFLICT (entity_id, doc_type) DO NOTHING;

INSERT INTO doc_sequences (entity_id, doc_type, prefix, last_number)
SELECT id, 'po', 'PO-', 100 FROM entities
ON CONFLICT (entity_id, doc_type) DO NOTHING;

INSERT INTO doc_sequences (entity_id, doc_type, prefix, last_number)
SELECT id, 'transfer', 'TRN-', 100 FROM entities
ON CONFLICT (entity_id, doc_type) DO NOTHING;
