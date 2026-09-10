import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  deriveAudienceFromResolution,
  grantsSectionAccess,
  grantsSectionWriteAccess,
  resolveS16WriteAccess,
  type CustomFieldAudienceLevel,
} from '../profile/profile-audience.util';
import { EDITABLE_S1_FIELD_KEYS } from '../profile/profile-field-keys.util';
import type {
  AccessRoleResolution,
  AccessRoleResolutionPort,
} from '../profile/profile.ports';
import { NEITHER_LINE_RESOLUTION } from '../profile/profile.ports';
import { canSeeCustomField } from '../profile/profile.service';
import {
  assertColumnKeysInCatalog,
  assertCustomFieldFiltersInCatalog,
  assertVisibleColumnKeys,
  assertYearsFilterRange,
  buildCatalogKeySets,
  resolveApplicableFilters,
  type SavedViewFilters,
} from './employees-list-config.validator';
import type { ListEmployeesQueryDto } from './employees.dto';
import {
  buildEmployeesExportWorkbook,
  EMPLOYEES_EXPORT_FILENAME,
} from './employees-export.util';

export type EmployeeFieldDataType = 'string' | 'number' | 'date' | 'boolean';

export interface EmployeeFieldCatalogEntry {
  key: string;
  label: string;
  kind: 'stored' | 'derived' | 'custom';
  dataType: EmployeeFieldDataType;
  filterable: boolean;
  columnable: boolean;
}

export interface EmployeeFieldCatalogResponse {
  fields: EmployeeFieldCatalogEntry[];
  listAudienceLevel: CustomFieldAudienceLevel;
}

export interface EmployeeListRow {
  personId: string;
  values: Record<string, string | number | null>;
  editableFields: string[];
}

export interface EmployeeListResponse {
  items: EmployeeListRow[];
  page: number;
  pageSize: number;
  totalCount: number;
}

const STORED_CATALOG_FIELDS: EmployeeFieldCatalogEntry[] = [
  {
    key: 'fullName',
    label: 'Full name',
    kind: 'stored',
    dataType: 'string',
    filterable: false,
    columnable: true,
  },
  {
    key: 'position',
    label: 'Position',
    kind: 'stored',
    dataType: 'string',
    filterable: false,
    columnable: true,
  },
  {
    key: 'departmentName',
    label: 'Department',
    kind: 'stored',
    dataType: 'string',
    filterable: false,
    columnable: true,
  },
  {
    key: 'countryCity',
    label: 'Country / city',
    kind: 'stored',
    dataType: 'string',
    filterable: true,
    columnable: true,
  },
  {
    key: 'startDate',
    label: 'Start date',
    kind: 'stored',
    dataType: 'date',
    filterable: false,
    columnable: true,
  },
];

const DERIVED_CATALOG_FIELDS: EmployeeFieldCatalogEntry[] = [
  {
    key: 'yearsWithCompany',
    label: 'Years with company',
    kind: 'derived',
    dataType: 'number',
    filterable: true,
    columnable: true,
  },
];

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
const ACS_BATCH_SUBJECT_LIMIT = 500;
const EXPORT_INTERNAL_PAGE_SIZE = 100;

const PERSON_LIST_SELECT = {
  id: true,
  fullName: true,
  position: true,
  countryCity: true,
  startDate: true,
  department: { select: { name: true } },
  customFieldValues: {
    select: {
      value: true,
      definition: {
        select: {
          id: true,
          name: true,
          visibility: true,
          isActive: true,
        },
      },
    },
  },
} as const;

type PersonListRecord = {
  id: string;
  fullName: string;
  position: string | null;
  countryCity: string | null;
  startDate: Date | null;
  department: { name: string } | null;
  customFieldValues: Array<{
    value: string;
    definition: {
      id: string;
      name: string;
      visibility: string;
      isActive: boolean;
    };
  }>;
};

