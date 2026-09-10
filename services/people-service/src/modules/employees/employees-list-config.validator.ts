import { BadRequestException } from '@nestjs/common';
import type { EmployeeFieldCatalogEntry } from './employees.service';

export interface SavedViewFilters {
  countryCity?: string;
  departmentId?: string;
  yearsWithCompanyMin?: number;
  yearsWithCompanyMax?: number;
  customFieldFilters?: Record<string, string>;
}

export interface SavedViewConfiguration {
  visibleColumnKeys: string[];
  filters: SavedViewFilters;
}

export function assertYearsFilterRange(
  minYears?: number,
  maxYears?: number,
): void {
  if (minYears !== undefined && maxYears !== undefined && minYears > maxYears) {
    throw new BadRequestException(
      'yearsWithCompanyMin cannot exceed yearsWithCompanyMax.',
    );
  }
}

export function assertVisibleColumnKeys(visibleColumnKeys: string[]): void {
  if (visibleColumnKeys.length === 0) {
    throw new BadRequestException('visibleColumnKeys must not be empty.');
  }
}

export function buildCatalogKeySets(
  catalogFields: EmployeeFieldCatalogEntry[],
) {
  const filterableCustomKeys = new Set(
    catalogFields
      .filter((field) => field.filterable && field.kind === 'custom')
      .map((field) => field.key),
  );
  const columnableKeys = new Set(
    catalogFields.filter((field) => field.columnable).map((field) => field.key),
  );
  return { filterableCustomKeys, columnableKeys };
}

export function assertCustomFieldFiltersInCatalog(
  customFieldFilters: Record<string, string>,
  filterableCustomKeys: Set<string>,
): void {
  for (const fieldKey of Object.keys(customFieldFilters)) {
    if (!filterableCustomKeys.has(fieldKey)) {
      throw new BadRequestException(
        `Filter '${fieldKey}' is not available for this viewer.`,
      );
    }
  }
}

export function assertColumnKeysInCatalog(
  visibleColumnKeys: string[],
  columnableKeys: Set<string>,
): void {
  for (const key of visibleColumnKeys) {
    if (!columnableKeys.has(key)) {
      throw new BadRequestException(
        `Column '${key}' is not available for this viewer.`,
      );
    }
  }
}

export function assertSavedViewConfiguration(
  configuration: SavedViewConfiguration,
  catalogFields: EmployeeFieldCatalogEntry[],
): void {
  assertVisibleColumnKeys(configuration.visibleColumnKeys);
  assertYearsFilterRange(
    configuration.filters.yearsWithCompanyMin,
    configuration.filters.yearsWithCompanyMax,
  );

  const { filterableCustomKeys, columnableKeys } =
    buildCatalogKeySets(catalogFields);
  assertColumnKeysInCatalog(configuration.visibleColumnKeys, columnableKeys);
  assertCustomFieldFiltersInCatalog(
    configuration.filters.customFieldFilters ?? {},
    filterableCustomKeys,
  );
}

export async function assertDepartmentExistsForSave(
  departmentId: string | undefined,
  findDepartment: (id: string) => Promise<{ id: string } | null>,
): Promise<void> {
  if (!departmentId) {
    return;
  }
  const department = await findDepartment(departmentId);
  if (!department) {
    throw new BadRequestException(
      `Department '${departmentId}' was not found.`,
    );
  }
}

export async function assertCustomDefinitionsActiveForSave(
  customFieldFilters: Record<string, string> | undefined,
  findDefinition: (
    id: string,
  ) => Promise<{ id: string; isActive: boolean } | null>,
): Promise<void> {
  if (!customFieldFilters) {
    return;
  }
  for (const fieldKey of Object.keys(customFieldFilters)) {
    const definitionId = fieldKey.replace(/^custom:/, '');
    const definition = await findDefinition(definitionId);
    if (!definition || !definition.isActive) {
      throw new BadRequestException(
        `Filter '${fieldKey}' references an inactive or unknown custom field.`,
      );
    }
  }
}

export async function resolveApplicableFilters(
  filters: SavedViewFilters,
  findDepartment: (id: string) => Promise<{ id: string } | null>,
  findDefinition: (
    id: string,
  ) => Promise<{ id: string; isActive: boolean } | null>,
): Promise<SavedViewFilters> {
  const applicable: SavedViewFilters = { ...filters };

  if (applicable.departmentId) {
    const department = await findDepartment(applicable.departmentId);
    if (!department) {
      delete applicable.departmentId;
    }
  }

  if (applicable.customFieldFilters) {
    const cleaned: Record<string, string> = {};
    for (const [fieldKey, value] of Object.entries(
      applicable.customFieldFilters,
    )) {
      const definitionId = fieldKey.replace(/^custom:/, '');
      const definition = await findDefinition(definitionId);
      if (definition?.isActive) {
        cleaned[fieldKey] = value;
      }
    }
    applicable.customFieldFilters = cleaned;
  }

  return applicable;
}

export function parseSavedViewConfiguration(
  value: unknown,
): SavedViewConfiguration {
  if (!value || typeof value !== 'object') {
    throw new BadRequestException('configuration must be an object.');
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.visibleColumnKeys)) {
    throw new BadRequestException(
      'configuration.visibleColumnKeys is required.',
    );
  }
  if (!record.filters || typeof record.filters !== 'object') {
    throw new BadRequestException('configuration.filters is required.');
  }
  const filters = record.filters as Record<string, unknown>;
  const customFieldFilters =
    filters.customFieldFilters &&
    typeof filters.customFieldFilters === 'object' &&
    !Array.isArray(filters.customFieldFilters)
      ? (filters.customFieldFilters as Record<string, string>)
      : undefined;

  return {
    visibleColumnKeys: record.visibleColumnKeys as string[],
    filters: {
      countryCity:
        typeof filters.countryCity === 'string'
          ? filters.countryCity
          : undefined,
      departmentId:
        typeof filters.departmentId === 'string'
          ? filters.departmentId
          : undefined,
      yearsWithCompanyMin:
        typeof filters.yearsWithCompanyMin === 'number'
          ? filters.yearsWithCompanyMin
          : undefined,
      yearsWithCompanyMax:
        typeof filters.yearsWithCompanyMax === 'number'
          ? filters.yearsWithCompanyMax
          : undefined,
      customFieldFilters,
    },
  };
}
