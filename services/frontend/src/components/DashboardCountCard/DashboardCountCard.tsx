import { cn } from '@/lib/utils'

interface DashboardCountCardProps {
  label: string
  count: number
  emphasized?: boolean
  active?: boolean
  onClick?: () => void
}

export const DashboardCountCard = ({
  label,
  count,
  emphasized = false,
  active = false,
  onClick,
}: DashboardCountCardProps) => {
  return (
    <button
      type="button"
      aria-pressed={active}
      className="rounded-lg border border-border bg-card p-4 text-left w-full"
      onClick={onClick}
    >
      <span className="block text-sm text-muted-foreground">{label}</span>
      <span className={cn('text-2xl', emphasized ? 'font-bold' : 'font-semibold')}>{count}</span>
    </button>
  )
}
