import { IGroup, IGroupServerConfig } from '../types/index.js';
import { GroupRepository, getGroupRepository } from '../db/repositories/GroupRepository.js';
import { McpServerRepository, getMcpServerRepository } from '../db/repositories/McpServerRepository.js';
import { notifyToolChanged } from './mcpService.js';
import { isDatabaseConnected } from '../db/connection.js';
import { getSystemConfigService } from './systemConfigService.js';

class GroupService {
  private groupRepository: GroupRepository;
  private mcpServerRepository: McpServerRepository;

  constructor() {
    this.groupRepository = getGroupRepository();
    this.mcpServerRepository = getMcpServerRepository();
  }

  // Get all groups
  async getAllGroups(): Promise<IGroup[]> {
    if (!isDatabaseConnected()) return [];
    const groups = await this.groupRepository.findAll();
    return groups.map(group => ({
      id: group.id,
      name: group.name,
      description: group.description,
      servers: group.servers || [],
      owner: group.owner,
    }));
  }

  // Get group by ID or name
  async getGroupByIdOrName(key: string): Promise<IGroup | undefined> {
    if (!isDatabaseConnected()) return undefined;
    const systemConfigService = getSystemConfigService();
    const systemConfig = await systemConfigService.getSystemConfig();
    const routingConfig = systemConfig?.routing || {
      enableGlobalRoute: true,
      enableGroupNameRoute: true,
    };

    let group;
    if (routingConfig.enableGroupNameRoute) {
      group = await this.groupRepository.findByIdOrName(key);
    } else {
      group = await this.groupRepository.findById(key);
    }

    if (!group) return undefined;

    return {
      id: group.id,
      name: group.name,
      description: group.description,
      servers: group.servers || [],
      owner: group.owner,
    };
  }

  // Create a new group
  async createGroup(
    name: string,
    description?: string,
    servers: IGroupServerConfig[] = [],
    owner?: string,
  ): Promise<IGroup | null> {
    try {
      if (!isDatabaseConnected()) return null;
      // Check if group with same name already exists
      const existingGroup = await this.groupRepository.findByName(name);
      if (existingGroup) {
        return null;
      }

      // Filter out non-existent servers
      const validServers: IGroupServerConfig[] = [];
      for (const serverConfig of servers) {
        const serverExists = await this.mcpServerRepository.exists(serverConfig.name);
        if (serverExists) {
          validServers.push(serverConfig);
        }
      }

      const group = await this.groupRepository.create({
        name,
        description,
        servers: validServers,
        owner: owner || 'admin',
      });

      return {
        id: group.id,
        name: group.name,
        description: group.description,
        servers: group.servers || [],
        owner: group.owner,
      };
    } catch (error) {
      console.error('Failed to create group:', error);
      return null;
    }
  }

  // Update an existing group
  async updateGroup(id: string, data: Partial<IGroup>): Promise<IGroup | null> {
    try {
      if (!isDatabaseConnected()) return null;
      // Check if group exists
      const existingGroup = await this.groupRepository.findById(id);
      if (!existingGroup) {
        return null;
      }

      // Check for name uniqueness if name is being updated
      if (data.name && await this.groupRepository.existsByName(data.name, id)) {
        return null;
      }

      // If servers array is provided, validate server existence
      if (data.servers) {
        const validServers: IGroupServerConfig[] = [];
        for (const serverConfig of data.servers) {
          const serverExists = await this.mcpServerRepository.exists(serverConfig.name);
          if (serverExists) {
            validServers.push(serverConfig);
          }
        }
        data.servers = validServers;
      }

      const updatedGroup = await this.groupRepository.update(id, {
        name: data.name,
        description: data.description,
        servers: data.servers,
        owner: data.owner,
      });
      if (!updatedGroup) {
        return null;
      }

      notifyToolChanged();
      return {
        id: updatedGroup.id,
        name: updatedGroup.name,
        description: updatedGroup.description,
        servers: updatedGroup.servers || [],
        owner: updatedGroup.owner,
      };
    } catch (error) {
      console.error(`Failed to update group ${id}:`, error);
      return null;
    }
  }

