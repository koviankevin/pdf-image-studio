import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {test as base, expect} from '@playwright/test';

export const test = base.extend({
  // Enabled only by the small Firefox/WebKit suite. Observe the real page CSP;
  // do not bypass it or change production assets for compatibility checks.
  compatibilityDiagnostics: [async ({page, browser, context}, use, testInfo) => {
    if (!testInfo.project.metadata.compatibilitySmoke) return use();
    const errors = [], violations = [];
    const observe = target => target.on('pageerror', error => errors.push(error.message));
    for (const target of context.pages()) observe(target);
    context.on('page', observe);
    // Collect while each page is alive, including tabs intentionally closed by
    // recovery tests. Evaluating only the original tab at teardown loses them.
    await context.exposeBinding('recordCompatibilityViolation', (_source, violation) => violations.push(violation));
    await context.addInitScript(() => {
      window.compatibilityViolations = [];
      document.addEventListener('securitypolicyviolation', event => {
        const violation = {directive: event.effectiveDirective, uri: event.blockedURI};
        compatibilityViolations.push(violation);
        void window.recordCompatibilityViolation(violation);
      });
    });
    await use();
    await testInfo.attach('browser-diagnostics.json', {
      body: Buffer.from(JSON.stringify({browser: testInfo.project.name,
        version: browser.version(), platform: process.platform, errors, violations}, null, 2)),
      contentType: 'application/json',
    });
    expect(errors, 'Unhandled application errors').toEqual([]);
    expect(violations, 'Normal functionality must not violate the shipped CSP').toEqual([]);
  }, {auto: true}],
  // Use the real development server on its automatically allocated free port.
  // No production server changes, fixed-port collisions or external website.
  serverURL: [async ({}, use) => {
    const server = spawn(process.execPath, ['serve.mjs'], {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const closed = once(server, 'close');
    let stderr = '';
    server.stderr.on('data', data => { stderr += data; });
    let timer;
    try {
      const url = await new Promise((resolve, reject) => {
        let output = '';
        timer = setTimeout(() => reject(new Error(`Server startup timed out: ${stderr}`)), 10_000);
        server.once('error', reject);
        server.once('exit', code => reject(new Error(`Server exited (${code}): ${stderr}`)));
        server.stdout.on('data', data => {
          output += data;
          const match = output.match(/Local: (http:\/\/127\.0\.0\.1:\d+)/);
          if (match) resolve(match[1]);
        });
      });
      clearTimeout(timer);
      await use(url);
    } finally {
      clearTimeout(timer);
      server.kill();
      await closed;
    }
  }, {scope: 'worker'}],
  baseURL: async ({serverURL}, use) => use(serverURL),
});

export {expect};

export {expectControlEnabled} from '../support/control-state.mjs';
