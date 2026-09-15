import { useState } from 'react'
import { Network } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  changeDepartmentManager,
  getRelationshipChangeError,
} from '@/api/organisationalRelationships'

export const OrganisationalRelationshipsPage = () => {
  const { t } = useTranslation()
  const [departmentId, setDepartmentId] = useState('')
  const [managerId, setManagerId] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    setMessage('')
    try {
      await changeDepartmentManager(departmentId, managerId || undefined)
      setMessage(t('relationships.success'))
    } catch (error) {
      setMessage(t(`relationships.errors.${getRelationshipChangeError(error)}`))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 border-b border-border pb-4">
        <Network className="h-6 w-6 text-primary" />
        <h1 className="text-3xl font-bold text-foreground">{t('relationships.title')}</h1>
      </div>
      <p className="text-muted-foreground">{t('relationships.departmentManagerDescription')}</p>
      <section className="space-y-4 rounded-lg border border-border bg-card p-5">
        <h2 className="text-lg font-semibold">{t('relationships.departmentManager.title')}</h2>
        <label className="block space-y-1 text-sm">
          <span>{t('relationships.fields.departmentId')}</span>
          <input
            className="w-full rounded-md border border-input bg-background px-3 py-2"
            value={departmentId}
            onChange={event => setDepartmentId(event.target.value)}
          />
        </label>
        <label className="block space-y-1 text-sm">
          <span>{t('relationships.fields.managerId')}</span>
          <input
            className="w-full rounded-md border border-input bg-background px-3 py-2"
            value={managerId}
            onChange={event => setManagerId(event.target.value)}
          />
        </label>
        <Button disabled={busy || !departmentId} onClick={() => void submit()}>
          {busy ? t('relationships.saving') : t('relationships.save')}
        </Button>
      </section>
      {message && <p role="status">{message}</p>}
    </div>
  )
}
