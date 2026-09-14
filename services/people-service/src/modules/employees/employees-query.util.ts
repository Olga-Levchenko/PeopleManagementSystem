import { BadRequestException } from '@nestjs/common';

const CUSTOM_FIELD_QUERY_PREFIX = 'custom:';

export function parseCustomFieldFilters(
  query: Record<string, unknown>,
): Record<string, string> {
  const filters: Record<string, string> = {};
  for (const [rawKey, value] of Object.entries(query)) {
    let key = rawKey;
    try {
      key = decodeURIComponent(rawKey);
    } catch {
      // Keep the original key so malformed unrelated query keys are ignored.
    }
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

export function stripCustomFieldQueryParams(
  query: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [rawKey, value] of Object.entries(query)) {
    let key = rawKey;
    try {
      key = decodeURIComponent(rawKey);
    } catch {
      // Preserve malformed unrelated query keys so DTO validation rejects them.
    }
    if (!key.startsWith(CUSTOM_FIELD_QUERY_PREFIX)) {
      sanitized[rawKey] = value;
    }
  }
  return sanitized;
}

export function parseExportColumnKeys(columnsParam: unknown): string[] {
  if (typeof columnsParam !== 'string' || columnsParam.trim().length === 0) {
    throw new BadRequestException('columns must not be empty.');
  }

  const keys = columnsParam
    .split(',')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  if (keys.length === 0) {
    throw new BadRequestException('columns must not be empty.');
  }

  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) {
      throw new BadRequestException(`Duplicate column '${key}' in columns.`);
    }
    seen.add(key);
  }

  return keys;
}
