import { parseCustomFieldFilters } from '../employees-query.util';

describe('parseCustomFieldFilters', () => {
  it('parses custom: prefixed string query params', () => {
    expect(
      parseCustomFieldFilters({
        page: '1',
        'custom:cf-desk': 'Standing',
      }),
    ).toEqual({ 'custom:cf-desk': 'Standing' });
  });

  it('uses the first value when a custom key is repeated', () => {
    expect(
      parseCustomFieldFilters({
        'custom:cf-desk': ['Standing', 'Sitting'],
      }),
    ).toEqual({ 'custom:cf-desk': 'Standing' });
  });

  it('ignores empty custom values and non-custom keys', () => {
    expect(
      parseCustomFieldFilters({
        countryCity: 'Kyiv',
        'custom:cf-desk': '',
      }),
    ).toEqual({});
  });
});
