# Job Tracker

A modern full-stack Job Application Tracker built with **Next.js 16** (App Router), **React 19**, **TypeScript**, and **MongoDB Atlas**.

## Features

- **Application Queue & Follow-up Tracking:** Automatically tracks application statuses and alerts you when follow-ups are due or overdue.
- **Dynamic Ledger:** Full search and filtering by company, role, source, and status with responsive table-to-card mobile view.
- **Full-Stack Next.js:** Route handlers and data access layer operating directly inside Next.js with connection pooling for MongoDB Atlas.
- **Zero Native Dependencies:** Uses pure JavaScript/TypeScript driver (`mongodb`) for portability across platforms.

## Getting Started

### 1. Configure Environment Variables

Copy `.env.example` to `.env.local` and add your MongoDB Atlas connection string:

```bash
cp .env.example .env.local
```

Inside `.env.local`:

```env
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mongodb.net/job-tracker?retryWrites=true&w=majority
MONGODB_DB=job-tracker
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Tech Stack

- **Framework:** Next.js 16 (Turbopack, App Router)
- **UI:** React 19, Vanilla CSS Design System with light/dark theme support
- **Database:** MongoDB Atlas via official `mongodb` driver
- **Typography:** Inter & IBM Plex Mono via `next/font/google`

## Phase 1: private owner access

Website login uses Auth0 with the Google connection. All existing records belong to the one configured owner; this phase does not add multi-user tenancy or MCP bearer-token support.

### Local setup

1. Use Node.js 20 LTS or a newer supported LTS and run npm install.
2. Preserve MongoDB settings in .env.local and add the Auth0 variables documented in .env.example. Copy the client ID and secret from Auth0's **Job Tracker Web** Regular Web Application, not the downloaded Google client JSON.
3. Generate AUTH0_SECRET using the command in .env.example. Set AUTH0_OWNER_SUB to the exact Google user's Sub from the Auth0 connection test (or User Management → Users). There is no first-login owner registration.
4. Set APP_BASE_URL to http://localhost:3000 with no trailing slash. Register http://localhost:3000/auth/callback as an Allowed Callback URL and http://localhost:3000 as an Allowed Logout URL in Auth0.
5. Enable google-oauth2 for Job Tracker Web and run npm run dev. Sign in using the owner Google account.

### Vercel deployment

- Add all six Auth0 variables from .env.example to the Vercel production environment, keeping secrets private. Set APP_BASE_URL to https://job-trackersss.vercel.app and generate a different AUTH0_SECRET for production.
- Register https://job-trackersss.vercel.app/auth/callback and https://job-trackersss.vercel.app as callback and logout URLs respectively.
- Deploy only after setting the variables. Missing or invalid configuration denies requests with HTTP 503; there is no development bypass. Preview deployments need their own exact base URL, registered callbacks, and environment configuration.
- In a private browser window, verify that the homepage offers login and GET /api/applications returns JSON 401. Verify owner login, listing, create, edit, import, delete, and logout. Test mutations with disposable records. A different Google account must receive 403 from API routes and see an access-denied screen.
- Browser writes require an Origin header exactly matching APP_BASE_URL. Curl writes must supply that origin and a valid owner session cookie. Missing, null, or foreign origins are rejected.
- Private pages and API responses use no-store. The browser access-token endpoint is disabled. Sessions use SDK-encrypted HttpOnly cookies. Existing MongoDB records and DNS workarounds remain intact.

### Validation

Run npm run test:auth, npm run lint, npx tsc --noEmit, and npm run build. If the local Turbopack CSS worker fails, npx next build --webpack provides an alternate production-build check.

Phase 2 will implement the MCP endpoint, bearer-token validation, OAuth discovery, and client authorization. Current Auth0 API registration alone does not expose MCP tools.

## Phase 2: read-only remote MCP

The endpoint is https://job-trackersss.vercel.app/api/mcp. It implements stateless Streamable HTTP with JSON responses, using the official MCP SDK. GET/DELETE return 405 after authentication because there are no persistent streams or sessions. POST supports initialization, tools/list and tools/call.

### Tools

- search_applications: optional query (up to 200 characters), status (All by default), source, page (default 1), and pageSize (default 10, maximum 50). Returns items and pagination; searches all statuses unless explicitly filtered. Uses the existing business layer without dashboard summary queries.
- get_application: requires the exact application ID obtained from search (UUID or readable legacy ID); returns the full application or a tool error.
- Both tools are read-only. No preview, create, import, update, delete, or job submission tools exist in Phase 2. Application content must be treated as untrusted data by clients.

### Authentication and discovery

MCP uses an Auth0 RS256 bearer access token, independently of website session cookies. Tokens must have the configured Auth0 issuer, an audience exactly equal to APP_BASE_URL + /api/mcp, a valid expiry and issued-at claim, the configured owner subject, and read:applications in the scope claim. Service-account tokens and other users are rejected. JWKS keys are cached by jose; credentials and tokens are never logged. No new application secrets or environment variables are needed.

Public metadata is available at /.well-known/oauth-protected-resource and /.well-known/oauth-protected-resource/api/mcp. Unauthorized MCP requests return a WWW-Authenticate challenge linking to metadata. OAuth authorization and token exchange happen at Auth0; the tracker does not issue tokens or proxy client secrets. Browser Origin headers must match APP_BASE_URL; server clients may omit Origin. Cookies alone never authorize MCP, and no permissive CORS policy is enabled. Requests are limited to 64 KiB by the transport.

### Auth0 setup — owner performs these steps

1. Keep the existing API identifier https://job-trackersss.vercel.app/api/mcp, RS256, read:applications permission, consent enabled, and offline access enabled. Phase 2 clients only need read:applications, not write:applications.
2. In tenant Settings → Advanced, enable Resource Parameter Compatibility Profile so the MCP resource parameter selects this API. Enable Dynamic Client Registration if using a client's automatic OAuth registration flow. This creates client registrations, not access to tracker data; per-app permissions and owner checks still apply.
3. Keep third-party default permissions unauthorized and anonymous/client-credentials access disabled for the intended MCP clients. Register/connect ChatGPT and Claude separately. If they register dynamically, locate their new applications in Auth0 after the initial attempt.
4. For each intended client, authorize only read:applications under API → Application Access → User-delegated Access, and ensure its application can use the google-oauth2 connection. Third-party apps may require promoting the Google connection to domain level in its advanced settings; do this only for the intended integration and retain the owner check.
5. If a client requires manual OAuth registration, create a separate appropriate Auth0 client for it, using the exact callback URI and client authentication method supplied by that client's current connection UI. Do not reuse Job Tracker Web's client secret or guess callback URLs. Configure Authorization Code with PKCE and Refresh Token grants as supported by that client.
6. Keep consent required. Enable refresh-token rotation/expiry for the registered clients where supported. When connecting, request read:applications and (if refresh is desired) offline_access. Do not enable machine-to-machine or anonymous access to work around login failures.

### Connect and verify

Deploy with the existing production Auth0 variables first. In ChatGPT's custom app/MCP connection settings and Claude's custom connector settings, enter https://job-trackersss.vercel.app/api/mcp and use OAuth authentication. Exact menus and availability depend on the client/account. Sign in with the owner Google account and approve read access. If the first attempt registers a client but reports unauthorized access, complete its Auth0 per-app authorization above and reconnect.

Ask: “Search my tracker for applications at Acme, including closed and rejected applications.” Then ask for a returned application's details. Confirm that the tool list contains only search_applications and get_application. Full application data (including notes/contact information) is returned to the connected AI client when you use these tools.

Check unauthenticated POST /api/mcp returns 401 with the discovery challenge, metadata returns 200 without a login redirect, and website login still works. Tokens for another API, expired/tampered tokens, non-owner users, and missing read scope must fail. Existing website cookies alone must fail.

For local MCP testing, register a separate Auth0 API identifier http://localhost:3000/api/mcp, since the audience is derived from APP_BASE_URL. Hosted chat clients cannot reach localhost directly; use the production endpoint for their connection tests.

Run npm run test:mcp alongside npm run test:auth, lint, TypeScript and the production build. Tests use generated local signing keys and mock application functions; they do not read or modify Atlas. Live Auth0/client connection validation remains a deployment step for the owner.

## Phase 3: preview and approved creation

No new environment variables or hosting services are needed. MongoDB Atlas transactions are required (the existing Atlas replica set supports these). The database user must be able to create/write the new `application_previews` and `application_creation_locks` collections as well as `applications`.

### Owner deployment steps

1. Deploy this change. Keep both `read:applications` and `write:applications` defined on the Job Tracker MCP Auth0 API.
2. Under Application Access, grant `write:applications` in **User-delegated Access** to the dedicated ChatGPT and Claude OAuth clients. Keep read permission and the exact owner restriction. Client-credentials and anonymous grants are unnecessary.
3. Refresh the connector's tool list and reconnect/authorize with both scopes. A previously issued read-only token will not gain write permission until a new token is issued. Public discovery now advertises both scopes.
4. Verify website login still works and a read-only client cannot discover or execute `create_application`.

### Application flow

- `preview_application` accepts one application (company, role, applied date, optional existing draft fields). It uses the existing business validation, normalizes text, requires Applied status, detects duplicates, and stores a 30-minute preview. It never inserts an application. Preview persistence is a side effect, so the tool is annotated as a write action even though it only needs read scope.
- Open the returned `approvalUrl` in a browser. Only the configured owner's website session can review/approve it. The owner reviews every field and checks **I submitted this job application**. Approval is a same-origin POST; a tool argument or an AI statement cannot grant it. The page treats all preview content as plain text.
- Return to the AI chat and ask it to call `create_application` with the `confirmationId`. The token needs both scopes and must belong to the owner and the same OAuth client that created the preview. No additional application fields are accepted. Changed data requires a fresh preview and approval.
- Creation checks approval, expiry and duplicates again in a MongoDB transaction. A durable lock serializes MCP creations across instances. The application, embedded creation audit entry, and preview's application ID commit together. Retrying a consumed preview returns the original ID, including after expiry. Never retry with a new preview just because the response was lost.
- Duplicate detection includes legacy documents: normalized company + role + applied date, or a matching normalized job URL. URL normalization strips fragments and common tracking parameters, preserving job-identifying query parameters. Duplicate errors do not support an override in this phase. Existing records are not migrated or deleted.
- The stored provenance identifies `origin: mcp`, verified owner subject, OAuth client ID and preview ID. The embedded audit records creation time and browser approval time. Client identity comes from the verified token, rather than trusting an AI-provided platform name.

Preview receipts are retained to preserve retry safety; expired unused previews contain private job data and are not automatically deleted in this version. Duplicate serialization covers MCP creations; simultaneous manual/import writes retain their existing behavior. Update/follow-up/import tools remain later phases.

### Deployment verification

Use a disposable real or test application: preview it, try create before approval (must fail), approve through the private page, create, retry the same confirmation (same ID, one record), and preview the same company/role/date or URL again (duplicate). Try a foreign-origin approval POST and another account (must fail). Previewing alone must leave the applications count unchanged. Remove any disposable record through the tracker after verification.

`npm run test:mcp` covers legacy IDs, token validation, scope-specific tool discovery, unchanged creation payloads, approval/expiry/client binding, duplicate detection, audit fields and retry receipts. Database tests use an in-memory transaction mock; live Atlas transaction/concurrency and hosted browser/client validation remain deployment checks.
