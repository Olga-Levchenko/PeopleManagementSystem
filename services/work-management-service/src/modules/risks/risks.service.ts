import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { RiskLevel, RiskRecord } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  AccessRoleResolution,
  AccessRoleResolutionPort,
} from '../management-notes/access-control-client';
import type { CreateRiskRecordDto } from './dto/create-risk-record.dto';
import type { RiskDashboardQueryDto } from './dto/risk-dashboard-query.dto';
import type { RisksPermissionsCheckPort } from './permissions-client';

export type TrendDirection = 'up' | 'down' | null;

export interface RiskRecordView {
  id: string;
  subjectPersonId: string;
  authorPersonId: string;
  level: RiskLevel;
  description: string;
  details: string | null;
  recordedAt: Date;
  trendDirection: TrendDirection;
  createdAt: Date;
}

export interface RiskSummaryView {
  currentLevel: RiskLevel | null;
  isActive: boolean;
  recordedAt: Date | null;
}

export interface RiskHistoryView {
  summary: RiskSummaryView;
  records: RiskRecordView[];
  canAppend: boolean;
}

export interface RiskDashboardView {
  counts: Record<RiskLevel | 'activeCount', number>;
  rows: {
    personId: string;
    severity: RiskLevel;
    recordedAt: Date;
    trendDirection: TrendDirection;
  }[];
  nextCursor: string | null;
}

const RISK_LEVEL_RANK: Record<RiskLevel, number> = {
  low: 0,
  need_attention: 1,
  medium: 2,
  high: 3,
  leaver: 4,
};

