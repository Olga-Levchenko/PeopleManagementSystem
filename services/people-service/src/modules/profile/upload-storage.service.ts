import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

const STORAGE_KEY_PATTERN =
  /^p\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(photos|certificates)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]+$/i;

@Injectable()
export class UploadStorageService {
  constructor(private readonly config: ConfigService) {}

  buildStorageKey(
    personId: string,
    kind: 'photos' | 'certificates',
    fileId: string,
    extension: string,
  ): string {
    return `p/${personId}/${kind}/${fileId}.${extension}`;
  }

  isValidStorageKey(storageKey: string, subjectPersonId: string): boolean {
    if (!STORAGE_KEY_PATTERN.test(storageKey)) {
      return false;
    }
    return storageKey.startsWith(`p/${subjectPersonId}/`);
  }

  resolveAbsolutePath(storageKey: string): string | null {
    if (
      storageKey.includes('..') ||
      storageKey.includes('\\') ||
      storageKey.startsWith('/')
    ) {
      return null;
    }
    const root = path.resolve(this.config.getOrThrow<string>('UPLOAD_STORAGE_PATH'));
    const absolute = path.resolve(root, storageKey);
    if (!absolute.startsWith(`${root}${path.sep}`) && absolute !== root) {
      return null;
    }
    return absolute;
  }

  async writeFile(storageKey: string, buffer: Buffer): Promise<void> {
    const absolute = this.resolveAbsolutePath(storageKey);
    if (!absolute) {
      throw new ServiceUnavailableException('Invalid storage key.');
    }
    try {
      await mkdir(path.dirname(absolute), { recursive: true });
      await writeFile(absolute, buffer);
    } catch {
      throw new ServiceUnavailableException('Upload storage is unavailable.');
    }
  }

  async readFile(storageKey: string): Promise<Buffer | null> {
    const absolute = this.resolveAbsolutePath(storageKey);
    if (!absolute) {
      return null;
    }
    try {
      return await readFile(absolute);
    } catch {
      return null;
    }
  }

  async deleteFile(storageKey: string): Promise<void> {
    const absolute = this.resolveAbsolutePath(storageKey);
    if (!absolute) {
      return;
    }
    try {
      await unlink(absolute);
    } catch {
      // Missing file is acceptable during replace/delete lifecycle.
    }
  }
}
