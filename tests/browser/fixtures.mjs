import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {test as base, expect} from '@playwright/test';

export const test = base.extend({
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
