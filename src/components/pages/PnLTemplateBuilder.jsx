import { useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import PnLPreviewPanel from '@/components/pnl/PnLPreviewPanel'
import { DEFAULT_ACCOUNT_CHART, normalizeAccountChart } from '@/lib/accountChart'
import {
  buildPnlAccountUsage,
  buildPnlPreview,
  createDefaultPnlTemplate,
  createEmptyPnlRow,
  getAccountLabel,
  getAvailablePnlAccounts,
  normalizePnlTemplate,
  PNL_BLOCK_DEFS,
  PNL_TEMPLATE_KEY,
} from '@/lib/pnlTemplate'
import { readSettingValue, writeSettingValue } from '@/lib/settingsStore'
import { useToast } from '@/hooks/useToast'

function StatCard({ label, value, hint, accent, bg }) {
  return (
    <div className="card" style={{ padding: 16, background: bg }}>
      <div style={{ fontSize: '.74rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em' }}>
        {label}
      </div>
      <div style={{ marginTop: 8, fontSize: '1.4rem', fontWeight: 900, color: accent }}>
        {value}
      </div>
      {hint ? (
        <div style={{ marginTop: 8, color: '#475569', fontSize: '.8rem', lineHeight: 1.5 }}>
          {hint}
        </div>
      ) : null}
    </div>
  )
}

function Field({ label, children, hint }) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: '.75rem', fontWeight: 800, color: '#64748b' }}>{label}</span>
      {children}
      {hint ? (
        <span style={{ fontSize: '.75rem', color: '#94a3b8', lineHeight: 1.5 }}>{hint}</span>
      ) : null}
    </label>
  )
}

function LockedSummaryRow({ label }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 12px',
        borderRadius: 14,
        background: '#fef3c7',
        border: '1px solid rgba(180,83,9,.18)',
      }}
    >
      <span style={{ fontWeight: 900, color: '#92400e' }}>{label}</span>
      <span style={{ fontSize: '.74rem', fontWeight: 800, color: '#b45309' }}>Kilitli</span>
    </div>
  )
}

function AccountChip({ label, onRemove }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '6px 10px',
        borderRadius: 999,
        background: '#eff6ff',
        color: '#1d4ed8',
        fontSize: '.78rem',
        fontWeight: 800,
      }}
    >
      {label}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          style={{
            border: 'none',
            background: 'transparent',
            color: '#1d4ed8',
            cursor: 'pointer',
            padding: 0,
          }}
        >
          <i className="fa-solid fa-xmark" />
        </button>
      ) : null}
    </span>
  )
}

