import { ChangelogCategory, ChangelogEntry, ChangelogUpdateInfo } from '../types/index.js';

const DEFAULT_GITHUB_REPO = 'huangjunsen0406/xiaozhi-mcphub';
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_CACHE_TTL_SECONDS = 21600;
const DEFAULT_ENTRY_LIMIT = 5;
const DEFAULT_RELEASE_PAGE_SIZE = 30;

interface CachedUpdateInfo {
  key: string;
  expiresAt: number;
  data: ChangelogUpdateInfo;
}

interface GitHubRelease {
  tag_name?: string;
  name?: string | null;
  body?: string | null;
  html_url?: string;
  published_at?: string | null;
  draft?: boolean;
  prerelease?: boolean;
}

let cachedUpdateInfo: CachedUpdateInfo | null = null;

export function clearChangelogUpdateCache(): void {
  cachedUpdateInfo = null;
}

export async function getChangelogUpdateInfo(input: {
  currentVersion: string;
  locale?: string;
  force?: boolean;
}): Promise<ChangelogUpdateInfo> {
  const locale = normalizeLocale(input.locale);
  const currentVersion = input.currentVersion || 'dev';
  const allChangelogUrl = releasesListUrl();

  if (process.env.DISABLE_UPDATE_CHECK === 'true') {
    return {
      latestVersion: null,
      hasUpdate: false,
      entries: [],
      totalUpdateCount: 0,
      changelogUrl: allChangelogUrl,
      allChangelogUrl,
      source: 'disabled',
    };
  }

  const cacheKey = `${currentVersion}:${locale}`;
  const now = Date.now();
  if (!input.force && cachedUpdateInfo?.key === cacheKey && cachedUpdateInfo.expiresAt > now) {
    return cachedUpdateInfo.data;
  }

  const data = await fetchUpdateInfoFromGitHub(currentVersion, locale);

  cachedUpdateInfo = {
    key: cacheKey,
    expiresAt: now + cacheTtlMs(),
    data,
  };

  return data;
}

async function fetchUpdateInfoFromGitHub(
  currentVersion: string,
  locale: 'en' | 'zh',
): Promise<ChangelogUpdateInfo> {
  const allChangelogUrl = releasesListUrl();
  const releases = await fetchGitHubReleases();
  const stableReleases = releases
    .filter((release) => !release.draft && !release.prerelease)
    .map((release) => toChangelogEntry(release, locale))
    .filter((entry): entry is ChangelogEntry => entry !== null);

  if (stableReleases.length === 0) {
    return {
      latestVersion: null,
      hasUpdate: false,
      entries: [],
      totalUpdateCount: 0,
      changelogUrl: allChangelogUrl,
      allChangelogUrl,
      source: 'github',
    };
  }

  const latestVersion = stableReleases[0].version;
  const newerReleases =
    currentVersion === 'dev'
      ? []
      : stableReleases.filter(
          (entry) => compareStableVersions(entry.version, currentVersion) > 0,
        );

  const hasUpdate = newerReleases.length > 0;
  const entries = (hasUpdate ? newerReleases : stableReleases.slice(0, 1)).slice(
    0,
    entryLimit(),
  );

  return {
    latestVersion,
    hasUpdate,
    entries,
    totalUpdateCount: hasUpdate ? newerReleases.length : 0,
    changelogUrl: hasUpdate
      ? releaseTagUrl(latestVersion)
      : releaseTagUrl(stableReleases[0].version),
    allChangelogUrl,
    source: 'github',
  };
}

async function fetchGitHubReleases(): Promise<GitHubRelease[]> {
  const url = new URL(githubReleasesApiUrl());
  url.searchParams.set('per_page', String(releasePageSize()));

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'xiaozhi-mcphub-update-check',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  const token = githubToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(timeoutMs()),
  });

  if (!response.ok) {
    throw new Error(`GitHub releases request failed: ${response.status}`);
  }

  const payload = (await response.json().catch(() => null)) as GitHubRelease[] | null;
  if (!Array.isArray(payload)) {
    throw new Error('GitHub releases response was not an array');
  }
  return payload;
}