  // Update servers in a group (batch update)
  async updateGroupServers(
    groupId: string,
    servers: IGroupServerConfig[],
  ): Promise<IGroup | null> {
    try {
      if (!isDatabaseConnected()) return null;
      // Check if group exists
      const existingGroup = await this.groupRepository.findById(groupId);
      if (!existingGroup) {
        return null;
      }

      // Filter out non-existent servers
      const validServers: IGroupServerConfig[] = [];
      for (const serverConfig of servers) {
        const serverExists = await this.mcpServerRepository.exists(serverConfig.name);
        if (serverExists) {
          validServers.push(serverConfig);
        }
      }

      const updatedGroup = await this.groupRepository.updateServers(groupId, validServers);
      if (!updatedGroup) {
        return null;
      }

      notifyToolChanged();
      return {
        id: updatedGroup.id,
        name: updatedGroup.name,
        description: updatedGroup.description,
        servers: updatedGroup.servers || [],
        owner: updatedGroup.owner,
      };
    } catch (error) {
      console.error(`Failed to update servers for group ${groupId}:`, error);
      return null;
    }
  }

  // Delete a group
  async deleteGroup(id: string): Promise<boolean> {
    try {
      if (!isDatabaseConnected()) return false;
      return await this.groupRepository.delete(id);
    } catch (error) {
      console.error(`Failed to delete group ${id}:`, error);
      return false;
    }
  }

  // Add server to group
  async addServerToGroup(groupId: string, serverName: string): Promise<IGroup | null> {
    try {
      if (!isDatabaseConnected()) return null;
      const group = await this.groupRepository.findById(groupId);
      if (!group) {
        return null;
      }

      // Verify server exists
      const serverExists = await this.mcpServerRepository.exists(serverName);
      if (!serverExists) {
        return null;
      }

      const currentServers = group.servers || [];

      // Add server to group if not already in it
      if (!currentServers.some((server) => server.name === serverName)) {
        const newServers: IGroupServerConfig[] = [...currentServers, { name: serverName, tools: 'all' }];
        const updatedGroup = await this.groupRepository.updateServers(groupId, newServers);
        
        if (updatedGroup) {
          notifyToolChanged();
          return {
            id: updatedGroup.id,
            name: updatedGroup.name,
            description: updatedGroup.description,
            servers: updatedGroup.servers || [],
            owner: updatedGroup.owner,
          };
        }
      }

      return {
        id: group.id,
        name: group.name,
        description: group.description,
        servers: group.servers || [],
        owner: group.owner,
      };
    } catch (error) {
      console.error(`Failed to add server ${serverName} to group ${groupId}:`, error);
      return null;
    }
  }

  // Remove server from group
  async removeServerFromGroup(groupId: string, serverName: string): Promise<IGroup | null> {
    try {
      if (!isDatabaseConnected()) return null;
      const group = await this.groupRepository.findById(groupId);
      if (!group) {
        return null;
      }

      const currentServers = group.servers || [];
      const newServers = currentServers.filter((server) => server.name !== serverName);
      
      const updatedGroup = await this.groupRepository.updateServers(groupId, newServers);
      if (!updatedGroup) {
        return null;
      }

      return {
        id: updatedGroup.id,
        name: updatedGroup.name,
        description: updatedGroup.description,
        servers: updatedGroup.servers || [],
        owner: updatedGroup.owner,
      };
    } catch (error) {
      console.error(`Failed to remove server ${serverName} from group ${groupId}:`, error);
      return null;
    }
  }

  // Get all servers in a group
  async getServersInGroup(groupId: string): Promise<string[]> {
    const group = await this.getGroupByIdOrName(groupId);
    if (!group) return [];
    return group.servers.map((server) => server.name);
  }

