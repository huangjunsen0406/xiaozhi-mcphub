# MCP 设置配置

本指南说明如何使用 `mcp_settings.json` 文件和相关配置在 xiaozhi-mcphub 中配置 MCP 服务器和小智平台集成。

## 配置文件概述

xiaozhi-mcphub 使用几个配置文件：

- **`mcp_settings.json`**：主要的 MCP 服务器配置和小智平台集成配置
- **`servers.json`**：服务器元数据和分组
- **`.env`**：环境变量和密钥

## 基本 MCP 设置结构

### mcp_settings.json

```json
{
  "mcpServers": {
    "server-name": {
      "command": "command-to-run",
      "args": ["arg1", "arg2"],
      "env": {
        "ENV_VAR": "value"
      },
      "cwd": "/working/directory",
      "timeout": 30000,
      "restart": true
    }
  },
  "xiaozhi": {
    "enabled": true,
    "webSocketUrl": "wss://api.xiaozhi.me/mcp/?token=your-jwt-token",
    "reconnect": {
      "maxAttempts": 10,
      "initialDelay": 2000,
      "maxDelay": 60000,
      "backoffMultiplier": 2
    }
  }
}
```

### 示例配置

```json
{
  "mcpServers": {
    "fetch": {
      "command": "uvx",
      "args": ["mcp-server-fetch"],
      "env": {
        "USER_AGENT": "xiaozhi-mcphub/1.0"
      }
    },
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--headless"],
      "timeout": 60000
    },
    "amap": {
      "command": "npx",
      "args": ["-y", "@amap/amap-maps-mcp-server"],
      "env": {
        "AMAP_MAPS_API_KEY": "${AMAP_MAPS_API_KEY}",
        "AMAP_LANGUAGE": "zh-cn"
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
      "backoffMultiplier": 2,
      "jitter": true
    },
    "syncSettings": {
      "autoSync": true,
      "syncInterval": 30000,
      "retryOnFailure": true
    }
  }
}
```

## 小智平台集成配置

### xiaozhi 配置块

xiaozhi-mcphub 的核心功能是与小智AI平台的集成。以下是完整的配置选项：

#### 必需字段

| 字段           | 类型    | 描述                           |
| -------------- | ------- | ------------------------------ |
| `enabled`      | boolean | 是否启用小智平台集成           |
| `webSocketUrl` | string  | 小智平台WebSocket连接URL和令牌 |

#### 可选字段

| 字段         | 类型   | 默认值 | 描述             |
| ------------ | ------ | ------ | ---------------- |
| `reconnect`  | object | -      | 重连配置         |
| `syncSettings` | object | -      | 同步设置配置     |
| `logging`    | object | -      | 小智日志配置     |

### 重连配置

```json
{
  "xiaozhi": {
    "reconnect": {
      "maxAttempts": 10,
      "initialDelay": 2000,
      "maxDelay": 60000,
      "backoffMultiplier": 2,
      "jitter": true
    }
  }
}
```

| 字段                | 类型    | 默认值 | 描述                     |
| ------------------- | ------- | ------ | ------------------------ |
| `maxAttempts`       | number  | `10`   | 最大重连尝试次数         |
| `initialDelay`      | number  | `2000` | 初始重连延迟（毫秒）     |
| `maxDelay`          | number  | `60000`| 最大重连延迟（毫秒）     |
| `backoffMultiplier` | number  | `2`    | 退避倍数                 |
| `jitter`            | boolean | `true` | 是否添加随机抖动         |

### 同步设置配置

```json
{
  "xiaozhi": {
    "syncSettings": {
      "autoSync": true,
      "syncInterval": 30000,
      "retryOnFailure": true,
      "maxSyncRetries": 3,
      "syncTimeout": 10000
    }
  }
}
```

