# 创建接口

## 创建服务器

### `POST /api/servers`

创建一个新的服务器配置。

#### 请求参数

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| `name` | string | 是 | 服务器名称，1-100 字符 |
| `url` | string | 是 | 服务器 URL，必须是有效的 HTTP/HTTPS 地址 |
| `group_id` | string | 否 | 所属组 ID |
| `description` | string | 否 | 服务器描述，最大 500 字符 |
| `config` | object | 否 | 服务器配置参数 |

#### 请求示例

```bash
curl -X POST "https://api.example.com/api/servers" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "新测试服务器",
    "url": "https://test-server.example.com",
    "group_id": "group_456",
    "description": "用于测试的服务器",
    "config": {
      "timeout": 30,
      "retry_count": 3
    }
  }'
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "id": "server_789",
    "name": "新测试服务器",
    "url": "https://test-server.example.com",
    "group_id": "group_456",
    "description": "用于测试的服务器",
    "status": "inactive",
    "config": {
      "timeout": 30,
      "retry_count": 3
    },
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  },
  "message": "服务器创建成功"
}
```

## 创建组

### `POST /api/groups`

创建一个新的服务器组。

#### 请求参数

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| `name` | string | 是 | 组名称，1-50 字符，必须唯一 |
| `description` | string | 否 | 组描述，最大 200 字符 |
| `settings` | object | 否 | 组级别的设置 |

#### 请求示例

```bash
curl -X POST "https://api.example.com/api/groups" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "开发环境组",
    "description": "用于开发环境的服务器组",
    "settings": {
      "auto_backup": true,
      "log_level": "debug"
    }
  }'
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "id": "group_789",
    "name": "开发环境组",
    "description": "用于开发环境的服务器组",
    "server_count": 0,
    "settings": {
      "auto_backup": true,
      "log_level": "debug"
    },
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  },
  "message": "组创建成功"
}
```

## 创建用户

### `POST /api/users`

创建一个新的用户账户（需要管理员权限）。

#### 请求参数

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| `username` | string | 是 | 用户名，3-30 字符，必须唯一 |
| `email` | string | 是 | 邮箱地址，必须有效且唯一 |
| `password` | string | 是 | 密码，最少 8 字符 |
| `role` | string | 是 | 用户角色：`user`、`admin` |

#### 请求示例

```bash
curl -X POST "https://api.example.com/api/users" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "newuser",
    "email": "newuser@example.com",
    "password": "securepassword123",
    "role": "user"
  }'
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "id": "user_789",
    "username": "newuser",
    "email": "newuser@example.com",
    "role": "user",
    "status": "active",
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  },
  "message": "用户创建成功"
}
```

::: warning 安全提示
创建用户接口需要管理员权限。密码将被安全哈希处理，不会在响应中返回。
:::

## 批量创建

### `POST /api/servers/batch`

批量创建多个服务器。

#### 请求参数

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| `servers` | array | 是 | 服务器配置数组，最多 50 个 |

#### 请求示例

```bash
curl -X POST "https://api.example.com/api/servers/batch" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "servers": [
      {
        "name": "服务器 1",
        "url": "https://server1.example.com",
        "group_id": "group_456"
      },
      {
        "name": "服务器 2",
        "url": "https://server2.example.com",
        "group_id": "group_456"
      }
    ]
  }'
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "created": 2,
    "failed": 0,
    "servers": [
      {
        "id": "server_001",
        "name": "服务器 1",
        "status": "created"
      },
      {
        "id": "server_002",
        "name": "服务器 2",
        "status": "created"
      }
    ]
  },
  "message": "批量创建完成，成功 2 个，失败 0 个"
}
``` 