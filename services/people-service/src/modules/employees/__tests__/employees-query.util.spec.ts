import { BadRequestException } from '@nestjs/common';
import { parseExportColumnKeys } from '../employees-query.util';

describe('parseExportColumnKeys', () => {
  it('parses trimmed comma-separated keys preserving order', () => {
    expect(parseExportColumnKeys(' fullName , position ')).toEqual([
      'fullName',
      'position',
    ]);
  });

  it('rejects empty columns param', () => {
    expect(() => parseExportColumnKeys('')).toThrow(BadRequestException);
    expect(() => parseExportColumnKeys('   ')).toThrow(BadRequestException);
    expect(() => parseExportColumnKeys(undefined)).toThrow(BadRequestException);
  });

  it('rejects duplicate keys', () => {
    expect(() => parseExportColumnKeys('fullName,fullName')).toThrow(
      BadRequestException,
    );
  });
});