| 字段              | 类型    | 默认值  | 描述                     |
| ----------------- | ------- | ------- | ------------------------ |
| `autoSync`        | boolean | `true`  | 是否自动同步工具状态     |
| `syncInterval`    | number  | `30000` | 同步间隔（毫秒）         |
| `retryOnFailure`  | boolean | `true`  | 同步失败时是否重试       |
| `maxSyncRetries`  | number  | `3`     | 最大同步重试次数         |
| `syncTimeout`     | number  | `10000` | 同步操作超时（毫秒）     |

## 服务器配置选项

### 必需字段

| 字段      | 类型   | 描述             |
| --------- | ------ | ---------------- |
| `command` | string | 可执行命令或路径 |
| `args`    | array  | 命令行参数       |

### 可选字段

| 字段           | 类型    | 默认值          | 描述               |
| -------------- | ------- | --------------- | ------------------ |
| `env`          | object  | `{}`            | 环境变量           |
| `cwd`          | string  | `process.cwd()` | 工作目录           |
| `timeout`      | number  | `30000`         | 启动超时（毫秒）   |
| `restart`      | boolean | `true`          | 失败时自动重启     |
| `maxRestarts`  | number  | `5`             | 最大重启次数       |
| `restartDelay` | number  | `5000`          | 重启间延迟（毫秒） |
| `stdio`        | string  | `pipe`          | stdio 配置         |

## 常见 MCP 服务器示例

### Web 和 API 服务器

#### Fetch 服务器

```json
{
  "fetch": {
    "command": "uvx",
    "args": ["mcp-server-fetch"],
    "env": {
      "USER_AGENT": "xiaozhi-mcphub/1.0",
      "MAX_REDIRECTS": "10"
    }
  }
}
```

#### 使用 Playwright 进行网页抓取

```json
{
  "playwright": {
    "command": "npx",
    "args": ["@playwright/mcp@latest", "--headless"],
    "timeout": 60000,
    "env": {
      "PLAYWRIGHT_BROWSERS_PATH": "/tmp/browsers"
    }
  }
}
```

### 文件和系统服务器

#### 文件系统服务器

```json
{
  "filesystem": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/allowed/path"],
    "env": {
      "ALLOWED_OPERATIONS": "read,write,list"
    }
  }
}
```

#### SQLite 服务器

```json
{
  "sqlite": {
    "command": "uvx",
    "args": ["mcp-server-sqlite", "--db-path", "/path/to/database.db"],
    "env": {
      "SQLITE_READONLY": "false"
    }
  }
}
```

### 通信服务器

#### Slack 服务器

```json
{
  "slack": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-slack"],
    "env": {
      "SLACK_BOT_TOKEN": "${SLACK_BOT_TOKEN}",
      "SLACK_TEAM_ID": "${SLACK_TEAM_ID}",
      "SLACK_APP_TOKEN": "${SLACK_APP_TOKEN}"
    }
  }
}
```

#### 邮件服务器

```json
{
  "email": {
    "command": "python",
    "args": ["-m", "mcp_server_email"],
    "env": {
      "SMTP_HOST": "smtp.gmail.com",
      "SMTP_PORT": "587",
      "EMAIL_USER": "${EMAIL_USER}",
      "EMAIL_PASSWORD": "${EMAIL_PASSWORD}"
    }
  }
}
```

### 开发和 API 服务器

#### GitHub 服务器

```json
{
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"],
    "env": {
      "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
    }
  }
}
```

#### Google Drive 服务器

```json
{
  "gdrive": {
    "command": "npx",
    "args": ["-y", "@google/mcp-server-gdrive"],
    "env": {
      "GOOGLE_CLIENT_ID": "${GOOGLE_CLIENT_ID}",
      "GOOGLE_CLIENT_SECRET": "${GOOGLE_CLIENT_SECRET}",
      "GOOGLE_REFRESH_TOKEN": "${GOOGLE_REFRESH_TOKEN}"
    }
  }
}
```

### 地图和位置服务

#### 高德地图服务器

```json
{
  "amap": {
    "command": "npx",
    "args": ["-y", "@amap/amap-maps-mcp-server"],
    "env": {
      "AMAP_MAPS_API_KEY": "${AMAP_API_KEY}",
      "AMAP_LANGUAGE": "zh-cn"
    }
  }
}
```

