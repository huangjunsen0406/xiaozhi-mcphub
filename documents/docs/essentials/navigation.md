# 导航配置

MCPHub 文档的导航结构配置指南

## 基础导航

MCPHub 文档的导航在 VitePress 的 `config.mts` 文件中配置。基本导航结构包含侧边栏和顶部导航：

```typescript
// docs/.vitepress/config.mts
export default defineConfig({
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '快速开始', link: '/quickstart' },
      { 
        text: '开发指南',
        items: [
          { text: '入门指南', link: '/development/getting-started' },
          { text: 'API 集成', link: '/development/api-integration' },
          { text: '测试', link: '/development/testing' }
        ]
      }
    ],
    sidebar: {
      '/': [
        {
          text: '开始使用',
          items: [
            { text: '介绍', link: '/index' },
            { text: '快速开始', link: '/quickstart' }
          ]
        },
        {
          text: '配置管理',
          items: [
            { text: '环境变量', link: '/configuration/environment-variables' },
            { text: 'MCP 设置', link: '/configuration/mcp-settings' },
            { text: 'Docker 设置', link: '/configuration/docker-setup' },
            { text: 'Nginx 配置', link: '/configuration/nginx' }
          ]
        }
      ]
    }
  }
})
```

## 标签导航

当您的文档有多个主要部分时，可以使用下拉菜单来组织内容：

```typescript
// config.mts 中的导航配置
nav: [
  {
    text: '指南',
    items: [
      { text: '基础概念', link: '/basics/introduction' },
      { text: '安装部署', link: '/basics/installation' }
    ]
  },
  {
    text: 'API 参考',
    items: [
      { text: '端点说明', link: '/api/endpoints' },
      { text: '认证方式', link: '/api/authentication' }
    ]
  }
]
```

## 页面引用

### 文件路径引用

最常见的方式是通过文件路径引用页面（不包含 `.md` 扩展名）：

```typescript
sidebar: [
  {
    text: '快速开始',
    items: [
      { text: '介绍', link: '/introduction' },
      { text: '安装', link: '/installation' }
    ]
  }
]
```

### 外部链接

您也可以在导航中包含外部链接：

```typescript
nav: [
  { text: '文档', link: '/' },
  { text: 'GitHub', link: 'https://github.com/org/repo' }
]
```

## 分组

### 基本分组

每个组都有一个名称和页面列表：

```typescript
sidebar: [
  {
    text: 'API 基础',
    items: [
      { text: '认证', link: '/api/authentication' },
      { text: '错误码', link: '/api/errors' },
      { text: '速率限制', link: '/api/rate-limits' }
    ]
  }
]
```

### 可折叠分组

您可以设置分组为可折叠的：

```typescript
sidebar: [
  {
    text: 'API 参考',
    collapsed: true,
    items: [
      { text: '用户接口', link: '/api/users' },
      { text: '产品接口', link: '/api/products' }
    ]
  }
]
```

## 分层导航结构

### 多级导航

MCPHub 文档支持多级分层导航：

```typescript
sidebar: [
  {
    text: '核心功能',
    items: [
      {
        text: '服务器管理',
        link: '/features/server-management',
        items: [
          { text: '服务器健康检查', link: '/features/server-health' },
          { text: '服务器扩容', link: '/features/server-scaling' }
        ]
      },
      {
        text: '智能路由',
        link: '/features/smart-routing',
        items: [
          { text: '负载均衡', link: '/features/load-balancing' },
          { text: '故障转移', link: '/features/failover' }
        ]
      }
    ]
  }
]
```

### 条件导航

根据不同环境显示不同的导航项：

```typescript
// 根据环境变量配置不同的导航
const isDev = process.env.NODE_ENV === 'development'

export default defineConfig({
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '快速开始', link: '/quickstart' },
      ...(isDev ? [{ text: '开发工具', link: '/dev-tools' }] : [])
    ]
  }
})
```

## 导航图标

为导航项添加图标以提高可读性：

```typescript
nav: [
  { 
    text: '快速开始',
    link: '/quickstart',
    activeMatch: '/quickstart'
  },
  {
    text: '配置',
    items: [
      { text: '环境变量', link: '/configuration/environment-variables' },
      { text: 'MCP 设置', link: '/configuration/mcp-settings' }
    ]
  }
]
```

### 支持的图标

VitePress 支持多种方式添加图标：

- **内联 SVG**
- **图标字体**
- **图片文件**

常用图标示例：

