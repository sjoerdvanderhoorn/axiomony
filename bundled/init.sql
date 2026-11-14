-- Executed once, only on a fresh bundled PostgreSQL data volume.
-- The platform_admin login is generated automatically by the official
-- postgres Docker image, from POSTGRES_USER / POSTGRES_PASSWORD_FILE.
-- This role gives the MCP authorization gate a database-native marker.
CREATE ROLE mcp_admin NOLOGIN;
GRANT mcp_admin TO platform_admin;
COMMENT ON ROLE mcp_admin IS 'Enables administrative MCP tools; SQL changes still execute as the logged-in PostgreSQL user.';

-- Don't create business tables or users without an explicit administrator request.
-- PostgreSQL itself remains the source of truth for all permissions and rules.
