import { useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import AddButton from '@/components/ui/AddButton'
import { useToast } from '@/hooks/useToast'
import {
  ACCOUNT_CHART_KEY,
  ACCOUNT_SCOPES,
  ACCOUNT_SECTIONS,
  ACCOUNT_TYPES,
  DEFAULT_ACCOUNT_CHART,
  getAccountScopeLabel,
  getAccountSectionLabel,
  getAccountTypeLabel,
  normalizeAccount,
  normalizeAccountChart,
  sortAccounts,
} from '@/lib/accountChart'
import { readSettingValue, writeSettingValue } from '@/lib/settingsStore'

const SECTION_META = {
  gelirler: {
    color: '#0369a1',
    bg: '#e0f2fe',
    border: '#7dd3fc',
    description: 'Satis ve operasyon disi gelir tanimlarini burada yonetin.',
  },
  giderler: {
    color: '#b45309',
    bg: '#fff7ed',
    border: '#fdba74',
    description: 'Gider hesaplari bolum, grup ve muhasebe bilgileriyle birlikte tutulur.',
  },
  nakitler: {
    color: '#0f766e',
    bg: '#ecfdf5',
    border: '#6ee7b7',
    description: 'Banka ve kasa benzeri nakit hesaplarinizi ayni mantikla yonetin.',
  },
  diger: {
    color: '#475569',
    bg: '#f8fafc',
    border: '#cbd5e1',
    description: 'Mevcut mantiga uyan ama yukaridaki siniflara girmeyen hesaplar icin ayri alan.',
  },
}

function createEmptyAccount(preset = {}) {
  const section = preset.section || 'giderler'
  const suggestedType = preset.type
    || (section === 'gelirler' ? 'gelir' : section === 'nakitler' ? 'varlik' : 'gider')

  return normalizeAccount({
    name: 'Yeni Hesap',
    code: '',
    type: suggestedType,
    parentCode: '',
    scope: 'tum-sistem',
    active: true,
    section,
    group: preset.group || '',
    accountingCategory: preset.accountingCategory || '',
  })
}

function groupAccountsBySection(accounts) {
  const sorted = sortAccounts(accounts)

  return ACCOUNT_SECTIONS.map(section => {
    const accountsInSection = sorted.filter(account => account.section === section.value)
    const groupMap = new Map()

    accountsInSection.forEach(account => {
      const groupLabel = account.group || 'Ana Kalemler'
      const groupKey = `${section.value}::${groupLabel}`
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, {
          key: groupKey,
          label: groupLabel,
          section: section.value,
          accounts: [],
        })
      }
      groupMap.get(groupKey).accounts.push(account)
    })

    return {
      ...section,
      groups: Array.from(groupMap.values()),
      count: accountsInSection.length,
      activeCount: accountsInSection.filter(account => account.active).length,
    }
  })
}

function SummaryCard({ label, value, hint, color, bg }) {
  return (
    <div className="card" style={{ padding: 18, background: bg }}>
      <div style={{ fontSize: '.78rem', color: '#64748b', fontWeight: 700 }}>{label}</div>
      <div style={{ marginTop: 8, fontSize: '1.9rem', fontWeight: 900, color }}>{value}</div>
      {hint ? (
        <div style={{ marginTop: 8, fontSize: '.8rem', color: '#475569', lineHeight: 1.5 }}>
          {hint}
        </div>
      ) : null}
    </div>
  )
}

function FormField({ label, children }) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: '.76rem', color: '#64748b', fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  )
}

