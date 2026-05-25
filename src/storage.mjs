import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export function createMatterStorageAdapter({ env = process.env, store = null, execGog = defaultExecGog } = {}) {
  const provider = (env.LEXYOS_STORAGE_PROVIDER ?? env.STORAGE_PROVIDER ?? 'mock').toLowerCase();
  if (['local', 'json', 'files'].includes(provider)) {
    return createLocalMatterStorage({ store });
  }
  if (['google_drive', 'drive', 'gog'].includes(provider)) {
    const rootFolderId = env.LEXYOS_DRIVE_ROOT_FOLDER_ID ?? env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
    if (!rootFolderId) return createMockMatterStorage({ reason: 'storage_provider_not_configured' });
    return createDriveMatterStorage({
      rootFolderId,
      account: env.LEXYOS_GOG_ACCOUNT ?? env.GOG_ACCOUNT ?? 'team',
      execGog,
    });
  }
  return createMockMatterStorage({ provider, reason: 'storage_provider_not_configured' });
}

export function createMockMatterStorage({ provider = 'mock', reason = 'storage_provider_not_configured' } = {}) {
  return {
    provider,
    mode: 'noop',
    async listMatterFiles() { return []; },
    folderStatus(matter) {
      return {
        provider,
        mode: 'noop',
        matterId: matter?.id ?? null,
        displayName: matterDisplayName(matter),
        folderId: matterFolderId(matter),
        needsFolder: true,
        configured: false,
      };
    },
    async ensureMatterFolder(matter) {
      return { created: false, folderId: matterFolderId(matter), blocked: reason };
    },
    async requestDownload() {
      return { ok: false, noop: true, reason };
    },
    async requestUpload() {
      return { ok: false, noop: true, reason };
    },
  };
}

export function createLocalMatterStorage({ files = null, store = null, persistFile = null } = {}) {
  async function allFiles() {
    if (store?.all) return store.all('documents');
    return files ?? [];
  }

  async function saveFile(file) {
    if (store?.upsert) return store.upsert('documents', file);
    if (typeof persistFile === 'function') return persistFile(file);
    if (Array.isArray(files)) {
      const index = files.findIndex((item) => item.id === file.id);
      if (index === -1) files.push(file);
      else files[index] = { ...files[index], ...file };
    }
    return file;
  }

  async function fileForMatter(matter, fileId) {
    const matterId = matter?.id;
    return (await allFiles()).find((file) => file.id === fileId && file.matterId === matterId && file.kind !== 'artifact') ?? null;
  }

  return {
    provider: 'local',
    mode: 'read_write',
    async listMatterFiles(matter) {
      const matterId = matter?.id;
      if (!matterId) return [];
      return (await allFiles())
        .filter((file) => file.matterId === matterId && file.kind !== 'artifact')
        .map(normalizeLocalFile);
    },
    folderStatus(matter) {
      return {
        provider: 'local',
        mode: 'read_write',
        matterId: matter?.id ?? null,
        displayName: matterDisplayName(matter),
        folderId: matter?.localFolderId ?? matter?.folderId ?? matter?.id ?? null,
        needsFolder: false,
        configured: true,
      };
    },
    async ensureMatterFolder(matter) {
      return { created: false, folderId: matter?.localFolderId ?? matter?.folderId ?? matter?.id ?? null };
    },
    async requestDownload({ matter, fileId } = {}) {
      const file = await fileForMatter(matter, fileId);
      if (!file) return { ok: false, reason: 'file_not_found_for_matter' };
      return { ok: true, provider: 'local', fileId, file, content: file.content ?? null };
    },
    async requestUpload({ matter, file } = {}) {
      if (!matter?.id) return { ok: false, reason: 'matter_required' };
      if (!file?.name && !file?.id) return { ok: false, reason: 'file_required' };
      const row = { kind: 'file', ...file, id: file.id ?? `file_${Date.now()}`, matterId: matter.id };
      const saved = await saveFile(row);
      return { ok: true, provider: 'local', file: normalizeLocalFile(saved) };
    },
  };
}

