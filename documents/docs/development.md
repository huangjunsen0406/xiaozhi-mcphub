# 开发指南

本指南将帮助您搭建 XIAOZHI-MCPHUB 的本地开发环境，了解项目结构，并掌握开发工作流。

> **前提条件**：请确保已安装 Node.js 18+ 和 Git。

## 环境准备

### 系统要求

在开始开发之前，请确保您的系统满足以下要求：

#### 软件依赖
- **Node.js**: 18.0+ 版本
- **npm**: 8.0+ 版本
- **Git**: 最新版本
- **Docker**: 可选，用于容器化开发

#### 推荐工具
- **VS Code**: 推荐的代码编辑器
- **Postman**: API 测试工具
- **TablePlus**: 数据库管理工具
- **Docker Desktop**: 容器管理

### 验证环境

```bash
# 检查 Node.js 版本
node --version  # 应该 >= 18.0.0

# 检查 npm 版本
npm --version   # 应该 >= 8.0.0

# 检查 Git 版本
git --version

# 检查 Docker（可选）
docker --version
```

## 克隆项目

### 获取源代码

```bash
# 克隆主仓库
git clone https://github.com/huangjunsen0406/xiaozhi-mcphub.git
cd xiaozhi-mcphub

# 或者克隆您的 fork
git clone https://github.com/YOUR_USERNAME/xiaozhi-mcphub.git
cd xiaozhi-mcphub
```

### 项目结构

```
xiaozhi-mcphub/
├── src/                    # 源代码目录
│   ├── controllers/        # 控制器层
│   ├── middlewares/        # 中间件
│   ├── models/            # 数据模型
│   ├── routes/            # 路由定义
│   ├── services/          # 业务逻辑层
│   ├── utils/             # 工具函数
│   └── index.ts           # 应用入口
├── frontend/              # 前端代码
│   ├── src/               # React 源代码
│   ├── public/            # 静态资源
│   └── dist/              # 构建输出
├── tests/                 # 测试文件
├── docs/                  # 文档源码
├── docker/                # Docker 配置
├── scripts/               # 构建脚本
├── package.json           # 项目依赖
├── tsconfig.json          # TypeScript 配置
├── .env.example           # 环境变量示例
└── README.md              # 项目说明
```

## 安装依赖

### 安装项目依赖

```bash
# 安装生产和开发依赖
npm install

# 仅安装生产依赖
npm ci --only=production
```

### 全局工具安装

```bash
# 安装 TypeScript 编译器
npm install -g typescript

# 安装开发工具
npm install -g tsx nodemon

# 安装 XIAOZHI-MCPHUB CLI（可选）
npm install -g @xiaozhi-mcphub/cli
```

## 配置开发环境

### 环境变量配置

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑环境变量
nano .env
```

开发环境的 `.env` 配置示例：

```bash
# 应用配置
NODE_ENV=development
PORT=3000
HOST=localhost

# 数据库配置
DATABASE_URL=postgresql://user:password@localhost:5432/mcphub_dev

# JWT 配置
JWT_SECRET=dev-jwt-secret-key
JWT_EXPIRES_IN=7d

# 日志配置
LOG_LEVEL=debug
LOG_FORMAT=dev

# CORS 配置
CORS_ORIGIN=http://localhost:3000,http://localhost:3001

# 管理员账户
ADMIN_EMAIL=dev@xiaozhi-mcphub.io
ADMIN_PASSWORD=dev123

# 开发功能开关
ENABLE_DEBUG_ROUTES=true
ENABLE_SWAGGER=true
ENABLE_HOT_RELOAD=true
```

### 数据库初始化

```bash
# 运行数据库迁移
npm run db:migrate

# 填充测试数据
npm run db:seed
```

## 启动开发服务器

### 开发模式启动

```bash
# 启动开发服务器（带热重载）
npm run dev

