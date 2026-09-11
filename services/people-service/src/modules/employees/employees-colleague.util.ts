import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { EmployeeFieldCatalogEntry } from './employees.service';

export const COLLEAGUE_BROWSE_RESTRICTED_ERROR = 'COLLEAGUE_BROWSE_RESTRICTED';

export const COLLEAGUE_CATALOG_FIELDS: EmployeeFieldCatalogEntry[] = [
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
    key: 'workEmail',
    label: 'Work email',
    kind: 'stored',
    dataType: 'string',
    filterable: false,
    columnable: true,
  },
  {
    key: 'workPhone',
    label: 'Work phone',
    kind: 'stored',
    dataType: 'string',
    filterable: false,
    columnable: true,
  },
  {
    key: 'birthday',
    label: 'Birthday',
    kind: 'stored',
    dataType: 'string',
    filterable: false,
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
  {
    key: 'managerName',
    label: 'Manager',
    kind: 'stored',
    dataType: 'string',
    filterable: false,
    columnable: true,
  },
  {
    key: 'peoplePartnerName',
    label: 'People partner',
    kind: 'stored',
    dataType: 'string',
    filterable: false,
    columnable: true,
  },
  {
    key: 'leaveDates',
    label: 'Leave dates',
    kind: 'stored',
    dataType: 'string',
    filterable: false,
    columnable: true,
  },
  {
    key: 'projectName',
    label: 'Project',
    kind: 'stored',
    dataType: 'string',
    filterable: false,
    columnable: true,
  },
];

export const COLLEAGUE_DEFAULT_VISIBLE_COLUMN_KEYS = [
  'fullName',
  'position',
  'departmentName',
  'countryCity',
  'workEmail',
  'birthday',
  'startDate',
  'managerName',
  'peoplePartnerName',
  'leaveDates',
  'projectName',
];

export function throwColleagueBrowseRestricted(): never {
  throw new ForbiddenException({
    statusCode: 403,
    error: COLLEAGUE_BROWSE_RESTRICTED_ERROR,
    message:
      'This action is not available in colleague browse mode on All Employees.',
  });
}

export function assertColleagueCatalogAudience(
  listAudienceLevel: string,
): void {
  if (listAudienceLevel === 'colleague') {
    throwColleagueBrowseRestricted();
  }
}

export function assertColleagueListFilters(input: {
  departmentId?: string;
  yearsWithCompanyMin?: number;
  yearsWithCompanyMax?: number;
}): void {
  if (input.departmentId?.trim()) {
    throw new BadRequestException(
      'departmentId filter is not available in colleague browse mode.',
    );
  }
  if (
    input.yearsWithCompanyMin !== undefined ||
    input.yearsWithCompanyMax !== undefined
  ) {
    throw new BadRequestException(
      'yearsWithCompany filters are not available in colleague browse mode.',
    );
  }
}

export function formatBirthdayForList(
  month: number | null | undefined,
  day: number | null | undefined,
): string | null {
  if (month == null || day == null) {
    return null;
  }
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${mm}-${dd}`;
}

type LeaveRecord = { startDate: Date; endDate: Date };
type AssignmentRecord = {
  projectName: string;
  role: string | null;
  startDate: Date | null;
  endDate: Date | null;
};

function calendarDateOnly(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function formatDateRange(start: Date, end: Date): string {
  const startIso = start.toISOString().slice(0, 10);
  const endIso = end.toISOString().slice(0, 10);
  return `${startIso} – ${endIso}`;
}

export function selectLeaveDatesForList(
  leaves: readonly LeaveRecord[] | undefined,
  today: Date = new Date(),
): string | null {
  if (!leaves || leaves.length === 0) {
    return null;
  }

  const todayCal = calendarDateOnly(today);

  const active = leaves.filter((leave) => {
    const start = calendarDateOnly(leave.startDate);
    const end = calendarDateOnly(leave.endDate);
    return (
      start.getTime() <= todayCal.getTime() &&
      todayCal.getTime() <= end.getTime()
    );
  });
  if (active.length > 0) {
    const picked = active.reduce((latest, leave) =>
      leave.startDate.getTime() > latest.startDate.getTime() ? leave : latest,
    );
    return formatDateRange(picked.startDate, picked.endDate);
  }

  const future = leaves
    .filter(
      (leave) =>
        calendarDateOnly(leave.startDate).getTime() > todayCal.getTime(),
    )
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  if (future.length > 0) {
    const picked = future[0];
    return formatDateRange(picked.startDate, picked.endDate);
  }

  const past = leaves
    .filter(
      (leave) => calendarDateOnly(leave.endDate).getTime() < todayCal.getTime(),
    )
    .sort((a, b) => b.endDate.getTime() - a.endDate.getTime());
  if (past.length > 0) {
    const picked = past[0];
    return formatDateRange(picked.startDate, picked.endDate);
  }

  return null;
}

function assignmentCoversToday(
  assignment: AssignmentRecord,
  todayCal: Date,
): boolean {
  if (!assignment.startDate || !assignment.endDate) {
    return false;
  }
  const start = calendarDateOnly(assignment.startDate);
  const end = calendarDateOnly(assignment.endDate);
  return (
    start.getTime() <= todayCal.getTime() && todayCal.getTime() <= end.getTime()
  );
}

export function selectProjectNameForList(
  assignments: readonly AssignmentRecord[] | undefined,
  today: Date = new Date(),
): string | null {
  if (!assignments || assignments.length === 0) {
    return null;
  }

  const todayCal = calendarDateOnly(today);

  const active = assignments.filter((assignment) =>
    assignmentCoversToday(assignment, todayCal),
  );
  if (active.length > 0) {
    return [...active].sort((a, b) =>
      a.projectName.localeCompare(b.projectName),
    )[0].projectName;
  }

  const withStart = assignments
    .filter((assignment) => assignment.startDate != null)
    .sort(
      (a, b) => (b.startDate?.getTime() ?? 0) - (a.startDate?.getTime() ?? 0),
    );
  if (withStart.length > 0) {
    return withStart[0].projectName;
  }

  return [...assignments].sort((a, b) =>
    a.projectName.localeCompare(b.projectName),
  )[0].projectName;
}
