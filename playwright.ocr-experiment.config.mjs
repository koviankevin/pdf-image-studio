import config from './playwright.config.mjs';

// Opt-in investigation: no accuracy thresholds, separate from normal CI.
export default {...config, testDir: './tests/experiments', timeout: 300_000,
  outputDir: './ocr-experiment-results',
  reporter: [['list']]};
