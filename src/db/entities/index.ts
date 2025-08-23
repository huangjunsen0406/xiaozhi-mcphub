import { VectorEmbedding } from './VectorEmbedding.js';
import { User } from './User.js';
import { McpServer } from './McpServer.js';
import { Group } from './Group.js';
import { XiaozhiEndpoint } from './XiaozhiEndpoint.js';
import { MarketServer } from './MarketServer.js';
import { CloudServer } from './CloudServer.js';
import { SystemConfig } from './SystemConfig.js';
import { XiaozhiConfig } from './XiaozhiConfig.js';

// Export all entities
export default [
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

// Export individual entities for direct use
export {
  VectorEmbedding,
  User,
  McpServer,
  Group,
  XiaozhiEndpoint,
  MarketServer,
  CloudServer,
  SystemConfig,
  XiaozhiConfig,
};
