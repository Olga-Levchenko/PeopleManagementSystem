import { ConfigService } from '@nestjs/config';
import {
  IdentityFingerprintService,
  IdentityFingerprintUnavailableError,
} from '../identity-fingerprint.service';

const OLD_KEY = Buffer.from('fabricated-old-test-key').toString('base64');
const CURRENT_KEY = Buffer.from('fabricated-current-test-key').toString(
  'base64',
);

describe('IdentityFingerprintService', () => {
  it('fails closed when key configuration is absent or invalid', () => {
    expect(() =>
      new IdentityFingerprintService(new ConfigService()).fingerprintRequest(
        'LINK',
        { personId: 'person' },
      ),
    ).toThrow(IdentityFingerprintUnavailableError);

    expect(() =>
      new IdentityFingerprintService(
        new ConfigService({ IDENTITY_FINGERPRINT_KEYS: 'invalid' }),
      ).fingerprintRequest('LINK', { personId: 'person' }),
    ).toThrow(IdentityFingerprintUnavailableError);
  });

  it('uses the current key and verifies retained previous key versions', () => {
    const oldService = new IdentityFingerprintService(
      new ConfigService({ IDENTITY_FINGERPRINT_KEYS: `v1=${OLD_KEY}` }),
    );
    const oldFingerprint = oldService.fingerprintRequest('LINK', {
      personId: 'person',
      opaqueSubject: 'exact-subject',
    });
    const currentService = new IdentityFingerprintService(
      new ConfigService({
        IDENTITY_FINGERPRINT_KEYS: `v2=${CURRENT_KEY};v1=${OLD_KEY}`,
      }),
    );

    expect(oldFingerprint.keyVersion).toBe('v1');
    expect(
      currentService.verifyRequestFingerprint(
        'LINK',
        { opaqueSubject: 'exact-subject', personId: 'person' },
        oldFingerprint,
      ),
    ).toBe(true);
    expect(
      currentService.verifyRequestFingerprint(
        'LINK',
        { personId: 'different-person', opaqueSubject: 'exact-subject' },
        oldFingerprint,
      ),
    ).toBe(false);
  });

  it('does not expose the key or source subject in the fingerprint value', () => {
    const service = new IdentityFingerprintService(
      new ConfigService({ IDENTITY_FINGERPRINT_KEYS: `v1=${CURRENT_KEY}` }),
    );
    const fingerprint = service.fingerprintSubject(
      'https://id.example.test/realms/people',
      'fabricated-subject',
    );

    expect(fingerprint.value).not.toContain('fabricated-subject');
    expect(fingerprint.value).not.toContain(CURRENT_KEY);
    expect(fingerprint.keyVersion).toBe('v1');
  });
});
