import { useEffect, useId, useMemo, useState } from 'react'
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
  { id: 'kioskler', label: 'Kioskler', icon: 'fa-tablet-screen-button', accent: '#0f766e' },
  { id: 'temel-akis', label: 'Temel Akış', icon: 'fa-sliders', accent: '#2563eb' },
  { id: 'gorsel-kimlik', label: 'Görsel Kimlik', icon: 'fa-palette', accent: '#7c3aed' },
  { id: 'karsilama-ekrani', label: 'Karşılama Ekranı', icon: 'fa-hand-pointer', accent: '#0891b2' },
  { id: 'ana-banner', label: 'Ana Banner', icon: 'fa-panorama', accent: '#ef4444' },
  { id: 'hizli-secim', label: 'Hızlı Seçim', icon: 'fa-bolt', accent: '#16a34a' },
  { id: 'kategori-yonetimi', label: 'Kategori Yönetimi', icon: 'fa-layer-group', accent: '#f97316' },
  { id: 'urunler', label: 'Ürünler', icon: 'fa-utensils', accent: '#0f766e' },
  { id: 'sira-ekrani', label: 'Sıra Ekranı', icon: 'fa-tv', accent: '#0ea5e9' },
  { id: 'kds-pickup', label: 'KDS ve Pickup', icon: 'fa-kitchen-set', accent: '#eab308' },
  { id: 'oneriler', label: 'Öneriler', icon: 'fa-bullhorn', accent: '#ec4899' },
  { id: 'diger', label: 'Diğer Ayarlar', icon: 'fa-ellipsis', accent: '#64748b' },
]

function uid(prefix = 'kiosk') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

