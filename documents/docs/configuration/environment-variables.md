# 环境变量配置

xiaozhi-mcphub 使用环境变量进行配置。本指南涵盖所有可用变量及其用法。

## 核心应用设置

### 服务器配置

| 变量        | 默认值        | 描述                                            |
| ----------- | ------------- | ----------------------------------------------- |
| `PORT`      | `3000`        | HTTP 服务器端口号                               |
| `HOST`      | `0.0.0.0`     | 服务器绑定的主机地址                            |
| `NODE_ENV`  | `development` | 应用环境（`development`、`production`、`test`） |
| `LOG_LEVEL` | `info`        | 日志级别（`error`、`warn`、`info`、`debug`）    |

```env
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
LOG_LEVEL=info
```

### 数据库配置

| 变量           | 默认值      | 描述                  |
| -------------- | ----------- | --------------------- |
| `DATABASE_URL` | -           | PostgreSQL 连接字符串 |
| `DB_HOST`      | `localhost` | 数据库主机            |
| `DB_PORT`      | `5432`      | 数据库端口            |
| `DB_NAME`      | `mcphub`    | 数据库名称            |
| `DB_USER`      | `mcphub`    | 数据库用户名          |
| `DB_PASSWORD`  | -           | 数据库密码            |
| `DB_SSL`       | `false`     | 启用数据库 SSL 连接   |
| `DB_POOL_MIN`  | `2`         | 最小数据库连接池大小  |
| `DB_POOL_MAX`  | `10`        | 最大数据库连接池大小  |

```env
# 选项 1：完整连接字符串
DATABASE_URL=postgresql://username:password@localhost:5432/mcphub

# 选项 2：单独组件
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mcphub
DB_USER=mcphub
DB_PASSWORD=your-password
DB_SSL=false
```

## 认证与安全

### JWT 配置

| 变量                     | 默认值  | 描述                     |
| ------------------------ | ------- | ------------------------ |
| `JWT_SECRET`             | -       | JWT 令牌签名密钥（必需） |
| `JWT_EXPIRES_IN`         | `24h`   | JWT 令牌过期时间         |
| `JWT_REFRESH_EXPIRES_IN` | `7d`    | 刷新令牌过期时间         |
| `JWT_ALGORITHM`          | `HS256` | JWT 签名算法             |

```env
JWT_SECRET=your-super-secret-key-change-this-in-production
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d
```

### 会话与安全

| 变量                | 默认值 | 描述                 |
| ------------------- | ------ | -------------------- |
| `SESSION_SECRET`    | -      | 会话加密密钥         |
| `BCRYPT_ROUNDS`     | `12`   | bcrypt 哈希轮数      |
| `RATE_LIMIT_WINDOW` | `15`   | 速率限制窗口（分钟） |
| `RATE_LIMIT_MAX`    | `100`  | 每个窗口最大请求数   |
| `CORS_ORIGIN`       | `*`    | 允许的 CORS 来源     |

```env
SESSION_SECRET=your-session-secret
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX=100
CORS_ORIGIN=https://your-domain.com,https://admin.your-domain.com
```

## 小智平台集成配置

### 小智连接设置

| 变量                             | 默认值 | 描述                         |
| -------------------------------- | ------ | ---------------------------- |
| `XIAOZHI_ENABLED`                | `true` | 是否启用小智平台集成         |
| `XIAOZHI_WEBSOCKET_URL`          | -      | 小智平台WebSocket连接URL     |
| `XIAOZHI_RECONNECT_MAX_ATTEMPTS` | `10`   | 最大重连尝试次数             |
| `XIAOZHI_RECONNECT_INITIAL_DELAY`| `2000` | 初始重连延迟（毫秒）         |
| `XIAOZHI_RECONNECT_MAX_DELAY`    | `60000`| 最大重连延迟（毫秒）         |
| `XIAOZHI_RECONNECT_BACKOFF_MULTIPLIER` | `2` | 重连退避倍数           |

```env
# 小智平台基本配置
XIAOZHI_ENABLED=true
XIAOZHI_WEBSOCKET_URL=wss://api.xiaozhi.me/mcp/?token=your-jwt-token

# 重连配置
XIAOZHI_RECONNECT_MAX_ATTEMPTS=10
XIAOZHI_RECONNECT_INITIAL_DELAY=2000
XIAOZHI_RECONNECT_MAX_DELAY=60000
XIAOZHI_RECONNECT_BACKOFF_MULTIPLIER=2
```

