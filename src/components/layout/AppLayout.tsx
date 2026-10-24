import { useState } from 'react'
import { Outlet } from 'react-router'
import { Sheet } from '@/components/ui/Sheet'
import { TooltipProvider } from '@/components/ui/Tooltip'
import { useStoredPreference } from '@/lib/preferences'
import { BackgroundServices } from './BackgroundServices'
import { BackupBanner } from './BackupBanner'
import { CommandPalette } from './CommandPalette'
import { ImportTray } from './ImportTray'
import { PreviewNotice } from './PreviewNotice'
import { Sidebar, SidebarContent } from './Sidebar'
import { Topbar } from './Topbar'

export function AppLayout() {
  const [collapsed, setCollapsed] = useStoredPreference('ged.sidebarCollapsed', false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)

  return (
    <TooltipProvider>
      <div className="flex min-h-dvh">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
        <Sheet open={menuOpen} onOpenChange={setMenuOpen} side="left" title="Menu">
          <SidebarContent onNavigate={() => setMenuOpen(false)} />
        </Sheet>
        <div className="flex min-w-0 flex-1 flex-col">
          <PreviewNotice />
          <Topbar onOpenMenu={() => setMenuOpen(true)} onOpenSearch={() => setSearchOpen(true)} />
          <BackupBanner />
          <main className="min-w-0 flex-1 p-4 lg:p-6">
            <Outlet />
          </main>
        </div>
      </div>
      <ImportTray />
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
      <BackgroundServices />
    </TooltipProvider>
  )
}
