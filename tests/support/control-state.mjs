import {expect} from '@playwright/test';

// Playwright 1.58's enabled matcher does not inspect fieldset's own disabled
// state. CSS :disabled also covers a disabled ancestor fieldset.
export async function expectControlEnabled(locator, options = {}) {
  await expect.poll(() => locator.evaluate(el => !el.matches(':disabled')), {
    ...options, message: `Control must be enabled: ${locator}`,
  }).toBe(true);
}