### 小智同步设置

| 变量                        | 默认值  | 描述                     |
| --------------------------- | ------- | ------------------------ |
| `XIAOZHI_AUTO_SYNC`         | `true`  | 是否启用自动工具同步     |
| `XIAOZHI_SYNC_INTERVAL`     | `30000` | 同步间隔（毫秒）         |
| `XIAOZHI_SYNC_TIMEOUT`      | `10000` | 同步操作超时（毫秒）     |
| `XIAOZHI_MAX_SYNC_RETRIES`  | `3`     | 最大同步重试次数         |
| `XIAOZHI_RETRY_ON_FAILURE`  | `true`  | 同步失败时是否重试       |

```env
XIAOZHI_AUTO_SYNC=true
XIAOZHI_SYNC_INTERVAL=30000
XIAOZHI_SYNC_TIMEOUT=10000
XIAOZHI_MAX_SYNC_RETRIES=3
XIAOZHI_RETRY_ON_FAILURE=true
```

### 小智日志配置

| 变量                              | 默认值  | 描述                     |
| --------------------------------- | ------- | ------------------------ |
| `XIAOZHI_LOG_LEVEL`               | `info`  | 小智相关日志级别         |
| `XIAOZHI_LOG_CONNECTION_EVENTS`   | `true`  | 记录连接事件             |
| `XIAOZHI_LOG_SYNC_EVENTS`         | `false` | 记录同步事件             |
| `XIAOZHI_LOG_RECONNECT_ATTEMPTS`  | `true`  | 记录重连尝试             |

```env
XIAOZHI_LOG_LEVEL=info
XIAOZHI_LOG_CONNECTION_EVENTS=true
XIAOZHI_LOG_SYNC_EVENTS=false
XIAOZHI_LOG_RECONNECT_ATTEMPTS=true
```

## 外部服务

### OpenAI 配置

| 变量                     | 默认值                   | 描述                            |
| ------------------------ | ------------------------ | ------------------------------- |
| `OPENAI_API_KEY`         | -                        | OpenAI API 密钥（用于智能路由） |
| `OPENAI_MODEL`           | `gpt-3.5-turbo`          | OpenAI 嵌入模型                 |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-ada-002` | 向量嵌入模型                    |
| `OPENAI_MAX_TOKENS`      | `1000`                   | 每个请求最大令牌数              |
| `OPENAI_TEMPERATURE`     | `0.1`                    | AI 响应温度                     |

```env
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_MODEL=gpt-3.5-turbo
OPENAI_EMBEDDING_MODEL=text-embedding-ada-002
OPENAI_MAX_TOKENS=1000
OPENAI_TEMPERATURE=0.1
```

### Redis 配置（可选）

| 变量             | 默认值      | 描述             |
| ---------------- | ----------- | ---------------- |
| `REDIS_URL`      | -           | Redis 连接字符串 |
| `REDIS_HOST`     | `localhost` | Redis 主机       |
| `REDIS_PORT`     | `6379`      | Redis 端口       |
| `REDIS_PASSWORD` | -           | Redis 密码       |
| `REDIS_DB`       | `0`         | Redis 数据库编号 |
| `REDIS_PREFIX`   | `mcphub:`   | Redis 键前缀     |

```env
# 选项 1：完整连接字符串
REDIS_URL=redis://username:password@localhost:6379/0

