# xiaozhi-mcphub: Intelligent MCP Tool Bridge for Xiaozhi AI Platform

[English] | [中文版](README.zh.md)

**xiaozhi-mcphub** is an intelligent MCP (Model Context Protocol) tool bridge that seamlessly connects Xiaozhi AI platform with powerful tool ecosystems. Built upon the excellent [MCPHub](https://github.com/samanhappy/mcphub) foundation, xiaozhi-mcphub adds enhanced Xiaozhi platform integration and intelligent tool synchronization.

![Dashboard Preview](assets/dashboard.png)

## 🚀 Key Features

### 🤖 **Xiaozhi AI Platform Integration** *(New!)*
- **Native Xiaozhi Connection**: WebSocket connection with automatic tool synchronization
- **Real-time Tool Updates**: Intelligent reconnection when tool states change
- **Protocol Bridge**: Seamless MCP protocol translation for Xiaozhi platform
- **Tool Discovery**: Smart routing with vector-based tool search

### 🛠️ **Enhanced MCP Management** *(Based on MCPHub)*
- **Broadened MCP Server Support**: Seamlessly integrate any MCP server with minimal configuration
- **Centralized Dashboard**: Monitor real-time status and performance metrics from one sleek web UI
- **Flexible Protocol Handling**: Full compatibility with stdio, SSE, and HTTP MCP protocols
- **Hot-Swappable Configuration**: Add, remove, or update MCP servers on the fly — no downtime required
- **Group-Based Access Control**: Organize servers into customizable groups for streamlined permissions management
- **Secure Authentication**: Built-in user management with role-based access powered by JWT and bcrypt
- **Docker-Ready**: Deploy instantly with our containerized setup

## 🎯 What Makes xiaozhi-mcphub Special

Unlike the original MCPHub which focuses on server management, **xiaozhi-mcphub** is specifically optimized for Xiaozhi AI platform integration:

✅ **Automatic Tool Synchronization** - Tools are automatically synced to Xiaozhi when enabled/disabled  
✅ **Intelligent Reconnection** - Smart reconnection logic ensures Xiaozhi always has the latest tool state  
✅ **Xiaozhi-First Design** - WebSocket-based architecture optimized for Xiaozhi platform communication  
✅ **Enhanced Logging** - Detailed logs for Xiaozhi platform interactions and tool usage  

## 🔧 Quick Start

### Xiaozhi Integration Setup

1. **Configure Xiaozhi Connection**:
```json
{
  "xiaozhi": {
    "enabled": true,
    "webSocketUrl": "wss://api.xiaozhi.me/mcp/?token=your-jwt-token",
    "reconnect": {
      "maxAttempts": 10,
      "initialDelay": 2000,
      "maxDelay": 60000,
      "backoffMultiplier": 2
    }
  }
}
```

2. **Add to mcp_settings.json**:
```json
{
  "mcpServers": {
    "amap": {
      "command": "npx",
      "args": ["-y", "@amap/amap-maps-mcp-server"],
      "env": {
        "AMAP_MAPS_API_KEY": "your-api-key"
      }
    },
    "playwright": {
      "command": "npx", 
      "args": ["@playwright/mcp@latest", "--headless"]
    },
    "fetch": {
      "command": "uvx",
      "args": ["mcp-server-fetch"]
    },
    "slack": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-slack"],
      "env": {
        "SLACK_BOT_TOKEN": "your-bot-token",
        "SLACK_TEAM_ID": "your-team-id"
      }
    }
  },
  "xiaozhi": {
    "enabled": true,
    "webSocketUrl": "wss://api.xiaozhi.me/mcp/?token=your-jwt-token"
  }
}
```

### Docker Deployment

```bash
# With custom configuration
docker run -p 3000:3000 \
  -v ./mcp_settings.json:/app/mcp_settings.json \
  -v ./data:/app/data \
  huangjunsen0406/xiaozhi-mcphub

# With default settings
docker run -p 3000:3000 huangjunsen0406/xiaozhi-mcphub
```

### Access the Dashboard

Open `http://localhost:3000` and log in with default credentials: `admin` / `admin123`

**New Xiaozhi Platform Features**:
- 🔌 Xiaozhi connection status and management
- ⚡ Real-time tool synchronization monitoring  
- 🔄 Automatic reconnection controls
- 📊 Xiaozhi platform usage statistics

## 🌐 API Endpoints

### Traditional MCP Endpoints
```
http://localhost:3000/mcp          # Unified endpoint for all servers
http://localhost:3000/mcp/$smart   # Smart routing with vector search  
http://localhost:3000/mcp/{group}  # Group-specific endpoints
http://localhost:3000/mcp/{server} # Server-specific endpoints
```

### Xiaozhi Platform Management *(New!)*
```
GET    /api/xiaozhi/status     # Get connection status
GET    /api/xiaozhi/config     # Get configuration (token masked)
PUT    /api/xiaozhi/config     # Update configuration
POST   /api/xiaozhi/restart    # Restart client connection
POST   /api/xiaozhi/start      # Start client
POST   /api/xiaozhi/stop       # Stop client
```

## 🧑‍💻 Local Development

```bash
git clone https://github.com/huangjunsen0406/xiaozhi-mcphub.git
cd xiaozhi-mcphub
pnpm install
pnpm dev
```

This starts both frontend and backend in development mode with hot-reloading.

## 📊 Xiaozhi Tool Integration

xiaozhi-mcphub successfully exposes powerful tools to Xiaozhi AI platform:

### 🎭 Web Automation (Playwright)
- Browser control, page interaction, content capture
- Screenshot and PDF generation  
- Tab management and automation testing

### 🌐 Network Tools (Fetch)
- Web content fetching with markdown conversion

### 💬 Communication (Slack)  
- Channel management, messaging, user interaction
- Thread replies and reactions

### 🗺️ Location Services (Amap)
- Geocoding, search, routing, weather
- Point-of-interest discovery

## 📄 Attribution

This project is based on [MCPHub](https://github.com/samanhappy/mcphub) by samanhappy and contributors, licensed under Apache License 2.0.

**Major enhancements in xiaozhi-mcphub:**
- ✨ Xiaozhi AI platform integration  
- 🔄 Enhanced tool synchronization mechanism
- 🔗 Improved reconnection logic for Xiaozhi clients
- 📡 Extended API endpoints for Xiaozhi platform management

## 📜 License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 🔗 Links

- [Original MCPHub Project](https://github.com/samanhappy/mcphub)
- [Xiaozhi AI Platform](https://xiaozhi.me)
- [Model Context Protocol](https://modelcontextprotocol.io)
