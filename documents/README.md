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
├── docs/                 # 文档源码（VitePress content root）
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

## 文档范围

- **公开文档**：只维护本目录（VitePress）
- 上游 Mintlify 用户文档与内部 ADR / agents 笔记均已移除，仓库内不再保留 `docs/` 目录
