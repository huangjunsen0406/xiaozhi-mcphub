# 环境变量

xiaozhi-mcphub **1.1.0** 通过环境变量与（可选）`mcp_settings.json` / 数据库系统配置共同生效。  
与旧版文档的重要差异：数据库连接使用 **`DB_URL`**。  
从 **v1.0.3** 升级时旧名 **`DATABASE_URL` 仍可读**（会打 deprecation 警告）；请尽快改成 `DB_URL`。详见 [从 v1.0.3 升级](/configuration/upgrade-from-v103)。

## 核心

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` | `3000` | HTTP 端口 |
| `NODE_ENV` | `development` | `development` / `production` / `test` |
| `BASE_PATH` | 空 | 子路径部署，如 `/mcphub` |
| `READONLY` | `false` | `true` 时禁止修改类操作 |
| `INIT_TIMEOUT` | `300000` | 初始化超时（ms） |
| `DEFAULT_REQUEST_TIMEOUT` | `60000` | 上游 MCP 默认超时（ms） |
| `MCPHUB_SETTING_PATH` | 自动检测 | 设置文件路径 |
| `INSTALL_BASE_URL` | - | 公网安装/回调基址；Dashboard 里保存的 baseUrl 优先 |

## 数据库

| 变量 | 说明 |
|------|------|
| `DB_URL` | PostgreSQL 连接串。配置后通常启用数据库模式；**小智端点等依赖 DB** |
| `DATABASE_URL` | **兼容旧版**：与 `DB_URL` 同义；仅当 `DB_URL` 未设时生效 |
| `USE_DB` | 可选，显式开关 DB 模式（一般随 `DB_URL` / `DATABASE_URL` 自动判断） |

```bash
DB_URL=postgres://xiaozhi:密码@127.0.0.1:5432/xiaozhi_mcphub
```

智能路由向量存储使用同一套 PostgreSQL（需 **pgvector** 扩展）。

## 认证

| 变量 | 说明 |
|------|------|
| `JWT_SECRET` | JWT 签名密钥（生产必填；开发可自动生成） |
| `ADMIN_PASSWORD` | **仅首次空用户库**时创建 `admin` 的密码；之后忽略 |

密码策略（注册 / 改密 / 重置）：至少 8 位，含字母、数字与特殊字符。界面与 API 使用 i18n 错误码。

### Better Auth（可选：GitHub / Google / OIDC）

需 **`DB_URL`**（Better Auth 会话走 PostgreSQL）。非敏感项也可写在 `systemConfig.auth.betterAuth`，优先级：环境变量 > 系统配置 > 默认。

| 变量 | 说明 |
|------|------|
| `BETTER_AUTH_ENABLED` | 总开关 |
| `BETTER_AUTH_URL` | 公网 URL（回调） |
| `BETTER_AUTH_BASE_PATH` | 默认 `/api/auth/better` |
| `BETTER_AUTH_TRUSTED_ORIGINS` | 额外可信来源 |
| `BETTER_AUTH_GOOGLE_ENABLED` + `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google |
| `BETTER_AUTH_GITHUB_ENABLED` + `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub |
| `BETTER_AUTH_OIDC_ENABLED` 等 | 通用 OIDC（Keycloak / Authentik / Dex…） |

第三方登录映射到本地用户时**不会自动授予管理员**。

### 邮件（注册验证 / 找回密码）

在控制台 **设置 → 邮件 (SMTP)** 配置，或写入系统配置。启用且 SMTP 完整时：

- 注册可要求邮箱并发送验证信  
- 支持忘记密码重置链接  
- `getPublicConfig` 会暴露 `emailEnabled`（不含密钥）给前端  

## 智能路由

| 变量 | 说明 |
|------|------|
| `SMART_ROUTING_ENABLED` | 是否启用 |
| `OPENAI_API_KEY` | Embedding 等 |
| `OPENAI_API_BASE_URL` | 可选自定义网关 |
| `OPENAI_API_EMBEDDING_MODEL` | 如 `text-embedding-3-small` |

**`dbUrl`（向量库）为实例级基础设施**，仅管理员可在设置中查看/修改；普通用户可覆盖个人 API Key 等（见多账户配置）。

## 小智重连（可选）

| 变量 | 说明 |
|------|------|
| `XIAOZHI_AGGRESSIVE_RECONNECT` | 快速重连（弱退避） |
| `XIAOZHI_RECONNECT_INTERVAL` | 快速重连间隔 ms |
| `XIAOZHI_MAX_INFINITE_RETRIES` | 无限重连上限（0=不限制） |
| `XIAOZHI_SLEEP_THRESHOLD` / `XIAOZHI_SLEEP_INTERVAL` | 休眠阈值与间隔 |
| `XIAOZHI_MAX_CONCURRENT_RECONNECTS` | 同时重连上限（默认 3，背压） |
| `XIAOZHI_RECONNECT_JITTER_RATIO` | 重连延迟抖动 0–1（默认 0.2） |

端点级重连参数也可在 UI 中配置。详见 [小智接入](/configuration/xiaozhi)。

## 更新检查

| 变量 | 说明 |
|------|------|
| `DISABLE_UPDATE_CHECK` | `true` 关闭关于弹窗的更新检查 |
| `MCPHUB_GITHUB_REPO` | 默认 `huangjunsen0406/xiaozhi-mcphub` |
| `MCPHUB_GITHUB_TOKEN` / `GITHUB_TOKEN` | 提高 GitHub API 限额（私有仓需要） |
| `MCPHUB_UPDATE_CHECK_TIMEOUT_MS` | 请求超时 |
| `MCPHUB_UPDATE_CHECK_CACHE_TTL_SECONDS` | 进程内缓存 TTL |

更新源为本仓库 **GitHub Releases**（无 npm 兜底）。

## 代理与其它

| 变量 | 说明 |
|------|------|
| `HTTP_PROXY` / `HTTPS_PROXY` | 出站代理 |
| `NPM_REGISTRY` | 安装 MCP 依赖时的 npm 源（镜像内） |

## 示例 `.env`

```bash
PORT=3000
NODE_ENV=production
JWT_SECRET=replace-with-long-random-string
DB_URL=postgres://xiaozhi:xiaozhi123456@127.0.0.1:5432/xiaozhi_mcphub
# ADMIN_PASSWORD=only-on-first-bootstrap
# SMART_ROUTING_ENABLED=false
# DISABLE_UPDATE_CHECK=false
```

本地示例还可参考仓库根目录 `.env.example`。
