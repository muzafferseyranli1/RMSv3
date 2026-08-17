import { useCallback, useEffect, useState } from 'react'
import { db, uploadApiFile, resolveImageUrl } from '@/lib/db'
import { useToast } from '@/hooks/useToast'
import Header from '@/components/layout/Header'
import Modal from '@/components/ui/Modal'
import AddButton from '@/components/ui/AddButton'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

const DEFAULT_SALES_CHANNELS = [
  'Hızlı Satış',
  'Gel Al',
  'Masa',
  'QR Menü',
  'Kiosk',
  'Suitable Yemek',
  'Online Yemek',
  'Call Center',
]

const DEFAULT_BRANDS = [
  {
    name: 'Burger Lab (Virtual)',
    code: 'BL-VIRTUAL',
    description: 'Gurme el yapımı smash burger & çıtır patates markası',
    logo_url: '',
    kitchen_station: 'Mutfak (KDS) - SUT-QMSUN2',
    platforms: ['Online Yemek', 'Gel Al', 'Hızlı Satış'],
    active: true,
    avg_prep_time_mins: 12,
  },
  {
    name: 'Taco & Burrito Co.',
    code: 'TB-VIRTUAL',
    description: 'Meksika lezzetleri, bol malzemeli burrito ve quesadilla',
    logo_url: '',
    kitchen_station: 'Mutfak (KDS) - SUT-QMSUN2',
    platforms: ['Online Yemek', 'Call Center'],
    active: true,
    avg_prep_time_mins: 15,
  },
  {
    name: 'Bowl & Green Lab',
    code: 'BG-VIRTUAL',
    description: 'Taze salata, kinoa bowllar ve sağlıklı beslenme markası',
    logo_url: '',
    kitchen_station: 'Mutfak (KDS) - SUT-QMSUN2',
    platforms: ['Online Yemek', 'QR Menü'],
    active: true,
    avg_prep_time_mins: 10,
  },
]

const EMPTY_FORM = {
  name: '',
  code: '',
  description: '',
  logo_url: '',
  kitchen_station: 'Mutfak (KDS) - SUT-QMSUN2',
  platforms: ['Online Yemek', 'Gel Al'],
  active: true,
  avg_prep_time_mins: 15,
}

function parsePlatforms(platformsData) {
  if (Array.isArray(platformsData)) return platformsData
  if (typeof platformsData === 'string') {
    try {
      const parsed = JSON.parse(platformsData)
      if (Array.isArray(parsed)) return parsed
    } catch {
      return []
    }
  }
  return []
}