#### OpenStreetMap 服务器

```json
{
  "osm": {
    "command": "python",
    "args": ["-m", "mcp_server_osm"],
    "env": {
      "OSM_USER_AGENT": "xiaozhi-mcphub/1.0"
    }
  }
}
```

## 高级配置

### 环境变量替换

xiaozhi-mcphub 支持使用 `${VAR_NAME}` 语法进行环境变量替换：

```json
{
  "mcpServers": {
    "api-server": {
      "command": "python",
      "args": ["-m", "api_server"],
      "env": {
        "API_KEY": "${API_KEY}",
        "API_URL": "${API_BASE_URL}/v1",
        "DEBUG": "${NODE_ENV:development}"
      }
    }
  },
  "xiaozhi": {
    "enabled": "${XIAOZHI_ENABLED:true}",
    "webSocketUrl": "${XIAOZHI_WEBSOCKET_URL}"
  }
}
```

可以使用 `${VAR_NAME:default}` 指定默认值：

```json
{
  "timeout": "${MCP_TIMEOUT:30000}",
  "maxRestarts": "${MCP_MAX_RESTARTS:5}",
  "xiaozhi": {
    "enabled": "${XIAOZHI_ENABLED:true}",
    "reconnect": {
      "maxAttempts": "${XIAOZHI_RECONNECT_MAX_ATTEMPTS:10}"
    }
  }
}
```

### 条件配置

根据环境使用不同配置：

```json
{
  "mcpServers": {
    "database": {
      "command": "python",
      "args": ["-m", "db_server"],
      "env": {
        "DB_URL": "${NODE_ENV:development == 'production' ? DATABASE_URL : DEV_DATABASE_URL}"
      }
    }
  },
  "xiaozhi": {
    "enabled": "${NODE_ENV:development != 'test'}",
    "webSocketUrl": "${NODE_ENV:development == 'production' ? XIAOZHI_PROD_URL : XIAOZHI_DEV_URL}"
  }
}
```

### 自定义服务器脚本

#### 本地 Python 服务器

```json
{
  "custom-python": {
    "command": "python",
    "args": ["./servers/custom_server.py"],
    "cwd": "/app/custom-servers",
    "env": {
      "PYTHONPATH": "/app/custom-servers",
      "CONFIG_FILE": "./config.json"
    }
  }
}
```

#### 本地 Node.js 服务器

```json
{
  "custom-node": {
    "command": "node",
    "args": ["./servers/custom-server.js"],
    "cwd": "/app/custom-servers",
    "env": {
      "NODE_ENV": "production"
    }
  }
}
```

## 服务器元数据配置

### servers.json

使用服务器元数据补充 `mcp_settings.json`：

```json
{
  "servers": {
    "fetch": {
      "name": "Fetch 服务器",
      "description": "用于网络请求的 HTTP 客户端",
      "category": "web",
      "tags": ["http", "api", "web"],
      "version": "1.0.0",
      "author": "xiaozhi-mcphub 团队",
      "documentation": "https://docs.mcphub.com/servers/fetch",
      "enabled": true,
      "xiaozhi_compatible": true
    },
    "playwright": {
      "name": "Playwright 浏览器",
      "description": "网页自动化和抓取",
      "category": "automation",
      "tags": ["browser", "scraping", "automation"],
      "version": "2.0.0",
      "enabled": true,
      "xiaozhi_compatible": true
    },
    "amap": {
      "name": "高德地图",
      "description": "中国地图服务和位置信息",
      "category": "location",
      "tags": ["map", "location", "china"],
      "version": "1.0.0",
      "enabled": true,
      "xiaozhi_compatible": true
    }
  },
  "groups": {
    "xiaozhi-tools": {
      "name": "小智工具",
      "description": "专为小智AI平台优化的工具",
      "servers": ["fetch", "playwright", "amap"],
      "access": "public",
      "xiaozhi_sync": true
    },
    "communication": {
      "name": "通信工具",
      "description": "消息和通信相关工具",
      "servers": ["slack", "email"],
      "access": "authenticated",
      "xiaozhi_sync": true
    }
  }
}
```

