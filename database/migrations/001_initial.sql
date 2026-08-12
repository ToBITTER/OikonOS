BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE membership_role AS ENUM ('owner','admin','manager','seller','accountant','inventory_manager');
CREATE TYPE record_status AS ENUM ('active','archived');
CREATE TYPE stock_movement_type AS ENUM ('opening','purchase','sale','return_in','return_out','adjustment','transfer_in','transfer_out','damage');
CREATE TYPE sale_status AS ENUM ('draft','completed','partially_refunded','refunded','voided');
CREATE TYPE payment_method AS ENUM ('cash','card','transfer','mobile_money','credit','other');
CREATE TYPE payment_status AS ENUM ('pending','completed','failed','refunded','partially_refunded');
CREATE TYPE purchase_status AS ENUM ('draft','ordered','partially_received','received','cancelled');

CREATE TABLE users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL, password_hash text NOT NULL,
 first_name text NOT NULL, last_name text NOT NULL, phone text, email_verified_at timestamptz,
 status record_status NOT NULL DEFAULT 'active', last_login_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

CREATE TABLE organizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text NOT NULL UNIQUE, legal_name text,
 currency char(3) NOT NULL DEFAULT 'NGN', timezone text NOT NULL DEFAULT 'Africa/Lagos', country_code char(2) NOT NULL DEFAULT 'NG',
 tax_id text, logo_url text, status record_status NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE organization_memberships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), user_id uuid NOT NULL REFERENCES users(id),
 role membership_role NOT NULL, permissions jsonb NOT NULL DEFAULT '[]', invited_by uuid REFERENCES users(id), joined_at timestamptz NOT NULL DEFAULT now(),
 status record_status NOT NULL DEFAULT 'active', UNIQUE(organization_id,user_id)
);
CREATE INDEX memberships_user_idx ON organization_memberships(user_id,status);

CREATE TABLE locations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), name text NOT NULL,
 address jsonb NOT NULL DEFAULT '{}', phone text, is_default boolean NOT NULL DEFAULT false, status record_status NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,name)
);
CREATE TABLE categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), name text NOT NULL, parent_id uuid REFERENCES categories(id), status record_status NOT NULL DEFAULT 'active', UNIQUE(organization_id,name));
CREATE TABLE products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), category_id uuid REFERENCES categories(id),
 name text NOT NULL, sku text NOT NULL, barcode text, description text, selling_price numeric(19,4) NOT NULL CHECK(selling_price>=0),
 cost_price numeric(19,4) NOT NULL CHECK(cost_price>=0), tax_rate numeric(7,4) NOT NULL DEFAULT 0, track_inventory boolean NOT NULL DEFAULT true,
 status record_status NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,sku)
);
CREATE UNIQUE INDEX products_barcode_unique ON products(organization_id,barcode) WHERE barcode IS NOT NULL;
CREATE TABLE inventory_levels (
 organization_id uuid NOT NULL REFERENCES organizations(id), location_id uuid NOT NULL REFERENCES locations(id), product_id uuid NOT NULL REFERENCES products(id),
 quantity numeric(19,4) NOT NULL DEFAULT 0, reserved_quantity numeric(19,4) NOT NULL DEFAULT 0, reorder_level numeric(19,4) NOT NULL DEFAULT 0,
 average_cost numeric(19,4) NOT NULL DEFAULT 0, version integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(location_id,product_id), CHECK(quantity>=0), CHECK(reserved_quantity>=0), CHECK(reserved_quantity<=quantity)
);

CREATE TABLE customers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), first_name text NOT NULL, last_name text,
 email text, phone text, address jsonb NOT NULL DEFAULT '{}', notes text, status record_status NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX customers_org_search_idx ON customers(organization_id,first_name,last_name);
