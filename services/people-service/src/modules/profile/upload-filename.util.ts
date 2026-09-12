/**
 * Multer/busboy often deliver UTF-8 filenames as latin1-mojibake. Recover the original name
 * when possible; leave already-correct ASCII names unchanged.
 */
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