## 组管理

### 组配置

```json
{
  "groups": {
    "production": {
      "name": "生产工具",
      "description": "稳定的生产服务器",
      "servers": ["fetch", "slack", "github"],
      "access": "authenticated",
      "xiaozhi_sync": true,
      "rateLimit": {
        "requestsPerMinute": 100,
        "burstLimit": 20
      }
    },
    "experimental": {
      "name": "实验功能",
      "description": "测试版和实验性服务器",
      "servers": ["experimental-ai", "beta-search"],
      "access": "admin",
      "enabled": false,
      "xiaozhi_sync": false
    }
  }
}
```

### 访问控制

| 访问级别        | 描述                |
| --------------- | ------------------- |
| `public`        | 无需认证            |
| `authenticated` | 需要有效的 JWT 令牌 |
| `admin`         | 需要管理员角色      |
| `custom`        | 自定义权限逻辑      |

## 动态配置

### 热重载

xiaozhi-mcphub 支持配置热重载：

```bash
# 不重启重新加载配置
curl -X POST http://localhost:3000/api/admin/reload-config \
  -H "Authorization: Bearer your-admin-token"

# 重新加载小智配置
curl -X POST http://localhost:3000/api/xiaozhi/reload-config \
  -H "Authorization: Bearer your-admin-token"
```

### 配置验证

xiaozhi-mcphub 在启动和重新加载时验证配置：

```json
{
  "validation": {
    "strict": true,
    "allowUnknownServers": false,
    "requireDocumentation": true,
    "validateXiaozhiConfig": true
  }
}
```

## 最佳实践

### 安全

1. **对敏感数据使用环境变量**：

   ```json
   {
     "env": {
       "API_KEY": "${API_KEY}",
       "DATABASE_PASSWORD": "${DB_PASSWORD}"
     },
     "xiaozhi": {
       "webSocketUrl": "${XIAOZHI_WEBSOCKET_URL}"
     }
   }
   ```

2. **限制服务器权限**：
   ```json
   {
     "filesystem": {
       "command": "npx",
       "args": ["-y", "@modelcontextprotocol/server-filesystem", "/restricted/path"],
       "env": {
         "READONLY": "true"
       }
     }
   }
   ```

### 性能

1. **设置适当的超时**：

   ```json
   {
     "timeout": 30000,
     "maxRestarts": 3,
     "restartDelay": 5000,
     "xiaozhi": {
       "syncSettings": {
         "syncTimeout": 10000
       }
     }
   }
   ```

2. **资源限制**：
   ```json
   {
     "env": {
       "NODE_OPTIONS": "--max-old-space-size=512",
       "MEMORY_LIMIT": "512MB"
     }
   }
   ```

### 监控

1. **启用健康检查**：

   ```json
   {
     "healthCheck": {
       "enabled": true,
       "interval": 30000,
       "timeout": 5000
     },
     "xiaozhi": {
       "logging": {
         "level": "info",
         "includeConnectionEvents": true
       }
     }
   }
   ```

2. **日志配置**：
   ```json
   {
     "env": {
       "LOG_LEVEL": "info",
       "LOG_FORMAT": "json"
     },
     "xiaozhi": {
       "logging": {
         "level": "debug",
         "logSyncEvents": true,
         "logReconnectAttempts": true
       }
     }
   }
   ```

## 故障排除

### 常见问题

**服务器无法启动**：检查命令和参数

```bash
# 手动测试命令
uvx mcp-server-fetch
```

**小智平台连接失败**：检查WebSocket URL和令牌

```bash
# 检查小智连接状态
curl http://localhost:3000/api/xiaozhi/status

# 测试WebSocket连接
wscat -c "wss://api.xiaozhi.me/mcp/?token=your-jwt-token"
```

