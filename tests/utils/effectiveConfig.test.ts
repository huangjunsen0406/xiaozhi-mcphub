import { describe, expect, it } from '@jest/globals';
import {
  bodyHasGlobalOnlySystemFields,
  extractUserConfigPatch,
  mergeModelscope,
  mergeSmartRoutingSettings,
  sanitizeUserSmartRouting,
} from '../../src/utils/effectiveConfig.js';

describe('effectiveConfig helpers', () => {
  it('strips dbUrl from user smartRouting writes', () => {
    expect(
      sanitizeUserSmartRouting({
        enabled: true,
        dbUrl: 'postgres://evil',
        openaiApiKey: 'sk-user',
      } as any),
    ).toEqual({
      enabled: true,
      openaiApiKey: 'sk-user',
    });
  });

  it('always keeps system dbUrl when merging smart routing', () => {
    const merged = mergeSmartRoutingSettings(
      { enabled: false, dbUrl: 'postgres://system', openaiApiKey: 'sk-system' } as any,
      { enabled: true, dbUrl: 'postgres://user', openaiApiKey: 'sk-user' } as any,
    );
    expect(merged).toEqual(
      expect.objectContaining({
        enabled: true,
        dbUrl: 'postgres://system',
        openaiApiKey: 'sk-user',
      }),
    );
  });

  it('extracts only allowlisted user config patches', () => {
    const patch = extractUserConfigPatch({
      smartRouting: { enabled: true, dbUrl: 'postgres://x' },
      modelscope: { apiKey: 'ms-key' },
      routing: { enableGlobalRoute: false },
    });
    expect(patch).toEqual({
      smartRouting: { enabled: true },
      modelscope: { apiKey: 'ms-key' },
    });
  });

  it('flags global-only system fields', () => {
    expect(bodyHasGlobalOnlySystemFields({ email: { host: 'smtp' } })).toBe(true);
    expect(bodyHasGlobalOnlySystemFields({ smartRouting: { enabled: true } })).toBe(false);
    // dbUrl alone is stripped on write; presence is not a hard global-only reject
    expect(bodyHasGlobalOnlySystemFields({ smartRouting: { dbUrl: 'x' } })).toBe(false);
  });

  it('merges modelscope keys with user override', () => {
    expect(mergeModelscope({ apiKey: 'sys' }, { apiKey: 'user' })).toEqual({ apiKey: 'user' });
    expect(mergeModelscope({ apiKey: 'sys' }, {})).toEqual({ apiKey: 'sys' });
  });
});
