import {defineConfig} from '@playwright/test';
import regression from './playwright.config.mjs';

// Reuse targeted regression cases, not the full OCR accuracy/layout matrix.
export default defineConfig(regression, {
  testDir: './tests',
  testMatch: [
    'browser/imposition.spec.mjs',
    'browser/resource-lifecycle.spec.mjs',
    'browser/safety-performance.spec.mjs',
    'browser/workflow.spec.mjs',
    'browser/autosave.spec.mjs',
    'browser/productivity.spec.mjs',
    'browser/productivity-regression.spec.mjs',
    'browser/studio.spec.mjs',
    'browser/ease.spec.mjs',
    'browser/product.spec.mjs',
    'browser/replacement.spec.mjs',
    'browser/native-text.spec.mjs',
    'browser/tool-hub.spec.mjs',
    'browser/tool-state-matrix.spec.mjs',
    'browser/control-readiness.spec.mjs',
    'browser/long-task-visibility.spec.mjs',
    'browser/pdf-inspection.spec.mjs',
    'browser/tool-coverage.spec.mjs',
    'compatibility/*.spec.mjs',
  ],
  // Each test owns its browser context and worker-scoped local server.
  workers: process.env.CI ? 2 : 1,
  grep: /@compatibility/,
  timeout: 90_000,
  globalTimeout: 720_000,
  outputDir: 'test-results/compatibility',
  reporter: [['list'], ['html', {open: 'never', outputFolder: 'playwright-report/compatibility'}]],
  projects: ['firefox', 'webkit'].map(browserName => ({
    name: browserName,
    metadata: {compatibilitySmoke: true},
    use: {browserName},
  })),
});
