import type { ServerConfig } from '../types/index.js';

// Preserve the v1 preference order for legacy handshakes, including auto fallback.
export const LEGACY_PROTOCOL_VERSIONS = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
  '2024-10-07',
];

/** HTTP discovery is automatic; legacy-only transports skip probing (#1382). */
export const resolveUpstreamProtocolMode = (config: ServerConfig): 'auto' | 'legacy' => {
  const mode = config.protocolNegotiation ?? undefined;
  if (mode !== undefined && mode !== 'auto' && mode !== 'legacy') {
    throw new Error('protocolNegotiation must be auto or legacy');
  }
  if (mode === 'auto' && config.type !== 'streamable-http') {
    throw new Error('protocolNegotiation auto requires streamable-http');
  }
  return config.type === 'streamable-http' ? (mode ?? 'auto') : 'legacy';
};