function toChangelogEntry(
  release: GitHubRelease,
  locale: 'en' | 'zh',
): ChangelogEntry | null {
  const version = normalizeReleaseVersion(release.tag_name || release.name || '');
  if (!version) return null;

  const bodyMarkdown = (release.body || '').trim();
  const parsed = parseReleaseBody(bodyMarkdown);
  const tagName = release.tag_name || `v${version}`;
  const url = release.html_url || releaseTagUrl(version);

  return {
    product: 'xiaozhi-mcphub',
    version,
    tagName,
    publishedAt: release.published_at || '',
    url,
    changelogUrl: url,
    title: (release.name || tagName).trim() || tagName,
    summary: parsed.summary,
    highlights: parsed.highlights,
    fixes: parsed.fixes,
    breakingChanges: parsed.breakingChanges,
    upgradeNotes: parsed.upgradeNotes,
    categories: parsed.categories,
    locale,
    bodyMarkdown,
    isStructured: parsed.isStructured,
  };
}

function parseReleaseBody(body: string): {
  summary: string;
  highlights: string[];
  fixes: string[];
  breakingChanges: string[];
  upgradeNotes: string[];
  categories: ChangelogCategory[];
  isStructured: boolean;
} {
  if (!body) {
    return {
      summary: '',
      highlights: [],
      fixes: [],
      breakingChanges: [],
      upgradeNotes: [],
      categories: [],
      isStructured: false,
    };
  }

  const lines = body.replace(/\r\n/g, '\n').split('\n');
  const highlights: string[] = [];
  const fixes: string[] = [];
  const breakingChanges: string[] = [];
  const upgradeNotes: string[] = [];
  const categories = new Set<ChangelogCategory>();
  let summary = '';
  let inCodeFence = false;
  let section: 'highlights' | 'fixes' | 'breaking' | 'upgrade' | 'other' = 'other';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (line.startsWith('```')) {
      inCodeFence = !inCodeFence;
      continue;
    }
    if (inCodeFence) continue;

    const heading = line.match(/^#{1,3}\s+(.*)$/);
    if (heading) {
      const title = heading[1].toLowerCase();
      if (/what.?s changed|changes|features?|feat|新[增功]|特性|更新内容/.test(title)) {
        section = 'highlights';
      } else if (/fix|bug|修复|缺陷/.test(title)) {
        section = 'fixes';
      } else if (/breaking|破坏|不兼容/.test(title)) {
        section = 'breaking';
      } else if (/upgrade|migration|升级|迁移|quick start|docker|images?/.test(title)) {
        section = 'upgrade';
      } else {
        section = 'other';
      }
      continue;
    }

    const bullet = line.match(/^[-*+]\s+(.*)$/);
    if (bullet) {
      const text = stripMarkdownLinkNoise(bullet[1]);
      if (!text) continue;

      if (/^feat\b|新增|支持/.test(text)) categories.add('feature');
      if (/^fix\b|修复|bug/i.test(text)) categories.add('fix');
      if (/security|安全|RCE|CVE/i.test(text)) categories.add('security');
      if (/breaking|破坏性/i.test(text)) categories.add('breaking');

      if (section === 'fixes') {
        fixes.push(text);
      } else if (section === 'breaking') {
        breakingChanges.push(text);
        categories.add('breaking');
      } else if (section === 'upgrade') {
        upgradeNotes.push(text);
      } else if (section === 'highlights' || section === 'other') {
        highlights.push(text);
        if (section === 'highlights') categories.add('feature');
      }
      continue;
    }

    if (!summary && section === 'other' && !looksLikeCodeOrCommand(line)) {
      summary = stripMarkdownLinkNoise(line);
    }
  }

  if (!summary) {
    summary = highlights[0] || fixes[0] || '';
  }
  if (summary.length > 180) {
    summary = `${summary.slice(0, 177).trim()}...`;
  }

  return {
    summary,
    highlights: highlights.slice(0, 8),
    fixes: fixes.slice(0, 8),
    breakingChanges: breakingChanges.slice(0, 8),
    upgradeNotes: upgradeNotes.slice(0, 8),
    categories: Array.from(categories),
    isStructured: Boolean(highlights.length || fixes.length || breakingChanges.length),
  };
}

