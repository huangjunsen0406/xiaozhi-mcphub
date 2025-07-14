# Webhook 接口

## Webhook 配置

### `POST /api/webhooks`

创建一个新的 Webhook 配置。

#### 请求参数

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| `url` | string | 是 | Webhook 接收地址，必须是有效的 HTTPS URL |
| `events` | array | 是 | 监听的事件类型列表 |
| `secret` | string | 否 | 用于签名验证的密钥 |
| `active` | boolean | 否 | 是否启用，默认为 true |
| `description` | string | 否 | Webhook 描述 |

#### 请求示例

```bash
curl -X POST "https://api.example.com/api/webhooks" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-app.com/webhooks/xiaozhi",
    "events": ["server.created", "server.updated", "server.deleted"],
    "secret": "your-webhook-secret",
    "active": true,
    "description": "服务器状态变更通知"
  }'
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "id": "webhook_123",
    "url": "https://your-app.com/webhooks/xiaozhi",
    "events": ["server.created", "server.updated", "server.deleted"],
    "active": true,
    "description": "服务器状态变更通知",
    "created_at": "2024-01-01T00:00:00Z"
  },
  "message": "Webhook 创建成功"
}
```

## 事件类型

系统支持以下事件类型：

### 服务器事件

- `server.created` - 服务器创建
- `server.updated` - 服务器更新
- `server.deleted` - 服务器删除
- `server.status_changed` - 服务器状态变更

### 组事件

- `group.created` - 组创建
- `group.updated` - 组更新
- `group.deleted` - 组删除

### 用户事件

- `user.created` - 用户创建
- `user.updated` - 用户更新
- `user.deleted` - 用户删除
- `user.login` - 用户登录
- `user.logout` - 用户退出

### 系统事件

- `system.maintenance` - 系统维护
- `system.alert` - 系统告警
- `system.backup` - 系统备份

## Webhook 负载格式

所有 Webhook 请求都使用以下格式：

```json
{
  "event": "server.created",
  "timestamp": "2024-01-01T00:00:00Z",
  "data": {
    "id": "server_123",
    "name": "新服务器",
    "url": "https://new-server.example.com",
    "status": "active",
    "group_id": "group_456"
  },
  "webhook_id": "webhook_123"
}
```

### 事件示例

#### 服务器创建事件

```json
{
  "event": "server.created",
  "timestamp": "2024-01-01T00:00:00Z",
  "data": {
    "id": "server_123",
    "name": "新服务器",
    "url": "https://new-server.example.com",
    "status": "inactive",
    "group_id": "group_456",
    "created_by": "user_789"
  },
  "webhook_id": "webhook_123"
}
```

#### 服务器状态变更事件

```json
{
  "event": "server.status_changed",
  "timestamp": "2024-01-01T00:00:00Z",
  "data": {
    "id": "server_123",
    "name": "测试服务器",
    "old_status": "inactive",
    "new_status": "active",
    "changed_at": "2024-01-01T00:00:00Z"
  },
  "webhook_id": "webhook_123"
}
```

## 安全验证

### 签名验证

如果配置了 `secret`，每个 Webhook 请求都会包含签名头：

```
X-Xiaozhi-Signature: sha256=<signature>
```

#### 验证方法

```javascript
const crypto = require('crypto');

function verifySignature(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const expectedSignature = 'sha256=' + hmac.digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

#### Python 验证示例

```python
import hmac
import hashlib

def verify_signature(payload, signature, secret):
    expected_signature = 'sha256=' + hmac.new(
        secret.encode('utf-8'),
        payload.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(signature, expected_signature)
```

### IP 白名单

建议配置 IP 白名单以增加安全性：

- `api.xiaozhi.com` 的 IP 地址
- 可通过 DNS 查询获取最新 IP

## 重试机制

### 重试策略

- **重试次数**: 最多 3 次
- **重试间隔**: 1 分钟、5 分钟、30 分钟
- **成功条件**: HTTP 状态码 200-299
- **失败条件**: 超时（30秒）或 4xx/5xx 错误

### 幂等性

确保您的 Webhook 端点具有幂等性，因为同一事件可能会被发送多次。

#### 实现建议

```javascript
// 使用事件 ID 来确保幂等性
const processedEvents = new Set();

app.post('/webhook', (req, res) => {
  const eventId = req.body.webhook_id + '-' + req.body.timestamp;
  
  if (processedEvents.has(eventId)) {
    return res.status(200).send('Event already processed');
  }
  
  // 处理事件
  processEvent(req.body);
  
  processedEvents.add(eventId);
  res.status(200).send('OK');
});
```

## 测试 Webhook

### `POST /api/webhooks/{id}/test`

测试指定的 Webhook 配置。

#### 请求示例

```bash
curl -X POST "https://api.example.com/api/webhooks/webhook_123/test" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "webhook_id": "webhook_123",
    "test_event": "test.ping",
    "response_status": 200,
    "response_time": 150,
    "delivered_at": "2024-01-01T00:00:00Z"
  },
  "message": "Webhook 测试成功"
}
```

## 管理 Webhook

### 查看 Webhook 列表

```bash
curl -X GET "https://api.example.com/api/webhooks" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 更新 Webhook

```bash
curl -X PUT "https://api.example.com/api/webhooks/webhook_123" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "active": false
  }'
```

### 删除 Webhook

```bash
curl -X DELETE "https://api.example.com/api/webhooks/webhook_123" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

::: tip 最佳实践
- 始终验证 Webhook 签名
- 实现幂等性处理
- 使用 HTTPS 端点
- 设置合理的超时时间
- 记录和监控 Webhook 事件
::: 