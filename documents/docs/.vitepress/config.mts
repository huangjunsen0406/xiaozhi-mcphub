import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitepress'
// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "XIAOZHI-MCPHUB",
  description: "xiaozhi-mcphub 是一个智能MCP服务器管理平台，提供智能路由、服务器管理、组管理等功能。",
  base: '/xiaozhi-mcphub/',
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: '主页', link: '/' },
      { text: '快速开始', link: '/quickstart' },
      {
        text: '指南',
        items: [
          { text: '开发指南', link: '/development' },
          { text: '开发入门', link: '/development/getting-started' }
        ]
      },
      {
        text: '配置',
        items: [
          { text: 'Docker 设置', link: '/configuration/docker-setup' },
          { text: '环境变量', link: '/configuration/environment-variables' },
          { text: 'MCP 设置', link: '/configuration/mcp-settings' },
          { text: 'Nginx 配置', link: '/configuration/nginx' }
        ]
      },
      {
        text: 'API 参考',
        items: [
          { text: 'API 介绍', link: '/api-reference/introduction' },
          { text: '创建接口', link: '/api-reference/endpoint/create' },
          { text: '查询接口', link: '/api-reference/endpoint/get' },
          { text: '删除接口', link: '/api-reference/endpoint/delete' },
          { text: 'Webhook', link: '/api-reference/endpoint/webhook' }
        ]
      },
      {
        text: '功能特性',
        items: [
          { text: '认证功能', link: '/features/authentication' },
          { text: '智能路由', link: '/features/smart-routing' },
          { text: '服务器管理', link: '/features/server-management' },
          { text: '组管理', link: '/features/group-management' },
          { text: '监控功能', link: '/features/monitoring' }
        ]
      },
      {
        text: '基础功能',
        items: [
          { text: '代码规范', link: '/essentials/code' },
          { text: 'Markdown 支持', link: '/essentials/markdown' },
          { text: '导航配置', link: '/essentials/navigation' },
          { text: '图片处理', link: '/essentials/images' },
          { text: '设置配置', link: '/essentials/settings' },
          { text: '可复用片段', link: '/essentials/reusable-snippets' }
        ]
      }
    ],

    sidebar: {
      '/development/': [],
      // 配置页面不显示侧边栏
      '/configuration/': [],
      // API 参考页面不显示侧边栏  
      '/api-reference/': [],
      // 功能特性页面不显示侧边栏
      '/features/': [],
      // 基础功能页面不显示侧边栏
      '/essentials/': [],
      // 快速开始页面不显示侧边栏
      '/quickstart': []
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/huangjunsen0406/xiaozhi-mcphub' }
    ]
  },
  vite: {
    plugins: [
        tailwindcss()
    ]
  }
})
