import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { DepartmentOption } from '@/api/departments'
import { useDepartmentSearch } from '@/api/hooks/useDepartments'

export type { DepartmentOption }

interface DepartmentSearchComboboxProps {
  value: DepartmentOption | null
  onChange: (value: DepartmentOption | null) => void
}

export const DepartmentSearchCombobox = ({
  value,
  onChange,
}: DepartmentSearchComboboxProps) => {
  const { t } = useTranslation()
  const [inputText, setInputText] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const displayValue = value !== null ? (value.name ?? value.id) : inputText

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(inputText), 300)
    return () => clearTimeout(timer)
  }, [inputText])

  const searchQuery = value === null ? debouncedQuery : ''
  const { data, isFetching } = useDepartmentSearch(searchQuery)
  const options = data ?? []

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
    if (value !== null) onChange(null)
    setOpen(text.length >= 2)
  }

  const handleSelect = (option: DepartmentOption) => {
    onChange(option)
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        value={displayValue}
        onChange={e => handleInput(e.target.value)}
        onFocus={() => {
          if (inputText.length >= 2 && value === null) setOpen(true)
        }}
        placeholder={t('employeeProfile.relationships.departmentPlaceholder')}
        aria-label={t('employeeProfile.fields.department')}
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
                key={option.id}
                role="option"
                aria-selected={value?.id === option.id}
                className="cursor-pointer px-3 py-2 text-sm hover:bg-muted"
                onMouseDown={() => handleSelect(option)}
              >
                {option.name ?? option.id}
              </li>
            ))}
        </ul>
      )}
    </div>
  )
}
