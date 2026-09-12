import {
  detectMimeFromMagic,
  validateCertificateUpload,
  validatePhotoUpload,
} from '../upload-mime.util';

describe('upload-mime.util', () => {
  it('detects jpeg, png, and pdf magic bytes', () => {
    expect(detectMimeFromMagic(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe(
      'image/jpeg',
    );
    expect(
      detectMimeFromMagic(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00])),
    ).toBe('image/png');
    expect(
      detectMimeFromMagic(Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00])),
    ).toBe('application/pdf');
  });

  it('rejects mismatched declared photo mime', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00]);
    expect(validatePhotoUpload('image/jpeg', png)).toBe(false);
    expect(validatePhotoUpload('image/png', png)).toBe(true);
  });

  it('accepts certificate pdf uploads', () => {
    const pdf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d]);
    expect(validateCertificateUpload('application/pdf', pdf)).toBe(true);
  });
});
