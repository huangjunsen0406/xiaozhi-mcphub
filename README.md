# xiaozhi-mcphub: MCP tool bridge and console optimized for the Xiaozhi AI platform

[中文版](README.zh.md) | English

**xiaozhi-mcphub** is an MCP (Model Context Protocol) bridge and management console optimized for the Xiaozhi AI platform. It provides multi-endpoint management, automatic reconnection, vector-based smart routing, and OpenAPI-compatible access.

![Dashboard Preview](assets/dashboard.png)

## 🚀 Key Features

- **Enhanced Xiaozhi Integration**:
  - **Multi-endpoint management**: Bidirectional WebSocket connections with multiple Xiaozhi endpoints (enable/disable, edit, reconnect, status query).
  - **Smart reconnection**: Fast reconnect mode, exponential backoff, infinite retries with sleep window — all configurable via environment variables.
  - **Tool synchronization**: Xiaozhi endpoints are notified when server tools change to keep tool lists up-to-date.
  - **Grouping and smart routing**: Endpoints can bind to groups or use `$smart` intelligent routing.

- **MCP Management (inherited and enhanced)**:
  - Manage standard MCP servers (stdio / SSE / HTTP modes).
  - Enable/disable servers, tools, and prompts with descriptions and grouping.
  - Unified MCP entry, group entry, and server-specific endpoints.

- **Console & Authentication**:
  - Frontend console (React + Vite + Tailwind) to manage Servers, Groups, Users, Logs, Settings, Xiaozhi Endpoints, and Market.
  - JWT-based authentication with user context middleware and a built-in admin account.

- **OpenAPI & Direct Tool Access**:
  - Expose OpenAPI documentation and statistics endpoints.
  - Call specific server tools via OpenAPI-compatible endpoints.

## 🧩 Main Differences from Upstream

- New Xiaozhi endpoint multi-endpoint management and status (backward compatible, focusing on multi-endpoints).
- New per-endpoint reconnection strategies and global fast-reconnect switch.
- Enhanced `$smart` intelligent routing (optional) with automatic Xiaozhi linkage.
- Database uses **PostgreSQL + pgvector**, initializing sample servers and admin by default.

## 🔧 Quick Start

### Method 1: Use DockerHub image (recommended)

```bash
# Pull the image
docker pull huangjunsen/xiaozhi-mcphub:latest

# Run (adjust DB URL and password to your environment)
# Use DB_URL (1.1.x). Legacy DATABASE_URL from v1.0.3 is still accepted as a fallback.
docker run -d \
  --name xiaozhi-mcphub \
  -p 3000:3000 \
  -e DB_URL="postgres://xiaozhi:xiaozhi123456@host.docker.internal:5432/xiaozhi_mcphub" \
  -e SMART_ROUTING_ENABLED="false" \
  -v $(pwd)/data:/app/data \
  huangjunsen/xiaozhi-mcphub:latest

# Open the dashboard
# http://localhost:3000
```

Optional environment variables:

- `BASE_PATH`: Deploy under a sub-path (e.g., `/mcphub`).
- `JWT_SECRET`: JWT secret (recommended to set explicitly in production).
- `SMART_ROUTING_ENABLED`: Enable/disable smart routing (default "false").
- `OPENAI_API_KEY`, `OPENAI_API_BASE_URL`, `OPENAI_API_EMBEDDING_MODEL`: Required when enabling smart routing.

Default admin: `admin` / `admin123` (please change after first login).

### Method 2: Docker Compose one-click

This repository ships with `docker-compose.yml` including both `pgvector` and the app:

```bash
docker compose up -d

# View logs (optional)
docker compose logs -f mcphub
```

Key variables (edit in compose if needed):

- `DB_URL`: `postgres://xiaozhi:<password>@db:5432/xiaozhi_mcphub` (legacy `DATABASE_URL` still works)
- `SMART_ROUTING_ENABLED`: Enable/disable smart routing (default "false").
- Optional: `BASE_PATH`, `JWT_SECRET`, `OPENAI_API_KEY`, etc. (see above)

### Upgrading from v1.0.3

If you already jumped to 1.1.x and servers disappeared, **do not wipe the Postgres volume**.
1.1.x+ will detect the legacy `mcp_servers` table (when still present) and copy any missing
rows into the new `servers` table on startup. Prefer renaming the env var:

```bash
# before (v1.0.3)
DATABASE_URL=postgres://xiaozhi:…@db:5432/xiaozhi_mcphub

# after (1.1.x) — same credentials / same volume
DB_URL=postgres://xiaozhi:…@db:5432/xiaozhi_mcphub
```

Details: [documents/docs/configuration/upgrade-from-v103.md](documents/docs/configuration/upgrade-from-v103.md).

### Method 3: Local development

Requirements: Node.js 18+/20+, pnpm, PostgreSQL 16+ (recommended to use the `db` service from the repo's compose).

```bash
git clone https://github.com/huangjunsen0406/xiaozhi-mcphub.git
cd xiaozhi-mcphub
pnpm install

# Start local database (optional, reuse compose's db)
docker compose up -d db

# Set database connection (or write to .env)
export DB_URL="postgres://xiaozhi:xiaozhi123456@localhost:5432/xiaozhi_mcphub"

# Start both backend (:3000) and frontend (Vite :5173)
pnpm dev
```

Access the frontend dev server at `http://localhost:5173` (the frontend proxies to backend `:3000`).

## 🗺️ Smart Routing (optional)

Set `SMART_ROUTING_ENABLED` to `true` and provide `OPENAI_API_KEY` to enable it. The system uses `pgvector` for vector storage and indexing. If no vectors exist, index building will be skipped and later populated by vector services.

## 🖥️ Console Features (Frontend)

- Dashboard: Overview and status
- Servers: Server and tool management
- Groups: Grouping and assignment
- Users: User and permissions (admin)
- Logs: Real-time and historical logs
- Settings: System configuration (including smart routing)
- Xiaozhi Endpoints: Xiaozhi endpoint management
- Market: Search and install MCP servers from the community

## 📦 Defaults & Initialization

- Default admin: `admin` / `admin123`
- Default MCP servers: amap / playwright / fetch / slack (can be modified in the console and configured via ENV)

## 📄 License (Apache License 2.0)

This project is licensed under the **Apache License 2.0**. Keep `LICENSE` and `NOTICE` when redistributing, and document any modifications. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE).

## 🤝 Contributing

Contributions are welcome! Please open issues/PRs for improvements.

## 🔗 Links

- This project: <https://github.com/huangjunsen0406/xiaozhi-mcphub>
- Xiaozhi AI Platform: <https://xiaozhi.me>
- Model Context Protocol: <https://modelcontextprotocol.io>
