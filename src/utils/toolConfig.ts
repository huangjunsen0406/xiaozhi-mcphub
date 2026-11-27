import { getNameSeparator } from '../config/index.js';
import type { ServerConfig } from '../types/index.js';

export type ToolConfig = NonNullable<ServerConfig['tools']>[string];

type InputSchema = Record<string, unknown> | undefined;

const hasKey = (tools: NonNullable<ServerConfig['tools']>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(tools, key);

/**
 * The keys a tool's config may be stored under, given its runtime
 * (server-prefixed) name: that name, then the bare upstream name.
 */
const toolConfigKeys = (
  serverName: string,
  runtimeName: string,
  runtimeNames: readonly string[],
): string[] => {
  const bareName = runtimeName.slice(`${serverName}${getNameSeparator()}`.length);
  return runtimeNames.includes(bareName) ? [runtimeName] : [runtimeName, bareName];
};

/**
 * Look up a tool's config by runtime name (or bare upstream name).
 */
export const findToolConfig = (
  tools: ServerConfig['tools'] | undefined,
  serverName: string,
  toolName: string,
  runtimeNames: readonly string[] = [],
): ToolConfig | undefined => {
  if (!tools) return undefined;
  const prefix = `${serverName}${getNameSeparator()}`;
  const runtimeName = toolName.startsWith(prefix) ? toolName : `${prefix}${toolName}`;
  const key = toolConfigKeys(serverName, runtimeName, runtimeNames).find((candidate) =>
    hasKey(tools, candidate),
  );
  return key === undefined ? undefined : tools[key];
};

/**
 * Resolve the runtime name of the tool a caller means by `toolName`.
 */
export const resolveRuntimeToolName = (
  serverName: string,
  toolName: string,
  runtimeNames: readonly string[],
): string | undefined => {
  if (runtimeNames.includes(toolName)) return toolName;
  const prefixed = `${serverName}${getNameSeparator()}${toolName}`;
  return runtimeNames.includes(prefixed) ? prefixed : undefined;
};

/**
 * The key to write a tool's config under, reusing any existing entry key.
 */
export const findToolConfigKey = (
  tools: ServerConfig['tools'] | undefined,
  serverName: string,
  toolName: string,
  runtimeNames: readonly string[],
): string => {
  const runtimeName = resolveRuntimeToolName(serverName, toolName, runtimeNames);
  if (!tools || !runtimeName) return toolName;
  return (
    toolConfigKeys(serverName, runtimeName, runtimeNames).find((key) => hasKey(tools, key)) ??
    toolName
  );
};

/** Configured hidden parameters that take effect: required ones are never hidden. */
export const getEffectiveHiddenParams = (
  inputSchema: InputSchema,
  toolConfig: Pick<ToolConfig, 'hiddenParams'> | undefined,
): string[] => {
  const hidden = toolConfig?.hiddenParams;
  if (!Array.isArray(hidden) || hidden.length === 0) return [];
  const required = Array.isArray(inputSchema?.required) ? (inputSchema.required as unknown[]) : [];
  return hidden.filter((name) => !required.includes(name));
};

/** Return the input schema without hidden top-level properties. */
export const hideSchemaParams = <T extends InputSchema>(inputSchema: T, hidden: string[]): T => {
  const properties = inputSchema?.properties;
  if (hidden.length === 0 || !properties || typeof properties !== 'object') return inputSchema;
  const visible = { ...(properties as Record<string, unknown>) };
  for (const name of hidden) delete visible[name];
  return { ...inputSchema, properties: visible };
};

/** Return the tool as a model sees it with hidden parameters removed from its schema. */
export const applyHiddenParams = <T extends { inputSchema?: InputSchema }>(
  tool: T,
  toolConfig: Pick<ToolConfig, 'hiddenParams'> | undefined,
): T => {
  const hidden = getEffectiveHiddenParams(tool.inputSchema, toolConfig);
  return hidden.length === 0
    ? tool
    : { ...tool, inputSchema: hideSchemaParams(tool.inputSchema, hidden) };
};

/**
 * Strip hidden parameters from call arguments so a model that guesses one cannot pass it.
 */
export const removeHiddenArguments = <T>(
  args: T,
  inputSchema: InputSchema,
  toolConfig: Pick<ToolConfig, 'hiddenParams'> | undefined,
): T => {
  const hidden = getEffectiveHiddenParams(inputSchema, toolConfig);
  if (hidden.length === 0 || !args || typeof args !== 'object' || Array.isArray(args)) return args;
  const visible = { ...(args as Record<string, unknown>) };
  for (const name of hidden) delete visible[name];
  return visible as T;
};
