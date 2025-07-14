# 设置

了解如何配置您的 VitePress 文档

## 全局配置

所有的全局配置都在项目根目录的 `.vitepress/config.mts` 文件中设置。

### 网站信息

在配置的顶层设置文档的基本信息：

```typescript
// .vitepress/config.mts
export default defineConfig({
  title: 'XIAOZHI-MCPHUB',
  description: '智能化的 MCP 服务器管理平台',
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }]
  ]
})
```

### Logo 配置

您可以显示浅色和深色模式的 logo：

```typescript
export default defineConfig({
  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'MCPHub 文档'
  }
})
```

### 主题颜色

自定义文档的主色调以匹配您的品牌：

```css
/* .vitepress/theme/custom.css */
:root {
  --vp-c-brand-1: #9563FF;
  --vp-c-brand-2: #AE87FF;
  --vp-c-brand-3: #9563FF;
}
```

::: tip 提示
设置一种颜色系统，通过仅更改主色调来协调您文档的配色方案。
:::

### 导航配置

您的侧边栏导航在 `themeConfig.sidebar` 字段中设置：

```typescript
export default defineConfig({
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '快速开始', link: '/quickstart' },
      { text: '开发', link: '/development' }
    ],
    sidebar: [
      {
        text: '开始使用',
        items: [
          { text: '介绍', link: '/introduction' },
          { text: '快速开始', link: '/quickstart' },
          { text: '开发', link: '/development' }
        ]
      }
    ]
  }
})
```

#### 多侧边栏

您可以为不同的页面路径配置不同的侧边栏：

```typescript
export default defineConfig({
  themeConfig: {
    sidebar: {
      '/guide/': [
        {
          text: '指南',
          items: [
            { text: '介绍', link: '/guide/introduction' }
          ]
        }
      ],
      '/api/': [
        {
          text: 'API 参考',
          items: [
            { text: '端点', link: '/api/endpoints' }
          ]
        }
      ]
    }
  }
})
```

### 页脚配置

您可以在 `footer` 字段中配置页脚信息：

```typescript
export default defineConfig({
  themeConfig: {
    footer: {
      message: '基于 MIT 许可发布',
      copyright: 'Copyright © 2024-present MCPHub'
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/mcphub/mcphub' },
      { icon: 'discord', link: 'https://discord.gg/mcphub' }
    ]
  }
})
```

### 搜索配置

您可以配置本地搜索功能：

```typescript
export default defineConfig({
  themeConfig: {
    search: {
      provider: 'local',
      options: {
        locales: {
          zh: {
            translations: {
              button: {
                buttonText: '搜索文档',
                buttonAriaLabel: '搜索文档'
              },
              modal: {
                noResultsText: '无法找到相关结果',
                resetButtonTitle: '清除查询条件'
              }
            }
          }
        }
      }
    }
  }
})
```

## 页面配置

页面配置在每个 Markdown 文件顶部的 frontmatter 中设置。

### 标题和描述

```yaml
---
title: '介绍'
description: '欢迎来到我们的产品！'
---
```

### 页面元数据

```yaml
---
title: 'API 参考'
description: '完整的 API 接口文档'
head:
  - - meta
    - name: keywords
      content: API, 接口, 文档
  - - meta
    - property: og:title
      content: 'MCPHub API 参考'
---
```

### 自定义布局

```yaml
---
layout: home
hero:
  name: "MCPHub"
  text: "智能 MCP 服务器管理平台"
  tagline: "简单、快速、可靠的 MCP 服务器管理解决方案"
  actions:
    - theme: brand
      text: 快速开始
      link: /quickstart
    - theme: alt
      text: GitHub
      link: https://github.com/mcphub/mcphub
features:
  - title: 智能路由
    details: 基于 AI 的智能请求路由和负载均衡
  - title: 实时监控
    details: 全面的服务器状态监控和性能分析
  - title: 简单配置
    details: 直观的配置界面和一键部署
---
```

### 页面样式

```yaml
---
title: '宽屏页面'
layout: page
aside: false
---
```

可用的布局选项：
- `page`（默认）- 标准页面布局
- `home` - 首页布局  
- `doc` - 文档页面布局

### 编辑链接

```yaml
---
editLink:
  pattern: 'https://github.com/mcphub/docs/edit/main/docs/:path'
  text: '在 GitHub 上编辑此页'
---
```

### 最后更新时间

```yaml
---
lastUpdated: true
---
```

## 国际化配置

### 多语言配置

```typescript
export default defineConfig({
  locales: {
    root: {
      label: '简体中文',
      lang: 'zh'
    },
    en: {
      label: 'English',
      lang: 'en',
      link: '/en/'
    }
  },
  themeConfig: {
    // 中文配置
    nav: [
      { text: '首页', link: '/' },
      { text: '快速开始', link: '/quickstart' }
    ]
  }
})
```

### 语言切换

```typescript
export default defineConfig({
  themeConfig: {
    langMenuLabel: '切换语言',
    returnToTopLabel: '回到顶部',
    sidebarMenuLabel: '菜单',
    darkModeSwitchLabel: '主题',
    lightModeSwitchTitle: '切换到浅色模式',
    darkModeSwitchTitle: '切换到深色模式'
  }
})
```

## 插件配置

### 代码高亮

```typescript
export default defineConfig({
  markdown: {
    theme: 'material-theme-palenight',
    lineNumbers: true,
    config: (md) => {
      // 添加自定义 markdown 插件
    }
  }
})
```

### PWA 支持

```typescript
import { withPwa } from '@vite-pwa/vitepress'

export default withPwa(
  defineConfig({
    // VitePress 配置
  }),
  {
    // PWA 配置
    registerType: 'autoUpdate',
    workbox: {
      globPatterns: ['**/*.{css,js,html,svg,png,ico,txt,woff2}']
    }
  }
)
```

## 构建配置

### 输出目录

```typescript
export default defineConfig({
  srcDir: './docs',
  outDir: './dist',
  cacheDir: './.vitepress/cache'
})
```

### 基础路径

```typescript
export default defineConfig({
  base: '/xiaozhi-mcphub/',
  cleanUrls: true
})
```

### 构建优化

```typescript
export default defineConfig({
  vite: {
    build: {
      minify: 'terser',
      chunkSizeWarningLimit: 1000
    }
  }
})
``` 