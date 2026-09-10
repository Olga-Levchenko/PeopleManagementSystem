const CUSTOM_FIELD_QUERY_PREFIX = 'custom:';

export function parseCustomFieldFilters(
  query: Record<string, unknown>,
): Record<string, string> {
  const filters: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (!key.startsWith(CUSTOM_FIELD_QUERY_PREFIX)) {
      continue;
    }
    const raw: unknown = Array.isArray(value) ? value[0] : value;
    if (typeof raw === 'string' && raw.length > 0) {
      filters[key] = raw;
    }
  }
  return filters;
}
