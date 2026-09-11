import {
  selectLeaveDatesForList,
  selectProjectNameForList,
} from '../employees-colleague.util';

describe('employees-colleague.util list projection', () => {
  const today = new Date('2026-06-05T12:00:00.000Z');

  it('selectLeaveDatesForList picks active leave without leave type in output', () => {
    const value = selectLeaveDatesForList(
      [
        {
          startDate: new Date('2026-06-01T00:00:00.000Z'),
          endDate: new Date('2026-06-10T00:00:00.000Z'),
        },
      ],
      today,
    );

    expect(value).toBe('2026-06-01 – 2026-06-10');
  });

  it('selectProjectNameForList returns project name only', () => {
    const value = selectProjectNameForList(
      [
        {
          projectName: 'Beta',
          role: 'Member',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: new Date('2026-12-31T00:00:00.000Z'),
        },
        {
          projectName: 'Alpha',
          role: 'Lead',
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: new Date('2026-12-31T00:00:00.000Z'),
        },
      ],
      today,
    );

    expect(value).toBe('Alpha');
  });

  it('selectLeaveDatesForList picks nearest future leave when none active', () => {
    const value = selectLeaveDatesForList(
      [
        {
          startDate: new Date('2026-08-01T00:00:00.000Z'),
          endDate: new Date('2026-08-10T00:00:00.000Z'),
        },
        {
          startDate: new Date('2026-07-15T00:00:00.000Z'),
          endDate: new Date('2026-07-20T00:00:00.000Z'),
        },
      ],
      today,
    );

    expect(value).toBe('2026-07-15 – 2026-07-20');
  });

  it('selectLeaveDatesForList picks most recently ended leave when none active or future', () => {
    const value = selectLeaveDatesForList(
      [
        {
          startDate: new Date('2026-01-01T00:00:00.000Z'),
          endDate: new Date('2026-01-10T00:00:00.000Z'),
        },
        {
          startDate: new Date('2026-02-01T00:00:00.000Z'),
          endDate: new Date('2026-02-15T00:00:00.000Z'),
        },
      ],
      today,
    );

    expect(value).toBe('2026-02-01 – 2026-02-15');
  });

  it('selectLeaveDatesForList returns null when no leaves exist', () => {
    expect(selectLeaveDatesForList([], today)).toBeNull();
    expect(selectLeaveDatesForList(undefined, today)).toBeNull();
  });

  it('selectProjectNameForList returns null when no assignments exist', () => {
    expect(selectProjectNameForList([], today)).toBeNull();
    expect(selectProjectNameForList(undefined, today)).toBeNull();
  });
});
