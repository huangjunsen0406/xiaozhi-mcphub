# MCP 设置配置

本指南说明如何使用 `mcp_settings.json` 文件在 xiaozhi-mcphub 中配置 MCP 服务器、用户认证和小智平台集成。

## 配置文件概述

xiaozhi-mcphub 使用单一配置文件 `mcp_settings.json` 管理所有设置：

- **MCP 服务器配置**：定义可用的 MCP 服务器
- **用户认证**：管理用户账户和权限
- **小智平台集成**：配置与小智AI平台的连接

## 基本文件结构

### mcp_settings.json

```json
{
  "mcpServers": {
    "server-name": {
      "command": "command-to-run",
      "args": ["arg1", "arg2"],
      "env": {
        "ENV_VAR": "value"
      }
    }
  },
  "users": {
    "username": {
      "password": "$2b$10$hashedPassword",
      "isAdmin": true
    }
  },
  "xiaozhi": {
    "enabled": true,
    "webSocketUrl": "wss://api.xiaozhi.ai/ws",
    "reconnect": {
      "maxAttempts": 10,
      "initialDelay": 2000,
      "maxDelay": 60000,
      "backoffMultiplier": 2
    }
  }
}
```

## MCP 服务器配置

### 基本服务器设置

每个 MCP 服务器需要以下基本配置：

| 字段      | 类型   | 必需 | 描述             |
| --------- | ------ | ---- | ---------------- |
| `command` | string | ✅   | 可执行命令或路径 |
| `args`    | array  | ✅   | 命令行参数       |
| `env`     | object | ❌   | 环境变量         |

### 常用 MCP 服务器示例

#### Fetch 服务器（HTTP 请求）

```json
{
  "mcpServers": {
    "fetch": {
      "command": "uvx",
      "args": ["mcp-server-fetch"]
    }
  }
}
```

#### Playwright 服务器（网页自动化）

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--headless"]
    }
  }
}
```

#### 高德地图服务器

```json
{
  "mcpServers": {
    "amap": {
      "command": "python",
      "args": ["-m", "mcp_amap"],
      "env": {
        "AMAP_MAPS_API_KEY": "${AMAP_MAPS_API_KEY}"
      }
    }
  }
}
```

#### Slack 服务器

```json
{
  "mcpServers": {
    "slack": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-slack"],
      "env": {
        "SLACK_BOT_TOKEN": "${SLACK_BOT_TOKEN}",
        "SLACK_TEAM_ID": "${SLACK_TEAM_ID}"
      }
    }
  }
}
```

#### GitHub 服务器

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
      }
    }
  }
}
```

### 环境变量替换

xiaozhi-mcphub 支持使用 `${VAR_NAME}` 语法引用环境变量：

```json
{
  "mcpServers": {
    "example": {
      "command": "python",
      "args": ["-m", "example_server"],
      "env": {
        "API_KEY": "${API_KEY}",
        "DEBUG": "${DEBUG}"
      }
    }
  }
}
```

## 用户认证配置

### 用户文件结构

```json
{
  "users": {
    "admin": {
      "password": "$2b$10$N9qo8uLOickgx2ZMRZoMye...",
      "isAdmin": true
    },
    "user1": {
      "password": "$2b$10$N9qo8uLOickgx2ZMRZoMye...",
      "isAdmin": false
    }
  }
}
```

### 用户字段

| 字段       | 类型    | 描述                           |
| ---------- | ------- | ------------------------------ |
| `password` | string  | bcrypt 加密的密码哈希          |
| `isAdmin`  | boolean | 是否为管理员（true=管理员）    |

### 创建用户

1. **生成密码哈希**：

```javascript
const bcrypt = require('bcrypt');
const hash = await bcrypt.hash('your-password', 10);
console.log(hash); // 复制这个哈希值到配置文件
```

2. **添加到配置文件**：

```json
{
  "users": {
    "newuser": {
      "password": "$2b$10$generatedHashFromAbove",
      "isAdmin": false
    }
  }
}
```

## 小智平台集成配置

### 基本配置

```json
{
  "xiaozhi": {
    "enabled": true,
    "webSocketUrl": "wss://api.xiaozhi.ai/ws",
    "reconnect": {
      "maxAttempts": 10,
      "initialDelay": 2000,
      "maxDelay": 60000,
      "backoffMultiplier": 2
    }
  }
}
```

### 配置字段

| 字段           | 类型    | 默认值 | 描述                     |
| -------------- | ------- | ------ | ------------------------ |
| `enabled`      | boolean | `true` | 是否启用小智平台集成     |
| `webSocketUrl` | string  | -      | 小智平台 WebSocket URL   |
| `reconnect`    | object  | -      | 重连配置（可选）         |

### 重连配置

| 字段                | 类型   | 默认值 | 描述                 |
| ------------------- | ------ | ------ | -------------------- |
| `maxAttempts`       | number | `10`   | 最大重连尝试次数     |
| `initialDelay`      | number | `2000` | 初始重连延迟（毫秒） |
| `maxDelay`          | number | `60000`| 最大重连延迟（毫秒） |
| `backoffMultiplier` | number | `2`    | 退避倍数             |

## 完整配置示例

### 开发环境配置

