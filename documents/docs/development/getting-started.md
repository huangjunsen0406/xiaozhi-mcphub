# 开发环境搭建

本指南将帮助您搭建 xiaozhi-mcphub 的开发环境，为小智AI平台专用MCP桥接系统贡献代码。

## 开发环境要求

在开始之前，请确保您已安装以下软件：

- **Node.js**（版本 18 或更高）
- **pnpm**（推荐的包管理器）
- **Git**
- **Docker**（可选，用于容器化开发）
- **Python 3.13**（用于 MCP 服务器开发）

## 克隆项目

从 GitHub 克隆 xiaozhi-mcphub 仓库：

```bash
git clone https://github.com/huangjunsen0406/xiaozhi-mcphub.git
cd xiaozhi-mcphub
```

## 安装依赖

使用 pnpm 安装项目依赖：

```bash
pnpm install
```

对于前端开发，还需要安装前端依赖：

```bash
cd frontend
npm install
cd ..
```

## 环境配置

### 1. 后端环境配置

在根目录创建 `.env` 文件：

```bash
cp .env.example .env
```

配置以下环境变量：

```bash
# 服务器配置
PORT=3000
NODE_ENV=development
HOST=0.0.0.0

# 数据库配置
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
XIAOZHI_CALLBACK_URL=http://localhost:3000/api/xiaozhi/callback

# 智能路由配置
OPENAI_API_KEY=your-openai-api-key
SMART_ROUTING_ENABLED=true
ROUTING_STRATEGY=performance

# 日志配置
LOG_LEVEL=debug
LOG_FILE_ENABLED=true
LOG_XIAOZHI_ENABLED=true

# MCP 服务器配置
MCP_SERVERS_PATH=./mcp_settings.json
MCP_LOG_LEVEL=debug
```

### 2. 前端环境配置

在 `frontend` 目录创建 `.env` 文件：

```bash
cd frontend
cp .env.example .env
```

配置前端环境变量：

```bash
VITE_API_BASE_URL=http://localhost:3000
VITE_XIAOZHI_ENABLED=true
VITE_WEBSOCKET_URL=ws://localhost:3000
```

### 3. 数据库设置

如果使用 PostgreSQL，创建开发数据库：

```bash
# 创建数据库
createdb xiaozhi_mcphub

# 或者使用 Docker 运行 PostgreSQL
docker run --name xiaozhi-postgres \
  -e POSTGRES_DB=xiaozhi_mcphub \
  -e POSTGRES_USER=username \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  -d postgres:15
```

启动 Redis 服务：

```bash
# 使用 Docker 运行 Redis
docker run --name xiaozhi-redis \
  -p 6379:6379 \
  -d redis:7-alpine
```

### 4. MCP 服务器配置

创建或修改 `mcp_settings.json`，包含小智AI平台专用配置：

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
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--headless"],
      "xiaozhi_compatible": true
    },
    "fetch": {
      "command": "uvx",
      "args": ["mcp-server-fetch"],
      "xiaozhi_compatible": true
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "your-github-token"
      },
      "xiaozhi_compatible": true
    }
  },
  "xiaozhi": {
    "autoConnect": true,
    "reconnectInterval": 5000,
    "maxReconnectAttempts": 10,
    "syncSettings": {
      "autoSync": true,
      "syncInterval": 30000,
      "retryOnFailure": true
    }
  }
}
```

## 启动开发服务器

### 同时启动后端和前端

```bash
pnpm dev
```

这将启动：

- 后端服务器：`http://localhost:3000`
- 前端开发服务器：`http://localhost:5173`

### 仅运行后端

```bash
pnpm backend:dev
```

或使用调试模式：

```bash
pnpm backend:debug
```

### 仅运行前端

```bash
cd frontend
npm run dev
```

### 后台模式启动

使用 PM2 启动后端服务（适用于生产环境或长期开发）：

```bash
# 安装 PM2（如果尚未安装）
npm install -g pm2

# 启动后端服务
pm2 start src/index.ts --name xiaozhi-mcphub-dev --interpreter tsx

# 查看进程状态
pm2 status

# 查看日志
pm2 logs xiaozhi-mcphub-dev

# 停止服务
pm2 stop xiaozhi-mcphub-dev

# 重启服务
pm2 restart xiaozhi-mcphub-dev
```

