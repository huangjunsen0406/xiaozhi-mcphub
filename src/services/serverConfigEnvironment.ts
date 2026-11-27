import { replaceEnvVars } from '../config/index.js';
import { getUserDao } from '../dao/index.js';
import type { ServerConfig } from '../types/index.js';

/**
 * Resolve the environment visible to a server configuration.
 * Ownerless (operator-level) and admin-owned configs inherit process.env;
 * non-admin configs fail closed with an empty base environment so host secrets
 * cannot leak through ${VAR} expansion or child process inheritance (#1270).
 */
export const getServerEnvironment = async (
  config: ServerConfig,
): Promise<Record<string, string>> => {
  const trusted =
    !config.owner || (await getUserDao().findByUsername(config.owner))?.isAdmin === true;
  const source = trusted ? process.env : {};
  return {
    ...(source as Record<string, string>),
    ...(replaceEnvVars(config.env || {}, source) as Record<string, string>),
  };
};

/**
 * Expand environment variable references across a server configuration using
 * the owner-scoped environment, keeping authorization metadata literal (#1270).
 */
export const expandServerConfig = async <T extends ServerConfig>(config: T): Promise<T> => {
  const { owner, visibility, ...transportConfig } = config;
  return {
    ...(replaceEnvVars(transportConfig as any, await getServerEnvironment(config)) as T),
    owner,
    visibility,
  };
};