export default function ChartOfAccounts() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [accounts, setAccounts] = useState([])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const value = await readSettingValue(ACCOUNT_CHART_KEY, DEFAULT_ACCOUNT_CHART)
        if (cancelled) return
        setAccounts(normalizeAccountChart(value, DEFAULT_ACCOUNT_CHART))
      } catch (error) {
        if (cancelled) return
        toast(error?.message || 'Hesap cizelgesi yuklenemedi', 'error')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [toast])

  const groupSuggestions = useMemo(
    () => Array.from(new Set(accounts.map(account => account.group).filter(Boolean))).sort((left, right) => left.localeCompare(right, 'tr')),
    [accounts],
  )

  const filteredAccounts = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase('tr-TR')
    if (!query) return accounts

    return accounts.filter(account => {
      const haystack = [
        account.name,
        account.code,
        account.group,
        account.accountingCategory,
        getAccountTypeLabel(account.type),
        getAccountSectionLabel(account.section),
        getAccountScopeLabel(account.scope),
      ]
        .join(' ')
        .toLocaleLowerCase('tr-TR')

      return haystack.includes(query)
    })
  }, [accounts, searchText])

  const stats = useMemo(() => {
    const activeCount = accounts.filter(account => account.active).length
    const passiveCount = accounts.length - activeCount

    return {
      totalCount: accounts.length,
      activeCount,
      passiveCount,
    }
  }, [accounts])

  const sections = useMemo(
    () => groupAccountsBySection(filteredAccounts),
    [filteredAccounts],
  )

  function updateAccount(accountId, patch) {
    setAccounts(current => current.map(account => (
      account.id === accountId
        ? normalizeAccount({ ...account, ...patch })
        : account
    )))
  }

  function addAccount(preset = {}) {
    setAccounts(current => [...current, createEmptyAccount(preset)])
  }

  function removeAccount(accountId) {
    setAccounts(current => current.filter(account => account.id !== accountId))
  }

  async function saveChart() {
    setSaving(true)
    try {
      const safeAccounts = normalizeAccountChart(accounts, [])
      await writeSettingValue(ACCOUNT_CHART_KEY, safeAccounts)
      setAccounts(safeAccounts)
      toast('Hesap cizelgesi kaydedildi', 'success')
    } catch (error) {
      toast(error?.message || 'Hesap cizelgesi kaydedilemedi', 'error')
    } finally {
      setSaving(false)
    }
  }

  function loadDefaults() {
    setAccounts(DEFAULT_ACCOUNT_CHART.map(normalizeAccount))
    toast('Excel sablonuna uygun hesap cizelgesi yuklendi', 'info')
  }

  return (
    <div>
      <Header
        title="Hesap Cizelgesi"
        subtitle="Mevcut mantigi koruyarak bolum, grup, muhasebe kodu ve kategori bazli hesap tanimlari yapin"
        actions={(
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-o" type="button" onClick={loadDefaults}>
              Excel Sablonunu Yukle
            </button>
            <AddButton onClick={() => addAccount()} label="Hesap Ekle" />
            <button className="btn-p" type="button" onClick={saveChart} disabled={saving}>
              {saving ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} />
                  Kaydediliyor
                </>
              ) : (
                <>
                  <i className="fa-solid fa-floppy-disk" style={{ marginRight: 6 }} />
                  Kaydet
                </>
              )}
            </button>
          </div>
        )}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
        <SummaryCard
          label="Toplam Hesap"
          value={stats.totalCount}
          hint="Exceldeki bolum ve grup kirilimlarini destekleyecek sekilde duzenlenir."
          color="#1d4ed8"
          bg="#eff6ff"
        />
        <SummaryCard
          label="Aktif Hesap"
          value={stats.activeCount}
          hint="Belgeler ve diger akislarda secilebilir olan aktif kayit sayisi."
          color="#0f766e"
          bg="#ecfeff"
        />
        <SummaryCard
          label="Pasif Hesap"
          value={stats.passiveCount}
          hint="Silmeden kapatilan kayitlar pasif olarak tutulabilir."
          color="#b45309"
          bg="#fff7ed"
        />
      </div>

      <div className="card" style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 12, alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 800, color: '#0f172a' }}>Bolum ve grup bazli tanim</div>
          </div>
          <input
            className="f-input"
            value={searchText}
            onChange={event => setSearchText(event.target.value)}
            placeholder="Kod, hesap, grup veya kategori ara"
            style={{ minWidth: 260 }}
          />
        </div>
      </div>

      <datalist id="account-group-options">
        {groupSuggestions.map(group => (
          <option key={group} value={group} />
        ))}
      </datalist>

      {loading ? (
        <div className="card" style={{ padding: 36, textAlign: 'center', color: '#94a3b8' }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
          Veriler yukleniyor...
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 18 }}>
          {sections.map(section => {
            const meta = SECTION_META[section.value] || SECTION_META.diger

            return (
              <div
                key={section.value}
                className="card"
                style={{ padding: 18, border: `1px solid ${meta.border}`, background: meta.bg }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: '.74rem', letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 900, color: meta.color }}>
                      {section.label}
                    </div>
                    <div style={{ marginTop: 8, fontSize: '1.25rem', fontWeight: 900, color: '#0f172a' }}>
                      {section.activeCount} aktif / {section.count} toplam
                    </div>
                    <div style={{ marginTop: 6, fontSize: '.84rem', color: '#475569', lineHeight: 1.6 }}>
                      {meta.description}
                    </div>
                  </div>
                  <button
                    className="btn-o"
                    type="button"
                    onClick={() => addAccount({ section: section.value })}
                  >
                    <i className="fa-solid fa-plus" style={{ marginRight: 6 }} />
                    Bu bolume ekle
                  </button>
                </div>

                {section.groups.length === 0 ? (
                  <div style={{ border: '1px dashed #cbd5e1', borderRadius: 16, padding: 18, color: '#64748b', background: '#fff' }}>
                    Bu bolumde henuz hesap yok.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 14 }}>
                    {section.groups.map(group => (
                      <div key={group.key} style={{ border: '1px solid rgba(15,23,42,.08)', borderRadius: 16, background: '#fff', padding: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                          <div>
                            <div style={{ fontWeight: 800, color: '#0f172a' }}>{group.label}</div>
                            <div style={{ marginTop: 4, fontSize: '.8rem', color: '#64748b' }}>
                              {group.accounts.length} hesap
                            </div>
                          </div>
                          <button
                            className="btn-o"
                            type="button"
                            onClick={() => addAccount({
                              section: section.value,
                              group: group.label === 'Ana Kalemler' ? '' : group.label,
                              type: group.accounts[0]?.type,
                            })}
                          >
                            <i className="fa-solid fa-plus" style={{ marginRight: 6 }} />
                            Kalem Ekle
                          </button>
                        </div>

                        <div style={{ display: 'grid', gap: 12 }}>
                          {group.accounts.map(account => (
                            <div key={account.id} style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 14 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 12 }}>
                                <div>
                                  <div style={{ fontWeight: 800, color: '#0f172a' }}>
                                    {account.name || 'Yeni Hesap'}
                                  </div>
                                  <div style={{ marginTop: 4, fontSize: '.8rem', color: '#64748b' }}>
                                    {getAccountTypeLabel(account.type)}
                                    {account.code ? ` · ${account.code}` : ''}
                                    {account.accountingCategory ? ` · ${account.accountingCategory}` : ''}
                                  </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', color: '#475569', fontWeight: 700 }}>
                                    <input
                                      type="checkbox"
                                      checked={account.active}
                                      onChange={event => updateAccount(account.id, { active: event.target.checked })}
                                    />
                                    Aktif
                                  </label>
                                  <button
                                    type="button"
                                    className="ico-btn del"
                                    onClick={() => removeAccount(account.id)}
                                    title="Sil"
                                  >
                                    <i className="fa-solid fa-trash" />
                                  </button>
                                </div>
                              </div>

                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                                <FormField label="Hesap Adi">
                                  <input
                                    className="f-input"
                                    value={account.name}
                                    onChange={event => updateAccount(account.id, { name: event.target.value })}
                                    placeholder="Hesap adi"
                                  />
                                </FormField>
                                <FormField label="Muhasebe Kodu">
                                  <input
                                    className="f-input"
                                    value={account.code}
                                    onChange={event => updateAccount(account.id, { code: event.target.value })}
                                    placeholder="Kod"
                                  />
                                </FormField>
                                <FormField label="Hesap Turu">
                                  <select
                                    className="f-input"
                                    value={account.type}
                                    onChange={event => updateAccount(account.id, { type: event.target.value })}
                                  >
                                    {ACCOUNT_TYPES.map(type => (
                                      <option key={type.value} value={type.value}>{type.label}</option>
                                    ))}
                                  </select>
                                </FormField>
                                <FormField label="Muhasebe Kategorisi">
                                  <input
                                    className="f-input"
                                    value={account.accountingCategory}
                                    onChange={event => updateAccount(account.id, { accountingCategory: event.target.value })}
                                    placeholder="Kategori"
                                  />
                                </FormField>
                                <FormField label="Bolum">
                                  <select
                                    className="f-input"
                                    value={account.section}
                                    onChange={event => updateAccount(account.id, { section: event.target.value })}
                                  >
                                    {ACCOUNT_SECTIONS.map(option => (
                                      <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                  </select>
                                </FormField>
                                <FormField label="Grup">
                                  <input
                                    className="f-input"
                                    list="account-group-options"
                                    value={account.group}
                                    onChange={event => updateAccount(account.id, { group: event.target.value })}
                                    placeholder="Orn. Rutin Giderler"
                                  />
                                </FormField>
                                <FormField label="Kapsam">
                                  <select
                                    className="f-input"
                                    value={account.scope}
                                    onChange={event => updateAccount(account.id, { scope: event.target.value })}
                                  >
                                    {ACCOUNT_SCOPES.map(scope => (
                                      <option key={scope.value} value={scope.value}>{scope.label}</option>
                                    ))}
                                  </select>
                                </FormField>
                                <FormField label="Ust Hesap">
                                  <input
                                    className="f-input"
                                    value={account.parentCode}
                                    onChange={event => updateAccount(account.id, { parentCode: event.target.value })}
                                    placeholder="Ust hesap kodu"
                                  />
                                </FormField>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
