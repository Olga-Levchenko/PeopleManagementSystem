import { LogOut, Menu } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { useLayout } from '@/contexts/LayoutContext'
import { Button } from '@/components/ui/button'
import { Logo } from './components/Logo/Logo'

interface MainHeaderProps {
  showMenuButton?: boolean
}

export const MainHeader = ({ showMenuButton = false }: MainHeaderProps) => {
  const { openMobileSidebar } = useLayout()
  const { user, signOut } = useAuth()

  return (
    <header
      className="flex items-center justify-between border-b border-sidebar-border bg-sidebar"
      style={{ height: 'var(--header-height)' }}
    >
      <div className="flex items-center">
        {showMenuButton && (
          <button
            onClick={openMobileSidebar}
            className="flex h-full items-center px-3 text-sidebar-foreground hover:bg-sidebar-accent transition-colors md:hidden"
            aria-label="Open menu"
            data-testid="mobile-menu-button"
          >
            <Menu className="h-5 w-5" />
          </button>
        )}
        <Logo />
      </div>

      {user && (
        <div className="flex items-center gap-3 px-4">
          <span className="text-sm text-sidebar-foreground">{user.email ?? user.sub}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void signOut()}
            className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <LogOut className="h-4 w-4" />
            <span className="ml-1.5">Sign out</span>
          </Button>
        </div>
      )}
    </header>
  )
}
