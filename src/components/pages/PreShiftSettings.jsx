import { useCallback, useEffect, useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import AddButton from '@/components/ui/AddButton'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useToast } from '@/hooks/useToast'
import { db } from '@/lib/db'
import { useWorkspace } from '@/context/WorkspaceContext'
import {
  DEFAULT_SHIFT_DAY_END,
  DEFAULT_SHIFT_DAY_START,
  OPERATING_HOURS_TEMPLATE_KEYS,
  addDays,
  getWeekdayTemplateIndex,
  parseDateKey,
  startOfWeek,
  toDateKey,
} from '@/lib/shiftPlanning'

const TABLE_NAME = 'branch_shift_presets'
const DAY_TABLE = 'branch_shift_schedule_days'
const SCHEMA_GUIDE = 'shift-presets.sql'
const DAY_SCHEMA_GUIDE = 'shift-schedule.sql'

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tumu' },
  { value: 'active', label: 'Aktif' },
  { value: 'passive', label: 'Pasif' },
]

const KIND_OPTIONS = [
  { value: 'working', label: 'Calisma vardiyasi', shortLabel: 'Calisma', icon: 'fa-business-time', color: '#0f766e', bg: '#ecfdf5', defaultColor: '#f59e0b' },
  { value: 'off', label: 'Haftalik izin', shortLabel: 'Izin', icon: 'fa-bed', color: '#475569', bg: '#f8fafc', defaultColor: '#64748b' },
  { value: 'report', label: 'Raporlu', shortLabel: 'Rapor', icon: 'fa-notes-medical', color: '#1d4ed8', bg: '#eff6ff', defaultColor: '#2563eb' },
  { value: 'other', label: 'Diger kod', shortLabel: 'Diger', icon: 'fa-tag', color: '#7c3aed', bg: '#f5f3ff', defaultColor: '#8b5cf6' },
]

function getKindOption(kind) {
  return KIND_OPTIONS.find(option => option.value === kind) || KIND_OPTIONS[0]
}

function makeEmptyForm(sortOrder = 0) {
  return {
    kind: 'working',
    name: '',
    short_code: '',
    start_time: '07:00',
    end_time: '15:30',
    break_duration: '01:00',
    color_hex: getKindOption('working').defaultColor,
    sort_order: sortOrder,
    active: true,
    notes: '',
  }
}

function normalizeHex(value, fallback) {
  const rawValue = String(value || '').trim()
  const normalizedValue = rawValue.startsWith('#') ? rawValue : `#${rawValue}`
  return /^#[0-9a-fA-F]{6}$/.test(normalizedValue) ? normalizedValue : fallback
}

function timeToMinutes(value) {
  const parts = String(value || '').split(':')
  if (parts.length < 2) return null
  const hours = Number(parts[0])
  const minutes = Number(parts[1])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return (hours * 60) + minutes
}

function computeShiftDurationMinutes(startTime, endTime) {
  const startMinutes = timeToMinutes(startTime)
  const endMinutes = timeToMinutes(endTime)
  if (startMinutes == null || endMinutes == null) return null
  let durationMinutes = endMinutes - startMinutes
  if (durationMinutes <= 0) durationMinutes += 24 * 60
  return durationMinutes
}

function formatDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes < 0) return '-'
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(remainingMinutes).padStart(2, '0')}`
}

function durationInputToMinutes(value) {
  const minutes = timeToMinutes(value)
  return minutes == null ? 0 : minutes
}

function minutesToDurationInput(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return '00:00'
  const safeMinutes = Math.max(0, Math.min(minutes, 23 * 60 + 59))
  return formatDuration(safeMinutes)
}

function getShiftMetrics(preset) {
  if (preset.kind !== 'working') {
    return { grossMinutes: null, netMinutes: null, overnight: false }
  }

  const grossMinutes = computeShiftDurationMinutes(preset.start_time, preset.end_time)
  const breakMinutes = Number(preset.break_minutes) || 0

  return {
    grossMinutes,
    netMinutes: grossMinutes == null ? null : Math.max(grossMinutes - breakMinutes, 0),
    overnight: grossMinutes != null && timeToMinutes(preset.end_time) <= timeToMinutes(preset.start_time),
  }
}

function escapeCsvValue(value) {
  const text = String(value ?? '')
  if (text.includes('"') || text.includes(';') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function downloadCsv(rows, branchName) {
  const csvLines = [
    ['On tanim', 'Tip', 'Kisa kod', 'Baslangic', 'Bitis', 'Brut sure', 'Mola', 'Net sure', 'Renk', 'Durum', 'Not'].join(';'),
    ...rows.map(row => {
      const metrics = getShiftMetrics(row)
      return [
        row.name,
        getKindOption(row.kind).label,
        row.short_code,
        row.start_time || '',
        row.end_time || '',
        metrics.grossMinutes == null ? '' : formatDuration(metrics.grossMinutes),
        row.kind === 'working' ? formatDuration(Number(row.break_minutes) || 0) : '',
        metrics.netMinutes == null ? '' : formatDuration(metrics.netMinutes),
        row.color_hex || '',
        row.active ? 'Aktif' : 'Pasif',
        row.notes || '',
      ].map(escapeCsvValue).join(';')
    }),
  ]

  const blob = new Blob([`\uFEFF${csvLines.join('\n')}`], { type: 'text/csv;charset=utf-8;' })
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${String(branchName || 'sube').replace(/\s+/g, '-').toLowerCase()}-vardiya-on-tanimlari.csv`
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  window.URL.revokeObjectURL(url)
}