**找不到环境变量**：验证 `.env` 文件

```bash
# 检查环境
printenv | grep XIAOZHI
printenv | grep API_KEY
```

**权限错误**：检查文件权限和路径

```bash
# 验证可执行权限
ls -la /path/to/server
```

### 调试配置

启用调试模式进行详细日志记录：

```json
{
  "debug": {
    "enabled": true,
    "logLevel": "debug",
    "includeEnv": false,
    "logStartup": true
  },
  "xiaozhi": {
    "logging": {
      "level": "debug",
      "logConnectionEvents": true,
      "logSyncEvents": true,
      "logReconnectAttempts": true
    }
  }
}
```

### 验证错误

常见验证错误和解决方案：

1. **缺少必需字段**：添加 `command` 和 `args`
2. **无效超时**：使用数字，不是字符串
3. **找不到环境变量**：检查 `.env` 文件
4. **找不到命令**：验证安装和 PATH
5. **小智WebSocket URL格式错误**：确保URL包含有效的JWT令牌

### 配置测试

```bash
# 验证 JSON 语法
cat mcp_settings.json | jq .

# 测试环境变量替换
envsubst < mcp_settings.json

# 检查服务器可用性
which uvx
which npx
which python

# 测试小智连接
curl http://localhost:3000/api/xiaozhi/test-connection
```

## 完整配置示例

### 生产环境配置

```json
{
  "mcpServers": {
    "fetch": {
      "command": "uvx",
      "args": ["mcp-server-fetch"],
      "env": {
        "USER_AGENT": "xiaozhi-mcphub/1.0 Production"
      },
      "timeout": 30000,
      "restart": true,
      "maxRestarts": 5
    },
    "amap": {
      "command": "npx",
      "args": ["-y", "@amap/amap-maps-mcp-server"],
      "env": {
        "AMAP_MAPS_API_KEY": "${AMAP_MAPS_API_KEY}",
        "AMAP_LANGUAGE": "zh-cn"
      },
      "timeout": 30000,
      "restart": true
    },
    "slack": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-slack"],
      "env": {
        "SLACK_BOT_TOKEN": "${SLACK_BOT_TOKEN}",
        "SLACK_TEAM_ID": "${SLACK_TEAM_ID}"
      },
      "timeout": 45000,
      "restart": true
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "${GITHUB_TOKEN}"
      },
      "timeout": 30000,
      "restart": true
    }
  },
  "xiaozhi": {
    "enabled": true,
    "webSocketUrl": "${XIAOZHI_WEBSOCKET_URL}",
    "reconnect": {
      "maxAttempts": 10,
      "initialDelay": 2000,
      "maxDelay": 60000,
      "backoffMultiplier": 2,
      "jitter": true
    },
    "syncSettings": {
      "autoSync": true,
      "syncInterval": 30000,
      "retryOnFailure": true,
      "maxSyncRetries": 3,
      "syncTimeout": 10000
    },
    "logging": {
      "level": "info",
      "logConnectionEvents": true,
      "logSyncEvents": false,
      "logReconnectAttempts": true
    }
  },
  "validation": {
    "strict": true,
    "requireDocumentation": true,
    "validateXiaozhiConfig": true
  },
  "logging": {
    "level": "info",
    "format": "json",
    "includeTimestamp": true
  }
}
```

::: tip 提示
- 定期备份配置文件
- 使用版本控制跟踪配置更改
- 为不同环境维护单独的配置
- 验证配置后再部署到生产环境
- 监控小智平台连接状态
:::

::: warning 安全提醒
- 永远不要在配置文件中硬编码密钥
- 使用环境变量存储敏感信息
- 限制文件系统服务器的访问路径
- 定期审查和更新服务器权限
- 保护小智平台WebSocket连接的JWT令牌
:::

这个全面的指南涵盖了在 xiaozhi-mcphub 中为各种用例和环境配置 MCP 服务器和小智平台集成的所有方面。 