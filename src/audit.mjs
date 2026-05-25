export function createAuditLog({ clock = () => new Date() } = {}) {
  const events = [];
  return {
    append(event) {
      const record = freezeAuditEvent({ ...event, id: event.id ?? `aud_${events.length + 1}`, occurredAt: event.occurredAt ?? clock().toISOString() });
      validateAuditEvent(record);
      events.push(record);
      return record;
    },
    list(filter = {}) {
      return events.filter((event) => matchesFilter(event, filter));
    },
    forMatter(matterId) {
      return this.list({ matterId });
    },
  };
}

export function validateAuditEvent(event) {
  for (const key of ['id', 'actor', 'action', 'source', 'occurredAt']) {
    if (!event[key]) throw new Error(`audit event missing ${key}`);
  }
  if (event.matterId === '') throw new Error('audit matterId cannot be empty');
  return true;
}

export function freezeAuditEvent(event) {
  return Object.freeze({
    id: event.id,
    occurredAt: event.occurredAt,
    actor: event.actor,
    actorType: event.actorType ?? 'system',
    action: event.action,
    source: event.source,
    matterId: event.matterId ?? null,
    metadata: Object.freeze({ ...(event.metadata ?? {}) }),
  });
}

function matchesFilter(event, filter) {
  return Object.entries(filter).every(([key, value]) => value === undefined || event[key] === value);
}
