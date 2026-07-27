import { randomUUID } from 'node:crypto';
import { IGroup, IGroupServerConfig } from '../types/index.js';
import { notifyToolChanged } from './mcpService.js';
import { getDataService } from './services.js';
import { UserContextService } from './userContextService.js';
import { getGroupDao, getServerDao, getSystemConfigDao } from '../dao/index.js';

// Helper function to normalize group servers configuration
export const normalizeGroupServers = (
  servers: string[] | IGroupServerConfig[],
): IGroupServerConfig[] => {
  return servers.map((server) => {
    if (typeof server === 'string') {
      // Backward compatibility: string format means all tools
      return { name: server, tools: 'all', prompts: 'all', resources: 'all' };
    }
    // New format: ensure capability selections default to 'all' if not specified
    const alias = server.alias?.trim();
    return {
      name: server.name,
      ...(alias ? { alias } : {}),
      tools: server.tools || 'all',
      prompts: server.prompts || 'all',
      resources: server.resources || 'all',
    };
  });
};

export const getGroupServerExposedName = (serverConfig: IGroupServerConfig): string => {
  return serverConfig.alias?.trim() || serverConfig.name;
};

const hasDuplicateExposedServerName = (servers: IGroupServerConfig[]): boolean => {
  const seen = new Set<string>();
  for (const server of servers) {
    const exposedName = getGroupServerExposedName(server);
    if (seen.has(exposedName)) {
      return true;
    }
    seen.add(exposedName);
  }
  return false;
};

const getCurrentUser = () => UserContextService.getInstance().getCurrentUser();

/**
 * Whether the current user may see a group.
 * - admin: all groups
 * - non-admin: only groups they own
 * - legacy groups without owner: admin-only (treated as not visible to regular users)
 */
export const canAccessGroup = (group: IGroup, user = getCurrentUser()): boolean => {
  if (!user) {
    return false;
  }
  if (user.isAdmin) {
    return true;
  }
  return Boolean(group.owner && group.owner === user.username);
};

const canMutateGroup = (group: IGroup): boolean => canAccessGroup(group);

/**
 * Servers a non-admin is allowed to attach to a group: own servers + public servers.
 * Admins can attach any server.
 */
const getAttachableServerNames = async (): Promise<Set<string> | null> => {
  const currentUser = getCurrentUser();
  if (!currentUser || currentUser.isAdmin) {
    return null; // null means "no restriction"
  }

  const serverDao = getServerDao();
  const allServers = await serverDao.findAll();
  const dataService = getDataService();
  const visible = dataService.filterData
    ? dataService.filterData(allServers, currentUser)
    : allServers.filter(
        (server) => server.owner === currentUser.username || server.visibility === 'public',
      );
  return new Set(visible.map((server) => server.name));
};

const filterAttachableServers = async (
  servers: IGroupServerConfig[],
): Promise<IGroupServerConfig[]> => {
  const allowed = await getAttachableServerNames();
  if (!allowed) {
    return servers;
  }
  return servers.filter((server) => allowed.has(server.name));
};

// Get all groups
export const getAllGroups = async (): Promise<IGroup[]> => {
  const groupDao = getGroupDao();
  const groups = await groupDao.findAll();
  const dataService = getDataService();
  // Prefer DataService filter when available; also drop owner-less legacy groups for non-admins.
  const filtered = dataService.filterData ? dataService.filterData(groups) : groups;
  const currentUser = getCurrentUser();
  if (!currentUser || currentUser.isAdmin) {
    return filtered;
  }
  return filtered.filter((group) => canAccessGroup(group, currentUser));
};

// Get group by ID or name (respects current-user visibility)
export const getGroupByIdOrName = async (key: string): Promise<IGroup | undefined> => {
  const systemConfigDao = getSystemConfigDao();

  const systemConfig = await systemConfigDao.get();
  const routingConfig = {
    enableGlobalRoute: systemConfig?.routing?.enableGlobalRoute ?? true,
    enableGroupNameRoute: systemConfig?.routing?.enableGroupNameRoute ?? true,
  };

  const groups = await getAllGroups();
  return (
    groups.find(
      (group) => group.id === key || (group.name === key && routingConfig.enableGroupNameRoute),
    ) || undefined
  );
};

/**
 * Load a group by id/name without applying user filter.
 * Used by runtime MCP paths that already authorized access via bearer key scope.
 */
