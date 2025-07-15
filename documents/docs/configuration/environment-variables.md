# 环境变量配置

xiaozhi-mcphub 使用环境变量进行配置。本指南介绍实际支持的环境变量。

## 核心应用设置

### 服务器配置

| 变量        | 默认值        | 描述                                            |
| ----------- | ------------- | ----------------------------------------------- |
| `PORT`      | `3000`        | HTTP 服务器端口号                               |
| `HOST`      | `0.0.0.0`     | 服务器绑定的主机地址                            |
| `NODE_ENV`  | `development` | 应用环境（`development`、`production`、`test`） |
| `BASE_PATH` | -             | 应用基础路径（可选）                            |

```bash
PORT=3000
HOST=0.0.0.0
NODE_ENV=production
BASE_PATH=/mcphub
```

### 数据库配置

xiaozhi-mcphub 使用 PostgreSQL 数据库（需要 pgvector 扩展支持）：

| 变量           | 默认值 | 描述                  |
| -------------- | ------ | --------------------- |
| `DATABASE_URL` | -      | PostgreSQL 连接字符串 |

```bash
# PostgreSQL 连接字符串（必需）
DATABASE_URL=postgresql://username:password@localhost:5432/xiaozhi_mcphub
```

## 认证与安全

### JWT 配置

| 变量             | 默认值 | 描述                     |
| ---------------- | ------ | ------------------------ |
| `JWT_SECRET`     | -      | JWT 令牌签名密钥（必需） |
| `JWT_EXPIRES_IN` | `24h`  | JWT 令牌过期时间         |

```bash
JWT_SECRET=your-super-secret-key-change-this-in-production
JWT_EXPIRES_IN=24h
```

## MCP 服务器配置

### 基本设置

| 变量                 | 默认值              | 描述                      |
| -------------------- | ------------------- | ------------------------- |
| `MCP_SERVERS_PATH`   | `mcp_settings.json` | MCP 设置文件路径          |
| `MCP_LOG_LEVEL`      | `info`              | MCP 服务器日志级别        |
| `REQUEST_TIMEOUT`    | `60000`             | 请求超时时间（毫秒）      |
| `INIT_TIMEOUT`       | `300000`            | 初始化超时时间（毫秒）    |

```bash
MCP_SERVERS_PATH=./mcp_settings.json
MCP_LOG_LEVEL=info
REQUEST_TIMEOUT=60000
INIT_TIMEOUT=300000
```

### MCP 服务器 API 密钥

这些环境变量用于 MCP 服务器，配置在各自的环境变量中：

| 变量                             | 默认值 | 描述                    |
| -------------------------------- | ------ | ----------------------- |
| `AMAP_MAPS_API_KEY`              | -      | 高德地图 API 密钥       |
| `SLACK_BOT_TOKEN`                | -      | Slack Bot Token         |
| `SLACK_TEAM_ID`                  | -      | Slack Team ID           |
| `GITHUB_PERSONAL_ACCESS_TOKEN`   | -      | GitHub Personal Access Token |
| `ANTHROPIC_API_KEY`              | -      | Anthropic API 密钥      |

```bash
# 高德地图配置
AMAP_MAPS_API_KEY=your-amap-api-key

# Slack 配置
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
SLACK_TEAM_ID=T1234567890

# GitHub 配置
GITHUB_PERSONAL_ACCESS_TOKEN=ghp_your-github-personal-access-token

# Anthropic 配置（用于某些MCP服务器）
ANTHROPIC_API_KEY=your-anthropic-api-key
```

## 智能路由配置

智能路由使用 OpenAI API 和 PostgreSQL 向量搜索：

| 变量                     | 默认值                   | 描述                            |
| ------------------------ | ------------------------ | ------------------------------- |
| `OPENAI_API_KEY`         | -                        | OpenAI API 密钥（用于智能路由） |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-ada-002` | 向量嵌入模型                    |

```bash
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_EMBEDDING_MODEL=text-embedding-ada-002
```

## 日志配置

| 变量               | 默认值 | 描述                             |
| ------------------ | ------ | -------------------------------- |
| `LOG_LEVEL`        | `info` | 日志级别（`error`、`warn`、`info`、`debug`） |
| `LOG_FILE_ENABLED` | `false`| 是否启用文件日志                  |

```bash
LOG_LEVEL=info
LOG_FILE_ENABLED=true
```

## 开发与调试

| 变量    | 默认值 | 描述                            |
| ------- | ------ | ------------------------------- |
| `DEBUG` | -      | 调试命名空间（例如 `mcphub:*`） |

```bash
DEBUG=mcphub:*
```

## 配置示例

### 开发环境

```bash
# .env.development
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# 数据库
DATABASE_URL=postgresql://mcphub:password@localhost:5432/xiaozhi_mcphub_dev