  // Get server configuration from group (including tool selection)
  async getServerConfigInGroup(
    groupId: string,
    serverName: string,
  ): Promise<IGroupServerConfig | undefined> {
    const group = await this.getGroupByIdOrName(groupId);
    if (!group) return undefined;
    return group.servers.find((server) => server.name === serverName);
  }

  // Get all server configurations in a group
  async getServerConfigsInGroup(groupId: string): Promise<IGroupServerConfig[]> {
    const group = await this.getGroupByIdOrName(groupId);
    if (!group) return [];
    return group.servers;
  }

  // Update tools selection for a specific server in a group
  async updateServerToolsInGroup(
    groupId: string,
    serverName: string,
    tools: string[] | 'all',
  ): Promise<IGroup | null> {
    try {
      if (!isDatabaseConnected()) return null;
      const group = await this.groupRepository.findById(groupId);
      if (!group) {
        return null;
      }

      // Verify server exists
      const serverExists = await this.mcpServerRepository.exists(serverName);
      if (!serverExists) {
        return null;
      }

      const currentServers = group.servers || [];
      const serverIndex = currentServers.findIndex((server) => server.name === serverName);
      if (serverIndex === -1) {
        return null; // Server not in group
      }

      // Update the tools configuration for the server
      const newServers = [...currentServers];
      newServers[serverIndex] = { ...newServers[serverIndex], tools };
      
      const updatedGroup = await this.groupRepository.updateServers(groupId, newServers);
      if (!updatedGroup) {
        return null;
      }

      notifyToolChanged();
      return {
        id: updatedGroup.id,
        name: updatedGroup.name,
        description: updatedGroup.description,
        servers: updatedGroup.servers || [],
        owner: updatedGroup.owner,
      };
    } catch (error) {
      console.error(`Failed to update tools for server ${serverName} in group ${groupId}:`, error);
      return null;
    }
  }
}

// 延迟创建单例服务
let groupServiceInstance: GroupService | null = null;

export function getGroupService(): GroupService {
  if (!groupServiceInstance) {
    groupServiceInstance = new GroupService();
  }
  return groupServiceInstance;
}

// 导出所有方法（调用时再获取服务实例）
export const getAllGroups = (...args: Parameters<GroupService['getAllGroups']>) => 
  getGroupService().getAllGroups(...args);

export const getGroupByIdOrName = (...args: Parameters<GroupService['getGroupByIdOrName']>) => 
  getGroupService().getGroupByIdOrName(...args);

export const createGroup = (...args: Parameters<GroupService['createGroup']>) => 
  getGroupService().createGroup(...args);

export const updateGroup = (...args: Parameters<GroupService['updateGroup']>) => 
  getGroupService().updateGroup(...args);

export const updateGroupServers = (...args: Parameters<GroupService['updateGroupServers']>) => 
  getGroupService().updateGroupServers(...args);

export const deleteGroup = (...args: Parameters<GroupService['deleteGroup']>) => 
  getGroupService().deleteGroup(...args);

export const addServerToGroup = (...args: Parameters<GroupService['addServerToGroup']>) => 
  getGroupService().addServerToGroup(...args);

export const removeServerFromGroup = (...args: Parameters<GroupService['removeServerFromGroup']>) => 
  getGroupService().removeServerFromGroup(...args);

export const getServersInGroup = (...args: Parameters<GroupService['getServersInGroup']>) => 
  getGroupService().getServersInGroup(...args);

export const getServerConfigInGroup = (...args: Parameters<GroupService['getServerConfigInGroup']>) => 
  getGroupService().getServerConfigInGroup(...args);

export const getServerConfigsInGroup = (...args: Parameters<GroupService['getServerConfigsInGroup']>) => 
  getGroupService().getServerConfigsInGroup(...args);

export const updateServerToolsInGroup = (...args: Parameters<GroupService['updateServerToolsInGroup']>) => 
  getGroupService().updateServerToolsInGroup(...args);