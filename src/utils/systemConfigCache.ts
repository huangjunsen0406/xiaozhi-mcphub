import { SystemConfig } from '../types/index.js';
import { isDatabaseModeEnabled as resolveDatabaseModeEnabled } from '../config/dbEnv.js';

let cachedSystemConfig: SystemConfig | null = null;

export const isDatabaseModeEnabled = (): boolean => resolveDatabaseModeEnabled();

export const getCachedSystemConfig = (): SystemConfig | null => cachedSystemConfig;

export const setCachedSystemConfig = (systemConfig: SystemConfig | null | undefined): void => {
  cachedSystemConfig = systemConfig ?? null;
};

export const hydrateSystemConfigCache = async (): Promise<SystemConfig> => {
  const { getSystemConfigDao } = await import('../dao/DaoFactory.js');
  const systemConfig = (await getSystemConfigDao().get()) || {};
  cachedSystemConfig = systemConfig;
  return systemConfig;
};
