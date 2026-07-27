import {
  clearChangelogUpdateCache,
  getChangelogUpdateInfo,
} from '../../src/services/changelogService.js';

describe('changelogService', () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    clearChangelogUpdateCache();
    process.env = { ...originalEnv };
    delete process.env.DISABLE_UPDATE_CHECK;
    delete process.env.MCPHUB_GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
    process.env.MCPHUB_GITHUB_REPO = 'huangjunsen0406/xiaozhi-mcphub';
    process.env.MCPHUB_UPDATE_CHECK_CACHE_TTL_SECONDS = '21600';
    global.fetch = jest.fn();
  });

  afterAll(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
  });

  it('fetches update info from GitHub releases and caches by version and locale', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          tag_name: 'v1.0.12',
          name: 'v1.0.12',
          body: '## What\'s Changed\n\n- feat: smarter routing\n- fix: reconnect race\n',
          html_url: 'https://github.com/huangjunsen0406/xiaozhi-mcphub/releases/tag/v1.0.12',
          published_at: '2026-07-01T00:00:00Z',
          draft: false,
          prerelease: false,
        },
      ],
    });

    const first = await getChangelogUpdateInfo({ currentVersion: '1.0.11', locale: 'en' });
    const second = await getChangelogUpdateInfo({ currentVersion: '1.0.11', locale: 'en' });

    expect(first.source).toBe('github');
    expect(first.latestVersion).toBe('1.0.12');
    expect(first.hasUpdate).toBe(true);
    expect(first.totalUpdateCount).toBe(1);
    expect(first.entries).toHaveLength(1);
    expect(first.entries[0]).toMatchObject({
      product: 'xiaozhi-mcphub',
      version: '1.0.12',
      tagName: 'v1.0.12',
    });
    expect(first.entries[0].highlights.length).toBeGreaterThan(0);
    expect(first.changelogUrl).toContain('/releases/tag/v1.0.12');
    expect(first.allChangelogUrl).toBe(
      'https://github.com/huangjunsen0406/xiaozhi-mcphub/releases',
    );
    expect(second).toEqual(first);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toContain(
      '/repos/huangjunsen0406/xiaozhi-mcphub/releases',
    );
  });

  it('returns disabled payload when update checks are disabled', async () => {
    process.env.DISABLE_UPDATE_CHECK = 'true';

    const result = await getChangelogUpdateInfo({ currentVersion: '1.0.11', locale: 'zh-CN' });

    expect(result).toEqual({
      latestVersion: null,
      hasUpdate: false,
      entries: [],
      totalUpdateCount: 0,
      changelogUrl: 'https://github.com/huangjunsen0406/xiaozhi-mcphub/releases',
      allChangelogUrl: 'https://github.com/huangjunsen0406/xiaozhi-mcphub/releases',
      source: 'disabled',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('skips draft and prerelease tags when computing latest', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          tag_name: 'v1.1.0-rc.1',
          name: 'v1.1.0-rc.1',
          body: 'prerelease',
          html_url: 'https://github.com/huangjunsen0406/xiaozhi-mcphub/releases/tag/v1.1.0-rc.1',
          published_at: '2026-07-10T00:00:00Z',
          draft: false,
          prerelease: true,
        },
        {
          tag_name: 'v1.0.12',
          name: 'v1.0.12',
          body: '- feat: stable',
          html_url: 'https://github.com/huangjunsen0406/xiaozhi-mcphub/releases/tag/v1.0.12',
          published_at: '2026-07-01T00:00:00Z',
          draft: false,
          prerelease: false,
        },
      ],
    });

    const result = await getChangelogUpdateInfo({ currentVersion: '1.0.11', locale: 'en' });

    expect(result.latestVersion).toBe('1.0.12');
    expect(result.hasUpdate).toBe(true);
    expect(result.entries[0].version).toBe('1.0.12');
  });

  it('reports up-to-date when current version matches latest release', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [
        {
          tag_name: 'v1.0.12',
          name: 'v1.0.12',
          body: '- feat: already installed',
          html_url: 'https://github.com/huangjunsen0406/xiaozhi-mcphub/releases/tag/v1.0.12',
          published_at: '2026-07-01T00:00:00Z',
          draft: false,
          prerelease: false,
        },
      ],
    });

    const result = await getChangelogUpdateInfo({ currentVersion: '1.0.12', locale: 'zh' });

    expect(result.hasUpdate).toBe(false);
    expect(result.latestVersion).toBe('1.0.12');
    expect(result.totalUpdateCount).toBe(0);
    expect(result.entries).toHaveLength(1);
    expect(result.source).toBe('github');
  });

  it('propagates GitHub API failures without npm fallback', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ message: 'unavailable' }),
    });

    await expect(
      getChangelogUpdateInfo({ currentVersion: '1.0.11', locale: 'en' }),
    ).rejects.toThrow('GitHub releases request failed: 503');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('sends Authorization header when a GitHub token is configured', async () => {
    process.env.MCPHUB_GITHUB_TOKEN = 'test-token';
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    await getChangelogUpdateInfo({ currentVersion: '1.0.11', locale: 'en' });

    const init = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-token');
  });
});
