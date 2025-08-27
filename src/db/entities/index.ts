// Export individual entities for direct use
export { VectorEmbedding } from './VectorEmbedding.js';
export { User } from './User.js';
export { McpServer } from './McpServer.js';
export { Group } from './Group.js';
export { XiaozhiEndpoint } from './XiaozhiEndpoint.js';
export { MarketServer } from './MarketServer.js';
export { CloudServer } from './CloudServer.js';
export { SystemConfig } from './SystemConfig.js';
export { XiaozhiConfig } from './XiaozhiConfig.js';

// Export unified entities array
export const entities = [
  VectorEmbedding,
  User,
  McpServer,
  Group,
  XiaozhiEndpoint,
  MarketServer,
  CloudServer,
  SystemConfig,
  XiaozhiConfig,
];

// Import the entities for the array
import { VectorEmbedding } from './VectorEmbedding.js';
import { User } from './User.js';
import { McpServer } from './McpServer.js';
import { Group } from './Group.js';
import { XiaozhiEndpoint } from './XiaozhiEndpoint.js';
import { MarketServer } from './MarketServer.js';
import { CloudServer } from './CloudServer.js';
import { SystemConfig } from './SystemConfig.js';
import { XiaozhiConfig } from './XiaozhiConfig.js';

// Default export for backward compatibility
export default entities;