@Injectable()
export class RisksService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject('RisksPermissionsCheckPort')
    private readonly permissionsCheck: RisksPermissionsCheckPort,
    @Inject('AccessRoleResolutionPort')
    private readonly accessRoleResolution: AccessRoleResolutionPort,
  ) {}

  async appendRiskRecord(
    viewerPersonId: string,
    dto: CreateRiskRecordDto,
    subjectToken: string,
  ): Promise<RiskRecordView> {
    viewerPersonId = viewerPersonId.toLowerCase();
    const subjectPersonId = dto.subjectPersonId.toLowerCase();
    await this.assertCanAppendSubject(
      viewerPersonId,
      subjectPersonId,
      subjectToken,
    );

    const recordedAt = this.resolveRecordedAt(dto.recordedAt);
    if (this.isFutureUtcDate(recordedAt)) {
      throw new BadRequestException();
    }

    const row = await this.prisma.riskRecord.create({
      data: {
        subjectPersonId,
        authorPersonId: viewerPersonId,
        level: dto.level,
        description: dto.description,
        details: dto.details ?? null,
        recordedAt,
      },
    });

    const existingRows = await this.prisma.riskRecord.findMany({
      where: { subjectPersonId },
      orderBy: [{ recordedAt: 'asc' }, { createdAt: 'asc' }],
    });
    const trendMap = this.buildTrendDirectionMap(existingRows);
    return this.toView(row, trendMap.get(row.id) ?? null);
  }

  async getRiskHistory(
    viewerPersonId: string,
    subjectPersonId: string,
    subjectToken: string,
  ): Promise<RiskHistoryView> {
    viewerPersonId = viewerPersonId.toLowerCase();
    subjectPersonId = subjectPersonId.toLowerCase();
    await this.assertCanReadSubject(
      viewerPersonId,
      subjectPersonId,
      subjectToken,
    );

    const rows = await this.prisma.riskRecord.findMany({
      where: { subjectPersonId },
      orderBy: [{ recordedAt: 'asc' }, { createdAt: 'asc' }],
    });

    const trendMap = this.buildTrendDirectionMap(rows);
    const recordsDesc = [...rows]
      .sort((a, b) => this.compareRecordsDesc(a, b))
      .map((row) => this.toView(row, trendMap.get(row.id) ?? null));

    return {
      summary: this.buildSummary(rows),
      records: recordsDesc,
      canAppend: await this.canAppendAfterRead(subjectToken),
    };
  }

  async getDashboard(
    viewerPersonId: string,
    query: RiskDashboardQueryDto,
    subjectToken: string,
  ): Promise<RiskDashboardView> {
    viewerPersonId = viewerPersonId.toLowerCase();
    if (
      !(await this.permissionsCheck.hasViewDashboardPermission?.(subjectToken))
    )
      throw new ForbiddenException();
    const records = await this.prisma.riskRecord.findMany({
      orderBy: [
        { recordedAt: 'desc' },
        { createdAt: 'desc' },
        { subjectPersonId: 'asc' },
      ],
    });
    const byPerson = new Map<string, RiskRecord[]>();
    for (const record of records) {
      const id = record.subjectPersonId.toLowerCase();
      if (id === viewerPersonId) continue;
      const bucket = byPerson.get(id) ?? [];
      bucket.push(record);
      byPerson.set(id, bucket);
    }
    const candidateIds = [...byPerson.keys()];
    const access = new Map<string, AccessRoleResolution>();
    for (let index = 0; index < candidateIds.length; index += 500) {
      const ids = candidateIds.slice(index, index + 500);
      const batch = await this.accessRoleResolution.resolveBatch?.(
        viewerPersonId,
        ids,
        subjectToken,
      );
      if (!batch || batch.size !== ids.length) throw new ForbiddenException();
      for (const id of ids) {
        const resolution = batch.get(id);
        if (!resolution) throw new ForbiddenException();
        access.set(id, resolution);
      }
    }
    const current = [...byPerson.entries()]
      .flatMap(([personId, history]) => {
        const resolution = access.get(personId);
        if (
          !resolution ||
          !(
            resolution.reportingLine ||
            resolution.projectLine ||
            resolution.peoplePartnerLine ||
            resolution.fullProfileAccessLine
          )
        )
          return [];
        const chronological = [...history].sort(
          (a, b) =>
            a.recordedAt.getTime() - b.recordedAt.getTime() ||
            a.createdAt.getTime() - b.createdAt.getTime(),
        );
        const latest = chronological[chronological.length - 1];
        const previous = chronological[chronological.length - 2];
        return [
          {
            personId,
            severity: latest.level,
            recordedAt: latest.recordedAt,
            createdAt: latest.createdAt,
            trendDirection: this.computeTrendDirection(
              latest.level,
              previous?.level,
            ),
          },
        ];
      })
      .filter((row) => !query.severity || row.severity === query.severity);
    current.sort(
      (a, b) =>
        RISK_LEVEL_RANK[b.severity] - RISK_LEVEL_RANK[a.severity] ||
        b.recordedAt.getTime() - a.recordedAt.getTime() ||
        b.createdAt.getTime() - a.createdAt.getTime() ||
        a.personId.localeCompare(b.personId),
    );
    const counts: Record<RiskLevel | 'activeCount', number> = {
      low: 0,
      need_attention: 0,
      medium: 0,
      high: 0,
      leaver: 0,
      activeCount: 0,
    };
    for (const row of current) {
      counts[row.severity] += 1;
      if (row.severity !== 'low') counts.activeCount += 1;
    }
    const cursor = query.cursor
      ? decodeDashboardCursor(query.cursor)
      : undefined;
    const afterCursor = cursor
      ? current.filter((row) => compareDashboardRows(row, cursor) > 0)
      : current;
    const page = afterCursor.slice(0, query.pageSize);
    const last = page[page.length - 1];
    return {
      counts,
      rows: page.map(({ personId, severity, recordedAt, trendDirection }) => ({
        personId,
        severity,
        recordedAt,
        trendDirection,
      })),
      nextCursor:
        last && afterCursor.length > page.length
          ? encodeDashboardCursor(last)
          : null,
    };
  }

  computeTrendDirection(
    currentLevel: RiskLevel,
    previousLevel: RiskLevel | undefined,
  ): TrendDirection {
    if (previousLevel === undefined) {
      return null;
    }
    const currentRank = RISK_LEVEL_RANK[currentLevel];
    const previousRank = RISK_LEVEL_RANK[previousLevel];
    if (currentRank === previousRank) {
      return null;
    }
    return currentRank > previousRank ? 'up' : 'down';
  }

  buildSummary(
    rows: Pick<RiskRecord, 'level' | 'recordedAt' | 'createdAt'>[],
  ): RiskSummaryView {
    if (rows.length === 0) {
      return {
        currentLevel: null,
        isActive: false,
        recordedAt: null,
      };
    }

    const current = [...rows].sort((a, b) => this.compareRecordsDesc(a, b))[0];
    return {
      currentLevel: current.level,
      isActive: current.level !== 'low',
      recordedAt: current.recordedAt,
    };
  }

  private async assertCanAppendSubject(
    viewerPersonId: string,
    subjectPersonId: string,
    subjectToken: string,
  ): Promise<void> {
    this.assertNotSelf(viewerPersonId, subjectPersonId);

    const hasPermission =
      await this.permissionsCheck.hasCreateEditRisksPermission(subjectToken);
    if (!hasPermission) {
      throw new ForbiddenException();
    }

    await this.assertQualifyingLine(viewerPersonId, subjectPersonId, subjectToken);
  }

  private async canAppendAfterRead(subjectToken: string): Promise<boolean> {
    try {
      return await this.permissionsCheck.hasCreateEditRisksPermission(
        subjectToken,
      );
    } catch {
      return false;
    }
  }

  private async assertCanReadSubject(
    viewerPersonId: string,
    subjectPersonId: string,
    subjectToken: string,
  ): Promise<void> {
    this.assertNotSelf(viewerPersonId, subjectPersonId);
    await this.assertQualifyingLine(viewerPersonId, subjectPersonId, subjectToken);
  }

  private assertNotSelf(viewerPersonId: string, subjectPersonId: string): void {
    if (viewerPersonId === subjectPersonId) {
      throw new ForbiddenException();
    }
  }

  private async assertQualifyingLine(
    viewerPersonId: string,
    subjectPersonId: string,
    subjectToken: string,
  ): Promise<void> {
    const resolution = await this.accessRoleResolution.resolve(
      viewerPersonId,
      subjectPersonId,
      subjectToken,
    );
    const hasQualifyingLine =
      resolution.reportingLine ||
      resolution.peoplePartnerLine ||
      resolution.projectLine ||
      resolution.fullProfileAccessLine;
    if (!hasQualifyingLine) {
      throw new ForbiddenException();
    }
  }

  private buildTrendDirectionMap(
    rowsAsc: RiskRecord[],
  ): Map<string, TrendDirection> {
    const trendMap = new Map<string, TrendDirection>();
    for (let index = 0; index < rowsAsc.length; index += 1) {
      const row = rowsAsc[index];
      const previous = index > 0 ? rowsAsc[index - 1] : undefined;
      trendMap.set(
        row.id,
        this.computeTrendDirection(row.level, previous?.level),
      );
    }
    return trendMap;
  }

  private resolveRecordedAt(value: string | undefined): Date {
    if (value) {
      return new Date(`${value}T00:00:00.000Z`);
    }
    return utcDateOnly(new Date());
  }

  private isFutureUtcDate(value: Date): boolean {
    const today = utcCalendarDate(new Date());
    const candidate = utcCalendarDate(value);
    return candidate > today;
  }

  private compareRecordsDesc(
    a: Pick<RiskRecord, 'recordedAt' | 'createdAt'>,
    b: Pick<RiskRecord, 'recordedAt' | 'createdAt'>,
  ): number {
    const recordedDiff = b.recordedAt.getTime() - a.recordedAt.getTime();
    if (recordedDiff !== 0) {
      return recordedDiff;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  }

  private toView(
    row: RiskRecord,
    trendDirection: TrendDirection,
  ): RiskRecordView {
    return {
      id: row.id,
      subjectPersonId: row.subjectPersonId,
      authorPersonId: row.authorPersonId,
      level: row.level,
      description: row.description,
      details: row.details,
      recordedAt: row.recordedAt,
      trendDirection,
      createdAt: row.createdAt,
    };
  }
}

