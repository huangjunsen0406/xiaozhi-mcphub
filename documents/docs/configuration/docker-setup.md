# Docker 部署

适用于 **xiaozhi-mcphub 1.1.0**。镜像命名空间：`huangjunsen/xiaozhi-mcphub`。

## 预构建镜像

```bash
docker pull huangjunsen/xiaozhi-mcphub:1.1.0
docker pull huangjunsen/xiaozhi-mcphub:latest

docker run -d \
  --name xiaozhi-mcphub \
  -p 3000:3000 \
  -e DB_URL="postgres://xiaozhi:密码@db-host:5432/xiaozhi_mcphub" \
  -e JWT_SECRET="生产环境请使用强随机串" \
  -e ADMIN_PASSWORD="可选-仅首次空库生效" \
  -v $(pwd)/data:/app/data \
  huangjunsen/xiaozhi-mcphub:1.1.0
```

| 标签 | 说明 |
|------|------|
| `1.1.0` | 当前发版钉死版本 |
| `latest` | 最近一次成功发版构建 |
| `edge` | 手动触发 Build workflow 时的滚动标签（若启用） |

架构：`linux/amd64`、`linux/arm64`。

> 注意：数据库连接请使用 **`DB_URL`**（不是旧文档里的 `DATABASE_URL`）。

## Docker Compose

仓库根目录 `docker-compose.yml` 一般包含：

- `db`：PostgreSQL + pgvector  
- `mcphub` / 应用服务：`huangjunsen/xiaozhi-mcphub:latest`

```bash
git clone https://github.com/huangjunsen0406/xiaozhi-mcphub.git
cd xiaozhi-mcphub
docker compose up -d
docker compose logs -f
```

也可参考 `docker-compose.db.yml` 仅起库或拆分部署。

### 常用环境变量（Compose）

```yaml
environment:
  PORT: 3000
  NODE_ENV: production
  DB_URL: postgres://xiaozhi:密码@db:5432/xiaozhi_mcphub
  JWT_SECRET: change-me
  # SMART_ROUTING_ENABLED: "true"
  # OPENAI_API_KEY: sk-...
  # DISABLE_UPDATE_CHECK: "true"   # 无外网时关闭关于-检查更新
```

完整列表见 [环境变量](/configuration/environment-variables)。

## 从源码构建

```bash
git clone https://github.com/huangjunsen0406/xiaozhi-mcphub.git
cd xiaozhi-mcphub
docker build -t xiaozhi-mcphub:local .
docker run -d --name xiaozhi-mcphub -p 3000:3000 \
  -e DB_URL=... -e JWT_SECRET=... \
  xiaozhi-mcphub:local
```

发布流水线（tag `v*.*.*`）会：

1. 使用 `DOCKER_USERNAME` / `DOCKER_PASSWORD` 登录 Docker Hub  
2. 推送 `huangjunsen/xiaozhi-mcphub:<version>` 与 `:latest`  
3. 创建 GitHub Release（应用内更新检查读此源）

## 反向代理

生产环境建议 Nginx / Caddy 终止 TLS，并正确转发 `Host` / `X-Forwarded-*`。示例见 [Nginx 配置](/configuration/nginx)。若挂在子路径，设置 `BASE_PATH`（如 `/mcphub`）。

## 健康检查

```bash
curl -s http://localhost:3000/health
```

返回中会包含 MCP 服务器连接汇总；控制台仪表盘也会显示在线/离线数量。

## 故障排除

| 现象 | 排查 |
|------|------|
| 小智页不可用 / 报错 | 是否配置 `DB_URL` 且库可连 |
| 登录后空白 | 检查 `BASE_PATH`、反向代理与静态资源路径 |
| 拉镜像 401 | Docker Hub 登录或镜像名是否为 `huangjunsen/xiaozhi-mcphub` |
| 关于-更新检查失败 | 出站访问 GitHub；或设 `DISABLE_UPDATE_CHECK=true` |
