# 删除接口

## 删除服务器

### `DELETE /api/servers/{id}`

删除指定的服务器配置。

#### 路径参数

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| `id` | string | 是 | 服务器的唯一标识符 |

#### 查询参数

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| `force` | boolean | 否 | 是否强制删除，默认为 false |

#### 请求示例

```bash
# 普通删除
curl -X DELETE "https://api.example.com/api/servers/server_123" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 强制删除
curl -X DELETE "https://api.example.com/api/servers/server_123?force=true" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "id": "server_123",
    "name": "已删除的服务器",
    "deleted_at": "2024-01-01T00:00:00Z"
  },
  "message": "服务器删除成功"
}
```

::: warning 注意
删除服务器是不可逆操作。建议在删除前确认服务器不再被使用。
:::

## 删除组

### `DELETE /api/groups/{id}`

删除指定的服务器组。

#### 路径参数

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| `id` | string | 是 | 组的唯一标识符 |

#### 查询参数

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| `move_servers_to` | string | 否 | 将组内服务器移动到指定组 ID |

#### 请求示例

```bash
# 删除空组
curl -X DELETE "https://api.example.com/api/groups/group_456" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# 删除组并移动服务器
curl -X DELETE "https://api.example.com/api/groups/group_456?move_servers_to=group_789" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "id": "group_456",
    "name": "已删除的组",
    "servers_moved": 3,
    "moved_to_group": "group_789",
    "deleted_at": "2024-01-01T00:00:00Z"
  },
  "message": "组删除成功，3 个服务器已移动"
}
```

::: danger 重要提示
- 删除包含服务器的组需要指定 `move_servers_to` 参数
- 如果不指定目标组，删除将失败并返回错误
:::

## 删除用户

### `DELETE /api/users/{id}`

删除指定的用户账户（需要管理员权限）。

#### 路径参数

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| `id` | string | 是 | 用户的唯一标识符 |

#### 请求示例

```bash
curl -X DELETE "https://api.example.com/api/users/user_789" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "id": "user_789",
    "username": "deleted_user",
    "deleted_at": "2024-01-01T00:00:00Z"
  },
  "message": "用户删除成功"
}
```

::: danger 权限要求
删除用户需要管理员权限。用户不能删除自己的账户。
:::

## 批量删除

### `DELETE /api/servers/batch`

批量删除多个服务器。

#### 请求参数

| 参数名 | 类型 | 必填 | 描述 |
|--------|------|------|------|
| `server_ids` | array | 是 | 要删除的服务器 ID 数组，最多 50 个 |
| `force` | boolean | 否 | 是否强制删除，默认为 false |

#### 请求示例

```bash
curl -X DELETE "https://api.example.com/api/servers/batch" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "server_ids": ["server_001", "server_002", "server_003"],
    "force": false
  }'
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "deleted": 2,
    "failed": 1,
    "results": [
      {
        "id": "server_001",
        "status": "deleted"
      },
      {
        "id": "server_002",
        "status": "deleted"
      },
      {
        "id": "server_003",
        "status": "failed",
        "error": "服务器正在使用中，无法删除"
      }
    ]
  },
  "message": "批量删除完成，成功 2 个，失败 1 个"
}
```

## 软删除与恢复

某些资源支持软删除机制，可以在一定时间内恢复：

### `POST /api/servers/{id}/restore`

恢复软删除的服务器。

#### 请求示例

```bash
curl -X POST "https://api.example.com/api/servers/server_123/restore" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

#### 响应示例

```json
{
  "success": true,
  "data": {
    "id": "server_123",
    "name": "恢复的服务器",
    "status": "active",
    "restored_at": "2024-01-01T00:00:00Z"
  },
  "message": "服务器恢复成功"
}
```

::: info 软删除说明
- 软删除的资源在 30 天后将被永久删除
- 只有软删除的资源可以被恢复
- 恢复后资源状态将重置为删除前的状态
::: 