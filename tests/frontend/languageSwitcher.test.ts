import fs from 'fs';
import path from 'path';

// A locale file only helps users if it is reachable from the dashboard, so the
// switcher and the i18n resources must both stay in sync with locales/.
describe('dashboard language switcher', () => {
  const localeDir = path.join(process.cwd(), 'locales');
  const localeCodes = fs
    .readdirSync(localeDir)
    .filter((file) => file.endsWith('.json'))
    .map((file) => path.basename(file, '.json'))
    .sort();

  const i18nSource = fs.readFileSync(
    path.join(process.cwd(), 'frontend', 'src', 'i18n.ts'),
    'utf8',
  );
  const switcherSource = fs.readFileSync(
    path.join(process.cwd(), 'frontend', 'src', 'components', 'ui', 'LanguageSwitch.tsx'),
    'utf8',
  );

  it('offers every shipped locale in the language switcher', () => {
    const offeredCodes = Array.from(
      switcherSource.matchAll(/code:\s*'([a-z]{2})'/g),
      (match) => match[1],
    ).sort();

    expect(offeredCodes).toEqual(localeCodes);
  });

  it('loads every shipped locale in the i18n resources', () => {
    const missing = localeCodes.filter(
      (code) =>
        !i18nSource.includes(`locales/${code}.json`) ||
        !i18nSource.includes(`translation: ${code}Translation`),
    );

    expect(missing).toEqual([]);
  });
});
