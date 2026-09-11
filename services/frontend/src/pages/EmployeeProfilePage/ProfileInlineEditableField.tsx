import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface ProfileInlineEditableFieldProps {
  value: string | null | undefined
  editable: boolean
  saving: boolean
  onSave: (nextValue: unknown) => Promise<void>
}

const toDraft = (value: string | null | undefined): string => {
  if (value === null || value === undefined) {
    return ''
  }
  return value
}

export const ProfileInlineEditableField = ({
  value,
  editable,
  saving,
  onSave,
}: ProfileInlineEditableFieldProps) => {
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
      : value

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
    await onSave(nextValue)
  }

  if (!editing) {
    return (
      <button
        type="button"
        className="w-full rounded px-1 py-0.5 text-left hover:bg-muted"
        onClick={startEditing}
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
          setEditing(false)
          setDraft(toDraft(value))
        }
      }}
      disabled={saving}
    />
  )
}