function isSchemaMissingError(error) {
  const combinedText = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`.toLowerCase()
  return (
    combinedText.includes('does not exist') ||
    combinedText.includes('could not find') ||
    combinedText.includes('not found') ||
    combinedText.includes('42p01') ||
    combinedText.includes(TABLE_NAME) ||
    combinedText.includes(DAY_TABLE)
  )
}

function formatOperatingDayLabel(dateKey) {
  return new Intl.DateTimeFormat('tr-TR', {
    weekday: 'long',
  }).format(parseDateKey(dateKey))
}

function getOperatingHoursDraftMap(days) {
  const rowMap = Object.fromEntries((days || []).map(day => [day.schedule_date, day]))
  const fallbackByWeekday = {}

  for (const day of days || []) {
    const weekdayIndex = getWeekdayTemplateIndex(day.schedule_date)
    if (fallbackByWeekday[weekdayIndex]) continue
    fallbackByWeekday[weekdayIndex] = day
  }

  return Object.fromEntries(OPERATING_HOURS_TEMPLATE_KEYS.map(dayKey => {
    const weekdayIndex = getWeekdayTemplateIndex(dayKey)
    const templateRow = rowMap[dayKey]
    const fallbackRow = fallbackByWeekday[weekdayIndex]
    const row = templateRow || fallbackRow
    return [dayKey, {
      day_start_time: String(row?.day_start_time || DEFAULT_SHIFT_DAY_START).slice(0, 5),
      day_end_time: String(row?.day_end_time || DEFAULT_SHIFT_DAY_END).slice(0, 5),
      notes: row?.notes || '',
      hasSavedRow: !!templateRow,
      isFallbackRow: !templateRow && !!fallbackRow,
    }]
  }))
}

function SummaryCard({ icon, label, value, tone }) {
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, background: '#fff', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, minWidth: 180 }}>
      <span style={{ width: 38, height: 38, borderRadius: 12, background: tone.bg, color: tone.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <i className={`fa-solid ${icon}`} />
      </span>
      <div>
        <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{value}</div>
        <div style={{ fontSize: '.75rem', color: '#64748b', marginTop: 3 }}>{label}</div>
      </div>
    </div>
  )
}

function PresetButtonPreview({ preset }) {
  const backgroundColor = normalizeHex(preset.color_hex, getKindOption(preset.kind).defaultColor)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 74, padding: '8px 12px', borderRadius: 12, background: backgroundColor, color: '#fff', fontSize: '.8rem', fontWeight: 800, boxShadow: 'inset 0 1px 0 rgba(255,255,255,.16)' }}>
      {preset.short_code || preset.name}
    </span>
  )
}

function SettingsTabs({ activeTab, onChange }) {
  const tabs = [
    { value: 'presets', label: 'Vardiya On Tanimlari', icon: 'fa-grip' },
    { value: 'hours', label: 'Hafta Gunu Saatleri', icon: 'fa-clock' },
  ]

  return (
    <div className="card" style={{ marginBottom: 16, padding: 6, display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
      {tabs.map(tab => {
        const active = tab.value === activeTab
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange(tab.value)}
            style={{
              border: 'none',
              borderRadius: 12,
              background: active ? '#f59e0b' : '#fff',
              color: active ? '#fff' : '#475569',
              padding: '10px 14px',
              fontSize: '.82rem',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: active ? '0 10px 20px rgba(245,158,11,.22)' : 'none',
            }}
          >
            <i className={`fa-solid ${tab.icon}`} />
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

function OperatingHoursPanel({
  branchId,
  branchName,
  drafts,
  loading,
  savingKey,
  databaseError,
  schemaMissing,
  onFieldChange,
  onSaveDay,
  onSaveAll,
  onRetry,
}) {
  return (
    <>
      <div className="card" style={{ marginBottom: 16, display: 'grid', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '.96rem', fontWeight: 800, color: '#0f172a' }}>Hafta gunu bazli sube saatleri</div>
            <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 4, lineHeight: 1.55 }}>
              {`${branchName || 'Bu sube'} icin acilis ve kapanis saatlerini hafta gunu bazinda burada yonetin. Pazartesi tanimi her Pazartesi icin gecerli olur; vardiya plani bu haftalik sablonu okur.`}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn-p"
              onClick={() => void onSaveAll()}
              disabled={!branchId || savingKey === 'all' || loading}
              style={{ opacity: !branchId || savingKey === 'all' || loading ? 0.7 : 1 }}
            >
              <i className={`fa-solid ${savingKey === 'all' ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`} />
              Haftalik Tanimi Kaydet
            </button>
          </div>
        </div>

      </div>

      {!branchId ? (
        <div className="card" style={{ borderColor: '#fdba74', background: '#fff7ed' }}>
          <div style={{ fontWeight: 800, color: '#9a3412', marginBottom: 8 }}>Sube secilmedi</div>
          <div style={{ fontSize: '.86rem', color: '#7c2d12', lineHeight: 1.55 }}>
            Sube saatleri sube bazli tutulur. Bu alanlari duzenlemeden once calisma baglamindan bir sube secilmelidir.
          </div>
        </div>
      ) : databaseError ? (
        <div className="card" style={{ borderColor: '#fecaca', background: '#fff7f7' }}>
          <div style={{ fontWeight: 800, color: '#991b1b', marginBottom: 8 }}>DATABASE UNAVAILABLE</div>
          <div style={{ fontSize: '.86rem', color: '#7f1d1d', lineHeight: 1.6 }}>
            {schemaMissing
              ? `${DAY_TABLE} tablosu bu ortamda bulunamadi. Hafta gunu bazli sube saatleri cekirdek planlama verisi oldugu icin fallback kullanilmadi.`
              : databaseError}
          </div>
          {schemaMissing && (
            <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 12, background: '#fff', border: '1px solid #fecaca', color: '#991b1b', fontSize: '.82rem' }}>
              Bu ekran icin once repo kokundeki <strong>{DAY_SCHEMA_GUIDE}</strong> SQL dosyasi uygulanmalidir.
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <button className="btn-o" onClick={() => void onRetry()}>
              <i className="fa-solid fa-rotate-right" /> Tekrar Dene
            </button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
              <i className="fa-solid fa-spinner fa-spin" /> Yukleniyor...
            </div>
          ) : (
            <table className="tbl" style={{ width: '100%', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '32%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '16%' }} />
                <col style={{ width: '20%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Hafta gunu</th>
                  <th style={{ textAlign: 'center' }}>Acilis</th>
                  <th style={{ textAlign: 'center' }}>Kapanis</th>
                  <th style={{ textAlign: 'center' }}>Durum</th>
                  <th style={{ textAlign: 'center' }}>Islem</th>
                </tr>
              </thead>
              <tbody>
                {OPERATING_HOURS_TEMPLATE_KEYS.map(dayKey => {
                  const draft = drafts[dayKey] || {
                    day_start_time: DEFAULT_SHIFT_DAY_START,
                    day_end_time: DEFAULT_SHIFT_DAY_END,
                    hasSavedRow: false,
                    isFallbackRow: false,
                  }
                  const rowSaving = savingKey === dayKey
                  const badgeText = draft.hasSavedRow
                    ? 'Kayitli'
                    : draft.isFallbackRow
                      ? 'Hazir'
                      : 'Varsayilan'
                  const badgeStyle = draft.hasSavedRow
                    ? undefined
                    : { background: '#fff7ed', color: '#c2410c' }

                  return (
                    <tr key={dayKey}>
                      <td style={{ textAlign: 'left' }}>
                        <div style={{ fontWeight: 800, color: '#0f172a' }}>{formatOperatingDayLabel(dayKey)}</div>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          className="f-input"
                          type="time"
                          step="1800"
                          value={draft.day_start_time}
                          onChange={event => onFieldChange(dayKey, 'day_start_time', event.target.value)}
                          style={{ minWidth: 116, marginInline: 'auto' }}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          className="f-input"
                          type="time"
                          step="1800"
                          value={draft.day_end_time}
                          onChange={event => onFieldChange(dayKey, 'day_end_time', event.target.value)}
                          style={{ minWidth: 116, marginInline: 'auto' }}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${draft.hasSavedRow ? 'bg' : ''}`} style={badgeStyle}>
                          {badgeText}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn-o"
                          onClick={() => void onSaveDay(dayKey)}
                          disabled={rowSaving || savingKey === 'all'}
                          style={{ opacity: rowSaving || savingKey === 'all' ? 0.7 : 1 }}
                        >
                          <i className={`fa-solid ${rowSaving ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`} /> Kaydet
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </>
  )
}