```json
{
  "mcpServers": {
    "fetch": {
      "command": "uvx",
      "args": ["mcp-server-fetch"]
    },
    "amap": {
      "command": "python",
      "args": ["-m", "mcp_amap"],
      "env": {
        "AMAP_MAPS_API_KEY": "${AMAP_MAPS_API_KEY}"
      }
    }
  },
  "users": {
    "admin": {
      "password": "$2b$10$N9qo8uLOickgx2ZMRZoMye.IACyqpBXNWHYF8jH.2/RMv7S0A8B3G",
      "isAdmin": true
    },
    "developer": {
      "password": "$2b$10$N9qo8uLOickgx2ZMRZoMye.IACyqpBXNWHYF8jH.2/RMv7S0A8B3G",
      "isAdmin": false
    }
  },
  "xiaozhi": {
    "enabled": true,
    "webSocketUrl": "wss://api-dev.xiaozhi.ai/ws",
    "reconnect": {
      "maxAttempts": 5,
      "initialDelay": 1000,
      "maxDelay": 30000,
      "backoffMultiplier": 2
    }
  }
}
```

### 生产环境配置

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
      "command": "python",
      "args": ["-m", "mcp_amap"],
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
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_PERSONAL_ACCESS_TOKEN}"
      }
    }
  },
  "users": {
    "admin": {
      "password": "$2b$10$secure-hash-for-production",
      "isAdmin": true
    }
  },
  "xiaozhi": {
    "enabled": true,
    "webSocketUrl": "wss://api.xiaozhi.ai/ws",
    "reconnect": {
      "maxAttempts": 10,
      "initialDelay": 2000,
      "maxDelay": 60000,
      "backoffMultiplier": 2
    }
  }
}
```

## 配置管理

### 文件权限

确保配置文件具有适当的权限：

```bash
# 设置安全权限
chmod 600 mcp_settings.json
chown $USER:$USER mcp_settings.json
```

### 备份配置

```bash
# 创建备份
cp mcp_settings.json mcp_settings.json.backup

# 定期备份
tar -czf "mcp_settings_$(date +%Y%m%d_%H%M%S).tar.gz" mcp_settings.json
```

### 验证配置

```bash
# 验证 JSON 语法
cat mcp_settings.json | jq .

# 检查环境变量
envsubst < mcp_settings.json | jq .
```

## 故障排除

### 常见问题

#### 1. MCP 服务器启动失败

**检查命令是否可用：**

```bash
# 检查 uvx
which uvx

# 检查 npx
which npx

# 检查 python
which python
```

**手动测试命令：**

```bash
# 测试 fetch 服务器
uvx mcp-server-fetch

# 测试 playwright
npx @playwright/mcp@latest --headless
```

#### 2. 用户认证失败

**验证密码哈希：**

```javascript
const bcrypt = require('bcrypt');
const isValid = await bcrypt.compare('password', 'stored-hash');
console.log('Password valid:', isValid);
```

**检查用户配置：**

```bash
cat mcp_settings.json | jq '.users'
```

#### 3. 小智平台连接失败

**检查 WebSocket URL：**

```bash
# 测试连接
wscat -c "wss://api.xiaozhi.ai/ws"

# 检查环境变量
echo $XIAOZHI_WEBSOCKET_URL
```

**查看连接状态：**

```bash
curl http://localhost:3000/api/xiaozhi/status
```

#### 4. 环境变量未找到

**检查 .env 文件：**

```bash
# 查看所有环境变量
printenv | grep -E '(AMAP|SLACK|GITHUB)'

# 验证 .env 文件
cat .env
```

### 调试配置

启用调试日志：

```bash
DEBUG=mcphub:* pnpm start
```

## 配置验证脚本

创建一个简单的验证脚本：

```javascript
// validate-config.js
const fs = require('fs');

function validateConfig(configPath = './mcp_settings.json') {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // 验证 MCP 服务器
    if (!config.mcpServers) {
      console.error('Missing mcpServers section');
      return false;
    }
    
    for (const [name, server] of Object.entries(config.mcpServers)) {
      if (!server.command || !server.args) {
        console.error(`Server ${name} missing command or args`);
        return false;
      }
    }
    
    // 验证用户
    if (!config.users) {
      console.warn('No users configured');
    }
    
    // 验证小智配置
    if (config.xiaozhi?.enabled && !config.xiaozhi.webSocketUrl) {
      console.error('Xiaozhi enabled but webSocketUrl missing');
      return false;
    }
    
    console.log('Configuration is valid');
    return true;
  } catch (error) {
    console.error('Configuration validation failed:', error.message);
    return false;
  }
}

if (require.main === module) {
  const configPath = process.argv[2] || './mcp_settings.json';
  process.exit(validateConfig(configPath) ? 0 : 1);
}

module.exports = { validateConfig };
```

使用验证脚本：

```bash
node validate-config.js
node validate-config.js /path/to/mcp_settings.json
```

## 安全最佳实践

### 密钥管理

- **使用环境变量**：存储所有 API 密钥和敏感信息
- **不要硬编码**：避免在配置文件中直接写入密钥
- **定期轮换**：定期更新 API 密钥和用户密码

### 文件安全

- **限制权限**：设置文件权限为 600
- **定期备份**：创建配置文件的安全备份
- **版本控制**：不要将真实配置文件提交到版本控制

### 网络安全

- **使用 HTTPS**：在生产环境中启用 HTTPS
- **验证证书**：确保 WebSocket 连接使用有效证书
- **防火墙规则**：限制不必要的网络访问

::: tip 提示
- 使用 `.env.example` 作为环境变量模板
- 为不同环境维护单独的配置文件
- 定期验证配置文件的正确性
- 监控服务器状态和连接健康状况
:::

::: warning 安全提醒
- 永远不要在配置文件中硬编码密钥
- 确保 mcp_settings.json 文件权限设置正确
- 定期审查和更新用户密码
- 保护小智平台的 WebSocket 连接
:::

这个配置指南涵盖了 xiaozhi-mcphub 的所有核心配置需求，包括 MCP 服务器管理、用户认证和小智平台集成。