function ToggleSwitch({ checked, onChange, disabled = false }) {
  return (
    <label className="tog" style={{ opacity: disabled ? 0.55 : 1 }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span className="tog-sl" />
    </label>
  )
}

function getKdsVal(dev) {
  if (!dev) return ''
  return dev.terminal_name ? `${dev.terminal_name} (${dev.activation_code})` : `Mutfak (KDS) - ${dev.activation_code}`
}

function getKdsLabel(dev) {
  if (!dev) return ''
  return dev.terminal_name ? `${dev.terminal_name} (${dev.activation_code})` : `Mutfak (KDS) - ${dev.activation_code}`
}

export default function CloudKitchen() {
  const toast = useToast()
  const [brands, setBrands] = useState([])
  const [kdsDevices, setKdsDevices] = useState([])
  const [salesChannels, setSalesChannels] = useState([])
  const [ckSettings, setCkSettings] = useState({
    id: null,
    separate_warehouses: false,
    separate_profitability: false,
    separate_personnel: false,
  })
  const [loading, setLoading] = useState(true)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [activeTab, setActiveTab] = useState('brands') // 'brands' | 'stations' | 'settings'
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteConfirm, setDeleteConfirm] = useState(null)

  const loadKdsDevices = useCallback(async () => {
    try {
      const { data, error } = await db.from('pos_terminals').select('*')
      if (!error && data) {
        const kdsOnly = data.filter(d =>
          d.device_type === 'kds' ||
          d.screen_mode === 'kds' ||
          d.device_type === 'kitchen'
        )
        setKdsDevices(kdsOnly)
      }
    } catch (err) {
      console.error('Failed to load KDS devices from pos_terminals:', err)
    }
  }, [])

  const loadSalesChannels = useCallback(async () => {
    try {
      const { data, error } = await db.from('sales_channels').select('*').order('sort_order', { ascending: true })
      if (!error && data && data.length > 0) {
        const activeOnly = data.filter(c => !c.deleted_at && c.active !== false).map(c => c.name)
        setSalesChannels(activeOnly.length > 0 ? activeOnly : DEFAULT_SALES_CHANNELS)
      } else {
        setSalesChannels(DEFAULT_SALES_CHANNELS)
      }
    } catch (err) {
      console.error('Failed to load sales channels:', err)
      setSalesChannels(DEFAULT_SALES_CHANNELS)
    }
  }, [])

  const loadCkSettings = useCallback(async () => {
    try {
      const { data, error } = await db.from('cloud_kitchen_settings').select('*').limit(1)
      if (!error && data && data.length > 0) {
        setCkSettings(data[0])
      }
    } catch (err) {
      console.error('Failed to load cloud kitchen settings:', err)
    }
  }, [])

  const seedDefaultsIfEmpty = useCallback(async () => {
    try {
      const { data: existing } = await db.from('cloud_kitchen_brands').select('id')
      if (!existing || existing.length === 0) {
        for (const brand of DEFAULT_BRANDS) {
          await db.from('cloud_kitchen_brands').insert({
            ...brand,
            platforms: JSON.stringify(brand.platforms)
          })
        }
      }
    } catch (err) {
      console.warn('Could not seed default cloud kitchen brands:', err)
    }
  }, [])

  const loadBrands = useCallback(async () => {
    setLoading(true)
    try {
      const { data, error } = await db.from('cloud_kitchen_brands').select('*').order('created_at', { ascending: true })
      if (error) {
        toast(`Hata: ${error.message}`, 'error')
        setBrands(DEFAULT_BRANDS)
      } else if (!data || data.length === 0) {
        await seedDefaultsIfEmpty()
        const { data: fresh } = await db.from('cloud_kitchen_brands').select('*').order('created_at', { ascending: true })
        setBrands(fresh && fresh.length > 0 ? fresh : DEFAULT_BRANDS)
      } else {
        setBrands(data)
      }
    } catch (err) {
      console.error('Failed to load cloud kitchen brands:', err)
      setBrands(DEFAULT_BRANDS)
    } finally {
      setLoading(false)
    }
  }, [toast, seedDefaultsIfEmpty])

  useEffect(() => {
    loadBrands()
    loadKdsDevices()
    loadSalesChannels()
    loadCkSettings()
  }, [loadBrands, loadKdsDevices, loadSalesChannels, loadCkSettings])

  async function handleSettingToggle(field, value) {
    const next = { ...ckSettings, [field]: value }
    setCkSettings(next)

    try {
      if (ckSettings.id) {
        const { error } = await db.from('cloud_kitchen_settings').update({
          [field]: value,
          updated_at: new Date().toISOString(),
        }).eq('id', ckSettings.id)

        if (error) {
          toast(`Ayar kaydedilemedi: ${error.message}`, 'error')
        } else {
          toast('Bulut Mutfak ayarları güncellendi', 'success')
        }
      } else {
        const { data, error } = await db.from('cloud_kitchen_settings').insert({
          [field]: value,
        }).select()

        if (!error && data && data.length > 0) {
          setCkSettings(data[0])
          toast('Bulut Mutfak ayarları güncellendi', 'success')
        }
      }
    } catch (err) {
      toast(`Ayar güncellenemedi: ${err.message}`, 'error')
    }
  }

  function openAddModal() {
    const initialStation = kdsDevices.length > 0 ? getKdsVal(kdsDevices[0]) : 'Mutfak (KDS) - SUT-QMSUN2'
    setForm({ ...EMPTY_FORM, kitchen_station: initialStation })
    setEditId(null)
    setModalOpen(true)
  }

  function openEditModal(brand) {
    setForm({
      name: brand.name || '',
      code: brand.code || '',
      description: brand.description || '',
      logo_url: brand.logo_url || '',
      kitchen_station: brand.kitchen_station || (kdsDevices.length > 0 ? getKdsVal(kdsDevices[0]) : 'Mutfak (KDS) - SUT-QMSUN2'),
      platforms: parsePlatforms(brand.platforms),
      active: brand.active !== false,
      avg_prep_time_mins: brand.avg_prep_time_mins || 15,
    })
    setEditId(brand.id)
    setModalOpen(true)
  }

  function closeModal() {
    setModalOpen(false)
    setEditId(null)
    setForm(EMPTY_FORM)
    setUploadingLogo(false)
  }

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingLogo(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await uploadApiFile(formData)
      if (res && res.file_url) {
        setForm(prev => ({ ...prev, logo_url: res.file_url }))
        toast('Marka logosu yüklendi', 'success')
      }
    } catch (err) {
      toast(`Logo yüklenemedi: ${err.message}`, 'error')
    } finally {
      setUploadingLogo(false)
    }
  }

  function toggleChannel(channelName) {
    setForm(prev => {
      const current = prev.platforms || []
      const next = current.includes(channelName)
        ? current.filter(c => c !== channelName)
        : [...current, channelName]
      return { ...prev, platforms: next }
    })
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast('Sanal marka adı zorunludur', 'error')
      return
    }

    const payload = {
      name: form.name.trim(),
      code: form.code.trim() || form.name.substring(0, 3).toUpperCase() + '-VIRTUAL',
      description: form.description.trim(),
      logo_url: form.logo_url || null,
      kitchen_station: form.kitchen_station,
      platforms: JSON.stringify(form.platforms || []),
      active: form.active,
      avg_prep_time_mins: parseInt(form.avg_prep_time_mins, 10) || 15,
      updated_at: new Date().toISOString(),
    }

    if (editId) {
      const { error } = await db.from('cloud_kitchen_brands').update(payload).eq('id', editId)
      if (error) {
        toast(`Güncelleme hatası: ${error.message}`, 'error')
        return
      }
      toast(`"${payload.name}" başarıyla güncellendi`, 'success')
    } else {
      const { error } = await db.from('cloud_kitchen_brands').insert(payload)
      if (error) {
        toast(`Ekleme hatası: ${error.message}`, 'error')
        return
      }
      toast(`"${payload.name}" sanal markası oluşturuldu`, 'success')
    }

    closeModal()
    loadBrands()
  }

  async function handleToggleActive(brand) {
    const nextState = !brand.active
    const { error } = await db.from('cloud_kitchen_brands').update({ active: nextState, updated_at: new Date().toISOString() }).eq('id', brand.id)
    if (error) {
      toast(`Durum değiştirilemedi: ${error.message}`, 'error')
    } else {
      toast(`"${brand.name}" ${nextState ? 'aktif' : 'pasif'} yapıldı`, nextState ? 'success' : 'info')
      setBrands(prev => prev.map(item => item.id === brand.id ? { ...item, active: nextState } : item))
    }
  }

  async function handleDelete(brand) {
    const { error } = await db.from('cloud_kitchen_brands').delete().eq('id', brand.id)
    if (error) {
      toast(`Silinemedi: ${error.message}`, 'error')
    } else {
      toast(`"${brand.name}" silindi`, 'info')
      loadBrands()
    }
    setDeleteConfirm(null)
  }

  const activeBrandsCount = brands.filter(b => b.active !== false).length
  const totalChannelsCount = new Set(brands.flatMap(b => parsePlatforms(b.platforms))).size
  const activeChannelsList = salesChannels.length > 0 ? salesChannels : DEFAULT_SALES_CHANNELS

  return (
    <div className="page-enter" style={{ paddingBottom: 40 }}>
      <Header
        title="Bulut Mutfak (Cloud Kitchen) Yönetimi"
        subtitle="Sanal markalar, satış kanalları ve paket sipariş KDS cihaz yönlendirmeleri."
        actions={(
          <AddButton onClick={openAddModal} label="Yeni Sanal Marka Ekle" />
        )}
      />

      {/* Overview Stat Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div className="card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
            <i className="fa-solid fa-cloud-meatball" />
          </div>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>{activeBrandsCount} / {brands.length}</div>
            <div style={{ fontSize: '.82rem', color: '#64748b', fontWeight: 600 }}>Aktif Sanal Marka</div>
          </div>
        </div>

        <div className="card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
            <i className="fa-solid fa-store" />
          </div>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>{totalChannelsCount} Kanal</div>
            <div style={{ fontSize: '.82rem', color: '#64748b', fontWeight: 600 }}>Entegre Satış Kanalı</div>
          </div>
        </div>

        <div className="card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(245, 158, 11, 0.15)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
            <i className="fa-solid fa-fire-burner" />
          </div>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>{kdsDevices.length || 1} KDS Cihazı</div>
            <div style={{ fontSize: '.82rem', color: '#64748b', fontWeight: 600 }}>Bağlı Mutfak Terminali</div>
          </div>
        </div>

        <div className="card" style={{ padding: 18, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
            <i className="fa-solid fa-stopwatch" />
          </div>
          <div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f172a' }}>12.5 dk</div>
            <div style={{ fontSize: '.82rem', color: '#64748b', fontWeight: 600 }}>Ortalama Hazırlık Süresi</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, borderBottom: '1px solid #e2e8f0', paddingBottom: 10 }}>
        <button
          onClick={() => setActiveTab('brands')}
          style={{
            padding: '8px 18px',
            borderRadius: 10,
            fontWeight: 700,
            fontSize: '.9rem',
            border: 'none',
            cursor: 'pointer',
            background: activeTab === 'brands' ? '#8b5cf6' : '#f1f5f9',
            color: activeTab === 'brands' ? '#fff' : '#64748b',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <i className="fa-solid fa-tags" /> Sanal Markalar ({brands.length})
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          style={{
            padding: '8px 18px',
            borderRadius: 10,
            fontWeight: 700,
            fontSize: '.9rem',
            border: 'none',
            cursor: 'pointer',
            background: activeTab === 'settings' ? '#8b5cf6' : '#f1f5f9',
            color: activeTab === 'settings' ? '#fff' : '#64748b',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <i className="fa-solid fa-gear" /> Ayarlar
        </button>
      </div>

      {/* TAB 1: SANAL MARKALAR */}
      {activeTab === 'brands' && (
        <div className="card" style={{ overflow: 'hidden' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
              <i className="fa-solid fa-spinner fa-spin" /> Sanal markalar yükleniyor...
            </div>
          ) : brands.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
              <i className="fa-solid fa-cloud-slash" style={{ fontSize: '2.5rem', marginBottom: 12, display: 'block', color: '#cbd5e1' }} />
              <p style={{ fontWeight: 600, color: '#475569' }}>Henüz kayıtlı sanal marka bulunmuyor.</p>
              <button className="btn-p" onClick={openAddModal} style={{ marginTop: 12 }}>
                <i className="fa-solid fa-plus" /> İlk Sanal Markayı Oluştur
              </button>
            </div>
          ) : (
            <table className="tbl" style={{ width: '100%', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '28%' }} />
                <col style={{ width: '25%' }} />
                <col style={{ width: '30%' }} />
                <col style={{ width: '9%' }} />
                <col style={{ width: '8%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Sanal Marka</th>
                  <th style={{ textAlign: 'left' }}>KDS Seçimi</th>
                  <th style={{ textAlign: 'left' }}>Satış Kanalları</th>
                  <th style={{ textAlign: 'center' }}>Durum</th>
                  <th style={{ textAlign: 'center' }}>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {brands.map(brand => (
                  <tr key={brand.id || brand.name} style={{ opacity: brand.active !== false ? 1 : 0.65 }}>
                    <td style={{ textAlign: 'left' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 10,
                            background: 'rgba(139, 92, 246, 0.12)',
                            color: '#8b5cf6',
                            display: 'flex',
                            alignItems: 'center',
                            justify: 'center',
                            fontWeight: 800,
                            fontSize: '1rem',
                            flexShrink: 0,
                            overflow: 'hidden',
                          }}
                        >
                          {brand.logo_url ? (
                            <img
                              src={resolveImageUrl(brand.logo_url)}
                              alt={brand.name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                          ) : (
                            <i className="fa-solid fa-utensils" />
                          )}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '.95rem' }}>{brand.name}</div>
                          <div style={{ fontSize: '.78rem', color: '#64748b' }}>{brand.code || 'CLOUD-BRAND'} • {brand.avg_prep_time_mins || 15} dk haz.</div>
                        </div>
                      </div>
                    </td>

                    <td style={{ textAlign: 'left' }}>
                      <span className="badge bgb" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <i className="fa-solid fa-desktop" /> {brand.kitchen_station || 'Mutfak (KDS) - SUT-QMSUN2'}
                      </span>
                    </td>

                    <td style={{ textAlign: 'left' }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {parsePlatforms(brand.platforms).map(p => (
                          <span
                            key={p}
                            style={{
                              fontSize: '.72rem',
                              fontWeight: 700,
                              background: '#f1f5f9',
                              color: '#334155',
                              padding: '3px 8px',
                              borderRadius: 6,
                              border: '1px solid #e2e8f0',
                            }}
                          >
                            {p}
                          </span>
                        ))}
                      </div>
                    </td>

                    <td style={{ textAlign: 'center' }}>
                      <ToggleSwitch checked={brand.active !== false} onChange={() => handleToggleActive(brand)} />
                    </td>

                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button className="ico-btn edit" onClick={() => openEditModal(brand)} title="Düzenle">
                          <i className="fa-solid fa-pen" />
                        </button>
                        <button className="ico-btn del" onClick={() => setDeleteConfirm(brand)} title="Sil">
                          <i className="fa-solid fa-trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* TAB 3: AYARLAR */}
      {activeTab === 'settings' && (
        <div className="card" style={{ padding: 24 }}>
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="fa-solid fa-gear" style={{ color: '#8b5cf6' }} /> Bulut Mutfak Çalışma & Operasyon Ayarları
            </h3>
            <p style={{ color: '#64748b', fontSize: '.88rem', marginTop: 4 }}>
              Depo kullanımı, maliyet/karlılık hesapları ve personel yönetimi tercihlerini yapılandırın.
            </p>
          </div>

          <div style={{ display: 'grid', gap: 16, maxWidth: 800 }}>
            {/* 1. Depo Kullanım Modu */}
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 14,
                padding: 18,
                background: '#fff',
                display: 'flex',
                alignItems: 'center',
                justify: 'space-between',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: ckSettings.separate_warehouses ? 'rgba(139, 92, 246, 0.15)' : '#f1f5f9',
                    color: ckSettings.separate_warehouses ? '#8b5cf6' : '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    justify: 'center',
                    fontSize: '1.2rem',
                    flexShrink: 0,
                  }}
                >
                  <i className="fa-solid fa-warehouse" />
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1rem', marginBottom: 4 }}>
                    1. Depo Kullanım Yapısı
                  </div>
                  <div style={{ fontSize: '.85rem', color: '#475569', fontWeight: 600 }}>
                    {ckSettings.separate_warehouses ? (
                      <span style={{ color: '#8b5cf6' }}><i className="fa-solid fa-circle-check" /> Markalar Ayrı Depolar Kullanacak</span>
                    ) : (
                      <span style={{ color: '#0284c7' }}><i className="fa-solid fa-cubes" /> Ortak Depo Kullanılacak</span>
                    )}
                  </div>
                  <div style={{ fontSize: '.78rem', color: '#94a3b8', marginTop: 4 }}>
                    {ckSettings.separate_warehouses
                      ? 'Stok düşüşleri ve ham madde takibi her sanal marka için tanımlı ayrı depolardan yapılır.'
                      : 'Tüm sanal markaların siparişlerinde tek bir ortak depo stoku kullanılır.'}
                  </div>
                </div>
              </div>
              <ToggleSwitch
                checked={ckSettings.separate_warehouses}
                onChange={val => handleSettingToggle('separate_warehouses', val)}
              />
            </div>

            {/* 2. Karlılık Hesapları */}
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 14,
                padding: 18,
                background: '#fff',
                display: 'flex',
                alignItems: 'center',
                justify: 'space-between',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: ckSettings.separate_profitability ? 'rgba(139, 92, 246, 0.15)' : '#f1f5f9',
                    color: ckSettings.separate_profitability ? '#8b5cf6' : '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    justify: 'center',
                    fontSize: '1.2rem',
                    flexShrink: 0,
                  }}
                >
                  <i className="fa-solid fa-chart-pie" />
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1rem', marginBottom: 4 }}>
                    2. Karlılık Hesaplama Modu
                  </div>
                  <div style={{ fontSize: '.85rem', color: '#475569', fontWeight: 600 }}>
                    {ckSettings.separate_profitability ? (
                      <span style={{ color: '#8b5cf6' }}><i className="fa-solid fa-circle-check" /> Karlılık Hesapları Ayrı Yapılacak</span>
                    ) : (
                      <span style={{ color: '#0284c7' }}><i className="fa-solid fa-store" /> Tek Şube Olara yapılacaktır</span>
                    )}
                  </div>
                  <div style={{ fontSize: '.78rem', color: '#94a3b8', marginTop: 4 }}>
                    {ckSettings.separate_profitability
                      ? 'P&L ve maliyet hesaplamalarında her marka kendi gelir-gider tablosu ile ayrı değerlendirilir.'
                      : 'Tüm bulut mutfak gelir ve giderleri konsolide edilerek tek bir şube altında hesaplanır.'}
                  </div>
                </div>
              </div>
              <ToggleSwitch
                checked={ckSettings.separate_profitability}
                onChange={val => handleSettingToggle('separate_profitability', val)}
              />
            </div>

            {/* 3. Personel Yönetimi */}
            <div
              style={{
                border: '1px solid #e2e8f0',
                borderRadius: 14,
                padding: 18,
                background: '#fff',
                display: 'flex',
                alignItems: 'center',
                justify: 'space-between',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 10,
                    background: ckSettings.separate_personnel ? 'rgba(139, 92, 246, 0.15)' : '#f1f5f9',
                    color: ckSettings.separate_personnel ? '#8b5cf6' : '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    justify: 'center',
                    fontSize: '1.2rem',
                    flexShrink: 0,
                  }}
                >
                  <i className="fa-solid fa-users-gear" />
                </div>
                <div>
                  <div style={{ fontWeight: 800, color: '#0f172a', fontSize: '1rem', marginBottom: 4 }}>
                    3. Personel Yapılanması
                  </div>
                  <div style={{ fontSize: '.85rem', color: '#475569', fontWeight: 600 }}>
                    {ckSettings.separate_personnel ? (
                      <span style={{ color: '#8b5cf6' }}><i className="fa-solid fa-circle-check" /> Her Markanın Personeli Ayrı</span>
                    ) : (
                      <span style={{ color: '#0284c7' }}><i className="fa-solid fa-user-group" /> Ortak Personel Kullanılacak</span>
                    )}
                  </div>
                  <div style={{ fontSize: '.78rem', color: '#94a3b8', marginTop: 4 }}>
                    {ckSettings.separate_personnel
                      ? 'Mutfak çalışanları ve şefler sadece atandıkları sanal markanın siparişlerini hazırlar.'
                      : 'Tüm mutfak ekibi gelen tüm siparişleri markadan bağımsız olarak ortaklaşa üstlenir.'}
                  </div>
                </div>
              </div>
              <ToggleSwitch
                checked={ckSettings.separate_personnel}
                onChange={val => handleSettingToggle('separate_personnel', val)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal: Sanal Marka Ekle / Düzenle */}
      <Modal
        open={modalOpen}
        onClose={closeModal}
        width={500}
        title={editId ? 'Sanal Marka Düzenle' : 'Yeni Sanal Marka Tanımla'}
        footer={(
          <>
            <button className="btn-g" onClick={closeModal}>İptal</button>
            <button className="btn-p" onClick={handleSave}>
              <i className="fa-solid fa-check" /> Kaydet
            </button>
          </>
        )}
      >
        <div style={{ display: 'grid', gap: 14 }}>
          {/* Marka Logo Yükleme */}
          <div>
            <label className="f-label">Marka Logosu</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 4 }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 12,
                  border: '1px dashed #cbd5e1',
                  background: '#f8fafc',
                  display: 'flex',
                  alignItems: 'center',
                  justify: 'center',
                  overflow: 'hidden',
                  position: 'relative',
                  flexShrink: 0,
                }}
              >
                {form.logo_url ? (
                  <img
                    src={resolveImageUrl(form.logo_url)}
                    alt="Marka Logosu"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <i className="fa-solid fa-cloud-arrow-up" style={{ fontSize: '1.4rem', color: '#94a3b8' }} />
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '7px 14px',
                    borderRadius: 8,
                    background: '#f1f5f9',
                    color: '#334155',
                    fontSize: '.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    border: '1px solid #cbd5e1',
                  }}
                >
                  <i className="fa-solid fa-upload" />
                  {uploadingLogo ? 'Yükleniyor...' : form.logo_url ? 'Görseli Değiştir' : 'Logo Yükle'}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    disabled={uploadingLogo}
                    onChange={handleLogoUpload}
                  />
                </label>

                {form.logo_url && (
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, logo_url: '' }))}
                    style={{
                      fontSize: '.75rem',
                      color: '#ef4444',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      textAlign: 'left',
                      fontWeight: 600,
                    }}
                  >
                    <i className="fa-solid fa-trash" /> Görseli Kaldır
                  </button>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="f-label">Marka Adı <span style={{ color: '#ef4444' }}>*</span></label>
            <input
              className="f-input"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Örn. Burger Lab (Virtual)"
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label className="f-label">Marka Kodu</label>
              <input
                className="f-input"
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                placeholder="Örn. BL-VIRTUAL"
              />
            </div>
            <div>
              <label className="f-label">Ort. Hazırlık (dk)</label>
              <input
                className="f-input"
                type="number"
                min="1"
                value={form.avg_prep_time_mins}
                onChange={e => setForm(f => ({ ...f, avg_prep_time_mins: e.target.value }))}
              />
            </div>
          </div>

          <div>
            <label className="f-label">KDS Seçimi <span style={{ color: '#ef4444' }}>*</span></label>
            <select
              className="f-input"
              value={form.kitchen_station}
              onChange={e => setForm(f => ({ ...f, kitchen_station: e.target.value }))}
            >
              {kdsDevices.length > 0 ? (
                kdsDevices.map(dev => {
                  const val = getKdsVal(dev)
                  const lbl = getKdsLabel(dev)
                  return (
                    <option key={dev.id} value={val}>
                      {lbl}
                    </option>
                  )
                })
              ) : (
                <option value="Mutfak (KDS) - SUT-QMSUN2">Mutfak (KDS) - SUT-QMSUN2</option>
              )}
            </select>
            <p className="f-hint" style={{ marginTop: 4 }}>Cihaz Yönetimi ekranında "Mutfak (KDS)" olarak tanımlanan cihazlar listelenir.</p>
          </div>

          <div>
            <label className="f-label">Açıklama</label>
            <textarea
              className="f-input"
              rows={2}
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Sanal marka konsepti ve özel mutfak notları..."
            />
          </div>

          {/* Satış Kanalları */}
          <div>
            <label className="f-label">Satış Kanalları</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
              {activeChannelsList.map(channelName => {
                const selected = (form.platforms || []).includes(channelName)
                return (
                  <button
                    type="button"
                    key={channelName}
                    onClick={() => toggleChannel(channelName)}
                    style={{
                      padding: '6px 12px',
                      borderRadius: 8,
                      fontSize: '.8rem',
                      fontWeight: 700,
                      border: selected ? '1px solid #8b5cf6' : '1px solid #cbd5e1',
                      background: selected ? 'rgba(139, 92, 246, 0.15)' : '#fff',
                      color: selected ? '#8b5cf6' : '#64748b',
                      cursor: 'pointer',
                    }}
                  >
                    {selected ? '✓ ' : '+ '}{channelName}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Marka Aktif / Pasif */}
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 16px', background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 700, color: '#0f172a', fontSize: '.9rem' }}>Marka Yayın Durumu</div>
              <div style={{ fontSize: '.78rem', color: '#64748b' }}>Bu sanal markayı aktif satışa ve sipariş alımına açın.</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <ToggleSwitch checked={form.active !== false} onChange={val => setForm(f => ({ ...f, active: val }))} />
              <span style={{ fontSize: '.85rem', fontWeight: 700, color: form.active ? '#16a34a' : '#64748b' }}>
                {form.active ? 'Aktif Yayın' : 'Pasif'}
              </span>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteConfirm}
        title={`"${deleteConfirm?.name}" sanal markası silinsin mi?`}
        onConfirm={() => handleDelete(deleteConfirm)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  )
}