export const getGroupByIdOrNameUnfiltered = async (key: string): Promise<IGroup | undefined> => {
  const systemConfigDao = getSystemConfigDao();
  const systemConfig = await systemConfigDao.get();
  const enableGroupNameRoute = systemConfig?.routing?.enableGroupNameRoute ?? true;

  const groupDao = getGroupDao();
  const byId = await groupDao.findById(key);
  if (byId) {
    return byId;
  }
  if (!enableGroupNameRoute) {
    return undefined;
  }
  return (await groupDao.findByName(key)) || undefined;
};

// Create a new group
export const createGroup = async (
  name: string,
  description?: string,
  servers: string[] | IGroupServerConfig[] = [],
  owner?: string,
): Promise<IGroup | null> => {
  try {
    const groupDao = getGroupDao();
    const serverDao = getServerDao();

    const currentUser = getCurrentUser();
    const resolvedOwner = owner || currentUser?.username || 'admin';

    // Uniqueness is per-owner: different users may share the same group name.
    const existingGroup = await groupDao.findByOwnerAndName(resolvedOwner, name);
    if (existingGroup) {
      return null;
    }

    // Normalize servers, keep only existing + attachable servers for current user
    const normalizedServers = normalizeGroupServers(servers);
    const allServers = await serverDao.findAll();
    // Attachable set is already owner-filtered at controller/service layer;
    // still allow name match within attachable servers (own ∪ public).
    const serverNames = new Set(allServers.map((s) => s.name));
    const existingServers: IGroupServerConfig[] = normalizedServers.filter((serverConfig) =>
      serverNames.has(serverConfig.name),
    );
    const validServers = await filterAttachableServers(existingServers);
    if (hasDuplicateExposedServerName(validServers)) {
      return null;
    }

    const newGroup: IGroup = {
      id: randomUUID(),
      name,
      description,
      servers: validServers,
      owner: resolvedOwner,
    };

    const createdGroup = await groupDao.create(newGroup);
    return createdGroup;
  } catch (error) {
    console.error('Failed to create group:', error);
    return null;
  }
};

// Update an existing group
export const updateGroup = async (id: string, data: Partial<IGroup>): Promise<IGroup | null> => {
  try {
    const groupDao = getGroupDao();
    const serverDao = getServerDao();

    const existingGroup = await groupDao.findById(id);
    if (!existingGroup || !canMutateGroup(existingGroup)) {
      return null;
    }

    // Check for name uniqueness within the same owner if name is being updated
    if (data.name && data.name !== existingGroup.name) {
      const owner = existingGroup.owner || 'admin';
      const groupWithName = await groupDao.findByOwnerAndName(owner, data.name);
      if (groupWithName && groupWithName.id !== existingGroup.id) {
        return null;
      }
    }

    // If servers array is provided, validate server existence/attachability and normalize format
    if (data.servers) {
      const normalizedServers = normalizeGroupServers(data.servers);
      const allServers = await serverDao.findAll();
      const serverNames = new Set(allServers.map((s) => s.name));
      const existingServers = normalizedServers.filter((serverConfig) =>
        serverNames.has(serverConfig.name),
      );
      data.servers = await filterAttachableServers(existingServers);
      if (hasDuplicateExposedServerName(data.servers)) {
        return null;
      }
    }

    // Never allow ownership transfer through generic update payloads
    if ('owner' in data) {
      delete (data as Partial<IGroup>).owner;
    }

    const updatedGroup = await groupDao.update(id, data);

    if (updatedGroup) {
      notifyToolChanged();
    }

    return updatedGroup;
  } catch (error) {
    console.error(`Failed to update group ${id}:`, error);
    return null;
  }
};

// Update servers in a group (batch update)
// Update group servers (maintaining backward compatibility)
export const updateGroupServers = async (
  groupId: string,
  servers: string[] | IGroupServerConfig[],
): Promise<IGroup | null> => {
  try {
    const groupDao = getGroupDao();
    const serverDao = getServerDao();

    const existingGroup = await groupDao.findById(groupId);
    if (!existingGroup || !canMutateGroup(existingGroup)) {
      return null;
    }

    // Normalize and filter out non-existent / non-attachable servers
    const normalizedServers = normalizeGroupServers(servers);
    const allServers = await serverDao.findAll();
    const serverNames = new Set(allServers.map((s) => s.name));
    const existingServers = normalizedServers.filter((serverConfig) =>
      serverNames.has(serverConfig.name),
    );
    const validServers = await filterAttachableServers(existingServers);
    if (hasDuplicateExposedServerName(validServers)) {
      return null;
    }

    const updatedGroup = await groupDao.update(groupId, { servers: validServers });

    if (updatedGroup) {
      notifyToolChanged();
    }

    return updatedGroup;
  } catch (error) {
    console.error(`Failed to update servers for group ${groupId}:`, error);
    return null;
  }
};

