import { DataSource } from 'typeorm';
import { User, McpServer } from '../entities/index.js';

/**
 * Default MCP servers configuration
 */
const defaultMcpServers = [
  {
    name: 'amap',
    command: 'npx',
    args: ['-y', '@amap/amap-maps-mcp-server'],
    env: {
      AMAP_MAPS_API_KEY: 'your-api-key'
    },
    enabled: true
  },
  {
    name: 'playwright',
    command: 'npx',
    args: ['@playwright/mcp@latest', '--headless'],
    enabled: true
  },
  {
    name: 'fetch',
    command: 'uvx',
    args: ['mcp-server-fetch'],
    enabled: true
  },
  {
    name: 'slack',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    env: {
      SLACK_BOT_TOKEN: 'your-bot-token',
      SLACK_TEAM_ID: 'your-team-id'
    },
    enabled: true
  }
];

/**
 * Default users configuration
 */
const defaultUsers = [
  {
    username: 'admin',
    password: '$2b$10$P/FoYsdJZROBNgkxeyQjlOcEB2x369M/rhkWU0du9fedzj1YoOSKy', // Pre-hashed password for 'admin123'
    isAdmin: true
  }
];

/**
 * Initialize default data in the database
 */
export async function initializeDefaultData(dataSource: DataSource): Promise<void> {
  try {
    console.log('Initializing default database data...');

    const userRepository = dataSource.getRepository(User);
    const mcpServerRepository = dataSource.getRepository(McpServer);

    // Check if data already exists
    const existingUsers = await userRepository.count();
    const existingServers = await mcpServerRepository.count();

    // Initialize users if none exist
    if (existingUsers === 0) {
      console.log('Creating default users...');
      for (const userData of defaultUsers) {
        const user = userRepository.create(userData);
        await userRepository.save(user);
      }
      console.log(`Created ${defaultUsers.length} default users`);
    } else {
      console.log(`Users already exist (${existingUsers} found), skipping user initialization`);
    }

    // Initialize MCP servers if none exist
    if (existingServers === 0) {
      console.log('Creating default MCP servers...');
      for (const serverData of defaultMcpServers) {
        const server = mcpServerRepository.create(serverData);
        await mcpServerRepository.save(server);
      }
      console.log(`Created ${defaultMcpServers.length} default MCP servers`);
    } else {
      console.log(`MCP servers already exist (${existingServers} found), skipping server initialization`);
    }

    // Initialize system configuration
    const { getSystemConfigService } = await import('../../services/systemConfigService.js');
    const systemConfigService = getSystemConfigService();
    await systemConfigService.initialize();
    console.log('System configuration initialized');

    console.log('Default data initialization completed');
  } catch (error) {
    console.error('Error initializing default data:', error);
    throw error;
  }
}

/**
 * Check if default data needs to be initialized
 */
export async function needsInitialization(dataSource: DataSource): Promise<boolean> {
  try {
    const userRepository = dataSource.getRepository(User);
    const mcpServerRepository = dataSource.getRepository(McpServer);

    const userCount = await userRepository.count();
    const serverCount = await mcpServerRepository.count();

    return userCount === 0 || serverCount === 0;
  } catch (error) {
    console.error('Error checking initialization status:', error);
    // If we can't check, assume we need initialization
    return true;
  }
}

/**
 * Get default admin user credentials (for documentation purposes)
 */
export function getDefaultAdminCredentials() {
  return {
    username: 'admin',
    password: 'admin123', // The actual password that corresponds to the hash
    note: 'This is the default admin password. Please change it after first login.'
  };
}

export default initializeDefaultData;