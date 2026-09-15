import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useEmployeeSearch } from '@/api/hooks/useEmployees'

export interface PersonOption {
  personId: string
  fullName: string
}

interface PersonSearchComboboxProps {
  value: PersonOption | null
  onChange: (value: PersonOption | null) => void
}

export const PersonSearchCombobox = ({ value, onChange }: PersonSearchComboboxProps) => {
  const { t } = useTranslation()
  const [inputText, setInputText] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // When value is set, display the full name; otherwise show what the user typed.
  const displayValue = value !== null ? value.fullName : inputText

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(inputText), 300)
    return () => clearTimeout(timer)
  }, [inputText])

  const searchQuery = value === null ? debouncedQuery : ''
  const { data, isFetching } = useEmployeeSearch(searchQuery)

  const options: PersonOption[] = (data?.items ?? []).map(row => ({
    personId: row.personId,
    fullName: String(row.values['fullName'] ?? ''),
  }))

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleInput = (text: string) => {
    setInputText(text)
    if (value !== null) {
      onChange(null)
    }
    setOpen(text.length >= 2)
  }

  const handleSelect = (option: PersonOption) => {
    onChange(option)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        className="w-full rounded-md border border-input bg-background px-3 py-2"
        value={displayValue}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => {
          if (inputText.length >= 2 && value === null) setOpen(true)
        }}
        placeholder={t('administration.fields.personSearchPlaceholder')}
        aria-label={t('administration.fields.personId')}
        autoComplete="off"
      />
      {open && (
        <ul
          className="absolute z-10 mt-1 w-full rounded-md border border-border bg-card shadow-md"
          role="listbox"
        >
          {isFetching && (
            <li className="px-3 py-2 text-sm text-muted-foreground">{t('common.loading')}</li>
          )}
          {!isFetching && options.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">{t('common.noResults')}</li>
          )}
          {!isFetching &&
            options.map(option => (
              <li
                key={option.personId}
                role="option"
                aria-selected={value?.personId === option.personId}
                className="cursor-pointer px-3 py-2 text-sm hover:bg-muted"
                onMouseDown={() => handleSelect(option)}
              >
                {option.fullName}
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}
