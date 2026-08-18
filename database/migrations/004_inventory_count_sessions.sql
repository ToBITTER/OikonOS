BEGIN;
CREATE TABLE inventory_count_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  location_id uuid NOT NULL REFERENCES locations(id),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('draft','completed','cancelled')),
  reason text NOT NULL,
  product_count integer NOT NULL DEFAULT 0,
  variance_count integer NOT NULL DEFAULT 0,
  total_unit_variance numeric(14,3) NOT NULL DEFAULT 0,
  created_by uuid NOT NULL REFERENCES users(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX inventory_count_sessions_org_date_idx
  ON inventory_count_sessions(organization_id,completed_at DESC);

CREATE TABLE inventory_count_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES inventory_count_sessions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  recorded_quantity numeric(14,3) NOT NULL,
  counted_quantity numeric(14,3) NOT NULL,
  variance numeric(14,3) NOT NULL,
  movement_id uuid REFERENCES stock_movements(id),
  UNIQUE(session_id,product_id)
);
CREATE INDEX inventory_count_lines_product_idx
  ON inventory_count_lines(product_id,session_id);
COMMIT;
