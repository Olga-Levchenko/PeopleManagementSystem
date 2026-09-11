export const EDITABLE_S1_FIELD_KEYS = new Set([
  'fullName',
  'position',
  'countryCity',
  'startDate',
]);

export const EDITABLE_S2_FIELD_KEYS = new Set([
  'personalPhone',
  'personalEmail',
  'residentialAddress',
]);

export const ORG_RELATIONSHIP_FIELD_KEYS = new Set([
  'departmentName',
  'managerName',
  'peoplePartnerName',
  'mentorName',
  'projectName',
]);

export const DERIVED_FIELD_KEYS = new Set(['yearsWithCompany']);

const CUSTOM_FIELD_KEY_PREFIX = 'custom:';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseCustomFieldKey(fieldKey: string): string | null {
  if (!fieldKey.startsWith(CUSTOM_FIELD_KEY_PREFIX)) {
    return null;
  }
  const definitionId = fieldKey.slice(CUSTOM_FIELD_KEY_PREFIX.length);
  if (!UUID_PATTERN.test(definitionId)) {
    return null;
  }
  return definitionId;
}

export function isMalformedFieldKey(fieldKey: string): boolean {
  if (!fieldKey || fieldKey.trim() === '') {
    return true;
  }
  if (fieldKey.startsWith(CUSTOM_FIELD_KEY_PREFIX)) {
    return parseCustomFieldKey(fieldKey) === null;
  }
  return false;
}