export function computeYearsWithCompany(startDate: Date | null): number | null {
  if (!startDate) {
    return null;
  }
  const elapsedMs = Date.now() - startDate.getTime();
  if (elapsedMs < 0) {
    return 0;
  }
  return Math.floor(elapsedMs / MS_PER_YEAR);
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('AccessRoleResolutionPort')
    private readonly accessRoleResolution: AccessRoleResolutionPort,
  ) {}

  async getFieldCatalog(
    viewerPersonId: string,
  ): Promise<EmployeeFieldCatalogResponse> {
    const catalogAudience =
      await this.resolveCatalogCustomFieldAudience(viewerPersonId);

    const customDefinitions = await this.prisma.customFieldDefinition.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, visibility: true, dataType: true },
    });

    const customFields: EmployeeFieldCatalogEntry[] = customDefinitions
      .filter((definition) =>
        canSeeCustomField(definition.visibility, catalogAudience),
      )
      .map((definition) => ({
        key: `custom:${definition.id}`,
        label: definition.name,
        kind: 'custom' as const,
        dataType: this.mapCustomFieldDataType(definition.dataType),
        filterable: true,
        columnable: true,
      }));

    return {
      fields: [
        ...STORED_CATALOG_FIELDS,
        ...DERIVED_CATALOG_FIELDS,
        ...customFields,
      ],
      listAudienceLevel: catalogAudience,
    };
  }

  async listEmployees(
    viewerPersonId: string,
    query: ListEmployeesQueryDto,
    customFieldFilters: Record<string, string> = {},
  ): Promise<EmployeeListResponse> {
    await this.assertCustomFieldFiltersAllowed(
      viewerPersonId,
      customFieldFilters,
    );
    assertYearsFilterRange(
      query.yearsWithCompanyMin,
      query.yearsWithCompanyMax,
    );

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;

    if (Object.keys(customFieldFilters).length > 0) {
      return this.listEmployeesWithCustomFieldFilters(
        viewerPersonId,
        query,
        customFieldFilters,
        page,
        pageSize,
      );
    }

    const where = this.buildWhereClause(query, customFieldFilters);

    const [totalCount, people] = await this.prisma.$transaction([
      this.prisma.person.count({ where }),
      this.prisma.person.findMany({
        where,
        orderBy: { fullName: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: PERSON_LIST_SELECT,
      }),
    ]);

    const items = await this.projectPeopleToListRows(
      viewerPersonId,
      people as PersonListRecord[],
    );

    return { items, page, pageSize, totalCount };
  }

  async exportEmployeesToXlsx(
    viewerPersonId: string,
    query: ListEmployeesQueryDto,
    customFieldFilters: Record<string, string>,
    columnKeys: string[],
  ): Promise<{ buffer: Buffer; filename: string }> {
    const catalog = await this.getFieldCatalog(viewerPersonId);
    assertVisibleColumnKeys(columnKeys);
    const { columnableKeys } = buildCatalogKeySets(catalog.fields);
    assertColumnKeysInCatalog(columnKeys, columnableKeys);

    const applicable = await this.resolveExportFilters(
      query,
      customFieldFilters,
    );

    await this.assertCustomFieldFiltersAllowed(
      viewerPersonId,
      applicable.customFieldFilters,
    );
    assertYearsFilterRange(
      applicable.query.yearsWithCompanyMin,
      applicable.query.yearsWithCompanyMax,
    );

    const rows = await this.fetchAllListRowsForExport(
      viewerPersonId,
      applicable.query,
      applicable.customFieldFilters,
    );

    const buffer = await buildEmployeesExportWorkbook(
      rows,
      columnKeys,
      catalog.fields,
    );

    return { buffer, filename: EMPLOYEES_EXPORT_FILENAME };
  }

  private async resolveExportFilters(
    query: ListEmployeesQueryDto,
    customFieldFilters: Record<string, string>,
  ): Promise<{
    query: ListEmployeesQueryDto;
    customFieldFilters: Record<string, string>;
  }> {
    const filters: SavedViewFilters = {
      countryCity: query.countryCity,
      departmentId: query.departmentId,
      yearsWithCompanyMin: query.yearsWithCompanyMin,
      yearsWithCompanyMax: query.yearsWithCompanyMax,
      customFieldFilters:
        Object.keys(customFieldFilters).length > 0
          ? customFieldFilters
          : undefined,
    };

    const applicableFilters = await resolveApplicableFilters(
      filters,
      (departmentId) =>
        this.prisma.department.findUnique({
          where: { id: departmentId },
          select: { id: true },
        }),
      (definitionId) =>
        this.prisma.customFieldDefinition.findUnique({
          where: { id: definitionId },
          select: { id: true, isActive: true },
        }),
    );

    return {
      query: {
        countryCity: applicableFilters.countryCity,
        departmentId: applicableFilters.departmentId,
        yearsWithCompanyMin: applicableFilters.yearsWithCompanyMin,
        yearsWithCompanyMax: applicableFilters.yearsWithCompanyMax,
      },
      customFieldFilters: applicableFilters.customFieldFilters ?? {},
    };
  }

  private async fetchAllListRowsForExport(
    viewerPersonId: string,
    query: ListEmployeesQueryDto,
    customFieldFilters: Record<string, string>,
  ): Promise<EmployeeListRow[]> {
    if (Object.keys(customFieldFilters).length > 0) {
      return this.fetchAllListRowsWithCustomFieldFilters(
        viewerPersonId,
        query,
        customFieldFilters,
      );
    }

    const where = this.buildWhereClause(query, customFieldFilters);
    const totalCount = await this.prisma.person.count({ where });
    const allRows: EmployeeListRow[] = [];

    for (
      let page = 1;
      (page - 1) * EXPORT_INTERNAL_PAGE_SIZE < totalCount;
      page++
    ) {
      const people = (await this.prisma.person.findMany({
        where,
        orderBy: { fullName: 'asc' },
        skip: (page - 1) * EXPORT_INTERNAL_PAGE_SIZE,
        take: EXPORT_INTERNAL_PAGE_SIZE,
        select: PERSON_LIST_SELECT,
      })) as PersonListRecord[];

      if (people.length === 0) {
        break;
      }

      const items = await this.projectPeopleToListRows(viewerPersonId, people);
      allRows.push(...items);
    }

    return allRows;
  }

  private async fetchAllListRowsWithCustomFieldFilters(
    viewerPersonId: string,
    query: ListEmployeesQueryDto,
    customFieldFilters: Record<string, string>,
  ): Promise<EmployeeListRow[]> {
    const where = this.buildWhereClause(query, customFieldFilters);
    const filterDefinitions =
      await this.loadCustomFieldFilterDefinitions(customFieldFilters);

    const candidates = (await this.prisma.person.findMany({
      where,
      orderBy: { fullName: 'asc' },
      select: PERSON_LIST_SELECT,
    })) as PersonListRecord[];

    const resolutions = await this.resolveBatchChunked(
      viewerPersonId,
      candidates.map((person) => person.id),
    );

    const audienceVisibleCandidates = candidates.filter((person) => {
      const resolution = resolutions.get(person.id) ?? NEITHER_LINE_RESOLUTION;
      const audience = deriveAudienceFromResolution(
        resolution,
        viewerPersonId,
        person.id,
      );
      return this.subjectPassesCustomFieldFilters(
        audience,
        filterDefinitions,
        customFieldFilters,
      );
    });

    const allRows: EmployeeListRow[] = [];
    for (
      let index = 0;
      index < audienceVisibleCandidates.length;
      index += EXPORT_INTERNAL_PAGE_SIZE
    ) {
      const slice = audienceVisibleCandidates.slice(
        index,
        index + EXPORT_INTERNAL_PAGE_SIZE,
      );
      const items = await this.projectPeopleToListRows(
        viewerPersonId,
        slice,
        resolutions,
      );
      allRows.push(...items);
    }

    return allRows;
  }

  private async listEmployeesWithCustomFieldFilters(
    viewerPersonId: string,
    query: ListEmployeesQueryDto,
    customFieldFilters: Record<string, string>,
    page: number,
    pageSize: number,
  ): Promise<EmployeeListResponse> {
    const where = this.buildWhereClause(query, customFieldFilters);
    const filterDefinitions =
      await this.loadCustomFieldFilterDefinitions(customFieldFilters);

    const candidates = (await this.prisma.person.findMany({
      where,
      orderBy: { fullName: 'asc' },
      select: PERSON_LIST_SELECT,
    })) as PersonListRecord[];

    const subjectIds = candidates.map((person) => person.id);
    const resolutions = await this.resolveBatchChunked(
      viewerPersonId,
      subjectIds,
    );

    const audienceVisibleCandidates = candidates.filter((person) => {
      const resolution = resolutions.get(person.id) ?? NEITHER_LINE_RESOLUTION;
      const audience = deriveAudienceFromResolution(
        resolution,
        viewerPersonId,
        person.id,
      );
      return this.subjectPassesCustomFieldFilters(
        audience,
        filterDefinitions,
        customFieldFilters,
      );
    });

    const totalCount = audienceVisibleCandidates.length;
    const pageSlice = audienceVisibleCandidates.slice(
      (page - 1) * pageSize,
      page * pageSize,
    );
    const items = await this.projectPeopleToListRows(
      viewerPersonId,
      pageSlice,
      resolutions,
    );

    return { items, page, pageSize, totalCount };
  }

  private async projectPeopleToListRows(
    viewerPersonId: string,
    people: PersonListRecord[],
    resolutions?: Map<string, AccessRoleResolution>,
  ): Promise<EmployeeListRow[]> {
    const resolvedBatch =
      resolutions ??
      (await this.accessRoleResolution.resolveBatch(
        viewerPersonId,
        people.map((person) => person.id),
      ));

    return people.map((person) => {
      const resolution =
        resolvedBatch.get(person.id) ?? NEITHER_LINE_RESOLUTION;
      const audience = deriveAudienceFromResolution(
        resolution,
        viewerPersonId,
        person.id,
      );

      const values: Record<string, string | number | null> = {};
      if (grantsSectionAccess(audience.s1)) {
        values.fullName = person.fullName;
        values.position = person.position;
        values.departmentName = person.department?.name ?? null;
        values.countryCity = person.countryCity;
        values.startDate = person.startDate
          ? person.startDate.toISOString().slice(0, 10)
          : null;
        values.yearsWithCompany = computeYearsWithCompany(person.startDate);
      }

      for (const customFieldValue of person.customFieldValues) {
        const definition = customFieldValue.definition;
        if (
          !definition.isActive ||
          !canSeeCustomField(
            definition.visibility,
            audience.customFieldAudienceLevel,
          )
        ) {
          continue;
        }
        values[`custom:${definition.id}`] = customFieldValue.value;
      }

      const editableFields = this.computeEditableFields(
        viewerPersonId,
        person.id,
        resolution,
        audience,
        person.customFieldValues,
      );

      return { personId: person.id, values, editableFields };
    });
  }

  private computeEditableFields(
    viewerPersonId: string,
    personId: string,
    resolution: AccessRoleResolution,
    audience: ReturnType<typeof deriveAudienceFromResolution>,
    customFieldValues: PersonListRecord['customFieldValues'],
  ): string[] {
    if (viewerPersonId === personId) {
      return [];
    }

    const editable: string[] = [];

    if (grantsSectionWriteAccess(audience.s1)) {
      for (const key of EDITABLE_S1_FIELD_KEYS) {
        editable.push(key);
      }
    }

    if (grantsSectionWriteAccess(resolveS16WriteAccess(resolution))) {
      for (const customFieldValue of customFieldValues) {
        const definition = customFieldValue.definition;
        if (
          definition.isActive &&
          canSeeCustomField(
            definition.visibility,
            audience.customFieldAudienceLevel,
          )
        ) {
          editable.push(`custom:${definition.id}`);
        }
      }
    }

    return editable;
  }

  private mapCustomFieldDataType(dataType: string): EmployeeFieldDataType {
    switch (dataType) {
      case 'NUMBER':
        return 'number';
      case 'DATE':
        return 'date';
      case 'BOOLEAN':
        return 'boolean';
      default:
        return 'string';
    }
  }

  private subjectPassesCustomFieldFilters(
    audience: ReturnType<typeof deriveAudienceFromResolution>,
    filterDefinitions: Map<string, { visibility: string }>,
    customFieldFilters: Record<string, string>,
  ): boolean {
    for (const fieldKey of Object.keys(customFieldFilters)) {
      const definition = filterDefinitions.get(fieldKey);
      if (
        !definition ||
        !canSeeCustomField(
          definition.visibility,
          audience.customFieldAudienceLevel,
        )
      ) {
        return false;
      }
    }
    return true;
  }

  private async loadCustomFieldFilterDefinitions(
    customFieldFilters: Record<string, string>,
  ): Promise<Map<string, { visibility: string }>> {
    const definitionIds = Object.keys(customFieldFilters).map((fieldKey) =>
      fieldKey.replace(/^custom:/, ''),
    );
    const definitions = await this.prisma.customFieldDefinition.findMany({
      where: { id: { in: definitionIds }, isActive: true },
      select: { id: true, visibility: true },
    });

    const byKey = new Map<string, { visibility: string }>();
    for (const definition of definitions) {
      byKey.set(`custom:${definition.id}`, {
        visibility: definition.visibility,
      });
    }
    return byKey;
  }

  private async resolveBatchChunked(
    viewerPersonId: string,
    subjectPersonIds: readonly string[],
  ): Promise<Map<string, AccessRoleResolution>> {
    const merged = new Map<string, AccessRoleResolution>();
    for (
      let index = 0;
      index < subjectPersonIds.length;
      index += ACS_BATCH_SUBJECT_LIMIT
    ) {
      const chunk = subjectPersonIds.slice(
        index,
        index + ACS_BATCH_SUBJECT_LIMIT,
      );
      const batch = await this.accessRoleResolution.resolveBatch(
        viewerPersonId,
        chunk,
      );
      for (const [subjectId, resolution] of batch) {
        merged.set(subjectId, resolution);
      }
    }
    return merged;
  }

  private async assertCustomFieldFiltersAllowed(
    viewerPersonId: string,
    customFieldFilters: Record<string, string>,
  ): Promise<void> {
    if (Object.keys(customFieldFilters).length === 0) {
      return;
    }

    const catalog = await this.getFieldCatalog(viewerPersonId);
    const { filterableCustomKeys } = buildCatalogKeySets(catalog.fields);
    assertCustomFieldFiltersInCatalog(customFieldFilters, filterableCustomKeys);
  }

  private buildWhereClause(
    query: ListEmployeesQueryDto,
    customFieldFilters: Record<string, string>,
  ): Prisma.PersonWhereInput {
    const where: Prisma.PersonWhereInput = {};
    const andFilters: Prisma.PersonWhereInput[] = [];

    if (query.departmentId) {
      where.departmentId = query.departmentId;
    }
    if (query.countryCity) {
      where.countryCity = {
        equals: query.countryCity,
        mode: 'insensitive',
      };
    }

    const startDateFilter = this.startDateRangeForYearsFilter(
      query.yearsWithCompanyMin,
      query.yearsWithCompanyMax,
    );
    if (startDateFilter) {
      where.startDate = startDateFilter;
    }

    for (const [fieldKey, filterValue] of Object.entries(customFieldFilters)) {
      const definitionId = fieldKey.replace(/^custom:/, '');
      andFilters.push({
        customFieldValues: {
          some: {
            definitionId,
            value: { equals: filterValue, mode: 'insensitive' },
            definition: { isActive: true },
          },
        },
      });
    }

    if (andFilters.length > 0) {
      where.AND = andFilters;
    }

    return where;
  }

  private startDateRangeForYearsFilter(
    minYears?: number,
    maxYears?: number,
  ): Prisma.DateTimeNullableFilter | undefined {
    if (minYears === undefined && maxYears === undefined) {
      return undefined;
    }

    const now = Date.now();
    const filter: Prisma.DateTimeNullableFilter = { not: null };

    if (maxYears !== undefined) {
      const earliestStart = new Date(now - (maxYears + 1) * MS_PER_YEAR);
      filter.gte = earliestStart;
    }
    if (minYears !== undefined) {
      const latestStart = new Date(now - minYears * MS_PER_YEAR);
      filter.lte = latestStart;
    }

    return filter;
  }

  private async resolveCatalogCustomFieldAudience(
    viewerPersonId: string,
  ): Promise<CustomFieldAudienceLevel> {
    const resolution = await this.accessRoleResolution.resolve(
      viewerPersonId,
      viewerPersonId,
    );
    const selfAudience = deriveAudienceFromResolution(
      resolution,
      viewerPersonId,
      viewerPersonId,
    );
    if (selfAudience.customFieldAudienceLevel === 'management') {
      return 'management';
    }

    const candidateIds =
      await this.collectCatalogAudienceCandidateSubjectIds(viewerPersonId);
    if (candidateIds.length === 0) {
      return selfAudience.customFieldAudienceLevel;
    }

    const resolutions = await this.resolveBatchChunked(
      viewerPersonId,
      candidateIds,
    );
    for (const subjectId of candidateIds) {
      const resolution = resolutions.get(subjectId) ?? NEITHER_LINE_RESOLUTION;
      const audience = deriveAudienceFromResolution(
        resolution,
        viewerPersonId,
        subjectId,
      );
      if (audience.customFieldAudienceLevel === 'management') {
        return 'management';
      }
    }

    return selfAudience.customFieldAudienceLevel;
  }

  private async collectCatalogAudienceCandidateSubjectIds(
    viewerPersonId: string,
  ): Promise<string[]> {
    const viewerProjects = await this.prisma.personProjectAssignment.findMany({
      where: { personId: viewerPersonId },
      select: { projectName: true },
      take: 10,
    });
    const projectNames = [
      ...new Set(viewerProjects.map((assignment) => assignment.projectName)),
    ];

    const [reports, partnered, deptMembers, projectTeammates, orgSample] =
      await Promise.all([
        this.prisma.person.findMany({
          where: { managerId: viewerPersonId },
          select: { id: true },
          take: 10,
        }),
        this.prisma.person.findMany({
          where: { peoplePartnerId: viewerPersonId },
          select: { id: true },
          take: 10,
        }),
        this.prisma.person.findMany({
          where: { department: { managerId: viewerPersonId } },
          select: { id: true },
          take: 10,
        }),
        projectNames.length > 0
          ? this.prisma.personProjectAssignment.findMany({
              where: {
                projectName: { in: projectNames },
                personId: { not: viewerPersonId },
              },
              select: { personId: true },
              distinct: ['personId'],
              take: 10,
            })
          : Promise.resolve([]),
        this.prisma.person.findMany({
          where: { id: { not: viewerPersonId } },
          select: { id: true },
          take: 25,
          orderBy: { fullName: 'asc' },
        }),
      ]);

    const ids = new Set<string>();
    for (const row of [
      ...reports,
      ...partnered,
      ...deptMembers,
      ...orgSample,
    ]) {
      ids.add(row.id);
    }
    for (const assignment of projectTeammates) {
      ids.add(assignment.personId);
    }
    return [...ids];
  }
}
