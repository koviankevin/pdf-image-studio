import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
import test from 'node:test';
import {parse} from 'yaml';
import {Lexer, Parser, Evaluator, data} from '@actions/expressions';

const workflow = parse(readFileSync(new URL('../../.github/workflows/tests.yml', import.meta.url), 'utf8'));
const {regression, compatibility, deploy} = workflow.jobs;
const toData = value => typeof value === 'object'
  ? new data.Dictionary(...Object.entries(value).map(([key, v]) => ({key, value: toData(v)})))
  : new data.StringData(String(value));
function evaluate(source, context) {
  const expression = source.trim().replace(/^\$\{\{\s*|\s*\}\}$/g, '');
  const ast = new Parser(new Lexer(expression).lex().tokens, Object.keys(context), []).parse();
  return new Evaluator(ast, toData(context)).evaluate().coerceString();
}

test('only the gated workflow can publish; PR, main push and manual triggers remain', () => {
  const dir = new URL('../../.github/workflows/', import.meta.url);
  const publishers = readdirSync(dir).filter(name => /\.ya?ml$/.test(name))
    .filter(name => readFileSync(new URL(name, dir), 'utf8').includes('actions/deploy-pages@'));
  assert.deepEqual(publishers, ['tests.yml']);
  assert.deepEqual(Object.keys(workflow.on).sort(), ['pull_request', 'push', 'workflow_dispatch']);
  assert.deepEqual(workflow.on.push, {branches: ['main']});
  assert.deepEqual(workflow.on.pull_request, {branches: ['main']});
  assert.deepEqual(deploy.needs, ['regression', 'compatibility']);
  assert.ok(!regression['continue-on-error']);
  for (const command of ['npm ci', 'npm run test:ci', 'npm run test:unit',
    'npx playwright install --with-deps chromium', 'npm run test:browser']) {
    const step = regression.steps.find(step => step.run === command);
    assert.ok(step, `missing mandatory step: ${command}`);
    assert.ok(!step.if, `${command} must not be conditional`);
    assert.ok(!step['continue-on-error'], `${command} must fail the job`);
  }
});

// Evaluate the actual YAML expression with GitHub's expression library, not a
// second hand-written copy of the predicate. Covers both publishing entrypoints.
for (const event of ['push', 'workflow_dispatch', 'pull_request']) {
  for (const ref of ['refs/heads/main', 'refs/heads/feature', 'refs/pull/7/merge', 'refs/tags/v1']) {
    for (const result of ['success', 'failure', 'cancelled', 'skipped']) {
      test(`gate: ${event}, ${ref}, regression=${result}`, () => {
        const expected = result === 'success' && ref === 'refs/heads/main' && event !== 'pull_request';
        assert.equal(evaluate(deploy.if, {
          github: {event_name: event, ref}, needs: {regression: {result}, compatibility: {result: 'success'}},
        }), String(expected));
      });
    }
  }
}

test('test and deploy check out the same immutable event SHA; artifact is run/attempt scoped', () => {
  for (const job of [regression, compatibility, deploy]) {
    const checkout = job.steps.find(step => step.uses?.startsWith('actions/checkout@'));
    assert.equal(checkout.with.ref, '${{ github.sha }}');
    assert.equal(checkout.with['persist-credentials'], false);
  }
  const upload = deploy.steps.find(step => step.uses?.startsWith('actions/upload-pages-artifact@'));
  const publish = deploy.steps.find(step => step.uses?.startsWith('actions/deploy-pages@'));
  assert.equal(upload.with.path, 'dist');
  assert.equal(upload.with.name, 'github-pages-${{ github.run_id }}-${{ github.run_attempt }}');
  assert.equal(publish.with.artifact_name, upload.with.name);
});

test('write permissions are confined to serialized deployment; main runs cannot cancel publication', () => {
  assert.deepEqual(workflow.permissions, {contents: 'read'});
  assert.ok(!regression.permissions);
  assert.deepEqual(deploy.permissions, {contents: 'read', pages: 'write', 'id-token': 'write'});
  assert.equal(deploy.environment.name, 'github-pages');
  assert.deepEqual(deploy.concurrency, {group: 'pages', 'cancel-in-progress': false});
  for (const event of ['push', 'workflow_dispatch', 'pull_request']) {
    assert.equal(evaluate(workflow.concurrency['cancel-in-progress'], {
      github: {event_name: event},
    }), String(event === 'pull_request'));
  }
});

const guard = deploy.steps[0];
async function runGuard(head, sha, error) {
  const outputs = {};
  const execute = new (Object.getPrototypeOf(async function () {}).constructor)(
    'github', 'context', 'core', guard.with.script);
  await execute({rest: {git: {getRef: async args => {
    assert.deepEqual(args, {owner: 'owner', repo: 'repo', ref: 'heads/main'});
    if (error) throw error;
    return {data: {object: {sha: head}}};
  }}}}, {repo: {owner: 'owner', repo: 'repo'}, sha}, {
    setOutput: (key, value) => { outputs[key] = value; }, notice: () => {},
  });
  return outputs;
}

test('guard allows current SHA and skips stale/rerun SHA at every publication step', async () => {
  assert.equal(guard.id, 'current');
  for (const [head, sha, expected] of [['a', 'a', 'true'], ['b', 'a', 'false']]) {
    const outputs = await runGuard(head, sha);
    assert.equal(outputs.publish, expected);
    for (const step of deploy.steps.slice(1)) {
      assert.equal(evaluate(step.if, {steps: {current: {outputs}}}), expected);
      assert.ok(!step['continue-on-error']);
    }
  }
});

test('main ref lookup failure fails closed', async () => {
  await assert.rejects(runGuard('', 'a', new Error('API unavailable')), /API unavailable/);
});


for (const event of ['push', 'workflow_dispatch']) {
  for (const result of ['failure', 'cancelled', 'skipped']) {
    test(`compatibility gate: ${event}, compatibility=${result}`, () => {
      assert.equal(evaluate(deploy.if, {
        github: {event_name: event, ref: 'refs/heads/main'},
        needs: {regression: {result: 'success'}, compatibility: {result}},
      }), 'false');
    });
  }
}

test('both compatibility engines are mandatory, bounded and read-only', () => {
  assert.deepEqual(compatibility.strategy.matrix.browser, ['firefox', 'webkit']);
  assert.equal(compatibility.strategy['fail-fast'], false);
  assert.equal(compatibility['timeout-minutes'], 10);
  assert.ok(!compatibility['continue-on-error']);
  assert.ok(!compatibility.if);
  assert.ok(!compatibility.permissions);
  for (const command of ['npm ci',
    'npx playwright install --with-deps ${{ matrix.browser }}',
    'npm run test:compatibility -- --project=${{ matrix.browser }}']) {
    const step = compatibility.steps.find(step => step.run === command);
    assert.ok(step, `missing mandatory step: ${command}`);
    assert.ok(!step.if);
    assert.ok(!step['continue-on-error']);
  }
});