# 认证
JWT_SECRET=dev-secret-key-change-in-production
JWT_EXPIRES_IN=24h

# MCP 配置
MCP_SERVERS_PATH=./mcp_settings.json
MCP_LOG_LEVEL=debug

# MCP 服务器 API 密钥（开发）
AMAP_MAPS_API_KEY=your-dev-amap-key
GITHUB_PERSONAL_ACCESS_TOKEN=ghp_your-dev-github-token

# 智能路由（可选）
OPENAI_API_KEY=sk-your-dev-openai-key

# 调试
DEBUG=mcphub:*
LOG_FILE_ENABLED=true
```

### 生产环境

```bash
# .env.production
NODE_ENV=production
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=info

# 数据库
DATABASE_URL=postgresql://mcphub:secure-password@db.example.com:5432/xiaozhi_mcphub

# 安全
JWT_SECRET=your-super-secure-production-secret-64-chars-long
JWT_EXPIRES_IN=24h

# MCP 配置
MCP_SERVERS_PATH=/app/mcp_settings.json
MCP_LOG_LEVEL=info
REQUEST_TIMEOUT=60000

# MCP 服务器 API 密钥（生产）
AMAP_MAPS_API_KEY=your-production-amap-key
SLACK_BOT_TOKEN=xoxb-your-production-slack-bot-token
GITHUB_PERSONAL_ACCESS_TOKEN=ghp_your-production-github-token

# 智能路由
OPENAI_API_KEY=sk-your-production-openai-key

# 日志
LOG_FILE_ENABLED=true
```

### Docker 环境

```bash
# .env.docker
NODE_ENV=production
HOST=0.0.0.0
PORT=3000

# 使用 Docker 网络的服务名
DATABASE_URL=postgresql://mcphub:password@postgres:5432/xiaozhi_mcphub

# 安全
JWT_SECRET=your-docker-secret-key

# 容器中的文件路径
MCP_SERVERS_PATH=/app/mcp_settings.json

# MCP 服务器 API 密钥
AMAP_MAPS_API_KEY=your-amap-api-key
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token
GITHUB_PERSONAL_ACCESS_TOKEN=ghp_your-github-token

# 日志
LOG_LEVEL=info
LOG_FILE_ENABLED=true
```

## 小智平台集成配置

**重要**：小智平台集成配置不使用环境变量，而是在 `mcp_settings.json` 文件中配置。请参考 [MCP 设置文档](/configuration/mcp-settings) 了解详情。

## 环境变量加载

xiaozhi-mcphub 按以下顺序加载环境变量：

1. 系统环境变量
2. `.env.local`（被 git 忽略）
3. `.env.{NODE_ENV}`（例如 `.env.production`）
4. `.env`

## 生产环境必需变量

以下变量在生产环境中是必需的：

- `JWT_SECRET` - JWT 令牌签名密钥
- `DATABASE_URL` - PostgreSQL 数据库连接字符串
- `OPENAI_API_KEY` - OpenAI API 密钥（如果使用智能路由）

## 安全最佳实践

::: warning 安全注意事项
1. **永远不要提交密钥**到版本控制
2. **为生产使用强唯一密钥**
3. **定期轮换 API 密钥**
4. **使用特定于环境的文件**
5. **在容器部署中使用 Docker secrets**
:::

## 验证

xiaozhi-mcphub 在启动时验证关键环境变量。缺少必需变量将阻止应用程序启动。

### 检查配置

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
```

::: tip 提示
使用 `.env.example` 文件作为模板：

```bash
# 创建配置文件
cp .env.example .env
# 编辑 .env 并填入您的实际值
```
:::

此配置确保 xiaozhi-mcphub 能够正确运行，包括 MCP 服务器管理和智能路由功能。