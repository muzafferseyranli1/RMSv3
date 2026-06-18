import { useEffect, useId, useMemo, useState, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import Header from '@/components/layout/Header'
import { useToast } from '@/hooks/useToast'
import { db, uploadApiFile, buildApiUrl } from '@/lib/db'
import SearchableSelect from '@/components/ui/SearchableSelect'
import {
  KIOSK_DEFAULT_SETTINGS,
  getKDSUrl,
  getKioskUrl,
  getKioskTabletUrl,
  getPickupUrl,
  getQueueUrl,
  loadKioskSettings,
  normalizeKioskStationCode,
  saveKioskSettings,
} from '@/lib/kioskSettings'
import { useWorkspace } from '@/context/WorkspaceContext'

const DAY_OPTIONS = [
  ['mon', 'Pzt'],
  ['tue', 'Sal'],
  ['wed', 'Car'],
  ['thu', 'Per'],
  ['fri', 'Cum'],
  ['sat', 'Cmt'],
  ['sun', 'Paz'],
]

const DESKTOP_SECTIONS = [
  { id: 'kioskler', label: 'Kioskler', icon: 'fa-tablet-screen-button', accent: '#0d9488' },
  { id: 'temel-akis', label: 'Çalışma Saatleri', icon: 'fa-sliders', accent: '#2563eb' },
  { id: 'gorsel-kimlik', label: 'Görsel Kimlik', icon: 'fa-palette', accent: '#7c3aed' },
  { id: 'karsilama-ekrani', label: 'Karşılama Ekranı', icon: 'fa-hand-pointer', accent: '#0891b2' },
  { id: 'ana-banner', label: 'Ana Banner', icon: 'fa-panorama', accent: '#dc2626' },
  { id: 'hizli-secim', label: 'Hızlı Seçim', icon: 'fa-bolt', accent: '#16a34a' },
  { id: 'kategori-yonetimi', label: 'Kategori Yönetimi', icon: 'fa-layer-group', accent: '#ea580c' },
  { id: 'urunler', label: 'Ürünler', icon: 'fa-utensils', accent: '#4f46e5' },
  { id: 'oneriler', label: 'Öneriler', icon: 'fa-bullhorn', accent: '#c026d3' },
  { id: 'diger', label: 'Diğer Ayarlar', icon: 'fa-ellipsis', accent: '#475569' },
]

function uid(prefix = 'kiosk') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

async function uploadFileAndGetUrl(file, targetWidth = null, targetHeight = null) {
  if (file?.type?.startsWith('image/')) {
    const objectUrl = URL.createObjectURL(file)
    try {
      const image = await new Promise((resolve, reject) => {
        const nextImage = new Image()
        nextImage.onload = () => resolve(nextImage)
        nextImage.onerror = reject
        nextImage.src = objectUrl
      })

      let finalWidth = image.width || 1
      let finalHeight = image.height || 1
      let canvas = document.createElement('canvas')

      if (targetWidth && targetHeight) {
        finalWidth = targetWidth
        finalHeight = targetHeight
        canvas.width = finalWidth
        canvas.height = finalHeight
        const context = canvas.getContext('2d')

        if (context) {
          const imgWidth = image.width || 1
          const imgHeight = image.height || 1
          const targetRatio = targetWidth / targetHeight
          const imgRatio = imgWidth / imgHeight

          let sourceX = 0
          let sourceY = 0
          let sourceWidth = imgWidth
          let sourceHeight = imgHeight

          if (Math.abs(imgRatio - targetRatio) > 0.01) {
            const analyzeCanvas = document.createElement('canvas')
            const scale = Math.min(1, 400 / Math.max(imgWidth, imgHeight))
            analyzeCanvas.width = Math.round(imgWidth * scale)
            analyzeCanvas.height = Math.round(imgHeight * scale)
            const actx = analyzeCanvas.getContext('2d')
            if (actx) {
              actx.drawImage(image, 0, 0, analyzeCanvas.width, analyzeCanvas.height)
              const imgData = actx.getImageData(0, 0, analyzeCanvas.width, analyzeCanvas.height)
              const pixels = imgData.data
              const aw = analyzeCanvas.width
              const ah = analyzeCanvas.height

              const energy = new Float32Array(aw * ah)
              for (let y = 1; y < ah - 1; y++) {
                for (let x = 1; x < aw - 1; x++) {
                  const idx = (y * aw + x) * 4
                  const r = pixels[idx]
                  const g = pixels[idx + 1]
                  const b = pixels[idx + 2]

                  const idxR = idx + 4
                  const gradX = Math.abs(r - pixels[idxR]) + Math.abs(g - pixels[idxR + 1]) + Math.abs(b - pixels[idxR + 2])

                  const idxB = idx + aw * 4
                  const gradY = Math.abs(r - pixels[idxB]) + Math.abs(g - pixels[idxB + 1]) + Math.abs(b - pixels[idxB + 2])

                  energy[y * aw + x] = gradX + gradY
                }
              }

              if (imgRatio > targetRatio) {
                const wCrop = imgHeight * targetRatio
                const wCropScale = wCrop * scale
                const maxScaleX = aw - wCropScale

                let bestScaleX = 0
                let maxEnergy = -1

                for (let sx = 0; sx <= maxScaleX; sx += 2) {
                  let windowEnergy = 0
                  for (let y = 0; y < ah; y++) {
                    const rowOffset = y * aw
                    for (let x = Math.floor(sx); x < Math.min(aw, sx + wCropScale); x++) {
                      windowEnergy += energy[rowOffset + x]
                    }
                  }

                  const centerX = maxScaleX / 2
                  const distFromCenter = Math.abs(sx - centerX) / (maxScaleX || 1)
                  const bias = (1 - distFromCenter) * (maxEnergy * 0.05)
                  const biasedEnergy = windowEnergy + bias

                  if (biasedEnergy > maxEnergy) {
                    maxEnergy = biasedEnergy
                    bestScaleX = sx
                  }
                }

                sourceX = bestScaleX / scale
                sourceWidth = wCrop
              } else {
                const hCrop = imgWidth / targetRatio
                const hCropScale = hCrop * scale
                const maxScaleY = ah - hCropScale

                let bestScaleY = 0
                let maxEnergy = -1

                for (let sy = 0; sy <= maxScaleY; sy += 2) {
                  let windowEnergy = 0
                  for (let y = Math.floor(sy); y < Math.min(ah, sy + hCropScale); y++) {
                    const rowOffset = y * aw
                    for (let x = 0; x < aw; x++) {
                      windowEnergy += energy[rowOffset + x]
                    }
                  }

                  const centerY = maxScaleY / 2
                  const distFromCenter = Math.abs(sy - centerY) / (maxScaleY || 1)
                  const bias = (1 - distFromCenter) * (maxEnergy * 0.05)
                  const biasedEnergy = windowEnergy + bias

                  if (biasedEnergy > maxEnergy) {
                    maxEnergy = biasedEnergy
                    bestScaleY = sy
                  }
                }

                sourceY = bestScaleY / scale
                sourceHeight = hCrop
              }
            }
          }

          context.drawImage(
            image,
            sourceX, sourceY, sourceWidth, sourceHeight,
            0, 0, finalWidth, finalHeight
          )
        }
      } else {
        const maxDimension = 1600
        const scale = Math.min(1, maxDimension / Math.max(image.width || 1, image.height || 1))
        finalWidth = Math.max(1, Math.round((image.width || 1) * scale))
        finalHeight = Math.max(1, Math.round((image.height || 1) * scale))
        canvas.width = finalWidth
        canvas.height = finalHeight
        const context = canvas.getContext('2d')
        if (context) {
          context.drawImage(image, 0, 0, finalWidth, finalHeight)
        }
      }

      const context = canvas.getContext('2d')
      if (context) {
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', 0.86))
        if (blob) {
          const formData = new FormData()
          const originalName = file.name || 'image.webp'
          const newName = originalName.replace(/\.[^/.]+$/, "") + ".webp"
          formData.append('file', blob, newName)
          const uploaded = await uploadApiFile(formData)
          return buildApiUrl(uploaded.file_url)
        }
      }
    } catch (e) {
      console.error("Image processing failed:", e)
    } finally {
      URL.revokeObjectURL(objectUrl)
    }
  }

  const formData = new FormData()
  formData.append('file', file)
  const uploaded = await uploadApiFile(formData)
  return buildApiUrl(uploaded.file_url)
}

function shellCardStyle(padding = 18) {
  return {
    background: '#fff',
    border: '1px solid #e2e8f0',
    borderRadius: 18,
    boxShadow: '0 20px 45px rgba(15,23,42,.06)',
    padding,
  }
}

function sectionTitleStyle() {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  }
}

function iconBadgeStyle(bg, color) {
  return {
    width: 38,
    height: 38,
    borderRadius: 12,
    background: bg,
    color,
    display: 'grid',
    placeItems: 'center',
    flexShrink: 0,
  }
}

function inputStyle() {
  return {
    width: '100%',
    minHeight: 42,
    borderRadius: 12,
    border: '1px solid #dbe2ea',
    background: '#fff',
    color: '#0f172a',
    padding: '10px 12px',
    fontSize: '.92rem',
    boxSizing: 'border-box',
  }
}

function textareaStyle(rows = 3) {
  return {
    ...inputStyle(),
    minHeight: 22 * rows + 24,
    resize: 'vertical',
  }
}

function subtleNoteStyle(tint = '#eff6ff', border = '#bfdbfe', color = '#1d4ed8') {
  return {
    border: `1px solid ${border}`,
    borderRadius: 14,
    background: tint,
    color,
    padding: '12px 14px',
    fontSize: '.82rem',
    lineHeight: 1.55,
  }
}

function SaveChip({ active }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        borderRadius: 999,
        background: active ? 'rgba(245,158,11,.14)' : 'rgba(16,185,129,.14)',
        color: active ? '#b45309' : '#047857',
        fontWeight: 800,
        fontSize: '.8rem',
      }}
    >
      <i className={`fa-solid ${active ? 'fa-circle-exclamation' : 'fa-circle-check'}`} />
      {active ? 'Kaydedilmemiş değişiklik var' : 'Tüm değişiklikler kayıtlı'}
    </span>
  )
}

