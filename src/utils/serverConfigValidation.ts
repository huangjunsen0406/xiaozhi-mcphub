import { ServerConfig } from '../types/index.js';

/**
 * Whether a server configuration touches a privileged capability that only
 * admins may configure.
 *
 * stdio servers run an arbitrary command on the host, and passthrough headers
 * forward caller-supplied credentials to the upstream. Letting an ordinary
 * dashboard user set either one turns "add a server" into arbitrary code
 * execution or credential smuggling (CVE-2026-79748 / GHSA-mx89-jjx9-gjr8).
 */
export const isPrivilegedServerConfig = (config: ServerConfig): boolean => {
  return Boolean(
    config.type === 'stdio' ||
      Boolean(config.passthroughHeaders?.length || config.openapi?.passthroughHeaders?.length) ||
      config.command ||
      (Array.isArray(config.args) && config.args.length > 0) ||
      (!config.url && !config.openapi?.url && !config.openapi?.schema),
  );
};

/**
 * Escape hatch for deployments that intentionally let every dashboard user run
 * their own stdio servers (the fork's multi-tenant model). Off by default: with
 * it off, only admins may configure a stdio server or passthrough headers,
 * matching upstream's CVE-2026-79748 fix. Turn it on only for trusted,
 * single-tenant instances - it re-opens host-level code execution to every
 * authenticated user.
 */
export const allowsUserPrivilegedServers = (): boolean =>
  /^(1|true|yes|on)$/i.test((process.env.MCPHUB_ALLOW_USER_STDIO_SERVERS ?? '').trim());
