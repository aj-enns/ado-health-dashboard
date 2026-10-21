export const API_URL = 'https://status.dev.azure.com/_apis/status/health?api-version=7.1-preview.1';
export const PORTAL_URL = 'https://status.dev.azure.com/';
export const STALE_MS = 40 * 60 * 1000;
export const HEALTH = ['unknown', 'unhealthy', 'degraded', 'advisory', 'healthy'];

export function health(value) {
  return HEALTH.includes(value) ? value : 'unknown';
}

function text(value, field) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2000) {
    throw new Error(`Invalid API field: ${field}`);
  }
  return value;
}

export function normalize(payload) {
  if (!payload || !payload.status || !Array.isArray(payload.services) || !payload.services.length) {
    throw new Error('Invalid API response: expected status and nonempty services');
  }
  const ids = new Set();
  const services = payload.services.map(service => {
    const id = text(service.id, 'service.id');
    if (ids.has(id)) throw new Error('Duplicate service ID');
    ids.add(id);
    if (!Array.isArray(service.geographies) || !service.geographies.length) {
      throw new Error(`Missing geographies for ${id}`);
    }
    const regions = new Set();
    return {
      id,
      geographies: service.geographies.map(geography => {
        const geographyId = text(geography.id, 'geography.id');
        if (regions.has(geographyId)) throw new Error('Duplicate geography ID');
        regions.add(geographyId);
        return {
          id: geographyId,
          name: text(geography.name, 'geography.name'),
          health: health(geography.health)
        };
      })
    };
  });
  const sourceUpdatedAt = payload.lastUpdated == null ? null : payload.lastUpdated;
  if (sourceUpdatedAt !== null && (typeof sourceUpdatedAt !== 'string' || !Number.isFinite(Date.parse(sourceUpdatedAt)))) {
    throw new Error('Invalid API lastUpdated timestamp');
  }
  return {
    status: { health: health(payload.status.health), message: text(payload.status.message, 'status.message') },
    sourceUpdatedAt,
    services
  };
}

export function emptySnapshot(message = 'No collection has been published yet.') {
  return {
    schemaVersion: 1,
    source: API_URL,
    collectedAt: null,
    ok: false,
    error: message,
    sourceUpdatedAt: null,
    status: { health: 'unknown', message: 'Current service health is unavailable.' },
    services: []
  };
}

export function validateSnapshot(value) {
  if (!value || value.schemaVersion !== 1 || typeof value.ok !== 'boolean') {
    throw new Error('Unsupported snapshot format');
  }
  if (value.collectedAt !== null && (typeof value.collectedAt !== 'string' || !Number.isFinite(Date.parse(value.collectedAt)))) {
    throw new Error('Invalid collection timestamp');
  }
  if (!value.ok) {
    return { ...emptySnapshot(text(value.error, 'error')), collectedAt: value.collectedAt };
  }
  if (value.collectedAt === null) throw new Error('Successful snapshot lacks collection timestamp');
  const normalized = normalize({
    status: value.status,
    services: value.services,
    lastUpdated: value.sourceUpdatedAt
  });
  return { schemaVersion: 1, source: API_URL, ok: true, error: null, collectedAt: value.collectedAt, ...normalized };
}

export function freshness(snapshot, now = Date.now()) {
  if (!snapshot.ok) return 'unavailable';
  const age = now - Date.parse(snapshot.collectedAt);
  if (!Number.isFinite(age) || age < -60_000 || age >= STALE_MS) return 'stale';
  return 'fresh';
}

export function selectCells(snapshot, serviceId = '', geographyId = '') {
  return snapshot.services.flatMap(service =>
    service.geographies.filter(region => (!serviceId || service.id === serviceId) && (!geographyId || region.id === geographyId))
      .map(region => ({ service: service.id, ...region }))
  );
}
