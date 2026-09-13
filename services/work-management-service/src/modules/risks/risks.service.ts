import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { RiskLevel, RiskRecord } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { AccessRoleResolutionPort } from '../management-notes/access-control-client';
import type { CreateRiskRecordDto } from './dto/create-risk-record.dto';
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
    await this.assertCanAccessSubject(
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
    await this.assertCanAccessSubject(
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

  private async assertCanAccessSubject(
    viewerPersonId: string,
    subjectPersonId: string,
    subjectToken: string,
  ): Promise<void> {
    if (viewerPersonId === subjectPersonId) {
      throw new ForbiddenException();
    }

    const hasPermission =
      await this.permissionsCheck.hasCreateEditRisksPermission(subjectToken);
    if (!hasPermission) {
      throw new ForbiddenException();
    }

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

function utcCalendarDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function utcDateOnly(value: Date): Date {
  return new Date(`${utcCalendarDate(value)}T00:00:00.000Z`);
}
