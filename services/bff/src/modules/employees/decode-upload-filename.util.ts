/** See people-service upload-filename.util — same multer latin1 quirk on re-proxy. */
export function decodeMultipartFileName(originalname: string): string {
  const trimmed = originalname.trim();
  if (!trimmed) {
    return trimmed;
  }

  const recovered = Buffer.from(trimmed, 'latin1').toString('utf8');
  if (recovered !== trimmed && !recovered.includes('\uFFFD')) {
    return recovered.normalize('NFC');
  }

  return trimmed.normalize('NFC');
}
