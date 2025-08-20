# 服务器管理

## 概述

XIAOZHI-MCPHUB 的服务器管理系统允许您从单个仪表板集中配置、监控和控制多个 MCP（Model Context Protocol）服务器。所有更改都会实时应用，无需重启服务器。

## 添加 MCP 服务器

### 通过仪表板

1. **访问仪表板**: 导航到 `http://localhost:3000` 并登录
2. **点击"添加服务器"**: 位于服务器部分
3. **填写服务器详细信息**:
   - **名称**: 服务器的唯一标识符
   - **命令**: 可执行命令（例如 `npx`、`uvx`、`python`）
   - **参数**: 命令参数数组
   - **环境变量**: 环境设置的键值对
   - **工作目录**: 命令的可选工作目录

### 通过配置文件

编辑您的 `mcp_settings.json` 文件：

```json
{
  "mcpServers": {
    "server-name": {
      "command": "command-to-run",
      "args": ["arg1", "arg2"],
      "env": {
        "API_KEY": "your-api-key",
        "CONFIG_VALUE": "some-value"
      },
      "cwd": "/optional/working/directory"
    }
  }
}
```

### 通过 API

使用 REST API 以编程方式添加服务器：

```bash
curl -X POST http://localhost:3000/api/servers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "fetch-server",
    "command": "uvx",
    "args": ["mcp-server-fetch"],
    "env": {}
  }'
```

## 流行的 MCP 服务器示例

### Web Fetch 服务器

提供网页抓取和 HTTP 请求功能：

```json
{
  "fetch": {
    "command": "uvx",
    "args": ["mcp-server-fetch"]
  }
}
```

**可用工具**:
- `fetch`: 发出 HTTP 请求
- `fetch_html`: 抓取网页
- `fetch_json`: 从 API 获取 JSON 数据

### Playwright 浏览器自动化

用于网页交互的浏览器自动化：

```json
{
  "playwright": {
    "command": "npx",
    "args": ["@playwright/mcp@latest", "--headless"]
  }
}
```

**可用工具**:
- `playwright_navigate`: 导航到网页
- `playwright_screenshot`: 截屏
- `playwright_click`: 点击元素
- `playwright_fill`: 填写表单

### 文件系统操作

文件和目录管理：

```json
{
  "filesystem": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/allowed/path"]
  }
}
```

**可用工具**:
- `read_file`: 读取文件内容
- `write_file`: 写入文件
- `create_directory`: 创建目录
- `list_directory`: 列出目录内容

### SQLite 数据库

数据库操作：

```json
{
  "sqlite": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-sqlite", "/path/to/database.db"]
  }
}
```

**可用工具**:
- `execute_query`: 执行 SQL 查询
- `describe_tables`: 获取表模式
- `create_table`: 创建新表

### Slack 集成

Slack 工作区集成：

```json
{
  "slack": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-slack"],
    "env": {
      "SLACK_BOT_TOKEN": "xoxb-your-bot-token",
      "SLACK_TEAM_ID": "T1234567890"
    }
  }
}
```

**可用工具**:
- `send_slack_message`: 向频道发送消息
- `list_slack_channels`: 列出可用频道
- `get_slack_thread`: 获取线程消息

### GitHub 集成

GitHub 仓库操作：

```json
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_your_token"
    }
  }
}
```

**可用工具**:
- `create_or_update_file`: 创建/更新仓库文件
- `search_repositories`: 搜索 GitHub 仓库
- `create_issue`: 创建问题
- `create_pull_request`: 创建拉取请求

### Google Drive

Google Drive 文件操作：

```json
{
  "gdrive": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-gdrive"],
    "env": {
      "GDRIVE_CLIENT_ID": "your-client-id",
      "GDRIVE_CLIENT_SECRET": "your-client-secret",
      "GDRIVE_REDIRECT_URI": "your-redirect-uri"
    }
  }
}
```

**可用工具**:
- `gdrive_list`: 列出文件和文件夹
- `gdrive_read`: 读取文件内容
- `gdrive_create`: 创建新文件

## 服务器状态管理

### 查看服务器状态

