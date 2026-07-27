# Internal docs (agents / ADRs)

Public user documentation lives in **VitePress** under [`documents/`](../documents/).

This directory only keeps:

- `agents/` — agent workflow guides (issue tracker, triage, domain)
- `adr/` — architectural decision records

```bash
# Dev / build public docs
cd documents && pnpm install && pnpm docs:dev
cd documents && pnpm docs:build
```

GitHub Pages deploy: `.github/workflows/vitepress.yml` → `gh-pages` from `documents/docs/.vitepress/dist`.
