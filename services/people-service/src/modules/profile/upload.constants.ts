export const MAX_PHOTO_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_CERTIFICATE_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ALLOWED_PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/png']);
export const ALLOWED_CERTIFICATE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'application/pdf',
]);

/** Prefix for gated download references stored in `Person.photoUrl`. */
export const GATED_STORAGE_PREFIX = 'storage:';

export function isGatedStorageReference(
  value: string | null | undefined,
): boolean {
  return typeof value === 'string' && value.startsWith(GATED_STORAGE_PREFIX);
}

export function toGatedStorageReference(storageKey: string): string {
  return `${GATED_STORAGE_PREFIX}${storageKey}`;
}

export function parseGatedStorageReference(
  value: string,
): string | null {
  if (!isGatedStorageReference(value)) {
    return null;
  }
  const storageKey = value.slice(GATED_STORAGE_PREFIX.length);
  return storageKey.length > 0 ? storageKey : null;
}

export function buildPhotoDownloadPath(subjectPersonId: string): string {
  return `/api/v1/people/${subjectPersonId}/profile/photo`;
}

export function buildCertificateDownloadPath(
  subjectPersonId: string,
  certificateId: string,
): string {
  return `/api/v1/people/${subjectPersonId}/profile/certificates/${certificateId}/download`;
}
