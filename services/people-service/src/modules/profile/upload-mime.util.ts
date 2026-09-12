import {
  ALLOWED_CERTIFICATE_MIME_TYPES,
  ALLOWED_PHOTO_MIME_TYPES,
} from './upload.constants';

const JPEG_MAGIC = [0xff, 0xd8, 0xff];
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];
const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46];

function startsWithMagic(buffer: Buffer, magic: number[]): boolean {
  if (buffer.length < magic.length) {
    return false;
  }
  return magic.every((byte, index) => buffer[index] === byte);
}

export function detectMimeFromMagic(buffer: Buffer): string | null {
  if (startsWithMagic(buffer, JPEG_MAGIC)) {
    return 'image/jpeg';
  }
  if (startsWithMagic(buffer, PNG_MAGIC)) {
    return 'image/png';
  }
  if (startsWithMagic(buffer, PDF_MAGIC)) {
    return 'application/pdf';
  }
  return null;
}

export function validatePhotoUpload(
  declaredMime: string,
  buffer: Buffer,
): boolean {
  if (!ALLOWED_PHOTO_MIME_TYPES.has(declaredMime)) {
    return false;
  }
  const detected = detectMimeFromMagic(buffer);
  return detected === declaredMime;
}

export function validateCertificateUpload(
  declaredMime: string,
  buffer: Buffer,
): boolean {
  if (!ALLOWED_CERTIFICATE_MIME_TYPES.has(declaredMime)) {
    return false;
  }
  const detected = detectMimeFromMagic(buffer);
  return detected === declaredMime;
}

export function extensionForMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'application/pdf':
      return 'pdf';
    default:
      return 'bin';
  }
}
