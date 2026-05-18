import { useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import { useToast } from '@/hooks/useToast'
import {
  DEFAULT_ACCOUNT_CHART,
  getAccountTypeLabel,
  normalizeAccountChart,
  sortAccounts,
} from '@/lib/accountChart'
import {
  ACCOUNTING_MAPPINGS_KEY,
  groupAccountingEventDefinitions,
  normalizeAccountingMappings,
} from '@/lib/accountingMappings'
import { readSettingValue, writeSettingValue } from '@/lib/settingsStore'

function SummaryCard({ label, value, hint, color, bg }) {
  return (
    <div className="card" style={{ padding: 18, background: bg }}>
      <div style={{ fontSize: '.78rem', color: '#64748b', fontWeight: 700 }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: '1.9rem', fontWeight: 900, color }}>{value}</div>
      {hint ? <div style={{ marginTop: 8, fontSize: '.8rem', color: '#475569', lineHeight: 1.5 }}>{hint}</div> : null}
    </div>
  )
}

function buildAccountOptions(accounts, eventDefinition) {
  const supportedTypes = new Set(eventDefinition.supportedAccountTypes || [])

  return sortAccounts(normalizeAccountChart(accounts, []))
    .filter(account => account.active)
    .filter(account => supportedTypes.size === 0 || supportedTypes.has(account.type))
    .map(account => ({
      value: account.id,
      label: account.code ? `${account.name} (${account.code})` : account.name,
    }))
}

