import { useWorkspace } from '@/context/WorkspaceContext'
import { getWorkspaceScopeOption, isBranchScopedScope } from '@/lib/workspace'
import { useSidebar } from '@/context/SidebarContext'
import { useState, useEffect } from 'react'
import NotificationBell from '@/components/common/NotificationBell'

function chipStyle(background, color) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    borderRadius: 999,
    background,
    color,
    fontSize: '.72rem',
    fontWeight: 800,
  }
}

export default function Header({ title, subtitle, actions }) {
  const { scope, branchName, openWorkspacePicker } = useWorkspace()
  const scopeOption = getWorkspaceScopeOption(scope)
  const showBranchChip = isBranchScopedScope(scope) && branchName
  const sidebar = useSidebar()

  const [activeUser, setActiveUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('rms_active_user') || 'null') } catch { return null }
  })
  useEffect(() => {
    try { setActiveUser(JSON.parse(sessionStorage.getItem('rms_active_user') || 'null')) } catch { setActiveUser(null) }
  }, [scope])

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      marginBottom: 20, background: 'var(--topbar-bg)',
      borderBottom: '0.5px solid var(--border)',
      padding: '12px 0 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {sidebar?.mode === 'closed' && (
          <button
            type="button"
            aria-label="Yan menuyu ac"
            onClick={() => sidebar.setMobileOpen(open => !open)}
            style={{
              width: 36, height: 36, border: 'none', borderRadius: 8,
              background: 'var(--surface-2)', color: 'var(--text-muted)',
              cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', flexShrink: 0, fontSize: '.85rem',
            }}
          >
            <i className="fa-solid fa-bars" />
          </button>
        )}
        {sidebar?.mode === 'icon' && (
          <button
            type="button"
            aria-label="Sidebar'i genislet"
            onClick={() => sidebar.togglePin()}
            style={{
              width: 32, height: 32, border: 'none', borderRadius: 7,
              background: 'var(--surface-2)', color: 'var(--text-muted)',
              cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', flexShrink: 0, fontSize: '.75rem',
            }}
          >
            <i className="fa-solid fa-angles-right" />
          </button>
        )}
        <div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-strong)', margin: 0 }}>{title}</h1>
          {subtitle && <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>{subtitle}</p>}
          {(scopeOption || showBranchChip) && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {scopeOption && (
                <span style={chipStyle(scopeOption.bg, scopeOption.accent)}>
                  <i className={`fa-solid ${scopeOption.icon}`} />
                  {scopeOption.label}
                </span>
              )}
              {showBranchChip && (
                <span style={chipStyle('rgba(245,158,11,.1)', 'var(--warning)')}>
                  <i className="fa-solid fa-location-dot" />
                  {branchName}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {actions}
        {activeUser && <NotificationBell />}
        {activeUser && (
          <button
            type="button"
            onClick={openWorkspacePicker}
            title={[activeUser.firstName, activeUser.lastName].filter(Boolean).join(' ') || 'Kullanıcı'}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '4px 10px 4px 4px',
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: 'var(--surface-2)',
              cursor: 'pointer',
              color: 'var(--text-strong)',
            }}
          >
            <div style={{
              width: 26,
              height: 26,
              borderRadius: 999,
              background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '.72rem',
              flexShrink: 0,
            }}>
              {(activeUser.firstName?.[0] || '?').toUpperCase()}
            </div>
            <span style={{ fontSize: '.76rem', fontWeight: 700, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {[activeUser.firstName, activeUser.lastName].filter(Boolean).join(' ') || 'Personel'}
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
