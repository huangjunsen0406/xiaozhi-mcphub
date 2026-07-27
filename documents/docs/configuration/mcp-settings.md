# MCP 与系统配置

配置来源取决于是否启用数据库：

| 模式 | 条件 | 存储 |
|------|------|------|
| 文件 | 无 `DB_URL` / 未开 DB | 主要为 `mcp_settings.json`（开发可能用 `data/mcp_settings.dev.json`） |
| 数据库 | 配置 `DB_URL` | Server / Group / 用户 / 小智端点 / 系统配置等进 PostgreSQL |

**小智多端点**等能力需要数据库模式。

## 服务器条目（概念）

```json
{
  "mcpServers": {
    "fetch": {
      "command": "uvx",
      "args": ["mcp-server-fetch"],
      "env": {},
      "owner": "admin",
      "enabled": true
    }
  }
}
```

1.1.0 起持久化唯一性为 **owner + name**。JSON 实现可能使用 `owner::name` 作为键；迁移会为缺失的 owner 回填 `admin`。

## 用户与权限

用户可存在文件或 DB 中。控制台支持注册与（可选）邮箱验证；管理员在 **Users** 页管理账户。

密码：≥8 位，字母 + 数字 + 特殊字符。

## 系统配置

智能路由、邮件 SMTP、ModelScope、MCPRouter、OAuth、安装 baseUrl 等可在 **Settings** UI 编辑，并写入 systemConfig（文件或 DB）。  
运行时个人项与系统项合并规则见 [认证与多账户](/features/authentication)。

## 热更新

大多数服务器与分组变更通过 API/UI 即时生效，无需重启进程。Better Auth 等启动期配置改环境变量后需要重启。

## 相关页面

- [服务器管理](/features/server-management)  
- [环境变量](/configuration/environment-variables)  
- [小智接入](/configuration/xiaozhi)  
