import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '@/context/WorkspaceContext'
import { fetchMyNotifications, markAsRead, markAllAsRead, getUnreadCount } from '@/lib/notificationService'

export default function NotificationBell() {
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)
  const navigate = useNavigate()
  const { scope } = useWorkspace()

  const [activeUser] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('rms_active_user') || 'null')
    } catch {
      return null
    }
  })

  const loadNotifications = async () => {
    if (!activeUser?.id) return
    try {
      const { count } = await getUnreadCount(activeUser.id)
      setUnreadCount(count)

      const { data } = await fetchMyNotifications(activeUser.id, { limit: 10 })
      setNotifications(data || [])
    } catch (e) {
      console.error('Error loading notifications:', e)
    }
  }

  // Poll for notifications every 30 seconds
  useEffect(() => {
    loadNotifications()
    const interval = setInterval(loadNotifications, 30000)
    return () => clearInterval(interval)
  }, [activeUser])

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleToggle = () => {
    setIsOpen(!isOpen)
    if (!isOpen) {
      loadNotifications()
    }
  }

  const handleMarkAllRead = async (e) => {
    e.stopPropagation()
    if (!activeUser?.id) return
    await markAllAsRead(activeUser.id)
    await loadNotifications()
  }

  const handleNotificationClick = async (notif) => {
    setIsOpen(false)
    if (!notif.is_read) {
      await markAsRead(notif.id)
      await loadNotifications()
    }
    navigate(getNavigationUrl(notif))
  }

  // Format date helper
  const formatTime = (isoString) => {
    try {
      const date = new Date(isoString)
      const diffMs = Date.now() - date.getTime()
      const diffMins = Math.floor(diffMs / 60000)
      if (diffMins < 1) return 'Az önce'
      if (diffMins < 60) return `${diffMins} dk önce`
      const diffHours = Math.floor(diffMins / 60)
      if (diffHours < 24) return `${diffHours} sa önce`
      return date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })
    } catch {
      return ''
    }
  }

  // Icon selector based on type
  const getIcon = (type) => {
    switch (type) {
      case 'ticket_assigned':
        return { class: 'fa-solid fa-user-plus', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' }
      case 'ticket_comment':
        return { class: 'fa-solid fa-comment-dots', color: '#10b981', bg: 'rgba(16,185,129,0.1)' }
      case 'sla_warning':
        return { class: 'fa-solid fa-hourglass-half', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' }
      case 'sla_breach':
        return { class: 'fa-solid fa-triangle-exclamation', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' }
      case 'ticket_escalated':
        return { class: 'fa-solid fa-circle-exclamation', color: '#dc2626', bg: 'rgba(220,38,38,0.1)' }
      // Yeni: Görev bildirimleri
      case 'task_assigned':
        return { class: 'fa-solid fa-list-check', color: '#0ea5e9', bg: 'rgba(14,165,233,0.1)' }
      case 'task_comment':
        return { class: 'fa-solid fa-comments', color: '#6366f1', bg: 'rgba(99,102,241,0.1)' }
      case 'task_status_changed':
        return { class: 'fa-solid fa-arrows-rotate', color: '#64748b', bg: 'rgba(100,116,139,0.1)' }
      // Yeni: Duyuru bildirimleri
      case 'announcement':
        return { class: 'fa-solid fa-bullhorn', color: '#f97316', bg: 'rgba(249,115,22,0.1)' }
      default:
        return { class: 'fa-solid fa-bell', color: '#6b7280', bg: 'rgba(107,114,128,0.1)' }
    }
  }

  // Notification türüne göre yönlendirme URL'si
  const getNavigationUrl = (notif) => {
    const isBranch = scope === 'branch'
    const isWarehouse = scope === 'warehouse'

    switch (notif.reference_type) {
      case 'ticket':
        const ticketBase = isBranch ? '/sube-geribildirimler' : (isWarehouse ? '/merkez-geribildirimler' : '/geribildirimler')
        return notif.reference_id ? `${ticketBase}/${notif.reference_id}` : ticketBase
      case 'task':
      case 'announcement':
        return isBranch ? '/sube-tasks' : (isWarehouse ? '/merkez-tasks' : '/tasks')
      default:
        // Bildirim türüne göre fallback
        if (notif.type === 'task_assigned' || notif.type === 'task_comment' || notif.type === 'task_status_changed') {
          return isBranch ? '/sube-tasks' : (isWarehouse ? '/merkez-tasks' : '/tasks')
        }
        if (notif.type === 'announcement') {
          return isBranch ? '/sube-tasks' : (isWarehouse ? '/merkez-tasks' : '/tasks')
        }
        return isBranch ? '/sube-geribildirimler' : (isWarehouse ? '/merkez-geribildirimler' : '/geribildirimler')
    }
  }


  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <button
        type="button"
        onClick={handleToggle}
        style={{
          width: 36,
          height: 36,
          borderRadius: '50%',
          border: '1px solid var(--border)',
          background: isOpen ? 'var(--surface-3)' : 'var(--surface-2)',
          color: unreadCount > 0 ? 'var(--text-strong)' : 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          position: 'relative',
          transition: 'all 0.2s ease',
        }}
      >
        <i className="fa-solid fa-bell" style={{ fontSize: '1.05rem' }} />
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -3,
              right: -3,
              background: '#ef4444',
              color: '#fff',
              borderRadius: '999px',
              padding: '2px 5px',
              fontSize: '0.62rem',
              fontWeight: 800,
              lineHeight: 1,
              minWidth: 16,
              textAlign: 'center',
              boxShadow: '0 0 0 2px var(--topbar-bg)',
            }}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
      <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            right: 0,
            width: 320,
            background: 'var(--surface, #ffffff)',
            border: '1px solid #cbd5e1',
            borderRadius: 12,
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07), 0 20px 40px -8px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.04)',
            zIndex: 1000,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--surface-2)',
            }}
          >
            <span style={{ fontWeight: 800, fontSize: '0.85rem', color: 'var(--text-strong)' }}>
              Bildirimler
            </span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                style={{
                  border: 'none',
                  background: 'none',
                  color: '#3b82f6',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Hepsini Okundu Yap
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ maxHeight: 320, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div
                style={{
                  padding: '32px 16px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: '0.8rem',
                }}
              >
                <i className="fa-regular fa-bell-slash" style={{ fontSize: '1.5rem', marginBottom: 8, display: 'block', color: 'var(--border)' }} />
                Henüz bildirim yok.
              </div>
            ) : (
              notifications.map((notif) => {
                const iconInfo = getIcon(notif.type)
                return (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    style={{
                      display: 'flex',
                      gap: 12,
                      padding: '12px 16px',
                      borderBottom: '1px solid var(--border)',
                      background: notif.is_read ? 'transparent' : 'rgba(99,102,241,0.04)',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease',
                      position: 'relative',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--surface-2)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = notif.is_read ? 'transparent' : 'rgba(99,102,241,0.04)'
                    }}
                  >
                    {!notif.is_read && (
                      <span
                        style={{
                          position: 'absolute',
                          left: 6,
                          top: '50%',
                          transform: 'translateY(-50%)',
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: '#3b82f6',
                        }}
                      />
                    )}
                    
                    {/* Icon */}
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        background: iconInfo.bg || 'rgba(107,114,128,0.1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <i className={iconInfo.class} style={{ color: iconInfo.color, fontSize: '0.85rem' }} />
                    </div>

                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: notif.is_read ? 600 : 800,
                          fontSize: '0.78rem',
                          color: 'var(--text-strong)',
                          marginBottom: 2,
                          lineHeight: 1.3,
                        }}
                      >
                        {notif.title}
                      </div>
                      <div
                        style={{
                          fontSize: '0.72rem',
                          color: 'var(--text-muted)',
                          lineHeight: 1.3,
                          marginBottom: 4,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {notif.body}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                        {formatTime(notif.created_at)}
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
