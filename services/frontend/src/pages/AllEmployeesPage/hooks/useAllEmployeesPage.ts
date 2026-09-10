import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EmployeeFieldCatalogEntry, EmployeeSavedView } from '@/api/employees'
import {
  useCreateSavedView,
  useDeleteSavedView,
  useEmployeeFieldCatalog,
  useEmployeesList,
  usePatchEmployeeField,
  useSavedViews,
  useUpdateSavedView,
} from '@/api/hooks/useEmployees'
import {
  applyConfigurationToUiState,
  buildConfigurationFromUiState,
  isDirtyAgainstBaseline,
  type AllEmployeesUiState,
} from '../savedViewState'

const DEFAULT_COLUMNS = ['fullName', 'position', 'departmentName', 'countryCity']
const DEFAULT_PAGE_SIZE = 50

const createDefaultUiState = (): AllEmployeesUiState => ({
  countryCity: '',
  departmentId: '',
  yearsMin: '',
  yearsMax: '',
  visibleColumnKeys: DEFAULT_COLUMNS,
  customFieldFilters: {},
  pageSize: DEFAULT_PAGE_SIZE,
})

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
  const [uiState, setUiState] = useState<AllEmployeesUiState>(createDefaultUiState)
  const [activeTabId, setActiveTabId] = useState<'all' | string>('all')
  const [ownedBaselines, setOwnedBaselines] = useState<Record<string, AllEmployeesUiState>>({})
  const [pickerOpen, setPickerOpen] = useState(false)

  const catalogQuery = useEmployeeFieldCatalog()
  const showSavedViews = catalogQuery.data?.listAudienceLevel !== 'colleague'
  const savedViewsQuery = useSavedViews(showSavedViews)

  const listParams = {
    page,
    pageSize: uiState.pageSize,
    countryCity: uiState.countryCity.trim() || undefined,
    departmentId: uiState.departmentId.trim() || undefined,
    yearsWithCompanyMin: parseOptionalInt(uiState.yearsMin),
    yearsWithCompanyMax: parseOptionalInt(uiState.yearsMax),
    customFieldFilters: uiState.customFieldFilters,
  }

  const listQuery = useEmployeesList(listParams)
  const patchMutation = usePatchEmployeeField(listParams)
  const createSavedViewMutation = useCreateSavedView()
  const updateSavedViewMutation = useUpdateSavedView()
  const deleteSavedViewMutation = useDeleteSavedView()
  const [liveMessage, setLiveMessage] = useState('')

  const activeSavedView = useMemo(
    () =>
      savedViewsQuery.data?.find((view: EmployeeSavedView) => view.id === activeTabId) ??
      null,
    [activeTabId, savedViewsQuery.data],
  )

  const isOwnedTabDirty = useMemo(() => {
    if (!activeSavedView?.isOwner) {
      return false
    }
    const baseline = ownedBaselines[activeSavedView.id]
    if (!baseline) {
      return false
    }
    return isDirtyAgainstBaseline(uiState, baseline)
  }, [activeSavedView, ownedBaselines, uiState])

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
        uiState.visibleColumnKeys.includes(field.key),
      ),
    [columnableFields, uiState.visibleColumnKeys],
  )

  const applyUiState = useCallback((next: AllEmployeesUiState) => {
    setUiState(next)
    setPage(1)
  }, [])

  useEffect(() => {
    if (activeTabId === 'all' || !savedViewsQuery.data) {
      return
    }
    const stillExists = savedViewsQuery.data.some(
      (view: EmployeeSavedView) => view.id === activeTabId,
    )
    if (!stillExists) {
      // Sync local tab state when revoke/delete removes the active view from the server list.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- external query refetch
      setActiveTabId('all')
      applyUiState(createDefaultUiState())
    }
  }, [activeTabId, savedViewsQuery.data, applyUiState])

  const switchTab = useCallback(
    (nextTabId: 'all' | string) => {
      if (nextTabId === activeTabId) {
        return true
      }
      if (
        activeTabId !== 'all' &&
        activeSavedView?.isOwner &&
        isOwnedTabDirty &&
        !window.confirm('Discard unsaved changes on this view?')
      ) {
        return false
      }

      if (nextTabId === 'all') {
        applyUiState(createDefaultUiState())
        setActiveTabId('all')
        return true
      }

      const view = savedViewsQuery.data?.find(
        (item: EmployeeSavedView) => item.id === nextTabId,
      )
      if (!view) {
        setActiveTabId('all')
        applyUiState(createDefaultUiState())
        return true
      }

      const nextState = applyConfigurationToUiState(
        view.applicableConfiguration,
        view.pageSize,
      )
      applyUiState(nextState)
      setActiveTabId(view.id)
      if (view.isOwner) {
        setOwnedBaselines(current => ({
          ...current,
          [view.id]: nextState,
        }))
      }
      return true
    },
    [
      activeSavedView?.isOwner,
      activeTabId,
      applyUiState,
      isOwnedTabDirty,
      savedViewsQuery.data,
    ],
  )

  const toggleColumn = (key: string) => {
    setUiState(current => ({
      ...current,
      visibleColumnKeys: current.visibleColumnKeys.includes(key)
        ? current.visibleColumnKeys.filter(item => item !== key)
        : [...current.visibleColumnKeys, key],
    }))
  }

  const applyFilters = () => {
    setPage(1)
    void listQuery.refetch()
  }

  const saveCurrentOwnedView = async () => {
    if (!activeSavedView?.isOwner) {
      return
    }
    const configuration = buildConfigurationFromUiState(uiState)
    await updateSavedViewMutation.mutateAsync({
      viewId: activeSavedView.id,
      body: {
        configuration,
        pageSize: uiState.pageSize,
      },
    })
    setOwnedBaselines(current => ({
      ...current,
      [activeSavedView.id]: uiState,
    }))
    setLiveMessage(`Saved view "${activeSavedView.name}" updated.`)
  }

  const renameCurrentOwnedView = async (name: string) => {
    if (!activeSavedView?.isOwner || !name.trim()) {
      return
    }
    await updateSavedViewMutation.mutateAsync({
      viewId: activeSavedView.id,
      body: { name: name.trim() },
    })
    setLiveMessage(`Renamed view to "${name.trim()}".`)
  }

  const createViewFromCurrentState = async (name: string) => {
    if (!name.trim()) {
      return
    }
    const configuration = buildConfigurationFromUiState(uiState)
    const created = await createSavedViewMutation.mutateAsync({
      name: name.trim(),
      pageSize: uiState.pageSize,
      configuration,
    })
    const baseline = applyConfigurationToUiState(
      created.applicableConfiguration,
      created.pageSize,
    )
    setOwnedBaselines(current => ({
      ...current,
      [created.id]: baseline,
    }))
    setActiveTabId(created.id)
    setLiveMessage(`Created view "${created.name}".`)
  }

  const deleteCurrentOwnedView = async () => {
    if (!activeSavedView?.isOwner) {
      return
    }
    const deletedId = activeSavedView.id
    const deletedName = activeSavedView.name
    try {
      await deleteSavedViewMutation.mutateAsync(deletedId)
      setOwnedBaselines(current => {
        const next = { ...current }
        delete next[deletedId]
        return next
      })
      applyUiState(createDefaultUiState())
      setActiveTabId('all')
      setLiveMessage(`Deleted view "${deletedName}".`)
    } catch {
      setLiveMessage(`Failed to delete view "${deletedName}".`)
    }
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
    savedViewsQuery,
    patchMutation,
    createSavedViewMutation,
    updateSavedViewMutation,
    deleteSavedViewMutation,
    liveMessage,
    saveField,
    page,
    setPage,
    totalPages,
    showSavedViews,
    activeTabId,
    activeSavedView,
    isOwnedTabDirty,
    switchTab,
    saveCurrentOwnedView,
    renameCurrentOwnedView,
    deleteCurrentOwnedView,
    createViewFromCurrentState,
    countryCity: uiState.countryCity,
    setCountryCity: (value: string) =>
      setUiState(current => ({ ...current, countryCity: value })),
    yearsMin: uiState.yearsMin,
    setYearsMin: (value: string) =>
      setUiState(current => ({ ...current, yearsMin: value })),
    yearsMax: uiState.yearsMax,
    setYearsMax: (value: string) =>
      setUiState(current => ({ ...current, yearsMax: value })),
    visibleColumns,
    columnableFields,
    toggleColumn,
    pickerOpen,
    setPickerOpen,
    applyFilters,
    filterableCustomFields,
    customFieldFilters: uiState.customFieldFilters,
    setCustomFieldFilter: (key: string, value: string) => {
      setUiState(current => {
        const nextFilters = { ...current.customFieldFilters }
        if (value.trim()) {
          nextFilters[key] = value
        } else {
          delete nextFilters[key]
        }
        return { ...current, customFieldFilters: nextFilters }
      })
    },
  }
}
