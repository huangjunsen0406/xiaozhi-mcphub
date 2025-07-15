# 智能路由

## 概述

智能路由是 XIAOZHI-MCPHUB 的智能工具发现系统，使用向量语义搜索自动找到任何给定任务最相关的工具。AI 客户端无需手动指定使用哪些工具，而是可以描述他们想要完成的任务，智能路由将识别并提供对最合适工具的访问。

## 智能路由工作原理

![智能路由流程图](../images/smart-routing.zh.png)

智能路由采用先进的语义搜索技术，自动识别并分配最适合的工具来处理特定任务。上图展示了完整的智能路由流程，从查询接收到工具执行的每个步骤。

### 1. 工具索引

当服务器启动时，智能路由自动：

- 从 MCP 服务器发现所有可用工具
- 提取工具元数据（名称、描述、参数）
- 将工具信息转换为向量嵌入
- 使用 pgvector 将嵌入存储在 PostgreSQL 中

### 2. 语义搜索

当进行查询时：

- 用户查询被转换为向量嵌入
- 相似性搜索使用余弦相似度找到匹配工具
- 动态阈值过滤掉不相关的结果
- 结果按相关性评分排序

### 3. 智能过滤

智能路由应用多个过滤器：

- **相关性阈值**: 仅返回超过相似性阈值的工具
- **上下文感知**: 考虑对话上下文
- **工具可用性**: 确保工具当前可访问
- **权限过滤**: 尊重用户访问权限

### 4. 工具执行

找到的工具可以直接执行：

- 参数验证确保正确的工具使用
- 错误处理提供有用的反馈
- 响应格式保持一致性
- 日志记录跟踪工具使用情况以进行分析

## 前提条件

智能路由需要比基本 XIAOZHI-MCPHUB 使用更多的设置：

### 必需组件

1. **带 pgvector 的 PostgreSQL**: 用于嵌入存储的向量数据库
2. **嵌入服务**: OpenAI API 或兼容服务
3. **环境配置**: 适当的配置变量

### 快速设置

#### Docker Compose

使用此 `docker-compose.yml` 进行完整设置：

```yaml
version: '3.8'
services:
  xiaozhi-mcphub:
    image: xiaozhi-mcphub:latest
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://mcphub:password@postgres:5432/xiaozhi_mcphub
      - OPENAI_API_KEY=your_openai_api_key
      - ENABLE_SMART_ROUTING=true
    depends_on:
      - postgres
    volumes:
      - ./mcp_settings.json:/app/mcp_settings.json

  postgres:
    image: pgvector/pgvector:pg16
    environment:
      - POSTGRES_DB=xiaozhi_mcphub
      - POSTGRES_USER=mcphub
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

volumes:
  postgres_data:
```

启动：
```bash
docker-compose up -d
```

#### 手动设置

1. **安装带 pgvector 的 PostgreSQL**:
```bash
# 使用 Docker
docker run -d \
  --name xiaozhi-mcphub-postgres \
  -e POSTGRES_DB=xiaozhi_mcphub \
  -e POSTGRES_USER=mcphub \
  -e POSTGRES_PASSWORD=your_password \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

2. **设置环境变量**:
```bash
export DATABASE_URL="postgresql://mcphub:your_password@localhost:5432/xiaozhi_mcphub"
export OPENAI_API_KEY="your_openai_api_key"
export ENABLE_SMART_ROUTING="true"
```

3. **启动 XIAOZHI-MCPHUB**:
```bash
xiaozhi-mcphub
```

#### Kubernetes

使用这些 Kubernetes 清单进行部署：

```yaml
# postgres-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
spec:
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: pgvector/pgvector:pg16
        env:
        - name: POSTGRES_DB
          value: xiaozhi_mcphub
        - name: POSTGRES_USER
          value: mcphub
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: postgres-secret
              key: password
        ports:
        - containerPort: 5432
---
# xiaozhi-mcphub-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: xiaozhi-mcphub
spec:
  selector:
    matchLabels:
      app: xiaozhi-mcphub
  template:
    metadata:
      labels:
        app: xiaozhi-mcphub
    spec:
      containers:
      - name: xiaozhi-mcphub
        image: xiaozhi-mcphub:latest
        env:
        - name: DATABASE_URL
          value: "postgresql://mcphub:password@postgres:5432/xiaozhi_mcphub"
        - name: OPENAI_API_KEY
          valueFrom:
            secretKeyRef:
              name: openai-secret
              key: api-key
        - name: ENABLE_SMART_ROUTING
          value: "true"
        ports:
        - containerPort: 3000
```

## 配置

### 环境变量

智能路由的必需环境变量：

```bash
# 必需
DATABASE_URL=postgresql://user:pass@host:port/dbname
OPENAI_API_KEY=sk-your-api-key
ENABLE_SMART_ROUTING=true