# 选项 2：单独组件
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_DB=0
REDIS_PREFIX=mcphub:
```

## MCP 服务器配置

### 默认设置

| 变量                | 默认值              | 描述                         |
| ------------------- | ------------------- | ---------------------------- |
| `MCP_SETTINGS_FILE` | `mcp_settings.json` | MCP 设置文件路径             |
| `MCP_SERVERS_FILE`  | `servers.json`      | 服务器配置文件路径           |
| `MCP_TIMEOUT`       | `30000`             | MCP 操作默认超时（毫秒）     |
| `MCP_MAX_RETRIES`   | `3`                 | 失败操作最大重试次数         |
| `MCP_RESTART_DELAY` | `5000`              | 重启失败服务器的延迟（毫秒） |

```env
MCP_SETTINGS_FILE=./config/mcp_settings.json
MCP_SERVERS_FILE=./config/servers.json
MCP_TIMEOUT=30000
MCP_MAX_RETRIES=3
MCP_RESTART_DELAY=5000
```

### MCP 服务器 API 密钥

| 变量                             | 默认值 | 描述                    |
| -------------------------------- | ------ | ----------------------- |
| `AMAP_MAPS_API_KEY`              | -      | 高德地图 API 密钥       |
| `SLACK_BOT_TOKEN`                | -      | Slack Bot Token         |
| `SLACK_TEAM_ID`                  | -      | Slack Team ID           |
| `SLACK_APP_TOKEN`                | -      | Slack App Token         |
| `GITHUB_TOKEN`                   | -      | GitHub Personal Access Token |
| `GOOGLE_CLIENT_ID`               | -      | Google OAuth Client ID  |
| `GOOGLE_CLIENT_SECRET`           | -      | Google OAuth Client Secret |
| `GOOGLE_REFRESH_TOKEN`           | -      | Google Refresh Token    |
| `EMAIL_USER`                     | -      | SMTP 邮箱用户名         |
| `EMAIL_PASSWORD`                 | -      | SMTP 邮箱密码           |

```env
# 高德地图配置
AMAP_MAPS_API_KEY=your-amap-api-key

# Slack 配置
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
SLACK_TEAM_ID=T1234567890
SLACK_APP_TOKEN=xapp-your-slack-app-token

# GitHub 配置
GITHUB_TOKEN=ghp_your-github-personal-access-token

# Google Drive 配置
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REFRESH_TOKEN=your-google-refresh-token

