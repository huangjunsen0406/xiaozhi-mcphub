# 开发环境

面向在 **1.1.0 / 上游 v1.0.25 基底** 上贡献代码的开发者。

## 依赖

- Node.js 18+ 或 20+（CI 使用 20）  
- pnpm（见根目录 `packageManager`）  
- Docker（可选，跑 PostgreSQL/pgvector）  
- 若调试 stdio MCP：按各服务器需要准备 Python/uvx 等  

## 获取代码与安装

```bash
git clone https://github.com/huangjunsen0406/xiaozhi-mcphub.git
cd xiaozhi-mcphub
pnpm install
```

## 环境变量

```bash
cp .env.example .env
```

本地最小建议：

```bash
PORT=3000
JWT_SECRET=local-dev-only
DB_URL=postgres://xiaozhi:xiaozhi_test_pw@127.0.0.1:5434/xiaozhi_mcphub
# 可选：DISABLE_UPDATE_CHECK=true
```

启动数据库示例：

```bash
docker compose up -d db
# 或使用你自己的 Postgres 并打开 pgvector
```

## 开发命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 后端 + 前端热更新 |
| `pnpm backend:dev` | 仅后端 `:3000` |
| `pnpm frontend:dev` | 仅前端 `:5173` |
| `pnpm lint` / `pnpm test:ci` / `pnpm build` | 提交前门禁 |
| `pnpm docs:dev` | VitePress 文档（`documents/`） |

默认开发管理员常见为 `admin` / `admin123`。

## 目录速览

- `src/` 后端（Express、MCP、DAO、小智）  
- `frontend/` 控制台  
- `documents/` 用户文档（VitePress）  
- `docs/agents`、`docs/adr` 内部说明  
- `tests/` 与 `src/**/*.test.ts`  

架构约束（双数据源、owner 隔离、ESM `.js` 导入等）见仓库根 [AGENTS.md](https://github.com/huangjunsen0406/xiaozhi-mcphub/blob/main/AGENTS.md)。

## 文档站点

```bash
cd documents
pnpm install --ignore-workspace
pnpm docs:dev
```

`base` 为 `/xiaozhi-mcphub/`，与 GitHub Pages 一致。
