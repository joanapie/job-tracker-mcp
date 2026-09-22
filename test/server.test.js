// Start the real server and call its tools the same way an AI agent would.
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

let client, dir, dataFile;

// Each test gets its own empty data file, so tests never touch real data.
beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'job-tracker-'));
  dataFile = join(dir, 'apps.json');
  client = new Client({ name: 'test', version: '1.0.0' });
  await client.connect(new StdioClientTransport({
    command: 'node',
    args: ['server.js'],
    env: { ...process.env, JOB_TRACKER_FILE: dataFile },
  }));
});

afterEach(async () => {
  await client.close();
  rmSync(dir, { recursive: true, force: true });
});

const call = async (name, args = {}) => {
  const res = await client.callTool({ name, arguments: args });
  return res.isError ? res : JSON.parse(res.content[0].text);
};

test('has three tools', async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), ['add_application', 'list_applications', 'update_application']);
});

test('starts empty when there is no data file yet', async () => {
  const { count } = await call('list_applications');
  assert.equal(count, 0);
});

test('adds an application with sensible defaults', async () => {
  const { added } = await call('add_application', { company: 'Organimi', role: 'Full Stack Developer' });
  assert.equal(added.id, 1);
  assert.equal(added.status, 'applied');
  assert.match(added.dateAdded, /^\d{4}-\d{2}-\d{2}$/);
});

test('ids keep increasing', async () => {
  await call('add_application', { company: 'A', role: 'Dev' });
  const { added } = await call('add_application', { company: 'B', role: 'Dev' });
  assert.equal(added.id, 2);
});

test('filters by status and by part of a company name', async () => {
  await call('add_application', { company: 'Blair Health', role: 'Full-Stack Engineer' });
  await call('add_application', { company: 'Konrad', role: 'Full Stack Developer', status: 'interviewing' });
  assert.equal((await call('list_applications', { status: 'interviewing' })).applications[0].company, 'Konrad');
  assert.equal((await call('list_applications', { company: 'blair' })).count, 1);
});

test('update changes status and appends dated notes', async () => {
  await call('add_application', { company: 'Konrad', role: 'Dev', notes: 'Applied via website' });
  const { updated } = await call('update_application', { id: 1, status: 'interviewing', note: 'Phone screen Friday' });
  assert.equal(updated.status, 'interviewing');
  assert.match(updated.notes, /^Applied via website\n\[\d{4}-\d{2}-\d{2}\] Phone screen Friday$/);
});

test('update can correct location and other details', async () => {
  await call('add_application', { company: 'Konrad', role: 'Dev', location: 'Toronto', url: 'https://example.com' });
  const { updated } = await call('update_application', { id: 1, location: 'QC', role: 'Full Stack Developer', url: '' });
  assert.equal(updated.location, 'QC');
  assert.equal(updated.role, 'Full Stack Developer');
  assert.equal(updated.url, '');
  assert.equal(updated.company, 'Konrad');
  assert.equal(updated.status, 'applied');
});

test('updating an unknown id returns a helpful error', async () => {
  const res = await call('update_application', { id: 99, status: 'offer' });
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /list_applications/);
});

test('reports how many days since the last update', async () => {
  const old = [{ id: 1, company: 'Old Co', role: 'Dev', status: 'applied', notes: '', dateAdded: '2026-01-01', lastUpdated: '2026-01-01' }];
  writeFileSync(dataFile, JSON.stringify(old));
  const { applications } = await call('list_applications');
  assert.ok(applications[0].daysSinceUpdate > 200);
});

test('rejects a status that is not in the list', async () => {
  const res = await client.callTool({ name: 'add_application', arguments: { company: 'X', role: 'Y', status: 'ghosted' } });
  assert.equal(res.isError, true);
});
