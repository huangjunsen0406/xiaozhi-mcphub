// Export individual entities for direct use
export { VectorEmbedding } from './VectorEmbedding.js';
export { User } from './User.js';
export { McpServer } from './McpServer.js';
export { Group } from './Group.js';
export { XiaozhiEndpoint } from './XiaozhiEndpoint.js';
export { SystemConfig } from './SystemConfig.js';
export { XiaozhiConfig } from './XiaozhiConfig.js';

// Export unified entities array
export const entities = [
  VectorEmbedding,
  User,
  McpServer,
  Group,
  XiaozhiEndpoint,
  SystemConfig,
  XiaozhiConfig,
];

// Import the entities for the array
import { VectorEmbedding } from './VectorEmbedding.js';
import { User } from './User.js';
import { McpServer } from './McpServer.js';
import { Group } from './Group.js';
import { XiaozhiEndpoint } from './XiaozhiEndpoint.js';
import { SystemConfig } from './SystemConfig.js';
import { XiaozhiConfig } from './XiaozhiConfig.js';

// Default export for backward compatibility
export default entities;
