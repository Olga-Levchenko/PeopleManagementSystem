import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { IdentityResolutionService } from '../../identity-mappings/identity-resolution.service';
import { RequestActorContext } from '../request-actor.context';

interface AuthenticatedRequest extends Request {
  user?: {
    sub?: string;
    iss?: string;
  };
}

const ISSUER = 'http://localhost:8080/realms/people-management';
const KEYCLOAK_SUB = 'c772d28a-1442-41a9-ac6f-af4cc14af5ae';
const PERSON_ID = 'cccccccc-0000-0000-0000-000000000006';

const createContext = (
  request: AuthenticatedRequest,
  resolve = jest.fn<IdentityResolutionService['resolve']>(),
) =>
  new RequestActorContext(request, {
    resolve,
  } as unknown as IdentityResolutionService);

describe('RequestActorContext', () => {
  it('throws UnauthorizedException when request.user is absent', async () => {
    const context = createContext({});

    await expect(context.resolveActorId()).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(context.resolveActorId()).rejects.toThrow(
      'Authenticated actor is required',
    );
  });

  it('throws UnauthorizedException when iss is missing', async () => {
    const context = createContext({ user: { sub: KEYCLOAK_SUB } });

    await expect(context.resolveActorId()).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(context.resolveActorId()).rejects.toThrow(
      'Authenticated actor is required',
    );
  });

  it('throws UnauthorizedException when sub is missing', async () => {
    const context = createContext({ user: { iss: ISSUER } });

    await expect(context.resolveActorId()).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(context.resolveActorId()).rejects.toThrow(
      'Authenticated actor is required',
    );
  });

  it('throws UnauthorizedException when sub is blank or whitespace-only', async () => {
    for (const sub of ['', '   ']) {
      const context = createContext({ user: { sub, iss: ISSUER } });

      await expect(context.resolveActorId()).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(context.resolveActorId()).rejects.toThrow(
        'Authenticated actor is required',
      );
    }
  });

  it('resolves Keycloak iss/sub to Person.id', async () => {
    const resolve = jest
      .fn<IdentityResolutionService['resolve']>()
      .mockResolvedValue({ outcome: 'resolved', personId: PERSON_ID });
    const context = createContext(
      { user: { sub: KEYCLOAK_SUB, iss: ISSUER } },
      resolve,
    );

    await expect(context.resolveActorId()).resolves.toBe(PERSON_ID);
    expect(resolve).toHaveBeenCalledWith(ISSUER, KEYCLOAK_SUB);
    await expect(context.resolveActorId()).resolves.toBe(PERSON_ID);
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('maps missing identity mapping to NotFoundException', async () => {
    const resolve = jest
      .fn<IdentityResolutionService['resolve']>()
      .mockResolvedValue({ outcome: 'missing' });
    const context = createContext(
      { user: { sub: KEYCLOAK_SUB, iss: ISSUER } },
      resolve,
    );

    await expect(context.resolveActorId()).rejects.toThrow(NotFoundException);
    await expect(context.resolveActorId()).rejects.toThrow(
      'The authenticated principal has no active person mapping.',
    );
  });

  it('maps ambiguous identity mapping to ConflictException', async () => {
    const resolve = jest
      .fn<IdentityResolutionService['resolve']>()
      .mockResolvedValue({ outcome: 'ambiguous' });
    const context = createContext(
      { user: { sub: KEYCLOAK_SUB, iss: ISSUER } },
      resolve,
    );

    await expect(context.resolveActorId()).rejects.toThrow(ConflictException);
    await expect(context.resolveActorId()).rejects.toThrow(
      'The authenticated principal has an ambiguous person mapping.',
    );
  });

  it('maps unavailable identity resolution to ServiceUnavailableException', async () => {
    const resolve = jest
      .fn<IdentityResolutionService['resolve']>()
      .mockResolvedValue({ outcome: 'unavailable' });
    const context = createContext(
      { user: { sub: KEYCLOAK_SUB, iss: ISSUER } },
      resolve,
    );

    await expect(context.resolveActorId()).rejects.toThrow(
      ServiceUnavailableException,
    );
    await expect(context.resolveActorId()).rejects.toThrow(
      'Identity resolution is unavailable.',
    );
  });
});