# 可选
EMBEDDING_MODEL=text-embedding-3-small
SIMILARITY_THRESHOLD=0.7
MAX_RESULTS=10
CACHE_EMBEDDINGS=true
```

### 高级配置

在 `mcp_settings.json` 中进行详细配置：

```json
{
  "smartRouting": {
    "enabled": true,
    "embedding": {
      "provider": "openai",
      "model": "text-embedding-3-small",
      "dimensions": 1536
    },
    "search": {
      "similarityThreshold": 0.7,
      "maxResults": 10,
      "enableCache": true,
      "cacheTimeout": 3600
    },
    "indexing": {
      "autoReindex": true,
      "reindexInterval": "1h",
      "batchSize": 100
    }
  }
}
```

## 使用智能路由

### 基本用法

智能路由通过专用端点提供：

```bash
# 搜索相关工具
curl -X POST http://localhost:3000/api/smart-routing/search \
  -H "Content-Type: application/json" \
  -d '{"query": "help me scrape data from a website"}'
```

响应示例：
```json
{
  "tools": [
    {
      "name": "fetch_html",
      "server": "fetch",
      "description": "Fetch HTML content from a URL",
      "similarity": 0.89,
      "parameters": {
        "url": {"type": "string", "required": true}
      }
    },
    {
      "name": "playwright_navigate",
      "server": "playwright", 
      "description": "Navigate to a web page with browser automation",
      "similarity": 0.82,
      "parameters": {
        "url": {"type": "string", "required": true}
      }
    }
  ]
}
```

### 直接工具执行

智能路由还支持直接工具执行：

```bash
# 让智能路由找到并执行最佳工具
curl -X POST http://localhost:3000/api/smart-routing/execute \
  -H "Content-Type: application/json" \
  -d '{
    "query": "get the title of example.com",
    "parameters": {
      "url": "https://example.com"
    }
  }'
```

### MCP 客户端集成

智能路由与标准 MCP 客户端兼容：

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

// 连接到智能路由端点
const client = new Client({
  name: "my-app",
  version: "1.0.0"
}, {
  command: "node",
  args: ["-e", "/* 智能路由连接器 */"]
});

// 客户端会自动获得所有相关工具的访问权限
const tools = await client.listTools();
```

## 性能优化

### 嵌入缓存

启用嵌入缓存以提高性能：

```json
{
  "cache": {
    "enabled": true,
    "type": "redis",
    "redis": {
      "host": "localhost",
      "port": 6379,
      "db": 0
    },
    "ttl": 3600
  }
}
```

### 索引优化

优化向量搜索性能：

```sql
-- 在 PostgreSQL 中创建索引
CREATE INDEX ON tool_embeddings USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

-- 或使用 HNSW 索引以获得更好的性能
CREATE INDEX ON tool_embeddings USING hnsw (embedding vector_cosine_ops) 
WITH (m = 16, ef_construction = 64);
```

### 批量处理

配置批量嵌入处理：

```json
{
  "indexing": {
    "batchSize": 100,
    "concurrency": 5,
    "retryAttempts": 3
  }
}
```

## 监控和分析

### 搜索分析

跟踪搜索模式和性能：

```bash
# 获取搜索统计
curl http://localhost:3000/api/smart-routing/analytics

# 响应
{
  "totalSearches": 1547,
  "avgResponseTime": 234,
  "topQueries": [
    {"query": "web scraping", "count": 89},
    {"query": "file operations", "count": 67}
  ],
  "toolUsage": [
    {"tool": "fetch_html", "executions": 156},
    {"tool": "read_file", "executions": 134}
  ]
}
```

### 质量度量

监控搜索质量：

```json
{
  "qualityMetrics": {
    "avgSimilarityScore": 0.85,
    "resultsWithLowSimilarity": 12,
    "noResultsQueries": 5,
    "userSatisfactionRate": 0.92
  }
}
```

## 故障排除

### 常见问题

#### 嵌入服务连接失败

```bash
# 测试 OpenAI 连接
curl -H "Authorization: Bearer $OPENAI_API_KEY" \
  https://api.openai.com/v1/models
```

#### 向量数据库问题

```sql
-- 检查 pgvector 扩展
SELECT * FROM pg_extension WHERE extname = 'vector';

-- 检查嵌入表
\d tool_embeddings
```

#### 搜索质量差

- 调整相似性阈值
- 检查工具描述质量
- 验证嵌入模型配置
- 考虑重新索引工具

### 调试模式

启用详细日志记录：

```bash
DEBUG=xiaozhi-mcphub:smart-routing npm start
```

### 性能分析

```bash
# 分析搜索性能
curl http://localhost:3000/api/smart-routing/performance
```