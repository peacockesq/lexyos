import { normalizeMatter } from './matters.mjs';

export function createMatterRepository({ sources = [], store = null } = {}) {
  return {
    async listMatters() {
      const byId = new Map();
      if (store) {
        for (const row of await store.all('matters')) {
          const matter = normalizeMatter(row, row.source ?? 'store');
          byId.set(matter.id, matter);
        }
      }
      for (const source of sources) {
        const rows = await source.listMatters();
        for (const row of rows ?? []) {
          const matter = normalizeMatter(row, source.name);
          byId.set(matter.id, matter);
        }
      }
      return [...byId.values()];
    },
    async saveMatter(row) {
      if (!store) throw new Error('matter repository has no durable store');
      const matter = normalizeMatter(row, row.source ?? 'store');
      await store.upsert('matters', { ...row, id: matter.id, matter_id: matter.id, tenantId: matter.tenantId, source: row.source ?? 'store' });
      return matter;
    },
  };
}

export function createStaticMatterSource(name, rows) {
  return {
    name,
    async listMatters() {
      return rows;
    },
  };
}

export function createNocoDbSource({ baseUrl, tableId, token, fetchImpl = fetch }) {
  return {
    name: 'nocodb',
    async listMatters() {
      if (!baseUrl || !tableId || !token) return [];
      const url = `${baseUrl.replace(/\/$/, '')}/api/v2/tables/${encodeURIComponent(tableId)}/records?limit=1000`;
      const response = await fetchImpl(url, { headers: { 'xc-token': token } });
      if (!response.ok) throw new Error(`NocoDB matter load failed: ${response.status}`);
      const data = await response.json();
      return data.list ?? data.records ?? data;
    },
  };
}

export function createWebhookIntakeSource({ endpoint, fetchImpl = fetch }) {
  return {
    name: 'intake',
    async listMatters() {
      if (!endpoint) return [];
      const response = await fetchImpl(endpoint);
      if (!response.ok) throw new Error(`Intake matter load failed: ${response.status}`);
      const data = await response.json();
      return Array.isArray(data) ? data : data.matters ?? [];
    },
  };
}
