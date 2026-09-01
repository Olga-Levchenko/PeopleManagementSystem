import { useState } from 'react'
import { Network } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  changeDepartment,
  changeDepartmentManager,
  changeManager,
  changePeoplePartner,
} from '@/api/organisationalRelationships'

type RelationshipForm = 'manager' | 'peoplePartner' | 'department' | 'departmentManager'

const forms: Array<{ type: RelationshipForm; targetLabel: string; inputLabel: string }> = [
  { type: 'manager', targetLabel: 'personId', inputLabel: 'managerId' },
  { type: 'peoplePartner', targetLabel: 'personId', inputLabel: 'peoplePartnerId' },
  { type: 'department', targetLabel: 'personId', inputLabel: 'departmentId' },
  { type: 'departmentManager', targetLabel: 'departmentId', inputLabel: 'managerId' },
]

export const OrganisationalRelationshipsPage = () => {
  const { t } = useTranslation()
  const [values, setValues] = useState<Record<RelationshipForm, { target: string; related: string }>>(
    Object.fromEntries(forms.map(form => [form.type, { target: '', related: '' }])) as Record<
      RelationshipForm,
      { target: string; related: string }
    >,
  )
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState<RelationshipForm | null>(null)

  const submit = async (type: RelationshipForm) => {
    const value = values[type]
    setBusy(type)
    setMessage('')
    try {
      if (type === 'manager') await changeManager(value.target, value.related || undefined)
      if (type === 'peoplePartner') await changePeoplePartner(value.target, value.related || undefined)
      if (type === 'department') await changeDepartment(value.target, value.related || null)
      if (type === 'departmentManager') {
        await changeDepartmentManager(value.target, value.related || undefined)
      }
      setMessage(t('relationships.success'))
    } catch {
      setMessage(t('relationships.error'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 border-b border-border pb-4">
        <Network className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold text-foreground">{t('relationships.title')}</h1>
      </div>
      <p className="text-muted-foreground">{t('relationships.description')}</p>
      <div className="grid gap-4 md:grid-cols-2">
        {forms.map(form => (
          <section className="space-y-4 rounded-lg border border-border bg-card p-5" key={form.type}>
            <h2 className="text-lg font-semibold">{t(`relationships.${form.type}.title`)}</h2>
            <label className="block space-y-1 text-sm">
              <span>{t(`relationships.fields.${form.targetLabel}`)}</span>
              <input
                className="w-full rounded-md border border-input bg-background px-3 py-2"
                value={values[form.type].target}
                onChange={event =>
                  setValues(current => ({
                    ...current,
                    [form.type]: { ...current[form.type], target: event.target.value },
                  }))
                }
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span>{t(`relationships.fields.${form.inputLabel}`)}</span>
              <input
                className="w-full rounded-md border border-input bg-background px-3 py-2"
                value={values[form.type].related}
                onChange={event =>
                  setValues(current => ({
                    ...current,
                    [form.type]: { ...current[form.type], related: event.target.value },
                  }))
                }
              />
            </label>
            <Button
              disabled={busy !== null}
              onClick={() => void submit(form.type)}
            >
              {busy === form.type ? t('relationships.saving') : t('relationships.save')}
            </Button>
          </section>
        ))}
      </div>
      {message && <p role="status">{message}</p>}
    </div>
  )
}
