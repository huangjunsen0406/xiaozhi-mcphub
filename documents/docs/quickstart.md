# 快速开始

本指南将帮助您在 5 分钟内完成 XIAOZHI-MCPHUB 的部署和配置，并连接您的第一个 MCP 服务器。

## 前提条件

在开始之前，请确保您的系统满足以下要求：

### 系统要求
- **操作系统**: Linux、macOS 或 Windows
- **内存**: 最少 2GB RAM（推荐 4GB+）
- **存储**: 至少 1GB 可用空间
- **网络**: 稳定的互联网连接

### 软件依赖
- **Node.js**: 18.0+ 版本
- **Docker**: 最新版本（可选，用于容器化部署）
- **Git**: 用于代码管理

检查版本：
```bash
node --version  # 应该 >= 18.0.0
npm --version   # 应该 >= 8.0.0
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
npm install
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

# 数据库配置
DATABASE_URL=postgresql://user:password@localhost:5432/mcphub

# JWT 密钥（请更改为安全的随机字符串）
JWT_SECRET=your-super-secret-jwt-key-change-me

# 管理员账户
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=admin123
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

### 开发模式启动

```bash
# 初始化数据库
npm run db:setup

# 启动开发服务器
npm run dev
```

### 生产模式启动

```bash
# 构建应用
npm run build

# 启动生产服务器
npm start
```

> **注意**: 开发模式下，XIAOZHI-MCPHUB 会在 `http://localhost:3000` 启动，并具有热重载功能。

## 首次访问和配置

### 1. 访问管理界面

打开浏览器，访问 `http://localhost:3000`，您将看到 XIAOZHI-MCPHUB 的欢迎页面。

### 2. 登录管理员账户

使用您在 `.env` 文件中设置的管理员凭据登录：

- **邮箱**: `admin@example.com`
- **密码**: `admin123`

> **警告**: 首次登录后，请立即更改默认密码以确保安全！

### 3. 完成初始配置

登录后，系统会引导您完成初始配置：

1. **更改管理员密码**
2. **设置组织信息**
3. **配置基本设置**

## 添加您的第一个 MCP 服务器

### 1. 准备 MCP 服务器

如果您还没有 MCP 服务器，可以使用我们的示例服务器进行测试：

```bash
# 克隆示例服务器
git clone https://github.com/huangjunsen0406/example-mcp-server.git
cd example-mcp-server

# 安装依赖并启动
npm install
npm start
```

示例服务器将在 `http://localhost:3001` 启动。

### 2. 在 XIAOZHI-MCPHUB 中添加服务器

在 XIAOZHI-MCPHUB 管理界面中：

1. 点击 **"添加服务器"** 按钮
2. 填写服务器信息：
   ```
   名称: Example MCP Server
   端点: http://localhost:3001
   描述: 示例 MCP 服务器用于测试
   ```
3. 选择功能类型（如：chat、completion、analysis）
4. 点击 **"测试连接"** 验证服务器可达性
5. 点击 **"保存"** 完成添加

### 3. 验证服务器状态

添加成功后，您应该能在服务器列表中看到新添加的服务器，状态显示为 **"活跃"**（绿色）。

## 测试路由功能

### 发送测试请求

使用 cURL 或其他 HTTP 客户端测试路由功能：

```bash
# 发送聊天请求
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "Hello, this is a test message!"
      }
    ]
  }'
```

### 查看请求日志

在 XIAOZHI-MCPHUB 管理界面的 **"监控"** 页面中，您可以实时查看：

- 请求数量和响应时间
- 服务器健康状态
- 错误日志和统计

## 后续步骤

恭喜！您已经成功部署了 XIAOZHI-MCPHUB 并添加了第一个 MCP 服务器。接下来您可以：

### 配置负载均衡
学习如何配置智能路由和负载均衡策略
[查看智能路由功能](/features/smart-routing)

### 添加更多服务器
了解服务器管理的高级功能
[查看服务器管理](/features/server-management)

### 设置监控告警
配置性能监控和告警通知
[查看监控功能](/features/monitoring)

### API 集成
将 XIAOZHI-MCPHUB 集成到您的应用程序中
[查看 API 参考](/api-reference/introduction)

## 常见问题

### 无法连接到 MCP 服务器

**可能原因**：
- 服务器地址错误或服务器未启动
- 防火墙阻止连接
- 网络配置问题

**解决方案**：
1. 验证服务器是否正在运行：`curl http://localhost:3001/health`
2. 检查防火墙设置
3. 确认网络连接正常

### 服务器状态显示为离线

**可能原因**：
- 健康检查失败
- 服务器响应超时
- 服务器崩溃或重启

**解决方案**：
1. 检查服务器日志
2. 调整健康检查间隔
3. 重启服务器进程

### 忘记管理员密码

**解决方案**：
```bash
# 重置管理员密码
npm run reset-admin-password
```
或者删除数据库文件重新初始化：
```bash
rm data/mcphub.db
npm run db:setup
```

## 获取帮助

如果您在设置过程中遇到问题：

- 📖 查看 [完整文档](/development/getting-started)
- 🐛 在 [GitHub](https://github.com/huangjunsen0406/xiaozhi-mcphub/issues) 上报告问题
- 📧 发送邮件寻求技术支持 