CREATE TABLE suppliers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), name text NOT NULL,
 contact_name text, email text, phone text, address jsonb NOT NULL DEFAULT '{}', payment_terms text, status record_status NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE register_shifts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), location_id uuid NOT NULL REFERENCES locations(id),
 opened_by uuid NOT NULL REFERENCES users(id), closed_by uuid REFERENCES users(id), opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz,
 opening_cash numeric(19,4) NOT NULL DEFAULT 0, expected_cash numeric(19,4), closing_cash numeric(19,4), notes text
);
CREATE UNIQUE INDEX one_open_shift_per_user ON register_shifts(organization_id,location_id,opened_by) WHERE closed_at IS NULL;
CREATE TABLE sales (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), location_id uuid NOT NULL REFERENCES locations(id),
 shift_id uuid REFERENCES register_shifts(id), receipt_number bigint GENERATED ALWAYS AS IDENTITY, seller_id uuid NOT NULL REFERENCES users(id), customer_id uuid REFERENCES customers(id),
 status sale_status NOT NULL DEFAULT 'draft', subtotal numeric(19,4) NOT NULL, discount_total numeric(19,4) NOT NULL DEFAULT 0,
 tax_total numeric(19,4) NOT NULL DEFAULT 0, total numeric(19,4) NOT NULL, cost_total numeric(19,4) NOT NULL,
 notes text, completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,receipt_number)
);
CREATE INDEX sales_org_completed_idx ON sales(organization_id,completed_at DESC);
CREATE TABLE sale_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sale_id uuid NOT NULL REFERENCES sales(id), product_id uuid NOT NULL REFERENCES products(id),
 product_name text NOT NULL, sku text NOT NULL, quantity numeric(19,4) NOT NULL CHECK(quantity>0), unit_price numeric(19,4) NOT NULL,
 unit_cost numeric(19,4) NOT NULL, discount numeric(19,4) NOT NULL DEFAULT 0, tax numeric(19,4) NOT NULL DEFAULT 0, line_total numeric(19,4) NOT NULL
);
CREATE TABLE payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), sale_id uuid REFERENCES sales(id),
 method payment_method NOT NULL, status payment_status NOT NULL DEFAULT 'pending', amount numeric(19,4) NOT NULL CHECK(amount>0),
 provider text, provider_reference text, idempotency_key text NOT NULL, metadata jsonb NOT NULL DEFAULT '{}', received_by uuid REFERENCES users(id),
 completed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,idempotency_key)
);
CREATE TABLE refunds (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), sale_id uuid NOT NULL REFERENCES sales(id),
 payment_id uuid REFERENCES payments(id), amount numeric(19,4) NOT NULL CHECK(amount>0), reason text NOT NULL, status payment_status NOT NULL DEFAULT 'pending',
 authorized_by uuid NOT NULL REFERENCES users(id), processed_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE TABLE refund_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), refund_id uuid NOT NULL REFERENCES refunds(id), sale_item_id uuid NOT NULL REFERENCES sale_items(id), quantity numeric(19,4) NOT NULL CHECK(quantity>0), restock boolean NOT NULL DEFAULT true);

CREATE TABLE purchases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), location_id uuid NOT NULL REFERENCES locations(id),
 supplier_id uuid NOT NULL REFERENCES suppliers(id), purchase_number bigint GENERATED ALWAYS AS IDENTITY, status purchase_status NOT NULL DEFAULT 'draft',
 subtotal numeric(19,4) NOT NULL DEFAULT 0, tax_total numeric(19,4) NOT NULL DEFAULT 0, total numeric(19,4) NOT NULL DEFAULT 0,
 amount_paid numeric(19,4) NOT NULL DEFAULT 0, expected_at date, received_at timestamptz, created_by uuid NOT NULL REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,purchase_number)
);
CREATE TABLE purchase_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), purchase_id uuid NOT NULL REFERENCES purchases(id), product_id uuid NOT NULL REFERENCES products(id), quantity_ordered numeric(19,4) NOT NULL CHECK(quantity_ordered>0), quantity_received numeric(19,4) NOT NULL DEFAULT 0, unit_cost numeric(19,4) NOT NULL CHECK(unit_cost>=0), line_total numeric(19,4) NOT NULL);

CREATE TABLE stock_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), location_id uuid NOT NULL REFERENCES locations(id),
 product_id uuid NOT NULL REFERENCES products(id), type stock_movement_type NOT NULL, quantity numeric(19,4) NOT NULL CHECK(quantity<>0),
 unit_cost numeric(19,4), balance_after numeric(19,4) NOT NULL, reference_type text, reference_id uuid, reason text,
 performed_by uuid NOT NULL REFERENCES users(id), occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX stock_movements_lookup_idx ON stock_movements(organization_id,product_id,location_id,occurred_at DESC);
CREATE TABLE expense_categories (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), name text NOT NULL, status record_status NOT NULL DEFAULT 'active', UNIQUE(organization_id,name));
CREATE TABLE expenses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations(id), location_id uuid REFERENCES locations(id),
 category_id uuid NOT NULL REFERENCES expense_categories(id), description text NOT NULL, amount numeric(19,4) NOT NULL CHECK(amount>0),
 expense_date date NOT NULL, payment_method payment_method NOT NULL, vendor text, receipt_url text, recorded_by uuid NOT NULL REFERENCES users(id),
 status record_status NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE refresh_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), organization_id uuid NOT NULL REFERENCES organizations(id),
 token_hash text NOT NULL UNIQUE, user_agent text, ip_address inet, expires_at timestamptz NOT NULL, revoked_at timestamptz,
 replaced_by uuid REFERENCES refresh_sessions(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_active_idx ON refresh_sessions(user_id,expires_at) WHERE revoked_at IS NULL;
CREATE TABLE audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid REFERENCES organizations(id), actor_id uuid REFERENCES users(id),
 action text NOT NULL, entity_type text NOT NULL, entity_id uuid, before_data jsonb, after_data jsonb, ip_address inet,
 user_agent text, request_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_org_time_idx ON audit_events(organization_id,created_at DESC);
CREATE TABLE idempotency_keys (
 organization_id uuid NOT NULL REFERENCES organizations(id), key text NOT NULL, route text NOT NULL, request_hash text NOT NULL,
 response_code integer, response_body jsonb, locked_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
 PRIMARY KEY(organization_id,key)
);

COMMIT;
