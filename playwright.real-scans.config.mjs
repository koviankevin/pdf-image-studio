import config from './playwright.config.mjs';

// Deliberate opt-in. No downloads, private documents, or accuracy gates in CI.
export default {...config, testDir: './tests/real-scans', testMatch: '*.spec.mjs',
  timeout: 240_000, outputDir: './real-scan-results', reporter: [['list']],
  use: {...config.use, trace: 'off',
    ...(process.env.REAL_SCAN_CHROMIUM_EXECUTABLE ?
      {launchOptions: {executablePath: process.env.REAL_SCAN_CHROMIUM_EXECUTABLE}} : {})}};
