# Docker 部署

本指南介绍使用 Docker 部署 xiaozhi-mcphub，包括开发和生产配置。

## Docker 快速开始

### 使用预构建镜像

```bash
# 拉取最新镜像
docker pull huangjunsen0406/xiaozhi-mcphub:latest

# 使用默认配置运行
docker run -d \
  --name xiaozhi-mcphub \
  -p 3000:3000 \
  -v $(pwd)/mcp_settings.json:/app/mcp_settings.json \
  huangjunsen0406/xiaozhi-mcphub:latest
```

### 从源码构建

```bash
# 克隆仓库
git clone https://github.com/huangjunsen0406/xiaozhi-mcphub.git
cd xiaozhi-mcphub

# 构建 Docker 镜像
docker build -t xiaozhi-mcphub:local .

# 运行容器
docker run -d \
  --name xiaozhi-mcphub \
  -p 3000:3000 \
  -v $(pwd)/mcp_settings.json:/app/mcp_settings.json \
  xiaozhi-mcphub:local
```

## Docker Compose 设置

### 基本配置

创建 `docker-compose.yml` 文件：

```yaml
version: '3.8'

services:
  xiaozhi-mcphub:
    image: huangjunsen0406/xiaozhi-mcphub:latest
    # 本地开发时使用：
    # build: .
    container_name: xiaozhi-mcphub
    ports:
      - '3000:3000'
    environment:
      - NODE_ENV=production
      - PORT=3000
      - JWT_SECRET=${JWT_SECRET:-your-jwt-secret}
      - DATABASE_URL=postgresql://mcphub:password@postgres:5432/mcphub
      # 小智平台集成环境变量
      - XIAOZHI_ENABLED=${XIAOZHI_ENABLED:-true}
      - XIAOZHI_WEBSOCKET_URL=${XIAOZHI_WEBSOCKET_URL}
      - XIAOZHI_RECONNECT_MAX_ATTEMPTS=${XIAOZHI_RECONNECT_MAX_ATTEMPTS:-10}
    volumes:
      - ./mcp_settings.json:/app/mcp_settings.json:ro
      - ./servers.json:/app/servers.json:ro
      - mcphub_data:/app/data
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - mcphub-network

  postgres:
    image: postgres:15-alpine
    container_name: mcphub-postgres
    environment:
      - POSTGRES_DB=mcphub
      - POSTGRES_USER=mcphub
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init-db.sql:/docker-entrypoint-initdb.d/init-db.sql:ro
    ports:
      - '5432:5432'
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U mcphub -d mcphub']
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - mcphub-network

volumes:
  postgres_data:
  mcphub_data:

networks:
  mcphub-network:
    driver: bridge
```

### 生产配置（包含 Nginx）

```yaml
version: '3.8'

services:
  nginx:
    image: nginx:alpine
    container_name: xiaozhi-mcphub-nginx
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
      - nginx_logs:/var/log/nginx
    depends_on:
      - xiaozhi-mcphub
    restart: unless-stopped
    networks:
      - mcphub-network

  xiaozhi-mcphub:
    image: huangjunsen0406/xiaozhi-mcphub:latest
    container_name: xiaozhi-mcphub-app
    expose:
      - '3000'
    environment:
      - NODE_ENV=production
      - PORT=3000
      - JWT_SECRET=${JWT_SECRET}
      - JWT_EXPIRES_IN=${JWT_EXPIRES_IN:-24h}
      - DATABASE_URL=postgresql://mcphub:${POSTGRES_PASSWORD}@postgres:5432/mcphub
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - REDIS_URL=redis://redis:6379
      # 小智平台配置
      - XIAOZHI_ENABLED=true
      - XIAOZHI_WEBSOCKET_URL=${XIAOZHI_WEBSOCKET_URL}
      - XIAOZHI_RECONNECT_MAX_ATTEMPTS=10
      - XIAOZHI_RECONNECT_INITIAL_DELAY=2000
      - XIAOZHI_RECONNECT_MAX_DELAY=60000
      # 高德地图API密钥（如果使用）
      - AMAP_MAPS_API_KEY=${AMAP_MAPS_API_KEY}
    volumes:
      - ./mcp_settings.json:/app/mcp_settings.json:ro
      - ./servers.json:/app/servers.json:ro
      - mcphub_data:/app/data
      - mcphub_logs:/app/logs
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - mcphub-network
    healthcheck:
      test: ['CMD', 'wget', '--quiet', '--tries=1', '--spider', 'http://localhost:3000/health']
      interval: 30s
      timeout: 10s
      retries: 3

  postgres:
    image: postgres:15-alpine
    container_name: mcphub-postgres
    environment:
      - POSTGRES_DB=mcphub
      - POSTGRES_USER=mcphub
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backups:/backups
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U mcphub -d mcphub']
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - mcphub-network

  redis:
    image: redis:7-alpine
    container_name: mcphub-redis
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - mcphub-network

volumes:
  postgres_data:
  redis_data:
  mcphub_data:
  mcphub_logs:
  nginx_logs:

networks:
  mcphub-network:
    driver: bridge
```