// Delete a group
export const deleteGroup = async (id: string): Promise<boolean> => {
  try {
    const groupDao = getGroupDao();

    const existingGroup = await groupDao.findById(id);
    if (!existingGroup || !canMutateGroup(existingGroup)) {
      return false;
    }

    return await groupDao.delete(id);
  } catch (error) {
    console.error(`Failed to delete group ${id}:`, error);
    return false;
  }
};

// Add server to group
export const addServerToGroup = async (
  groupId: string,
  serverName: string,
): Promise<IGroup | null> => {
  try {
    const groupDao = getGroupDao();
    const serverDao = getServerDao();

    // Verify server exists and is attachable for current user
    const server = await serverDao.findById(serverName);
    if (!server) {
      return null;
    }
    const attachable = await filterAttachableServers([{ name: serverName, tools: 'all' }]);
    if (attachable.length === 0) {
      return null;
    }

    const group = await groupDao.findById(groupId);
    if (!group || !canMutateGroup(group)) {
      return null;
    }

    const normalizedServers = normalizeGroupServers(group.servers);

    // Add server to group if not already in it
    if (!normalizedServers.some((s) => s.name === serverName)) {
      normalizedServers.push({ name: serverName, tools: 'all', prompts: 'all', resources: 'all' });
      const updatedGroup = await groupDao.update(groupId, { servers: normalizedServers });

      if (updatedGroup) {
        notifyToolChanged();
      }

      return updatedGroup;
    }

    notifyToolChanged();
    return group;
  } catch (error) {
    console.error(`Failed to add server ${serverName} to group ${groupId}:`, error);
    return null;
  }
};

// Remove server from group
export const removeServerFromGroup = async (
  groupId: string,
  serverName: string,
): Promise<IGroup | null> => {
  try {
    const groupDao = getGroupDao();

    const group = await groupDao.findById(groupId);
    if (!group || !canMutateGroup(group)) {
      return null;
    }

    const normalizedServers = normalizeGroupServers(group.servers);
    const filteredServers = normalizedServers.filter((server) => server.name !== serverName);

    return await groupDao.update(groupId, { servers: filteredServers });
  } catch (error) {
    console.error(`Failed to remove server ${serverName} from group ${groupId}:`, error);
    return null;
  }
};

// Get all servers in a group
export const getServersInGroup = async (groupId: string): Promise<string[]> => {
  const group = await getGroupByIdOrName(groupId);
  if (!group) return [];
  const normalizedServers = normalizeGroupServers(group.servers);
  return normalizedServers.map((server) => server.name);
};

// Get server configuration from group (including tool selection)
export const getServerConfigInGroup = async (
  groupId: string,
  serverName: string,
): Promise<IGroupServerConfig | undefined> => {
  const group = await getGroupByIdOrName(groupId);
  if (!group) return undefined;
  const normalizedServers = normalizeGroupServers(group.servers);
  return normalizedServers.find((server) => server.name === serverName);
};

// Get all server configurations in a group
export const getServerConfigsInGroup = async (groupId: string): Promise<IGroupServerConfig[]> => {
  const group = await getGroupByIdOrName(groupId);
  if (!group) return [];
  return normalizeGroupServers(group.servers);
};

// Update tools selection for a specific server in a group
export const updateServerToolsInGroup = async (
  groupId: string,
  serverName: string,
  tools: string[] | 'all',
): Promise<IGroup | null> => {
  try {
    const groupDao = getGroupDao();
    const serverDao = getServerDao();

    const group = await groupDao.findById(groupId);
    if (!group || !canMutateGroup(group)) {
      return null;
    }

    // Verify server exists
    const server = await serverDao.findById(serverName);
    if (!server) {
      return null;
    }

    const normalizedServers = normalizeGroupServers(group.servers);

    const serverIndex = normalizedServers.findIndex((s) => s.name === serverName);
    if (serverIndex === -1) {
      return null; // Server not in group
    }

    // Update the tools configuration for the server
    normalizedServers[serverIndex].tools = tools;

    const updatedGroup = await groupDao.update(groupId, { servers: normalizedServers });

    if (updatedGroup) {
      notifyToolChanged();
    }

    return updatedGroup;
  } catch (error) {
    console.error(`Failed to update tools for server ${serverName} in group ${groupId}:`, error);
    return null;
  }
};