function SectionBlock({ id, icon, accent, title, subtitle, headerRight = null, children }) {
  const matchedSection = DESKTOP_SECTIONS.find(s => s.id === id)
  const finalAccent = matchedSection ? matchedSection.accent : accent

  return (
    <section
      id={id}
      style={{
        ...shellCardStyle(),
        borderLeft: `6px solid ${finalAccent}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={iconBadgeStyle(`${finalAccent}18`, finalAccent)}>
            <i className={`fa-solid ${icon}`} />
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#0f172a' }}>{title}</div>
            {subtitle ? <div style={{ fontSize: '.82rem', color: '#64748b', marginTop: 3 }}>{subtitle}</div> : null}
          </div>
        </div>
        {headerRight && <div style={{ display: 'flex', alignItems: 'center' }}>{headerRight}</div>}
      </div>
      <div style={{ display: 'grid', gap: 16 }}>
        {children}
      </div>
    </section>
  )
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: 'grid', gap: 7 }}>
      <div>
        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '.84rem' }}>{label}</div>
        {hint ? <div style={{ fontSize: '.76rem', color: '#64748b', marginTop: 3, lineHeight: 1.45 }}>{hint}</div> : null}
      </div>
      {children}
    </label>
  )
}

function ToggleRow({ label, hint, checked, onChange }) {
  return (
    <div
      style={{
        border: '1px solid #e2e8f0',
        borderRadius: 14,
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 16,
        background: checked ? '#fffaf0' : '#fff',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: '#0f172a', wordBreak: 'break-word' }}>{label}</div>
        {hint ? <div style={{ fontSize: '.78rem', color: '#64748b', marginTop: 4, lineHeight: 1.45, wordBreak: 'break-word' }}>{hint}</div> : null}
      </div>
      <label className="tog" style={{ marginTop: 2, flexShrink: 0 }}>
        <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
        <span className="tog-sl" />
      </label>
    </div>
  )
}

function UploadField({
  label,
  hint,
  value,
  onChange,
  accept = 'image/*',
  previewKind = 'image',
  aspect = '16 / 9',
  fit = 'cover',
  targetWidth = null,
  targetHeight = null,
}) {
  const inputId = useId()
  const [previewOpen, setPreviewOpen] = useState(false)
  const [lastFileName, setLastFileName] = useState('')

  async function handleChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setLastFileName(file.name || '')
    onChange(await uploadFileAndGetUrl(file, targetWidth, targetHeight))
  }

  const hasValue = Boolean(value)
  const fileLabel = lastFileName || (hasValue ? (previewKind === 'video' ? 'Yuklu video' : 'Yuklu dosya') : 'Dosya secilmedi')
  const infoText = ''

  const finalHint = hint || (targetWidth && targetHeight ? `Önerilen boyut: ${targetWidth}x${targetHeight} px` : '')

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <Field label={label} hint={finalHint}>
        <div />
      </Field>
      <div
        style={{
          border: '1px dashed #cbd5e1',
          borderRadius: 16,
          background: '#f8fafc',
          padding: 12,
          display: 'grid',
          gap: 12,
          position: 'relative',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr)', gap: 12, alignItems: 'center' }}>
          <button
            type="button"
            onMouseEnter={() => hasValue && setPreviewOpen(true)}
            onMouseLeave={() => setPreviewOpen(false)}
            onFocus={() => hasValue && setPreviewOpen(true)}
            onBlur={() => setPreviewOpen(false)}
            style={{
              width: 72,
              height: 72,
              borderRadius: 14,
              overflow: 'hidden',
              background: 'linear-gradient(135deg, #e2e8f0, #f8fafc)',
              border: '1px solid #e2e8f0',
              padding: 0,
              cursor: hasValue ? 'zoom-in' : 'default',
            }}
          >
            {hasValue ? (
              previewKind === 'video' ? (
                <video src={value} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              ) : (
                <img src={value} alt={label} style={{ width: '100%', height: '100%', objectFit: fit, display: 'block' }} />
              )
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: '#94a3b8' }}>
                <i className={`fa-solid ${previewKind === 'video' ? 'fa-film' : 'fa-image'}`} style={{ fontSize: '1.1rem' }} />
              </div>
            )}
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '.84rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {fileLabel}
            </div>
            {infoText ? (
              <div style={{ fontSize: '.76rem', color: '#64748b', marginTop: 4, lineHeight: 1.45 }}>
                {infoText}
              </div>
            ) : null}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <label htmlFor={inputId} className="btn-p" style={{ cursor: 'pointer' }}>
            <i className="fa-solid fa-upload" /> Dosya Yukle
          </label>
          <input id={inputId} type="file" accept={accept} onChange={handleChange} style={{ display: 'none' }} />
          <button type="button" className="btn-o" onClick={() => onChange('')}>Temizle</button>
        </div>
        {previewOpen && hasValue ? (
          <div
            onMouseEnter={() => setPreviewOpen(true)}
            onMouseLeave={() => setPreviewOpen(false)}
            style={{
              position: 'absolute',
              left: 96,
              top: 10,
              zIndex: 5,
              width: 220,
              borderRadius: 16,
              overflow: 'hidden',
              border: '1px solid #cbd5e1',
              boxShadow: '0 20px 45px rgba(15,23,42,.14)',
              background: '#fff',
            }}
          >
            <div style={{ padding: '8px 10px', borderBottom: '1px solid #e2e8f0', fontSize: '.74rem', fontWeight: 700, color: '#334155' }}>
              Onizleme
            </div>
            <div style={{ aspectRatio: aspect, background: '#f8fafc' }}>
              {previewKind === 'video' ? (
                <video src={value} controls muted playsInline style={{ width: '100%', height: '100%', objectFit: fit, display: 'block' }} />
              ) : (
                <img src={value} alt={label} style={{ width: '100%', height: '100%', objectFit: fit, display: 'block' }} />
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function DaySelector({ value = [], onChange }) {
  const selected = new Set(Array.isArray(value) ? value : [])

  function toggleDay(dayCode) {
    const next = new Set(selected)
    if (next.has(dayCode)) next.delete(dayCode)
    else next.add(dayCode)
    onChange([...next])
  }

  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {DAY_OPTIONS.map(([code, label]) => {
        const active = selected.has(code)
        return (
          <button
            key={code}
            type="button"
            onClick={() => toggleDay(code)}
            style={{
              padding: '2px 5px',
              borderRadius: 6,
              border: active ? '1px solid #fdba74' : '1px solid #dbe2ea',
              background: active ? '#fff7ed' : '#fff',
              color: active ? '#c2410c' : '#475569',
              fontWeight: 700,
              fontSize: '.68rem',
              cursor: 'pointer',
              minWidth: 28,
              height: 24,
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}

function ScheduleRuleEditor({
  rule,
  onChange,
  onRemove,
  includeVisibility = false,
  includeOrder = false,
  includeName = false,
}) {
  const startTime = includeName ? (rule.start_time || '09:00') : (rule.start || '09:00')
  const endTime = includeName ? (rule.end_time || '22:00') : (rule.end || '22:00')

  return (
    <div style={{
      borderRadius: 10,
      border: '1px solid #e2e8f0',
      background: '#fff',
      padding: '8px 12px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flexWrap: 'wrap'
    }}>
      {includeName && (
        <div style={{ flex: '1 1 150px', minWidth: 120 }}>
          <input
            type="text"
            value={rule.name || ''}
            onChange={event => onChange({ name: event.target.value })}
            style={{ ...inputStyle(), padding: '4px 8px', fontSize: '.78rem' }}
            placeholder="Kural Adı (örn. Hafta Sonu)"
          />
        </div>
      )}

      <div style={{ flexShrink: 0 }}>
        <DaySelector value={rule.days || []} onChange={days => onChange({ days })} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <input
          type="time"
          value={startTime}
          onChange={event => {
            if (includeName) onChange({ start_time: event.target.value })
            else onChange({ start: event.target.value })
          }}
          style={{ ...inputStyle(), width: 72, padding: '4px 4px', fontSize: '.78rem', textAlign: 'center' }}
        />
        <span style={{ color: '#64748b', fontSize: '.8rem' }}>-</span>
        <input
          type="time"
          value={endTime}
          onChange={event => {
            if (includeName) onChange({ end_time: event.target.value })
            else onChange({ end: event.target.value })
          }}
          style={{ ...inputStyle(), width: 72, padding: '4px 4px', fontSize: '.78rem', textAlign: 'center' }}
        />
      </div>

      {includeVisibility && (
        <div style={{ width: 100, flexShrink: 0 }}>
          <SearchableSelect
            value={rule.visible === false ? 'hidden' : 'visible'}
            onChange={v => onChange({ visible: v === 'visible' })}
            options={[{value:'visible',label:'Görünür'},{value:'hidden',label:'Gizli'}]}
            allowClear={false}
          />
        </div>
      )}

      {includeOrder && (
        <div style={{ width: 70, flexShrink: 0 }}>
          <input
            type="number"
            min={0}
            max={9999}
            value={rule.order ?? 100}
            onChange={event => onChange({ order: Number(event.target.value || 0) })}
            style={{ ...inputStyle(), padding: '4px 6px', fontSize: '.78rem', textAlign: 'center' }}
          />
        </div>
      )}

      <div style={{ flex: '2 1 150px', minWidth: 120 }}>
        <input
          value={rule.note || ''}
          onChange={event => onChange({ note: event.target.value })}
          style={{ ...inputStyle(), padding: '4px 8px', fontSize: '.78rem' }}
          placeholder="Not (Açıklama)"
        />
      </div>

      <button
        type="button"
        className="btn-o"
        onClick={onRemove}
        style={{
          color: '#b91c1c',
          padding: '4px 10px',
          fontSize: '.75rem',
          border: '1px solid #fca5a5',
          borderRadius: 8,
          background: '#fef2f2',
          cursor: 'pointer',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 4
        }}
      >
        <i className="fa-solid fa-trash-can" />
        Sil
      </button>
    </div>
  )
}

// KioskStationEditor bileşeni kaldırıldı. Cihazlar artık daha sade bir tablo yapısında listeleniyor.

export default function KioskManagementDesktop() {
  const { branchId } = useWorkspace()
  const toast = useToast()
  const navigate = useNavigate()
  const [settings, setSettings] = useState(KIOSK_DEFAULT_SETTINGS)
  const [savedSnapshot, setSavedSnapshot] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [kioskChannel, setKioskChannel] = useState(null)
  const [kioskDevices, setKioskDevices] = useState([])
  const [operatingRules, setOperatingRules] = useState([])
  const [deviceAssignments, setDeviceAssignments] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [activeSection, setActiveSection] = useState(DESKTOP_SECTIONS[0].id)
  const [activeCategoryTab, setActiveCategoryTab] = useState('standard')
  const [saveConflicts, setSaveConflicts] = useState([])

  useEffect(() => {
    let ignore = false
    ;(async () => {
      try {
        setLoading(true)
        const [settingsResult, categoryResult, productResult, channelResult, devicesResult, rulesResult, assignmentsResult] = await Promise.allSettled([
          loadKioskSettings(),
          db.from('sale_categories').select('id,name,parent_id,image_url').is('deleted_at', null).order('name'),
          db
            .from('sale_items')
            .select('id,name,channel_image,channel_prices,sale_cat_l1,sale_cat_l2,sale_cat_l3,sale_cat_l4,sale_cat_l5')
            .is('deleted_at', null)
            .order('name'),
          db.from('sales_channels').select('id,name').is('deleted_at', null).ilike('name', 'kiosk').maybeSingle(),
          branchId ? db.from('pos_terminals').select('*').eq('branch_id', branchId).in('device_type', ['kiosk', 'kiosk_tablet']) : Promise.resolve({ data: [] }),
          branchId ? db.from('kiosk_operating_hours_rules').select('*').eq('branch_id', branchId) : Promise.resolve({ data: [] }),
          branchId ? db.from('kiosk_terminal_operating_rules').select('terminal_id, rule_id') : Promise.resolve({ data: [] })
        ])
        if (ignore) return

        const nextSettings = settingsResult.status === 'fulfilled' ? settingsResult.value : KIOSK_DEFAULT_SETTINGS
        setSettings(nextSettings)
        setSavedSnapshot(JSON.stringify(nextSettings))

        setCategories(categoryResult.status === 'fulfilled' ? (categoryResult.value?.data || []) : [])
        setProducts(productResult.status === 'fulfilled' ? (productResult.value?.data || []) : [])
        setKioskChannel(channelResult.status === 'fulfilled' ? (channelResult.value?.data || null) : null)
        setKioskDevices(devicesResult.status === 'fulfilled' ? (devicesResult.value?.data || []) : [])
        setOperatingRules(rulesResult.status === 'fulfilled' ? (rulesResult.value?.data || []) : [])
        setDeviceAssignments(assignmentsResult.status === 'fulfilled' ? (assignmentsResult.value?.data || []) : [])

        const errors = [
          settingsResult.status === 'rejected' ? settingsResult.reason?.message : '',
          categoryResult.status === 'rejected' ? categoryResult.reason?.message : '',
          productResult.status === 'rejected' ? productResult.reason?.message : '',
          channelResult.status === 'rejected' ? channelResult.reason?.message : '',
          devicesResult.status === 'rejected' ? devicesResult.reason?.message : '',
          rulesResult.status === 'rejected' ? rulesResult.reason?.message : '',
          assignmentsResult.status === 'rejected' ? assignmentsResult.reason?.message : '',
        ].filter(Boolean)

        if (errors.length > 0) {
          toast(`Desktop editor kısmi veriyle açıldı: ${errors[0]}`, 'info')
        }
      } catch (error) {
        if (!ignore) toast(error?.message || 'Kiosk ayarları yüklenemedi', 'error')
      } finally {
        if (!ignore) setLoading(false)
      }
    })()
    return () => { ignore = true }
  }, [toast, branchId])

  useEffect(() => {
    if (loading) return undefined
    const observer = new window.IntersectionObserver(
      entries => {
        const visible = entries
          .filter(entry => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)
        if (visible[0]?.target?.id) setActiveSection(visible[0].target.id)
      },
      {
        rootMargin: '-18% 0px -64% 0px',
        threshold: [0.15, 0.35, 0.65],
      },
    )

    const nodes = DESKTOP_SECTIONS.map(section => document.getElementById(section.id)).filter(Boolean)
    nodes.forEach(node => observer.observe(node))
    return () => observer.disconnect()
  }, [loading])

  function setField(key, value) {
    setSettings(current => ({ ...current, [key]: value }))
  }

  function setIdleImage(value) {
    setSettings(current => ({
      ...current,
      idle_media_type: 'image',
      idle_media_url: value,
      idle_background_image: value,
    }))
  }

  function updateNested(key, patch) {
    setSettings(current => ({ ...current, [key]: { ...(current[key] || {}), ...patch } }))
  }

  function updateCategoryConfig(categoryId, patch) {
    setSettings(current => {
      const list = Array.isArray(current.category_configs) ? [...current.category_configs] : []
      const index = list.findIndex(item => item.categoryId === categoryId)
      const base = index >= 0 ? list[index] : { categoryId, imageUrl: '', buttonLabel: '', defaultOrder: list.length + 1, defaultVisible: true, schedules: [] }
      const next = { ...base, ...patch }
      if (index >= 0) list[index] = next
      else list.push(next)
      return { ...current, category_configs: list }
    })
  }

  function addCategorySchedule(categoryId) {
    setSettings(current => {
      const list = Array.isArray(current.category_configs) ? [...current.category_configs] : []
      const index = list.findIndex(item => item.categoryId === categoryId)
      const base = index >= 0 ? list[index] : { categoryId, imageUrl: '', buttonLabel: '', defaultOrder: list.length + 1, defaultVisible: true, schedules: [] }
      const nextRule = { id: uid('cat_rule'), days: [], start: '08:00', end: '12:00', visible: true, order: base.defaultOrder || list.length + 1, note: '' }
      const nextConfig = { ...base, schedules: [...(base.schedules || []), nextRule] }
      if (index >= 0) list[index] = nextConfig
      else list.push(nextConfig)
      return { ...current, category_configs: list }
    })
  }

  function updateCategorySchedule(categoryId, scheduleId, patch) {
    setSettings(current => {
      const list = Array.isArray(current.category_configs) ? [...current.category_configs] : []
      const index = list.findIndex(item => item.categoryId === categoryId)
      const base = index >= 0 ? list[index] : { categoryId, imageUrl: '', buttonLabel: '', defaultOrder: list.length + 1, defaultVisible: true, schedules: [] }
      const nextSchedules = (base.schedules || []).map(rule => rule.id === scheduleId ? { ...rule, ...patch } : rule)
      const nextConfig = { ...base, schedules: nextSchedules }
      if (index >= 0) list[index] = nextConfig
      else list.push(nextConfig)
      return { ...current, category_configs: list }
    })
  }

  function removeCategorySchedule(categoryId, scheduleId) {
    setSettings(current => {
      const list = Array.isArray(current.category_configs) ? [...current.category_configs] : []
      const index = list.findIndex(item => item.categoryId === categoryId)
      if (index < 0) return current
      list[index] = {
        ...list[index],
        schedules: (list[index].schedules || []).filter(rule => rule.id !== scheduleId),
      }
      return { ...current, category_configs: list }
    })
  }

  function createGlobalSchedule() {
    const newId = uid('cat_sched')
    const newSchedule = {
      id: newId,
      name: `Kural ${ (settings.category_schedules || []).length + 1 }`,
      days: [],
      start: '08:00',
      end: '12:00'
    }
    setSettings(current => ({
      ...current,
      category_schedules: [...(current.category_schedules || []), newSchedule]
    }))
    setActiveCategoryTab(newId)
  }

  function updateGlobalSchedule(scheduleId, patch) {
    setSettings(current => ({
      ...current,
      category_schedules: (current.category_schedules || []).map(s => s.id === scheduleId ? { ...s, ...patch } : s)
    }))
  }

  function deleteGlobalSchedule(scheduleId) {
    setSettings(current => {
      const category_schedules = (current.category_schedules || []).filter(s => s.id !== scheduleId)
      const category_configs = (current.category_configs || []).map(config => ({
        ...config,
        schedules: (config.schedules || []).filter(s => s.id !== scheduleId)
      }))
      return { ...current, category_schedules, category_configs }
    })
    setActiveCategoryTab('standard')
  }

  function getSortedHierarchy(categories, categoryConfigs, activeTab) {
    function getOrder(catId) {
      const config = (categoryConfigs || []).find(c => c.categoryId === catId)
      if (activeTab === 'standard') {
        return config?.defaultOrder ?? 9999
      } else {
        const sched = (config?.schedules || []).find(s => s.id === activeTab)
        return sched?.order ?? config?.defaultOrder ?? 9999
      }
    }

    const roots = categories
      .filter(c => !c.parent_id)
      .sort((a, b) => getOrder(a.id) - getOrder(b.id))

    const tree = []
    for (const root of roots) {
      const children = categories
        .filter(c => c.parent_id === root.id)
        .sort((a, b) => getOrder(a.id) - getOrder(b.id))
      
      tree.push({
        ...root,
        isRoot: true,
        children: children.map(c => ({ ...c, isRoot: false }))
      })
    }
    return tree
  }

  function moveCategory(categoryId, direction, activeTab) {
    const tree = getSortedHierarchy(categories, settings.category_configs, activeTab)
    let found = false

    const rootIndex = tree.findIndex(r => r.id === categoryId)
    if (rootIndex >= 0) {
      const targetIndex = direction === 'up' ? rootIndex - 1 : rootIndex + 1
      if (targetIndex >= 0 && targetIndex < tree.length) {
        const temp = tree[rootIndex]
        tree[rootIndex] = tree[targetIndex]
        tree[targetIndex] = temp
        found = true
      }
    } else {
      for (const root of tree) {
        const childIndex = root.children.findIndex(c => c.id === categoryId)
        if (childIndex >= 0) {
          const targetIndex = direction === 'up' ? childIndex - 1 : childIndex + 1
          if (targetIndex >= 0 && targetIndex < root.children.length) {
            const temp = root.children[childIndex]
            root.children[childIndex] = root.children[targetIndex]
            root.children[targetIndex] = temp
            found = true
            break
          }
        }
      }
    }

    if (found) {
      let flatIndex = 1
      const nextConfigs = Array.isArray(settings.category_configs) ? [...settings.category_configs] : []
      
      for (const root of tree) {
        let rIdx = nextConfigs.findIndex(item => item.categoryId === root.id)
        let rBase = rIdx >= 0 ? nextConfigs[rIdx] : { categoryId: root.id, imageUrl: '', buttonLabel: '', defaultOrder: flatIndex, defaultVisible: true, schedules: [] }
        if (activeTab === 'standard') {
          rBase = { ...rBase, defaultOrder: flatIndex++ }
        } else {
          const schedules = Array.isArray(rBase.schedules) ? [...rBase.schedules] : []
          const sIndex = schedules.findIndex(s => s.id === activeTab)
          if (sIndex >= 0) {
            schedules[sIndex] = { ...schedules[sIndex], order: flatIndex++ }
          } else {
            schedules.push({
              id: activeTab,
              visible: rBase.defaultVisible,
              order: flatIndex++,
              visibilityMode: rBase.visibilityMode || 'show',
              redirectCategoryId: rBase.redirectCategoryId || ''
            })
          }
          rBase = { ...rBase, schedules }
        }
        if (rIdx >= 0) nextConfigs[rIdx] = rBase
        else nextConfigs.push(rBase)

        for (const child of root.children) {
          let cIdx = nextConfigs.findIndex(item => item.categoryId === child.id)
          let cBase = cIdx >= 0 ? nextConfigs[cIdx] : { categoryId: child.id, imageUrl: '', buttonLabel: '', defaultOrder: flatIndex, defaultVisible: true, schedules: [] }
          if (activeTab === 'standard') {
            cBase = { ...cBase, defaultOrder: flatIndex++ }
          } else {
            const schedules = Array.isArray(cBase.schedules) ? [...cBase.schedules] : []
            const sIndex = schedules.findIndex(s => s.id === activeTab)
            if (sIndex >= 0) {
              schedules[sIndex] = { ...schedules[sIndex], order: flatIndex++ }
            } else {
              schedules.push({
                id: activeTab,
                visible: cBase.defaultVisible,
                order: flatIndex++,
                visibilityMode: cBase.visibilityMode || 'show',
                redirectCategoryId: cBase.redirectCategoryId || ''
              })
            }
            cBase = { ...cBase, schedules }
          }
          if (cIdx >= 0) nextConfigs[cIdx] = cBase
          else nextConfigs.push(cBase)
        }
      }
      setSettings(current => ({ ...current, category_configs: nextConfigs }))
    }
  }

  function updateCategoryOption(categoryId, patch, activeTab) {
    setSettings(current => {
      const list = Array.isArray(current.category_configs) ? [...current.category_configs] : []
      const index = list.findIndex(item => item.categoryId === categoryId)
      const base = index >= 0 ? list[index] : { categoryId, imageUrl: '', buttonLabel: '', defaultOrder: list.length + 1, defaultVisible: true, schedules: [] }
      
      let nextConfig
      if (activeTab === 'standard') {
        let visibilityPatch = {}
        if (patch.visibilityMode) {
          visibilityPatch.defaultVisible = patch.visibilityMode === 'show'
        }
        nextConfig = { ...base, ...patch, ...visibilityPatch }
      } else {
        const schedules = Array.isArray(base.schedules) ? [...base.schedules] : []
        const sIndex = schedules.findIndex(s => s.id === activeTab)
        let schedulePatch = { ...patch }
        if (patch.visibilityMode) {
          schedulePatch.visible = patch.visibilityMode === 'show'
        }
        if (sIndex >= 0) {
          schedules[sIndex] = { ...schedules[sIndex], ...schedulePatch }
        } else {
          schedules.push({
            id: activeTab,
            visible: base.defaultVisible,
            order: base.defaultOrder || list.length + 1,
            visibilityMode: base.visibilityMode || 'show',
            redirectCategoryId: base.redirectCategoryId || '',
            ...schedulePatch
          })
        }
        nextConfig = { ...base, schedules }
      }
      
      if (index >= 0) list[index] = nextConfig
      else list.push(nextConfig)
      return { ...current, category_configs: list }
    })
  }

  function checkScheduleConflicts(schedules, categoryConfigs, categories) {
    const conflicts = []
    const scheds = Array.isArray(schedules) ? schedules : []
    
    for (let i = 0; i < scheds.length; i++) {
      for (let j = i + 1; j < scheds.length; j++) {
        const schedA = scheds[i]
        const schedB = scheds[j]
        
        const daysA = schedA.days && schedA.days.length ? schedA.days : ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
        const daysB = schedB.days && schedB.days.length ? schedB.days : ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
        const commonDays = daysA.filter(d => daysB.includes(d))
        if (commonDays.length === 0) continue
        
        const startA = parseTimeMinutes(schedA.start)
        const endA = parseTimeMinutes(schedA.end)
        const startB = parseTimeMinutes(schedB.start)
        const endB = parseTimeMinutes(schedB.end)
        const timeOverlap = startA <= endB && startB <= endA
        if (!timeOverlap) continue
        
        for (const cat of categories) {
          const config = (categoryConfigs || []).find(c => c.categoryId === cat.id)
          
          const valA = (config?.schedules || []).find(s => s.id === schedA.id) || {
            order: config?.defaultOrder ?? 9999,
            visibilityMode: config?.visibilityMode || (config?.defaultVisible !== false ? 'show' : 'hide'),
            redirectCategoryId: config?.redirectCategoryId || ''
          }
          
          const valB = (config?.schedules || []).find(s => s.id === schedB.id) || {
            order: config?.defaultOrder ?? 9999,
            visibilityMode: config?.visibilityMode || (config?.defaultVisible !== false ? 'show' : 'hide'),
            redirectCategoryId: config?.redirectCategoryId || ''
          }
          
          const orderDiff = valA.order !== valB.order
          const visDiff = valA.visibilityMode !== valB.visibilityMode || valA.redirectCategoryId !== valB.redirectCategoryId
          
          if (orderDiff || visDiff) {
            const trDays = {
              mon: 'Pazartesi', tue: 'Salı', wed: 'Çarşamba', thu: 'Perşembe',
              fri: 'Cuma', sat: 'Cumartesi', sun: 'Pazar'
            }
            const dayNames = commonDays.map(d => trDays[d] || d).join(', ')
            
            let details = []
            if (orderDiff) details.push(`Sıralama farkı (${schedA.name}: ${valA.order}. sıra vs ${schedB.name}: ${valB.order}. sıra)`)
            if (visDiff) details.push(`Görünürlük farkı`)
            
            conflicts.push({
              days: dayNames,
              time: `${schedA.start}-${schedA.end} ve ${schedB.start}-${schedB.end}`,
              categoryName: cat.name,
              schedAName: schedA.name,
              schedBName: schedB.name,
              details: details.join(', ')
            })
          }
        }
      }
    }
    return conflicts
  }

  async function toggleDeviceActive(deviceId, currentActive) {
    const nextActive = !currentActive
    try {
      setKioskDevices(prev => prev.map(d => d.id === deviceId ? { ...d, is_active: nextActive } : d))
      const { error } = await db
        .from('pos_terminals')
        .update({ is_active: nextActive })
        .eq('id', deviceId)
      if (error) throw error
      toast(`Kiosk ${nextActive ? 'aktif' : 'pasif'} hale getirildi.`, 'success')
    } catch (error) {
      setKioskDevices(prev => prev.map(d => d.id === deviceId ? { ...d, is_active: currentActive } : d))
      toast(error?.message || 'Cihaz durumu güncellenemedi.', 'error')
    }
  }

  async function toggleDeviceOperatingHours(deviceId, currentConfig, currentVal) {
    const nextVal = !currentVal
    const nextConfig = { ...currentConfig, operating_hours_enabled: nextVal }
    try {
      setKioskDevices(prev => prev.map(d => d.id === deviceId ? { ...d, config_data: nextConfig } : d))
      const { error } = await db
        .from('pos_terminals')
        .update({ config_data: nextConfig })
        .eq('id', deviceId)
      if (error) throw error

      if (!nextVal) {
        // Deaktif edildiyse kuralları da temizle
        const { error: delError } = await db
          .from('kiosk_terminal_operating_rules')
          .delete()
          .eq('terminal_id', deviceId)
        if (delError) console.error(delError)
        setDeviceAssignments(prev => prev.filter(a => a.terminal_id !== deviceId))
      }

      toast(`Çalışma saatleri kontrolü ${nextVal ? 'aktif' : 'pasif'} hale getirildi.`, 'success')
    } catch (error) {
      setKioskDevices(prev => prev.map(d => d.id === deviceId ? { ...d, config_data: currentConfig } : d))
      toast(error?.message || 'Çalışma saatleri ayarı güncellenemedi.', 'error')
    }
  }

  async function toggleDeviceTableService(deviceId, currentConfig, currentVal) {
    const nextVal = !currentVal
    const nextConfig = { ...currentConfig, table_service_enabled: nextVal }
    try {
      setKioskDevices(prev => prev.map(d => d.id === deviceId ? { ...d, config_data: nextConfig } : d))
      const { error } = await db
        .from('pos_terminals')
        .update({ config_data: nextConfig })
        .eq('id', deviceId)
      if (error) throw error
      toast(`Masaya servis seçeneği ${nextVal ? 'aktif' : 'pasif'} hale getirildi.`, 'success')
    } catch (error) {
      setKioskDevices(prev => prev.map(d => d.id === deviceId ? { ...d, config_data: currentConfig } : d))
      toast(error?.message || 'Masaya servis ayarı güncellenemedi.', 'error')
    }
  }

  async function handleAddOperatingRule() {
    if (!branchId) return
    const newRule = {
      branch_id: branchId,
      name: 'Yeni Kural',
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      start_time: '09:00',
      end_time: '22:00',
      note: ''
    }
    try {
      const { data, error } = await db
        .from('kiosk_operating_hours_rules')
        .insert([newRule])
        .select()
        .single()
      if (error) throw error
      setOperatingRules(prev => [...prev, data])
      toast('Çalışma saati kuralı eklendi.', 'success')
    } catch (error) {
      toast(error?.message || 'Kural eklenemedi.', 'error')
    }
  }

  async function handleUpdateOperatingRule(ruleId, patch) {
    try {
      setOperatingRules(prev => prev.map(rule => rule.id === ruleId ? { ...rule, ...patch } : rule))
      const { error } = await db
        .from('kiosk_operating_hours_rules')
        .update(patch)
        .eq('id', ruleId)
      if (error) throw error
    } catch (error) {
      toast(error?.message || 'Kural güncellenemedi.', 'error')
      // reload rules to revert
      const { data } = await db.from('kiosk_operating_hours_rules').select('*').eq('branch_id', branchId)
      if (data) setOperatingRules(data)
    }
  }

  async function handleRemoveOperatingRule(ruleId) {
    if (!window.confirm('Bu çalışma saati kuralını silmek istediğinize emin misiniz? Bu kurala bağlı tüm cihaz eşleşmeleri kaldırılacaktır.')) return
    try {
      const { error } = await db
        .from('kiosk_operating_hours_rules')
        .delete()
        .eq('id', ruleId)
      if (error) throw error
      setOperatingRules(prev => prev.filter(rule => rule.id !== ruleId))
      setDeviceAssignments(prev => prev.filter(assignment => assignment.rule_id !== ruleId))
      toast('Çalışma saati kuralı silindi.', 'success')
    } catch (error) {
      toast(error?.message || 'Kural silinemedi.', 'error')
    }
  }

  async function toggleRuleAssignment(terminalId, ruleId, currentAssigned) {
    try {
      if (currentAssigned) {
        const { error } = await db
          .from('kiosk_terminal_operating_rules')
          .delete()
          .eq('terminal_id', terminalId)
          .eq('rule_id', ruleId)
        if (error) throw error
        setDeviceAssignments(prev => prev.filter(a => !(a.terminal_id === terminalId && a.rule_id === ruleId)))
      } else {
        const { error } = await db
          .from('kiosk_terminal_operating_rules')
          .insert([{ terminal_id: terminalId, rule_id: ruleId }])
        if (error) throw error
        setDeviceAssignments(prev => [...prev, { terminal_id: terminalId, rule_id: ruleId }])
      }
    } catch (error) {
      toast(error?.message || 'Kural ataması güncellenemedi.', 'error')
    }
  }

  function addKioskStation() {
    setSettings(current => {
      const list = Array.isArray(current.kiosk_stations) ? [...current.kiosk_stations] : []
      const nextNumber = list.reduce((max, item) => Math.max(max, Number(item?.kiosk_number) || 0), 0) + 1
      return {
        ...current,
        kiosk_stations: [
          ...list,
          {
            id: uid('station'),
            code: `KIOSK-${String(nextNumber).padStart(2, '0')}`,
            name: `Kiosk ${nextNumber}`,
            kiosk_number: nextNumber,
            active: true,
            order: list.length + 1,
          },
        ],
      }
    })
  }

  function updateKioskStation(stationId, patch) {
    setSettings(current => ({
      ...current,
      kiosk_stations: (current.kiosk_stations || []).map((station, index) => (
        station.id === stationId
          ? {
              ...station,
              ...patch,
              order: station.order || index + 1,
            }
          : station
      )),
    }))
  }

  function removeKioskStation(stationId) {
    setSettings(current => ({
      ...current,
      kiosk_stations: (current.kiosk_stations || [])
        .filter(station => station.id !== stationId)
        .map((station, index) => ({ ...station, order: index + 1 })),
    }))
  }



  function updateSuggestionLimits(patch) {
    setSettings(current => ({
      ...current,
      suggestion_limits: {
        ...(current.suggestion_limits || {}),
        ...patch,
      },
    }))
  }

  function addProductSuggestion() {
    setSettings(current => ({
      ...current,
      product_suggestions: [
        ...(current.product_suggestions || []),
        {
          id: uid('suggest'),
          active: true,
          title: '',
          message: '',
          triggerType: 'product',
          triggerIds: [],
          suggestionType: 'product',
          suggestionProductId: '',
          suggestionCategoryId: '',
        },
      ],
    }))
  }

  function updateProductSuggestion(id, patch) {
    setSettings(current => ({
      ...current,
      product_suggestions: (current.product_suggestions || []).map(item => item.id === id ? { ...item, ...patch } : item),
    }))
  }

  function removeProductSuggestion(id) {
    setSettings(current => ({
      ...current,
      product_suggestions: (current.product_suggestions || []).filter(item => item.id !== id),
    }))
  }

  function addCheckoutSuggestion() {
    setSettings(current => ({
      ...current,
      checkout_suggestions: [
        ...(current.checkout_suggestions || []),
        {
          id: uid('checkout'),
          active: true,
          title: '',
          message: '',
          logic: 'and',
          conditions: [{ id: uid('condition'), field: 'always', value: '', value2: '' }],
          suggestionType: 'product',
          suggestionProductId: '',
          suggestionCategoryId: '',
        },
      ],
    }))
  }

  function updateCheckoutSuggestion(id, patch) {
    setSettings(current => ({
      ...current,
      checkout_suggestions: (current.checkout_suggestions || []).map(item => item.id === id ? { ...item, ...patch } : item),
    }))
  }

  function removeCheckoutSuggestion(id) {
    setSettings(current => ({
      ...current,
      checkout_suggestions: (current.checkout_suggestions || []).filter(item => item.id !== id),
    }))
  }

  function addCheckoutCondition(ruleId) {
    setSettings(current => ({
      ...current,
      checkout_suggestions: (current.checkout_suggestions || []).map(item => (
        item.id === ruleId
          ? {
              ...item,
              conditions: [
                ...(item.conditions || []),
                { id: uid('condition'), field: 'always', value: '', value2: '' },
              ],
            }
          : item
      )),
    }))
  }

  function updateCheckoutCondition(ruleId, conditionId, patch) {
    setSettings(current => ({
      ...current,
      checkout_suggestions: (current.checkout_suggestions || []).map(item => (
        item.id === ruleId
          ? {
              ...item,
              conditions: (item.conditions || []).map(condition => (
                condition.id === conditionId ? { ...condition, ...patch } : condition
              )),
            }
          : item
      )),
    }))
  }

  function removeCheckoutCondition(ruleId, conditionId) {
    setSettings(current => ({
      ...current,
      checkout_suggestions: (current.checkout_suggestions || []).map(item => {
        if (item.id !== ruleId) return item
        const nextConditions = (item.conditions || []).filter(condition => condition.id !== conditionId)
        return {
          ...item,
          conditions: nextConditions.length > 0 ? nextConditions : [{ id: uid('condition'), field: 'always', value: '', value2: '' }],
        }
      }),
    }))
  }

  function isKioskActive(product) {
    if (!kioskChannel) return false
    const prices = Array.isArray(product.channel_prices) ? product.channel_prices : []
    return prices.some(item => String(item.channel_id) === String(kioskChannel.id) && item.active !== false)
  }

  async function toggleProduct(product, active) {
    if (!kioskChannel) return
    const prices = Array.isArray(product.channel_prices) ? [...product.channel_prices] : []
    const index = prices.findIndex(item => String(item.channel_id) === String(kioskChannel.id))
    if (index >= 0) prices[index] = { ...prices[index], active }
    else prices.push({ channel_id: kioskChannel.id, price: 0, active })

    const { error } = await db.from('sale_items').update({ channel_prices: prices }).eq('id', product.id)
    if (error) {
      toast(error.message, 'error')
      return
    }
    setProducts(current => current.map(item => item.id === product.id ? { ...item, channel_prices: prices } : item))
  }

  function goToSection(id) {
    setActiveSection(id)
    const node = document.getElementById(id)
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  async function save(force = false) {
    if (!force) {
      const conflicts = checkScheduleConflicts(settings.category_schedules, settings.category_configs, categories)
      if (conflicts.length > 0) {
        setSaveConflicts(conflicts)
        return
      }
    }

    try {
      setSaving(true)
      const saved = await saveKioskSettings(settings)
      const nextSettings = saved || settings || KIOSK_DEFAULT_SETTINGS
      setSettings(nextSettings)
      setSavedSnapshot(JSON.stringify(nextSettings))
      setSaveConflicts([])
      toast('Yeni kiosk yönetimi ayarları kaydedildi', 'success')
    } catch (error) {
      toast(error?.message || 'Kayıt sırasında hata oluştu', 'error')
    } finally {
      setSaving(false)
    }
  }

  const dirty = JSON.stringify(settings) !== savedSnapshot
  const rootCategories = useMemo(() => categories.filter(category => !category.parent_id), [categories])
  // Tüm kategoriler: önce kökler, sonra her kökün alt kategorileri (hiyerarşik sıra)
  const sortedAllCategories = useMemo(() => {
    const roots = categories.filter(c => !c.parent_id).sort((a, b) => a.name.localeCompare(b.name, 'tr'))
    const result = []
    const addWithChildren = (parent, depth) => {
      result.push({ ...parent, _depth: depth })
      categories
        .filter(c => String(c.parent_id) === String(parent.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
        .forEach(child => addWithChildren(child, depth + 1))
    }
    roots.forEach(root => addWithChildren(root, 0))
    return result
  }, [categories])
  const filteredProducts = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    if (!term) return products
    return products.filter(product => product.name?.toLowerCase().includes(term))
  }, [products, searchTerm])
  const activeProductCount = useMemo(() => products.filter(product => isKioskActive(product)).length, [products, kioskChannel])
  const quickPickProducts = useMemo(() => {
    const ids = Array.isArray(settings.quick_pick_product_ids) ? settings.quick_pick_product_ids : []
    return ids.map(id => products.find(product => String(product.id) === String(id))).filter(Boolean)
  }, [products, settings.quick_pick_product_ids])
  const kioskStations = useMemo(() => (
    [...kioskDevices].sort((left, right) => (
      String(left.terminal_name || '').localeCompare(String(right.terminal_name || ''), 'tr')
    )).map((device, index) => ({
      id: device.id,
      code: device.activation_code,
      name: device.terminal_name || (device.device_type === 'kiosk_tablet' ? `Kiosk Tablet ${index + 1}` : `Kiosk ${index + 1}`),
      kiosk_number: index + 1,
      active: device.is_active !== false,
      order: index + 1,
      device_type: device.device_type,
      operating_hours_enabled: device.config_data?.operating_hours_enabled === true,
      table_service_enabled: device.config_data?.table_service_enabled === true,
      originalDevice: device
    }))
  ), [kioskDevices])
  const activeKioskStationCount = kioskStations.length

  const bannerActionSummary = useMemo(() => {
    switch (settings.main_banner_action_type) {
      case 'product':
        return products.find(product => String(product.id) === String(settings.main_banner_product_id))?.name || 'Urun secilmedi'
      case 'category':
        return categories.find(category => String(category.id) === String(settings.main_banner_category_id))?.name || 'Kategori secilmedi'
      case 'message':
        return settings.main_banner_message_title || 'Mesaj popupi'
      default:
        return 'Pasif'
    }
  }, [categories, products, settings.main_banner_action_type, settings.main_banner_category_id, settings.main_banner_message_title, settings.main_banner_product_id])

  if (loading) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
        <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
        Kiosk yönetimi yükleniyor...
      </div>
    )
  }

  return (
    <div className="page-enter">
      <Header
        title="Kiosk Yönetimi (Desktop)"
        subtitle="Ofis kullanımına uygun yeni editör. Eski ekran korunur; bundan sonraki genişleme bu panel üzerinden ilerler."
        actions={(
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SaveChip active={dirty} />
            <button className="btn-p" onClick={save} disabled={saving}>
              <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`} style={{ marginRight: 6 }} />
              {saving ? 'Kaydediliyor' : 'Kaydet'}
            </button>
          </div>
        )}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr) 320px', gap: 18, alignItems: 'start' }}>
        <aside style={{ ...shellCardStyle(14), position: 'sticky', top: 24 }}>
          <div style={{ fontSize: '.74rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: 12 }}>
            Bölümler
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {DESKTOP_SECTIONS.map(section => (
              <button
                key={section.id}
                type="button"
                onClick={() => goToSection(section.id)}
                style={{
                  borderTop: activeSection === section.id ? `1px solid ${section.accent}80` : '1px solid #e2e8f0',
                  borderRight: activeSection === section.id ? `1px solid ${section.accent}80` : '1px solid #e2e8f0',
                  borderBottom: activeSection === section.id ? `1px solid ${section.accent}80` : '1px solid #e2e8f0',
                  borderLeft: `4px solid ${section.accent}`,
                  background: activeSection === section.id ? `${section.accent}12` : '#fff',
                  borderRadius: 14,
                  padding: '12px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={iconBadgeStyle(`${section.accent}18`, section.accent)}>
                  <i className={`fa-solid ${section.icon}`} />
                </div>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '.84rem' }}>{section.label}</div>
              </button>
            ))}
          </div>
        </aside>

        <main style={{ display: 'grid', gap: 16 }}>
          <SectionBlock
            id="kioskler"
            icon="fa-tablet-screen-button"
            accent="#0f766e"
            title="Tanımlı Kiosk Cihazları"
          >
            <div style={subtleNoteStyle('#eff6ff', '#bfdbfe', '#1d4ed8')}>
              Kiosk tanımlamaları ve eşleştirmeleri <strong>POS ve Cihazlar</strong> menüsünden yapılmaktadır. Burada şubeye ait aktif cihazlar listelenmektedir.
            </div>

            {kioskStations.length > 0 ? (
              <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', background: '#fff' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ padding: '10px 14px', fontSize: '.78rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em' }}>Kiosk No</th>
                      <th style={{ padding: '10px 14px', fontSize: '.78rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em' }}>Kiosk ID (Pair Key)</th>
                      <th style={{ padding: '10px 14px', fontSize: '.78rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em' }}>Cihaz Tipi</th>
                      <th style={{ padding: '10px 14px', fontSize: '.78rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'center' }}>Cihaz Aktif</th>
                      <th style={{ padding: '10px 14px', fontSize: '.78rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'center' }}>Masaya Servis</th>
                      <th style={{ padding: '10px 14px', fontSize: '.78rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '.05em', textAlign: 'center' }}>Çalışma Saatlerini Kullan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kioskStations.map(station => {
                      const isHoursEnabled = station.operating_hours_enabled === true
                      const assignedRuleIds = deviceAssignments
                        .filter(a => a.terminal_id === station.id)
                        .map(a => a.rule_id)

                      return (
                        <Fragment key={station.id}>
                          <tr style={{ borderBottom: isHoursEnabled ? 'none' : '1px solid #f1f5f9' }}>
                            <td style={{ padding: '12px 14px', fontSize: '.86rem', fontWeight: 800, color: '#0f172a' }}>
                              Kiosk {station.kiosk_number}
                            </td>
                            <td style={{ padding: '12px 14px', fontSize: '.86rem', fontFamily: 'monospace', fontWeight: 600, color: '#2563eb' }}>
                              {station.code}
                            </td>
                            <td style={{ padding: '12px 14px' }}>
                              <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '4px 8px',
                                borderRadius: 6,
                                fontSize: '.76rem',
                                fontWeight: 700,
                                background: station.device_type === 'kiosk_tablet' ? 'rgba(139,92,246,0.1)' : 'rgba(15,118,110,0.1)',
                                color: station.device_type === 'kiosk_tablet' ? '#7c3aed' : '#0f766e',
                              }}>
                                <i className={`fa-solid ${station.device_type === 'kiosk_tablet' ? 'fa-tablet' : 'fa-tablet-screen-button'}`} />
                                {station.device_type === 'kiosk_tablet' ? 'Kiosk Tablet' : 'Kiosk'}
                              </span>
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                              <label className="tog" style={{ display: 'inline-block' }}>
                                <input
                                  type="checkbox"
                                  checked={station.active !== false}
                                  onChange={() => toggleDeviceActive(station.id, station.active)}
                                />
                                <span className="tog-sl" />
                              </label>
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                              <label className="tog" style={{ display: 'inline-block' }}>
                                <input
                                  type="checkbox"
                                  checked={station.table_service_enabled === true}
                                  onChange={() => toggleDeviceTableService(station.id, station.originalDevice?.config_data || {}, station.table_service_enabled)}
                                />
                                <span className="tog-sl" />
                              </label>
                            </td>
                            <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                              <label className="tog" style={{ display: 'inline-block' }}>
                                <input
                                  type="checkbox"
                                  checked={isHoursEnabled}
                                  onChange={() => toggleDeviceOperatingHours(station.id, station.originalDevice?.config_data || {}, isHoursEnabled)}
                                />
                                <span className="tog-sl" />
                              </label>
                            </td>
                          </tr>
                          {isHoursEnabled && (
                            <tr style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc' }}>
                              <td colSpan={6} style={{ padding: '10px 14px 14px 14px' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                  <div style={{ fontSize: '.76rem', fontWeight: 700, color: '#475569' }}>
                                    Bu Cihaz İçin Geçerli Çalışma Saatleri Kuralları:
                                  </div>
                                  {operatingRules.length > 0 ? (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                      {operatingRules.map(rule => {
                                        const isAssigned = assignedRuleIds.includes(rule.id)
                                        return (
                                          <label
                                            key={rule.id}
                                            style={{
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: 6,
                                              padding: '5px 10px',
                                              borderRadius: 8,
                                              border: isAssigned ? '1px solid #c7d2fe' : '1px solid #e2e8f0',
                                              background: isAssigned ? '#eef2ff' : '#fff',
                                              color: isAssigned ? '#4338ca' : '#475569',
                                              fontSize: '.76rem',
                                              fontWeight: 600,
                                              cursor: 'pointer',
                                              userSelect: 'none'
                                            }}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={isAssigned}
                                              onChange={() => toggleRuleAssignment(station.id, rule.id, isAssigned)}
                                              style={{ cursor: 'pointer' }}
                                            />
                                            {rule.name || 'İsimsiz Kural'}
                                            <span style={{ fontSize: '.68rem', color: '#64748b', fontWeight: 400 }}>
                                              ({rule.start_time}-{rule.end_time})
                                            </span>
                                          </label>
                                        )
                                      })}
                                    </div>
                                  ) : (
                                    <div style={{ fontSize: '.76rem', color: '#b91c1c', fontWeight: 500 }}>
                                      Şubede tanımlı kural yok. Aşağıdaki "Temel Akış" bölümünden çalışma saati kuralı ekleyin.
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={subtleNoteStyle('#f8fafc', '#dbe2ea', '#475569')}>
                Henuz bir kiosk tanimlanmadi. <strong>POS ve Cihazlar</strong> menüsünden şubedeki kiosklar icin yeni cihaz oluşturabilirsiniz.
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ color: '#64748b', fontSize: '.82rem' }}>
                Toplam {kioskStations.length} tanımlı kiosk cihazı.
              </div>
            </div>
          </SectionBlock>

          <SectionBlock
            id="temel-akis"
            icon="fa-sliders"
            accent="#2563eb"
            title="Cihaz Çalışma Saatleri"
            subtitle="Kioskların gün ve saat bazlı çalışma planı."
            headerRight={(
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '.78rem', fontWeight: 700, color: !settings.operating_hours_enabled ? '#1e293b' : '#94a3b8' }}>Sürekli Açık</span>
                <label className="tog" style={{ display: 'inline-block', margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={settings.operating_hours_enabled === true}
                    onChange={e => setField('operating_hours_enabled', e.target.checked)}
                  />
                  <span className="tog-sl" />
                </label>
                <span style={{ fontSize: '.78rem', fontWeight: 700, color: settings.operating_hours_enabled ? '#2563eb' : '#94a3b8' }}>Planlı Açık/Kapalı</span>
              </div>
            )}
          >
            {settings.operating_hours_enabled === true ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
                  <Field label="Kapalı ekran başlığı">
                    <input value={settings.closed_title || ''} onChange={event => setField('closed_title', event.target.value)} style={inputStyle()} placeholder="Kiosk şu anda kapalı" />
                  </Field>
                  <Field label="Kapalı ekran açıklaması">
                    <input value={settings.closed_subtitle || ''} onChange={event => setField('closed_subtitle', event.target.value)} style={inputStyle()} placeholder="Lütfen hizmet saatlerinde tekrar deneyin." />
                  </Field>
                </div>

                {operatingRules.length > 0 ? (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {operatingRules.map(rule => (
                      <ScheduleRuleEditor
                        key={rule.id}
                        rule={rule}
                        includeName
                        onChange={patch => handleUpdateOperatingRule(rule.id, patch)}
                        onRemove={() => handleRemoveOperatingRule(rule.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <div style={subtleNoteStyle()}>
                    Henüz tanımlı bir hizmet saati kuralınız yok. İsterseniz aşağıdan kurallar ekleyebilir veya bu bölümü kapalı tutup kioskları her zaman açık bırakabilirsiniz.
                  </div>
                )}

                <div>
                  <button type="button" className="btn-o" onClick={handleAddOperatingRule}>+ Çalışma Saati Kuralı Ekle</button>
                </div>
              </>
            ) : null}
          </SectionBlock>

          <SectionBlock
            id="gorsel-kimlik"
            icon="fa-palette"
            accent="#7c3aed"
            title="Görsel Kimlik"
            subtitle="Marka renkleri, arka planlar ve kategori buton görünümü."
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 12 }}>
              <Field label="Vurgu rengi"><input type="color" value={settings.accent_color || '#f59e0b'} onChange={event => setField('accent_color', event.target.value)} style={{ ...inputStyle(), padding: 6 }} /></Field>
              <Field label="Metin rengi"><input type="color" value={settings.text_color || '#f8fafc'} onChange={event => setField('text_color', event.target.value)} style={{ ...inputStyle(), padding: 6 }} /></Field>
              <Field label="Panel rengi"><input type="color" value={settings.panel_color || '#0f172a'} onChange={event => setField('panel_color', event.target.value)} style={{ ...inputStyle(), padding: 6 }} /></Field>
              <Field label="Kategori aktif rengi"><input type="color" value={settings.category_active_color || '#f59e0b'} onChange={event => setField('category_active_color', event.target.value)} style={{ ...inputStyle(), padding: 6 }} /></Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) 1.2fr', gap: 12 }}>
              <Field label="Kategori buton yüksekliği (cm)">
                <input
                  type="number"
                  step="0.1"
                  min={2.3}
                  max={4.8}
                  value={settings.category_button_height ? Number((settings.category_button_height / 37.8).toFixed(1)) : 3.0}
                  onChange={event => {
                    const cm = Number(event.target.value || 3.0);
                    setField('category_button_height', Math.round(cm * 37.8));
                  }}
                  style={inputStyle()}
                />
              </Field>
              <Field label="Kategori isimleri">
                <div
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 14,
                    padding: '4px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 16,
                    background: '#fff',
                    minHeight: 42,
                    boxSizing: 'border-box'
                  }}
                >
                  <div style={{ fontSize: '.76rem', color: '#64748b', lineHeight: 1.35 }}>
                    {settings.kiosk_show_category_labels === false
                      ? "Resim tüm butonu kaplar."
                      : "Resim altında etiket gösterilir."}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: '#f1f5f9', padding: 3, borderRadius: 10, flexShrink: 0 }}>
                    <button
                      type="button"
                      onClick={() => setField('kiosk_show_category_labels', true)}
                      style={{
                        padding: '5px 10px',
                        borderRadius: 8,
                        fontSize: '.78rem',
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        background: settings.kiosk_show_category_labels !== false ? '#fff' : 'transparent',
                        color: settings.kiosk_show_category_labels !== false ? '#0f172a' : '#64748b',
                        boxShadow: settings.kiosk_show_category_labels !== false ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      Göster
                    </button>
                    <button
                      type="button"
                      onClick={() => setField('kiosk_show_category_labels', false)}
                      style={{
                        padding: '5px 10px',
                        borderRadius: 8,
                        fontSize: '.78rem',
                        fontWeight: 700,
                        border: 'none',
                        cursor: 'pointer',
                        background: settings.kiosk_show_category_labels === false ? '#fff' : 'transparent',
                        color: settings.kiosk_show_category_labels === false ? '#0f172a' : '#64748b',
                        boxShadow: settings.kiosk_show_category_labels === false ? '0 1px 3px rgba(0,0,0,.1)' : 'none',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      Gizle
                    </button>
                  </div>
                </div>
              </Field>
              <Field label="Ürün kolon sayısı" hint="Kiosk ekranında aynı anda kaç kolon ürün görünsün? (2-6 arası)">
                <SearchableSelect
                  value={String(settings.product_grid_cols || 4)}
                  onChange={v => setField('product_grid_cols', Number(v || 4))}
                  options={[2,3,4,5,6].map(n => ({value:String(n),label:`${n} kolon`}))}
                  allowClear={false}
                />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Kiosk Arka Plan Görseli */}
              <div
                style={{
                  border: '1px dashed #cbd5e1',
                  borderRadius: 16,
                  background: '#f8fafc',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '.84rem' }}>Kiosk arka plan görseli</div>
                  <div style={{ fontSize: '.72rem', color: '#64748b', marginTop: 2 }}>Tüm kiosk akışını saran ana zemin. (Önerilen: 1080x1920 px)</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <label htmlFor="kiosk-bg-upload" className="btn-p" style={{ cursor: 'pointer', minHeight: 36, padding: '0 12px', fontSize: '.78rem', display: 'inline-flex', alignItems: 'center', gap: 6, margin: 0, borderRadius: 10 }}>
                    <i className="fa-solid fa-upload" /> Yükle
                  </label>
                  <input
                    id="kiosk-bg-upload"
                    type="file"
                    accept="image/*"
                    onChange={async event => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      setField('kiosk_bg_image', await uploadFileAndGetUrl(file, 1080, 1920));
                    }}
                    style={{ display: 'none' }}
                  />
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      overflow: 'hidden',
                      background: 'linear-gradient(135deg, #e2e8f0, #f8fafc)',
                      border: '1px solid #cbd5e1',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    {settings.kiosk_bg_image ? (
                      <img src={settings.kiosk_bg_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <i className="fa-solid fa-image" style={{ color: '#cbd5e1', fontSize: '.8rem' }} />
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn-o"
                    disabled={!settings.kiosk_bg_image}
                    onClick={() => setField('kiosk_bg_image', '')}
                    style={{ minHeight: 36, padding: '0 12px', fontSize: '.78rem', borderRadius: 10, opacity: !settings.kiosk_bg_image ? 0.5 : 1, cursor: !settings.kiosk_bg_image ? 'not-allowed' : 'pointer' }}
                  >
                    Temizle
                  </button>
                </div>
              </div>

              {/* Kiosk Logo */}
              <div
                style={{
                  border: '1px dashed #cbd5e1',
                  borderRadius: 16,
                  background: '#f8fafc',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '.84rem' }}>Kiosk logo</div>
                  <div style={{ fontSize: '.72rem', color: '#64748b', marginTop: 2 }}>Başlık ve karşılama ekranında kullanılır. (Önerilen: 512x512 px)</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <label htmlFor="kiosk-logo-upload" className="btn-p" style={{ cursor: 'pointer', minHeight: 36, padding: '0 12px', fontSize: '.78rem', display: 'inline-flex', alignItems: 'center', gap: 6, margin: 0, borderRadius: 10 }}>
                    <i className="fa-solid fa-upload" /> Yükle
                  </label>
                  <input
                    id="kiosk-logo-upload"
                    type="file"
                    accept="image/*"
                    onChange={async event => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      setField('kiosk_logo_url', await uploadFileAndGetUrl(file, 512, 512));
                    }}
                    style={{ display: 'none' }}
                  />
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      overflow: 'hidden',
                      background: 'linear-gradient(135deg, #e2e8f0, #f8fafc)',
                      border: '1px solid #cbd5e1',
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    {settings.kiosk_logo_url ? (
                      <img src={settings.kiosk_logo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    ) : (
                      <i className="fa-solid fa-image" style={{ color: '#cbd5e1', fontSize: '.8rem' }} />
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn-o"
                    disabled={!settings.kiosk_logo_url}
                    onClick={() => setField('kiosk_logo_url', '')}
                    style={{ minHeight: 36, padding: '0 12px', fontSize: '.78rem', borderRadius: 10, opacity: !settings.kiosk_logo_url ? 0.5 : 1, cursor: !settings.kiosk_logo_url ? 'not-allowed' : 'pointer' }}
                  >
                    Temizle
                  </button>
                </div>
              </div>
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 14, display: 'grid', gap: 12, background: '#fff', marginTop: 12 }}>
              <div>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>Tablet modu</div>
                <div style={{ fontSize: '.78rem', color: '#64748b', marginTop: 4, lineHeight: 1.5 }}>
                  iPad 11 inc sinifi kullanim icin ayri tablet yuzeyi. Ortak kiosk ayarlarini kullanir; burada sadece tablet yerlesimini etkileyen alanlar yonetilir.
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '240px repeat(2, minmax(0,1fr))', gap: 12 }}>
                <Field label="Tablet yönü">
                  <SearchableSelect
                    value={settings.tablet_orientation || 'auto'}
                    onChange={v => setField('tablet_orientation', v)}
                    options={[
                      {value:'auto',label:'Cihaza göre otomatik'},
                      {value:'portrait',label:'Zorla dikey'},
                      {value:'landscape',label:'Zorla yatay'},
                    ]}
                    allowClear={false}
                  />
                </Field>
                <Field label="Dikey kullanımda kolon sayısı">
                  <SearchableSelect
                    value={String(settings.tablet_product_grid_cols_portrait || 4)}
                    onChange={v => setField('tablet_product_grid_cols_portrait', Number(v || 4))}
                    options={[2,3,4,5,6].map(n => ({value:String(n),label:`${n} kolon`}))}
                    allowClear={false}
                  />
                </Field>
                <Field label="Yatay kullanımda kolon sayısı">
                  <SearchableSelect
                    value={String(settings.tablet_product_grid_cols_landscape || 5)}
                    onChange={v => setField('tablet_product_grid_cols_landscape', Number(v || 5))}
                    options={[3,4,5,6,7].map(n => ({value:String(n),label:`${n} kolon`}))}
                    allowClear={false}
                  />
                </Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
                <Field label="Dikey kategori buton yüksekliği (cm)">
                  <input
                    type="number"
                    step="0.1"
                    min={2.5}
                    max={4.8}
                    value={settings.tablet_category_button_height_portrait ? Number((settings.tablet_category_button_height_portrait / 37.8).toFixed(1)) : 3.3}
                    onChange={event => {
                      const cm = Number(event.target.value || 3.3);
                      setField('tablet_category_button_height_portrait', Math.round(cm * 37.8));
                    }}
                    style={inputStyle()}
                  />
                </Field>
                <Field label="Yatay kategori buton yüksekliği (cm)">
                  <input
                    type="number"
                    step="0.1"
                    min={2.3}
                    max={4.8}
                    value={settings.tablet_category_button_height_landscape ? Number((settings.tablet_category_button_height_landscape / 37.8).toFixed(1)) : 2.8}
                    onChange={event => {
                      const cm = Number(event.target.value || 2.8);
                      setField('tablet_category_button_height_landscape', Math.round(cm * 37.8));
                    }}
                    style={inputStyle()}
                  />
                </Field>
              </div>
            </div>
          </SectionBlock>

          <SectionBlock
            id="karsilama-ekrani"
            icon="fa-hand-pointer"
            accent="#0891b2"
            title="Karşılama Ekranı"
            subtitle="Buradaki tanımlamalar kioskun karşılama ekranına yansıtılır."
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.8fr', gap: 12 }}>
              <Field label="Baslik">
                <input value={settings.idle_title || ''} onChange={event => setField('idle_title', event.target.value)} style={inputStyle()} />
              </Field>
              <Field label="Baslat butonu">
                <input value={settings.idle_cta_label || ''} onChange={event => setField('idle_cta_label', event.target.value)} style={inputStyle()} />
              </Field>
              <Field label="Alt Metin">
                <input value={settings.idle_subtitle || ''} onChange={event => setField('idle_subtitle', event.target.value)} style={inputStyle()} />
              </Field>
            </div>

            <div
              style={{
                border: '1px dashed #cbd5e1',
                borderRadius: 16,
                background: '#f8fafc',
                padding: '14px 16px',
                display: 'grid',
                gap: 12,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 20,
                  flexWrap: 'wrap',
                }}
              >
                {/* Medya Tipi */}
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ fontSize: '.78rem', fontWeight: 700, color: '#475569' }}>Medya tipi</div>
                  <select
                    value={settings.idle_media_type || 'none'}
                    onChange={event => setField('idle_media_type', event.target.value)}
                    className="f-input"
                    style={{ minHeight: 40, width: 130, padding: '0 10px', fontSize: '.84rem' }}
                  >
                    <option value="none">Yok</option>
                    <option value="image">Görsel</option>
                    <option value="video">Video</option>
                  </select>
                </div>

                {/* Dosya Yükle */}
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ fontSize: '.78rem', fontWeight: 700, color: '#475569' }}>
                    {settings.idle_media_type === 'image' ? 'Dosya yükle (Önerilen: 1080x1920 px)' : 'Dosya yükle'}
                  </div>
                  <label
                    htmlFor="welcome-media-upload"
                    className="btn-p"
                    style={{
                      cursor: settings.idle_media_type === 'none' ? 'not-allowed' : 'pointer',
                      opacity: settings.idle_media_type === 'none' ? 0.5 : 1,
                      minHeight: 40,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      fontSize: '.82rem',
                      padding: '0 14px',
                      margin: 0,
                      borderRadius: 12,
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <i className="fa-solid fa-upload" /> Yükle
                  </label>
                  <input
                    id="welcome-media-upload"
                    type="file"
                    accept={settings.idle_media_type === 'video' ? 'video/*' : 'image/*'}
                    disabled={settings.idle_media_type === 'none'}
                    onChange={async event => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      const isVideo = settings.idle_media_type === 'video';
                      const url = await uploadFileAndGetUrl(file, isVideo ? null : 1080, isVideo ? null : 1920);
                      if (isVideo) {
                        setField('idle_media_url', url);
                      } else {
                        setIdleImage(url);
                      }
                    }}
                    style={{ display: 'none' }}
                  />
                </div>

                {/* Thumbnail */}
                <div style={{ display: 'grid', gap: 6, justifyItems: 'center' }}>
                  <div style={{ fontSize: '.78rem', fontWeight: 700, color: '#475569' }}>Thumbnail</div>
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 10,
                      overflow: 'hidden',
                      background: 'linear-gradient(135deg, #e2e8f0, #f8fafc)',
                      border: '1px solid #cbd5e1',
                      display: 'grid',
                      placeItems: 'center'
                    }}
                  >
                    {settings.idle_media_url || settings.idle_background_image ? (
                      settings.idle_media_type === 'video' ? (
                        <video src={settings.idle_media_url} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <img src={settings.idle_media_url || settings.idle_background_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      )
                    ) : (
                      <i className="fa-solid fa-ban" style={{ color: '#cbd5e1', fontSize: '.9rem' }} />
                    )}
                  </div>
                </div>

                {/* Temizle */}
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ fontSize: '.78rem', fontWeight: 700, color: '#475569' }}>Temizle</div>
                  <button
                    type="button"
                    className="btn-o"
                    disabled={!settings.idle_media_url && !settings.idle_background_image}
                    onClick={() => {
                      setField('idle_media_url', '');
                      setField('idle_background_image', '');
                    }}
                    style={{
                      minHeight: 40,
                      padding: '0 14px',
                      borderRadius: 12,
                      fontSize: '.82rem',
                      opacity: (!settings.idle_media_url && !settings.idle_background_image) ? 0.5 : 1,
                      cursor: (!settings.idle_media_url && !settings.idle_background_image) ? 'not-allowed' : 'pointer'
                    }}
                  >
                    Temizle
                  </button>
                </div>

                {/* Yenileme Süresi */}
                <div style={{ display: 'grid', gap: 6 }}>
                  <div style={{ fontSize: '.78rem', fontWeight: 700, color: '#475569' }}>Yenileme süresi (sn)</div>
                  <input
                    type="number"
                    min={10}
                    max={900}
                    value={settings.idle_timeout_sec || 60}
                    onChange={event => setField('idle_timeout_sec', Number(event.target.value || 60))}
                    className="f-input"
                    style={{ minHeight: 40, width: 140, padding: '0 10px', fontSize: '.84rem' }}
                  />
                </div>

                {/* Video URL (Alternatif) */}
                {settings.idle_media_type === 'video' && (
                  <div style={{ display: 'grid', gap: 6, flex: 1, minWidth: 200 }}>
                    <div style={{ fontSize: '.78rem', fontWeight: 700, color: '#475569' }}>Video URL (Alternatif)</div>
                    <input
                      value={settings.idle_media_url || ''}
                      onChange={event => setField('idle_media_url', event.target.value)}
                      className="f-input"
                      style={{ minHeight: 40, padding: '0 10px', fontSize: '.84rem' }}
                      placeholder="https://..."
                    />
                  </div>
                )}
              </div>

              {settings.idle_media_type === 'none' && (
                <div style={{ fontSize: '.78rem', color: '#64748b', lineHeight: 1.45 }}>
                  Karsılama medyası seçilmezse kiosk arka planı kullanılır. Bu bölümden dilediğinde görsel veya video bağlayabilirsin.
                </div>
              )}
            </div>
          </SectionBlock>

          <SectionBlock
            id="ana-banner"
            icon="fa-panorama"
            accent="#ef4444"
            title="Ana Banner"
            subtitle="Kioskun ust vitrin banneri, gorseli ve tiklama davranisi."
            headerRight={(
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '.78rem', fontWeight: 700, color: settings.kiosk_show_banners === false ? '#ef4444' : '#94a3b8' }}>Pasif</span>
                <label className="tog" style={{ display: 'inline-block', margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={settings.kiosk_show_banners !== false}
                    onChange={e => setField('kiosk_show_banners', e.target.checked)}
                  />
                  <span className="tog-sl" />
                </label>
                <span style={{ fontSize: '.78rem', fontWeight: 700, color: settings.kiosk_show_banners !== false ? '#10b981' : '#94a3b8' }}>Aktif</span>
              </div>
            )}
          >
            {settings.kiosk_show_banners !== false ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 12 }}>
                  <div style={{ display: 'grid', gap: 12 }}>
                    <Field label="Banner basligi">
                      <input value={settings.main_banner_title || ''} onChange={event => setField('main_banner_title', event.target.value)} style={inputStyle()} placeholder="Orn. Gunun one cikan lezzeti" />
                    </Field>
                    <Field label="Banner alt metni">
                      <textarea rows={3} value={settings.main_banner_subtitle || ''} onChange={event => setField('main_banner_subtitle', event.target.value)} style={textareaStyle(3)} placeholder="Kisa kampanya veya bilgilendirme metni" />
                    </Field>
                  </div>
                  
                  <div style={{ display: 'grid', gap: 12 }}>
                    {/* Banner görseli - Tek Satır */}
                    <div style={{ display: 'grid', gap: 6 }}>
                      <div style={{ fontSize: '.78rem', fontWeight: 700, color: '#475569' }}>Banner görseli (Önerilen: 1200x300 px)</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <label
                          htmlFor="main-banner-image-upload"
                          className="btn-p"
                          style={{
                            cursor: 'pointer',
                            minHeight: 40,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            fontSize: '.82rem',
                            padding: '0 14px',
                            margin: 0,
                            borderRadius: 12,
                            whiteSpace: 'nowrap'
                          }}
                        >
                          <i className="fa-solid fa-upload" /> Dosya Yükle
                        </label>
                        <input
                          id="main-banner-image-upload"
                          type="file"
                          accept="image/*"
                          onChange={async event => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            const url = await uploadFileAndGetUrl(file, 1200, 300);
                            setField('main_banner_image', url);
                          }}
                          style={{ display: 'none' }}
                        />

                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 10,
                            overflow: 'hidden',
                            background: 'linear-gradient(135deg, #e2e8f0, #f8fafc)',
                            border: '1px solid #cbd5e1',
                            display: 'grid',
                            placeItems: 'center'
                          }}
                        >
                          {settings.main_banner_image ? (
                            <img src={settings.main_banner_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <i className="fa-solid fa-ban" style={{ color: '#cbd5e1', fontSize: '.9rem' }} />
                          )}
                        </div>

                        <button
                          type="button"
                          className="btn-o"
                          disabled={!settings.main_banner_image}
                          onClick={() => setField('main_banner_image', '')}
                          style={{
                            minHeight: 40,
                            padding: '0 14px',
                            borderRadius: 12,
                            fontSize: '.82rem',
                            opacity: !settings.main_banner_image ? 0.5 : 1,
                            cursor: !settings.main_banner_image ? 'not-allowed' : 'pointer'
                          }}
                        >
                          Temizle
                        </button>
                      </div>
                    </div>

                    <Field label="Tıklama davranışı">
                      <SearchableSelect
                        value={settings.main_banner_action_type || 'none'}
                        onChange={v => setField('main_banner_action_type', v)}
                        options={[
                          {value:'none',label:'Pasif olsun'},
                          {value:'product',label:'Bir ürünü açsın'},
                          {value:'category',label:'Bir kategoriye götürsün'},
                          {value:'message',label:'Bir mesaj göstersin'},
                        ]}
                        allowClear={false}
                      />
                    </Field>

                    {settings.main_banner_action_type === 'product' ? (
                      <Field label="Açılacak ürün">
                        <SearchableSelect
                          value={settings.main_banner_product_id || ''}
                          onChange={v => setField('main_banner_product_id', v)}
                          options={products.map(p => ({value:p.id,label:p.name}))}
                          placeholder="Ürün seçin"
                        />
                      </Field>
                    ) : null}

                    {settings.main_banner_action_type === 'category' ? (
                      <Field label="Gidilecek kategori">
                        <SearchableSelect
                          value={settings.main_banner_category_id || ''}
                          onChange={v => setField('main_banner_category_id', v)}
                          options={categories.map(c => ({value:c.id,label:c.name}))}
                          placeholder="Kategori seçin"
                        />
                      </Field>
                    ) : null}

                    {settings.main_banner_action_type === 'message' ? (
                      <>
                        <Field label="Mesaj basligi">
                          <input value={settings.main_banner_message_title || ''} onChange={event => setField('main_banner_message_title', event.target.value)} style={inputStyle()} placeholder="Popup basligi" />
                        </Field>
                        <Field label="Mesaj icerigi">
                          <textarea rows={3} value={settings.main_banner_message_body || ''} onChange={event => setField('main_banner_message_body', event.target.value)} style={textareaStyle(3)} placeholder="Banner tiklaninca gosterilecek aciklama" />
                        </Field>
                      </>
                    ) : null}
                  </div>
                </div>

                <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 14, display: 'grid', gap: 12, background: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: 10, marginBottom: 4 }}>
                    <div style={{ display: 'grid', gap: 2 }}>
                      <div style={{ fontWeight: 800, color: '#0f172a' }}>Tablet banner</div>
                      <div style={{ fontSize: '.74rem', color: '#64748b' }}>
                        Tablet yuzeyi isterse kiosk bannerindan farkli bir baslik, gorsel ve tiklama davranisi kullanabilir.
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: '.78rem', fontWeight: 700, color: settings.tablet_show_banners === false ? '#ef4444' : '#94a3b8' }}>Pasif</span>
                      <label className="tog" style={{ display: 'inline-block', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={settings.tablet_show_banners !== false}
                          onChange={e => setField('tablet_show_banners', e.target.checked)}
                        />
                        <span className="tog-sl" />
                      </label>
                      <span style={{ fontSize: '.78rem', fontWeight: 700, color: settings.tablet_show_banners !== false ? '#10b981' : '#94a3b8' }}>Aktif</span>
                    </div>
                  </div>

                  {settings.tablet_show_banners !== false ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 12 }}>
                      <div style={{ display: 'grid', gap: 12 }}>
                        <Field label="Tablet banner basligi">
                          <input value={settings.tablet_main_banner_title || ''} onChange={event => setField('tablet_main_banner_title', event.target.value)} style={inputStyle()} placeholder="Bos birak: ortak banner basligi" />
                        </Field>
                        <Field label="Tablet banner alt metni">
                          <textarea rows={3} value={settings.tablet_main_banner_subtitle || ''} onChange={event => setField('tablet_main_banner_subtitle', event.target.value)} style={textareaStyle(3)} placeholder="Bos birak: ortak banner alt metni" />
                        </Field>
                      </div>
                      
                      <div style={{ display: 'grid', gap: 12 }}>
                        {/* Tablet banner görseli - Tek Satır */}
                        <div style={{ display: 'grid', gap: 6 }}>
                          <div style={{ fontSize: '.78rem', fontWeight: 700, color: '#475569' }}>Tablet banner görseli (Önerilen: 1200x300 px)</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                            <label
                              htmlFor="tablet-banner-image-upload"
                              className="btn-p"
                              style={{
                                cursor: 'pointer',
                                minHeight: 40,
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 8,
                                fontSize: '.82rem',
                                padding: '0 14px',
                                margin: 0,
                                borderRadius: 12,
                                whiteSpace: 'nowrap'
                              }}
                            >
                              <i className="fa-solid fa-upload" /> Dosya Yükle
                            </label>
                            <input
                              id="tablet-banner-image-upload"
                              type="file"
                              accept="image/*"
                              onChange={async event => {
                                const file = event.target.files?.[0];
                                if (!file) return;
                                const url = await uploadFileAndGetUrl(file, 1200, 300);
                                setField('tablet_main_banner_image', url);
                              }}
                              style={{ display: 'none' }}
                            />

                            <div
                              style={{
                                width: 40,
                                height: 40,
                                borderRadius: 10,
                                overflow: 'hidden',
                                background: 'linear-gradient(135deg, #e2e8f0, #f8fafc)',
                                border: '1px solid #cbd5e1',
                                display: 'grid',
                                placeItems: 'center'
                              }}
                            >
                              {settings.tablet_main_banner_image ? (
                                <img src={settings.tablet_main_banner_image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <i className="fa-solid fa-ban" style={{ color: '#cbd5e1', fontSize: '.9rem' }} />
                              )}
                            </div>

                            <button
                              type="button"
                              className="btn-o"
                              disabled={!settings.tablet_main_banner_image}
                              onClick={() => setField('tablet_main_banner_image', '')}
                              style={{
                                minHeight: 40,
                                padding: '0 14px',
                                borderRadius: 12,
                                fontSize: '.82rem',
                                opacity: !settings.tablet_main_banner_image ? 0.5 : 1,
                                cursor: !settings.tablet_main_banner_image ? 'not-allowed' : 'pointer'
                              }}
                            >
                              Temizle
                            </button>
                          </div>
                        </div>

                        <Field label="Tablet tıklama davranışı">
                          <SearchableSelect
                            value={settings.tablet_main_banner_action_type || ''}
                            onChange={v => setField('tablet_main_banner_action_type', v)}
                            options={[
                              {value:'',label:'Ortak davranış / pasif'},
                              {value:'product',label:'Bir ürünü açsın'},
                              {value:'category',label:'Bir kategoriye götürsün'},
                              {value:'message',label:'Bir mesaj göstersin'},
                            ]}
                            allowClear={false}
                          />
                        </Field>
                        
                        {settings.tablet_main_banner_action_type === 'product' ? (
                          <Field label="Tablet banner ürünü">
                            <SearchableSelect
                              value={settings.tablet_main_banner_product_id || ''}
                              onChange={v => setField('tablet_main_banner_product_id', v)}
                              options={products.map(p => ({value:p.id,label:p.name}))}
                              placeholder="Ürün seçin"
                            />
                          </Field>
                        ) : null}
                        {settings.tablet_main_banner_action_type === 'category' ? (
                          <Field label="Tablet banner kategorisi">
                            <SearchableSelect
                              value={settings.tablet_main_banner_category_id || ''}
                              onChange={v => setField('tablet_main_banner_category_id', v)}
                              options={categories.map(c => ({value:c.id,label:c.name}))}
                              placeholder="Kategori seçin"
                            />
                          </Field>
                        ) : null}
                        {settings.tablet_main_banner_action_type === 'message' ? (
                          <>
                            <Field label="Tablet mesaj basligi">
                              <input value={settings.tablet_main_banner_message_title || ''} onChange={event => setField('tablet_main_banner_message_title', event.target.value)} style={inputStyle()} placeholder="Popup basligi" />
                            </Field>
                            <Field label="Tablet mesaj icerigi">
                              <textarea rows={3} value={settings.tablet_main_banner_message_body || ''} onChange={event => setField('tablet_main_banner_message_body', event.target.value)} style={textareaStyle(3)} placeholder="Banner tiklaninca gosterilecek aciklama" />
                            </Field>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: '.78rem', color: '#64748b', fontStyle: 'italic', padding: '6px 0' }}>
                      Tablet banner pasif durumdadır. Tablet akışında üst banner gösterilmez.
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div style={subtleNoteStyle()}>
                Ana banner pasif durumdadır. Kiosk ana akışında üst banner gösterilmez. Etkinleştirmek için yukarıdaki anahtarı kullanabilirsiniz.
              </div>
            )}
          </SectionBlock>

          <SectionBlock
            id="hizli-secim"
            icon="fa-bolt"
            accent="#16a34a"
            title="Hızlı Seçim"
            subtitle="Banner altında görünen iki hızlı ürün kutusu."
            headerRight={(
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '.78rem', fontWeight: 700, color: settings.kiosk_show_quick_picks === false ? '#ef4444' : '#94a3b8' }}>Pasif</span>
                <label className="tog" style={{ display: 'inline-block', margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={settings.kiosk_show_quick_picks !== false}
                    onChange={e => setField('kiosk_show_quick_picks', e.target.checked)}
                  />
                  <span className="tog-sl" />
                </label>
                <span style={{ fontSize: '.78rem', fontWeight: 700, color: settings.kiosk_show_quick_picks !== false ? '#10b981' : '#94a3b8' }}>Aktif</span>
              </div>
            )}
          >
            {settings.kiosk_show_quick_picks !== false ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
                  {[0, 1].map(index => (
                    <Field key={index} label={`Hızlı seçim ${index + 1}`} hint="Boş bırakırsan sistem otomatik uygun ürün seçer.">
                      <SearchableSelect
                        value={settings.quick_pick_product_ids?.[index] || ''}
                        onChange={v => {
                          const next = Array.isArray(settings.quick_pick_product_ids) ? [...settings.quick_pick_product_ids] : []
                          while (next.length < 2) next.push('')
                          next[index] = v
                          setField('quick_pick_product_ids', next.slice(0, 2))
                        }}
                        options={products.map(p => ({value:p.id,label:p.name}))}
                        placeholder="Otomatik seçim kullan"
                      />
                    </Field>
                  ))}
                </div>

                <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 14, display: 'grid', gap: 12, background: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: 10, marginBottom: 4 }}>
                    <div style={{ display: 'grid', gap: 2 }}>
                      <div style={{ fontWeight: 800, color: '#0f172a' }}>Tablet hızlı seçim</div>
                      <div style={{ fontSize: '.74rem', color: '#64748b' }}>
                        Tablet isterse farklı hızlı ürünler kullanabilir. Boş bırakılan alanlarda sistem ortak kiosk seçimini veya otomatik öneriyi kullanır.
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: '.78rem', fontWeight: 700, color: settings.tablet_show_quick_picks === false ? '#ef4444' : '#94a3b8' }}>Pasif</span>
                      <label className="tog" style={{ display: 'inline-block', margin: 0 }}>
                        <input
                          type="checkbox"
                          checked={settings.tablet_show_quick_picks !== false}
                          onChange={e => setField('tablet_show_quick_picks', e.target.checked)}
                        />
                        <span className="tog-sl" />
                      </label>
                      <span style={{ fontSize: '.78rem', fontWeight: 700, color: settings.tablet_show_quick_picks !== false ? '#10b981' : '#94a3b8' }}>Aktif</span>
                    </div>
                  </div>

                  {settings.tablet_show_quick_picks !== false ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
                      {[0, 1].map(index => (
                        <Field key={`tablet-quick-${index}`} label={`Tablet hızlı seçim ${index + 1}`} hint="Boş bırak: ortak / otomatik seçim">
                          <SearchableSelect
                            value={settings.tablet_quick_pick_product_ids?.[index] || ''}
                            onChange={v => {
                              const next = Array.isArray(settings.tablet_quick_pick_product_ids) ? [...settings.tablet_quick_pick_product_ids] : []
                              while (next.length < 2) next.push('')
                              next[index] = v
                              setField('tablet_quick_pick_product_ids', next.slice(0, 2))
                            }}
                            options={products.map(p => ({value:p.id,label:p.name}))}
                            placeholder="Ortak / otomatik seçim"
                          />
                        </Field>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: '.78rem', color: '#64748b', fontStyle: 'italic', padding: '6px 0' }}>
                      Tablet hızlı seçimleri pasif durumdadır. Tablet akışında ortak kiosk seçimleri kullanılır.
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div style={subtleNoteStyle()}>
                Hızlı seçimler pasif durumdadır. Kiosk ana akışında hızlı ürün kutuları gösterilmez. Etkinleştirmek için yukarıdaki anahtarı kullanabilirsiniz.
              </div>
            )}
          </SectionBlock>

          <SectionBlock
            id="kategori-yonetimi"
            icon="fa-layer-group"
            accent="#f97316"
            title="Kategori Yönetimi"
            subtitle="Kategori ağacı sıralamasını, buton etiketlerini ve zaman bazlı görünürlüğü düzenleyin."
          >
            {categories.length === 0 ? (
              <div style={subtleNoteStyle()}>
                Kullanılabilecek kategori bulunamadı. Önce satış kategorilerini kontrol etmenizi öneririm.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {/* Tabs Row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', paddingBottom: 10, flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => setActiveCategoryTab('standard')}
                      style={{
                        padding: '6px 14px',
                        borderRadius: 10,
                        fontSize: '.82rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        border: activeCategoryTab === 'standard' ? '1px solid #ea580c' : '1px solid #cbd5e1',
                        background: activeCategoryTab === 'standard' ? '#ea580c' : '#fff',
                        color: activeCategoryTab === 'standard' ? '#fff' : '#475569',
                      }}
                    >
                      Standart
                    </button>
                    {(settings.category_schedules || []).map(sched => (
                      <button
                        key={sched.id}
                        type="button"
                        onClick={() => setActiveCategoryTab(sched.id)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: 10,
                          fontSize: '.82rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          border: activeCategoryTab === sched.id ? '1px solid #ea580c' : '1px solid #cbd5e1',
                          background: activeCategoryTab === sched.id ? '#ea580c' : '#fff',
                          color: activeCategoryTab === sched.id ? '#fff' : '#475569',
                        }}
                      >
                        {sched.name}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="btn-p"
                    onClick={createGlobalSchedule}
                    style={{ fontSize: '.82rem', padding: '6px 12px', background: '#f97316', borderColor: '#f97316' }}
                  >
                    <i className="fa-solid fa-plus" style={{ marginRight: 6 }} /> Yeni Saat Kuralı Yarat
                  </button>
                </div>

                {/* Active Tab Schedule Config Editor */}
                {activeCategoryTab !== 'standard' && (() => {
                  const activeSched = (settings.category_schedules || []).find(s => s.id === activeCategoryTab)
                  if (!activeSched) return null
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr 100px 100px auto', gap: 10, alignItems: 'center', background: '#f8fafc', padding: 12, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                      <Field label="Kural Adı">
                        <input value={activeSched.name} onChange={e => updateGlobalSchedule(activeSched.id, { name: e.target.value })} style={inputStyle()} />
                      </Field>
                      <Field label="Geçerli Günler">
                        <div style={{ display: 'flex', gap: 4 }}>
                          {DAY_OPTIONS.map(([code, label]) => {
                            const active = activeSched.days.includes(code)
                            return (
                              <button
                                key={code}
                                type="button"
                                onClick={() => {
                                  const nextDays = activeSched.days.includes(code)
                                    ? activeSched.days.filter(d => d !== code)
                                    : [...activeSched.days, code]
                                  updateGlobalSchedule(activeSched.id, { days: nextDays })
                                }}
                                style={{
                                  width: 28,
                                  height: 28,
                                  borderRadius: 6,
                                  fontSize: '.74rem',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  border: active ? '1px solid #ea580c' : '1px solid #cbd5e1',
                                  background: active ? '#ea580c' : '#fff',
                                  color: active ? '#fff' : '#475569',
                                  transition: 'all 0.15s ease'
                                }}
                              >
                                {label}
                              </button>
                            )
                          })}
                        </div>
                      </Field>
                      <Field label="Başlangıç">
                        <input type="time" value={activeSched.start} onChange={e => updateGlobalSchedule(activeSched.id, { start: e.target.value })} style={inputStyle()} />
                      </Field>
                      <Field label="Bitiş">
                        <input type="time" value={activeSched.end} onChange={e => updateGlobalSchedule(activeSched.id, { end: e.target.value })} style={inputStyle()} />
                      </Field>
                      <div style={{ alignSelf: 'end', height: 40, display: 'flex', alignItems: 'center' }}>
                        <button type="button" className="btn-o" style={{ borderColor: '#ef4444', color: '#ef4444' }} onClick={() => deleteGlobalSchedule(activeSched.id)}>
                          <i className="fa-solid fa-trash" style={{ marginRight: 6 }} /> Kuralı Sil
                        </button>
                      </div>
                    </div>
                  )
                })()}

                {/* Tree Hierarchy List */}
                <div style={{ display: 'grid', gap: 8 }}>
                  {(() => {
                    const tree = getSortedHierarchy(categories, settings.category_configs, activeCategoryTab)
                    
                    const renderRow = (category, index, isRoot, siblingList) => {
                      const config = (settings.category_configs || []).find(c => c.categoryId === category.id) || {
                        categoryId: category.id,
                        buttonLabel: '',
                        defaultOrder: index + 1,
                        defaultVisible: true,
                        visibilityMode: 'show',
                        redirectCategoryId: '',
                        schedules: []
                      }

                      let activeMode = 'show'
                      let activeRedirectId = ''
                      if (activeCategoryTab === 'standard') {
                        activeMode = config.visibilityMode || (config.defaultVisible !== false ? 'show' : 'hide')
                        activeRedirectId = config.redirectCategoryId || ''
                      } else {
                        const sched = (config.schedules || []).find(s => s.id === activeCategoryTab)
                        if (sched) {
                          activeMode = sched.visibilityMode || (sched.visible !== false ? 'show' : 'hide')
                          activeRedirectId = sched.redirectCategoryId || ''
                        } else {
                          activeMode = config.visibilityMode || (config.defaultVisible !== false ? 'show' : 'hide')
                          activeRedirectId = config.redirectCategoryId || ''
                        }
                      }

                      return (
                        <div key={category.id} style={{
                          border: '1px solid #e2e8f0',
                          borderRadius: 12,
                          padding: '10px 14px',
                          background: isRoot ? '#fff' : '#f8fafc',
                          marginLeft: isRoot ? 0 : 28,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12
                        }}>
                          {/* Left: Indicator lines, Folder icon, category name, button label */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                            {!isRoot && (
                              <i className="fa-solid fa-turn-up" style={{ fontSize: '.65rem', color: '#94a3b8', transform: 'rotate(90deg)', marginRight: 4 }} />
                            )}
                            <i className={`fa-solid ${isRoot ? 'fa-folder' : 'fa-tag'}`} style={{ color: isRoot ? '#f97316' : '#64748b', fontSize: '.9rem', flexShrink: 0 }} />
                            <span style={{ fontWeight: isRoot ? 800 : 600, color: '#0f172a', fontSize: '.84rem', minWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {category.name}
                            </span>
                            
                            <div style={{ width: 180, marginLeft: 8 }}>
                              <input
                                value={config.buttonLabel || ''}
                                onChange={e => updateCategoryConfig(category.id, { buttonLabel: e.target.value })}
                                style={{ ...inputStyle(), padding: '4px 8px', fontSize: '.78rem', height: 32 }}
                                placeholder={category.name}
                              />
                            </div>
                          </div>

                          {/* Center: Move Up / Down Buttons */}
                          <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                            <button
                              type="button"
                              className="btn-o"
                              style={{ width: 32, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                              disabled={index === 0}
                              onClick={() => moveCategory(category.id, 'up', activeCategoryTab)}
                            >
                              <i className="fa-solid fa-arrow-up" style={{ fontSize: '.8rem' }} />
                            </button>
                            <button
                              type="button"
                              className="btn-o"
                              style={{ width: 32, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}
                              disabled={index === siblingList.length - 1}
                              onClick={() => moveCategory(category.id, 'down', activeCategoryTab)}
                            >
                              <i className="fa-solid fa-arrow-down" style={{ fontSize: '.8rem' }} />
                            </button>
                          </div>

                          {/* Right: Visibility Segment Selector + Redirect Dropdown */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            <div style={{ display: 'flex', gap: 2, background: '#f1f5f9', padding: 3, borderRadius: 8, border: '1px solid #cbd5e160' }}>
                              {[
                                { value: 'show', label: 'Göster' },
                                { value: 'hide', label: 'Gizle' },
                                { value: 'redirect', label: 'Yönlendir' }
                              ].map(opt => {
                                const selected = activeMode === opt.value
                                return (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => updateCategoryOption(category.id, { visibilityMode: opt.value }, activeCategoryTab)}
                                    style={{
                                      border: 'none',
                                      background: selected ? '#fff' : 'transparent',
                                      color: selected ? '#ea580c' : '#64748b',
                                      fontSize: '.72rem',
                                      fontWeight: 800,
                                      borderRadius: 6,
                                      padding: '4px 10px',
                                      cursor: 'pointer',
                                      boxShadow: selected ? '0 1px 3px rgba(0,0,0,.08)' : 'none',
                                      transition: 'all 0.15s ease'
                                    }}
                                  >
                                    {opt.label}
                                  </button>
                                )
                              })}
                            </div>

                            {activeMode === 'redirect' && (
                              <div style={{ width: 180 }}>
                                <SearchableSelect
                                  value={activeRedirectId}
                                  onChange={val => updateCategoryOption(category.id, { redirectCategoryId: val }, activeCategoryTab)}
                                  options={categories
                                    .filter(c => c.id !== category.id)
                                    .map(c => ({ value: c.id, label: c.name }))
                                  }
                                  placeholder="Hedef kategori seçin..."
                                  allowClear={false}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    }

                    return tree.map((root, rootIndex) => (
                      <Fragment key={root.id}>
                        {renderRow(root, rootIndex, true, tree)}
                        {root.children.map((child, childIndex) => renderRow(child, childIndex, false, root.children))}
                      </Fragment>
                    ))
                  })()}
                </div>
              </div>
            )}
          </SectionBlock>

          <SectionBlock
            id="urunler"
            icon="fa-utensils"
            accent="#0f766e"
            title="Ürünler"
            subtitle="Ürün arama ve kanal bazlı açık/kapalı ürün yönetimi."
          >
            <div>
              <Field label="Ürün ara">
                <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} style={inputStyle()} placeholder="Ürün ara..." />
              </Field>
            </div>

            <div style={{ display: 'grid', gap: 8, maxHeight: 560, overflowY: 'auto', paddingRight: 4 }}>
              {filteredProducts.map(product => (
                <div key={product.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center', borderRadius: 14, border: '1px solid #e2e8f0', background: '#fff', padding: '10px 12px' }}>
                  <div>
                    <div style={{ color: '#0f172a', fontWeight: 700, fontSize: '.88rem' }}>{product.name}</div>
                    <div style={{ color: '#64748b', fontSize: '.72rem', marginTop: 4 }}>
                      {[product.sale_cat_l1, product.sale_cat_l2, product.sale_cat_l3, product.sale_cat_l4, product.sale_cat_l5].filter(Boolean).length} kategori baglantisi
                    </div>
                  </div>
                  <span style={{ color: isKioskActive(product) ? '#15803d' : '#64748b', fontWeight: 800, fontSize: '.76rem' }}>{isKioskActive(product) ? 'Acik' : 'Kapali'}</span>
                  <button type="button" className="btn-o" onClick={() => toggleProduct(product, !isKioskActive(product))}>
                    {isKioskActive(product) ? 'Kapat' : 'Ac'}
                  </button>
                </div>
              ))}
            </div>
          </SectionBlock>

          <SectionBlock
            id="oneriler"
            icon="fa-bullhorn"
            accent="#ec4899"
            title="Öneriler"
            subtitle="Ürün akışı ve ödeme öncesi popup kuralları."
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Urun akisi popup limiti" hint="Bir musteri oturumunda kac kez urun bazli popup acilsin?">
                <input type="number" min={0} max={20} value={settings.suggestion_limits?.productFlow ?? 2} onChange={event => updateSuggestionLimits({ productFlow: Number(event.target.value || 0) })} style={inputStyle()} />
              </Field>
              <Field label="Odeme oncesi popup limiti" hint="Odeme oncesi oneriler icin ayri limit.">
                <input type="number" min={0} max={20} value={settings.suggestion_limits?.checkout ?? 1} onChange={event => updateSuggestionLimits({ checkout: Number(event.target.value || 0) })} style={inputStyle()} />
              </Field>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              {(settings.product_suggestions || []).map(rule => (
                <div key={rule.id} style={{ borderRadius: 14, border: '1px solid #e2e8f0', background: '#fff', padding: 14, display: 'grid', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ fontWeight: 800, color: '#0f172a', flex: 1 }}>Urun bazli kural</div>
                    <button type="button" className="btn-o" onClick={() => updateProductSuggestion(rule.id, { active: !(rule.active !== false) })}>
                      {rule.active !== false ? 'Aktif' : 'Pasif'}
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <Field label="Popup basligi">
                      <input value={rule.title || ''} onChange={event => updateProductSuggestion(rule.id, { title: event.target.value })} style={inputStyle()} placeholder="Orn. Patates ekleyelim mi?" />
                    </Field>
                    <Field label="Tetik tipi">
                      <SearchableSelect
                        value={rule.triggerType || 'product'}
                        onChange={v => updateProductSuggestion(rule.id, { triggerType: v, triggerIds: [] })}
                        options={[{value:'product',label:'Ürün tetiklenince'},{value:'category',label:'Kategori tetiklenince'}]}
                        allowClear={false}
                      />
                    </Field>
                  </div>
                  <Field label="Popup mesajı">
                    <textarea rows={2} value={rule.message || ''} onChange={event => updateProductSuggestion(rule.id, { message: event.target.value })} style={textareaStyle(2)} placeholder="Ör. Menüyü tamamlamak ister misin?" />
                  </Field>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <Field label="Tetik değeri">
                      <SearchableSelect
                        value={rule.triggerIds?.[0] || ''}
                        onChange={v => updateProductSuggestion(rule.id, { triggerIds: v ? [v] : [] })}
                        options={(rule.triggerType === 'category' ? categories : products).map(item => ({value:item.id,label:item.name}))}
                        placeholder="Seçin"
                      />
                    </Field>
                    <Field label="Çıktı tipi">
                      <SearchableSelect
                        value={rule.suggestionType || 'product'}
                        onChange={v => updateProductSuggestion(rule.id, { suggestionType: v, suggestionProductId: '', suggestionCategoryId: '' })}
                        options={[{value:'product',label:'Ürün öner'},{value:'category',label:'Kategori öner'},{value:'message',label:'Sadece mesaj göster'}]}
                        allowClear={false}
                      />
                    </Field>
                  </div>
                  {rule.suggestionType === 'product' ? (
                    <Field label="Önerilen ürün">
                      <SearchableSelect
                        value={rule.suggestionProductId || ''}
                        onChange={v => updateProductSuggestion(rule.id, { suggestionProductId: v })}
                        options={products.map(p => ({value:p.id,label:p.name}))}
                        placeholder="Ürün seçin"
                      />
                    </Field>
                  ) : null}
                  {rule.suggestionType === 'category' ? (
                    <Field label="Önerilen kategori">
                      <SearchableSelect
                        value={rule.suggestionCategoryId || ''}
                        onChange={v => updateProductSuggestion(rule.id, { suggestionCategoryId: v })}
                        options={categories.map(c => ({value:c.id,label:c.name}))}
                        placeholder="Kategori seçin"
                      />
                    </Field>
                  ) : null}
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button type="button" className="btn-o" onClick={() => removeProductSuggestion(rule.id)} style={{ color: '#b91c1c' }}>
                      Kurali Sil
                    </button>
                  </div>
                </div>
              ))}
              <div>
                <button type="button" className="btn-o" onClick={addProductSuggestion}>+ Urun Bazli Oneri Ekle</button>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              {(settings.checkout_suggestions || []).map(rule => (
                <div key={rule.id} style={{ borderRadius: 14, border: '1px solid #e2e8f0', background: '#fff', padding: 14, display: 'grid', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 12 }}>
                    <Field label="Popup basligi">
                      <input value={rule.title || ''} onChange={event => updateCheckoutSuggestion(rule.id, { title: event.target.value })} style={inputStyle()} placeholder="Orn. 500 TL'ye tamamla" />
                    </Field>
                    <Field label="Koşul mantığı">
                      <SearchableSelect
                        value={rule.logic || 'and'}
                        onChange={v => updateCheckoutSuggestion(rule.id, { logic: v })}
                        options={[{value:'and',label:'VE'},{value:'or',label:'VEYA'}]}
                        allowClear={false}
                      />
                    </Field>
                  </div>
                  <Field label="Popup / kampanya mesaji">
                    <textarea rows={2} value={rule.message || ''} onChange={event => updateCheckoutSuggestion(rule.id, { message: event.target.value })} style={textareaStyle(2)} placeholder="Orn. 500 TL'ye tamamlarsan ucretsiz kahve" />
                  </Field>
                  <div style={{ display: 'grid', gap: 10 }}>
                    <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '.84rem' }}>Kosullar</div>
                    {(rule.conditions || []).map(condition => (
                      <div key={condition.id} style={{ borderRadius: 12, border: '1px solid #e2e8f0', padding: 12, display: 'grid', gap: 10 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
                          <Field label="Koşul tipi">
                            <SearchableSelect
                              value={condition.field || 'always'}
                              onChange={v => updateCheckoutCondition(rule.id, condition.id, { field: v, value: '', value2: '' })}
                              options={[
                                {value:'always',label:'Tüm siparişler'},
                                {value:'has_product',label:'Siparişte X ürünü varsa'},
                                {value:'has_category',label:'Siparişte X kategorisi varsa'},
                                {value:'total_lt',label:'Tutar < Y'},
                                {value:'total_gt',label:'Tutar > Z'},
                                {value:'total_between',label:'Tutar Y - Z arası'},
                              ]}
                              allowClear={false}
                            />
                          </Field>
                          {condition.field === 'has_product' ? (
                            <Field label="Ürün">
                              <SearchableSelect
                                value={condition.value || ''}
                                onChange={v => updateCheckoutCondition(rule.id, condition.id, { value: v })}
                                options={products.map(p => ({value:p.id,label:p.name}))}
                                placeholder="Ürün seçin"
                              />
                            </Field>
                          ) : null}
                          {condition.field === 'has_category' ? (
                            <Field label="Kategori">
                              <SearchableSelect
                                value={condition.value || ''}
                                onChange={v => updateCheckoutCondition(rule.id, condition.id, { value: v })}
                                options={categories.map(c => ({value:c.id,label:c.name}))}
                                placeholder="Kategori seçin"
                              />
                            </Field>
                          ) : null}
                          {(condition.field === 'total_lt' || condition.field === 'total_gt' || condition.field === 'total_between') ? (
                            <Field label={condition.field === 'total_between' ? 'Alt tutar' : 'Tutar'}>
                              <input type="number" min={0} value={condition.value || ''} onChange={event => updateCheckoutCondition(rule.id, condition.id, { value: event.target.value })} style={inputStyle()} />
                            </Field>
                          ) : <div />}
                          {condition.field === 'total_between' ? (
                            <Field label="Ust tutar">
                              <input type="number" min={0} value={condition.value2 || ''} onChange={event => updateCheckoutCondition(rule.id, condition.id, { value2: event.target.value })} style={inputStyle()} />
                            </Field>
                          ) : <div />}
                          <button type="button" className="btn-o" onClick={() => removeCheckoutCondition(rule.id, condition.id)} style={{ color: '#b91c1c' }}>
                            Kosulu Sil
                          </button>
                        </div>
                      </div>
                    ))}
                    <div>
                      <button type="button" className="btn-o" onClick={() => addCheckoutCondition(rule.id)}>+ Kosul Ekle</button>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <Field label="Çıktı tipi">
                      <SearchableSelect
                        value={rule.suggestionType || 'product'}
                        onChange={v => updateCheckoutSuggestion(rule.id, { suggestionType: v, suggestionProductId: '', suggestionCategoryId: '' })}
                        options={[{value:'product',label:'Ürün öner'},{value:'category',label:'Kategori öner'},{value:'message',label:'Sadece bilgi notu göster'}]}
                        allowClear={false}
                      />
                    </Field>
                    {rule.suggestionType === 'product' ? (
                      <Field label="Önerilen ürün">
                        <SearchableSelect
                          value={rule.suggestionProductId || ''}
                          onChange={v => updateCheckoutSuggestion(rule.id, { suggestionProductId: v })}
                          options={products.map(p => ({value:p.id,label:p.name}))}
                          placeholder="Ürün seçin"
                        />
                      </Field>
                    ) : null}
                    {rule.suggestionType === 'category' ? (
                      <Field label="Önerilen kategori">
                        <SearchableSelect
                          value={rule.suggestionCategoryId || ''}
                          onChange={v => updateCheckoutSuggestion(rule.id, { suggestionCategoryId: v })}
                          options={categories.map(c => ({value:c.id,label:c.name}))}
                          placeholder="Kategori seçin"
                        />
                      </Field>
                    ) : null}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <button type="button" className="btn-o" onClick={() => updateCheckoutSuggestion(rule.id, { active: !(rule.active !== false) })}>
                      {rule.active !== false ? 'Aktif' : 'Pasif'}
                    </button>
                    <button type="button" className="btn-o" onClick={() => removeCheckoutSuggestion(rule.id)} style={{ color: '#b91c1c' }}>
                      Kurali Sil
                    </button>
                  </div>
                </div>
              ))}
              <div>
                <button type="button" className="btn-o" onClick={addCheckoutSuggestion}>+ Odeme Oncesi Oneri Ekle</button>
              </div>
            </div>
          </SectionBlock>

          <SectionBlock
            id="diger"
            icon="fa-ellipsis"
            accent="#64748b"
            title="Diğer Ayarlar"
            subtitle="Eski ekrandan taşınan kalan ayarlar. Sırayı birlikte netleştirebiliriz."
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
              <ToggleRow label="Sadakat modülü entegrasyonu" hint="Aktif olduğunda kiosk sadakat modülü ile entegre çalışır; müşteriler QR kod okutabilir, telefon veya kupon girerek giriş yapabilir." checked={settings.loyalty_qr_enabled === true} onChange={value => setField('loyalty_qr_enabled', value)} />
              <ToggleRow label="Fis yazdirma" hint="Bagli fis yazicida receipt basma davranisini acar." checked={settings.printer?.receipt_enabled === true} onChange={value => updateNested('printer', { receipt_enabled: value })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
              <Field label="Sadakat oturum suresi (sn)">
                <input type="number" min={30} max={1800} value={settings.loyalty_session_timeout_sec || 180} onChange={event => setField('loyalty_session_timeout_sec', Number(event.target.value || 180))} style={inputStyle()} />
              </Field>
              <Field label="Ödendi ekranı bekleme süresi">
                <input type="number" min={5} max={180} value={settings.order_display_duration_sec || 30} onChange={event => setField('order_display_duration_sec', Number(event.target.value || 30))} style={inputStyle()} />
              </Field>
              <Field label="Fis alt notu">
                <input value={settings.printer?.receipt_footer || ''} onChange={event => updateNested('printer', { receipt_footer: event.target.value })} style={inputStyle()} />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Gel-al bilgilendirme mesaji">
                <textarea rows={2} value={settings.success_message_takeaway || ''} onChange={event => setField('success_message_takeaway', event.target.value)} style={textareaStyle(2)} />
              </Field>
              <Field label="Masaya servis bilgilendirme mesaji">
                <textarea rows={2} value={settings.success_message_table || ''} onChange={event => setField('success_message_table', event.target.value)} style={textareaStyle(2)} />
              </Field>
            </div>
          </SectionBlock>
        </main>

        <aside style={{ display: 'grid', gap: 14, position: 'sticky', top: 24 }}>
          <div style={shellCardStyle()}>
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>Canlı Özet</div>
            <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ color: '#64748b', fontSize: '.82rem' }}>Kiosk durumu</span>
                <span style={{ fontWeight: 800, color: settings.enabled !== false ? '#15803d' : '#b91c1c' }}>{settings.enabled !== false ? 'Aktif' : 'Kapali'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ color: '#64748b', fontSize: '.82rem' }}>Tanimli kiosk</span>
                <span style={{ fontWeight: 800, color: '#0f172a' }}>{kioskStations.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ color: '#64748b', fontSize: '.82rem' }}>Aktif kiosk</span>
                <span style={{ fontWeight: 800, color: '#0f172a' }}>{activeKioskStationCount}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ color: '#64748b', fontSize: '.82rem' }}>Kolon sayisi</span>
                <span style={{ fontWeight: 800, color: '#0f172a' }}>{settings.product_grid_cols || 4}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ color: '#64748b', fontSize: '.82rem' }}>Ana banner</span>
                <span style={{ fontWeight: 800, color: '#0f172a' }}>{settings.kiosk_show_banners !== false ? 'Acik' : 'Kapali'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ color: '#64748b', fontSize: '.82rem' }}>Hizli secimler</span>
                <span style={{ fontWeight: 800, color: '#0f172a' }}>{settings.kiosk_show_quick_picks !== false ? 'Acik' : 'Kapali'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ color: '#64748b', fontSize: '.82rem' }}>Banner aksiyonu</span>
                <span style={{ fontWeight: 800, color: '#0f172a', textAlign: 'right' }}>{bannerActionSummary}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ color: '#64748b', fontSize: '.82rem' }}>Kok kategori</span>
                <span style={{ fontWeight: 800, color: '#0f172a' }}>{rootCategories.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ color: '#64748b', fontSize: '.82rem' }}>Kioskta acik urun</span>
                <span style={{ fontWeight: 800, color: '#0f172a' }}>{activeProductCount}</span>
              </div>
            </div>
          </div>

          <div style={shellCardStyle()}>
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>Secili Hizli Urunler</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {quickPickProducts.length === 0 ? (
                <div style={{ color: '#64748b', fontSize: '.82rem', lineHeight: 1.5 }}>
                  Henüz sabit bir hızlı seçim tanımlanmadı. Sistem otomatik iki ürün kullanır.
                </div>
              ) : quickPickProducts.map(product => (
                <div key={product.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 10, display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '.84rem' }}>{product.name}</div>
                    <div style={{ color: '#64748b', fontSize: '.76rem', marginTop: 3 }}>Kisayol urunu</div>
                  </div>
                  {product.channel_image ? <img src={product.channel_image} alt={product.name} style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover' }} /> : null}
                </div>
              ))}
            </div>
          </div>

          <div style={shellCardStyle()}>
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>Hizli Ekranlar</div>
            <div style={{ display: 'grid', gap: 8 }}>
              {[
                { label: 'Kiosk', url: getKioskUrl() },
                { label: 'Kiosk Tablet', url: getKioskTabletUrl() },
                { label: 'KDS', url: getKDSUrl() },
                { label: 'Pickup', url: getPickupUrl() },
                { label: 'Sira', url: getQueueUrl() },
              ].map(item => (
                <button key={item.label} type="button" className="btn-o" onClick={() => window.open(item.url, '_blank', 'noopener,noreferrer')} style={{ justifyContent: 'space-between' }}>
                  <span>{item.label}</span>
                  <i className="fa-solid fa-arrow-up-right-from-square" />
                </button>
              ))}
            </div>
          </div>

          <div style={shellCardStyle()}>
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>Geçiş Notu</div>
            <div style={{ color: '#64748b', fontSize: '.82rem', lineHeight: 1.55 }}>
              Bu masaustu editor simdi eski kiosk yonetimindeki ana ayarlari tasiyor. Geri kalan detaylar da artik en altta toplanmis halde; istersen bir sonraki turda orayi da tamamen amaca gore ayri bloklara boleriz.
            </div>
          </div>
        </aside>
      {saveConflicts.length > 0 ? (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(15,23,42,.6)',
          backdropFilter: 'blur(4px)',
          display: 'grid',
          placeItems: 'center',
          zIndex: 9999,
          padding: 20
        }}>
          <div style={{
            background: '#fff',
            borderRadius: 18,
            boxShadow: '0 20px 50px rgba(0,0,0,.15)',
            width: '100%',
            maxWidth: 640,
            maxHeight: '85vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            <div style={{ padding: 18, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10, color: '#b45309' }}>
              <i className="fa-solid fa-circle-exclamation" style={{ fontSize: '1.4rem' }} />
              <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>Zaman Çakışması Algılandı!</div>
            </div>
            
            <div style={{ padding: 18, overflowY: 'auto', flex: 1 }}>
              <p style={{ fontSize: '.84rem', color: '#64748b', marginBottom: 14, lineHeight: 1.5 }}>
                Tanımladığınız saat kuralları arasında çakışmalar bulundu. Aynı zaman diliminde aktif olan kurallarda kategorilerin sıralama veya görünürlük ayarlarının çelişmesi, kiosk ekranında belirsizliğe yol açabilir. Lütfen çakışan kuralları düzeltin veya <strong>Yine de Kaydet</strong> seçeneği ile devam edin:
              </p>
              
              <div style={{ display: 'grid', gap: 12 }}>
                {saveConflicts.map((c, idx) => (
                  <div key={idx} style={{ border: '1px solid #fed7aa', background: '#fff7ed', borderRadius: 12, padding: 12 }}>
                    <div style={{ fontWeight: 800, fontSize: '.84rem', color: '#c2410c' }}>{c.categoryName}</div>
                    <div style={{ fontSize: '.76rem', color: '#7c2d12', marginTop: 4 }}>
                      <strong>Çakışan Kurallar:</strong> "{c.schedAName}" ve "{c.schedBName}"
                    </div>
                    <div style={{ fontSize: '.76rem', color: '#7c2d12', marginTop: 2 }}>
                      <strong>Zaman Dilimi:</strong> {c.days} | {c.time}
                    </div>
                    <div style={{ fontSize: '.76rem', color: '#9a3412', marginTop: 6, fontWeight: 600 }}>
                      <strong>Detay:</strong> {c.details}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div style={{ padding: 14, borderTop: '1px solid #e2e8f0', background: '#f8fafc', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                className="btn-o"
                onClick={() => setSaveConflicts([])}
                style={{ minHeight: 38, borderRadius: 10 }}
              >
                Vazgeç / Düzenle
              </button>
              <button
                type="button"
                className="btn-p"
                onClick={() => save(true)}
                style={{ minHeight: 38, borderRadius: 10, background: '#ea580c', borderColor: '#ea580c' }}
              >
                Yine de Kaydet
              </button>
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </div>
  )
}
