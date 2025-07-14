# 组管理

## 概述

XIAOZHI-MCPHUB 中的组管理允许您将 MCP 服务器组织成基于功能、用例或访问要求的逻辑集合。这样可以精细控制哪些工具对不同的 AI 客户端和用户可用。

## 核心概念

### 什么是组？

组是可以通过专用端点访问的 MCP 服务器的命名集合。AI 客户端可以连接到特定组以仅访问相关工具，而不是一次连接到所有服务器。

### 组的好处

- **专注的工具访问**: AI 客户端只看到与其用例相关的工具
- **更好的性能**: 减少工具发现开销
- **增强的安全性**: 限制对敏感工具的访问
- **改进的组织**: 功能的逻辑分离
- **简化管理**: 更容易管理相关服务器

## 创建组

### 通过仪表板

1. **导航到组部分**: 点击主导航中的"组"
2. **点击"创建组"**: 开始组创建过程
3. **填写组详细信息**:
   - **名称**: 组的唯一标识符
   - **显示名称**: 人类可读的名称
   - **描述**: 组的目的和内容
   - **访问级别**: 公共、私有或受限
4. **添加服务器**: 选择要包含在组中的服务器

### 通过 API

以编程方式创建组：

```bash
curl -X POST http://localhost:3000/api/groups \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name": "web-automation",
    "displayName": "网页自动化工具",
    "description": "浏览器自动化和网页抓取工具",
    "servers": ["playwright", "fetch"],
    "accessLevel": "public"
  }'
```

### 通过配置文件

在 `mcp_settings.json` 中定义组：

```json
{
  "mcpServers": {
    "fetch": { "command": "uvx", "args": ["mcp-server-fetch"] },
    "playwright": { "command": "npx", "args": ["@playwright/mcp@latest"] },
    "slack": { "command": "npx", "args": ["@modelcontextprotocol/server-slack"] }
  },
  "groups": {
    "web-tools": {
      "displayName": "网页工具",
      "description": "网页抓取和浏览器自动化",
      "servers": ["fetch", "playwright"],
      "accessLevel": "public"
    },
    "communication": {
      "displayName": "通信工具",
      "description": "消息和协作工具",
      "servers": ["slack"],
      "accessLevel": "private"
    }
  }
}
```

## 组类型和用例

### Web 自动化组

**目的**: 浏览器自动化和网页抓取

**服务器**:
- `playwright`: 浏览器自动化
- `fetch`: HTTP 请求和网页抓取
- `selenium`: 替代浏览器自动化

**用例**:
- 自动化测试
- 数据收集
- 网页监控
- 内容分析

**端点**: `http://localhost:3000/mcp/web-automation`

### 数据处理组

**目的**: 数据操作和分析

**服务器**:
- `sqlite`: 数据库操作
- `filesystem`: 文件操作
- `spreadsheet`: Excel/CSV 处理

**用例**:
- 数据分析
- 报告生成
- 文件处理
- 数据库查询

**端点**: `http://localhost:3000/mcp/data-processing`

### 通信组

**目的**: 消息和协作

**服务器**:
- `slack`: Slack 集成
- `discord`: Discord 机器人
- `email`: 邮件发送
- `sms`: 短信通知

**用例**:
- 团队通知
- 客户沟通
- 警报系统
- 社交媒体管理

**端点**: `http://localhost:3000/mcp/communication`

### 开发组

**目的**: 软件开发工具

**服务器**:
- `github`: GitHub 操作
- `gitlab`: GitLab 集成
- `docker`: 容器管理
- `kubernetes`: K8s 操作

**用例**:
- 代码部署
- 仓库管理
- CI/CD 操作
- 基础设施管理

**端点**: `http://localhost:3000/mcp/development`

### AI/ML 组

**目的**: 机器学习和 AI 工具

**服务器**:
- `openai`: OpenAI API 集成
- `huggingface`: Hugging Face 模型
- `vector-db`: 向量数据库操作

**用例**:
- 模型推理
- 数据嵌入
- 自然语言处理
- 计算机视觉

**端点**: `http://localhost:3000/mcp/ai-ml`

## 组访问控制

### 访问级别

#### 公共
**公共组**:
- 所有认证用户可访问
- 无需额外权限
- 在组列表中可见
- 默认访问级别

```json
{
  "name": "public-tools",
  "accessLevel": "public",
  "servers": ["fetch", "calculator"]
}
```

