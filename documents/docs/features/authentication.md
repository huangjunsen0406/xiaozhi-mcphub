# 认证功能

## 概述

XIAOZHI-MCPHUB 提供灵活的认证机制来保护您的 MCP 服务器管理平台。系统支持多种认证方法和基于角色的访问控制。

## 认证方法

### 基于环境变量的认证

使用环境变量配置基本认证：

```bash
# 基本认证凭据
AUTH_USERNAME=admin
AUTH_PASSWORD=your-secure-password

# JWT 设置
JWT_SECRET=your-jwt-secret-key
JWT_EXPIRES_IN=24h
```

### 数据库认证

对于生产部署，启用基于数据库的用户管理：

```json
{
  "auth": {
    "provider": "database",
    "database": {
      "url": "postgresql://user:pass@localhost:5432/xiaozhi_mcphub",
      "userTable": "users"
    }
  }
}
```

## 用户管理

### 创建用户

通过管理界面或 API 创建用户：

```bash
# 通过 API
curl -X POST http://localhost:3000/api/auth/users \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "username": "newuser",
    "email": "user@example.com",
    "password": "securepassword",
    "role": "user"
  }'
```

### 用户角色

XIAOZHI-MCPHUB 支持基于角色的访问控制：

- **Admin**: 完整系统访问权限，用户管理，服务器配置
- **Manager**: 服务器管理，组管理，监控
- **User**: 指定组内的基本服务器访问权限
- **Viewer**: 分配资源的只读访问权限

## 基于组的访问控制

### 将用户分配到组

```bash
# 添加用户到组
curl -X POST http://localhost:3000/api/groups/{groupId}/users \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"userId": "user123"}'
```

### 组权限

配置组级别权限：

```json
{
  "groupId": "dev-team",
  "permissions": {
    "servers": ["read", "write", "execute"],
    "tools": ["read", "execute"],
    "logs": ["read"],
    "config": ["read"]
  }
}
```

## API 认证

### JWT Token 认证

```javascript
// 登录获取 token
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'your-username',
    password: 'your-password',
  }),
});

const { token } = await response.json();

// 使用 token 进行认证请求
const serversResponse = await fetch('/api/servers', {
  headers: { Authorization: `Bearer ${token}` },
});
```

### API Key 认证

用于服务间通信：

```bash
# 生成 API key
curl -X POST http://localhost:3000/api/auth/api-keys \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "name": "my-service",
    "permissions": ["servers:read", "tools:execute"]
  }'

# 使用 API key
curl -H "X-API-Key: your-api-key" \
  http://localhost:3000/api/servers
```

## 安全配置

### HTTPS 设置

为生产环境配置 HTTPS：

```yaml
# docker-compose.yml
services:
  xiaozhi-mcphub:
    environment:
      - HTTPS_ENABLED=true
      - SSL_CERT_PATH=/certs/cert.pem
      - SSL_KEY_PATH=/certs/key.pem
    volumes:
      - ./certs:/certs:ro
```

### CORS 配置

为 Web 应用程序配置 CORS：

```json
{
  "cors": {
    "origin": ["https://your-frontend.com"],
    "credentials": true,
    "methods": ["GET", "POST", "PUT", "DELETE"]
  }
}
```

### 速率限制

使用速率限制保护免受滥用：

```json
{
  "rateLimit": {
    "windowMs": 900000,
    "max": 100,
    "message": "Too many requests from this IP"
  }
}
```

## 会话管理

### 会话配置

```json
{
  "session": {
    "secret": "your-session-secret",
    "cookie": {
      "secure": true,
      "httpOnly": true,
      "maxAge": 86400000
    },
    "store": "redis",
    "redis": {
      "host": "localhost",
      "port": 6379
    }
  }
}
```

### 注销和会话清理

```javascript
// 注销端点
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ message: 'Logged out successfully' });
});
```

## 安全最佳实践

### 密码安全

- 使用强密码要求
- 使用 bcrypt 实现密码哈希
- 支持密码重置功能
- 启用双因素认证（2FA）

### Token 安全

- 使用安全的 JWT 密钥
- 实现 token 轮换
- 设置适当的过期时间
- 在 httpOnly cookies 中安全存储 tokens

### 网络安全

- 在生产环境中使用 HTTPS
- 实现适当的 CORS 策略
- 启用请求验证
- 使用安全头（helmet.js）

### 监控安全事件

```javascript
// 记录安全事件
const auditLog = {
  event: 'login_attempt',
  user: username,
  ip: req.ip,
  userAgent: req.headers['user-agent'],
  success: true,
  timestamp: new Date(),
};
```

## 故障排除

### 常见认证问题

#### 无效凭据

```bash
# 检查用户是否存在且密码正确
curl -X POST http://localhost:3000/api/auth/verify \
  -d '{"username": "user", "password": "pass"}'
```

#### Token 过期

```javascript
// 处理 token 刷新
if (response.status === 401) {
  const newToken = await refreshToken();
  // 使用新 token 重试请求
}
```

#### 权限被拒绝

```bash
# 检查用户权限
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3000/api/auth/permissions
```

### 调试认证

启用认证调试：

```bash
DEBUG=xiaozhi-mcphub:auth npm start
```

## 集成示例

### 前端集成

```javascript
// React 认证 hook
const useAuth = () => {
  const [user, setUser] = useState(null);

  const login = async (credentials) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });

    if (response.ok) {
      const userData = await response.json();
      setUser(userData.user);
      return true;
    }
    return false;
  };

  return { user, login };
};
```

### 中间件集成

```javascript
// Express 中间件
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};
``` 