function BlockEditor({
  blockDef,
  block,
  chartAccounts,
  template,
  onUpdateRow,
  onAddRow,
  onRemoveRow,
  onAddAccount,
  onRemoveAccount,
}) {
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div
        style={{
          padding: '12px 16px',
          background: 'linear-gradient(135deg,#b91c1c,#dc2626)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontWeight: 900, letterSpacing: '.08em', textTransform: 'uppercase' }}>{blockDef.title}</div>
          <div style={{ marginTop: 4, fontSize: '.78rem', color: 'rgba(255,255,255,.82)' }}>
            Baslik ve dip toplam satirlari sabittir. Aradaki satirlari yonetebilirsiniz.
          </div>
        </div>
        <span style={{ fontSize: '.74rem', fontWeight: 800, background: 'rgba(255,255,255,.14)', borderRadius: 999, padding: '5px 10px' }}>
          Kilitli iskelet
        </span>
      </div>

      <div style={{ padding: 16, display: 'grid', gap: 14 }}>
        {block.rows.map(row => {
          const selectedAccounts = (row.accountIds || []).map(accountId => chartAccounts.find(account => account.id === accountId)).filter(Boolean)
          const availableAccounts = getAvailablePnlAccounts(chartAccounts, template, row.id)
            .filter(account => !row.accountIds.includes(account.id))

          return (
            <div key={row.id} style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 14, background: row.builtin === false ? '#fffbeb' : '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '.75rem', fontWeight: 900, color: '#1d4ed8', textTransform: 'uppercase', letterSpacing: '.08em' }}>
                    {row.builtin === false ? 'Ek satir' : 'Sablon satiri'}
                  </span>
                  <span style={{ fontSize: '.74rem', color: '#94a3b8' }}>
                    {selectedAccounts.length} hesap bagli
                  </span>
                </div>
                {row.builtin === false ? (
                  <button type="button" className="ico-btn del" onClick={() => onRemoveRow(blockDef.id, row.id)} title="Satiri sil">
                    <i className="fa-solid fa-trash" />
                  </button>
                ) : null}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: blockDef.modeOptions?.length ? 'minmax(0,1.6fr) 160px 160px' : 'minmax(0,1.8fr) 180px', gap: 12 }}>
                <Field label="P&L satiri">
                  <input
                    className="f-input"
                    value={row.name}
                    onChange={event => onUpdateRow(blockDef.id, row.id, { name: event.target.value })}
                    placeholder="Satir adi"
                  />
                </Field>

                {blockDef.modeOptions?.length ? (
                  <Field label="Etki">
                    <select
                      className="f-input"
                      value={row.mode}
                      onChange={event => onUpdateRow(blockDef.id, row.id, { mode: event.target.value })}
                    >
                      {blockDef.modeOptions.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </Field>
                ) : null}

                <Field label="Ornek tutar">
                  <input
                    className="f-input"
                    type="number"
                    value={row.exampleAmount}
                    onChange={event => onUpdateRow(blockDef.id, row.id, { exampleAmount: event.target.value })}
                    placeholder="0"
                  />
                </Field>
              </div>

              <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
                <Field
                  label="Hesap cizelgesi baglantilari"
                  hint="Bir hesap sadece tek bir P&L satirina baglanabilir. Diger satirlarda kullanilan hesaplar burada gizlenir."
                >
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {selectedAccounts.length > 0 ? selectedAccounts.map(account => (
                        <AccountChip
                          key={account.id}
                          label={getAccountLabel(account)}
                          onRemove={() => onRemoveAccount(blockDef.id, row.id, account.id)}
                        />
                      )) : (
                        <span style={{ color: '#94a3b8', fontSize: '.8rem' }}>Hesap secilmedi.</span>
                      )}
                    </div>

                    <select
                      className="f-input"
                      value=""
                      onChange={event => {
                        if (!event.target.value) return
                        onAddAccount(blockDef.id, row.id, event.target.value)
                      }}
                    >
                      <option value="">Hesap ekle...</option>
                      {availableAccounts.map(account => (
                        <option key={account.id} value={account.id}>{getAccountLabel(account)}</option>
                      ))}
                    </select>
                  </div>
                </Field>
              </div>
            </div>
          )
        })}

        <button type="button" className="btn-o" onClick={() => onAddRow(blockDef.id)}>
          <i className="fa-solid fa-plus" style={{ marginRight: 6 }} />
          {blockDef.addLabel}
        </button>

        <div style={{ display: 'grid', gap: 8 }}>
          {blockDef.summaryRows.map(row => (
            <LockedSummaryRow key={row.id} label={row.label} />
          ))}
        </div>
      </div>
    </div>
  )
}