export default function PreShiftSettings() {
  const toast = useToast()
  const { branchId, branchName } = useWorkspace()

  const [activeTab, setActiveTab] = useState('presets')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [databaseError, setDatabaseError] = useState('')
  const [schemaMissing, setSchemaMissing] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [kindFilter, setKindFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingRow, setEditingRow] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [form, setForm] = useState(makeEmptyForm())
  const [hoursDrafts, setHoursDrafts] = useState({})
  const [hoursLoading, setHoursLoading] = useState(true)
  const [hoursSavingKey, setHoursSavingKey] = useState('')
  const [hoursDatabaseError, setHoursDatabaseError] = useState('')
  const [hoursSchemaMissing, setHoursSchemaMissing] = useState(false)

  const operatingHourFallbackKeys = useMemo(() => (
    Array.from({ length: 7 }, (_, index) => toDateKey(addDays(startOfWeek(new Date()), index)))
  ), [])

  const operatingHourReadKeys = useMemo(() => (
    Array.from(new Set([...OPERATING_HOURS_TEMPLATE_KEYS, ...operatingHourFallbackKeys]))
  ), [operatingHourFallbackKeys])

  const load = useCallback(async () => {
    if (!branchId) {
      setRows([])
      setLoading(false)
      setDatabaseError('')
      setSchemaMissing(false)
      return
    }

    setLoading(true)
    setDatabaseError('')
    setSchemaMissing(false)

    const { data, error } = await db
      .from(TABLE_NAME)
      .select('*')
      .eq('branch_id', branchId)
      .is('deleted_at', null)
      .order('sort_order')
      .order('name')

    if (error) {
      setRows([])
      setDatabaseError(error.message || 'Vardiya on tanimlari veritabanindan okunamadi.')
      setSchemaMissing(isSchemaMissingError(error))
    } else {
      setRows(data || [])
    }

    setLoading(false)
  }, [branchId])

  useEffect(() => {
    void load()
  }, [load])

  const loadOperatingHours = useCallback(async () => {
    if (!branchId) {
      setHoursDrafts({})
      setHoursLoading(false)
      setHoursDatabaseError('')
      setHoursSchemaMissing(false)
      return
    }

    setHoursLoading(true)
    setHoursDatabaseError('')
    setHoursSchemaMissing(false)

    const { data, error } = await db
      .from(DAY_TABLE)
      .select('*')
      .eq('branch_id', branchId)
      .in('schedule_date', operatingHourReadKeys)
      .order('schedule_date')

    if (error) {
      setHoursDrafts(getOperatingHoursDraftMap([]))
      setHoursDatabaseError(error.message || 'Hafta gunu saatleri veritabanindan okunamadi.')
      setHoursSchemaMissing(isSchemaMissingError(error))
    } else {
      setHoursDrafts(getOperatingHoursDraftMap(data || []))
    }

    setHoursLoading(false)
  }, [branchId, operatingHourReadKeys])

  useEffect(() => {
    void loadOperatingHours()
  }, [loadOperatingHours])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('tr-TR')

    return rows.filter(row => {
      const matchesSearch = !query || [row.name, row.short_code, row.notes]
        .filter(Boolean)
        .some(value => String(value).toLocaleLowerCase('tr-TR').includes(query))

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && row.active) ||
        (statusFilter === 'passive' && !row.active)

      const matchesKind = kindFilter === 'all' || row.kind === kindFilter

      return matchesSearch && matchesStatus && matchesKind
    })
  }, [kindFilter, rows, search, statusFilter])

  const stats = useMemo(() => {
    const workingCount = rows.filter(row => row.kind === 'working').length
    const overnightCount = rows.filter(row => getShiftMetrics(row).overnight).length

    return {
      total: rows.length,
      working: workingCount,
      nonWorking: rows.length - workingCount,
      overnight: overnightCount,
    }
  }, [rows])

  const draftMetrics = useMemo(() => getShiftMetrics({
    kind: form.kind,
    start_time: form.start_time,
    end_time: form.end_time,
    break_minutes: durationInputToMinutes(form.break_duration),
  }), [form.break_duration, form.end_time, form.kind, form.start_time])

  function closeModal() {
    setModalOpen(false)
    setEditingRow(null)
    setForm(makeEmptyForm(rows.length))
  }

  function openAddModal() {
    const nextSortOrder = rows.length > 0 ? Math.max(...rows.map(row => Number(row.sort_order) || 0)) + 10 : 10
    setEditingRow(null)
    setForm(makeEmptyForm(nextSortOrder))
    setModalOpen(true)
  }

  function openEditModal(row) {
    setEditingRow(row)
    setForm({
      kind: row.kind || 'working',
      name: row.name || '',
      short_code: row.short_code || '',
      start_time: row.start_time || '07:00',
      end_time: row.end_time || '15:30',
      break_duration: minutesToDurationInput(Number(row.break_minutes) || 0),
      color_hex: normalizeHex(row.color_hex, getKindOption(row.kind).defaultColor),
      sort_order: Number(row.sort_order) || 0,
      active: row.active !== false,
      notes: row.notes || '',
    })
    setModalOpen(true)
  }

  function setFormField(key, value) {
    setForm(current => ({ ...current, [key]: value }))
  }

  function setHoursDraftField(dayKey, field, value) {
    setHoursDrafts(current => ({
      ...current,
      [dayKey]: {
        ...current[dayKey],
        [field]: value,
      },
    }))
  }

  function handleKindChange(nextKind) {
    setForm(current => {
      const currentKind = getKindOption(current.kind)
      const nextKindOption = getKindOption(nextKind)
      const shouldUpdateColor = !current.color_hex || normalizeHex(current.color_hex, currentKind.defaultColor) === currentKind.defaultColor

      return {
        ...current,
        kind: nextKind,
        color_hex: shouldUpdateColor ? nextKindOption.defaultColor : current.color_hex,
      }
    })
  }

  async function savePreset() {
    if (!branchId) {
      toast('Sube baglami olmadan vardiya on tanimi kaydedilemez.', 'error')
      return
    }

    const payload = {
      branch_id: branchId,
      name: String(form.name || '').trim(),
      short_code: String(form.short_code || '').trim(),
      kind: form.kind,
      start_time: form.kind === 'working' ? form.start_time : null,
      end_time: form.kind === 'working' ? form.end_time : null,
      break_minutes: form.kind === 'working' ? durationInputToMinutes(form.break_duration) : 0,
      color_hex: normalizeHex(form.color_hex, getKindOption(form.kind).defaultColor),
      sort_order: Number(form.sort_order) || 0,
      active: form.active !== false,
      notes: String(form.notes || '').trim() || null,
    }

    if (!payload.name) {
      toast('On tanim adi zorunludur.', 'error')
      return
    }

    if (!payload.short_code) {
      toast('Kisa kod zorunludur.', 'error')
      return
    }

    const duplicateCode = rows.some(row => (
      row.id !== editingRow?.id &&
      String(row.short_code || '').trim().toLocaleLowerCase('tr-TR') === payload.short_code.toLocaleLowerCase('tr-TR')
    ))

    if (duplicateCode) {
      toast('Ayni kisa kod bu subede zaten kullaniliyor.', 'error')
      return
    }

    if (payload.kind === 'working') {
      const grossMinutes = computeShiftDurationMinutes(payload.start_time, payload.end_time)
      if (grossMinutes == null) {
        toast('Baslangic ve bitis saati zorunludur.', 'error')
        return
      }
      if (payload.break_minutes >= grossMinutes) {
        toast('Mola suresi net vardiya suresini sifira dusuremez.', 'error')
        return
      }
    }

    setSaving(true)

    const query = editingRow
      ? db.from(TABLE_NAME).update(payload).eq('id', editingRow.id).eq('branch_id', branchId)
      : db.from(TABLE_NAME).insert(payload)

    const { error } = await query

    setSaving(false)

    if (error) {
      setDatabaseError(error.message || 'Kayit sirasinda veritabani hatasi olustu.')
      setSchemaMissing(isSchemaMissingError(error))
      toast(`Hata: ${error.message}`, 'error')
      return
    }

    toast(editingRow ? 'Vardiya on tanimi guncellendi.' : 'Vardiya on tanimi eklendi.', 'success')
    closeModal()
    await load()
  }

  async function removePreset(row) {
    const { error } = await db
      .from(TABLE_NAME)
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('branch_id', branchId)

    if (error) {
      toast(`Silinemedi: ${error.message}`, 'error')
      setDatabaseError(error.message || 'Kayit silinemedi.')
      setSchemaMissing(isSchemaMissingError(error))
    } else {
      toast('Vardiya on tanimi kaldirildi.', 'info')
      await load()
    }

    setConfirmDelete(null)
  }

  async function saveOperatingHours(dayKey) {
    if (!branchId) {
      toast('Sube baglami olmadan sube saatleri kaydedilemez.', 'error')
      return false
    }

    const draft = hoursDrafts[dayKey]
    if (!draft) return false

    if (timeToMinutes(draft.day_start_time) == null || timeToMinutes(draft.day_end_time) == null) {
      toast('Acilis ve kapanis saatlerini girin.', 'error')
      return false
    }

    setHoursSavingKey(dayKey)
    const { error } = await db
      .from(DAY_TABLE)
      .upsert({
        branch_id: branchId,
        schedule_date: dayKey,
        day_start_time: draft.day_start_time,
        day_end_time: draft.day_end_time,
        notes: draft.notes || null,
      }, { onConflict: 'branch_id,schedule_date' })
    setHoursSavingKey('')

    if (error) {
      setHoursDatabaseError(error.message || 'Hafta gunu saatleri kaydedilemedi.')
      setHoursSchemaMissing(isSchemaMissingError(error))
      toast(error.message || 'Hafta gunu saatleri kaydedilemedi.', 'error')
      return false
    }

    setHoursDrafts(current => ({
      ...current,
      [dayKey]: {
        ...current[dayKey],
        hasSavedRow: true,
        isFallbackRow: false,
      },
    }))
    setHoursDatabaseError('')
    setHoursSchemaMissing(false)
    toast(`${formatOperatingDayLabel(dayKey)} saatleri kaydedildi.`, 'success')
    return true
  }

  async function saveAllOperatingHours() {
    if (!branchId) {
      toast('Sube baglami olmadan sube saatleri kaydedilemez.', 'error')
      return
    }

    const rowsToSave = OPERATING_HOURS_TEMPLATE_KEYS.map(dayKey => ({
      dayKey,
      draft: hoursDrafts[dayKey],
    }))

    const invalidRow = rowsToSave.find(row => (
      !row.draft ||
      timeToMinutes(row.draft.day_start_time) == null ||
      timeToMinutes(row.draft.day_end_time) == null
    ))

    if (invalidRow) {
      toast(`${formatOperatingDayLabel(invalidRow.dayKey)} icin acilis ve kapanis saati zorunludur.`, 'error')
      return
    }

    setHoursSavingKey('all')
    const { error } = await db
      .from(DAY_TABLE)
      .upsert(
        rowsToSave.map(({ dayKey, draft }) => ({
          branch_id: branchId,
          schedule_date: dayKey,
          day_start_time: draft.day_start_time,
          day_end_time: draft.day_end_time,
          notes: draft.notes || null,
        })),
        { onConflict: 'branch_id,schedule_date' },
      )
    setHoursSavingKey('')

    if (error) {
      setHoursDatabaseError(error.message || 'Haftalik sube saatleri kaydedilemedi.')
      setHoursSchemaMissing(isSchemaMissingError(error))
      toast(error.message || 'Haftalik sube saatleri kaydedilemedi.', 'error')
      return
    }

    setHoursDrafts(current => Object.fromEntries(OPERATING_HOURS_TEMPLATE_KEYS.map(dayKey => [dayKey, {
      ...current[dayKey],
      hasSavedRow: true,
      isFallbackRow: false,
    }])))
    setHoursDatabaseError('')
    setHoursSchemaMissing(false)
    toast('Haftalik sube saatleri kaydedildi.', 'success')
  }

  const buttonPreviewRows = filteredRows.slice(0, 5)

  return (
    <div className="page-enter">
      <Header
        title="Vardiya On Tanimlari"
        subtitle={activeTab === 'presets'
          ? 'Vardiya butonlarinda ve planlama akislarinda kullanilacak sube bazli kodlar.'
          : 'Sube acilis / kapanis saatlerini hafta gunu bazinda yonetin; vardiya plani bu tekrar eden pencereyi buradan okur.'}
        actions={(
          <>
            {activeTab === 'presets' && (
              <>
                {filteredRows.length > 0 && (
                  <button className="btn-o" onClick={() => downloadCsv(filteredRows, branchName)}>
                    <i className="fa-solid fa-file-arrow-down" /> CSV Aktar
                  </button>
                )}
                <AddButton onClick={openAddModal} label="Ön Tanım Ekle" disabled={!branchId || !!databaseError} />
              </>
            )}
          </>
        )}
      />

      <SettingsTabs activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === 'presets' ? (
        <>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <SummaryCard icon="fa-calendar-days" label="Toplam on tanim" value={stats.total} tone={{ bg: '#eff6ff', color: '#2563eb' }} />
        <SummaryCard icon="fa-business-time" label="Calisma vardiyasi" value={stats.working} tone={{ bg: '#ecfdf5', color: '#0f766e' }} />
        <SummaryCard icon="fa-ban" label="Calisma disi kod" value={stats.nonWorking} tone={{ bg: '#f8fafc', color: '#475569' }} />
        <SummaryCard icon="fa-moon" label="Gece devri" value={stats.overnight} tone={{ bg: '#f5f3ff', color: '#7c3aed' }} />
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 1.8fr) repeat(2, minmax(180px, 1fr))', gap: 12 }}>
          <div>
            <label className="f-label">Ara</label>
            <div style={{ position: 'relative' }}>
              <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '.8rem', pointerEvents: 'none' }} />
              <input className="f-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Ad, kisa kod veya not ile ara" style={{ paddingLeft: 36 }} />
            </div>
          </div>

          <div>
            <label className="f-label">Durum</label>
            <div className="sel-wrap">
              <select className="f-input" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
                {STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="f-label">On tanim tipi</label>
            <div className="sel-wrap">
              <select className="f-input" value={kindFilter} onChange={event => setKindFilter(event.target.value)}>
                <option value="all">Tumu</option>
                {KIND_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '.74rem', color: '#64748b', fontWeight: 700 }}>Buton onizlemesi</div>
            <div style={{ fontSize: '.78rem', color: '#94a3b8', marginTop: 4 }}>
              Renk secimi, daha sonra vardiya secim butonlarinda ayni gorsel dili tasimak icin saklanir.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {buttonPreviewRows.length === 0
              ? <span style={{ fontSize: '.8rem', color: '#94a3b8' }}>Filtreye uygun on tanim bulunmadi.</span>
              : buttonPreviewRows.map(row => <PresetButtonPreview key={row.id} preset={row} />)}
          </div>
        </div>
      </div>

      {!branchId ? (
        <div className="card" style={{ borderColor: '#fdba74', background: '#fff7ed' }}>
          <div style={{ fontWeight: 800, color: '#9a3412', marginBottom: 8 }}>Sube secilmedi</div>
          <div style={{ fontSize: '.86rem', color: '#7c2d12', lineHeight: 1.55 }}>
            Vardiya on tanimlari sube bazli tutulur. Ekrani kullanmadan once calisma baglamindan bir sube secilmelidir.
          </div>
        </div>
      ) : databaseError ? (
        <div className="card" style={{ borderColor: '#fecaca', background: '#fff7f7' }}>
          <div style={{ fontWeight: 800, color: '#991b1b', marginBottom: 8 }}>DATABASE UNAVAILABLE</div>
          <div style={{ fontSize: '.86rem', color: '#7f1d1d', lineHeight: 1.6 }}>
            {schemaMissing
              ? `${TABLE_NAME} tablosu bu ortamda bulunamadi. Vardiya on tanimlari cekirdek operasyon verisi oldugu icin settings veya local fallback kullanilmadi.`
              : databaseError}
          </div>
          {schemaMissing && (
            <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 12, background: '#fff', border: '1px solid #fecaca', color: '#991b1b', fontSize: '.82rem' }}>
              Bu ekran icin once repo kokundeki <strong>{SCHEMA_GUIDE}</strong> SQL dosyasi uygulanmalidir.
            </div>
          )}
          <div style={{ marginTop: 14 }}>
            <button className="btn-o" onClick={() => void load()}>
              <i className="fa-solid fa-rotate-right" /> Tekrar Dene
            </button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
              <i className="fa-solid fa-spinner fa-spin" /> Yukleniyor...
            </div>
          ) : (
            <table className="tbl" style={{ width: '100%', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '24%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '8%' }} />
                <col style={{ width: '8%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>On tanim</th>
                  <th style={{ textAlign: 'left' }}>Kod</th>
                  <th style={{ textAlign: 'center' }}>Baslangic</th>
                  <th style={{ textAlign: 'center' }}>Bitis</th>
                  <th style={{ textAlign: 'center' }}>Brut</th>
                  <th style={{ textAlign: 'center' }}>Mola</th>
                  <th style={{ textAlign: 'center' }}>Net</th>
                  <th style={{ textAlign: 'center' }}>Buton</th>
                  <th style={{ textAlign: 'center' }}>Durum</th>
                  <th style={{ textAlign: 'center' }}>Islem</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={10}>
                      <div className="empty">
                        <i className="fa-solid fa-calendar-days" />
                        <p>Vardiya on tanimi bulunamadi.</p>
                      </div>
                    </td>
                  </tr>
                ) : filteredRows.map(row => {
                  const kind = getKindOption(row.kind)
                  const metrics = getShiftMetrics(row)
                  return (
                    <tr key={row.id}>
                      <td style={{ textAlign: 'left' }}>
                        <div style={{ display: 'grid', gap: 6 }}>
                          <div style={{ fontWeight: 800, color: '#0f172a' }}>{row.name}</div>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 9px', borderRadius: 999, background: kind.bg, color: kind.color, fontSize: '.72rem', fontWeight: 800 }}>
                              <i className={`fa-solid ${kind.icon}`} />
                              {kind.shortLabel}
                            </span>
                            <span className="badge">{`Sira ${Number(row.sort_order) || 0}`}</span>
                            {metrics.overnight && <span className="badge bgr">Gece devri</span>}
                          </div>
                          {row.notes && <div style={{ fontSize: '.76rem', color: '#64748b', lineHeight: 1.5 }}>{row.notes}</div>}
                        </div>
                      </td>
                      <td style={{ textAlign: 'left' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: '.84rem', fontWeight: 700, color: '#334155' }}>{row.short_code}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>{row.start_time || '-'}</td>
                      <td style={{ textAlign: 'center' }}>{row.end_time || '-'}</td>
                      <td style={{ textAlign: 'center' }}>{metrics.grossMinutes == null ? '-' : formatDuration(metrics.grossMinutes)}</td>
                      <td style={{ textAlign: 'center' }}>{row.kind === 'working' ? formatDuration(Number(row.break_minutes) || 0) : '-'}</td>
                      <td style={{ textAlign: 'center' }}>{metrics.netMinutes == null ? '-' : formatDuration(metrics.netMinutes)}</td>
                      <td style={{ textAlign: 'center' }}><PresetButtonPreview preset={row} /></td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`badge ${row.active ? 'bg' : 'bgr'}`}>{row.active ? 'Aktif' : 'Pasif'}</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                          <button className="ico-btn edit" onClick={() => openEditModal(row)} title="Duzenle">
                            <i className="fa-solid fa-pen" />
                          </button>
                          <button className="ico-btn del" onClick={() => setConfirmDelete(row)} title="Kaldir">
                            <i className="fa-solid fa-trash" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
        </>
      ) : (
        <OperatingHoursPanel
          branchId={branchId}
          branchName={branchName}
          drafts={hoursDrafts}
          loading={hoursLoading}
          savingKey={hoursSavingKey}
          databaseError={hoursDatabaseError}
          schemaMissing={hoursSchemaMissing}
          onFieldChange={setHoursDraftField}
          onSaveDay={saveOperatingHours}
          onSaveAll={saveAllOperatingHours}
          onRetry={loadOperatingHours}
        />
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        width={640}
        title={editingRow ? 'Vardiya On Tanimi Duzenle' : 'Yeni Vardiya On Tanimi'}
        subtitle="Liste sayfasi + modal detay yapisinda, planlama ekranlarinin tuketecegi sube bazli tanimlar."
        footer={(
          <>
            <button className="btn-g" onClick={closeModal}>Iptal</button>
            <button className="btn-p" onClick={savePreset} disabled={saving}>
              <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : 'fa-check'}`} /> Kaydet
            </button>
          </>
        )}
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <label className="f-label">On tanim tipi</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10 }}>
              {KIND_OPTIONS.map(option => {
                const active = form.kind === option.value
                return (
                  <button key={option.value} type="button" onClick={() => handleKindChange(option.value)} style={{ borderRadius: 14, border: `1.5px solid ${active ? option.color : '#e2e8f0'}`, background: active ? option.bg : '#fff', color: active ? option.color : '#475569', padding: '12px 10px', cursor: 'pointer', display: 'grid', gap: 8, justifyItems: 'center' }}>
                    <i className={`fa-solid ${option.icon}`} style={{ fontSize: '1rem' }} />
                    <span style={{ fontSize: '.8rem', fontWeight: 800 }}>{option.shortLabel}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            <div>
              <label className="f-label">On tanim adi <span style={{ color: '#ef4444' }}>*</span></label>
              <input className="f-input" value={form.name} onChange={event => setFormField('name', event.target.value)} placeholder="Orn. Sabahci, Ortaci, Kapanis" />
            </div>

            <div>
              <label className="f-label">Kisa kod <span style={{ color: '#ef4444' }}>*</span></label>
              <input className="f-input" value={form.short_code} onChange={event => setFormField('short_code', event.target.value)} placeholder="Orn. O, A, K, OFF" maxLength={10} />
            </div>

            {form.kind === 'working' && (
              <>
                <div>
                  <label className="f-label">Baslangic saati <span style={{ color: '#ef4444' }}>*</span></label>
                  <input className="f-input" type="time" value={form.start_time} onChange={event => setFormField('start_time', event.target.value)} />
                </div>

                <div>
                  <label className="f-label">Bitis saati <span style={{ color: '#ef4444' }}>*</span></label>
                  <input className="f-input" type="time" value={form.end_time} onChange={event => setFormField('end_time', event.target.value)} />
                </div>

                <div>
                  <label className="f-label">Calisma sayilmayan sure</label>
                  <input className="f-input" type="time" step="300" value={form.break_duration} onChange={event => setFormField('break_duration', event.target.value)} />
                  <p className="f-hint">Yemek ve mola suresi net vardiyadan dusulur.</p>
                </div>
              </>
            )}

            <div>
              <label className="f-label">Buton rengi</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input type="color" value={normalizeHex(form.color_hex, getKindOption(form.kind).defaultColor)} onChange={event => setFormField('color_hex', event.target.value)} style={{ width: 48, height: 42, border: '1px solid #e2e8f0', borderRadius: 10, background: '#fff' }} />
                <input className="f-input" value={form.color_hex} onChange={event => setFormField('color_hex', event.target.value)} placeholder="#f59e0b" style={{ flex: 1 }} />
              </div>
            </div>

            <div>
              <label className="f-label">Sira no</label>
              <input className="f-input" type="number" min="0" step="10" value={form.sort_order} onChange={event => setFormField('sort_order', event.target.value)} />
              <p className="f-hint">Kucuk sayi ustte gorunur.</p>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, cursor: 'pointer' }}>
              <div>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>Aktif kullan</div>
                <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 4 }}>
                  Pasif kayitlar listede saklanir ama planlama akislarinda varsayilan secim olmaz.
                </div>
              </div>
              <input type="checkbox" checked={form.active} onChange={event => setFormField('active', event.target.checked)} />
            </label>

            <div>
              <label className="f-label">Not</label>
              <textarea className="f-input" value={form.notes} onChange={event => setFormField('notes', event.target.value)} placeholder="Orn. Kapanis vardiyasinda mutfak teslimi kontrol edilir." rows={3} style={{ resize: 'vertical', minHeight: 88 }} />
            </div>
          </div>

          <div style={{ borderRadius: 16, border: '1px solid #e2e8f0', background: '#f8fafc', padding: '14px 16px', display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: '.74rem', fontWeight: 800, color: '#64748b', letterSpacing: '.04em', textTransform: 'uppercase' }}>
                  Buton onizleme
                </div>
                <div style={{ fontSize: '.8rem', color: '#94a3b8', marginTop: 4 }}>
                  Daha sonra vardiya secim ekraninda gorulecek renkli buton kimligi.
                </div>
              </div>
              <PresetButtonPreview preset={{ ...form, color_hex: normalizeHex(form.color_hex, getKindOption(form.kind).defaultColor) }} />
            </div>

            {form.kind === 'working' ? (
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <span className="badge">Brut {draftMetrics.grossMinutes == null ? '-' : formatDuration(draftMetrics.grossMinutes)}</span>
                <span className="badge">Mola {formatDuration(durationInputToMinutes(form.break_duration))}</span>
                <span className="badge">Net {draftMetrics.netMinutes == null ? '-' : formatDuration(draftMetrics.netMinutes)}</span>
                {draftMetrics.overnight && <span className="badge bgr">Gece devri</span>}
              </div>
            ) : (
              <div style={{ fontSize: '.82rem', color: '#475569', lineHeight: 1.55 }}>
                Bu tip kayitlar saat yerine durum kodu olarak kullanilir. Ornek: haftalik izin, raporlu veya diger calisma disi etiketler.
              </div>
            )}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!confirmDelete}
        title={`"${confirmDelete?.name}" kaldirilsin mi?`}
        desc="Kayit listeden cekilir ve daha sonra planlama akislarina varsayilan olarak gelmez."
        onConfirm={() => void removePreset(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