type DashboardCursor = {
  severity: RiskLevel;
  recordedAt: string;
  createdAt: string;
  personId: string;
};
function encodeDashboardCursor(row: {
  severity: RiskLevel;
  recordedAt: Date;
  createdAt: Date;
  personId: string;
}): string {
  return Buffer.from(
    JSON.stringify({
      severity: row.severity,
      recordedAt: row.recordedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
      personId: row.personId,
    }),
  ).toString('base64url');
}
function decodeDashboardCursor(value: string): DashboardCursor {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    ) as DashboardCursor;
    if (
      !parsed ||
      !['low', 'need_attention', 'medium', 'high', 'leaver'].includes(
        parsed.severity,
      ) ||
      !Date.parse(parsed.recordedAt) ||
      !Date.parse(parsed.createdAt) ||
      typeof parsed.personId !== 'string'
    )
      throw new Error();
    return parsed;
  } catch {
    throw new BadRequestException();
  }
}
function compareDashboardRows(
  row: {
    severity: RiskLevel;
    recordedAt: Date;
    createdAt: Date;
    personId: string;
  },
  cursor: DashboardCursor,
): number {
  const rank = RISK_LEVEL_RANK[cursor.severity] - RISK_LEVEL_RANK[row.severity];
  if (rank) return rank;
  const date = new Date(cursor.recordedAt).getTime() - row.recordedAt.getTime();
  if (date) return date;
  const created =
    new Date(cursor.createdAt).getTime() - row.createdAt.getTime();
  if (created) return created;
  return row.personId.localeCompare(cursor.personId);
}

function utcCalendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function utcDateOnly(value: Date): Date {
  return new Date(`${utcCalendarDate(value)}T00:00:00.000Z`);
}