### 构建项目

构建完整项目：

```bash
pnpm build
```

构建 Docker 镜像：

```bash
docker build -t xiaozhi-mcphub:dev .
```

## 代码结构

```
xiaozhi-mcphub/
├── src/                     # 后端源代码
│   ├── controllers/         # Express 控制器
│   │   ├── xiaozhiController.ts  # 小智平台集成
│   │   └── toolController.ts    # MCP 工具管理
│   ├── routes/             # API 路由
│   ├── services/           # 业务逻辑
│   │   ├── xiaozhiClientService.ts  # 小智客户端服务
│   │   └── mcpService.ts          # MCP 服务器管理
│   ├── models/             # 数据库模型
│   ├── middlewares/        # Express 中间件
│   └── utils/              # 工具函数
│       └── smartRouting.ts # 智能路由算法
├── frontend/               # 前端 React 应用
│   ├── src/
│   │   ├── components/     # React 组件
│   │   ├── pages/         # 页面组件
│   │   ├── services/      # API 服务
│   │   ├── contexts/      # React 上下文
│   │   └── hooks/         # 自定义钩子
├── docs/                   # VitePress 文档
├── bin/                    # CLI 脚本
├── scripts/                # 构建和工具脚本
├── mcp_settings.json       # MCP 服务器配置
└── docker-compose.yml      # Docker 编排文件
```

## 开发流程

### 代码检查和格式化

```bash
# 运行 ESLint
pnpm lint

# 自动修复 lint 问题
pnpm lint:fix

# 使用 Prettier 格式化代码
pnpm format
```

### 测试

```bash
# 运行所有测试
pnpm test

# 运行特定测试文件
pnpm test tests/auth.logic.test.ts

# 监视模式运行测试
pnpm test --watch

# 生成测试覆盖率报告
pnpm test:coverage
```

### 调试

### VS Code 调试配置

创建 `.vscode/launch.json` 文件以支持集成调试：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug XIAOZHI-MCPHUB",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/src/index.ts",
      "runtimeArgs": ["-r", "tsx/cjs"],
      "env": {
        "NODE_ENV": "development"
      },
      "console": "integratedTerminal",
      "skipFiles": ["<node_internals>/**"]
    }
  ]
}
```

### 后端调试

使用 Node.js 检查器调试后端：

```bash
pnpm backend:debug
```

然后将调试器连接到 `http://localhost:9229`。

### 日志调试

使用内置的日志系统进行调试：

```typescript
import { logger } from '@/utils/logger';

// 不同级别的日志
logger.debug('调试信息', { data });
logger.info('信息日志', { userId });
logger.warn('警告信息', { error });
logger.error('错误信息', { error, stack });
```

#### 小智平台连接调试

检查小智平台连接状态：

```bash
curl -X GET http://localhost:3000/api/xiaozhi/status
```

查看小智平台日志：

```bash
# 查看后端日志
tail -f logs/xiaozhi.log

# 查看 MCP 服务器日志
tail -f logs/mcp-servers.log
```

## 进行修改

### 后端开发

1. **控制器**：处理 HTTP 请求和小智平台 WebSocket 连接
2. **服务**：实现业务逻辑和 MCP 服务器管理
3. **模型**：定义数据库架构
4. **路由**：定义 API 端点
5. **中间件**：处理认证、日志和错误

### 前端开发

1. **组件**：可重用的 React 组件，支持中英文界面
2. **页面**：特定路由的组件
3. **服务**：API 通信和 WebSocket 连接
4. **钩子**：自定义 React 钩子
5. **上下文**：全局状态管理

### 添加新的 MCP 服务器

1. 在 `mcp_settings.json` 中添加服务器配置
2. 设置 `xiaozhi_compatible: true` 标志
3. 配置必要的环境变量
4. 测试与小智平台的集成
5. 更新文档

### 小智平台集成开发

1. 实现 WebSocket 连接处理
2. 添加工具同步逻辑
3. 处理连接重试和错误恢复
4. 实现智能路由算法
5. 添加监控和日志记录

## 常见开发任务

### 添加新的 API 端点

1. 在 `src/controllers/` 中创建或更新控制器
2. 在 `src/routes/` 中定义路由
3. 添加必要的中间件（认证、验证等）
4. 为新端点编写测试
5. 更新 API 文档

