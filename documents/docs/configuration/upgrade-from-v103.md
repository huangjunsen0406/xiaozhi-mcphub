# 从 v1.0.3 升级到 1.1.x

适用于已经在跑 **xiaozhi-mcphub 1.0.3**（或同代「始终连 PostgreSQL」版本），要升到 **1.1.x** 的用户。  
也覆盖：**已经升到 1.1.0–1.1.2 后发现 servers / 端点「丢了」**，但 Postgres volume 还在的场景。

## 发生了什么

| 项目 | v1.0.3 | 1.1.x |
|------|--------|-------|
| 环境变量 | `DATABASE_URL` | **`DB_URL`**（现已兼容读取旧名） |
| MCP 服务器表 | `mcp_servers`（`name` 主键） | `servers`（uuid + `owner+name` 唯一） |
| 小智端点表 | `xiaozhi_endpoints` | 同名（多了 `owner`） |
| 无库时 | 仍会连默认 localhost Postgres | 可回退到 JSON 文件模式 |

1.1.x 早期若只换了镜像、仍只配 `DATABASE_URL`，应用会当成「没配库」走进文件模式，界面只剩镜像内置示例服务器，并可能在日志里生成新的 admin 密码。  
即便连上了同一 Postgres，TypeORM `synchronize` 也会**新建空的 `servers` 表**，不会自动把 `mcp_servers` 拷过去——旧数据其实还在旧表里。

## 升级 / 找回步骤（推荐）

1. **备份 Postgres volume**（`pgdata`），不要 `docker compose down -v`。
2. 确认 compose / 运行参数指向**同一个**数据库。
3. 把环境变量改成（或同时保留旧名亦可）：

```yaml
environment:
  DB_URL: "postgres://xiaozhi:你的密码@db:5432/xiaozhi_mcphub"
  # 可选：显式 USE_DB: "true"
```

容器内主机名用 compose 服务名（如 `db`），不要用 `127.0.0.1`（那是容器自己）。

4. 拉起带补偿迁移的版本（含本修复的 1.1.x+）：

```bash
docker compose pull   # 或指定新 tag
docker compose up -d
docker compose logs -f mcphub
```

5. 日志中应出现类似：

```text
[legacy-schema] Found legacy mcp_servers with N row(s); copying any missing servers…
  - migrated server: …
[legacy-schema] mcp_servers migration done: copied=…, skipped=…
```

6. 登录控制台核对 Servers / 小智端点。  
   - 已存在同名 `(owner, name)` 的新行会被 **skip**（不覆盖你后来手工重建的配置）。  
   - 旧表 `mcp_servers` **保留作备份**，不会自动 DROP。

## 已经升到 1.1.2、数据「丢了」怎么办

只要 **Postgres 里还看得到 `mcp_servers`**，升到带本修复的版本再启动一次即可补偿：

```sql
-- 在库里确认旧表还在
SELECT COUNT(*) FROM mcp_servers;
SELECT COUNT(*) FROM servers;
SELECT COUNT(*) FROM xiaozhi_endpoints;
```

- `mcp_servers` 有数据、`servers` 为空或明显偏少 → 启动后会把缺失行拷进 `servers`。  
- 小智端点表名未变；连对库后应直接可见，并会把空 `owner` 回填为 `admin`。  

### 若启动报 `column "username" … contains null values`

1.1.3 早期在 TypeORM `synchronize` 时，可能把 v1.0.3 的无长度 `varchar` 误重建成 `varchar(255) NOT NULL`，对已有 admin 行会失败。  
**1.1.4+** 已去掉该 length 漂移，并在 synchronize 前做安全预对齐。

若你仍卡在 1.1.3，可先手工确认（一般无需改数据——你的 `select * from users` 里 username 已有值）：

```sql
SELECT username, length(password) FROM users;
-- username 不应为 NULL
```

然后直接拉 **≥1.1.5** 镜像重启即可；不要 `DROP` users。

### 若启动报 `column SystemConfig.modelscope does not exist`

1.1.4 有一处 bug：把 `modelscope` 当成「驼峰/蛇形同名」做合并时，把**唯一**的 `modelscope` 列 DROP 掉了。  
**1.1.5+** 会跳过同名合并，并在启动时 `ADD COLUMN IF NOT EXISTS modelscope` 自动补回。

直接拉新镜像重启即可，一般无需手工 SQL。若要手动确认：

```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'system_config' ORDER BY 1;
-- 应包含 modelscope、smart_routing、mcp_router 等
```

### Admin 密码会不会丢？要不要迁？

**不用单独迁 admin 密码。** v1.0.3 的账号就在同一 Postgres 的 **`users`** 表里（bcrypt 哈希，表名未改）。

| 情况 | 登录用什么 |
|------|------------|
| 连回**原来的** `pgdata` / 同一库 | **你升级前自己设过的 admin 密码**（或 v1.0.3 默认 `admin123`，若从未改过） |
| 1.1.x 曾因没配 `DB_URL` 走进文件模式，日志打印了随机密码 | 那是写在**空的 JSON 用户列表**里的一次性账号；**不会**写回覆盖 Postgres 里的旧 admin |
| 生产环境空库首次启动 | 才会生成随机密码并打日志（`admin123` 仅 development） |

启动成功连上旧库时日志类似：

```text
[legacy-schema] Reusing N existing user(s) from the database (including admin). Keep the password you set before the upgrade…
User store already has N account(s); reusing existing admin credentials (not regenerating password)
```

可在库里自检：

```sql
SELECT username, is_admin, length(password) AS hash_len, created_at
FROM users
ORDER BY created_at;
```

`admin` 行还在且 `hash_len` 正常（bcrypt 一般 60）→ 用**旧密码**登录即可，无需 reset。  
只有 `users` 也空了（例如误删 volume）才需要用日志里的新密码或 `ADMIN_PASSWORD` 重建。

若 `mcp_servers` 和 volume 都没了，应用无法凭空恢复，只能从外部备份还原。

## 兼容说明

- **`DATABASE_URL`**：启动时仍可读，并打一次 deprecation 警告；请尽快改成 `DB_URL`。  
- **空 DB URL + 智能路由 embedding**：不再默默连 `127.0.0.1:5432`，会跳过或明确报错。  
- **JSON 文件 → DB**：仅在新库 `users` 为空时从 `mcp_settings.json` 导入；**不能**替代 `mcp_servers` 补偿（那是另一条路径）。

## 相关文件

- `src/config/dbEnv.ts` — `DB_URL` / `DATABASE_URL` 解析  
- `src/utils/legacySchemaMigration.ts` — `mcp_servers` → `servers` 等  
- `src/utils/migration.ts` — 启动时调用补偿 + owner 回填  