export function createDriveMatterStorage({ rootFolderId, listFiles, createFolder, downloadFile, uploadFile, account = 'team', execGog } = {}) {
  if (!rootFolderId) throw new Error('rootFolderId is required');
  const gog = execGog ? createGogDriveBoundary({ account, execGog }) : null;
  const listFilesFn = listFiles ?? gog?.listFiles;
  const createFolderFn = createFolder ?? gog?.createFolder;
  const downloadFileFn = downloadFile ?? gog?.downloadFile;
  const uploadFileFn = uploadFile ?? gog?.uploadFile;
  if (typeof listFilesFn !== 'function') throw new Error('listFiles function is required');

  return {
    provider: 'google_drive',
    mode: 'read_write',
    async listMatterFiles(matter) {
      const folderId = matterFolderId(matter);
      if (!folderId) return [];
      const files = await listFilesFn(folderId);
      return (files ?? []).map(normalizeDriveFile);
    },

    folderStatus(matter) {
      return {
        provider: 'google_drive',
        mode: 'read_write',
        rootFolderId,
        matterId: matter?.id ?? null,
        displayName: matterDisplayName(matter),
        driveFolderId: matterFolderId(matter),
        folderId: matterFolderId(matter),
        needsFolder: !matterFolderId(matter),
        configured: true,
      };
    },

    async ensureMatterFolder(matter) {
      const folderId = matterFolderId(matter);
      if (folderId) return { created: false, folderId };
      if (typeof createFolderFn !== 'function') {
        return { created: false, folderId: null, blocked: 'createFolder adapter not configured' };
      }
      const folder = await createFolderFn({
        parentFolderId: rootFolderId,
        name: `${matterDisplayName(matter)} — ${matter.id}`,
        matter,
      });
      return { created: true, folderId: folder.id, folder };
    },

    async requestDownload({ matter, fileId } = {}) {
      const folderId = matterFolderId(matter);
      if (!folderId) return { ok: false, reason: 'matter_folder_not_configured' };
      if (!fileId) return { ok: false, reason: 'file_required' };
      if (typeof downloadFileFn !== 'function') return { ok: false, reason: 'download_adapter_not_configured' };
      const result = await downloadFileFn({ fileId, folderId, matter });
      return { ok: true, provider: 'google_drive', fileId, folderId, ...result };
    },

    async requestUpload({ matter, file } = {}) {
      const folderId = matterFolderId(matter);
      if (!folderId) return { ok: false, reason: 'matter_folder_not_configured' };
      if (!file?.name && !file?.id) return { ok: false, reason: 'file_required' };
      if (typeof uploadFileFn !== 'function') return { ok: false, reason: 'upload_adapter_not_configured' };
      const uploaded = await uploadFileFn({ folderId, matter, file });
      return { ok: true, provider: 'google_drive', file: normalizeDriveFile({ ...uploaded, folderId: uploaded.folderId ?? folderId }) };
    },
  };
}

export function createGogDriveBoundary({ account = 'team', execGog = defaultExecGog } = {}) {
  return {
    async listFiles(folderId) {
      const result = await execGog(['--account', account, 'drive', 'files', 'list', '--folder-id', folderId]);
      return result.files ?? result.items ?? result;
    },
    async createFolder({ parentFolderId, name }) {
      return execGog(['--account', account, 'drive', 'folders', 'create', '--parent-id', parentFolderId, '--name', name]);
    },
    async downloadFile({ fileId, folderId }) {
      return execGog(['--account', account, 'drive', 'files', 'download', '--file-id', fileId, '--folder-id', folderId]);
    },
    async uploadFile({ folderId, file }) {
      const args = ['--account', account, 'drive', 'files', 'upload', '--folder-id', folderId, '--name', file.name];
      if (file.path) args.push('--path', file.path);
      if (file.content) args.push('--content', file.content);
      return execGog(args);
    },
  };
}

export function normalizeDriveFile(file) {
  return {
    id: file.id,
    name: file.name,
    mimeType: file.mimeType ?? 'application/octet-stream',
    modifiedTime: file.modifiedTime ?? null,
    webViewLink: file.webViewLink ?? driveWebLink(file.id),
    folderId: file.folderId ?? file.parents?.[0] ?? null,
    source: 'google_drive',
  };
}

export function normalizeLocalFile(file) {
  return {
    id: file.id,
    matterId: file.matterId,
    name: file.name,
    mimeType: file.mimeType ?? 'application/octet-stream',
    modifiedTime: file.modifiedTime ?? file.updatedAt ?? null,
    content: file.content ?? null,
    path: file.path ?? null,
    source: 'local',
    kind: file.kind ?? 'file',
  };
}

function matterFolderId(matter) {
  return matter?.driveFolderId ?? matter?.drive_folder_id ?? matter?.folderId ?? matter?.folder_id ?? null;
}

function matterDisplayName(matter) {
  return matter?.displayName ?? matter?.clientName ?? matter?.client_display_name ?? matter?.name ?? 'Unknown matter';
}

function driveWebLink(id) {
  return id ? `https://drive.google.com/file/d/${encodeURIComponent(id)}/view` : null;
}

async function defaultExecGog(args) {
  const { stdout } = await execFileAsync('gog', args, { maxBuffer: 10 * 1024 * 1024 });
  const trimmed = stdout.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    return { stdout: trimmed };
  }
}
