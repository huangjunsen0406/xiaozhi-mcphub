# xiaozhi-mcphub：为小智AI平台优化的 MCP 工具桥接与控制台

[English Version](README.md) | 中文版

**xiaozhi-mcphub** 是在 [MCPHub](https://github.com/samanhappy/mcphub) 基础上二次开发的 MCP（Model Context Protocol）桥接与管理平台，重点增强与小智 AI 平台的集成能力，并提供多端点管理、自动重连、向量智能路由、OpenAPI 兼容访问等特性。

![控制面板预览](assets/dashboard.zh.png)

## 🚀 功能概览

- **小智平台集成（增强）**：
  - **多端点管理**：通过 WebSocket 与多个小智端点双向通信（支持启用/禁用、编辑、重连、状态查询）。
  - **智能重连**：支持快速重连模式、指数退避、无限重连与休眠窗口，可通过环境变量精细化控制。
  - **工具同步**：服务器工具变化可通知小智端点，保证工具列表与状态及时更新。
  - **分组与智能路由**：端点可绑定到指定分组，或启用 `$smart` 智能路由。

- **MCP 管理（继承并增强）**：
  - 标准 MCP 服务器统一管理（支持 stdio / SSE / HTTP 访问模式）。
  - 服务器/工具/提示词开关、描述与分组化管理。
  - 提供统一 MCP 入口、分组入口和按服务器的专用入口。

- **控制台与鉴权**：
  - 前端控制台（React + Vite + Tailwind）一站式管理 Servers、Groups、Users、Logs、Settings、Xiaozhi Endpoints、Market 等。
  - 基于 JWT 的认证与用户上下文中间件，内置管理员默认账户。

- **OpenAPI 与工具直连**：
  - 暴露 OpenAPI 文档与统计端点。
  - 通过 OpenAPI 兼容端点直接调用指定服务器的工具。

## 🧩 与上游项目的主要差异

- 新增小智端点的**多端点管理与状态**能力，兼容老接口但以多端点为主。
- 新增端点级**重连策略**与全局**快速重连**开关。
- 增强 `$smart` 智能路由接入（可选），并与小智端点自动联动。
- 数据库使用 **PostgreSQL + pgvector**，默认会初始化示例服务器与管理员账户。

## 🔧 快速开始

### 方式一：使用 DockerHub 镜像（推荐）

```bash
# 获取镜像
docker pull huangjunsen/xiaozhi-mcphub:latest

# 运行（请按需修改数据库地址与口令）
docker run -d \
  --name xiaozhi-mcphub \
  -p 3000:3000 \
  -e DATABASE_URL="postgres://xiaozhi:xiaozhi123456@localhost:5432/xiaozhi_mcphub" \
  -e SMART_ROUTING_ENABLED="false" \
  -v $(pwd)/data:/app/data \
  huangjunsen/xiaozhi-mcphub:latest

# 访问控制台
# http://localhost:3000
```

- 可选环境变量：
  - `BASE_PATH`：二级路径部署（如 `/mcphub`）。
  - `JWT_SECRET`：JWT 密钥（生产环境建议手动设置）。
  - `SMART_ROUTING_ENABLED`：是否开启智能路由（默认 "false"）。
  - `OPENAI_API_KEY`、`OPENAI_API_BASE_URL`、`OPENAI_API_EMBEDDING_MODEL`：开启智能路由时所需。

默认管理员：`admin` / `admin123`（首次登录后请修改密码）。

### 方式二：Docker Compose 一键启动

仓库已提供 `docker-compose.yml`，包含 `pgvector` 与应用服务：

```bash
docker compose up -d

# 查看日志（可选）
docker compose logs -f mcphub
```

关键变量（可在 compose 中修改）

- `DATABASE_URL`: `postgres://xiaozhi:密码@db:5432/xiaozhi_mcphub`
- `SMART_ROUTING_ENABLED`: 开启/关闭智能路由（默认 "false"）
- 可选：`BASE_PATH`、`JWT_SECRET`、`OPENAI_API_KEY` 等（见上）

### 方式三：本地开发

依赖：Node.js 18+/20+、pnpm、PostgreSQL 16+（推荐使用 compose 中的 `db` 服务）。

```bash
git clone https://github.com/huangjunsen0406/xiaozhi-mcphub.git
cd xiaozhi-mcphub
pnpm install

# 启动本地数据库（可选，使用仓库 compose 的 db）
docker compose up -d db

# 设置数据库连接（或写入 .env）
export DATABASE_URL="postgres://xiaozhi:xiaozhi123456@localhost:5432/xiaozhi_mcphub"

# 同时启动后端（:3000）与前端（Vite :5173）
pnpm dev
```

访问前端开发站点：`http://localhost:5173`（前端通过代理访问后端 `:3000`）。

## 🗺️ 智能路由（可选）

将 `SMART_ROUTING_ENABLED` 设为 `true` 并提供 `OPENAI_API_KEY` 即可启用。系统会使用 `pgvector` 进行向量存储与索引，在无向量数据时自动跳过索引构建，后续由向量服务补足。

## 🖥️ 控制台功能（前端）

- Dashboard：概览与状态
- Servers：服务器与工具管理
- Groups：分组与分配
- Users：用户与权限（管理员）
- Logs：实时与历史日志
- Settings：系统配置（含智能路由）
- Xiaozhi Endpoints：小智端点管理
- Market：从社区市场检索与安装 MCP 服务器

## 📦 默认内容与初始化

- 默认管理员：`admin` / `admin123`
- 默认 MCP 服务器：amap / playwright / fetch / slack（可在控制台修改与配置 ENV）

## 📄 许可与归属（Apache License 2.0）

本项目在 [MCPHub](https://github.com/samanhappy/mcphub) 基础上二次开发，遵循 **Apache License 2.0**：

- 保留上游与本项目的版权与许可声明，包含 `LICENSE` 与 `NOTICE`。
- 若修改并再分发源代码或二进制，请在告知性文件中注明变更。
- 需在再分发中附带许可证与免责声明，不得暗示原作者为你的修改背书。

详情请查阅仓库中的 [`LICENSE`](LICENSE) 与 [`NOTICE`](NOTICE)。

## 🤝 贡献

欢迎提交 Issue / PR 改进功能与文档。提交前请先阅读代码风格与测试约定。

## 🔗 相关链接

- 上游项目：<https://github.com/samanhappy/mcphub>
- 小智 AI 平台：<https://xiaozhi.me>
- Model Context Protocol：<https://modelcontextprotocol.io>
