import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { IdentityValidationService } from '../identity-validation.service';

const ISSUER = 'https://ID.Example.Test:443/Realms/People';

describe('IdentityValidationService', () => {
  const createService = (
    values: Record<string, string> = {
      NODE_ENV: 'test',
      OIDC_ALLOWED_ISSUERS: ISSUER,
    },
  ) => new IdentityValidationService(new ConfigService(values));

  it('canonicalizes only the issuer and preserves its path case', () => {
    const service = createService();

    expect(service.validateIdentity(ISSUER, ' Subject/Exact ')).toEqual({
      canonicalIssuer: 'https://id.example.test/Realms/People',
      opaqueSubject: ' Subject/Exact ',
    });
  });

  it('isolates issuers and rejects an issuer outside the allowlist', () => {
    const service = createService();

    expect(() =>
      service.validateIdentity(
        'https://other.example.test/realms/People',
        'subject',
      ),
    ).toThrow(BadRequestException);
  });

  it.each([
    'https://id.example.test/realms/people?query=1',
    'https://user:password@id.example.test/realms/people',
    'https://id.example.test/realms/people#fragment',
    'not-an-issuer',
  ])('rejects malformed issuer %s', (issuer) => {
    const service = createService({
      NODE_ENV: 'test',
      OIDC_ALLOWED_ISSUERS: ISSUER,
    });

    expect(() => service.validateIssuer(issuer)).toThrow(BadRequestException);
  });

  it('requires nonblank subjects without modifying exact values', () => {
    const service = createService();

    expect(() => service.validateSubject('   ')).toThrow(BadRequestException);
    expect(service.validateSubject('subject-with/case+symbols')).toBe(
      'subject-with/case+symbols',
    );
  });

  it('requires HTTPS outside local environments', () => {
    const service = createService({
      NODE_ENV: 'production',
      OIDC_ALLOWED_ISSUERS: 'https://id.example.test/realms/people',
    });

    expect(() =>
      service.validateIssuer('http://id.example.test/realms/people'),
    ).toThrow(BadRequestException);
  });

  it('matches the shared issuer canonicalization fixture', async () => {
    const fixturePath = path.resolve(
      __dirname,
      '../../../../../../docs/integrations/contracts/people-identity-resolution.issuer-cases.v1.json',
    );
    const cases = JSON.parse(await readFile(fixturePath, 'utf8')) as Array<{
      issuer: string;
      subject: string;
      canonicalIssuer?: string;
      validInProduction: boolean;
      validInLocal: boolean;
    }>;

    for (const issuerCase of cases) {
      const environment = issuerCase.validInProduction
        ? 'production'
        : issuerCase.validInLocal
          ? 'test'
          : 'production';
      const service = createService({
        NODE_ENV: environment,
        OIDC_ALLOWED_ISSUERS:
          issuerCase.validInProduction || issuerCase.validInLocal
            ? issuerCase.issuer
            : ISSUER,
      });

      if (issuerCase.validInProduction || issuerCase.validInLocal) {
        const identity = service.validateIdentity(
          issuerCase.issuer,
          issuerCase.subject,
        );
        expect(identity).toEqual({
          canonicalIssuer: issuerCase.canonicalIssuer,
          opaqueSubject: issuerCase.subject,
        });
      } else {
        expect(() => service.validateIssuer(issuerCase.issuer)).toThrow(
          BadRequestException,
        );
        const localService = createService({
          NODE_ENV: 'test',
          OIDC_ALLOWED_ISSUERS: ISSUER,
        });
        expect(() => localService.validateIssuer(issuerCase.issuer)).toThrow(
          BadRequestException,
        );
      }
    }
  });
});
