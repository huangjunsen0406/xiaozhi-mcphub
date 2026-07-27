# Nginx 配置

本指南说明如何配置 Nginx 作为 xiaozhi-mcphub 的反向代理，包括 SSL 终止、负载均衡和缓存策略。xiaozhi-mcphub 是小智AI平台专用的MCP桥接系统。

## 基本反向代理设置

### 配置文件

创建或更新您的 Nginx 配置文件（`/etc/nginx/sites-available/xiaozhi-mcphub`）：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 将 HTTP 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL 配置
    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # 安全头
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # Gzip 压缩
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml+rss
        application/atom+xml
        image/svg+xml;

    # 主应用程序
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 86400;
    }

    # API 端点，为 MCP 操作和小智平台集成设置更长的超时
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300;
        proxy_connect_timeout 60;
        proxy_send_timeout 60;
    }

    # 小智平台 WebSocket 连接
    location /api/xiaozhi/ws {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;
        proxy_send_timeout 24h;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://127.0.0.1:3000;
        proxy_cache_valid 200 1d;
        proxy_cache_valid 404 1m;
        add_header Cache-Control "public, immutable";
        expires 1y;
    }
}
```

### 启用配置

```bash
# 创建符号链接启用站点
sudo ln -s /etc/nginx/sites-available/xiaozhi-mcphub /etc/nginx/sites-enabled/

# 测试配置
sudo nginx -t

# 重新加载 Nginx
sudo systemctl reload nginx
```

## 负载均衡配置

对于具有多个 xiaozhi-mcphub 实例的高可用性设置：

```nginx
upstream xiaozhi_mcphub_backend {
    least_conn;
    server 127.0.0.1:3000 weight=1 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:3001 weight=1 max_fails=3 fail_timeout=30s;
    server 127.0.0.1:3002 weight=1 max_fails=3 fail_timeout=30s;

    # 健康检查（Nginx Plus 功能）
    # health_check interval=5s fails=3 passes=2;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL 和其他配置...

    location / {
        proxy_pass http://xiaozhi_mcphub_backend;
        # 其他代理设置...
    }
}
```

## 缓存配置

### 浏览器缓存

```nginx
# 缓存静态资源
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
    proxy_pass http://127.0.0.1:3000;
    expires 1y;
    add_header Cache-Control "public, immutable";
}

# 缓存 API 响应（小心动态内容）
location /api/public/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_cache xiaozhi_mcphub_cache;
    proxy_cache_valid 200 5m;
    proxy_cache_key "$scheme$request_method$host$request_uri";
    add_header X-Cache-Status $upstream_cache_status;
}
```

### Nginx 代理缓存

在 `nginx.conf` 的 `http` 块中添加：

```nginx
http {
    # 代理缓存配置
    proxy_cache_path /var/cache/nginx/xiaozhi-mcphub
                     levels=1:2
                     keys_zone=xiaozhi_mcphub_cache:10m
                     max_size=1g
                     inactive=60m
                     use_temp_path=off;

    # 其他配置...
}
```

## WebSocket 支持

对于实时功能和 SSE（服务器发送事件）：

```nginx
location /api/stream {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # 禁用实时响应的缓冲
    proxy_buffering off;
    proxy_cache off;

    # 长连接超时
    proxy_read_timeout 24h;
    proxy_send_timeout 24h;
}
```

## 安全配置

### 速率限制

```nginx
http {
    # 定义速率限制区域
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=login:10m rate=1r/s;

    server {
        # 对 API 端点应用速率限制
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            # 其他配置...
        }

        # 登录端点的严格速率限制
        location /api/auth/login {
            limit_req zone=login burst=5;
            # 其他配置...
        }
    }
}
```

### IP 白名单

```nginx
# 为管理端点允许特定 IP
location /api/admin/ {
    allow 192.168.1.0/24;
    allow 10.0.0.0/8;
    deny all;

    proxy_pass http://127.0.0.1:3000;
    # 其他代理设置...
}
```

## 监控和日志

### 访问日志

```nginx
http {
    # 自定义日志格式
    log_format xiaozhi_mcphub_format '$remote_addr - $remote_user [$time_local] '
                                    '"$request" $status $body_bytes_sent '
                                    '"$http_referer" "$http_user_agent" '
                                    '$request_time $upstream_response_time '
                                    '"$http_x_xiaozhi_request_id"';

    server {
        # 启用访问日志
        access_log /var/log/nginx/xiaozhi_mcphub_access.log xiaozhi_mcphub_format;
        error_log /var/log/nginx/xiaozhi_mcphub_error.log;

        # 其他配置...
    }
}
```

### 状态页面

```nginx
location /nginx_status {
    stub_status;
    allow 127.0.0.1;
    deny all;
}
```

## Docker 集成

当在 Docker 中运行 xiaozhi-mcphub 时，更新代理配置：

```nginx
upstream xiaozhi_mcphub_docker {
    server xiaozhi-mcphub:3000;  # Docker 服务名
}

server {
    location / {
        proxy_pass http://xiaozhi_mcphub_docker;
        # 其他代理设置...
    }
}
```

### Docker Compose 集成

如果使用 Docker Compose，可以直接引用服务名：

```nginx
upstream xiaozhi_mcphub_app {
    server xiaozhi-mcphub-app:3000;  # docker-compose.yml 中的服务名
}

