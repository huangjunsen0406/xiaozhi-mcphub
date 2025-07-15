# 快速开始

本指南将帮助您在 5 分钟内完成 xiaozhi-mcphub 的部署和配置，开始使用小智AI平台专用的MCP桥接系统。

## 前提条件

在开始之前，请确保您的系统满足以下要求：

### 系统要求
- **操作系统**: Linux、macOS 或 Windows
- **内存**: 最少 2GB RAM（推荐 4GB+）
- **存储**: 至少 1GB 可用空间
- **网络**: 稳定的互联网连接

### 软件依赖
- **Node.js**: 18.0+ 版本
- **pnpm**: 10.11.0+ 版本（必需的包管理器）
- **Python**: 3.13+ 版本（用于 MCP 服务器开发）
- **Docker**: 最新版本（可选，用于容器化部署）
- **Git**: 用于代码管理

检查版本：
```bash
node --version  # 应该 >= 18.0.0
pnpm --version  # 应该 >= 10.11.0
python3 --version # 应该 >= 3.13.0
docker --version # 可选
```

## 安装 XIAOZHI-MCPHUB

### 方式一：克隆源代码（推荐）

#### 下载源代码

```bash
# 克隆主仓库
git clone https://github.com/huangjunsen0406/xiaozhi-mcphub.git
cd xiaozhi-mcphub

# 安装依赖
pnpm install
```

#### 配置环境

复制并编辑环境变量文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，设置基本配置：
```bash
# 服务器配置
PORT=3000
NODE_ENV=development
HOST=0.0.0.0

# 数据库配置（使用 PostgreSQL + pgvector）
DATABASE_URL=postgresql://username:password@localhost:5432/xiaozhi_mcphub
REDIS_URL=redis://localhost:6379

# JWT 认证配置
JWT_SECRET=your-super-secret-key-for-xiaozhi
JWT_EXPIRES_IN=24h

# 小智平台集成配置
XIAOZHI_ENABLED=true
XIAOZHI_WEBSOCKET_URL=wss://api.xiaozhi.ai/ws
XIAOZHI_API_KEY=your-xiaozhi-api-key
XIAOZHI_CLIENT_ID=your-xiaozhi-client-id

# MCP 服务器配置
MCP_SERVERS_PATH=./mcp_settings.json
MCP_LOG_LEVEL=info

# 日志配置
LOG_LEVEL=info
LOG_FILE_ENABLED=true
```

### 方式二：使用 Docker

#### Docker 快速部署

使用 Docker Compose 一键部署：

```bash
# 克隆项目
git clone https://github.com/huangjunsen0406/xiaozhi-mcphub.git
cd xiaozhi-mcphub

# 使用 Docker Compose 启动
docker-compose up -d
```

或者直接运行 Docker 容器：
```bash
docker run -d \
  --name xiaozhi-mcphub \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e JWT_SECRET=your-secret-key \
  xiaozhi-mcphub:latest
```

## 启动 XIAOZHI-MCPHUB

### 配置 MCP 服务器

创建或编辑 `mcp_settings.json` 文件：

```json
{
  "mcpServers": {
    "amap": {
      "command": "python",
      "args": ["-m", "mcp_amap"],
      "env": {
        "AMAP_MAPS_API_KEY": "your-amap-api-key"
      },
      "xiaozhi_compatible": true
    },
    "fetch": {
      "command": "uvx",
      "args": ["mcp-server-fetch"],
      "xiaozhi_compatible": true
    }
  },
  "xiaozhi": {
    "autoConnect": true,
    "reconnectInterval": 5000,
    "maxReconnectAttempts": 10
  }
}
```

### 开发模式启动

```bash
# 同时启动后端和前端
pnpm dev
```

这将启动：
- 后端服务器：`http://localhost:3000`
- 前端开发服务器：`http://localhost:5173`

### 生产模式启动

```bash
# 构建完整项目
pnpm build

# 启动生产服务器
pnpm start
```

> **注意**: 开发模式下，后端在 `http://localhost:3000`，前端在 `http://localhost:5173`，均具有热重载功能。

## 首次访问和配置

### 1. 访问前端界面

打开浏览器，访问：
- **前端界面**: `http://localhost:5173`（开发模式）
- **API 端点**: `http://localhost:3000`（后端服务）

