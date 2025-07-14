# 查询接口

## 获取服务器列表

### `GET /api/servers`

获取当前用户可访问的所有服务器列表。

#### 请求参数

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| `page` | number | 否 | 页码，默认为 1 |
| `limit` | number | 否 | 每页数量，默认为 20，最大为 100 |
| `group_id` | string | 否 | 组 ID，筛选特定组的服务器 |
| `status` | string | 否 | 服务器状态：`active`、`inactive`、`error` |

#### 请求示例

```bash
curl -X GET "https://api.example.com/api/servers?page=1&limit=10" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json"
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "servers": [
      {
        "id": "server_123",
        "name": "生产服务器",
        "url": "https://api.production.com",
        "status": "active",
        "group_id": "group_456",
        "created_at": "2024-01-01T00:00:00Z",
        "updated_at": "2024-01-01T00:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 25,
      "total_pages": 3
    }
  },
  "message": "获取服务器列表成功"
}
```

## 获取组信息

### `GET /api/groups/{id}`

根据组 ID 获取组的详细信息。

#### 路径参数

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| `id` | string | 是 | 组的唯一标识符 |

#### 请求示例

```bash
curl -X GET "https://api.example.com/api/groups/group_456" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json"
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "id": "group_456",
    "name": "生产环境组",
    "description": "生产环境服务器组",
    "server_count": 5,
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-01T00:00:00Z"
  },
  "message": "获取组信息成功"
}
```

## 获取用户信息

### `GET /api/user/profile`

获取当前登录用户的个人信息。

#### 请求示例

```bash
curl -X GET "https://api.example.com/api/user/profile" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json"
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "id": "user_789",
    "username": "admin",
    "email": "admin@example.com",
    "role": "administrator",
    "last_login": "2024-01-01T00:00:00Z",
    "created_at": "2024-01-01T00:00:00Z"
  },
  "message": "获取用户信息成功"
}
```

## 分页查询

所有列表类型的 API 都支持分页查询，使用统一的分页参数：

- `page`: 页码，从 1 开始
- `limit`: 每页数量，默认 20，最大 100

分页响应格式：

```json
{
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "total_pages": 5,
    "has_next": true,
    "has_prev": false
  }
}
```

## 筛选条件

大部分查询接口都支持筛选条件，常用的筛选参数包括：

- `status`: 状态筛选
- `created_after`: 创建时间起始
- `created_before`: 创建时间结束
- `search`: 关键词搜索

#### 示例

```bash
# 搜索包含 "test" 的活跃服务器
curl -X GET "https://api.example.com/api/servers?status=active&search=test" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
``` 