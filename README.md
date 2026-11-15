# Axiomony

![Axiomony logo — structured shared core, flexible individual experiences](docs/assets/axiomony-logo.png)

> **Shared rules. Individual freedom.**

**Every employee designs their own user experience.** With Axiomony, each employee can—and is encouraged to—use their own AI agent to create, personalize, and continually improve the screens, forms, dashboards, reports, and workflows they use. Rather than conforming to a standard interface, they shape every aspect of their UX to fit their exact tasks, requirements, wishes, and personal preferences. The organization defines the shared data and binding business rules; individuals decide how to work within those rules.

**Documentation:** [Axiomony website](https://sjoerdvanderhoorn.github.io/axiomony/) · [Full roadmap](ROADMAP.md)

Axiomony is an early-stage Node.js Model Context Protocol (MCP) server that lets organizations define real PostgreSQL data models, permissions, and business rules, while each employee is free to create a task-specific user experience with their own AI assistant.

> **Status: development prototype (v0.5.1). Not ready for public deployment.** Authentication currently uses PostgreSQL credentials over HTTP Basic. Do not expose this service directly to the internet. Docker deployment has not yet been tested end-to-end.

## Why Axiomony exists

AI assistants have largely focused on answering individual questions or helping developers write software. Making knowledge and expertise available to everyone is transformative. Helping developers build faster is useful, but it is only a stepping stone: the greater opportunity is to let the people who understand the work shape the tools they use.

Traditional software development separates the frontend, backend, and database. Schema-first and low-code tools can generate much of an application from a data model, but organizations still inherit their vendors' assumptions about interfaces, workflows, and integrations. Building or substantially changing business software typically takes expertise across all three layers, as well as people who can translate operational needs into technical requirements. Developers must make compromises to serve everyone from the shop floor to the boardroom. When an important requirement is missed, or a new opportunity appears, revisiting those choices can be slow and expensive.

**Axiomony is designed to remove these barriers.** From day one, someone who understands the organization can use their own AI assistant—ChatGPT, Gemini, Claude, or another compatible agent—to define the data that drives the business and the rules that govern it: who may view or change what, under which conditions, when, and why. Authorized administrators review proposed changes before Axiomony implements them as actual PostgreSQL tables, relationships, privileges, policies, constraints, and triggers. PostgreSQL remains the source of truth, not an application-specific set of rules that other clients can bypass.

**Then each person or department creates the experience they need.** Purchasing might ask an AI to make a phone-friendly tool for scanning and recording supplier invoices. Finance might build a bank integration using an approved banking API and properly authorized credentials, without waiting for a vendor to add a screen or plugin. Another team might create its own dashboard, report, or focused workflow. These tools can look and behave differently while sharing the same governed data.

A generated interface does not get to redefine its user's permissions. PostgreSQL enforces access and business rules for every data operation, even when an interface is faulty or untrusted. A compromised account or stolen credentials are still a security risk, so secure authentication, secret handling, and deployment remain essential.

**The promise of Axiomony is operational autonomy within shared rules.** Teams can improve processes as soon as they identify a better approach. Someone new to the organization can start prototyping a useful idea in minutes instead of joining a long feature-request queue. The goal is to let the business evolve at the pace of its people—not at the pace of a software vendor's roadmap.

**Standardize the data and the rules, not the user interface.**

## Architecture

Axiomony provides two types of MCP capabilities over a Node.js Streamable HTTP server:

- **Data MCP:** fixed tools to discover accessible schemas and tables, explain permissions, and select, insert, update, or delete records. Every operation connects to PostgreSQL with the authenticated user's own credentials. PostgreSQL GRANTs, row-level security, column privileges, constraints, and triggers remain authoritative.
- **Administration MCP:** only visible to PostgreSQL superusers or members of `mcp_admin`. `manage_database` accepts plain English (or another natural language), and the server calls an **internal OpenAI model** to prepare SQL migrations. An administrator must explicitly approve a pending plan via `implement_plan`. Plans remain in process memory and are not applied before approval.

Optional components include:

- **Bundled PostgreSQL 17** for easy local setup, or an **external PostgreSQL** server.
- **Nginx Unprivileged** for publishing a user's own static HTML, CSS, JavaScript, and assets. Enabled with `APP_HOSTING_ENABLED=true`.
- A legacy **PostgREST** service for explicitly REST-based clients. Its MCP helpers are hidden by default and are not the recommended data path for new AI-generated task pages.

### Data path for user-created applications

The preferred path is **trusted AI/MCP client → Data MCP → PostgreSQL**. Do **not** embed PostgreSQL passwords or bearer tokens in generated HTML/JS. Static pages served by Nginx cannot by themselves securely perform authenticated database operations. A standalone browser app needs a trusted server-side MCP runtime or a secure application backend with user sessions. **That browser-to-MCP bridge is not implemented in this prototype.**

## Requirements

- Docker Engine and Docker Compose for container deployment.
- Node.js 22 or newer for running locally without Docker.
- An `OPENAI_API_KEY` only if you want natural-language administration.

## Start with bundled PostgreSQL

```sh
cp .env.example .env
# Set PGDATABASE in .env; optionally set OPENAI_API_KEY.
./scripts/start.sh bundled
```

This starts the Node.js MCP service, a PostgreSQL 17 database, and the backwards-compatible PostgREST service. PostgreSQL data persists in a Docker volume. PostgreSQL's TCP port is not exposed to the host.

The first startup generates a random PostgreSQL bootstrap password in `.local/postgres_bootstrap_password`. Only the database container receives it as a Docker secret; the MCP container does not. To display the initial local admin account (`platform_admin`) and password:

```sh
./scripts/show-credentials.sh
```

**Warning:** `platform_admin` is the bootstrap superuser. It is suitable only for a controlled local prototype, not production AI-managed DDL. Create least-privilege administrator roles before wider use.

## Start against an external PostgreSQL server

```sh
cp .env.example .env
# Configure PGHOST, PGPORT, PGDATABASE, and (if appropriate) PGSSL=true.
./scripts/bootstrap-external-rest.sh YOUR_DBA_USERNAME
./scripts/start.sh external
```

The bootstrap script prepares a limited PostgREST authenticator account. It prompts for a DBA password interactively and does not store it in `.env`. The MCP service has no shared PostgreSQL login: every MCP request authenticates using the end user's PostgreSQL username and password supplied in the HTTP Basic Authorization header.

The external PostgreSQL server must allow connections from the Docker network. Configure PostgreSQL host-based authentication securely (prefer SCRAM-SHA-256). Do not use `trust` authentication for remotely reachable connections.

### Service endpoints

| Service | Local URL |
| --- | --- |
| Health | `http://127.0.0.1:3000/health` |
| MCP | `http://127.0.0.1:3000/mcp` |
| Legacy PostgREST API | `http://127.0.0.1:3001/` |
| Legacy REST token endpoint | `http://127.0.0.1:3000/auth/token` |
| Optional static hosting | `http://127.0.0.1:8088/apps/...` |

Example request to list the tools available to the authenticated PostgreSQL account:

```sh
curl -sS -u platform_admin:'YOUR_PASSWORD' \
  -H 'Accept: application/json, text/event-stream' \
  -H 'Content-Type: application/json' \
  -X POST http://127.0.0.1:3000/mcp \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

This example is for localhost only. In a public deployment, HTTP Basic over the network would be dangerous even with transport encryption because the client retains reusable database credentials. Public MCP clients typically need OAuth/OIDC support, which is not implemented here.

## MCP tools and privileges

Tools are discovered dynamically per authenticated request. Merely seeing a tool does not grant blanket access: PostgreSQL verifies all privileges again when each operation executes.

| Tool | Purpose | Eligibility |
| --- | --- | --- |
| `whoami` | Current database user and available operations | Authenticated PostgreSQL login |
| `list_tables` | Accessible tables and table permissions | Authenticated login; metadata is filtered by database privileges |
| `describe_table` | Visible columns and permissions for a selected table | Actual PostgreSQL relation/column access |
| `explain_permissions` | Describe grants, RLS, triggers, constraints, and optionally SELECT visibility | Authenticated login; never proves arbitrary write access |
| `app_integration_guide` | Guide AI clients to Data-MCP-based application integration | Authenticated login |
| `select_records` | Filtered SELECT, maximum 100 records | Relevant SELECT privileges |
| `insert_record` | Insert a single row | Relevant INSERT privileges |
| `update_records` | Filtered UPDATE with row-count cap | Relevant UPDATE and filter-column privileges |
| `delete_records` | Filtered DELETE with row-count cap | Relevant DELETE and filter-column privileges |
| `inspect_database` | Inspect actual database catalog and rules | `mcp_admin` or superuser |
| `manage_database` | Propose a natural-language database change via internal LLM | `mcp_admin` or superuser |
| `review_plan` | View pending SQL and warnings | Same administrator and valid pending plan |
| `implement_plan` | Execute an explicitly confirmed migration | Same administrator, valid plan, `confirm=true`, and actual PostgreSQL DDL privileges |
| `cancel_plan` | Discard an in-memory migration plan | Same administrator and valid pending plan |

With `REST_MCP_TOOLS=true`, the optional legacy tools `rest_api_guide`, `rest_relationships`, and `generate_rest_request` become visible. Those generate REST integration guidance; `generate_rest_request` does not run a query.

### Two-phase administration

1. The AI client sends a natural-language request to `manage_database`.
2. Axiomony inspects the actual PostgreSQL catalog and calls its internal LLM with privileged PostgreSQL-specific planning instructions.
3. The resulting SQL is checked by the server and saved in an **in-memory map** with a random plan ID, expiration time, user identity, and database fingerprint. **No SQL is written to the database at this stage.**
4. The client may call `review_plan` to examine the summary, warnings, and SQL.
5. After explicit human approval, `implement_plan` with `plan_id` and `confirm: true` attempts the migration using the authenticated administrator's PostgreSQL privileges. `cancel_plan` discards an unimplemented plan.

Pending plans expire after 20 minutes by default and disappear if the container restarts. The current SQL validator is not a full security sandbox. Never allow unattended migrations on a production database.

## Optional static site hosting

A ready-made `nginx/nginx-unprivileged:stable-alpine` container serves only static content. Nginx mounts the published files read-only. The MCP service writes files under a persistent storage volume.

Enable in `.env`:

```ini
APP_HOSTING_ENABLED=true
APP_PUBLIC_URL=http://localhost:8088
APP_BIND_ADDRESS=127.0.0.1
APP_PORT=8088
APP_MAX_FILE_BYTES=1048576
MAX_BODY_BYTES=2097152
```

Start normally with `./scripts/start.sh bundled` or `./scripts/start.sh external`. The start script includes `compose.hosting.yml` only when enabled. When manually using Docker Compose, include `-f compose.hosting.yml`.

Published files are isolated by the **authenticated PostgreSQL username**, never by a caller-controlled username. Example storage tree:

```text
published_sites/
└── alice/
    ├── invoices/
    │   ├── index.html
    │   ├── css/style.css
    │   └── js/app.js
    └── reports/
        └── index.html
```

Published URL example: `http://localhost:8088/apps/alice/invoices/index.html`.

| Tool | Function | Who can use it? |
| --- | --- | --- |
| `site_list` | List own projects, subdirectories, files, and URLs | Any logged-in PostgreSQL user |
| `site_read_file` | Read own file and SHA-256 hash | Own published files |
| `site_create_file` | Create a new file (and missing subdirectories) | Own user directory |
| `site_update_file` | Replace an existing file using `expected_sha256` | Own files, matching hash |
| `site_delete_file` | Delete own file | Own files |
| `site_delete_project` | Delete entire own project | Own project and `confirm=true` |

Supported extensions include HTML, CSS, JS, JSON, TXT, SVG, PNG, JPEG, GIF, WEBP, ICO, WOFF/WOFF2, and source maps. Text is UTF-8; binary assets use base64. Path traversal, hidden files, and symlinks are rejected. Defaults: 20 projects, 300 files, 20 MiB total, and 1 MiB per file per user.

**Important:** static pages are **publicly readable** by anyone who can access the hosting URL. PostgreSQL authentication protects *editing*, not *viewing*. Never publish secrets or sensitive business data as static assets. Public deployments require domain isolation, HTTPS, audit logs, rate limits, abuse protection, and stronger browser/security controls.

## Run tests

```sh
npm install
npm test
```

All existing unit tests run without a live database. The code is early-stage and has **not** been validated end-to-end with running Docker, Nginx, PostgreSQL, and a hosted AI client.

## Environment variables

See [`.env.example`](.env.example). Important groups include `PGHOST`, `PGPORT`, `PGDATABASE`, `PGSSL` for PostgreSQL; `OPENAI_API_KEY`, `OPENAI_MODEL`, `PLAN_TTL_MINUTES` for the administration planner; `APP_HOSTING_ENABLED` and `APP_PUBLIC_URL` for site hosting; and `REST_MCP_TOOLS` for hidden legacy REST helpers.

Do **not** put per-user database passwords into `.env`. Keep `.env`, `.local/`, Docker secrets, and all credentials out of version control. Only `.env.example` is committed.

## Security limitations

- **Authentication:** HTTP Basic relays reusable PostgreSQL credentials for each MCP request. Public use requires HTTPS, OAuth/OIDC integration, client security controls, brute-force protection, and audit logging.
- **Authorization:** role-aware tool discovery is only a convenience; the effective PostgreSQL role, GRANTs, row policies, constraints, and triggers must enforce all data permissions.
- **Administration:** generated SQL has limited static checks only. It needs robust parsing, policy validation, sandboxed preview/testing in a cloned database, explicit approval, and durable migration audit before production deployment.
- **Permissions explanations:** `explain_permissions` inspects database objects and can perform safe SELECT probes but cannot statically prove the effect of arbitrary user-written PL/pgSQL triggers or functions.
- **Sessions:** migration plans are ephemeral, in memory, and not shared between replicas.
- **Application hosting:** the Nginx host is public static hosting, not a secure application runtime. Browser-to-Data-MCP authentication and authorization still need to be implemented.
- **Legacy REST:** PostgREST is retained for compatibility, but new AI-generated applications should not use it directly by default.
- **Database accounts:** do not let an LLM generate user passwords. Create PostgreSQL LOGIN roles in a controlled administrative workflow outside this prototype.

Axiomony is early-stage infrastructure, not a finished SaaS or a production security boundary.

### Local demo credentials

`demo/init.sql` contains predictable example passwords strictly for local demonstrations. Never reuse them or expose a demo database publicly.

## Roadmap: other database engines

PostgreSQL is currently the **only implemented database backend**. Future research will assess whether MariaDB, MySQL Community Server, Microsoft SQL Server, and Firebird can enforce equivalent table, row, column, cell-dependent and workflow permissions **inside the database engine**. SQLite is a lower-priority fit because it has no database user accounts or SQL `GRANT`/`REVOKE`.

The key distinction is that column grants and DML triggers alone do **not** secure row-dependent `SELECT` results. Every future engine must demonstrate secure read *and* write behavior, independent of generated frontends or MCP authorization checks. No alternative engine support has been implemented.

See [ROADMAP.md](ROADMAP.md) for the research comparison, limitations, source references and acceptance criteria.
