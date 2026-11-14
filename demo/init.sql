-- WARNING: DEVELOPMENT DEMO ONLY. Never use these sample credentials in production.
CREATE ROLE mcp_admin NOLOGIN;
CREATE ROLE demo_admin LOGIN PASSWORD 'admin_demo_only';
CREATE ROLE demo_maker LOGIN PASSWORD 'maker_demo_only';
CREATE ROLE demo_viewer LOGIN PASSWORD 'viewer_demo_only';
GRANT mcp_admin TO demo_admin;

CREATE SCHEMA bedrijfsdata AUTHORIZATION demo_admin;
GRANT USAGE ON SCHEMA bedrijfsdata TO demo_maker, demo_viewer;

SET ROLE demo_admin;
CREATE TABLE bedrijfsdata.invoices (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  omschrijving text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  toegewezen_aan name NOT NULL,
  status text NOT NULL DEFAULT 'afwachtend',
  gecontroleerd boolean NOT NULL DEFAULT false
);
COMMENT ON TABLE bedrijfsdata.invoices IS 'Invoices; business rules reside in PostgreSQL.';
ALTER TABLE bedrijfsdata.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY maker_read ON bedrijfsdata.invoices
  FOR SELECT TO demo_maker USING (toegewezen_aan = current_user);
CREATE POLICY maker_insert ON bedrijfsdata.invoices
  FOR INSERT TO demo_maker WITH CHECK (toegewezen_aan = current_user);
CREATE POLICY viewer_read ON bedrijfsdata.invoices
  FOR SELECT TO demo_viewer USING (true);

GRANT SELECT (id, omschrijving, amount, toegewezen_aan, status)
  ON bedrijfsdata.invoices TO demo_maker;
GRANT INSERT (omschrijving, amount, toegewezen_aan)
  ON bedrijfsdata.invoices TO demo_maker;
GRANT SELECT (id, omschrijving, amount, status)
  ON bedrijfsdata.invoices TO demo_viewer;
RESET ROLE;
