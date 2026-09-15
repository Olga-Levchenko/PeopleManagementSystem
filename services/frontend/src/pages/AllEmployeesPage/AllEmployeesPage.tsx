import { useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Download, Settings2, Trash2, X, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { InlineEditableCell } from './InlineEditableCell'
import { useAllEmployeesPage } from './hooks/useAllEmployeesPage'

const filterInputClassName =
  'w-full rounded-md border border-input bg-background px-3 py-2 pr-10 text-foreground'
const filterClearButtonClassName =
  'absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground opacity-70 transition hover:bg-muted hover:opacity-100 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
const createViewOptionValue = '__create_view__'

export const AllEmployeesPage = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const {
    catalogQuery,
    listQuery,
    savedViewsQuery,
    page,
    setPage,
    totalPages,
    showSavedViews,
    isRowNavigationEnabled,
    activeTabId,
    activeSavedView,
    isOwnedTabDirty,
    switchTab,
    saveCurrentOwnedView,
    renameCurrentOwnedView,
    deleteCurrentOwnedView,
    createViewFromCurrentState,
    countryCity,
    setCountryCity,
    fullName,
    setFullName,
    position,
    setPosition,
    sortBy,
    setSortBy,
    sortDirection,
    setSortDirection,
    departmentId,
    setDepartmentId,
    visibleColumns,
    columnableFields,
    toggleColumn,
    pickerOpen,
    setPickerOpen,
    clearFilters,
    hasActiveFilters,
    filterableCustomFields,
    customFieldFilters,
    setCustomFieldFilter,
    liveMessage,
    saveField,
    patchMutation,
    createSavedViewMutation,
    updateSavedViewMutation,
    deleteSavedViewMutation,
    exportCurrentView,
    exportEmployeesMutation,
  } = useAllEmployeesPage()
  const departmentOptions = Array.from(new Map((listQuery.data?.items ?? [])
    .filter(employee => employee.values.departmentId && employee.values.departmentName)
    .map(employee => [
      String(employee.values.departmentId),
      String(employee.values.departmentName),
    ])).entries())
  const [newViewName, setNewViewName] = useState('')
  const [isNewViewDialogOpen, setIsNewViewDialogOpen] = useState(false)

  const createNewView = () => {
    const name = newViewName.trim()
    if (!name) return
    void createViewFromCurrentState(name)
    setNewViewName('')
    setIsNewViewDialogOpen(false)
  }

  const promptForName = (message: string) => {
    const value = window.prompt(message)
    return value?.trim() ?? ''
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Users className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t('allEmployees.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('allEmployees.description')}</p>
        </div>
      </div>

      <div aria-live="polite" className="sr-only">{liveMessage}</div>

      {showSavedViews && (
        <div className="hidden flex-wrap items-center gap-2 border-b border-border pb-2">
          <button
            type="button"
            className={`rounded-t-md px-3 py-2 text-sm ${
              activeTabId === 'all'
                ? 'border border-b-0 border-border bg-secondary font-semibold text-foreground'
                : 'text-muted-foreground'
            }`}
            onClick={() => switchTab('all')}
          >
            {t('allEmployees.views.all')}
          </button>
          {(savedViewsQuery.data ?? []).map(view => (
            <button
              key={view.id}
              type="button"
              className={`rounded-t-md px-3 py-2 text-sm ${
                activeTabId === view.id
                  ? 'border border-b-0 border-border bg-secondary font-semibold text-foreground'
                  : 'text-muted-foreground'
              }`}
              onClick={() => switchTab(view.id)}
            >
              {view.name}
              {!view.isOwner ? ` (${t('allEmployees.views.shared')})` : ''}
            </button>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={createSavedViewMutation.isPending}
            onClick={() => setIsNewViewDialogOpen(true)}
          >
            {t('allEmployees.views.new')}
          </Button>
          {activeSavedView?.isOwner && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!isOwnedTabDirty || updateSavedViewMutation.isPending}
                onClick={() => void saveCurrentOwnedView()}
              >
                {t('allEmployees.views.saveChanges')}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={updateSavedViewMutation.isPending}
                onClick={() => {
                  const name = promptForName(t('allEmployees.views.renamePrompt'))
                  if (name) {
                    void renameCurrentOwnedView(name)
                  }
                }}
              >
                {t('allEmployees.views.rename')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={deleteSavedViewMutation.isPending}
                onClick={() => {
                  if (
                    activeSavedView &&
                    window.confirm(
                      t('allEmployees.views.deleteConfirm', {
                        name: activeSavedView.name,
                      }),
                    )
                  ) {
                    void deleteCurrentOwnedView()
                  }
                }}
              >
                {t('allEmployees.views.delete')}
              </Button>
            </>
          )}
          {activeSavedView && !activeSavedView.isOwner && (
            <span className="text-xs text-muted-foreground">
              {t('allEmployees.views.readOnly')}
            </span>
          )}
        </div>
      )}

      {isNewViewDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="presentation">
          <div
            className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-card-foreground shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-view-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="new-view-title" className="text-lg font-semibold">{t('allEmployees.views.newTitle')}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{t('allEmployees.views.newDescription')}</p>
              </div>
              <button type="button" aria-label={t('allEmployees.views.cancel')} className="rounded p-1 hover:bg-muted" onClick={() => setIsNewViewDialogOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <label className="mt-5 block space-y-1 text-sm font-medium">
              <span>{t('allEmployees.views.nameLabel')}</span>
              <input
                autoFocus
                value={newViewName}
                onChange={event => setNewViewName(event.target.value)}
                onKeyDown={event => { if (event.key === 'Enter') createNewView() }}
                placeholder={t('allEmployees.views.namePlaceholder')}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-foreground"
              />
            </label>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsNewViewDialogOpen(false)}>{t('allEmployees.views.cancel')}</Button>
              <Button type="button" disabled={!newViewName.trim() || createSavedViewMutation.isPending} onClick={createNewView}>{t('allEmployees.views.create')}</Button>
            </div>
          </div>
        </div>
      )}

      <div className="hidden">
        {hasActiveFilters && (
          <Button type="button" variant="ghost" onClick={clearFilters}>
            {t('allEmployees.filters.clear')}
          </Button>
        )}
        {showSavedViews && (
          <Button
            type="button"
            variant="outline"
            data-testid="export-xlsx"
            disabled={exportEmployeesMutation.isPending}
            onClick={() => void exportCurrentView()}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{t('allEmployees.export.button')}</span>
          </Button>
        )}
        {filterableCustomFields.map(field => (
          <label key={field.key} className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{field.label}</span>
            <span className="relative">
              <input
                className={filterInputClassName}
                value={customFieldFilters[field.key] ?? ''}
                onChange={event => setCustomFieldFilter(field.key, event.target.value)}
              />
              {(customFieldFilters[field.key] ?? '').trim() && (
                <button
                  type="button"
                  aria-label={t('allEmployees.filters.clearFilter')}
                  title={t('allEmployees.filters.clearField', {
                    field: field.label,
                  })}
                  className={filterClearButtonClassName}
                  onClick={() => setCustomFieldFilter(field.key, '')}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              )}
            </span>
          </label>
        ))}
        <div className="relative ml-auto">
          <Button type="button" variant="outline" onClick={() => setPickerOpen(open => !open)}>
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">{t('allEmployees.columns.manage')}</span>
          </Button>
          {pickerOpen && (
            <div className="absolute right-0 z-10 mt-2 w-72 rounded-md border border-border bg-popover p-3 shadow-md">
              <p className="mb-2 text-sm font-medium text-popover-foreground">{t('allEmployees.columns.title')}</p>
              <div className="flex max-h-64 flex-col gap-2 overflow-auto">
                {columnableFields.map(field => (
                  <label key={field.key} className="flex items-center gap-2 text-sm text-foreground">
                    <input type="checkbox" checked={visibleColumns.some(column => column.key === field.key)} onChange={() => toggleColumn(field.key)} />
                    {field.label}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {catalogQuery.isError ? (
        <p className="text-destructive">{t('allEmployees.errors.catalog')}</p>
      ) : catalogQuery.isLoading || listQuery.isLoading ? (
        <p className="text-muted-foreground">{t('allEmployees.loading')}</p>
      ) : listQuery.isError ? (
        <p className="text-destructive">{t('allEmployees.errors.load')}</p>
      ) : (
        <>
          <div className="max-h-[65vh] overflow-auto rounded-lg border border-border [scrollbar-gutter:stable]">
            <div className="min-w-max">
              <div className="sticky top-0 z-20 flex min-w-max items-center justify-between gap-3 border-b border-border bg-card px-4 py-2 shadow-sm">
                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                  {showSavedViews && (
                    <select
                      aria-label={t('allEmployees.views.menu')}
                      className="w-96 max-w-full shrink-0 rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground"
                      value={activeTabId}
                      onChange={event => {
                        const nextViewId = event.target.value
                        if (nextViewId === createViewOptionValue) {
                          setIsNewViewDialogOpen(true)
                          return
                        }
                        switchTab(nextViewId)
                      }}
                    >
                      <option value="all">{t('allEmployees.views.all')}</option>
                      {(savedViewsQuery.data ?? []).map(view => (
                        <option key={view.id} value={view.id}>
                          {view.name}
                          {!view.isOwner ? ` (${t('allEmployees.views.shared')})` : ''}
                        </option>
                      ))}
                      <option disabled value="__views_separator__">
                        ─────────────
                      </option>
                      <option value={createViewOptionValue}>{t('allEmployees.views.createMenuItem')}</option>
                    </select>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {activeSavedView?.isOwner && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={t('allEmployees.views.delete')}
                      title={t('allEmployees.views.delete')}
                      disabled={deleteSavedViewMutation.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            t('allEmployees.views.deleteConfirm', {
                              name: activeSavedView.name,
                            }),
                          )
                        ) {
                          void deleteCurrentOwnedView()
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                  <div className="relative">
                    <Button type="button" variant="ghost" size="sm" aria-label={t('allEmployees.columns.manage')} title={t('allEmployees.columns.manage')} onClick={() => setPickerOpen(open => !open)}>
                      <Settings2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                    {pickerOpen && <div className="absolute right-0 z-10 mt-2 w-72 rounded-md border border-border bg-popover p-3 shadow-md"><p className="mb-2 text-sm font-medium text-popover-foreground">{t('allEmployees.columns.title')}</p>{columnableFields.map(field => <label key={field.key} className="flex items-center gap-2 text-sm text-foreground"><input type="checkbox" checked={visibleColumns.some(column => column.key === field.key)} onChange={() => toggleColumn(field.key)} />{field.label}</label>)}</div>}
                  </div>
                  {showSavedViews && <Button type="button" variant="ghost" size="sm" data-testid="export-xlsx" aria-label={t('allEmployees.export.button')} title={t('allEmployees.export.button')} disabled={exportEmployeesMutation.isPending} onClick={() => void exportCurrentView()}><Download className="h-4 w-4" aria-hidden="true" /></Button>}
                </div>
              </div>
            <table className="w-full min-w-max text-sm">
              <thead className="sticky top-10 z-10 bg-muted text-muted-foreground shadow-sm">
                <tr>
                  {visibleColumns.map(column => (
                    <th key={column.key} className="min-w-40 px-4 py-2 text-left font-medium">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded px-1 py-1 hover:bg-background hover:text-foreground"
                        onClick={() => {
                          if (sortBy === column.key) {
                            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
                          } else if (['fullName', 'position', 'departmentName', 'countryCity'].includes(column.key)) {
                            setSortBy(column.key as typeof sortBy)
                            setSortDirection('asc')
                          }
                        }}
                        title={t('allEmployees.sort.clickToSort')}
                      >
                        {column.label}
                        {sortBy === column.key
                          ? sortDirection === 'asc' ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />
                          : <ArrowUpDown className="h-3.5 w-3.5 opacity-50" />}
                      </button>
                      {['fullName', 'position', 'departmentName', 'countryCity'].includes(column.key) && (
                        <div className="mt-1">
                          {column.key === 'departmentName' ? (
                            <select className="w-full rounded border border-input bg-background px-2 py-1 text-xs font-normal text-foreground" value={departmentId} onClick={event => event.stopPropagation()} onChange={event => setDepartmentId(event.target.value)}>
                              <option value="">{t('allEmployees.filters.allDepartments')}</option>
                              {departmentOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                            </select>
                          ) : (
                            <input
                              className="w-full rounded border border-input bg-background px-2 py-1 text-xs font-normal text-foreground"
                              value={column.key === 'fullName' ? fullName : column.key === 'position' ? position : countryCity}
                              onClick={event => event.stopPropagation()}
                              onChange={event => {
                                if (column.key === 'fullName') setFullName(event.target.value)
                                else if (column.key === 'position') setPosition(event.target.value)
                                else setCountryCity(event.target.value)
                              }}
                              placeholder={t('allEmployees.filters.search')}
                            />
                          )}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(listQuery.data?.items ?? []).map(row => (
                  <tr
                    key={row.personId}
                    className={`border-t border-border ${
                      isRowNavigationEnabled ? 'cursor-pointer hover:bg-muted/40' : ''
                    }`}
                    onClick={
                      isRowNavigationEnabled
                        ? () => navigate(`/people/${row.personId}`)
                        : undefined
                    }
                  >
                    {visibleColumns.map(column => (
                      <td key={column.key} className="px-4 py-3 text-foreground">
                        <InlineEditableCell
                          field={column}
                          value={row.values[column.key]}
                          editable={row.editableFields.includes(column.key)}
                          saving={patchMutation.isPending}
                          onSave={value => saveField(row.personId, column.key, value)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {t('allEmployees.pagination.summary', {
                page: listQuery.data?.page ?? page,
                total: listQuery.data?.totalCount ?? 0,
              })}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={page <= 1}
                onClick={() => setPage(current => Math.max(1, current - 1))}
              >
                {t('allEmployees.pagination.previous')}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={page >= totalPages}
                onClick={() => setPage(current => current + 1)}
              >
                {t('allEmployees.pagination.next')}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
