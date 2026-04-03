import React from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAppStore } from '@/store/appStore'
import clsx from 'clsx'

export default function AppShell() {
  const { ui, toggleSidebar } = useAppStore()
  const location = useLocation()
  const navigate = useNavigate()
  const isGamePage = location.pathname.startsWith('/game/')

  return (
    <div className="flex flex-col h-full bg-ink-950">
      {/* Title bar drag region (Electron macOS) */}
      <div className="h-8 drag-region flex items-center px-4 bg-ink-950 border-b border-ink-800">
        <div className="no-drag flex items-center gap-3 ml-20">
          <span className="font-display text-sm text-parchment-400 tracking-widest uppercase">
            Vellicore
          </span>
        </div>
        <div className="no-drag ml-auto flex items-center gap-2">
          {!isGamePage && (
            <>
              <NavButton onClick={() => navigate('/lobby')} active={location.pathname === '/lobby'}>
                Campaigns
              </NavButton>
              <NavButton onClick={() => navigate('/petricore')} active={location.pathname === '/petricore'}>
                Petricore
              </NavButton>
              <NavButton onClick={() => navigate('/settings')} active={location.pathname === '/settings'}>
                Settings
              </NavButton>
            </>
          )}
        </div>
      </div>

      {/* Page content */}
      <div className="flex-1 overflow-hidden">
        <Outlet />
      </div>
    </div>
  )
}

function NavButton({ children, onClick, active }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-3 py-1 rounded text-xs font-ui transition-colors',
        active
          ? 'text-parchment-100 bg-ink-700'
          : 'text-parchment-400 hover:text-parchment-200 hover:bg-ink-800'
      )}
    >
      {children}
    </button>
  )
}
