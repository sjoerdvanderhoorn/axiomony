# Axiomony roadmap

> Shared rules. Individual freedom.

Axiomony enforces access, data integrity, and business rules in the **database engine**. The MCP server may inspect and change real database objects but must never substitute a standalone middleware permission system.

## Current implementation

**PostgreSQL only**: per-user PostgreSQL authentication, database grants, row-level security policies, constraints, triggers, functions, catalog introspection and natural-language SQL migration proposals with explicit human confirmation.

The current release is a **development preview, not production-ready**. Authentication hardening, securely connected personal browser applications, migration safety, auditing and end-to-end Docker testing come first.

## Future database engines — research only

| Engine | License | Native database features useful to Axiomony | Important difference | Status |
| --- | --- | --- | --- | --- |
| **MariaDB** | Open source | Column-level GRANT; SQL SECURITY DEFINER / INVOKER views; WITH CHECK OPTION; triggers and routines | No equivalent of PostgreSQL's native RLS policy system. Secure row-filtered reads require restrictive views with underlying base tables inaccessible to clients. | Feasibility research |
| **MySQL Community** | Open source, GPL | Column-level GRANT; security-context views, CHECK OPTION, BEFORE/AFTER DML triggers, routines | No equivalent native RLS policies. Triggers protect writes, not SELECT; per-cell read restrictions require carefully designed views. | Feasibility research |
| **Microsoft SQL Server** | **Proprietary**; free Express edition | Native row-level security using filter and block predicates, column grants, T-SQL functions and triggers | A different identity, catalog and SQL dialect; no single built-in arbitrary cell-permission mechanism. Licensing must be considered. | Feasibility research |
| **Firebird** | Open source | Roles and privileges, column-level UPDATE, SQL SECURITY INVOKER/DEFINER routines, views and triggers | No matching built-in RLS policy framework identified; view/procedure isolation would need verification. | Feasibility research |
| **SQLite** | Public domain | Constraints, views, row triggers | Embedded engine, no per-user SQL GRANT / REVOKE or database login roles. It does not meet the current database-enforced user-permissions requirement on its own. | Deferred |

**Important:** A trigger can reject INSERT, UPDATE or DELETE based on old/new row values, but a trigger alone cannot hide unauthorized values returned by SELECT. Future adapters must protect *reads and writes* using database-native enforcement, including records and columns that differ per user.

## Portability acceptance criteria

1. Database-level authentication and authorization for each actual user; no privilege elevation by the MCP transport.
2. Correct table, row, column and cell-dependent read restrictions under direct SQL access.
3. Per-user conditional writes and business workflow constraints enforced independently of generated interfaces.
4. Inspectable live grants, policies, views, triggers, stored functions and dependencies.
5. Engine-specific migration planning with human confirmation, transaction semantics and safe rollback strategies.
6. Automated conformance tests across users, rows and columns, including adversarial direct SQL.
7. Adapter isolation for identity, SQL dialect, catalog inspection, migrations, and capability discovery; never silently downgrade security.

## Immediate priorities

- OAuth/OIDC-compatible authentication and secure per-user PostgreSQL sessions.
- A trusted, authenticated server-side bridge between published apps and Data-MCP.
- Robust SQL parsing, isolated migration tests and a durable audit trail.
- Docker integration tests and deployment hardening.

## Official source documentation

- [MariaDB: GRANT and column privileges](https://mariadb.com/docs/server/reference/sql-statements/account-management-sql-statements/grant)
- [MariaDB: security-context views](https://mariadb.com/docs/server/server-usage/views/create-view)
- [MariaDB: row-level restrictions through views](https://mariadb.com/docs/server/mariadb-quickstart-guides/mariadb-views-guide)
- [MySQL 8.4: GRANT](https://dev.mysql.com/doc/refman/8.4/en/grant.html)
- [MySQL 8.4: CREATE VIEW](https://dev.mysql.com/doc/refman/8.4/en/create-view.html)
- [MySQL 8.4: triggers](https://dev.mysql.com/doc/refman/8.4/en/triggers.html)
- [SQL Server: row-level security](https://learn.microsoft.com/en-us/sql/relational-databases/security/row-level-security?view=sql-server-ver17)
- [SQL Server: column permissions](https://learn.microsoft.com/en-us/sql/relational-databases/security/permissions-database-engine?view=sql-server-ver17)
- [SQL Server: licensing](https://www.microsoft.com/licensing/guidance/sql)
- [Firebird: GRANT](https://www.firebirdsql.org/file/documentation/chunk/en/refdocs/fblangref30/fblangref30-security-granting.html)
- [Firebird: SQL SECURITY](https://github.com/FirebirdSQL/firebird-documentation/blob/master/src/docs/asciidoc/en/refdocs/fblangref60/security/_langref-security-sql-security.adoc)
- [SQLite: unsupported GRANT/REVOKE](https://www.sqlite.org/omitted.html)

None of these additional backends are implemented or committed to a delivery date.
