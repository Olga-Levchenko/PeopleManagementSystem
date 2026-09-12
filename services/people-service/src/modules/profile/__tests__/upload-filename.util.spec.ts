import { decodeMultipartFileName } from '../upload-filename.util';

describe('decodeMultipartFileName', () => {
  it('recovers UTF-8 Cyrillic filenames from latin1 mojibake', () => {
    const mojibake = Buffer.from('Довідка-2-1 (Папка).pdf', 'utf8').toString('latin1');
    expect(decodeMultipartFileName(mojibake)).toBe('Довідка-2-1 (Папка).pdf');
  });

  it('leaves ASCII filenames unchanged', () => {
    expect(decodeMultipartFileName('certificate.pdf')).toBe('certificate.pdf');
  });

  it('trims surrounding whitespace', () => {
    expect(decodeMultipartFileName('  report.pdf  ')).toBe('report.pdf');
  });
});
