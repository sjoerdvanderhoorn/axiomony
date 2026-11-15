<div align="center">
  <img src="docs/assets/axiomony-logo.png" alt="Axiomony" width="340">

  <h3>Shared rules. Individual freedom.</h3>

  <p><strong>One governed data foundation. An experience shaped by every user.</strong></p>

  <p>
    <a href="https://sjoerdvanderhoorn.github.io/axiomony/">Website</a> ·
    <a href="https://sjoerdvanderhoorn.github.io/axiomony/getting-started.html">Get started</a> ·
    <a href="https://sjoerdvanderhoorn.github.io/axiomony/connect.html">Connect an AI</a> ·
    <a href="https://sjoerdvanderhoorn.github.io/axiomony/tools.html">MCP tools</a> ·
    <a href="ROADMAP.md">Roadmap</a>
  </p>

  <p><a href="https://github.com/sjoerdvanderhoorn/axiomony/actions/workflows/tests.yml"><img src="https://github.com/sjoerdvanderhoorn/axiomony/actions/workflows/tests.yml/badge.svg" alt="Node.js tests"></a></p>
</div>

> **Development preview · v0.5.1.** Axiomony is experimental self-hosted software, not ready for production. Its current authentication is intended for controlled local use only. [Read the security limitations](https://sjoerdvanderhoorn.github.io/axiomony/concepts.html#security).

## Build the software your team actually needs

Traditional business software separates the frontend, backend, and database. Even schema-first and low-code platforms impose choices about how applications look, behave, and integrate. Changing those choices often means specialist developers, lengthy projects, or expensive vendor requests.

**Axiomony takes a different approach.** Your organization defines its data, access permissions, and business rules once. Then each person or department uses an AI assistant to shape the forms, reports, dashboards, integrations, and user experience they need.

**The database—not the interface—decides what is allowed.**

*Standardize the data and the rules, not the user interface.*

## Why Axiomony?

- **Own your experience.** Design the interface and workflow around your job instead of fitting your work into a vendor's screens.
- **One shared source of truth.** Keep data relationships, permissions, and business rules in a single governed database.
- **Describe changes to an AI.** Authorized administrators can request a new table, permission, or business rule in natural language, review the proposed change, and explicitly approve it.
- **Enforce permissions at the source.** User-created applications cannot grant themselves extra database rights.
- **Adapt when work changes.** Give teams the freedom to prototype their own improvements rather than waiting for a vendor roadmap.

### Imagine what your team could build

| Team | A tailored experience |
| --- | --- |
| Purchasing | A phone-friendly tool to capture and register supplier invoices |
| Finance | A reconciliation dashboard or a bank integration using an approved banking API |
| Operations | A specialized checklist and workflow |
| Management | A personalized overview of the information their role may access |

These are **illustrative scenarios**, not prebuilt Axiomony apps. Working mobile interfaces, banking integrations, and standalone browser apps require additional secure runtimes or services.

## How Axiomony works

~~~text
          Your AI assistant
                 |
            Axiomony MCP
            /          \
   Govern data & rules   Use permitted data
   (admin approval)      (per-user access)
            \          /
            Shared database
       Data · Access · Rules
                 |
         Your own experiences
     Forms · Reports · Workflows
~~~

Two types of MCP tools handle different responsibilities:

1. **Data MCP** — Discover accessible tables and columns, explain permissions, and read or modify records with the signed-in database user's permissions.
2. **Administration MCP** — Propose changes to the real database schema and rules with an internal AI planner. An authorized administrator reviews the SQL and must explicitly approve it before anything changes.

**Current implementation:** Axiomony uses a Node.js Streamable HTTP MCP server and **PostgreSQL** as the authoritative database. PostgreSQL grants, row-level security, constraints, and triggers enforce the actual permissions and business logic. [Read the architecture overview](https://sjoerdvanderhoorn.github.io/axiomony/concepts.html).

## Quick start

Requires Docker Engine and Docker Compose. The startup script uses a POSIX shell.

~~~sh
git clone https://github.com/sjoerdvanderhoorn/axiomony.git
cd axiomony
cp .env.example .env
# Edit PGDATABASE in .env. OPENAI_API_KEY enables AI-assisted administration.
./scripts/start.sh bundled
~~~

This starts the MCP service, bundled database, and compatibility REST service. The local endpoint is **http://127.0.0.1:3000/mcp**.

To display the generated **local-only** bootstrap administrator credentials:

~~~sh
./scripts/show-credentials.sh
curl http://127.0.0.1:3000/health
~~~

For an existing PostgreSQL server, follow the [external database installation guide](https://sjoerdvanderhoorn.github.io/axiomony/getting-started.html).

> **Local testing only:** The MCP service currently authenticates using reusable database credentials over HTTP Basic. Do not expose the service to the public internet. Production OAuth/OIDC and secure browser sessions are not implemented.

## Connect an AI client

Use an MCP client that supports local Streamable HTTP and the required HTTP Basic authentication.

| Setting | Development value |
| --- | --- |
| Endpoint | `http://127.0.0.1:3000/mcp` |
| Transport | Stateless Streamable HTTP (POST) |
| Authentication | HTTP Basic with the user's PostgreSQL credentials |
| Tools | Dynamically determined by database privileges |

You can check which tools a local account can access:

~~~sh
curl -sS -u platform_admin:'YOUR_PASSWORD' -H 'Accept: application/json, text/event-stream' -H 'Content-Type: application/json' -X POST http://127.0.0.1:3000/mcp -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
~~~

Not all hosted AI assistants support the authentication method used in this prototype. [Read the client connection guide](https://sjoerdvanderhoorn.github.io/axiomony/connect.html).

## What works today?

| Capability | Status |
| --- | --- |
| Discover accessible data models | Available |
| Select, insert, update, and delete records | Available; enforced database permissions |
| Explain grants, policies, and constraints | Available; explanations are best-effort |
| Propose and explicitly approve database changes | Available; administrator-only and in-memory plans |
| Publish user-owned static HTML/CSS/JS | Optional; pages are publicly readable |
| Legacy REST integration | Included for compatibility |
| Secure hosted AI login and browser-to-MCP runtime | Not implemented |
| Production-ready deployment and end-to-end verification | Not completed |

Optional static hosting tools require `APP_HOSTING_ENABLED=true`. Legacy REST MCP helpers require `REST_MCP_TOOLS=true`. The tools each account sees depend on its permissions.

## Documentation

- [Installation](https://sjoerdvanderhoorn.github.io/axiomony/getting-started.html) — bundled and external database setup
- [Connect an AI](https://sjoerdvanderhoorn.github.io/axiomony/connect.html) — transport, credentials, and client constraints
- [MCP tool reference](https://sjoerdvanderhoorn.github.io/axiomony/tools.html) — available tools and eligibility
- [Architecture & security](https://sjoerdvanderhoorn.github.io/axiomony/concepts.html) — permission enforcement and known limitations
- [Roadmap](ROADMAP.md) — development priorities and future database research

## Develop and contribute

Node.js **22+** is required to run the server and tests without Docker:

~~~sh
npm install
npm test
~~~

Automated tests do not yet provide complete Docker, database, or hosted-client integration coverage. Please [open an issue](https://github.com/sjoerdvanderhoorn/axiomony/issues) to discuss a feature or report a bug before submitting substantial changes.

**Security:** Axiomony is not yet a production security boundary. Do not put secrets in generated frontend code or Git, deploy this prototype publicly, or use the bundled database superuser for ordinary work. Database permissions help contain untrusted interfaces, but compromised credentials remain dangerous. [Read more](https://sjoerdvanderhoorn.github.io/axiomony/concepts.html#security).

---

**Axiomony — Shared rules. Individual freedom.**
