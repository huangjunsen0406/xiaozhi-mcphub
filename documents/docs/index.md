---
layout: home

hero:
  name: "xiaozhi-mcphub"
  text: "为小智 AI 优化的 MCP 桥接与控制台"
  tagline: "多端点小智接入 · 多账户隔离 · 智能路由 · 统一 MCP 入口。当前版本 1.1.0，上游基线 MCPHub v1.0.25。"
  image:
    src: /images/dashboard.zh.png
    alt: xiaozhi-mcphub 仪表盘
  actions:
    - theme: brand
      text: 快速开始
      link: /quickstart
    - theme: alt
      text: Docker 部署
      link: /configuration/docker-setup
    - theme: alt
      text: GitHub
      link: https://github.com/huangjunsen0406/xiaozhi-mcphub

features:
  - title: 小智多端点
    details: 按用户管理多个 WebSocket 端点，支持启用/禁用、重连策略与分组 / $smart 绑定。
  - title: 多账户隔离
    details: Server / Group 按 owner 命名空间隔离；非管理员只能管理自己的资源。
  - title: 注册与邮箱认证
    details: 支持注册、邮箱验证、找回/重置密码；密码强度校验与中英文案。
  - title: 智能路由
    details: 可选向量检索，只把相关工具暴露给上游模型，降低上下文占用。
  - title: 统一 MCP 入口
    details: /mcp、/mcp/$smart、分组与单服务器路由，兼容 Claude Desktop / Cursor 等客户端。
  - title: 自有更新检查
    details: 「关于」弹窗检查本仓库 GitHub Releases，镜像 huangjunsen/xiaozhi-mcphub。
---

## 控制台预览

![仪表盘](./images/dashboard.zh.png)

## 一分钟上手

```bash
docker pull huangjunsen/xiaozhi-mcphub:1.1.0
# 或
docker pull huangjunsen/xiaozhi-mcphub:latest

docker run -d --name xiaozhi-mcphub -p 3000:3000 \
  -e DB_URL="postgres://xiaozhi:xiaozhi123456@host.docker.internal:5432/xiaozhi_mcphub" \
  huangjunsen/xiaozhi-mcphub:1.1.0
```

浏览器打开 `http://localhost:3000`。默认管理员多为 `admin` / `admin123`（生产请立刻改密；首次启动也可能在日志打印随机密码）。

更多见 [快速开始](/quickstart) 与 [环境变量](/configuration/environment-variables)。
