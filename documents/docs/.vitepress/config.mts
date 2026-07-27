import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'xiaozhi-mcphub',
  description:
    '为小智 AI 优化的 MCP 桥接与控制台：多端点、多账户隔离、智能路由。v1.1.0 / 上游基线 MCPHub v1.0.25。',
  base: '/xiaozhi-mcphub/',
  ignoreDeadLinks: true,
  themeConfig: {
    nav: [
      { text: '主页', link: '/' },
      { text: '快速开始', link: '/quickstart' },
      {
        text: '配置',
        items: [
          { text: 'Docker 部署', link: '/configuration/docker-setup' },
          { text: '环境变量', link: '/configuration/environment-variables' },
          { text: 'MCP 配置', link: '/configuration/mcp-settings' },
          { text: 'Nginx', link: '/configuration/nginx' },
          { text: '小智接入', link: '/configuration/xiaozhi' },
        ],
      },
      {
        text: '功能',
        items: [
          { text: '认证与多账户', link: '/features/authentication' },
          { text: '服务器管理', link: '/features/server-management' },
          { text: '分组管理', link: '/features/group-management' },
          { text: '智能路由', link: '/features/smart-routing' },
          { text: '监控', link: '/features/monitoring' },
          { text: '市场', link: '/features/mcp-marketplace' },
        ],
      },
      { text: '开发', link: '/development/getting-started' },
      {
        text: 'v1.1.0',
        items: [
          {
            text: 'Release 说明',
            link: 'https://github.com/huangjunsen0406/xiaozhi-mcphub/releases/tag/v1.1.0',
          },
          {
            text: 'GitHub',
            link: 'https://github.com/huangjunsen0406/xiaozhi-mcphub',
          },
        ],
      },
    ],
    sidebar: {
      '/configuration/': [
        {
          text: '配置',
          items: [
            { text: 'Docker 部署', link: '/configuration/docker-setup' },
            { text: '环境变量', link: '/configuration/environment-variables' },
            { text: 'MCP 配置', link: '/configuration/mcp-settings' },
            { text: 'Nginx', link: '/configuration/nginx' },
            { text: '小智接入', link: '/configuration/xiaozhi' },
          ],
        },
      ],
      '/features/': [
        {
          text: '功能',
          items: [
            { text: '认证与多账户', link: '/features/authentication' },
            { text: '服务器管理', link: '/features/server-management' },
            { text: '分组管理', link: '/features/group-management' },
            { text: '智能路由', link: '/features/smart-routing' },
            { text: '监控', link: '/features/monitoring' },
            { text: '市场', link: '/features/mcp-marketplace' },
          ],
        },
      ],
      '/development/': [
        {
          text: '开发',
          items: [
            { text: '环境搭建', link: '/development/getting-started' },
            { text: '开发说明', link: '/development' },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/huangjunsen0406/xiaozhi-mcphub' },
    ],
    footer: {
      message: 'xiaozhi-mcphub 1.1.0 · 上游基线 MCPHub v1.0.25',
      copyright: 'Apache-2.0',
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
})
