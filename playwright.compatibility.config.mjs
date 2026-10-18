import {defineConfig} from '@playwright/test';
import regression from './playwright.config.mjs';

// Reuse targeted regression cases, not the full OCR accuracy/layout matrix.
export const smokeTitles = [
  'A4 UI exports selected workspace order',
  'crop preview and image download work on page 3',
  'successful import releases sources excluded',
  'stopping a pending OCR module import unlocks immediately',
  'preview builds are serialized, obsolete settings cancel',
  'real OCR worker cancels at recognition dispatch and restarts',
];

export default defineConfig(regression, {
  testDir: './tests',
  testMatch: [
    'browser/imposition.spec.mjs',
    'browser/resource-lifecycle.spec.mjs',
    'browser/safety-performance.spec.mjs',
    'compatibility/*.spec.mjs',
  ],
  grep: new RegExp(smokeTitles.join('|')),
  timeout: 90_000,
  globalTimeout: 300_000,
  outputDir: 'test-results/compatibility',
  reporter: [['list'], ['html', {open: 'never', outputFolder: 'playwright-report/compatibility'}]],
  projects: ['firefox', 'webkit'].map(browserName => ({
    name: browserName,
    metadata: {compatibilitySmoke: true},
    use: {browserName},
  })),
});