### 2. 验证小智平台连接

检查小智平台连接状态：

```bash
curl -X GET http://localhost:3000/api/xiaozhi/status
```

### 3. 测试 MCP 服务器

验证 MCP 服务器是否正常启动：

```bash
# 查看已连接的 MCP 服务器列表
curl -X GET http://localhost:3000/api/mcp/servers

# 查看可用工具
curl -X GET http://localhost:3000/api/mcp/tools
```


## 测试工具调用功能

### 调用 MCP 工具

使用 cURL 测试 MCP 工具调用：

```bash
# 调用高德地图工具（如果已配置）
curl -X POST http://localhost:3000/api/mcp/tools/call \
  -H "Content-Type: application/json" \
  -d '{
    "serverId": "amap",
    "toolName": "search_poi",
    "arguments": {
      "keywords": "北京天安门",
      "city": "北京"
    }
  }'
```

### 测试小智平台同步

验证工具同步到小智平台：

```bash
# 手动触发工具同步
curl -X POST http://localhost:3000/api/xiaozhi/sync-tools

# 查看同步状态
curl -X GET http://localhost:3000/api/xiaozhi/sync-status
```

### 查看系统日志

在开发环境中查看实时日志：

```bash
# 查看后端日志
tail -f logs/app.log

# 查看小智平台连接日志
tail -f logs/xiaozhi.log

# 查看 MCP 服务器日志
tail -f logs/mcp-servers.log
```

## 后续步骤

恭喜！您已经成功部署了 xiaozhi-mcphub 并配置了小智AI平台集成。接下来您可以：

### 配置更多 MCP 服务器
添加更多中国本土服务和国际化工具
[查看 MCP 设置指南](/configuration/mcp-settings)

### 智能路由配置
配置基于性能的智能工具路由
[查看智能路由功能](/features/smart-routing)

### 开发自定义功能
学习如何扩展和自定义系统功能
[查看开发指南](/development/getting-started)

## 常见问题

### MCP 服务器启动失败

**可能原因**：
- Python 环境配置问题
- MCP 服务器依赖缺失
- 环境变量配置错误

**解决方案**：
```bash
# 检查 Python 环境
python3 --version
pip3 list | grep mcp

# 手动安装 MCP 服务器
pip3 install mcp-server-fetch
uvx mcp-server-fetch

# 检查配置文件
node -e "console.log(JSON.parse(require('fs').readFileSync('mcp_settings.json', 'utf8')))"
```

### 小智平台连接失败

**可能原因**：
- API 密钥无效
- WebSocket 连接被阻止
- 网络配置问题

**解决方案**：
```bash
# 测试 API 密钥
curl -H "Authorization: Bearer $XIAOZHI_API_KEY" \
     https://api.xiaozhi.ai/health

# 测试 WebSocket 连接
wscat -c wss://api.xiaozhi.ai/ws

# 检查环境变量
echo $XIAOZHI_API_KEY
echo $XIAOZHI_CLIENT_ID
```

### 前端无法访问后端

**可能原因**：
- 端口冲突
- CORS 配置问题
- 前端配置错误

**解决方案**：
```bash
# 检查端口占用
lsof -i :3000
lsof -i :5173

# 使用不同端口启动
PORT=3001 pnpm backend:dev

# 检查前端环境变量
cd frontend && cat .env
```

### 数据库连接问题

**解决方案**：
```bash
# 检查 PostgreSQL 状态
pg_ctl status

# 创建数据库
createdb xiaozhi_mcphub

# 或使用 Docker 启动数据库
docker run --name xiaozhi-postgres \
  -e POSTGRES_DB=xiaozhi_mcphub \
  -e POSTGRES_USER=username \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 -d postgres:15
```

## 获取帮助

如果您在设置过程中遇到问题：

- 📖 查看 [开发指南](/development/getting-started) 获取详细配置说明
- 🔧 查看 [配置指南](/configuration/environment-variables) 了解环境变量
- 🏗️ 查看 [MCP 设置](/configuration/mcp-settings) 了解服务器配置
- 🐛 在 [GitHub Issues](https://github.com/huangjunsen0406/xiaozhi-mcphub/issues) 上报告问题
- 💬 查看小智AI平台文档获取集成帮助 