server {
    listen 80;
    server_name localhost;

    location / {
        proxy_pass http://xiaozhi_mcphub_app;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

## SSL/TLS 配置

### Let's Encrypt 证书

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo crontab -e
# 添加：0 12 * * * /usr/bin/certbot renew --quiet
```

### 自签名证书（仅开发）

```bash
# 生成自签名证书
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /etc/ssl/private/mcphub.key \
    -out /etc/ssl/certs/mcphub.crt
```

## 性能优化

### 工作进程

```nginx
# 在 nginx.conf 中
worker_processes auto;
worker_connections 1024;
```

### 缓冲区大小

```nginx
proxy_buffering on;
proxy_buffer_size 128k;
proxy_buffers 4 256k;
proxy_busy_buffers_size 256k;
```

### Keep-Alive

```nginx
upstream xiaozhi_mcphub_backend {
    server 127.0.0.1:3000;
    keepalive 32;
}

location / {
    proxy_pass http://xiaozhi_mcphub_backend;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
}
```

## 完整示例配置

使用提供的 `nginx.conf.example` 的生产就绪示例：

```bash
# 复制示例配置
cp nginx.conf.example /etc/nginx/sites-available/xiaozhi-mcphub

# 使用您的域名和路径更新配置
sudo nano /etc/nginx/sites-available/xiaozhi-mcphub

# 启用站点
sudo ln -s /etc/nginx/sites-available/xiaozhi-mcphub /etc/nginx/sites-enabled/

# 测试并重新加载
sudo nginx -t && sudo systemctl reload nginx
```

### 使用 huangjunsen0406/xiaozhi-mcphub Docker 镜像

如果使用官方 Docker 镜像：

```bash
# 启动 xiaozhi-mcphub 容器
docker run -d \
  --name xiaozhi-mcphub \
  -p 3000:3000 \
  -v ./mcp_settings.json:/app/mcp_settings.json \
  -e XIAOZHI_ENABLED=true \
  -e XIAOZHI_API_KEY=your-api-key \
  huangjunsen/xiaozhi-mcphub:latest

# 更新 Nginx 配置以指向容器
sudo nano /etc/nginx/sites-available/xiaozhi-mcphub
```

## 故障排除

### 常见问题

**502 Bad Gateway**：检查 xiaozhi-mcphub 是否正在运行且可访问

```bash
# 检查 xiaozhi-mcphub 状态
curl -I http://localhost:3000

# 检查 Docker 容器状态
docker ps | grep xiaozhi-mcphub
docker logs xiaozhi-mcphub

# 检查系统服务状态
systemctl status xiaozhi-mcphub
```

**504 Gateway Timeout**：为长时间运行的操作增加 `proxy_read_timeout`

**WebSocket 连接失败**：确保正确的 `Upgrade` 和 `Connection` 头

**缓存问题**：清除代理缓存或在开发中禁用

```bash
# 清除 Nginx 缓存
sudo rm -rf /var/cache/nginx/xiaozhi-mcphub/*
sudo systemctl reload nginx
```

### 调试命令

```bash
# 测试 Nginx 配置
sudo nginx -t

# 检查 Nginx 状态
sudo systemctl status nginx

# 查看错误日志
sudo tail -f /var/log/nginx/error.log

# 查看访问日志
sudo tail -f /var/log/nginx/xiaozhi_mcphub_access.log

# 查看错误日志
sudo tail -f /var/log/nginx/xiaozhi_mcphub_error.log

# 重新加载配置
sudo systemctl reload nginx

# 重启 Nginx
sudo systemctl restart nginx
```

### 连接测试

```bash
# 测试直连
curl -I http://localhost:3000

# 测试通过 Nginx
curl -I https://your-domain.com

# 测试 WebSocket
wscat -c wss://your-domain.com/api/stream
```

## 监控指标

### 关键指标

```nginx
# 在状态页面中监控
location /nginx_status {
    stub_status;
    allow 127.0.0.1;
    deny all;
}
```

监控以下指标：
- 活跃连接数
- 请求处理速度
- 响应时间
- 错误率
- 上游服务器状态

### 日志分析

```bash
# 分析访问日志
sudo tail -f /var/log/nginx/xiaozhi_mcphub_access.log | grep "POST\|PUT\|DELETE"

# 查看小智平台相关请求
sudo grep "/api/xiaozhi" /var/log/nginx/xiaozhi_mcphub_access.log | tail -20

# 查看错误
sudo grep "error" /var/log/nginx/xiaozhi_mcphub_error.log | tail -20

# 统计状态码
sudo awk '{print $9}' /var/log/nginx/xiaozhi_mcphub_access.log | sort | uniq -c | sort -nr

# 分析小智平台请求ID追踪
sudo grep "xiaozhi_request_id" /var/log/nginx/xiaozhi_mcphub_access.log | tail -10
```

::: tip 性能建议
- 启用 gzip 压缩减少传输大小
- 配置适当的缓存策略
- 使用 HTTP/2 提高性能
- 定期监控和调优配置
:::

::: warning 安全提醒
- 始终使用 HTTPS 在生产环境中
- 配置适当的安全头
- 实施速率限制防止滥用
- 定期更新 SSL 证书
- 限制管理端点的访问
:::

此配置为在 Nginx 后运行 xiaozhi-mcphub 提供了坚实的基础，具有适当的安全性、性能和可靠性功能，同时支持小智AI平台的 WebSocket 连接和实时通信需求。

::: tip 性能建议
- 启用 gzip 压缩减少传输大小
- 配置适当的缓存策略
- 使用 HTTP/2 提高性能
- 定期监控和调优配置
- 为小智平台 WebSocket 连接配置长连接超时
:::

::: warning 安全提醒
- 始终使用 HTTPS 在生产环境中
- 配置适当的安全头
- 实施速率限制防止滥用
- 定期更新 SSL 证书
- 限制管理端点的访问
- 保护小智平台 API 密钥和连接信息
::: 