function stripMarkdownLinkNoise(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function looksLikeCodeOrCommand(line: string): boolean {
  return (
    /^(npm|pnpm|yarn|npx|docker|curl|wget|git|cd|tar|chmod|sudo|export|#!)\b/.test(line) ||
    line.startsWith('./') ||
    line.startsWith('/') ||
    (line.includes('=') && /^(export\s+)?[A-Z0-9_]+=/.test(line))
  );
}

function normalizeReleaseVersion(value: string): string | null {
  const match = value.trim().match(/^v?(\d+\.\d+\.\d+)\b/i);
  return match ? match[1] : null;
}

function normalizeLocale(value: string | undefined): 'en' | 'zh' {
  return value?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function githubRepo(): string {
  return (
    process.env.MCPHUB_GITHUB_REPO ||
    process.env.XIAOZHI_GITHUB_REPO ||
    DEFAULT_GITHUB_REPO
  ).replace(/^\/+|\/+$/g, '');
}

function githubReleasesApiUrl(): string {
  if (process.env.MCPHUB_GITHUB_RELEASES_URL) {
    return process.env.MCPHUB_GITHUB_RELEASES_URL.replace(/\/+$/, '');
  }
  return `https://api.github.com/repos/${githubRepo()}/releases`;
}

function releasesListUrl(): string {
  if (process.env.MCPHUB_RELEASES_PAGE_URL) {
    return process.env.MCPHUB_RELEASES_PAGE_URL.replace(/\/+$/, '');
  }
  return `https://github.com/${githubRepo()}/releases`;
}

function releaseTagUrl(version: string): string {
  const normalized = version.replace(/^v/i, '');
  return `https://github.com/${githubRepo()}/releases/tag/v${normalized}`;
}

function githubToken(): string | undefined {
  return (
    process.env.MCPHUB_GITHUB_TOKEN ||
    process.env.GITHUB_TOKEN ||
    process.env.GH_TOKEN ||
    undefined
  );
}

function timeoutMs(): number {
  const value = Number(process.env.MCPHUB_UPDATE_CHECK_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_TIMEOUT_MS;
}

function cacheTtlMs(): number {
  const value = Number(process.env.MCPHUB_UPDATE_CHECK_CACHE_TTL_SECONDS);
  const seconds =
    Number.isFinite(value) && value >= 0 ? Math.floor(value) : DEFAULT_CACHE_TTL_SECONDS;
  return seconds * 1000;
}

function entryLimit(): number {
  const value = Number(process.env.MCPHUB_UPDATE_ENTRY_LIMIT);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_ENTRY_LIMIT;
}

function releasePageSize(): number {
  const value = Number(process.env.MCPHUB_GITHUB_RELEASES_PER_PAGE);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_RELEASE_PAGE_SIZE;
  return Math.min(Math.floor(value), 100);
}

function parseStableVersion(version: string): [number, number, number] | null {
  const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareStableVersions(a: string, b: string): number {
  const parsedA = parseStableVersion(a);
  const parsedB = parseStableVersion(b);
  if (!parsedA || !parsedB) return 0;
  for (let i = 0; i < 3; i++) {
    if (parsedA[i] > parsedB[i]) return 1;
    if (parsedA[i] < parsedB[i]) return -1;
  }
  return 0;
}
