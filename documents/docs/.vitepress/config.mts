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
        text: '开发指南',
        link: '/development/getting-started'
      },
      {
        text: '配置',
        items: [
          { text: 'Docker 设置', link: '/configuration/docker-setup' },
          { text: '环境变量', link: '/configuration/environment-variables' },
          { text: 'MCP 设置', link: '/configuration/mcp-settings' },
          { text: 'Nginx 配置', link: '/configuration/nginx' },
          { text: '小智接入 配置', link: '/configuration/xiaozhi' }
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
      }
    ],

    sidebar: {
      '/development/': [],
      // 配置页面不显示侧边栏
      '/configuration/': [],
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