通过仪表板或 API 监控服务器状态：

```bash
# 获取所有服务器状态
curl http://localhost:3000/api/servers/status

# 获取特定服务器状态
curl http://localhost:3000/api/servers/my-server/status
```

### 启动和停止服务器

```bash
# 启动服务器
curl -X POST http://localhost:3000/api/servers/my-server/start

# 停止服务器
curl -X POST http://localhost:3000/api/servers/my-server/stop

# 重启服务器
curl -X POST http://localhost:3000/api/servers/my-server/restart
```

### 健康检查

配置自动健康检查：

```json
{
  "healthCheck": {
    "enabled": true,
    "interval": 30000,
    "timeout": 5000,
    "retries": 3
  }
}
```

## 服务器配置管理

### 热重载配置

XIAOZHI-MCPHUB 支持热重载配置更改：

```bash
# 重新加载配置
curl -X POST http://localhost:3000/api/config/reload

# 验证配置
curl http://localhost:3000/api/config/validate
```

### 环境变量管理

安全地管理环境变量：

```json
{
  "envVars": {
    "API_KEY": {
      "value": "your-secret-key",
      "encrypted": true,
      "description": "Third-party API key"
    },
    "DEBUG": {
      "value": "false",
      "type": "boolean"
    }
  }
}
```

### 服务器模板

创建可重用的服务器模板：

```json
{
  "templates": {
    "web-scraper": {
      "command": "uvx",
      "args": ["mcp-server-fetch"],
      "description": "Basic web scraping server"
    },
    "database-server": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sqlite"],
      "description": "SQLite database server"
    }
  }
}
```

## 批量操作

### 批量启动/停止

```bash
# 启动所有服务器
curl -X POST http://localhost:3000/api/servers/bulk/start

# 停止特定组的服务器
curl -X POST http://localhost:3000/api/servers/bulk/stop \
  -d '{"servers": ["server1", "server2", "server3"]}'
```

### 配置同步

同步多个服务器的配置：

```bash
# 同步配置到所有服务器
curl -X POST http://localhost:3000/api/servers/sync-config \
  -d '{"config": {"timeout": 5000, "retries": 3}}'
```

## 性能监控

### 资源使用情况

监控服务器资源使用：

```bash
# 获取资源使用统计
curl http://localhost:3000/api/servers/resources

# 响应示例
{
  "servers": {
    "fetch-server": {
      "cpu": "5%",
      "memory": "45MB",
      "uptime": "2h 15m"
    }
  }
}
```

### 请求指标

跟踪服务器请求指标：

```bash
# 获取请求统计
curl http://localhost:3000/api/servers/metrics

# 响应示例
{
  "total_requests": 1247,
  "successful_requests": 1198,
  "failed_requests": 49,
  "avg_response_time": 156
}
```

## 安全考虑

### 访问控制

限制服务器访问：

```json
{
  "serverAccess": {
    "allowedUsers": ["admin", "developer"],
    "allowedGroups": ["dev-team"],
    "restrictedOperations": ["stop", "delete"]
  }
}
```

### 命令验证

验证服务器命令以防止恶意执行：

```json
{
  "security": {
    "allowedCommands": ["npx", "uvx", "python", "node"],
    "blacklistedArgs": ["--eval", "-e", "eval"],
    "sandboxed": true
  }
}
```

## 故障排除

### 常见问题

#### 服务器启动失败

1. 检查命令路径和参数
2. 验证环境变量
3. 确认工作目录存在
4. 检查权限设置

#### 连接超时

1. 增加超时设置
2. 检查网络连接
3. 验证防火墙规则
4. 确认服务器端口

#### 内存不足

1. 监控资源使用
2. 调整内存限制
3. 优化服务器配置
4. 考虑水平扩展

### 调试模式

启用详细日志记录：

```bash
DEBUG=xiaozhi-mcphub:servers npm start
```

### 日志分析

```bash
# 获取服务器日志
curl http://localhost:3000/api/servers/my-server/logs

# 获取错误日志
curl http://localhost:3000/api/servers/my-server/logs?level=error
``` 