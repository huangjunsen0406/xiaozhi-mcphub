# xiaozhi-mcphub 文档（VitePress）

本目录是 **xiaozhi-mcphub** 的公开用户文档站点，基于 [VitePress](https://vitepress.dev/) 构建。  
GitHub Pages 由 `.github/workflows/vitepress.yml` 在 push 到 `main` 时部署到 `gh-pages`。

## 本地开发

```bash
pnpm install
pnpm docs:dev      # 开发（base: /xiaozhi-mcphub/）
pnpm docs:build
pnpm docs:preview

# 或在仓库根目录
pnpm docs:dev
pnpm docs:build
```

## 目录结构

```
documents/
├── docs/                 # 文档源码
│   ├── .vitepress/       # 站点配置
│   ├── configuration/    # Docker / 环境变量 / MCP / 小智
│   ├── development/
│   ├── features/
│   ├── images/
│   ├── index.md
│   └── quickstart.md
├── package.json
└── pnpm-lock.yaml
```

## 与根目录 `docs/` 的关系

- **公开文档**：只维护本目录（VitePress）
- **`docs/agents/`、`docs/adr/`**：给 Agent / 架构决策用的内部说明（已去掉上游 Mintlify 用户文档）
