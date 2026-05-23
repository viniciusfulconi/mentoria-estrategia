'use client'
import { createContext, useContext, useState, useEffect } from 'react'

type SidebarCtx = { open: boolean; toggle: () => void }
const SidebarContext = createContext<SidebarCtx>({ open: true, toggle: () => {} })
export const useSidebar = () => useContext(SidebarContext)

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('sidebar')
    if (saved === 'closed') setOpen(false)
  }, [])

  function toggle() {
    setOpen(v => {
      const next = !v
      localStorage.setItem('sidebar', next ? 'open' : 'closed')
      return next
    })
  }

  return (
    <SidebarContext.Provider value={{ open, toggle }}>
      <div className={`app-shell${open ? '' : ' sidebar-collapsed'}`}>
        {children}
      </div>
    </SidebarContext.Provider>
  )
}