#### 私有
**私有组**:
- 需要明确授权
- 仅对指定用户/角色可见
- 适用于敏感工具
- 需要管理员批准

```json
{
  "name": "admin-tools",
  "accessLevel": "private",
  "servers": ["system", "database"],
  "allowedUsers": ["admin", "sysadmin"],
  "allowedRoles": ["administrator"]
}
```

#### 受限
**受限组**:
- 基于时间的访问
- IP 地址限制
- 条件访问控制
- 审计日志记录

```json
{
  "name": "restricted-tools",
  "accessLevel": "restricted",
  "servers": ["sensitive-api"],
  "restrictions": {
    "timeWindows": ["09:00-17:00"],
    "ipWhitelist": ["192.168.1.0/24"],
    "maxUsagePerDay": 100,
    "requireApproval": true
  }
}
```

## 组端点

### 连接到组

每个组都有专用的 MCP 端点：

```bash
# 连接到特定组
ENDPOINT="http://localhost:3000/mcp/web-automation"

# 使用标准 MCP 客户端
mcp-client connect "$ENDPOINT"
```

### 动态组

创建基于条件的动态组：

```json
{
  "dynamic-group": {
    "displayName": "动态工具组",
    "type": "dynamic",
    "rules": {
      "include": {
        "tags": ["web", "automation"],
        "categories": ["data-processing"]
      },
      "exclude": {
        "servers": ["deprecated-server"]
      }
    }
  }
}
```

## 组管理操作

### 添加/移除服务器

```bash
# 向组添加服务器
curl -X POST http://localhost:3000/api/groups/web-tools/servers \
  -d '{"server": "new-scraper"}'

# 从组移除服务器
curl -X DELETE http://localhost:3000/api/groups/web-tools/servers/old-scraper
```

### 更新组配置

```bash
# 更新组设置
curl -X PUT http://localhost:3000/api/groups/web-tools \
  -d '{
    "displayName": "高级网页工具",
    "description": "更新的描述",
    "accessLevel": "private"
  }'
```

### 克隆组

```bash
# 创建组的副本
curl -X POST http://localhost:3000/api/groups/web-tools/clone \
  -d '{"newName": "web-tools-staging"}'
```

## 组监控

### 使用统计

跟踪组使用情况：

```bash
# 获取组统计
curl http://localhost:3000/api/groups/web-tools/stats

# 响应示例
{
  "totalRequests": 1547,
  "uniqueClients": 12,
  "mostUsedTools": [
    {"tool": "fetch_html", "usage": 234},
    {"tool": "playwright_click", "usage": 189}
  ],
  "avgResponseTime": 456
}
```

### 活动监控

实时监控组活动：

```bash
# 获取实时活动
curl http://localhost:3000/api/groups/web-tools/activity

# WebSocket 连接实时更新
ws://localhost:3000/api/groups/web-tools/activity/stream
```

## 组模板

### 预定义模板

使用预定义模板快速创建组：

```json
{
  "templates": {
    "data-science": {
      "servers": ["sqlite", "filesystem", "python"],
      "description": "数据科学和分析工具",
      "accessLevel": "public"
    },
    "devops": {
      "servers": ["docker", "kubernetes", "github"],
      "description": "DevOps 和部署工具",
      "accessLevel": "restricted"
    }
  }
}
```

### 自定义模板

创建自定义组模板：

```bash
# 创建模板
curl -X POST http://localhost:3000/api/group-templates \
  -d '{
    "name": "my-template",
    "servers": ["server1", "server2"],
    "defaultConfig": {
      "accessLevel": "public",
      "autoStart": true
    }
  }'

# 从模板创建组
curl -X POST http://localhost:3000/api/groups/from-template \
  -d '{
    "template": "my-template",
    "name": "new-group",
    "customizations": {
      "displayName": "自定义组名"
    }
  }'
```

## 故障排除

### 常见问题

#### 无法访问组

1. 检查用户权限
2. 验证组访问级别
3. 确认组存在且活跃
4. 检查 IP 限制（如果适用）

#### 服务器未出现在组中

1. 验证服务器正在运行
2. 检查组配置
3. 确认服务器健康状态
4. 查看服务器日志

#### 性能问题

1. 监控组负载
2. 检查服务器资源
3. 优化服务器选择
4. 考虑负载均衡

### 调试组问题

```bash
# 启用组调试
DEBUG=xiaozhi-mcphub:groups npm start

# 获取组诊断信息
curl http://localhost:3000/api/groups/web-tools/diagnostics
``` 