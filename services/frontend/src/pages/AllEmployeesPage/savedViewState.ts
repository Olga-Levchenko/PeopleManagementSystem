import type {
  SavedViewConfiguration,
  SavedViewFilters,
} from '@/api/employees'

export interface AllEmployeesUiState {
  countryCity: string
  departmentId: string
  yearsMin: string
  yearsMax: string
  visibleColumnKeys: string[]
  customFieldFilters: Record<string, string>
  pageSize: number
}

export const buildConfigurationFromUiState = (
  state: AllEmployeesUiState,
): SavedViewConfiguration => ({
  visibleColumnKeys: state.visibleColumnKeys,
  filters: {
    countryCity: state.countryCity.trim() || undefined,
    departmentId: state.departmentId.trim() || undefined,
    yearsWithCompanyMin: parseOptionalInt(state.yearsMin),
    yearsWithCompanyMax: parseOptionalInt(state.yearsMax),
    customFieldFilters:
      Object.keys(state.customFieldFilters).length > 0
        ? state.customFieldFilters
        : undefined,
  },
})

export const applyConfigurationToUiState = (
  configuration: SavedViewConfiguration,
  pageSize: number,
): AllEmployeesUiState => ({
  countryCity: configuration.filters.countryCity ?? '',
  departmentId: configuration.filters.departmentId ?? '',
  yearsMin:
    configuration.filters.yearsWithCompanyMin !== undefined
      ? String(configuration.filters.yearsWithCompanyMin)
      : '',
  yearsMax:
    configuration.filters.yearsWithCompanyMax !== undefined
      ? String(configuration.filters.yearsWithCompanyMax)
      : '',
  visibleColumnKeys: configuration.visibleColumnKeys,
  customFieldFilters: configuration.filters.customFieldFilters ?? {},
  pageSize,
})

export const isDirtyAgainstBaseline = (
  current: AllEmployeesUiState,
  baseline: AllEmployeesUiState,
): boolean =>
  JSON.stringify(buildConfigurationFromUiState(current)) !==
    JSON.stringify(buildConfigurationFromUiState(baseline)) ||
  current.pageSize !== baseline.pageSize

const parseOptionalInt = (value: string): number | undefined => {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

export const filtersToListParams = (filters: SavedViewFilters) => ({
  countryCity: filters.countryCity,
  departmentId: filters.departmentId,
  yearsWithCompanyMin: filters.yearsWithCompanyMin,
  yearsWithCompanyMax: filters.yearsWithCompanyMax,
  customFieldFilters: filters.customFieldFilters ?? {},
})
