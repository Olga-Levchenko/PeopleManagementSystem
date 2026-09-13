import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateRiskRecordDto } from '../dto/create-risk-record.dto';

describe('CreateRiskRecordDto calendar date validation', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const body = {
    subjectPersonId: 'abcdefab-1234-4123-8123-abcdefabcdef',
    level: 'medium',
    description: 'Risk concern',
  };
  const metadata = { type: 'body' as const, metatype: CreateRiskRecordDto };

  it.each([
    '2026-02-30',
    '2025-02-29',
    '2026-04-31',
    '2026-13-01',
    '2026-00-01',
    '2026-01-00',
    '2026-9-01',
    '2026-09-01T00:00:00.000Z',
    '',
    0,
    1,
    null,
    true,
    [],
    {},
  ])('rejects invalid calendar date %j', async (recordedAt) => {
    await expect(
      pipe.transform({ ...body, recordedAt }, metadata),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['2024-02-29', '2026-09-01'])(
    'accepts %s unchanged',
    async (recordedAt) => {
      const result = (await pipe.transform(
        { ...body, recordedAt },
        metadata,
      )) as unknown as CreateRiskRecordDto;
      expect(result.recordedAt).toBe(recordedAt);
    },
  );

  it('allows omission so the service can default to today', async () => {
    const result = (await pipe.transform(
      body,
      metadata,
    )) as unknown as CreateRiskRecordDto;
    expect(result.recordedAt).toBeUndefined();
  });
});