async function uploadFileAndGetUrl(file) {
  if (file?.type?.startsWith('image/')) {
    const objectUrl = URL.createObjectURL(file)
    try {
      const image = await new Promise((resolve, reject) => {
        const nextImage = new Image()
        nextImage.onload = () => resolve(nextImage)
        nextImage.onerror = reject
        nextImage.src = objectUrl
      })

      const maxDimension = 1600
      const scale = Math.min(1, maxDimension / Math.max(image.width || 1, image.height || 1))
      const width = Math.max(1, Math.round((image.width || 1) * scale))
      const height = Math.max(1, Math.round((image.height || 1) * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (context) {
        context.drawImage(image, 0, 0, width, height)
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
    } catch {
      // Fallback to original uploader below.
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

function SectionBlock({ id, icon, accent, title, subtitle, children }) {
  return (
    <section id={id} style={shellCardStyle()}>
      <div style={sectionTitleStyle()}>
        <div style={iconBadgeStyle(`${accent}18`, accent)}>
          <i className={`fa-solid ${icon}`} />
        </div>
        <div>
          <div style={{ fontWeight: 800, color: '#0f172a' }}>{title}</div>
          {subtitle ? <div style={{ fontSize: '.82rem', color: '#64748b', marginTop: 3 }}>{subtitle}</div> : null}
        </div>
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
      <div>
        <div style={{ fontWeight: 700, color: '#0f172a' }}>{label}</div>
        {hint ? <div style={{ fontSize: '.78rem', color: '#64748b', marginTop: 4, lineHeight: 1.45 }}>{hint}</div> : null}
      </div>
      <label className="tog" style={{ marginTop: 2 }}>
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
}) {
  const inputId = useId()
  const [previewOpen, setPreviewOpen] = useState(false)
  const [lastFileName, setLastFileName] = useState('')

  async function handleChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    setLastFileName(file.name || '')
    onChange(await uploadFileAndGetUrl(file))
  }

  const hasValue = Boolean(value)
  const fileLabel = lastFileName || (hasValue ? (previewKind === 'video' ? 'Yuklu video' : 'Yuklu dosya') : 'Dosya secilmedi')
  const infoText = ''

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <Field label={label} hint={hint}>
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
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {DAY_OPTIONS.map(([code, label]) => {
        const active = selected.has(code)
        return (
          <button
            key={code}
            type="button"
            onClick={() => toggleDay(code)}
            style={{
              minWidth: 38,
              minHeight: 28,
              borderRadius: 8,
              border: active ? '1px solid #fdba74' : '1px solid #dbe2ea',
              background: active ? '#fff7ed' : '#fff',
              color: active ? '#c2410c' : '#475569',
              fontWeight: 700,
              fontSize: '.72rem',
              cursor: 'pointer',
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
}) {
  const columnCount = 2 + (includeVisibility ? 1 : 0) + (includeOrder ? 1 : 0)
  return (
    <div style={{ borderRadius: 14, border: '1px solid #e2e8f0', background: '#fff', padding: 12, display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gap: 7 }}>
        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '.82rem' }}>Gunler</div>
        <DaySelector value={rule.days || []} onChange={days => onChange({ days })} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columnCount}, minmax(0,1fr))`, gap: 12 }}>
        <Field label="Baslangic">
          <input type="time" value={rule.start || '09:00'} onChange={event => onChange({ start: event.target.value })} style={inputStyle()} />
        </Field>
        <Field label="Bitis">
          <input type="time" value={rule.end || '22:00'} onChange={event => onChange({ end: event.target.value })} style={inputStyle()} />
        </Field>
        {includeVisibility ? (
          <Field label="Durum">
            <SearchableSelect
              value={rule.visible === false ? 'hidden' : 'visible'}
              onChange={v => onChange({ visible: v === 'visible' })}
              options={[{value:'visible',label:'Görünür'},{value:'hidden',label:'Gizli'}]}
              allowClear={false}
            />
          </Field>
        ) : null}
        {includeOrder ? (
          <Field label="Sira">
            <input type="number" min={0} max={9999} value={rule.order ?? 100} onChange={event => onChange({ order: Number(event.target.value || 0) })} style={inputStyle()} />
          </Field>
        ) : null}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
        <Field label="Not" hint="Orn. kahvalti akisi veya hafta sonu yogunlugu.">
          <input value={rule.note || ''} onChange={event => onChange({ note: event.target.value })} style={inputStyle()} placeholder="Aciklama" />
        </Field>
        <button type="button" className="btn-o" onClick={onRemove} style={{ color: '#b91c1c' }}>
          Kurali Sil
        </button>
      </div>
    </div>
  )
}

function KioskStationEditor({ station }) {
  return (
    <div
      style={{
        borderRadius: 18,
        border: '1px solid #dbe2ea',
        background: '#fff',
        padding: 14,
        display: 'grid',
        gap: 12,
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '110px 1.2fr 1.2fr 120px', gap: 10, alignItems: 'end' }}>
        <Field label="Kiosk no" hint="Otomatik atanır.">
          <div style={{
            ...inputStyle(),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#f8fafc',
            color: '#0f172a',
            fontWeight: 800,
          }}>
            <span>Kiosk {station.kiosk_number || 1}</span>
            <span style={{ fontSize: '.72rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.08em' }}>Sabit</span>
          </div>
        </Field>
        <Field label="Kiosk ID (Pair Key)" hint="Cihaz yönetiminden gelir.">
          <div style={{...inputStyle(), background: '#f8fafc', fontWeight: 600}}>
            {station.code || ''}
          </div>
        </Field>
        <Field label="Görünen ad" hint="Cihaz yönetiminden gelir.">
          <div style={{...inputStyle(), background: '#f8fafc', fontWeight: 600}}>
            {station.name || ''}
          </div>
        </Field>
        <Field label="Cihaz Tipi" hint="Kiosk Tipi">
          <div style={{...inputStyle(), background: '#f8fafc', fontWeight: 600}}>
            {station.device_type === 'kiosk_tablet' ? 'Kiosk Tablet' : 'Kiosk'}
          </div>
        </Field>
      </div>

      <div style={subtleNoteStyle('#f8fafc', '#dbe2ea', '#334155')}>
        Bu kiosk icin cihaz tarafinda ayni <strong>Kiosk ID ({station.code})</strong> girildiginde sistem otomatik olarak <strong>Kiosk {station.kiosk_number || 1}</strong> olarak eslesir. Bu cihazların tanımlamaları artık <strong>POS ve Cihazlar</strong> menüsünden yönetilmektedir.
      </div>
    </div>
  )
}

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
  const [searchTerm, setSearchTerm] = useState('')
  const [activeSection, setActiveSection] = useState(DESKTOP_SECTIONS[0].id)

  useEffect(() => {
    let ignore = false
    ;(async () => {
      try {
        setLoading(true)
        const [settingsResult, categoryResult, productResult, channelResult, devicesResult] = await Promise.allSettled([
          loadKioskSettings(),
          db.from('sale_categories').select('id,name,parent_id,image_url').is('deleted_at', null).order('name'),
          db
            .from('sale_items')
            .select('id,name,channel_image,channel_prices,sale_cat_l1,sale_cat_l2,sale_cat_l3,sale_cat_l4,sale_cat_l5')
            .is('deleted_at', null)
            .order('name'),
          db.from('sales_channels').select('id,name').is('deleted_at', null).ilike('name', 'kiosk').maybeSingle(),
          branchId ? db.from('pos_terminals').select('*').eq('branch_id', branchId).in('device_type', ['kiosk', 'kiosk_tablet']) : Promise.resolve({ data: [] })
        ])
        if (ignore) return

        const nextSettings = settingsResult.status === 'fulfilled' ? settingsResult.value : KIOSK_DEFAULT_SETTINGS
        setSettings(nextSettings)
        setSavedSnapshot(JSON.stringify(nextSettings))

        setCategories(categoryResult.status === 'fulfilled' ? (categoryResult.value?.data || []) : [])
        setProducts(productResult.status === 'fulfilled' ? (productResult.value?.data || []) : [])
        setKioskChannel(channelResult.status === 'fulfilled' ? (channelResult.value?.data || null) : null)
        setKioskDevices(devicesResult.status === 'fulfilled' ? (devicesResult.value?.data || []) : [])

        const errors = [
          settingsResult.status === 'rejected' ? settingsResult.reason?.message : '',
          categoryResult.status === 'rejected' ? categoryResult.reason?.message : '',
          productResult.status === 'rejected' ? productResult.reason?.message : '',
          channelResult.status === 'rejected' ? channelResult.reason?.message : '',
          devicesResult.status === 'rejected' ? devicesResult.reason?.message : '',
        ].filter(Boolean)

        if (errors.length > 0) {
          toast(`Desktop editor kismi veriyle acildi: ${errors[0]}`, 'info')
        }
      } catch (error) {
        if (!ignore) toast(error?.message || 'Kiosk ayarlari yuklenemedi', 'error')
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

  function addOperatingRule() {
    setSettings(current => ({
      ...current,
      operating_hours: [
        ...(current.operating_hours || []),
        { id: uid('open_rule'), days: [], start: '09:00', end: '22:00', note: '' },
      ],
    }))
  }

  function updateOperatingRule(ruleId, patch) {
    setSettings(current => ({
      ...current,
      operating_hours: (current.operating_hours || []).map(rule => rule.id === ruleId ? { ...rule, ...patch } : rule),
    }))
  }

  function removeOperatingRule(ruleId) {
    setSettings(current => ({
      ...current,
      operating_hours: (current.operating_hours || []).filter(rule => rule.id !== ruleId),
    }))
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

  function updateCoupon(id, patch) {
    setSettings(current => ({ ...current, coupons: (current.coupons || []).map(item => item.id === id ? { ...item, ...patch } : item) }))
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

  async function save() {
    try {
      setSaving(true)
      const saved = await saveKioskSettings(settings)
      const nextSettings = saved || settings || KIOSK_DEFAULT_SETTINGS
      setSettings(nextSettings)
      setSavedSnapshot(JSON.stringify(nextSettings))
      toast('Yeni kiosk yonetimi ayarlari kaydedildi', 'success')
    } catch (error) {
      toast(error?.message || 'Kayit sirasinda hata olustu', 'error')
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
      active: true,
      order: index + 1,
      device_type: device.device_type
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
            <button className="btn-o" onClick={() => navigate('/kiosk-management')}>Eski Editör</button>
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
                  border: activeSection === section.id ? '1px solid #c7d2fe' : '1px solid #e2e8f0',
                  background: activeSection === section.id ? '#eef2ff' : '#fff',
                  borderRadius: 14,
                  padding: '12px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  textAlign: 'left',
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
            subtitle="Aynı şubedeki fiziksel kioskların listesi. (POS ve Cihazlar menüsünden eklenir)"
          >
            <div style={subtleNoteStyle('#eff6ff', '#bfdbfe', '#1d4ed8')}>
              Loyalty entegrasyonunda her kiosk icin benzersiz bir <strong>Kiosk ID</strong> tanimlayin. Fiziksel kiosk cihazinda ayni ID girildiginde cihaz ilgili kiosk numarasini bilir. Yeni cihazları <strong>POS ve Cihazlar</strong> menüsünden ekleyebilirsiniz.
            </div>

            {kioskStations.length > 0 ? (
              <div style={{ display: 'grid', gap: 12 }}>
                {kioskStations.map(station => (
                  <KioskStationEditor
                    key={station.id}
                    station={station}
                  />
                ))}
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
            title="Temel Akış"
            subtitle="Kioskun açık/kapalı davranışı, servis seçenekleri ve hizmet saatleri."
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
              <ToggleRow label="Kiosk aktif" hint="Kapaliysa kiosk, kapali mesajinda kalir." checked={settings.enabled !== false} onChange={value => setField('enabled', value)} />
              <ToggleRow label="Masaya servis secenegi" hint="Odeme akisi icinde gel-al ve masaya servis secimi acilir." checked={settings.table_service_enabled === true} onChange={value => setField('table_service_enabled', value)} />
              <ToggleRow label="Calisma saatlerini kullan" hint="Aciksa kiosk sadece belirlenen gun ve saatlerde siparis alir." checked={settings.operating_hours_enabled === true} onChange={value => setField('operating_hours_enabled', value)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
              <Field label="Kapali ekran basligi">
                <input value={settings.closed_title || ''} onChange={event => setField('closed_title', event.target.value)} style={inputStyle()} placeholder="Kiosk su anda kapali" />
              </Field>
              <Field label="Kapali ekran aciklamasi">
                <input value={settings.closed_subtitle || ''} onChange={event => setField('closed_subtitle', event.target.value)} style={inputStyle()} placeholder="Lutfen hizmet saatlerinde tekrar deneyin." />
              </Field>
            </div>

            {(settings.operating_hours || []).length > 0 ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {(settings.operating_hours || []).map(rule => (
                  <ScheduleRuleEditor
                    key={rule.id}
                    rule={rule}
                    onChange={patch => updateOperatingRule(rule.id, patch)}
                    onRemove={() => removeOperatingRule(rule.id)}
                  />
                ))}
              </div>
            ) : (
              <div style={subtleNoteStyle()}>
                Henuz tanimli bir hizmet saati kuralin yok. Istersen asagidan kurallar ekleyebilir veya bu bolumu kapali tutup kiosku her zaman acik birakabilirsin.
              </div>
            )}

            <div>
              <button type="button" className="btn-o" onClick={addOperatingRule}>+ Calisma Saati Kurali Ekle</button>
            </div>
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
              <Field label="Kategori buton yuksekligi">
                <input type="number" min={88} max={180} value={settings.category_button_height || 112} onChange={event => setField('category_button_height', Number(event.target.value || 112))} style={inputStyle()} />
              </Field>
              <ToggleRow label="Kategori isimleri" hint="Kapatilirsa kategori resmi tum butonu kaplar." checked={settings.kiosk_show_category_labels !== false} onChange={value => setField('kiosk_show_category_labels', value)} />
              <div />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
              <UploadField label="Kiosk arka plan gorseli" hint="Tum kiosk akisini saran ana zemin." value={settings.kiosk_bg_image || ''} onChange={value => setField('kiosk_bg_image', value)} aspect="9 / 16" fit="cover" />
              <UploadField label="Kiosk logo" hint="Baslik ve karsilama ekraninda kullanilir." value={settings.kiosk_logo_url || ''} onChange={value => setField('kiosk_logo_url', value)} aspect="1 / 1" fit="contain" />
            </div>
          </SectionBlock>

          <SectionBlock
            id="karsilama-ekrani"
            icon="fa-hand-pointer"
            accent="#0891b2"
            title="Karşılama Ekranı"
            subtitle="Buradaki tanımlamalar kioskun karşılama ekranına yansıtılır."
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Baslik">
                <input value={settings.idle_title || ''} onChange={event => setField('idle_title', event.target.value)} style={inputStyle()} />
              </Field>
              <Field label="Baslat butonu">
                <input value={settings.idle_cta_label || ''} onChange={event => setField('idle_cta_label', event.target.value)} style={inputStyle()} />
              </Field>
            </div>

            <Field label="Alt Metin">
              <textarea rows={3} value={settings.idle_subtitle || ''} onChange={event => setField('idle_subtitle', event.target.value)} style={textareaStyle(3)} />
            </Field>

            <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 12 }}>
              <Field label="Karşılama medya tipi">
                <SearchableSelect
                  value={settings.idle_media_type || 'none'}
                  onChange={v => setField('idle_media_type', v)}
                  options={[{value:'none',label:'Yok'},{value:'image',label:'Görsel'},{value:'video',label:'Video'}]}
                  allowClear={false}
                />
              </Field>
              <Field label="Başlangıç ekranına dönüş süresi" hint="Müşteri hareketsiz kalırsa bu süre sonunda tekrar karşılama ekranına dönülür.">
                <input type="number" min={10} max={900} value={settings.idle_timeout_sec || 60} onChange={event => setField('idle_timeout_sec', Number(event.target.value || 60))} style={inputStyle()} />
              </Field>
            </div>

            {settings.idle_media_type === 'none' ? (
              <div style={subtleNoteStyle()}>
                Karsilama medyasi secilmezse kiosk arka plani kullanilir. Bu bolumden dilediginde gorsel veya video baglayabilirsin.
              </div>
            ) : null}

            {settings.idle_media_type === 'image' ? (
              <UploadField label="Karşılama görseli" hint="Görsel seçildiğinde karşılama ekranına bağlanır." value={settings.idle_media_url || settings.idle_background_image || ''} onChange={setIdleImage} aspect="9 / 16" fit="cover" />
            ) : null}

            {settings.idle_media_type === 'video' ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <UploadField label="Karşılama videosu" hint="Küçük veya optimize bir video yükleyebilirsin. Büyük dosyalarda URL daha sağlıklıdır." value={settings.idle_media_url || ''} onChange={value => setField('idle_media_url', value)} accept="video/*" previewKind="video" aspect="9 / 16" fit="cover" />
                <Field label="Video URL" hint="İstersen yükleme yerine doğrudan bir video bağlantısı da kullanabilirsin.">
                  <input value={settings.idle_media_url || ''} onChange={event => setField('idle_media_url', event.target.value)} style={inputStyle()} placeholder="https://..." />
                </Field>
              </div>
            ) : null}
          </SectionBlock>

          <SectionBlock
            id="ana-banner"
            icon="fa-panorama"
            accent="#ef4444"
            title="Ana Banner"
            subtitle="Kioskun ust vitrin banneri, gorseli ve tiklama davranisi."
          >
            <ToggleRow label="Ana banner aktif" hint="Aciksa menu akisinin en ustunde tek banner gorunur." checked={settings.kiosk_show_banners !== false} onChange={value => setField('kiosk_show_banners', value)} />

            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 12 }}>
              <div style={{ display: 'grid', gap: 12 }}>
                <Field label="Banner basligi">
                  <input value={settings.main_banner_title || ''} onChange={event => setField('main_banner_title', event.target.value)} style={inputStyle()} placeholder="Orn. Gunun one cikan lezzeti" />
                </Field>
                <Field label="Banner alt metni">
                  <textarea rows={3} value={settings.main_banner_subtitle || ''} onChange={event => setField('main_banner_subtitle', event.target.value)} style={textareaStyle(3)} placeholder="Kisa kampanya veya bilgilendirme metni" />
                </Field>
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
              <UploadField label="Banner gorseli" hint="" value={settings.main_banner_image || ''} onChange={value => setField('main_banner_image', value)} fit="cover" />
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 14, display: 'grid', gap: 12, background: '#fff' }}>
              <div>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>Tablet banner override</div>
                <div style={{ fontSize: '.78rem', color: '#64748b', marginTop: 4, lineHeight: 1.5 }}>
                  Tablet yuzeyi isterse kiosk bannerindan farkli bir baslik, gorsel ve tiklama davranisi kullanabilir. Alan bos kalirsa ortak kiosk tanimi kullanilir.
                </div>
              </div>
              <ToggleRow label="Tablet banner aktif" hint="Tablet ekraninda ust vitrin banneri gorunsun." checked={settings.tablet_show_banners !== false} onChange={value => setField('tablet_show_banners', value)} />
              <div style={{ display: 'grid', gridTemplateColumns: '1.1fr .9fr', gap: 12 }}>
                <div style={{ display: 'grid', gap: 12 }}>
                  <Field label="Tablet banner basligi">
                    <input value={settings.tablet_main_banner_title || ''} onChange={event => setField('tablet_main_banner_title', event.target.value)} style={inputStyle()} placeholder="Bos birak: ortak banner basligi" />
                  </Field>
                  <Field label="Tablet banner alt metni">
                    <textarea rows={3} value={settings.tablet_main_banner_subtitle || ''} onChange={event => setField('tablet_main_banner_subtitle', event.target.value)} style={textareaStyle(3)} placeholder="Bos birak: ortak banner alt metni" />
                  </Field>
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
                <UploadField label="Tablet banner gorseli" hint="Bos birak: ortak banner gorseli" value={settings.tablet_main_banner_image || ''} onChange={value => setField('tablet_main_banner_image', value)} fit="cover" />
              </div>
            </div>
          </SectionBlock>

          <SectionBlock
            id="hizli-secim"
            icon="fa-bolt"
            accent="#16a34a"
            title="Hızlı Seçim"
            subtitle="Banner altında görünen iki hızlı ürün kutusu."
          >
            <ToggleRow label="Hızlı seçimler aktif" hint="Açıksa kioskta banner altında iki hızlı ürün kutusu görünür." checked={settings.kiosk_show_quick_picks !== false} onChange={value => setField('kiosk_show_quick_picks', value)} />
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
              <div>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>Tablet quick-picks</div>
                <div style={{ fontSize: '.78rem', color: '#64748b', marginTop: 4, lineHeight: 1.5 }}>
                  Tablet isterse farkli hizli urunler kullanabilir. Bos birakilan alanlarda sistem ortak kiosk secimini veya otomatik oneriyi kullanir.
                </div>
              </div>
              <ToggleRow label="Tablet hizli secimler aktif" hint="Tablet akisi kendi quick-pick kartlarini gosterebilir." checked={settings.tablet_show_quick_picks !== false} onChange={value => setField('tablet_show_quick_picks', value)} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
                {[0, 1, 2].map(index => (
                  <Field key={`tablet-quick-${index}`} label={`Tablet hızlı seçim ${index + 1}`} hint="Boş bırak: ortak / otomatik seçim">
                    <SearchableSelect
                      value={settings.tablet_quick_pick_product_ids?.[index] || ''}
                      onChange={v => {
                        const next = Array.isArray(settings.tablet_quick_pick_product_ids) ? [...settings.tablet_quick_pick_product_ids] : []
                        while (next.length < 3) next.push('')
                        next[index] = v
                        setField('tablet_quick_pick_product_ids', next.slice(0, 3))
                      }}
                      options={products.map(p => ({value:p.id,label:p.name}))}
                      placeholder="Ortak / otomatik seçim"
                    />
                  </Field>
                ))}
              </div>
            </div>
          </SectionBlock>

          <SectionBlock
            id="kategori-yonetimi"
            icon="fa-layer-group"
            accent="#f97316"
            title="Kategori Yönetimi"
            subtitle="Sol kategori sütunundaki görselleri, etiketleri, sırayı ve saat bazlı görünürlüğü düzenle."
          >
            {sortedAllCategories.length === 0 ? (
              <div style={subtleNoteStyle()}>
                Kullanilabilecek kategori bulunamadi. Once satis kategorilerini kontrol etmeni oneririm.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                {sortedAllCategories.map((category, index) => {
                  const config = (settings.category_configs || []).find(item => item.categoryId === category.id) || {
                    categoryId: category.id,
                    imageUrl: '',
                    buttonLabel: '',
                    defaultOrder: index + 1,
                    defaultVisible: true,
                    schedules: [],
                  }
                  const IMG_H = 90
                  const IMG_W = 90
                  const isSubCat = category._depth > 0
                  return (
                    <div key={category.id} style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: 12,
                      padding: '10px 12px',
                      background: isSubCat ? '#f8fafc' : '#fff',
                      marginLeft: isSubCat ? category._depth * 20 : 0,
                    }}>
                      {/* Kompakt satır: görsel + tüm bilgiler yan yana */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {/* Küçük görsel */}
                        <div style={{
                          width: IMG_W,
                          height: IMG_H,
                          borderRadius: 10,
                          overflow: 'hidden',
                          background: '#f1f5f9',
                          border: '1.5px dashed #cbd5e1',
                          flexShrink: 0,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          {category.image_url ? (
                            <img src={category.image_url} alt={category.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: '#cbd5e1' }}>
                              <i className="fa-solid fa-image" style={{ fontSize: '1.2rem' }} />
                              <span style={{ fontSize: '.62rem' }}>Görsel yok</span>
                            </div>
                          )}
                        </div>

                        {/* Sağ taraf: kategori adı + alanlar + buton - tüm içerik görsel yüksekliğinde */}
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: IMG_H }}>
                          {/* Üst satır: kategori adı + saat kuralı butonu */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                              {isSubCat && <i className="fa-solid fa-turn-up" style={{ fontSize: '.65rem', color: '#94a3b8', transform: 'rotate(90deg)' }} />}
                              <span style={{ fontWeight: isSubCat ? 600 : 800, color: '#0f172a', fontSize: isSubCat ? '.82rem' : '.88rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{category.name}</span>
                              {isSubCat && <span style={{ fontSize: '.68rem', color: '#94a3b8', flexShrink: 0 }}>alt kategori</span>}
                            </div>
                            <button type="button" className="btn-o" style={{ fontSize: '.72rem', padding: '3px 10px', whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => addCategorySchedule(category.id)}>+ Saat Kuralı</button>
                          </div>

                          {/* Orta: form alanları */}
                          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) 110px 150px', gap: 8 }}>
                            <Field label="Buton etiketi">
                              <input value={config.buttonLabel || ''} onChange={event => updateCategoryConfig(category.id, { buttonLabel: event.target.value })} style={{ ...inputStyle(), fontSize: '.78rem', padding: '4px 8px' }} placeholder={category.name} />
                            </Field>
                            <Field label="Sıra">
                              <input type="number" value={config.defaultOrder || index + 1} onChange={event => updateCategoryConfig(category.id, { defaultOrder: Number(event.target.value || index + 1) })} style={{ ...inputStyle(), fontSize: '.78rem', padding: '4px 8px' }} />
                            </Field>
                            <Field label="Görünürlük">
                              <SearchableSelect
                                value={config.defaultVisible === false ? 'hidden' : 'visible'}
                                onChange={v => updateCategoryConfig(category.id, { defaultVisible: v === 'visible' })}
                                options={[{value:'visible',label:'Görünür'},{value:'hidden',label:'Gizli'}]}
                                allowClear={false}
                              />
                            </Field>
                          </div>
                        </div>
                      </div>

                      {/* Saat kuralları (varsa görsel altına genişler) */}
                      {(config.schedules || []).length > 0 && (
                        <div style={{ display: 'grid', gap: 8, marginTop: 10, paddingTop: 10, borderTop: '1px solid #f1f5f9' }}>
                          {(config.schedules || []).map(rule => (
                            <ScheduleRuleEditor
                              key={rule.id}
                              rule={rule}
                              includeVisibility
                              includeOrder
                              onChange={patch => updateCategorySchedule(category.id, rule.id, patch)}
                              onRemove={() => removeCategorySchedule(category.id, rule.id)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </SectionBlock>

          <SectionBlock
            id="urunler"
            icon="fa-utensils"
            accent="#0f766e"
            title="Ürünler"
            subtitle="Kiosk ürün kolon sayısı ve kanal bazlı açık/kapalı ürün yönetimi."
          >
            <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0,1fr)', gap: 12 }}>
              <Field label="Ürün kolon sayısı" hint="Kiosk ekranında aynı anda kaç kolon ürün görünsün? Varsayılan 4, seçenekler 2 ile 6 arası.">
                <SearchableSelect
                  value={String(settings.product_grid_cols || 4)}
                  onChange={v => setField('product_grid_cols', Number(v || 4))}
                  options={[2,3,4,5,6].map(n => ({value:String(n),label:`${n} kolon`}))}
                  allowClear={false}
                />
              </Field>
              <Field label="Ürün ara">
                <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} style={inputStyle()} placeholder="Ürün ara..." />
              </Field>
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 14, display: 'grid', gap: 12, background: '#fff' }}>
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
                <Field label="Dikey grid kolon">
                  <SearchableSelect
                    value={String(settings.tablet_product_grid_cols_portrait || 4)}
                    onChange={v => setField('tablet_product_grid_cols_portrait', Number(v || 4))}
                    options={[2,3,4,5,6].map(n => ({value:String(n),label:`${n} kolon`}))}
                    allowClear={false}
                  />
                </Field>
                <Field label="Yatay grid kolon">
                  <SearchableSelect
                    value={String(settings.tablet_product_grid_cols_landscape || 5)}
                    onChange={v => setField('tablet_product_grid_cols_landscape', Number(v || 5))}
                    options={[3,4,5,6,7].map(n => ({value:String(n),label:`${n} kolon`}))}
                    allowClear={false}
                  />
                </Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
                <Field label="Dikey kategori buton yuksekligi">
                  <input type="number" min={96} max={180} value={settings.tablet_category_button_height_portrait || 124} onChange={event => setField('tablet_category_button_height_portrait', Number(event.target.value || 124))} style={inputStyle()} />
                </Field>
                <Field label="Yatay kategori buton yuksekligi">
                  <input type="number" min={88} max={180} value={settings.tablet_category_button_height_landscape || 104} onChange={event => setField('tablet_category_button_height_landscape', Number(event.target.value || 104))} style={inputStyle()} />
                </Field>
              </div>
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
            id="sira-ekrani"
            icon="fa-tv"
            accent="#0ea5e9"
            title="Sıra Ekranı"
            subtitle="Sıra ekranının medya, yön ve renk ayarları."
          >
            <div style={{ display: 'grid', gridTemplateColumns: '160px 220px 1fr', gap: 12 }}>
              <Field label="Zemin rengi"><input type="color" value={settings.queue_bg_color || '#0f172a'} onChange={event => setField('queue_bg_color', event.target.value)} style={{ ...inputStyle(), padding: 6 }} /></Field>
              <Field label="Yön">
                <SearchableSelect
                  value={settings.queue_orientation || 'landscape'}
                  onChange={v => setField('queue_orientation', v)}
                  options={[{value:'landscape',label:'Yatay'},{value:'portrait',label:'Dikey'}]}
                  allowClear={false}
                />
              </Field>
              <UploadField label="Sira ekran logo" hint="Sira ekraninda gorunen logo." value={settings.queue_logo_url || ''} onChange={value => setField('queue_logo_url', value)} aspect="1 / 1" fit="contain" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '280px minmax(0,1fr)', gap: 12 }}>
              <Field label="Sıra medya tipi">
                <SearchableSelect
                  value={settings.queue_media_type || 'none'}
                  onChange={v => setField('queue_media_type', v)}
                  options={[{value:'none',label:'Yok'},{value:'image',label:'Görsel'},{value:'video',label:'Video'}]}
                  allowClear={false}
                />
              </Field>
              {settings.queue_media_type === 'video' ? (
                <Field label="Sıra video URL">
                  <input value={settings.queue_media_url || ''} onChange={event => setField('queue_media_url', event.target.value)} style={inputStyle()} placeholder="https://..." />
                </Field>
              ) : (
                <div />
              )}
            </div>

            {settings.queue_media_type === 'image' ? (
              <UploadField
                label="Sira zemin gorseli"
                hint="Sira ekraninin arka plan gorseli."
                value={settings.queue_media_url || ''}
                onChange={value => setField('queue_media_url', value)}
                aspect={settings.queue_orientation === 'portrait' ? '9 / 16' : '16 / 9'}
                fit="cover"
              />
            ) : null}

            {settings.queue_media_type === 'none' ? (
              <div style={subtleNoteStyle('#f8fafc', '#e2e8f0', '#475569')}>
                Sira ekrani icin medya secilmezse yalnizca zemin rengi ve logo ile calisir.
              </div>
            ) : null}
          </SectionBlock>

          <SectionBlock
            id="kds-pickup"
            icon="fa-kitchen-set"
            accent="#eab308"
            title="KDS ve Pickup"
            subtitle="Mutfak ve teslim akisinin birbirine bagli calisma ayarlari."
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
              <ToggleRow label="KDS + teslim birlesik" hint="Aciksa teslim islemleri KDS tarafinda yonetilir, pickup bilgi moduna gecer." checked={settings.kds_pickup_combined === true} onChange={value => setField('kds_pickup_combined', value)} />
              <ToggleRow label="Hazir sipariste ses" hint="Sira veya teslim ekraninda hazir siparis icin ses bildirimi oynatir." checked={settings.queue_sound_enabled !== false} onChange={value => setField('queue_sound_enabled', value)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
              {[
                { label: 'Kiosk', url: getKioskUrl(), icon: 'fa-tablet-screen-button', bg: '#eef2ff', color: '#4f46e5' },
                { label: 'Kiosk Tablet', url: getKioskTabletUrl(), icon: 'fa-tablet', bg: '#f5f3ff', color: '#7c3aed' },
                { label: 'KDS', url: getKDSUrl(), icon: 'fa-kitchen-set', bg: '#fff7ed', color: '#ea580c' },
                { label: 'Pickup', url: getPickupUrl(), icon: 'fa-hand-holding-box', bg: '#ecfdf5', color: '#15803d' },
                { label: 'Sira', url: getQueueUrl(), icon: 'fa-tv', bg: '#eff6ff', color: '#2563eb' },
              ].map(link => (
                <div key={link.label} style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 14, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={iconBadgeStyle(link.bg, link.color)}>
                      <i className={`fa-solid ${link.icon}`} />
                    </div>
                    <div style={{ fontWeight: 800, color: '#0f172a' }}>{link.label}</div>
                  </div>
                  <div style={{ fontSize: '.78rem', color: '#64748b', wordBreak: 'break-all' }}>{link.url}</div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn-o" onClick={() => window.open(link.url, '_blank', 'noopener,noreferrer')}>Ac</button>
                    <button type="button" className="btn-o" onClick={() => navigator.clipboard?.writeText(link.url)}>Kopyala</button>
                  </div>
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
              <ToggleRow label="Sadakat QR baglama" hint="Musteri siparisini telefondan kendi hesabina baglayabilir." checked={settings.loyalty_qr_enabled === true} onChange={value => setField('loyalty_qr_enabled', value)} />
              <ToggleRow label="Kupon girisi" hint="Odeme oncesinde kupon kodu alani acilir." checked={settings.coupon_enabled === true} onChange={value => setField('coupon_enabled', value)} />
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
            <div style={{ display: 'grid', gap: 10 }}>
              {(settings.coupons || []).map(coupon => (
                <div key={coupon.id} style={{ borderRadius: 14, border: '1px solid #e2e8f0', padding: 12, background: '#fff', display: 'grid', gap: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.4fr 120px 120px auto', gap: 8 }}>
                    <input value={coupon.code} onChange={event => updateCoupon(coupon.id, { code: event.target.value.toUpperCase() })} style={inputStyle()} placeholder="KOD" />
                    <input value={coupon.label} onChange={event => updateCoupon(coupon.id, { label: event.target.value })} style={inputStyle()} placeholder="Aciklama" />
                    <SearchableSelect
                      value={coupon.type}
                      onChange={v => updateCoupon(coupon.id, { type: v })}
                      options={[{value:'percent',label:'%'},{value:'amount',label:'Tutar'}]}
                      allowClear={false}
                    />
                    <input type="number" value={coupon.value} onChange={event => updateCoupon(coupon.id, { value: Number(event.target.value || 0) })} style={inputStyle()} placeholder="Deger" />
                    <button type="button" className="btn-o" onClick={() => setField('coupons', (settings.coupons || []).filter(item => item.id !== coupon.id))} style={{ color: '#b91c1c' }}>Sil</button>
                  </div>
                </div>
              ))}
              <div>
                <button type="button" className="btn-o" onClick={() => setField('coupons', [...(settings.coupons || []), { id: uid('coupon'), code: '', label: '', description: '', type: 'percent', value: 10, minTotal: 0, active: true }])}>
                  + Kupon Ekle
                </button>
              </div>
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
      </div>
    </div>
  )
}