### 添加新的前端功能

1. 在 `frontend/src/components/` 中创建组件
2. 根据需要添加路由到 `App.tsx`
3. 实现 API 集成
4. 使用 Tailwind CSS 进行样式设计
5. 添加国际化支持（中英文）

### 集成新的中国服务

xiaozhi-mcphub 专门支持中国本土服务，添加新服务时：

1. 确保 API 密钥管理（如高德地图、百度等）
2. 处理中文编码和本地化
3. 实现智能路由优化
4. 添加服务监控和故障转移

## 故障排除

### 常见问题

**端口冲突**：
```bash
# 检查端口占用
lsof -i :3000
lsof -i :5173

# 杀死占用进程
kill -9 <PID>

# 或者使用不同端口启动
PORT=3001 pnpm backend:dev
```

**数据库连接失败**：
```bash
# 检查 PostgreSQL 状态
pg_ctl status
systemctl status postgresql

# 测试连接
psql -h localhost -U username -d xiaozhi_mcphub
```

**小智平台连接问题**：
```bash
# 测试 WebSocket 连接
wscat -c wss://api.xiaozhi.ai/ws

# 检查 API 密钥
curl -H "Authorization: Bearer $XIAOZHI_API_KEY" \
     https://api.xiaozhi.ai/health
```

**MCP 服务器启动失败**：
```bash
# 检查服务器配置
node -e "console.log(JSON.parse(require('fs').readFileSync('mcp_settings.json', 'utf8')))"

# 手动测试 MCP 服务器
npx @playwright/mcp@latest --headless
```

**前端构建错误**：
```bash
# 清除依赖缓存
cd frontend
rm -rf node_modules package-lock.json
npm install

# 清除 Vite 缓存
rm -rf .vite
```

**TypeScript 编译错误**：
```bash
# 清理构建缓存
pnpm clean

# 重新安装类型定义
npm install @types/node @types/express

# 重新构建
pnpm build
```

**依赖管理问题**：
```bash
# 清理 pnpm 缓存
pnpm store prune

# 重新安装所有依赖
rm -rf node_modules pnpm-lock.yaml
pnpm install

# 更新依赖到最新版本
pnpm update
```

### 获取帮助

- 在 GitHub 上提交 issue 报告问题：[https://github.com/huangjunsen0406/xiaozhi-mcphub/issues](https://github.com/huangjunsen0406/xiaozhi-mcphub/issues)
- 查看小智AI平台文档获取集成指导

## 进阶开发主题

### 架构设计模式

了解 xiaozhi-mcphub 采用的设计模式：

- **控制器层**：处理 HTTP 请求和 WebSocket 连接
- **服务层**：实现核心业务逻辑
- **数据访问层**：数据库操作和缓存管理
- **中间件层**：认证、日志、错误处理

### 性能优化技巧

```bash
# 性能分析
npm run analyze

# 内存使用情况
node --inspect src/index.ts

# 性能监控（开发环境）
NODE_ENV=development DEBUG=performance pnpm dev
```

### 扩展开发

#### 添加新的 MCP 服务器
1. 在 `mcp_settings.json` 中添加配置
2. 设置 `xiaozhi_compatible: true`
3. 配置必要的环境变量
4. 测试集成
5. 更新文档

#### 开发小智平台集成功能
1. 实现 WebSocket 消息处理
2. 添加工具同步逻辑
3. 处理重连和错误恢复
4. 实现智能路由
5. 添加监控和日志

## 下一步

- 探索[配置选项](/configuration/environment-variables)进行高级配置
- 查看[MCP 设置](/configuration/mcp-settings)了解服务器管理
- 学习[Docker 部署](/configuration/docker-setup)进行容器化开发

::: tip 开发提示
- 开发时建议使用 `NODE_ENV=development` 以获得详细的错误信息
- 定期运行 `pnpm test` 确保代码质量
- 使用 `pnpm lint:fix` 自动修复代码风格问题
- 关注小智平台 WebSocket 连接状态，确保实时同步正常工作
:::

::: warning 注意事项
- 不要将 API 密钥提交到版本控制系统
- 确保所有新功能都有对应的测试用例
- 遵循项目的代码规范和提交消息格式
- 测试与小智平台的集成时注意 API 速率限制
::: 