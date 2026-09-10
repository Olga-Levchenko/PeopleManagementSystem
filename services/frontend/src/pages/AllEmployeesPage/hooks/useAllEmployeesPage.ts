import { useMemo, useState } from 'react'
import type { EmployeeFieldCatalogEntry } from '@/api/employees'
import {
  useEmployeeFieldCatalog,
  useEmployeesList,
  usePatchEmployeeField,
} from '@/api/hooks/useEmployees'

const DEFAULT_COLUMNS = ['fullName', 'position', 'departmentName', 'countryCity']

const parseOptionalInt = (value: string): number | undefined => {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
}

export const useAllEmployeesPage = () => {
  const [page, setPage] = useState(1)
  const [pageSize] = useState(50)
  const [countryCity, setCountryCity] = useState('')
  const [yearsMin, setYearsMin] = useState('')
  const [yearsMax, setYearsMax] = useState('')
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>(DEFAULT_COLUMNS)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [customFieldFilters, setCustomFieldFilters] = useState<Record<string, string>>({})

  const catalogQuery = useEmployeeFieldCatalog()
  const listParams = {
    page,
    pageSize,
    countryCity: countryCity.trim() || undefined,
    yearsWithCompanyMin: parseOptionalInt(yearsMin),
    yearsWithCompanyMax: parseOptionalInt(yearsMax),
    customFieldFilters,
  }

  const listQuery = useEmployeesList(listParams)
  const patchMutation = usePatchEmployeeField(listParams)
  const [liveMessage, setLiveMessage] = useState('')

  const filterableCustomFields = useMemo(
    () =>
      (catalogQuery.data?.fields ?? []).filter(
        (field: EmployeeFieldCatalogEntry) =>
          field.filterable && field.kind === 'custom',
      ),
    [catalogQuery.data?.fields],
  )

  const columnableFields = useMemo(
    () =>
      (catalogQuery.data?.fields ?? []).filter(
        (field: EmployeeFieldCatalogEntry) => field.columnable,
      ),
    [catalogQuery.data?.fields],
  )

  const visibleColumns = useMemo(
    () =>
      columnableFields.filter((field: EmployeeFieldCatalogEntry) =>
        visibleColumnKeys.includes(field.key),
      ),
    [columnableFields, visibleColumnKeys],
  )

  const toggleColumn = (key: string) => {
    setVisibleColumnKeys(current =>
      current.includes(key) ? current.filter(item => item !== key) : [...current, key],
    )
  }

  const applyFilters = () => {
    setPage(1)
    void listQuery.refetch()
  }

  const totalPages = listQuery.data
    ? Math.max(1, Math.ceil(listQuery.data.totalCount / listQuery.data.pageSize))
    : 1

  const saveField = async (
    subjectPersonId: string,
    fieldKey: string,
    value: unknown,
  ) => {
    try {
      await patchMutation.mutateAsync({
        subjectPersonId,
        body: { fieldKey, value },
      })
      setLiveMessage(`Saved ${fieldKey}.`)
    } catch {
      setLiveMessage(`Failed to save ${fieldKey}.`)
    }
  }

  return {
    catalogQuery,
    listQuery,
    patchMutation,
    liveMessage,
    saveField,
    page,
    setPage,
    totalPages,
    countryCity,
    setCountryCity,
    yearsMin,
    setYearsMin,
    yearsMax,
    setYearsMax,
    visibleColumns,
    columnableFields,
    toggleColumn,
    pickerOpen,
    setPickerOpen,
    applyFilters,
    filterableCustomFields,
    customFieldFilters,
    setCustomFieldFilter: (key: string, value: string) => {
      setCustomFieldFilters(current => {
        const next = { ...current }
        if (value.trim()) {
          next[key] = value
        } else {
          delete next[key]
        }
        return next
      })
    },
  }
}
