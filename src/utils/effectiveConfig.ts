import {
  SystemConfig,
  ToolResultCompressionConfig,
  UserConfig,
} from '../types/index.js';
import { getSystemConfigDao, getUserConfigDao } from '../dao/DaoFactory.js';
import { UserContextService } from '../services/userContextService.js';
import type { SmartRoutingConfig } from './smartRouting.js';

const deepMerge = <T extends Record<string, any>>(base: T, override?: Record<string, any>): T => {
  if (!override) return { ...base };
  const result: Record<string, any> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value === undefined) continue;
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      base[key] &&
      typeof base[key] === 'object' &&
      !Array.isArray(base[key])
    ) {
      result[key] = deepMerge(base[key], value);
    } else {
      result[key] = value;
    }
  }
  return result as T;
};

/**
 * Resolve the username to use for per-user config:
 * 1. Explicit argument
 * 2. UserContextService current user
 */
export const resolveConfigUsername = (username?: string | null): string | undefined => {
  if (username) return username;
  try {
    return UserContextService.getInstance().getCurrentUser()?.username || undefined;
  } catch {
    return undefined;
  }
};

export const getUserConfigOrEmpty = async (
  username?: string | null,
): Promise<UserConfig> => {
  const resolved = resolveConfigUsername(username);
  if (!resolved) return {};
  try {
    const config = await getUserConfigDao().get(resolved);
    return config || {};
  } catch {
    return {};
  }
};

/** Strip fields non-admins must never write into UserConfig.smartRouting. */
export const sanitizeUserSmartRouting = (
  input?: Partial<SmartRoutingConfig> | null,
): Partial<SmartRoutingConfig> | undefined => {
  if (!input || typeof input !== 'object') return undefined;
  const { dbUrl: _dbUrl, ...rest } = input as Partial<SmartRoutingConfig> & {
    dbUrl?: string;
  };
  return rest;
};

/**
 * Merge system + user smartRouting. System (and env) always owns `dbUrl`.
 * User overrides may change enable flag, API keys, progressive disclosure, etc.
 */
export const mergeSmartRoutingSettings = (
  system?: Partial<SmartRoutingConfig> | null,
  user?: Partial<SmartRoutingConfig> | null,
): Partial<SmartRoutingConfig> => {
  const systemPart = system || {};
  const userPart = sanitizeUserSmartRouting(user) || {};
  const merged = deepMerge({ ...systemPart }, userPart);
  // Force system dbUrl — never allow user override of vector store connection.
  if (systemPart.dbUrl !== undefined) {
    merged.dbUrl = systemPart.dbUrl;
  }
  return merged;
};

export const mergeToolResultCompression = (
  system?: ToolResultCompressionConfig | null,
  user?: ToolResultCompressionConfig | null,
): ToolResultCompressionConfig => {
  return deepMerge({ ...(system || {}) }, user || undefined);
};

export const mergeMcpRouter = (
  system?: SystemConfig['mcpRouter'] | null,
  user?: UserConfig['mcpRouter'] | null,
): NonNullable<SystemConfig['mcpRouter']> => {
  return deepMerge({ ...(system || {}) }, user || undefined);
};

export const mergeModelscope = (
  system?: SystemConfig['modelscope'] | null,
  user?: UserConfig['modelscope'] | null,
): NonNullable<SystemConfig['modelscope']> => {
  return deepMerge({ ...(system || {}) }, user || undefined);
};

/**
 * Load system config + optional user overrides and return merged sections used at runtime.
 */
export const getEffectiveUserScopedSections = async (
  username?: string | null,
): Promise<{
  username?: string;
  systemConfig: SystemConfig;
  userConfig: UserConfig;
  smartRouting: Partial<SmartRoutingConfig>;
  toolResultCompression: ToolResultCompressionConfig;
  mcpRouter: NonNullable<SystemConfig['mcpRouter']>;
  modelscope: NonNullable<SystemConfig['modelscope']>;
}> => {
  const systemConfig = (await getSystemConfigDao().get()) || {};
  const resolvedUsername = resolveConfigUsername(username);
  const userConfig = await getUserConfigOrEmpty(resolvedUsername);

  return {
    username: resolvedUsername,
    systemConfig,
    userConfig,
    smartRouting: mergeSmartRoutingSettings(systemConfig.smartRouting, userConfig.smartRouting),
    toolResultCompression: mergeToolResultCompression(
      systemConfig.toolResultCompression,
      userConfig.toolResultCompression,
    ),
    mcpRouter: mergeMcpRouter(systemConfig.mcpRouter, userConfig.mcpRouter),
    modelscope: mergeModelscope(systemConfig.modelscope, userConfig.modelscope),
  };
};

/**
 * Build the allowlisted UserConfig patch from a settings PUT body (non-admin path).
 * Returns null when nothing user-writable is present.
 */
export const extractUserConfigPatch = (
  body: Record<string, any>,
): Partial<UserConfig> | null => {
  const patch: Partial<UserConfig> = {};
  let hasAny = false;

  if (body.smartRouting && typeof body.smartRouting === 'object') {
    const sanitized = sanitizeUserSmartRouting(body.smartRouting);
    if (sanitized && Object.keys(sanitized).length > 0) {
      patch.smartRouting = sanitized;
      hasAny = true;
    }
  }

  if (body.toolResultCompression && typeof body.toolResultCompression === 'object') {
    patch.toolResultCompression = body.toolResultCompression;
    hasAny = true;
  }

  if (body.mcpRouter && typeof body.mcpRouter === 'object') {
    patch.mcpRouter = body.mcpRouter;
    hasAny = true;
  }

  if (body.modelscope && typeof body.modelscope === 'object') {
    patch.modelscope = body.modelscope;
    hasAny = true;
  }

  return hasAny ? patch : null;
};

/**
 * Whether the PUT body only contains user-scoped sections (no global-only fields).
 */
export const bodyHasGlobalOnlySystemFields = (body: Record<string, any>): boolean => {
  if (body.routing && typeof body.routing === 'object') return true;
  if (body.install && typeof body.install === 'object') return true;
  if (typeof body.nameSeparator === 'string') return true;
  if (typeof body.enableSessionRebuild === 'boolean') return true;
  if (body.oauthServer && typeof body.oauthServer === 'object') return true;
  if (body.auth && typeof body.auth === 'object') return true;
  if (body.email && typeof body.email === 'object') return true;
  if (body.activityLog && typeof body.activityLog === 'object') return true;
  // smartRouting.dbUrl may appear in non-admin payloads from the shared Settings form;
  // extractUserConfigPatch strips it — do not treat presence alone as a global-only write.
  return false;
};