### 环境变量

为 Docker Compose 创建 `.env` 文件：

```env
# 应用程序
NODE_ENV=production
JWT_SECRET=your-super-secret-jwt-key-change-this
JWT_EXPIRES_IN=24h

# 数据库
POSTGRES_PASSWORD=your-secure-database-password

# Redis
REDIS_PASSWORD=your-secure-redis-password

# 外部 API
OPENAI_API_KEY=your-openai-api-key

# 小智平台集成配置
XIAOZHI_ENABLED=true
XIAOZHI_WEBSOCKET_URL=wss://api.xiaozhi.me/mcp/?token=your-jwt-token
XIAOZHI_RECONNECT_MAX_ATTEMPTS=10
XIAOZHI_RECONNECT_INITIAL_DELAY=2000
XIAOZHI_RECONNECT_MAX_DELAY=60000

# MCP服务器API密钥
AMAP_MAPS_API_KEY=your-amap-api-key
SLACK_BOT_TOKEN=your-slack-bot-token
SLACK_TEAM_ID=your-slack-team-id
GITHUB_TOKEN=your-github-token

# 可选：自定义端口
# PORT=3000
```

## 开发设置

### 开发 Docker Compose

创建 `docker-compose.dev.yml`：

```yaml
version: '3.8'

services:
  xiaozhi-mcphub-dev:
    build:
      context: .
      dockerfile: Dockerfile.dev
    container_name: xiaozhi-mcphub-dev
    ports:
      - '3000:3000'
      - '5173:5173' # 前端开发服务器
      - '9229:9229' # 调试端口
    environment:
      - NODE_ENV=development
      - PORT=3000
      - DATABASE_URL=postgresql://mcphub:password@postgres:5432/mcphub
      - XIAOZHI_ENABLED=true
      - XIAOZHI_WEBSOCKET_URL=${XIAOZHI_WEBSOCKET_URL}
    volumes:
      - .:/app
      - /app/node_modules
      - /app/frontend/node_modules
    depends_on:
      - postgres
    command: pnpm dev
    networks:
      - mcphub-dev

  postgres:
    image: postgres:15-alpine
    container_name: mcphub-postgres-dev
    environment:
      - POSTGRES_DB=mcphub
      - POSTGRES_USER=mcphub
      - POSTGRES_PASSWORD=password
    ports:
      - '5432:5432'
    volumes:
      - postgres_dev_data:/var/lib/postgresql/data
    networks:
      - mcphub-dev

volumes:
  postgres_dev_data:

networks:
  mcphub-dev:
    driver: bridge
```

### 开发 Dockerfile

创建 `Dockerfile.dev`：

```dockerfile
FROM python:3.13-slim-bookworm AS base

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

RUN apt-get update && apt-get install -y curl gnupg git \
  && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
  && apt-get install -y nodejs \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm

# 安装全局MCP服务器包
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN mkdir -p $PNPM_HOME && \
  pnpm add -g @amap/amap-maps-mcp-server @playwright/mcp@latest @modelcontextprotocol/server-github @modelcontextprotocol/server-slack

RUN uv tool install mcp-server-fetch

# 设置工作目录
WORKDIR /app

# 复制包文件
COPY package.json pnpm-lock.yaml ./
COPY frontend/package.json ./frontend/

# 安装依赖
RUN pnpm install

# 复制源代码
COPY . .

# 暴露端口
EXPOSE 3000 5173 9229

# 启动开发服务器
CMD ["pnpm", "dev"]
```

## 配置管理

### 小智平台MCP设置

创建您的 `mcp_settings.json`，包含小智平台配置：

```json
{
  "mcpServers": {
    "fetch": {
      "command": "uvx",
      "args": ["mcp-server-fetch"]
    },
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--headless"]
    },
    "amap": {
      "command": "npx",
      "args": ["-y", "@amap/amap-maps-mcp-server"],
      "env": {
        "AMAP_MAPS_API_KEY": "${AMAP_MAPS_API_KEY}"
      }
    },
    "slack": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-slack"],
      "env": {
        "SLACK_BOT_TOKEN": "${SLACK_BOT_TOKEN}",
        "SLACK_TEAM_ID": "${SLACK_TEAM_ID}"
      }
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  },
  "xiaozhi": {
    "enabled": true,
    "webSocketUrl": "${XIAOZHI_WEBSOCKET_URL}",
    "reconnect": {
      "maxAttempts": 10,
      "initialDelay": 2000,
      "maxDelay": 60000,
      "backoffMultiplier": 2
    }
  }
}
```

### 密钥管理

