import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { EmployeeFieldCatalogEntry } from '@/api/employees'

interface InlineEditableCellProps {
  field: EmployeeFieldCatalogEntry
  value: string | number | null | undefined
  editable: boolean
  saving: boolean
  onSave: (nextValue: unknown) => Promise<void>
}

const toDraft = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) {
    return ''
  }
  return String(value)
}

export const InlineEditableCell = ({
  field,
  value,
  editable,
  saving,
  onSave,
}: InlineEditableCellProps) => {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
    }
  }, [editing])

  const displayValue =
    value === null || value === undefined || value === ''
      ? t('common.notAvailable')
      : String(value)

  if (!editable) {
    return <span>{displayValue}</span>
  }

  const startEditing = () => {
    setDraft(toDraft(value))
    setEditing(true)
  }

  const commit = async () => {
    setEditing(false)
    const nextValue = draft.trim() === '' ? null : draft
    if (nextValue === (value === undefined ? null : value)) {
      return
    }
    await onSave(field.dataType === 'number' ? Number(nextValue) : nextValue)
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="w-full rounded px-1 py-0.5 text-left hover:bg-muted"
        onClick={event => {
          event.stopPropagation()
          startEditing()
        }}
        disabled={saving}
      >
        {displayValue}
      </button>
    )
  }

  return (
    <input
      ref={inputRef}
      className="w-full rounded-md border border-input bg-background px-2 py-1 text-foreground"
      value={draft}
      type={field.dataType === 'number' ? 'number' : field.dataType === 'date' ? 'date' : 'text'}
      disabled={saving}
      onClick={event => event.stopPropagation()}
      onChange={event => setDraft(event.target.value)}
      onBlur={() => {
        void commit()
      }}
      onKeyDown={event => {
        if (event.key === 'Enter') {
          event.preventDefault()
          void commit()
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          setEditing(false)
        }
      }}
    />
  )
}