# 或者使用 tsx 直接运行
npx tsx watch src/index.ts
```

### 后台模式启动

```bash
# 使用 PM2 启动（需要先安装 PM2）
npm install -g pm2
npm run dev:pm2

# 查看进程状态
pm2 status

# 查看日志
pm2 logs xiaozhi-mcphub-dev
```

### 验证启动

访问以下 URL 验证服务是否正常启动：

- **主页**: http://localhost:3000
- **健康检查**: http://localhost:3000/health
- **API 文档**: http://localhost:3000/api/docs
- **管理界面**: http://localhost:3000/admin

## 开发工作流

### 1. 功能开发流程

```bash
# 1. 创建功能分支
git checkout -b feature/your-feature-name

# 2. 进行开发...

# 3. 运行测试
npm test

# 4. 代码格式化
npm run lint:fix

# 5. 提交代码
git add .
git commit -m "feat: add your feature description"

# 6. 推送分支
git push origin feature/your-feature-name

# 7. 创建 Pull Request
```

### 2. 代码规范

XIAOZHI-MCPHUB 项目使用以下代码规范工具：

```bash
# 代码检查
npm run lint

# 自动修复
npm run lint:fix

# 格式化代码
npm run format

# 类型检查
npm run type-check
```

### 3. 测试开发

```bash
# 运行所有测试
npm test

# 运行单元测试
npm run test:unit

# 运行集成测试
npm run test:integration

# 运行测试并生成覆盖率报告
npm run test:coverage

# 监听模式运行测试
npm run test:watch
```

## 调试技巧

### 1. VS Code 调试配置

创建 `.vscode/launch.json` 文件：

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

### 2. 日志调试

使用内置的日志系统进行调试：

```typescript
import { logger } from '@/utils/logger';

// 不同级别的日志
logger.debug('调试信息', { data });
logger.info('信息日志', { userId });
logger.warn('警告信息', { error });
logger.error('错误信息', { error, stack });
```

### 3. 数据库调试

```bash
# 查看数据库连接状态
npm run db:status

# 重置数据库
npm run db:reset

# 查看迁移状态
npm run db:migrate:status
```

## 常用开发命令

### 项目管理

```bash
# 安装新依赖
npm install package-name
npm install -D package-name  # 开发依赖

# 更新依赖
npm update

# 清理缓存
npm cache clean --force

# 重新安装依赖
rm -rf node_modules package-lock.json
npm install
```

### 构建和部署

```bash
# 构建项目
npm run build

# 预览构建结果
npm run preview

# 构建 Docker 镜像
npm run docker:build

# 运行 Docker 容器
npm run docker:run
```

### 数据库操作

```bash
# 创建新迁移
npm run db:migrate:create -- --name your-migration-name

# 运行迁移
npm run db:migrate

# 回滚迁移
npm run db:migrate:rollback

# 重置数据库
npm run db:reset
```

## 常见问题

### 端口被占用

**错误信息**: `Error: listen EADDRINUSE :::3000`

**解决方案**:
```bash
# 查找占用端口的进程
lsof -i :3000

# 杀死进程
kill -9 PID

# 或者使用不同端口
PORT=3001 npm run dev
```

### 数据库连接失败

**可能原因**: 数据库配置错误或数据库服务未启动

**解决方案**: 
```bash
# 检查数据库服务状态
pg_ctl status

# 重新启动数据库服务
pg_ctl restart

# 检查连接配置
npm run db:test-connection
```

### TypeScript 编译错误

**解决方案**:
```bash
# 清理构建缓存
npm run clean

# 重新安装类型定义
npm install @types/node @types/express

# 重新构建
npm run build
```

## 进阶主题

### 架构设计
了解 XIAOZHI-MCPHUB 的整体架构和设计模式

### API 开发
学习如何开发和设计 RESTful API
[查看 API 参考](/api-reference/introduction)

### 性能优化
掌握性能分析和优化技巧

### 部署指南
了解生产环境部署的最佳实践
[查看 Docker 配置](/configuration/docker-setup) 