export default function PnLTemplateBuilder() {
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [chartAccounts, setChartAccounts] = useState([])
  const [template, setTemplate] = useState(() => createDefaultPnlTemplate(DEFAULT_ACCOUNT_CHART))

  useEffect(() => {
    let ignore = false

    async function load() {
      setLoading(true)
      try {
        const accountChartValue = await readSettingValue('account_chart', DEFAULT_ACCOUNT_CHART)
        const nextAccounts = normalizeAccountChart(accountChartValue, DEFAULT_ACCOUNT_CHART)
        const templateValue = await readSettingValue(PNL_TEMPLATE_KEY, createDefaultPnlTemplate(nextAccounts))
        if (ignore) return
        setChartAccounts(nextAccounts)
        setTemplate(normalizePnlTemplate(templateValue, nextAccounts))
      } catch (error) {
        if (ignore) return
        toast(error?.message || 'P&L sablonu yuklenemedi', 'error')
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    load()
    return () => {
      ignore = true
    }
  }, [toast])

  const preview = useMemo(
    () => buildPnlPreview(template, chartAccounts),
    [chartAccounts, template],
  )

  const accountUsage = useMemo(
    () => buildPnlAccountUsage(template),
    [template],
  )

  const customRowCount = useMemo(
    () => template.blocks.reduce((sum, block) => sum + block.rows.filter(row => row.builtin === false).length, 0),
    [template],
  )

  function updateTemplate(updater) {
    setTemplate(current => normalizePnlTemplate(
      typeof updater === 'function' ? updater(current) : updater,
      chartAccounts,
    ))
  }

  function updateRow(blockId, rowId, patch) {
    updateTemplate(current => ({
      ...current,
      blocks: current.blocks.map(block => (
        block.id !== blockId
          ? block
          : {
            ...block,
            rows: block.rows.map(row => row.id === rowId ? { ...row, ...patch } : row),
          }
      )),
    }))
  }

  function addRow(blockId) {
    updateTemplate(current => ({
      ...current,
      blocks: current.blocks.map(block => (
        block.id !== blockId
          ? block
          : { ...block, rows: [...block.rows, createEmptyPnlRow(blockId)] }
      )),
    }))
  }

  function removeRow(blockId, rowId) {
    updateTemplate(current => ({
      ...current,
      blocks: current.blocks.map(block => (
        block.id !== blockId
          ? block
          : { ...block, rows: block.rows.filter(row => row.id !== rowId) }
      )),
    }))
  }

  function addAccount(blockId, rowId, accountId) {
    updateTemplate(current => ({
      ...current,
      blocks: current.blocks.map(block => (
        block.id !== blockId
          ? block
          : {
            ...block,
            rows: block.rows.map(row => (
              row.id === rowId
                ? { ...row, accountIds: [...row.accountIds, accountId] }
                : row
            )),
          }
      )),
    }))
  }

  function removeAccount(blockId, rowId, accountId) {
    updateTemplate(current => ({
      ...current,
      blocks: current.blocks.map(block => (
        block.id !== blockId
          ? block
          : {
            ...block,
            rows: block.rows.map(row => (
              row.id === rowId
                ? { ...row, accountIds: row.accountIds.filter(id => id !== accountId) }
                : row
            )),
          }
      )),
    }))
  }

  async function saveTemplate() {
    setSaving(true)
    try {
      const payload = {
        ...template,
        updatedAt: new Date().toISOString(),
      }
      await writeSettingValue(PNL_TEMPLATE_KEY, payload)
      setTemplate(normalizePnlTemplate(payload, chartAccounts))
      toast('P&L sablonu kaydedildi', 'success')
    } catch (error) {
      toast(error?.message || 'P&L sablonu kaydedilemedi', 'error')
    } finally {
      setSaving(false)
    }
  }

  function loadDefaults() {
    const nextTemplate = createDefaultPnlTemplate(chartAccounts)
    setTemplate(normalizePnlTemplate(nextTemplate, chartAccounts))
    toast('Varsayilan P&L iskeleti yuklendi', 'info')
  }

  return (
    <div className="page-enter">
      <Header
        title="P&L Sablonu"
        subtitle="Hesap cizelgesine bagli P&L formatini olusturun; kilitli satirlar sabit kalir, aradaki satirlari siz yonetirsiniz."
        actions={(
          <>
            <button className="btn-o" type="button" onClick={loadDefaults}>Varsayilani Yukle</button>
            <button className="btn-p" type="button" onClick={saveTemplate} disabled={saving}>
              {saving ? <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} />Kaydediliyor</> : <><i className="fa-solid fa-floppy-disk" style={{ marginRight: 6 }} />Kaydet</>}
            </button>
          </>
        )}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
        <StatCard label="Bagli hesap" value={accountUsage.size} hint="Tekillik kuralina gore sadece bir satirda kullanilabilir." accent="#1d4ed8" bg="#eff6ff" />
        <StatCard label="Ek satir" value={customRowCount} hint="Kilitli alanlarin arasina eklediginiz satirlar." accent="#b45309" bg="#fff7ed" />
        <StatCard label="Aktif blok" value={PNL_BLOCK_DEFS.length} hint="Gelir, maliyet, degisken, sabit ve genel yonetim bloklari." accent="#0f766e" bg="#ecfeff" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) minmax(360px, .85fr)', gap: 18, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 18 }}>
          <div className="card" style={{ padding: 18 }}>
            <Field
              label="Sablon adi"
              hint="Bu isim rapor ekraninda aktif format olarak gosterilir."
            >
              <input
                className="f-input"
                value={template.name}
                onChange={event => updateTemplate(current => ({ ...current, name: event.target.value }))}
                placeholder="Orn. Restoran P&L Formati"
              />
            </Field>
          </div>

          {loading ? (
            <div className="card" style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
              <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
              P&L sablonu yukleniyor...
            </div>
          ) : (
            PNL_BLOCK_DEFS.map(blockDef => {
              const block = template.blocks.find(item => item.id === blockDef.id)
              if (!block) return null

              return (
                <BlockEditor
                  key={blockDef.id}
                  blockDef={blockDef}
                  block={block}
                  chartAccounts={chartAccounts}
                  template={template}
                  onUpdateRow={updateRow}
                  onAddRow={addRow}
                  onRemoveRow={removeRow}
                  onAddAccount={addAccount}
                  onRemoveAccount={removeAccount}
                />
              )
            })
          )}
        </div>

        <div style={{ position: 'sticky', top: 20 }}>
          <PnLPreviewPanel
            preview={preview}
            title="P&L Raporu Ornegi"
            subtitle="Sag panel, solda kurdugunuz sablonun rapor gorunusunu anlik olarak onizler."
          />
        </div>
      </div>
    </div>
  )
}
