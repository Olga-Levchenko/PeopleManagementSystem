import { extractBearerToken } from '../management-notes.controller';

describe('extractBearerToken', () => {
  it.each(['Bearer token-value', 'bearer token-value', 'BEARER token-value'])(
    'accepts case-insensitive bearer scheme: %s',
    (authorization) => {
      expect(extractBearerToken(authorization)).toBe('token-value');
    },
  );

  it.each([undefined, '', 'Basic token-value', 'Bearer'])(
    'rejects invalid authorization value: %s',
    (authorization) => {
      expect(extractBearerToken(authorization)).toBeUndefined();
    },
  );
});
