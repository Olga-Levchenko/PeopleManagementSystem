import { useState } from 'react'
import { Pencil, X, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import {
  changeManager,
  changePeoplePartner,
  changeDepartment,
  getRelationshipChangeError,
} from '@/api/organisationalRelationships'
import { employeeProfileQueryKey } from '@/api/hooks/useEmployeeProfile'
import {
  PersonSearchCombobox,
  type PersonOption,
} from '@/pages/AdministrationPage/components/PersonSearchCombobox'
import {
  DepartmentSearchCombobox,
  type DepartmentOption,
} from './DepartmentSearchCombobox'

type RelationshipType = 'manager' | 'peoplePartner' | 'department'

interface ProfileRelationshipEditFieldProps {
  label: string
  displayValue: string | null
  type: RelationshipType
  subjectPersonId: string
  canEdit: boolean
}

export const ProfileRelationshipEditField = ({
  label,
  displayValue,
  type,
  subjectPersonId,
  canEdit,
}: ProfileRelationshipEditFieldProps) => {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [selectedPerson, setSelectedPerson] = useState<PersonOption | null>(null)
  const [selectedDepartment, setSelectedDepartment] = useState<DepartmentOption | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedMessage, setSavedMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  const resetEditState = () => {
    setEditing(false)
    setSelectedPerson(null)
    setSelectedDepartment(null)
    setSavedMessage('')
    setErrorMessage('')
  }

  const handleSave = async () => {
    setSaving(true)
    setErrorMessage('')
    try {
      if (type === 'manager') {
        await changeManager(subjectPersonId, selectedPerson?.personId || undefined)
      } else if (type === 'peoplePartner') {
        await changePeoplePartner(subjectPersonId, selectedPerson?.personId || undefined)
      } else {
        await changeDepartment(subjectPersonId, selectedDepartment?.id ?? null)
      }
      await queryClient.invalidateQueries({
        queryKey: employeeProfileQueryKey(subjectPersonId),
      })
      setSavedMessage(t('employeeProfile.relationships.saved'))
      setEditing(false)
    } catch (error) {
      setErrorMessage(
        t(`employeeProfile.relationships.errors.${getRelationshipChangeError(error)}`),
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-foreground">
        {!editing ? (
          <div className="flex items-center justify-between gap-2">
            <span>{displayValue ?? '—'}</span>
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setSavedMessage('')
                  setEditing(true)
                }}
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={`${t('employeeProfile.relationships.edit')} ${label}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ) : (
          <div className="mt-1 space-y-2">
            {type === 'department' ? (
              <DepartmentSearchCombobox
                value={selectedDepartment}
                onChange={setSelectedDepartment}
              />
            ) : (
              <PersonSearchCombobox value={selectedPerson} onChange={setSelectedPerson} />
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                <Check className="h-3 w-3" />
                {saving
                  ? t('employeeProfile.relationships.saving')
                  : t('employeeProfile.relationships.save')}
              </button>
              <button
                type="button"
                onClick={resetEditState}
                className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
                {t('employeeProfile.relationships.cancel')}
              </button>
            </div>
            {errorMessage && (
              <p className="text-xs text-destructive" role="alert">{errorMessage}</p>
            )}
          </div>
        )}
        {savedMessage && !editing && (
          <p className="mt-0.5 text-xs text-muted-foreground">{savedMessage}</p>
        )}
      </dd>
    </div>
  )
}
