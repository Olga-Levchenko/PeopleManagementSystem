import { createHmac, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IdentityLinkOperationName } from './identity-mapping.types';

export interface Fingerprint {
  readonly value: string;
  readonly keyVersion: string;
}

export interface IIdentityFingerprintService {
  fingerprintSubject(
    canonicalIssuer: string,
    opaqueSubject: string,
  ): Fingerprint;
  fingerprintRequest(
    operationType: IdentityLinkOperationName,
    request: unknown,
  ): Fingerprint;
  verifyRequestFingerprint(
    operationType: IdentityLinkOperationName,
    request: unknown,
    expected: Fingerprint,
  ): boolean;
}

export class IdentityFingerprintUnavailableError extends Error {
  constructor() {
    super('Identity fingerprint configuration is unavailable');
    this.name = 'IdentityFingerprintUnavailableError';
  }
}

@Injectable()
export class IdentityFingerprintService implements IIdentityFingerprintService {
  private readonly keys = new Map<string, Buffer>();
  private readonly currentVersion: string | null;

  constructor(config: ConfigService) {
    const parsed = this.parseKeyConfiguration(
      this.readOptional(config, 'IDENTITY_FINGERPRINT_KEYS'),
    );
    this.currentVersion = parsed.currentVersion;
    for (const [version, key] of parsed.keys) {
      this.keys.set(version, key);
    }
  }

  private readOptional(config: ConfigService, key: string): string | undefined {
    const candidate = config as ConfigService & {
      getOrThrow?: (configKey: string) => string;
    };
    if (typeof candidate.get === 'function') {
      return candidate.get<string>(key);
    }
    if (typeof candidate.getOrThrow === 'function') {
      try {
        return candidate.getOrThrow(key);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  fingerprintSubject(
    canonicalIssuer: string,
    opaqueSubject: string,
  ): Fingerprint {
    return this.createFingerprint(
      `subject\0${canonicalIssuer}\0${opaqueSubject}`,
    );
  }

  fingerprintRequest(
    operationType: IdentityLinkOperationName,
    request: unknown,
  ): Fingerprint {
    return this.createFingerprint(
      `request\0${operationType}\0${this.stableSerialize(request)}`,
    );
  }

  verifyRequestFingerprint(
    operationType: IdentityLinkOperationName,
    request: unknown,
    expected: Fingerprint,
  ): boolean {
    const key = this.keys.get(expected.keyVersion);
    if (!key) {
      return false;
    }

    const actual = this.createFingerprintWithKey(
      `request\0${operationType}\0${this.stableSerialize(request)}`,
      expected.keyVersion,
      key,
    );
    const actualBuffer = Buffer.from(actual.value, 'hex');
    const expectedBuffer = Buffer.from(expected.value, 'hex');
    return (
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }

  private createFingerprint(payload: string): Fingerprint {
    if (!this.currentVersion) {
      throw new IdentityFingerprintUnavailableError();
    }

    const key = this.keys.get(this.currentVersion);
    if (!key) {
      throw new IdentityFingerprintUnavailableError();
    }

    return this.createFingerprintWithKey(payload, this.currentVersion, key);
  }

  private createFingerprintWithKey(
    payload: string,
    keyVersion: string,
    key: Buffer,
  ): Fingerprint {
    return {
      value: createHmac('sha256', key).update(payload, 'utf8').digest('hex'),
      keyVersion,
    };
  }

  private parseKeyConfiguration(value: string | undefined): {
    currentVersion: string | null;
    keys: Array<[string, Buffer]>;
  } {
    if (!value) {
      return { currentVersion: null, keys: [] };
    }

    const entries = value.split(';').filter((entry) => entry.length > 0);
    const keys: Array<[string, Buffer]> = [];
    const versions = new Set<string>();
    for (const entry of entries) {
      const separator = entry.indexOf('=');
      if (separator <= 0) {
        return { currentVersion: null, keys: [] };
      }

      const version = entry.slice(0, separator);
      const encodedKey = entry.slice(separator + 1);
      if (
        versions.has(version) ||
        encodedKey.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(encodedKey)
      ) {
        return { currentVersion: null, keys: [] };
      }
      let key: Buffer;
      try {
        key = Buffer.from(encodedKey, 'base64');
      } catch {
        return { currentVersion: null, keys: [] };
      }

      if (version.length === 0 || key.length < 16) {
        return { currentVersion: null, keys: [] };
      }

      versions.add(version);
      keys.push([version, key]);
    }

    return {
      currentVersion: keys[0]?.[0] ?? null,
      keys,
    };
  }

  private stableSerialize(value: unknown): string {
    if (value === null || typeof value !== 'object') {
      return JSON.stringify(value);
    }

    if (Array.isArray(value)) {
      return `[${value.map((item) => this.stableSerialize(item)).join(',')}]`;
    }

    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, entryValue]) =>
          `${JSON.stringify(key)}:${this.stableSerialize(entryValue)}`,
      );
    return `{${entries.join(',')}}`;
  }
}
