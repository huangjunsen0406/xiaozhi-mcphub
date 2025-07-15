# 认证功能

## 概述

xiaozhi-mcphub 提供基于文件的用户认证系统来保护您的 MCP 服务器管理平台。系统使用 JWT 令牌进行身份验证和基于用户文件的访问控制。

## 认证机制

### 基于文件的用户管理

xiaozhi-mcphub 使用 `mcp_settings.json` 文件管理用户账户。不需要数据库设置，简化了部署和维护。

### JWT 令牌认证

系统使用 JWT（JSON Web Token）进行用户会话管理，提供安全且无状态的认证机制。

## 用户配置

### 用户文件结构

在 `mcp_settings.json` 文件中配置用户：

```json
{
  "users": {
    "admin": {
      "password": "$2b$10$hashedPasswordString",
      "isAdmin": true
    },
    "user1": {
      "password": "$2b$10$anotherHashedPasswordString", 
      "isAdmin": false
    }
  },
  "mcpServers": {
    // MCP 服务器配置...
  }
}
```

### 创建用户

1. **生成密码哈希**

使用 bcrypt 生成密码哈希：

```javascript
const bcrypt = require('bcrypt');

// 生成密码哈希
const password = 'your-secure-password';
const saltRounds = 10;
const hash = await bcrypt.hash(password, saltRounds);
console.log('Password hash:', hash);
```

2. **添加用户到配置文件**

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

### 用户角色

系统支持两种角色：

- **管理员** (`isAdmin: true`): 完整系统访问权限，可以管理服务器、用户和系统配置
- **普通用户** (`isAdmin: false`): 基本访问权限，可以查看和使用 MCP 服务器

## API 认证

### 用户登录

通过 API 进行用户登录：

```bash
# 登录请求
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "your-password"
  }'
```

**响应示例：**

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "username": "admin",
    "isAdmin": true
  }
}
```

### 使用 JWT 令牌

在后续请求中使用返回的 JWT 令牌：

```bash
# 使用令牌访问受保护的端点
curl -H "Authorization: Bearer your-jwt-token" \
  http://localhost:3000/api/mcp/servers
```

### 前端认证示例

```javascript
// 登录函数
async function login(username, password) {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (response.ok) {
    const data = await response.json();
    // 存储令牌到 localStorage 或安全的存储位置
    localStorage.setItem('authToken', data.token);
    return data;
  }
  
  throw new Error('Login failed');
}

// 认证请求函数
async function authenticatedRequest(url, options = {}) {
  const token = localStorage.getItem('authToken');
  
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'Authorization': `Bearer ${token}`,
    },
  });

  if (response.status === 401) {
    // 令牌过期，重定向到登录页面
    window.location.href = '/login';
    return;
  }

  return response;
}
```

## 环境变量配置

配置认证相关的环境变量：

```bash
# JWT 配置
JWT_SECRET=your-super-secret-key-change-this-in-production
JWT_EXPIRES_IN=24h

# 文件路径
MCP_SERVERS_PATH=./mcp_settings.json
```

## 安全最佳实践

### 密码安全

- **使用强密码**：确保所有用户账户使用强密码
- **bcrypt 哈希**：系统使用 bcrypt 进行密码哈希，安全存储用户密码
- **定期更新**：定期更新用户密码

### JWT 令牌安全

- **安全密钥**：使用强唯一的 JWT 密钥
- **适当过期时间**：设置合理的令牌过期时间（默认 24 小时）
- **安全存储**：在客户端安全存储令牌

### 文件安全

- **权限控制**：确保 `mcp_settings.json` 文件具有适当的文件权限
- **备份加密**：备份用户配置文件时进行加密
- **版本控制**：不要将包含真实密码哈希的配置文件提交到版本控制

```bash
# 设置配置文件权限
chmod 600 mcp_settings.json
chown mcphub:mcphub mcp_settings.json
```

## 用户管理工具

### 创建新用户脚本

创建一个简单的用户管理脚本：

```javascript
// create-user.js
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

async function createUser(username, password, isAdmin = false) {
  const configPath = './mcp_settings.json';
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  if (!config.users) {
    config.users = {};
  }
  
  if (config.users[username]) {
    throw new Error(`User ${username} already exists`);
  }
  
  const hashedPassword = await bcrypt.hash(password, 10);
  
  config.users[username] = {
    password: hashedPassword,
    isAdmin: isAdmin
  };
  
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`User ${username} created successfully`);
}

// 使用示例
if (require.main === module) {
  const [username, password, isAdmin] = process.argv.slice(2);
  createUser(username, password, isAdmin === 'true')
    .catch(console.error);
}

module.exports = { createUser };
```

使用脚本创建用户：

```bash
# 创建管理员用户
node create-user.js admin your-secure-password true

# 创建普通用户
node create-user.js user1 user-password false
```

## 故障排除

### 常见问题

#### 1. 登录失败

**检查用户名和密码：**

```bash
# 验证用户配置
cat mcp_settings.json | grep -A 3 "\"username\""
```

**检查密码哈希：**

```javascript
const bcrypt = require('bcrypt');

// 验证密码是否匹配哈希
const isValid = await bcrypt.compare('your-password', 'stored-hash');
console.log('Password valid:', isValid);
```

#### 2. JWT 令牌错误

**检查 JWT 配置：**

```bash
# 确保 JWT_SECRET 已设置
echo $JWT_SECRET

# 检查令牌过期时间
echo $JWT_EXPIRES_IN
```

#### 3. 权限拒绝

**检查用户角色：**

```json
{
  "users": {
    "username": {
      "isAdmin": true  // 确保管理员用户有 isAdmin: true
    }
  }
}
```

### 调试认证

启用认证调试日志：

```bash
DEBUG=mcphub:auth pnpm start
```

## 配置示例

### 完整的用户配置示例

```json
{
  "users": {
    "admin": {
      "password": "$2b$10$N9qo8uLOickgx2ZMRZoMye.IACyqpBXNWHYF8jH.2/RMv7S0A8B3G",
      "isAdmin": true
    },
    "developer": {
      "password": "$2b$10$N9qo8uLOickgx2ZMRZoMye.IACyqpBXNWHYF8jH.2/RMv7S0A8B3G",
      "isAdmin": false
    },
    "viewer": {
      "password": "$2b$10$N9qo8uLOickgx2ZMRZoMye.IACyqpBXNWHYF8jH.2/RMv7S0A8B3G",
      "isAdmin": false
    }
  },
  "mcpServers": {
    // MCP 服务器配置...
  }
}
```

### 环境变量配置

```bash
# 开发环境
NODE_ENV=development
JWT_SECRET=development-secret-key
JWT_EXPIRES_IN=24h
MCP_SERVERS_PATH=./mcp_settings.json

# 生产环境
NODE_ENV=production
JWT_SECRET=your-production-secret-key-must-be-very-secure
JWT_EXPIRES_IN=12h
MCP_SERVERS_PATH=/app/data/mcp_settings.json
```

这个简化的认证系统确保了安全性，同时保持了易于管理和部署的特点。基于文件的用户管理避免了复杂的数据库设置，非常适合中小型部署场景。