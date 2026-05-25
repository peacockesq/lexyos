import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { appendAuditEvent, createInMemoryStore, createJsonFileStore, LEXY_COLLECTIONS, verifyAuditChain } from '../src/persistence.mjs';
import { createMatterRepository } from '../src/repository.mjs';

test('Lexy durable store exposes canonical PRD collections and persists matters', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lexyos-store-'));
  try {
    const storePath = join(dir, 'lexy.json');
    const store = createJsonFileStore({ path: storePath });
    for (const collection of ['matters', 'tasks', 'gates', 'auditEvents', 'agentRuns', 'corpusCitations']) assert.ok(LEXY_COLLECTIONS.includes(collection));
    const repo = createMatterRepository({ store });
    await repo.saveMatter({ matter_id: 'M1', tenantId: 'firm-a', client_display_name: 'Durable Client' });
    assert.equal((await repo.listMatters())[0].clientName, 'Durable Client');
    const raw = JSON.parse(await readFile(storePath, 'utf8'));
    assert.equal(raw.matters[0].matter_id, 'M1');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('audit events are hash chained and tamper detection fails closed', async () => {
  const store = createInMemoryStore();
  await appendAuditEvent(store, { actor: 'agent', actorType: 'agent', action: 'filing.prepared', matterId: 'M1', metadata: { packetId: 'p1' } });
  await appendAuditEvent(store, { actor: 'willie', actorType: 'human', action: 'gate.approved', matterId: 'M1', metadata: { gateId: 'g1' } });
  const events = await store.all('auditEvents');
  assert.equal(verifyAuditChain(events).ok, true);
  assert.equal(verifyAuditChain([{ ...events[0], action: 'filing.submitted' }, events[1]]).ok, false);
});
