# API 参考介绍

::: tip 说明
如果您不需要构建 API 参考文档，可以通过删除 api-reference 文件夹来移除此部分。
:::

## 欢迎

构建 API 文档有两种方式：[OpenAPI](https://spec.openapis.org/oas/v3.1.0) 和 MDX 组件。在这个项目中，我们使用 OpenAPI 规范来生成 API 文档。

### API 规范文件

我们的 API 规范基于 OpenAPI 3.0 标准，包含了所有端点的详细定义。

::: info OpenAPI 规范
查看我们的 [OpenAPI 规范文件](../openapi.json) 获取完整的 API 定义。
:::

## 认证

所有 API 端点都使用 Bearer 令牌进行身份验证，这在规范文件中有明确定义：

```json
{
  "security": [
    {
      "bearerAuth": []
    }
  ]
}
```

### 认证流程

1. 首先通过登录端点获取访问令牌
2. 在所有后续请求的 `Authorization` 头中包含令牌
3. 令牌格式：`Bearer <your_access_token>`

## 请求格式

- **Content-Type**: `application/json`
- **字符编码**: UTF-8
- **请求体**: JSON 格式

## 响应格式

所有 API 响应都采用统一的 JSON 格式：

```json
{
  "success": true,
  "data": {},
  "message": "操作成功",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

## 错误处理

API 使用标准的 HTTP 状态码表示请求结果：

- `200`: 请求成功
- `400`: 请求参数错误
- `401`: 未授权访问
- `403`: 权限不足
- `404`: 资源不存在
- `500`: 服务器内部错误

错误响应格式：

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "错误描述",
    "details": {}
  },
  "timestamp": "2024-01-01T00:00:00Z"
}
```

## 速率限制

为了保护服务稳定性，API 实施了速率限制：

- **限制**: 每分钟 100 次请求
- **限制头**: 响应中包含 `X-RateLimit-*` 头信息
- **超限处理**: 返回 `429 Too Many Requests` 状态码 