# 邮件配置
EMAIL_USER=your-email@example.com
EMAIL_PASSWORD=your-email-password
```

### 智能路由

| 变量                        | 默认值 | 描述                   |
| --------------------------- | ------ | ---------------------- |
| `SMART_ROUTING_ENABLED`     | `true` | 启用 AI 驱动的智能路由 |
| `SMART_ROUTING_THRESHOLD`   | `0.7`  | 路由相似度阈值         |
| `SMART_ROUTING_MAX_RESULTS` | `5`    | 返回的最大工具数       |
| `VECTOR_CACHE_TTL`          | `3600` | 向量缓存 TTL（秒）     |

```env
SMART_ROUTING_ENABLED=true
SMART_ROUTING_THRESHOLD=0.7
SMART_ROUTING_MAX_RESULTS=5
VECTOR_CACHE_TTL=3600
```

## 文件存储与上传

| 变量                 | 默认值           | 描述                             |
| -------------------- | ---------------- | -------------------------------- |
| `UPLOAD_DIR`         | `./uploads`      | 文件上传目录                     |
| `MAX_FILE_SIZE`      | `10485760`       | 最大文件大小（字节，10MB）       |
| `ALLOWED_FILE_TYPES` | `image/*,text/*` | 允许的 MIME 类型                 |
| `STORAGE_TYPE`       | `local`          | 存储类型（`local`、`s3`、`gcs`） |

```env
UPLOAD_DIR=./data/uploads
MAX_FILE_SIZE=10485760
ALLOWED_FILE_TYPES=image/*,text/*,application/json
STORAGE_TYPE=local
```

### S3 存储（可选）

| 变量                   | 默认值      | 描述           |
| ---------------------- | ----------- | -------------- |
| `S3_BUCKET`            | -           | S3 存储桶名称  |
| `S3_REGION`            | `us-east-1` | S3 区域        |
| `S3_ACCESS_KEY_ID`     | -           | S3 访问密钥    |
| `S3_SECRET_ACCESS_KEY` | -           | S3 密钥        |
| `S3_ENDPOINT`          | -           | 自定义 S3 端点 |

```env
S3_BUCKET=mcphub-uploads
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=your-access-key
S3_SECRET_ACCESS_KEY=your-secret-key
```

## 监控与日志

### 应用监控

| 变量                     | 默认值  | 描述                 |
| ------------------------ | ------- | -------------------- |
| `METRICS_ENABLED`        | `true`  | 启用指标收集         |
| `METRICS_PORT`           | `9090`  | 指标端点端口         |
| `HEALTH_CHECK_INTERVAL`  | `30000` | 健康检查间隔（毫秒） |
| `PERFORMANCE_MONITORING` | `false` | 启用性能监控         |

```env
METRICS_ENABLED=true
METRICS_PORT=9090
HEALTH_CHECK_INTERVAL=30000
PERFORMANCE_MONITORING=true
```

### 日志配置

| 变量               | 默认值       | 描述                             |
| ------------------ | ------------ | -------------------------------- |
| `LOG_FORMAT`       | `json`       | 日志格式（`json`、`text`）       |
| `LOG_FILE`         | -            | 日志文件路径（如果启用文件日志） |
| `LOG_MAX_SIZE`     | `10m`        | 最大日志文件大小                 |
| `LOG_MAX_FILES`    | `5`          | 最大日志文件数                   |
| `LOG_DATE_PATTERN` | `YYYY-MM-DD` | 日志轮换日期模式                 |

```env
LOG_FORMAT=json
LOG_FILE=./logs/mcphub.log
LOG_MAX_SIZE=10m
LOG_MAX_FILES=5
LOG_DATE_PATTERN=YYYY-MM-DD
```

## 开发与调试

| 变量                     | 默认值  | 描述                            |
| ------------------------ | ------- | ------------------------------- |
| `DEBUG`                  | -       | 调试命名空间（例如 `mcphub:*`） |
| `DEV_TOOLS_ENABLED`      | `false` | 启用开发工具                    |
| `HOT_RELOAD`             | `true`  | 在开发中启用热重载              |
| `MOCK_EXTERNAL_SERVICES` | `false` | 模拟外部 API 调用               |

```env
DEBUG=mcphub:*,xiaozhi:*
DEV_TOOLS_ENABLED=true
HOT_RELOAD=true
MOCK_EXTERNAL_SERVICES=false
```

## 生产优化

| 变量               | 默认值  | 描述                   |
| ------------------ | ------- | ---------------------- |
| `CLUSTER_MODE`     | `false` | 启用集群模式           |
| `WORKER_PROCESSES` | `0`     | 工作进程数（0 = 自动） |
| `MEMORY_LIMIT`     | -       | 每个进程内存限制       |
| `CPU_LIMIT`        | -       | 每个进程 CPU 限制      |
| `GC_OPTIMIZE`      | `false` | 启用垃圾回收优化       |

```env
CLUSTER_MODE=true
WORKER_PROCESSES=4
MEMORY_LIMIT=512M
GC_OPTIMIZE=true
```

## 配置示例

### 开发环境

```env
# .env.development
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# 数据库
DATABASE_URL=postgresql://mcphub:password@localhost:5432/mcphub_dev

# 认证
JWT_SECRET=dev-secret-key
JWT_EXPIRES_IN=24h

# 小智平台（开发环境）
XIAOZHI_ENABLED=true
XIAOZHI_WEBSOCKET_URL=wss://api-dev.xiaozhi.me/mcp/?token=your-dev-jwt-token
XIAOZHI_LOG_LEVEL=debug
XIAOZHI_LOG_SYNC_EVENTS=true

# OpenAI（开发时可选）
# OPENAI_API_KEY=your-dev-key

# MCP 服务器 API 密钥（开发）
AMAP_MAPS_API_KEY=your-dev-amap-key

# 调试
DEBUG=mcphub:*,xiaozhi:*
DEV_TOOLS_ENABLED=true
HOT_RELOAD=true
```

### 生产环境

```env
# .env.production
NODE_ENV=production
PORT=3000
LOG_LEVEL=info
LOG_FORMAT=json

# 数据库
DATABASE_URL=postgresql://mcphub:secure-password@db.example.com:5432/mcphub
DB_SSL=true
DB_POOL_MAX=20

# 安全
JWT_SECRET=your-super-secure-production-secret
SESSION_SECRET=your-session-secret
BCRYPT_ROUNDS=14

# 小智平台（生产环境）
XIAOZHI_ENABLED=true
XIAOZHI_WEBSOCKET_URL=wss://api.xiaozhi.me/mcp/?token=your-production-jwt-token
XIAOZHI_LOG_LEVEL=info
XIAOZHI_LOG_CONNECTION_EVENTS=true
XIAOZHI_LOG_SYNC_EVENTS=false
XIAOZHI_AUTO_SYNC=true
XIAOZHI_SYNC_INTERVAL=30000

# 外部服务
OPENAI_API_KEY=your-production-openai-key
REDIS_URL=redis://redis.example.com:6379

# MCP 服务器 API 密钥（生产）
AMAP_MAPS_API_KEY=your-production-amap-key
SLACK_BOT_TOKEN=xoxb-your-production-slack-bot-token
SLACK_TEAM_ID=T1234567890
GITHUB_TOKEN=ghp_your-production-github-token

# 监控
METRICS_ENABLED=true
PERFORMANCE_MONITORING=true

# 优化
CLUSTER_MODE=true
GC_OPTIMIZE=true
```

### Docker 环境

```env
# .env.docker
NODE_ENV=production
HOST=0.0.0.0
PORT=3000

# 使用 Docker 网络的服务名
DATABASE_URL=postgresql://mcphub:password@postgres:5432/mcphub
REDIS_URL=redis://redis:6379

# 安全
JWT_SECRET_FILE=/run/secrets/jwt_secret
DB_PASSWORD_FILE=/run/secrets/db_password

# 小智平台（Docker）
XIAOZHI_ENABLED=true
XIAOZHI_WEBSOCKET_URL_FILE=/run/secrets/xiaozhi_websocket_url
XIAOZHI_LOG_LEVEL=info

# 容器中的文件路径
MCP_SETTINGS_FILE=/app/mcp_settings.json
UPLOAD_DIR=/app/data/uploads
LOG_FILE=/app/logs/mcphub.log

# MCP 服务器 API 密钥（通过 Docker secrets）
AMAP_MAPS_API_KEY_FILE=/run/secrets/amap_api_key
SLACK_BOT_TOKEN_FILE=/run/secrets/slack_bot_token
GITHUB_TOKEN_FILE=/run/secrets/github_token
```

## 环境变量加载

xiaozhi-mcphub 按以下顺序加载环境变量：

1. 系统环境变量
2. `.env.local`（被 git 忽略）
3. `.env.{NODE_ENV}`（例如 `.env.production`）
4. `.env`

### 使用 dotenv-expand

xiaozhi-mcphub 支持变量扩展：

```env
BASE_URL=https://api.example.com
API_ENDPOINT=${BASE_URL}/v1
DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}

# 小智平台动态配置
XIAOZHI_BASE_URL=https://api.xiaozhi.me
XIAOZHI_WEBSOCKET_URL=${XIAOZHI_BASE_URL}/mcp/?token=${XIAOZHI_JWT_TOKEN}
```

## 安全最佳实践

::: warning 安全注意事项
1. **永远不要提交密钥**到版本控制
2. **为生产使用强唯一密钥**
3. **定期轮换密钥**
4. **使用特定于环境的文件**
5. **在启动时验证所有环境变量**
6. **为容器部署使用 Docker 密钥**
7. **保护小智平台 JWT 令牌**
8. **使用环境变量存储所有 API 密钥**
:::

## 验证

xiaozhi-mcphub 在启动时验证环境变量。无效配置将阻止应用程序启动并提供有用的错误消息。

### 生产环境必需变量

- `JWT_SECRET`
- `DATABASE_URL` 或单独的数据库组件
- `OPENAI_API_KEY`（如果启用智能路由）
- `XIAOZHI_WEBSOCKET_URL`（如果启用小智集成）

### 验证示例

```bash
# 检查必需的环境变量
if [ -z "$JWT_SECRET" ]; then
  echo "错误：JWT_SECRET 环境变量未设置"
  exit 1
fi

if [ -z "$DATABASE_URL" ]; then
  echo "错误：DATABASE_URL 环境变量未设置"
  exit 1
fi

if [ "$XIAOZHI_ENABLED" = "true" ] && [ -z "$XIAOZHI_WEBSOCKET_URL" ]; then
  echo "错误：小智平台已启用但 XIAOZHI_WEBSOCKET_URL 未设置"
  exit 1
fi
```

### 小智平台连接验证

```bash
# 验证小智 WebSocket URL 格式
if [[ ! "$XIAOZHI_WEBSOCKET_URL" =~ ^wss://.*token=.* ]]; then
  echo "错误：XIAOZHI_WEBSOCKET_URL 格式不正确，应包含 token 参数"
  exit 1
fi

# 测试小智连接
curl -f "${XIAOZHI_WEBSOCKET_URL%/*}/health" || {
  echo "警告：无法连接到小智平台健康检查端点"
}
```

::: tip 提示
使用 `.env.example` 文件作为模板，包含所有可用变量及其默认值。这有助于新开发者快速了解所需的配置。

```bash
# 创建示例配置文件
cp .env.example .env.local
# 编辑 .env.local 并填入您的实际值
```
:::

这个全面的环境配置确保 xiaozhi-mcphub 可以为任何部署场景正确配置，特别是与小智AI平台的集成。 