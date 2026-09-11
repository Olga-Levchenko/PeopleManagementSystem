import { Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { InlineEditableCell } from './InlineEditableCell'
import { useAllEmployeesPage } from './hooks/useAllEmployeesPage'

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
        <div className="flex flex-wrap items-center gap-2 border-b border-border pb-2">
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
            onClick={() => {
              const name = promptForName(t('allEmployees.views.newPrompt'))
              if (name) {
                void createViewFromCurrentState(name)
              }
            }}
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

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">{t('allEmployees.filters.countryCity')}</span>
          <input
            className="rounded-md border border-input bg-background px-3 py-2 text-foreground"
            value={countryCity}
            onChange={event => setCountryCity(event.target.value)}
          />
        </label>
        {showSavedViews && (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">{t('allEmployees.filters.yearsMin')}</span>
              <input
                type="number"
                min={0}
                className="rounded-md border border-input bg-background px-3 py-2 text-foreground"
                value={yearsMin}
                onChange={event => setYearsMin(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground">{t('allEmployees.filters.yearsMax')}</span>
              <input
                type="number"
                min={0}
                className="rounded-md border border-input bg-background px-3 py-2 text-foreground"
                value={yearsMax}
                onChange={event => setYearsMax(event.target.value)}
              />
            </label>
          </>
        )}
        {filterableCustomFields.map(field => (
          <label key={field.key} className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{field.label}</span>
            <input
              className="rounded-md border border-input bg-background px-3 py-2 text-foreground"
              value={customFieldFilters[field.key] ?? ''}
              onChange={event => setCustomFieldFilter(field.key, event.target.value)}
            />
          </label>
        ))}
        <Button type="button" onClick={applyFilters}>{t('allEmployees.filters.apply')}</Button>
        {showSavedViews && (
          <Button
            type="button"
            variant="outline"
            data-testid="export-xlsx"
            disabled={exportEmployeesMutation.isPending}
            onClick={() => void exportCurrentView()}
          >
            {t('allEmployees.export.button')}
          </Button>
        )}
        <div className="relative ml-auto">
          <Button type="button" variant="outline" onClick={() => setPickerOpen(open => !open)}>
            {t('allEmployees.columns.manage')}
          </Button>
          {pickerOpen && (
            <div className="absolute right-0 z-10 mt-2 w-72 rounded-md border border-border bg-popover p-3 shadow-md">
              <p className="mb-2 text-sm font-medium text-popover-foreground">
                {t('allEmployees.columns.title')}
              </p>
              <div className="flex max-h-64 flex-col gap-2 overflow-auto">
                {columnableFields.map(field => (
                  <label key={field.key} className="flex items-center gap-2 text-sm text-foreground">
                    <input
                      type="checkbox"
                      checked={visibleColumns.some(column => column.key === field.key)}
                      onChange={() => toggleColumn(field.key)}
                    />
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
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full text-sm">
              <thead className="bg-muted text-muted-foreground">
                <tr>
                  {visibleColumns.map(column => (
                    <th key={column.key} className="px-4 py-3 text-left font-medium">
                      {column.label}
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
