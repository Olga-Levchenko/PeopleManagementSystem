import { useState } from 'react'
import { ShieldCheck, Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { type CustomFieldDefinitionError } from '@/api/customFieldDefinitions'
import { type FunctionalRoleError } from '@/api/functionalRoles'
import { useCustomFieldDefinitions } from './hooks/useCustomFieldDefinitions'
import { useFunctionalRoles } from './hooks/useFunctionalRoles'

const EMPTY_SCOPE = ''

const scopeLabel = (scope: string | null) => {
  if (!scope) {
    return ''
  }

  try {
    const parsed: unknown = JSON.parse(scope)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'dashboardType' in parsed &&
      typeof parsed.dashboardType === 'string'
    ) {
      return parsed.dashboardType
    }
  } catch {
    return ''
  }

  return ''
}

export const AdministrationPage = () => {
  const { t } = useTranslation()
  const state = useFunctionalRoles()
  const cfState = useCustomFieldDefinitions()

  // Custom field definition form state
  const [newCfName, setNewCfName] = useState('')
  const [newCfDataType, setNewCfDataType] = useState('')
  const [newCfVisibility, setNewCfVisibility] = useState('')
  const [editCfId, setEditCfId] = useState<string | null>(null)
  const [editCfName, setEditCfName] = useState('')
  const [editCfVisibility, setEditCfVisibility] = useState('')

  const cfErrorMessage = (error: CustomFieldDefinitionError | null) =>
    error ? t(`customFields.errors.${error}`) : null

  const submitCreateCf = async () => {
    if (!newCfName || !newCfDataType || !newCfVisibility) {
      return
    }
    const success = await cfState.create(
      newCfName,
      newCfDataType as import('@/api/customFieldDefinitions').CustomFieldDataType,
      newCfVisibility as import('@/api/customFieldDefinitions').CustomFieldVisibility,
    )
    if (success) {
      setNewCfName('')
      setNewCfDataType('')
      setNewCfVisibility('')
    }
  }

  const submitUpdateCf = async (id: string) => {
    const patch: { name?: string; visibility?: import('@/api/customFieldDefinitions').CustomFieldVisibility } = {}
    if (editCfName) patch.name = editCfName
    if (editCfVisibility) patch.visibility = editCfVisibility as import('@/api/customFieldDefinitions').CustomFieldVisibility
    const success = await cfState.update(id, patch)
    if (success) setEditCfId(null)
  }

  const submitDeactivateCf = async (id: string) => {
    if (window.confirm(t('customFields.confirm.deactivate'))) {
      await cfState.deactivate(id)
    }
  }

  const [newRoleKey, setNewRoleKey] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [editDisplayName, setEditDisplayName] = useState('')
  const [permissionKey, setPermissionKey] = useState('')
  const [dashboardType, setDashboardType] = useState(EMPTY_SCOPE)
  const [personId, setPersonId] = useState('')
  const [assignmentRoleKey, setAssignmentRoleKey] = useState('')

  const errorMessage = (error: FunctionalRoleError | null) =>
    error ? t(`administration.errors.${error}`) : null
  const selectedRole = state.selectedRole
  const selectedPermission = state.catalogue.find(
    permission => permission.permissionKey === permissionKey
  )
  const roleGrants = state.grants.filter(
    grantValue => grantValue.roleKey === selectedRole?.roleKey
  )
  const assignmentsAreCurrent = state.assignmentPersonId === personId
  const scope = selectedPermission?.requiresScope
    ? dashboardType
      ? { dashboardType }
      : null
    : null

  const submitCreate = async () => {
    if (await state.createRole(newRoleKey, newDisplayName)) {
      setNewRoleKey('')
      setNewDisplayName('')
    }
  }

  const submitUpdate = async () => {
    if (selectedRole) {
      await state.updateRole(selectedRole.roleKey, editDisplayName)
    }
  }

  const submitGrant = async () => {
    if (selectedRole && permissionKey) {
      if (!window.confirm(t('administration.confirm.grant'))) {
        return
      }
      await state.grant(selectedRole.roleKey, permissionKey, scope)
    }
  }

  const submitRevoke = async (
    grantRoleKey: string,
    grantPermissionKey: string,
    grantScope: string | null
  ) => {
    if (window.confirm(t('administration.confirm.revokePermission'))) {
      await state.revoke(grantRoleKey, grantPermissionKey, grantScope)
    }
  }

  const submitAssign = async () => {
    if (personId && assignmentRoleKey) {
      if (!window.confirm(t('administration.confirm.assign'))) {
        return
      }
      await state.assign(personId, assignmentRoleKey)
    }
  }

  const submitRevokeAssignment = async (roleKey: string) => {
    if (window.confirm(t('administration.confirm.revokeAssignment'))) {
      await state.revokeAssignment(personId, roleKey)
    }
  }

  return (
    <div className="space-y-6" data-testid="administration-page">
      <header className="flex items-center gap-2 border-b border-border pb-4">
        <Settings className="h-6 w-6 text-primary" aria-hidden="true" />
        <div>
          <h1 className="text-3xl font-bold text-foreground">{t('administration.title')}</h1>
          <p className="text-muted-foreground">{t('administration.description')}</p>
        </div>
      </header>

      {state.loading && <p role="status">{t('administration.loading')}</p>}
      {state.loadError && (
        <p className="text-destructive" role="alert">
          {errorMessage(state.loadError)}
        </p>
      )}

      <section className="space-y-4 rounded-lg border border-border bg-card p-5">
        <h2 className="text-xl font-semibold">{t('administration.create.title')}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>{t('administration.fields.roleKey')}</span>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2"
              value={newRoleKey}
              onChange={event => setNewRoleKey(event.target.value)}
              aria-label={t('administration.fields.roleKey')}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('administration.fields.displayName')}</span>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2"
              value={newDisplayName}
              onChange={event => setNewDisplayName(event.target.value)}
              aria-label={t('administration.fields.displayName')}
            />
          </label>
        </div>
        <Button onClick={() => void submitCreate()} disabled={state.mutation.busy}>
          {t('administration.actions.create')}
        </Button>
        {state.mutation.error && (
          <p className="text-destructive" role="alert">
            {errorMessage(state.mutation.error)}
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(14rem,20rem)_1fr]">
        <section className="space-y-3 rounded-lg border border-border bg-card p-5">
          <h2 className="text-xl font-semibold">{t('administration.roles.title')}</h2>
          <div className="space-y-2" role="list" aria-label={t('administration.roles.title')}>
            {state.roles.map(role => (
              <button
                className={`w-full rounded-md border px-3 py-2 text-left ${
                  selectedRole?.roleKey === role.roleKey
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:bg-muted'
                }`}
                key={role.id}
                onClick={() => {
                  state.selectRole(role)
                  setEditDisplayName(role.displayName)
                }}
                type="button"
              >
                <span className="font-medium">{role.displayName}</span>
                <span className="block text-xs text-muted-foreground">{role.roleKey}</span>
                {role.isSeeded && (
                  <span className="block text-xs text-muted-foreground">
                    {t('administration.seeded')}
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>

        {selectedRole && (
          <section className="space-y-5 rounded-lg border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold">{selectedRole.displayName}</h2>
                <p className="text-sm text-muted-foreground">{selectedRole.roleKey}</p>
                {selectedRole.isSeeded && (
                  <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                    <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                    {t('administration.seededProtected')}
                  </p>
                )}
              </div>
              <span className="text-sm text-muted-foreground">
                {selectedRole.isActive ? t('administration.active') : t('administration.inactive')}
              </span>
            </div>

            <div className="space-y-3">
              <h3 className="font-semibold">{t('administration.edit.title')}</h3>
              <label className="space-y-1 text-sm">
                <span>{t('administration.fields.displayName')}</span>
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-2"
                  value={editDisplayName || selectedRole.displayName}
                  onChange={event => setEditDisplayName(event.target.value)}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => void submitUpdate()}
                  disabled={state.mutation.busy}
                >
                  {t('administration.actions.save')}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    if (window.confirm(t('administration.confirm.deactivate'))) {
                      void state.deactivateRole(
                        selectedRole.roleKey,
                        t('administration.deactivateReason')
                      )
                    }
                  }}
                  disabled={selectedRole.isSeeded || !selectedRole.isActive || state.mutation.busy}
                >
                  {t('administration.actions.deactivate')}
                </Button>
              </div>
            </div>

            <div className="space-y-3 border-t border-border pt-4">
              <h3 className="font-semibold">{t('administration.permissions.title')}</h3>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-sm">
                  <span>{t('administration.fields.permission')}</span>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2"
                    value={permissionKey}
                    onChange={event => {
                      setPermissionKey(event.target.value)
                      setDashboardType(EMPTY_SCOPE)
                    }}
                  >
                    <option value="">{t('administration.fields.choosePermission')}</option>
                    {state.catalogue.map(permission => (
                      <option key={permission.permissionKey} value={permission.permissionKey}>
                        {permission.permissionKey}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedPermission?.requiresScope && (
                  <label className="space-y-1 text-sm">
                    <span>{t('administration.fields.dashboardType')}</span>
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2"
                      value={dashboardType}
                      onChange={event => setDashboardType(event.target.value)}
                    >
                      <option value="">{t('administration.fields.chooseDashboard')}</option>
                      {[
                        'unit-manager',
                        'delivery-manager',
                        'project-manager',
                        'people-partner',
                      ].map(dashboard => (
                        <option key={dashboard} value={dashboard}>
                          {dashboard}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <Button
                onClick={() => void submitGrant()}
                disabled={
                  !permissionKey || (selectedPermission?.requiresScope === true && !dashboardType)
                }
              >
                {t('administration.actions.grant')}
              </Button>
              {roleGrants.length > 0 && (
                <ul className="space-y-2" aria-label={t('administration.permissions.current')}>
                  {roleGrants.map(grantValue => (
                    <li
                      className="flex items-center justify-between gap-2 rounded border p-2"
                      key={grantValue.id}
                    >
                      <span>
                        {grantValue.permissionKey}
                        {scopeLabel(grantValue.scope) && ` (${scopeLabel(grantValue.scope)})`}
                      </span>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() =>
                          void submitRevoke(
                            grantValue.roleKey,
                            grantValue.permissionKey,
                            grantValue.scope
                          )
                        }
                      >
                        {t('administration.actions.revoke')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}
      </div>

      <section className="space-y-4 rounded-lg border border-border bg-card p-5">
        <h2 className="text-xl font-semibold">{t('administration.assignments.title')}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span>{t('administration.fields.personId')}</span>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2"
              value={personId}
              onChange={event => {
                state.resetAssignments()
                setPersonId(event.target.value)
              }}
              aria-label={t('administration.fields.personId')}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>{t('administration.fields.assignmentRole')}</span>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2"
              value={assignmentRoleKey}
              onChange={event => setAssignmentRoleKey(event.target.value)}
            >
              <option value="">{t('administration.fields.chooseRole')}</option>
              {state.roles.map(role => (
                <option key={role.id} value={role.roleKey}>
                  {role.displayName}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void submitAssign()} disabled={state.assignmentState.busy}>
            {t('administration.actions.assign')}
          </Button>
          <Button
            variant="outline"
            onClick={() => void state.loadAssignments(personId)}
            disabled={!personId || state.assignmentState.busy}
          >
            {t('administration.actions.loadAssignments')}
          </Button>
        </div>
        {state.assignmentState.error && (
          <p className="text-destructive" role="alert">
            {errorMessage(state.assignmentState.error)}
          </p>
        )}
        {assignmentsAreCurrent && state.assignments.length > 0 && (
          <ul className="space-y-2" aria-label={t('administration.assignments.current')}>
            {state.assignments.map(assignment => (
              <li
                className="flex items-center justify-between gap-2 rounded border p-2"
                key={assignment.id}
              >
                <span>{assignment.roleKey}</span>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => void submitRevokeAssignment(assignment.roleKey)}
                >
                  {t('administration.actions.revoke')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Custom Field Definitions ── */}
      <section className="space-y-4 rounded-lg border border-border bg-card p-5" data-testid="custom-field-definitions">
        <h2 className="text-xl font-semibold">{t('customFields.title')}</h2>
        <p className="text-sm text-muted-foreground">{t('customFields.description')}</p>

        {cfState.loading && <p role="status">{t('customFields.loading')}</p>}
        {cfState.loadError && (
          <p className="text-destructive" role="alert">
            {cfErrorMessage(cfState.loadError)}
          </p>
        )}

        {/* Create form */}
        <div className="space-y-3 border-t border-border pt-4">
          <h3 className="font-semibold">{t('customFields.create.title')}</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span>{t('customFields.fields.name')}</span>
              <input
                className="w-full rounded-md border border-input bg-background px-3 py-2"
                value={newCfName}
                onChange={event => setNewCfName(event.target.value)}
                aria-label={t('customFields.fields.name')}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>{t('customFields.fields.dataType')}</span>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2"
                value={newCfDataType}
                onChange={event => setNewCfDataType(event.target.value)}
                aria-label={t('customFields.fields.dataType')}
              >
                <option value="">{t('customFields.fields.chooseDataType')}</option>
                {(['TEXT', 'NUMBER', 'DATE', 'BOOLEAN'] as const).map(dt => (
                  <option key={dt} value={dt}>
                    {t(`customFields.dataTypes.${dt}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span>{t('customFields.fields.visibility')}</span>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2"
                value={newCfVisibility}
                onChange={event => setNewCfVisibility(event.target.value)}
                aria-label={t('customFields.fields.visibility')}
              >
                <option value="">{t('customFields.fields.chooseVisibility')}</option>
                {(['MANAGEMENT', 'EMPLOYEE', 'COLLEAGUE'] as const).map(v => (
                  <option key={v} value={v}>
                    {t(`customFields.visibilities.${v}`)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Button
            onClick={() => void submitCreateCf()}
            disabled={!newCfName || !newCfDataType || !newCfVisibility || cfState.mutation.busy}
          >
            {t('customFields.actions.create')}
          </Button>
          {cfState.mutation.error && (
            <p className="text-destructive" role="alert">
              {cfErrorMessage(cfState.mutation.error)}
            </p>
          )}
        </div>

        {/* Definitions list */}
        {cfState.definitions.length > 0 && (
          <ul className="space-y-2" aria-label={t('customFields.title')}>
            {cfState.definitions.map(def => (
              <li
                className="rounded-lg border border-border bg-background p-4 space-y-3"
                key={def.id}
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <span className="font-medium">{def.name}</span>
                    <span className="ml-2 text-sm text-muted-foreground">
                      {t(`customFields.dataTypes.${def.dataType}`)}
                    </span>
                    <span className="ml-2 text-sm text-muted-foreground">
                      · {t(`customFields.visibilities.${def.visibility}`)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {def.isActive ? t('customFields.active') : t('customFields.inactive')}
                    </span>
                    {def.isActive && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditCfId(def.id)
                            setEditCfName(def.name)
                            setEditCfVisibility(def.visibility)
                          }}
                        >
                          {t('customFields.actions.edit')}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => void submitDeactivateCf(def.id)}
                          disabled={cfState.mutation.busy}
                        >
                          {t('customFields.actions.deactivate')}
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {editCfId === def.id && (
                  <div className="grid gap-3 md:grid-cols-2 border-t border-border pt-3">
                    <label className="space-y-1 text-sm">
                      <span>{t('customFields.fields.name')}</span>
                      <input
                        className="w-full rounded-md border border-input bg-background px-3 py-2"
                        value={editCfName}
                        onChange={event => setEditCfName(event.target.value)}
                      />
                    </label>
                    <label className="space-y-1 text-sm">
                      <span>{t('customFields.fields.visibility')}</span>
                      <select
                        className="w-full rounded-md border border-input bg-background px-3 py-2"
                        value={editCfVisibility}
                        onChange={event => setEditCfVisibility(event.target.value)}
                      >
                        {(['MANAGEMENT', 'EMPLOYEE', 'COLLEAGUE'] as const).map(v => (
                          <option key={v} value={v}>
                            {t(`customFields.visibilities.${v}`)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex gap-2 md:col-span-2">
                      <Button
                        onClick={() => void submitUpdateCf(def.id)}
                        disabled={cfState.mutation.busy}
                      >
                        {t('customFields.actions.save')}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setEditCfId(null)}
                      >
                        {t('customFields.actions.cancel')}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