对于生产环境，使用 Docker 密钥：

```yaml
version: '3.8'

services:
  xiaozhi-mcphub:
    image: huangjunsen0406/xiaozhi-mcphub:latest
    environment:
      - JWT_SECRET_FILE=/run/secrets/jwt_secret
      - DATABASE_PASSWORD_FILE=/run/secrets/db_password
      - XIAOZHI_WEBSOCKET_URL_FILE=/run/secrets/xiaozhi_url
    secrets:
      - jwt_secret
      - db_password
      - xiaozhi_url

secrets:
  jwt_secret:
    file: ./secrets/jwt_secret.txt
  db_password:
    file: ./secrets/db_password.txt
  xiaozhi_url:
    file: ./secrets/xiaozhi_url.txt
```

## 数据持久化

### 数据库备份

在 `docker-compose.yml` 中添加备份服务：

```yaml
services:
  backup:
    image: postgres:15-alpine
    container_name: xiaozhi-mcphub-backup
    environment:
      - PGPASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - ./backups:/backups
      - ./scripts/backup.sh:/backup.sh:ro
    command: /bin/sh -c "chmod +x /backup.sh && /backup.sh"
    depends_on:
      - postgres
    profiles:
      - backup
    networks:
      - mcphub-network
```

创建 `scripts/backup.sh`：

```bash
#!/bin/sh
BACKUP_FILE="/backups/xiaozhi-mcphub_$(date +%Y%m%d_%H%M%S).sql"
pg_dump -h postgres -U mcphub -d mcphub > "$BACKUP_FILE"
echo "备份已创建：$BACKUP_FILE"

# 只保留最近 7 天的备份
find /backups -name "xiaozhi-mcphub_*.sql" -mtime +7 -delete
```

运行备份：

```bash
docker-compose --profile backup run --rm backup
```

## 监控和健康检查

### 健康检查端点

应用程序包含以下健康检查端点：

```javascript
// 在您的 Express 应用中
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: process.env.npm_package_version,
    xiaozhi: {
      enabled: process.env.XIAOZHI_ENABLED === 'true',
      connected: xiaozhi.isConnected()
    }
  });
});
```

### Docker 健康检查

```yaml
services:
  xiaozhi-mcphub:
    # ... 其他配置
    healthcheck:
      test: ['CMD', 'wget', '--quiet', '--tries=1', '--spider', 'http://localhost:3000/health']
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s
```

### 使用 Watchtower 监控

添加自动更新：

```yaml
services:
  watchtower:
    image: containrrr/watchtower
    container_name: xiaozhi-mcphub-watchtower
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
    environment:
      - WATCHTOWER_CLEANUP=true
      - WATCHTOWER_POLL_INTERVAL=3600
      - WATCHTOWER_INCLUDE_STOPPED=true
    restart: unless-stopped
```

## 故障排除

### 常见问题

**容器启动失败**：使用 `docker-compose logs xiaozhi-mcphub` 检查日志

**小智平台连接失败**：检查 WebSocket URL 和 JWT 令牌

```bash
# 检查小智连接状态
curl http://localhost:3000/api/xiaozhi/status
```

**MCP服务器启动失败**：检查环境变量和API密钥配置

**数据库连接错误**：确保 PostgreSQL 健康且可访问

**端口冲突**：检查端口 3000/5432 是否已被占用

**卷挂载问题**：验证文件路径和权限

### 调试命令

```bash
# 查看容器状态
docker-compose ps

# 查看详细日志
docker-compose logs -f --tail=100 xiaozhi-mcphub

# 查看小智平台连接日志
docker-compose logs xiaozhi-mcphub | grep xiaozhi

# 进入容器调试
docker-compose exec xiaozhi-mcphub sh

# 重启服务
docker-compose restart xiaozhi-mcphub

# 完全重建
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

### 小智平台连接调试

```bash
# 检查小智配置
curl http://localhost:3000/api/xiaozhi/config

# 重启小智连接
curl -X POST http://localhost:3000/api/xiaozhi/restart

# 查看工具同步状态
curl http://localhost:3000/api/xiaozhi/tools
```

### 性能优化

#### 内存限制

```yaml
services:
  xiaozhi-mcphub:
    deploy:
      resources:
        limits:
          memory: 1G
        reservations:
          memory: 512M
```

#### 日志轮换

```yaml
services:
  xiaozhi-mcphub:
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

::: tip 提示
- 定期监控容器资源使用情况
- 使用 Docker stats 命令查看实时指标
- 为生产环境设置适当的重启策略
- 定期更新镜像以获取安全补丁
- 监控小智平台连接状态
:::

::: warning 安全提醒
- 更改默认密码
- 使用 Docker secrets 管理敏感信息
- 定期备份数据
- 限制容器网络访问
- 保护小智平台WebSocket连接的JWT令牌
::: 