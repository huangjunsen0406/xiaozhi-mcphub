# 快速开始

本指南帮助你在几分钟内跑起 **xiaozhi-mcphub 1.1.0**（上游基线 MCPHub v1.0.25 + 小智多端点 / 多账户能力）。

## 前提

- Docker（推荐）或 Node.js **18+ / 20+** 与 **pnpm**
- 小智端点、智能路由等能力需要 **PostgreSQL**（推荐 **pgvector**）；纯 JSON 文件模式可跑基础控制台，但小智/部分功能不可用

## 方式一：Docker 镜像（推荐）

```bash
docker pull huangjunsen/xiaozhi-mcphub:1.1.0
# 或跟踪最新
docker pull huangjunsen/xiaozhi-mcphub:latest

docker run -d \
  --name xiaozhi-mcphub \
  -p 3000:3000 \
  -e DB_URL="postgres://xiaozhi:密码@主机:5432/xiaozhi_mcphub" \
  -e JWT_SECRET="请换成足够长的随机串" \
  -v $(pwd)/data:/app/data \
  huangjunsen/xiaozhi-mcphub:1.1.0
```

打开 [http://localhost:3000](http://localhost:3000)：

![登录页](./images/login.png)

- 本地开发常见默认账号：`admin` / `admin123`
- 生产 / 首次空库：可用 `ADMIN_PASSWORD` 指定首个管理员密码；未设置时日志会打印随机密码

![仪表盘](./images/dashboard.zh.png)

### Docker Compose

仓库自带 `docker-compose.yml`（含 pgvector 与应用）：

```bash
git clone https://github.com/huangjunsen0406/xiaozhi-mcphub.git
cd xiaozhi-mcphub
docker compose up -d
docker compose logs -f mcphub
```

详见 [Docker 部署](/configuration/docker-setup)。

## 方式二：本地开发

```bash
git clone https://github.com/huangjunsen0406/xiaozhi-mcphub.git
cd xiaozhi-mcphub
pnpm install

# 可选：只起数据库
docker compose up -d db

cp .env.example .env
# 编辑 .env：至少配置 DB_URL、JWT_SECRET

pnpm dev
```

- 后端 API / 生产静态资源：`http://localhost:3000`
- 前端 Vite 开发服：`http://localhost:5173`（代理 API 到后端）

## 登录后建议路径

1. **服务器**：添加 / 启停 MCP Server（stdio / SSE / HTTP / OpenAPI）  
   ![服务器](./images/servers.zh.png)
2. **分组**：把服务器编组，供 `/mcp/{group}` 使用  
   ![分组](./images/group.zh.png)
3. **小智**：为当前用户添加 WebSocket 端点，绑定分组或智能路由  
   ![小智端点](./images/xiaozhi.png)
4. **设置**：智能路由、邮件（SMTP）、ModelScope / MCPRouter 等（部分仅管理员）  
   ![设置](./images/settings.zh.png)
5. **用户**（管理员）：管理账户；普通用户数据按 owner 隔离  
   ![用户](./images/users.zh.png)

## MCP 客户端接入

仪表盘「MCP 接入端点」会列出可用 URL，例如：

| 用途 | 示例 |
|------|------|
| 全部服务器 | `http://localhost:3000/mcp` |
| 智能路由 | `http://localhost:3000/mcp/$smart` |
| 指定分组 | `http://localhost:3000/mcp/{group}` |
| 指定服务器 | `http://localhost:3000/mcp/{server}` |
| 用户作用域 | `http://localhost:3000/{user}/mcp/...` |

在 Claude Desktop / Cursor 等客户端中填入对应 Streamable HTTP（或 SSE）地址，并按需配置 Bearer / 登录态。

## 版本与更新

- 当前产品版本：**1.1.0**
- Docker：`huangjunsen/xiaozhi-mcphub:1.1.0` 与 `:latest`
- 控制台「关于」检查更新：读取本仓库 [GitHub Releases](https://github.com/huangjunsen0406/xiaozhi-mcphub/releases)

## 下一步

- [环境变量](/configuration/environment-variables)
- [小智接入](/configuration/xiaozhi)
- [多账户与认证](/features/authentication)
- [服务器管理](/features/server-management)
- [智能路由](/features/smart-routing)
