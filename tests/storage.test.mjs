import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDriveMatterStorage,
  createLocalMatterStorage,
  createMockMatterStorage,
  createMatterStorageAdapter,
} from '../src/storage.mjs';

test('storage adapter factory defaults to safe mock mode without Peacock Drive IDs', async () => {
  const storage = createMatterStorageAdapter({ env: {} });
  assert.equal(storage.provider, 'mock');
  assert.equal(storage.mode, 'noop');

  const files = await storage.listMatterFiles({ id: 'Q1', displayName: 'Jane Doe — QDRO' });
  assert.deepEqual(files, []);

  const upload = await storage.requestUpload({ matter: { id: 'Q1' }, file: { name: 'Draft QDRO.docx' } });
  assert.equal(upload.ok, false);
  assert.equal(upload.noop, true);
  assert.equal(upload.reason, 'storage_provider_not_configured');
});

test('local storage adapter scopes list/download/upload requests to the selected matter only', async () => {
  const stored = [];
  const storage = createLocalMatterStorage({
    files: [
      { id: 'doc-q1', matterId: 'Q1', name: 'Q1 Draft.pdf', content: 'q1 private' },
      { id: 'doc-q2', matterId: 'Q2', name: 'Q2 Draft.pdf', content: 'q2 private' },
    ],
    persistFile: async (file) => { stored.push(file); return file; },
  });

  const q1Files = await storage.listMatterFiles({ id: 'Q1' });
  assert.deepEqual(q1Files.map((file) => file.id), ['doc-q1']);
  assert.equal(q1Files[0].source, 'local');

  const q2Download = await storage.requestDownload({ matter: { id: 'Q1' }, fileId: 'doc-q2' });
  assert.equal(q2Download.ok, false);
  assert.equal(q2Download.reason, 'file_not_found_for_matter');

  const upload = await storage.requestUpload({ matter: { id: 'Q1' }, file: { id: 'upload1', name: 'Plan.pdf', content: 'plan' } });
  assert.equal(upload.ok, true);
  assert.equal(upload.file.matterId, 'Q1');
  assert.equal(stored[0].matterId, 'Q1');
});

test('Drive storage adapter maps matter folders and never falls back to the root folder for matter files', async () => {
  const calls = [];
  const storage = createDriveMatterStorage({
    rootFolderId: 'root',
    listFiles: async (folderId) => {
      calls.push(['list', folderId]);
      return [{ id: 'doc1', name: 'Draft QDRO.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }];
    },
    downloadFile: async ({ fileId, folderId }) => ({ fileId, folderId, content: 'bytes' }),
    uploadFile: async ({ folderId, file }) => ({ id: 'drive-upload', folderId, name: file.name }),
  });

  const matter = { id: 'Q1', displayName: 'Jane Doe — QDRO', driveFolderId: 'folder-q1' };
  const files = await storage.listMatterFiles(matter);
  assert.deepEqual(calls, [['list', 'folder-q1']]);
  assert.equal(files[0].name, 'Draft QDRO.docx');
  assert.equal(files[0].source, 'google_drive');

  const download = await storage.requestDownload({ matter, fileId: 'doc1' });
  assert.deepEqual(download, { ok: true, provider: 'google_drive', fileId: 'doc1', folderId: 'folder-q1', content: 'bytes' });

  const upload = await storage.requestUpload({ matter, file: { name: 'Plan.pdf' } });
  assert.equal(upload.ok, true);
  assert.equal(upload.file.folderId, 'folder-q1');
});

test('Drive storage adapter creates a matter folder when configured and reports blocked when not', async () => {
  const noCreate = createDriveMatterStorage({ rootFolderId: 'root', listFiles: async () => [] });
  const blocked = await noCreate.ensureMatterFolder({ id: 'Q1', displayName: 'Jane Doe — QDRO' });
  assert.equal(blocked.created, false);
  assert.equal(blocked.blocked, 'createFolder adapter not configured');

  const createdNames = [];
  const withCreate = createDriveMatterStorage({
    rootFolderId: 'root',
    listFiles: async () => [],
    createFolder: async ({ parentFolderId, name }) => { createdNames.push({ parentFolderId, name }); return { id: 'folder-q1', name }; },
  });
  const created = await withCreate.ensureMatterFolder({ id: 'Q1', displayName: 'Jane Doe — QDRO' });
  assert.equal(created.created, true);
  assert.equal(created.folderId, 'folder-q1');
  assert.deepEqual(createdNames, [{ parentFolderId: 'root', name: 'Jane Doe — QDRO — Q1' }]);
});

test('configured live Drive mode uses a GOG command boundary instead of importing Peacock-specific IDs', async () => {
  const executed = [];
  const storage = createMatterStorageAdapter({
    env: { LEXYOS_STORAGE_PROVIDER: 'google_drive', LEXYOS_DRIVE_ROOT_FOLDER_ID: 'root-live', LEXYOS_GOG_ACCOUNT: 'team' },
    execGog: async (args) => { executed.push(args); return { files: [{ id: 'doc1', name: 'Live.pdf' }] }; },
  });

  assert.equal(storage.provider, 'google_drive');
  const files = await storage.listMatterFiles({ id: 'Q1', driveFolderId: 'folder-q1' });
  assert.equal(files[0].id, 'doc1');
  assert.deepEqual(executed[0], ['--account', 'team', 'drive', 'files', 'list', '--folder-id', 'folder-q1']);
});
