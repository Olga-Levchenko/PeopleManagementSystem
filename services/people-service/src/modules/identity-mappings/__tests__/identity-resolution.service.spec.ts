import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IdentityResolutionService } from '../identity-resolution.service';
import { IdentityValidationService } from '../identity-validation.service';

const ISSUER = 'https://id.example.test/realms/people-management';

describe('IdentityResolutionService', () => {
  const validation = new IdentityValidationService(
    new ConfigService({
      NODE_ENV: 'test',
      OIDC_ALLOWED_ISSUERS: ISSUER,
    }),
  );

  function createService(findMany: jest.Mock) {
    return new IdentityResolutionService(
      { personExternalIdentityLink: { findMany } } as never,
      validation,
    );
  }

  it('resolves exactly one active mapping and preserves the subject query value', async () => {
    const findMany = jest.fn().mockResolvedValue([{ personId: 'person-001' }]);
    const service = createService(findMany);

    await expect(
      service.resolve(`${ISSUER}/`, ' Subject/Exact+Value '),
    ).resolves.toEqual({
      outcome: 'resolved',
      personId: 'person-001',
    });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        canonicalIssuer: ISSUER,
        opaqueSubject: ' Subject/Exact+Value ',
        status: 'ACTIVE',
      },
      select: { personId: true },
      take: 2,
    });
  });

  it('returns missing for absent or revoked mappings', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = createService(findMany);

    await expect(service.resolve(ISSUER, 'missing-subject')).resolves.toEqual({
      outcome: 'missing',
    });
    const calls = findMany.mock.calls as unknown[][];
    const query = calls[0]?.[0] as {
      where: { status: string };
    };
    expect(query.where.status).toBe('ACTIVE');
  });

  it('returns ambiguous without selecting a winner', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValue([
        { personId: 'person-001' },
        { personId: 'person-002' },
      ]);
    const service = createService(findMany);

    await expect(service.resolve(ISSUER, 'duplicate-subject')).resolves.toEqual(
      {
        outcome: 'ambiguous',
      },
    );
  });

  it('maps persistence failures to unavailable and performs no writes', async () => {
    const persistenceError = Object.assign(new Error('database unavailable'), {
      code: 'P1001',
    });
    const findMany = jest.fn().mockRejectedValue(persistenceError);
    const service = createService(findMany);

    await expect(
      service.resolve(ISSUER, 'unavailable-subject'),
    ).resolves.toEqual({
      outcome: 'unavailable',
    });
  });

  it('preserves cancellation instead of converting it to unavailable', async () => {
    const controller = new AbortController();
    controller.abort();
    const findMany = jest.fn();
    const service = createService(findMany);

    await expect(
      service.resolve(ISSUER, 'cancelled-subject', controller.signal),
    ).rejects.toThrow('cancelled');
    expect(findMany).not.toHaveBeenCalled();
  });

  it('does not hide unexpected programming failures as dependency failures', async () => {
    const findMany = jest
      .fn()
      .mockRejectedValue(new Error('unexpected failure'));
    const service = createService(findMany);

    await expect(service.resolve(ISSUER, 'unexpected-subject')).rejects.toThrow(
      'unexpected failure',
    );
  });

  it.each([
    ['malformed issuer', 'not-an-issuer', 'subject'],
    ['disallowed issuer', 'https://other.example.test/realm', 'subject'],
    ['blank subject', ISSUER, '   '],
  ])('rejects %s before persistence', async (_name, issuer, subject) => {
    const findMany = jest.fn();
    const service = createService(findMany);

    await expect(service.resolve(issuer, subject)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(findMany).not.toHaveBeenCalled();
  });
});
