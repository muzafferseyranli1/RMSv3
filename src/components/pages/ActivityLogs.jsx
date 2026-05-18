import { useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import { useAuth } from '@/context/AuthContext'
import { db } from '@/lib/db'

const ACTION_OPTIONS = [
  { value: '', label: 'Tum aksiyonlar' },
  { value: 'login_success', label: 'Login basarili' },
  { value: 'logout', label: 'Logout' },
  { value: 'route_view', label: 'Route goruntuleme' },
  { value: 'purchase_order_create', label: 'Siparis olusturma' },
  { value: 'purchase_order_update', label: 'Siparis guncelleme' },
  { value: 'purchase_order_delete', label: 'Siparis silme' },
  { value: 'purchase_receipt_create', label: 'Mal kabul olusturma' },
]

function formatDateTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  return `${date.toLocaleDateString('tr-TR')} ${date.toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

function toActionLabel(value) {
  return ACTION_OPTIONS.find(option => option.value === value)?.label || value || '-'
}

function SummaryCard({ label, value, hint, color = '#0f172a' }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ fontSize: '.72rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>
        {label}
      </div>
      <div style={{ fontSize: '1.35rem', fontWeight: 800, color, marginTop: 6 }}>
        {value}
      </div>
      {hint && <div style={{ fontSize: '.8rem', color: '#94a3b8', marginTop: 4 }}>{hint}</div>}
    </div>
  )
}

export default function ActivityLogs() {
  const { accessRecord } = useAuth()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [emailFilter, setEmailFilter] = useState('')
  const [actionFilter, setActionFilter] = useState('')

  const isAdmin = accessRecord?.role === 'admin'

  useEffect(() => {
    if (!isAdmin) {
      setRows([])
      setLoading(false)
      setError('')
      return
    }

    let ignore = false

    async function load() {
      setLoading(true)
      setError('')

      let query = db
        .from('activity_logs')
        .select('id, created_at, user_email, action_type, route, entity_type, entity_id, metadata')
        .order('created_at', { ascending: false })
        .limit(250)

      const normalizedEmail = emailFilter.trim().toLowerCase()
      if (normalizedEmail) {
        query = query.ilike('user_email', `%${normalizedEmail}%`)
      }

      if (actionFilter) {
        query = query.eq('action_type', actionFilter)
      }

      const { data, error: queryError } = await query
      if (ignore) return

      if (queryError) {
        setRows([])
        setError(queryError.message || 'Aktivite loglari yuklenemedi.')
        setLoading(false)
        return
      }

      setRows(data || [])
      setLoading(false)
    }

    void load()

    return () => {
      ignore = true
    }
  }, [isAdmin, emailFilter, actionFilter])

  const summary = useMemo(() => {
    const today = new Date().toLocaleDateString('tr-TR')
    const loginCount = rows.filter(row => row.action_type === 'login_success').length
    const routeViewCount = rows.filter(row => row.action_type === 'route_view').length
    const todayCount = rows.filter(row => {
      if (!row.created_at) return false
      return new Date(row.created_at).toLocaleDateString('tr-TR') === today
    }).length
    const uniqueUsers = new Set(rows.map(row => row.user_email).filter(Boolean)).size

    return { loginCount, routeViewCount, todayCount, uniqueUsers }
  }, [rows])

  if (!isAdmin) {
    return (
      <div className="page-enter">
        <Header title="Aktivite Loglari" subtitle="Yonetici ekrani" />
        <div className="card" style={{ padding: 24, borderColor: '#fecaca', background: '#fff7f7' }}>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: '#991b1b', marginBottom: 8 }}>
            Bu ekran yalnizca admin kullanicilar icindir
          </div>
          <div style={{ color: '#7f1d1d', lineHeight: 1.6 }}>
            Activity loglarini tum kullanicilar icin gormek icin allowlist kaydinizin `admin` rolunde olmasi gerekir.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-enter">
      <Header
        title="Aktivite Loglari"
        subtitle="Google girisleri, route goruntulemeleri ve kritik islem kayitlari"
        actions={(
          <button className="btn-o" onClick={() => window.location.reload()}>
            Yenile
          </button>
        )}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, marginBottom: 18 }}>
        <SummaryCard label="Toplam Kayit" value={rows.length} />
        <SummaryCard label="Bugun" value={summary.todayCount} color="#2563eb" />
        <SummaryCard label="Login" value={summary.loginCount} color="#059669" />
        <SummaryCard label="Kullanici" value={summary.uniqueUsers} color="#7c3aed" hint={`${summary.routeViewCount} route view`} />
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 240px', gap: 12 }}>
          <input
            className="f-input"
            value={emailFilter}
            onChange={event => setEmailFilter(event.target.value)}
            placeholder="Email filtrele"
          />
          <select className="f-input" value={actionFilter} onChange={event => setActionFilter(event.target.value)}>
            {ACTION_OPTIONS.map(option => (
              <option key={option.value || 'all'} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 24, color: '#64748b' }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
            Aktivite loglari yukleniyor...
          </div>
        ) : error ? (
          <div style={{ padding: 24, color: '#b91c1c', background: '#fff7ed' }}>
            {error}
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 24, color: '#64748b' }}>
            Filtreye uygun aktivite kaydi bulunamadi.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
                  <th style={{ padding: '12px 14px', fontSize: '.75rem', color: '#64748b' }}>Zaman</th>
                  <th style={{ padding: '12px 14px', fontSize: '.75rem', color: '#64748b' }}>Kullanici</th>
                  <th style={{ padding: '12px 14px', fontSize: '.75rem', color: '#64748b' }}>Aksiyon</th>
                  <th style={{ padding: '12px 14px', fontSize: '.75rem', color: '#64748b' }}>Route</th>
                  <th style={{ padding: '12px 14px', fontSize: '.75rem', color: '#64748b' }}>Varlik</th>
                  <th style={{ padding: '12px 14px', fontSize: '.75rem', color: '#64748b' }}>Detay</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.id} style={{ borderTop: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '12px 14px', fontSize: '.82rem', color: '#334155', whiteSpace: 'nowrap' }}>
                      {formatDateTime(row.created_at)}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '.82rem', color: '#0f172a', fontWeight: 600 }}>
                      {row.user_email || '-'}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '.82rem', color: '#475569' }}>
                      {toActionLabel(row.action_type)}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '.82rem', color: '#475569' }}>
                      {row.route || '-'}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '.82rem', color: '#475569' }}>
                      {row.entity_type ? `${row.entity_type}${row.entity_id ? ` / ${row.entity_id}` : ''}` : '-'}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: '.78rem', color: '#64748b', maxWidth: 320 }}>
                      <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
                        {JSON.stringify(row.metadata || {}, null, 2)}
                      </pre>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