export default function AccountingMappings() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [chartAccounts, setChartAccounts] = useState([])
  const [mappings, setMappings] = useState({})

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const accountChartValue = await readSettingValue('account_chart', DEFAULT_ACCOUNT_CHART)
        const nextAccounts = normalizeAccountChart(accountChartValue, DEFAULT_ACCOUNT_CHART)
        const storedMappings = await readSettingValue(ACCOUNTING_MAPPINGS_KEY, {})
        if (cancelled) return
        setChartAccounts(nextAccounts)
        setMappings(normalizeAccountingMappings(storedMappings, nextAccounts))
      } catch (error) {
        if (cancelled) return
        toast(error?.message || 'Muhasebe eslestirmeleri yuklenemedi', 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [toast])

  const groupedDefinitions = useMemo(() => groupAccountingEventDefinitions(), [])
  const accountMap = useMemo(
    () => new Map(chartAccounts.map(account => [account.id, account])),
    [chartAccounts],
  )

  const stats = useMemo(() => {
    const totalEvents = groupedDefinitions.reduce((sum, group) => sum + group.events.length, 0)
    const mappedCount = Object.values(mappings).filter(Boolean).length
    const liveCount = groupedDefinitions.reduce((sum, group) => (
      sum + group.events.filter(eventDefinition => eventDefinition.live).length
    ), 0)

    return { totalEvents, mappedCount, liveCount }
  }, [groupedDefinitions, mappings])

  async function saveMappings() {
    setSaving(true)
    try {
      const normalized = normalizeAccountingMappings(mappings, chartAccounts)
      await writeSettingValue(ACCOUNTING_MAPPINGS_KEY, normalized)
      setMappings(normalized)
      toast('Muhasebe eslestirmeleri kaydedildi', 'success')
    } catch (error) {
      toast(error?.message || 'Muhasebe eslestirmeleri kaydedilemedi', 'error')
    } finally {
      setSaving(false)
    }
  }

  function setMapping(eventId, accountId) {
    setMappings(current => ({ ...current, [eventId]: accountId }))
  }

  return (
    <div className="page-enter">
      <Header
        title="Muhasebe Eslestirmeleri"
        subtitle="Operasyonel olaylarin hangi hesaplara akacagini buradan yonetin."
        actions={(
          <button className="btn-p" onClick={saveMappings} disabled={loading || saving}>
            <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`} /> {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        )}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginBottom: 18 }}>
        <SummaryCard
          label="Toplam Olay"
          value={stats.totalEvents}
          hint="Sistemin otomatik urettigi mali olaylar."
          color="#1d4ed8"
          bg="#eff6ff"
        />
        <SummaryCard
          label="Hesaba Bagli"
          value={stats.mappedCount}
          hint="Su anda bir hesapla eslestirilmis olay sayisi."
          color="#b45309"
          bg="#fff7ed"
        />
        <SummaryCard
          label="Canli Kural"
          value={stats.liveCount}
          hint="Bu sprintte rapora baglanmis kurallar."
          color="#0f766e"
          bg="#ecfdf5"
        />
      </div>

      <div className="card" style={{ marginBottom: 18, padding: 18, borderStyle: 'dashed' }}>
        <div style={{ fontWeight: 800, color: '#0f172a' }}>Mantik</div>
        <div style={{ marginTop: 8, fontSize: '.84rem', color: '#475569', lineHeight: 1.7 }}>
          Hesap Cizelgesi sadece hesaplari tanimlar. Bu ekran ise sayim farki gibi sistemin otomatik olusturdugu olaylarin hangi hesaba yazilacagini belirler.
          Belgede kullanici zaten dogrudan hesap sectigi icin burada belge gideri secilmez.
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ padding: 28, textAlign: 'center', color: '#64748b' }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
          Muhasebe eslestirmeleri yukleniyor...
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 18 }}>
          {groupedDefinitions.map(group => (
            <div key={group.id} className="card" style={{ padding: 20 }}>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: '1rem', fontWeight: 900, color: '#0f172a' }}>{group.title}</div>
                <div style={{ marginTop: 4, fontSize: '.82rem', color: '#64748b' }}>{group.description}</div>
              </div>

              <div style={{ display: 'grid', gap: 14 }}>
                {group.events.map(eventDefinition => {
                  const selectedAccount = accountMap.get(mappings[eventDefinition.id]) || null
                  const accountOptions = buildAccountOptions(chartAccounts, eventDefinition)

                  return (
                    <div
                      key={eventDefinition.id}
                      style={{
                        border: '1px solid #e2e8f0',
                        borderRadius: 16,
                        padding: 16,
                        background: '#fff',
                        display: 'grid',
                        gap: 12,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: '.94rem', fontWeight: 800, color: '#0f172a' }}>{eventDefinition.label}</div>
                          <div style={{ marginTop: 4, fontSize: '.8rem', color: '#64748b', lineHeight: 1.6 }}>{eventDefinition.description}</div>
                        </div>
                        {eventDefinition.live ? (
                          <span style={{ padding: '5px 10px', borderRadius: 999, background: '#ecfdf5', color: '#0f766e', fontSize: '.74rem', fontWeight: 800 }}>
                            Canli
                          </span>
                        ) : null}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 14 }}>
                        <label style={{ display: 'grid', gap: 6 }}>
                          <span style={{ fontSize: '.74rem', fontWeight: 800, color: '#64748b' }}>Bagli Hesap</span>
                          <div className="sel-wrap">
                            <select className="f-input" value={mappings[eventDefinition.id] || ''} onChange={event => setMapping(eventDefinition.id, event.target.value)}>
                              <option value="">Hesap secin...</option>
                              {accountOptions.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                              ))}
                            </select>
                          </div>
                        </label>

                        <div style={{ display: 'grid', gap: 6 }}>
                          <span style={{ fontSize: '.74rem', fontWeight: 800, color: '#64748b' }}>Kaynak Olay</span>
                          <div className="f-input" style={{ display: 'flex', alignItems: 'center', color: '#475569', background: '#f8fafc' }}>
                            {eventDefinition.sourceLabel}
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                        <div style={{ padding: '10px 12px', borderRadius: 12, background: '#f8fafc' }}>
                          <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b' }}>Secili Hesap Bilgisi</div>
                          <div style={{ marginTop: 6, fontSize: '.83rem', fontWeight: 700, color: '#0f172a' }}>
                            {selectedAccount ? (selectedAccount.code ? `${selectedAccount.name} (${selectedAccount.code})` : selectedAccount.name) : 'Hesap secilmedi'}
                          </div>
                        </div>
                        <div style={{ padding: '10px 12px', borderRadius: 12, background: '#f8fafc' }}>
                          <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b' }}>Grup / Tip</div>
                          <div style={{ marginTop: 6, fontSize: '.83rem', fontWeight: 700, color: '#0f172a' }}>
                            {selectedAccount
                              ? [selectedAccount.group, getAccountTypeLabel(selectedAccount.type)].filter(Boolean).join(' • ')
                              : 'Baglandiginda burada gorunur'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