| 功能 | 图标 | 用途        |
| ---- | ---- | ----------- |
| 首页 | 🏠   | 主页导航    |
| 设置 | ⚙️   | 配置相关    |
| API  | 🔌   | API 文档    |
| 安全 | 🔒   | 安全配置    |
| 监控 | 📊   | 监控面板    |
| 文档 | 📖   | 文档说明    |
| 开发 | 💻   | 开发指南    |

## 外部链接

在导航中包含外部资源链接：

```typescript
nav: [
  { text: '文档', link: '/' },
  {
    text: '社区',
    items: [
      { text: 'GitHub', link: 'https://github.com/mcphub/mcphub' },
      { text: 'Discord', link: 'https://discord.gg/mcphub' },
      { text: '状态页面', link: 'https://status.mcphub.io' }
    ]
  }
]
```

## 导航排序

### 自动排序

默认情况下，导航项按配置顺序排列。可以通过调整配置数组顺序控制排序：

```typescript
sidebar: [
  {
    text: '核心概念',
    items: [
      { text: '介绍', link: '/concepts/introduction' },      // 第一个
      { text: '架构', link: '/concepts/architecture' },      // 第二个
      { text: 'MCP 协议', link: '/concepts/mcp-protocol' },  // 第三个
      { text: '路由', link: '/concepts/routing' }            // 第四个
    ]
  }
]
```

### 手动排序

在导航配置中明确指定顺序：

```typescript
const navigationOrder = [
  'introduction',
  'quickstart', 
  'development',
  'configuration',
  'api-reference'
]

// 根据顺序数组生成导航
const generateNavigation = (order: string[]) => {
  return order.map(item => ({
    text: getTitle(item),
    link: `/${item}`
  }))
}
```

## 搜索优化

### 搜索配置

配置搜索功能：

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
                resetButtonTitle: '清除查询条件',
                footer: {
                  selectText: '选择',
                  navigateText: '切换'
                }
              }
            }
          }
        }
      }
    }
  }
})
```

### 搜索关键词

在页面 frontmatter 中添加搜索关键词：

```yaml
---
title: 'Docker 部署'
description: '使用 Docker 部署 MCPHub'
head:
  - - meta
    - name: keywords
      content: docker, 部署, 容器, 生产环境
---
```

## 面包屑导航

VitePress 自动生成面包屑导航，基于文件结构：

```
docs/
├── index.md                 # 首页
├── quickstart.md           # 快速开始
├── configuration/
│   ├── index.md           # 配置 > 概览  
│   ├── environment-variables.md  # 配置 > 环境变量
│   └── mcp-settings.md    # 配置 > MCP 设置
```

显示效果：`首页 › 配置 › 环境变量`

## 导航最佳实践

### 1. 逻辑分组

按功能和用户需求逻辑分组：

```typescript
sidebar: [
  {
    text: '新手指南',
    items: [
      { text: '介绍', link: '/introduction' },
      { text: '快速开始', link: '/quickstart' },
      { text: '第一个服务器', link: '/first-server' }
    ]
  },
  {
    text: '进阶配置',
    items: [
      { text: '高级路由', link: '/advanced-routing' },
      { text: '扩容配置', link: '/scaling' },
      { text: '监控设置', link: '/monitoring' }
    ]
  },
  {
    text: '参考文档',
    items: [
      { text: 'API 参考', link: '/api-reference' },
      { text: 'CLI 参考', link: '/cli-reference' },
      { text: '故障排除', link: '/troubleshooting' }
    ]
  }
]
```

### 2. 渐进式学习路径

设计符合学习曲线的导航结构：

1. **入门** → 快速开始、基础概念
2. **实践** → 配置、部署、集成  
3. **进阶** → 优化、监控、故障排除
4. **参考** → API 文档、CLI 手册

### 3. 移动端友好

确保导航在移动设备上的可用性：

```typescript
sidebar: [
  {
    text: '快速开始',
    collapsed: false,  // 默认展开重要内容
    items: [
      { text: '介绍', link: '/introduction' },
      { text: '快速开始', link: '/quickstart' }
    ]
  },
  {
    text: '详细文档',
    collapsed: true,   // 默认折叠详细内容
    items: [
      { text: '高级配置', link: '/advanced' }
    ]
  }
]
```

### 4. 国际化支持

为多语言文档配置导航：

```typescript
export default defineConfig({
  locales: {
    root: {
      label: '简体中文',
      lang: 'zh'
    },
    en: {
      label: 'English',
      lang: 'en'
    }
  },
  themeConfig: {
    nav: [
      { text: '首页', link: '/' },
      { text: '快速开始', link: '/quickstart' }
    ]
  }
})
```

### 5. 性能优化

- 合理设置导航深度（建议不超过 3 层）
- 避免过多的外部链接
- 定期清理无效的导航项
- 使用懒加载减少初始加载时间 