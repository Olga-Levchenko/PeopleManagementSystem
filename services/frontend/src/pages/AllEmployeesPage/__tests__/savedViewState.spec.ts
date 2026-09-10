import { expect, test } from '@playwright/test'
import {
  applyConfigurationToUiState,
  buildConfigurationFromUiState,
  filtersToListParams,
  isDirtyAgainstBaseline,
  type AllEmployeesUiState,
} from '../savedViewState'

const baseState: AllEmployeesUiState = {
  countryCity: 'Kyiv',
  departmentId: 'dept-1',
  yearsMin: '1',
  yearsMax: '5',
  visibleColumnKeys: ['fullName', 'position'],
  customFieldFilters: { 'custom:abc': 'FTE' },
  pageSize: 25,
}

test.describe('savedViewState', () => {
  test('round-trips departmentId through configuration', () => {
    const configuration = buildConfigurationFromUiState(baseState)
    expect(configuration.filters.departmentId).toBe('dept-1')

    const restored = applyConfigurationToUiState(configuration, 25)
    expect(restored.departmentId).toBe('dept-1')
  })

  test('maps departmentId into list params', () => {
    const params = filtersToListParams(buildConfigurationFromUiState(baseState).filters)
    expect(params.departmentId).toBe('dept-1')
  })

  test('detects dirty state when pageSize changes', () => {
    const baseline = { ...baseState }
    const changed = { ...baseState, pageSize: 50 }
    expect(isDirtyAgainstBaseline(changed, baseline)).toBe(true)
  })
})
