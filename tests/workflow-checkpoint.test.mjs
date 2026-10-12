import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const workflow = readFileSync(new URL('../.github/workflows/radar.yml', import.meta.url), 'utf8');
const match = workflow.match(/          script: \|\n((?:            .*\n)+)/);
assert.ok(match, 'Checkpoint action script must be present');
const source = match[1].split('\n').map(line => line.slice(12)).join('\n');

async function run(artifacts, initialize = 'false', legacy = []) {
  const outputs = {};
  const context = {
    context: { repo: { owner: 'test', repo: 'repo' }, ref: 'refs/heads/main', runId: 100 },
    process: { env: { INITIALIZE_STATE: initialize } },
    core: { setOutput: (key, value) => { outputs[key] = value; }, warning: () => {} },
    github: { rest: { actions: {
      listArtifactsForRepo: async ({ name }) => ({
        data: { artifacts: name === 'radar-checkpoint' ? artifacts : legacy },
      }),
    } } },
  };
  await vm.runInNewContext('(async () => {\n' + source + '\n})()', context);
  return outputs;
}

const artifact = (id, runId, expired = false, branch = 'main') => ({
  id, expired, workflow_run: { id: runId, head_branch: branch },
});

test('Missing checkpoint blocks unattended initialization', async () => {
  await assert.rejects(run([]), /No hay checkpoint durable/);
});

test('Expired checkpoint blocks resets even if initialization was requested', async () => {
  await assert.rejects(run([artifact(9, 90, true)], 'true'), /Checkpoint expirado/);
});

test('Checkpoint selection uses the newest previous run from the same branch', async () => {
  const outputs = await run([
    artifact(1, 80), artifact(4, 95), artifact(5, 100), artifact(6, 98, false, 'other'),
  ]);
  assert.equal(outputs.run_id, '95');
});

test('Explicit first initialization restores legacy candidates before collection', async () => {
  const outputs = await run([], 'true', [artifact(2, 82), artifact(4, 90)]);
  assert.equal(outputs.legacy_run_id, '90');
  assert.ok(workflow.indexOf('python scripts/import_artifacts.py') < workflow.indexOf('run: python scripts/pipeline.py'));
});
