import React, { useState, useEffect, useId } from 'react'
import { Plus, Trash2, Smartphone, Monitor, Server, Tablet, Presentation } from 'lucide-react'
import { db, uploadApiFile, buildApiUrl } from '@/lib/db'
import { useToast } from '@/hooks/useToast'
import Header from '@/components/layout/Header'
import Modal from '@/components/ui/Modal'
import { useWorkspace } from '@/context/WorkspaceContext'
import { loadTableManagementCatalog } from '@/lib/posTableCatalogService'
import { loadKioskSettings, saveKioskSettings } from '@/lib/kioskSettings'

export default function DeviceSettings() {
  const { branchId } = useWorkspace()
  const [devices, setDevices] = useState([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingDevice, setEditingDevice] = useState(null)
  const [formData, setFormData] = useState({
    device_type: 'pos',
    is_master: false,
    terminal_name: '',
    config_data: {}
  })
  const [halls, setHalls] = useState([])
  const [coverSettings, setCoverSettings] = useState({ tracking_enabled: true, default_count: 1 })
  const [globalKdsCombined, setGlobalKdsCombined] = useState(false)
  const toast = useToast()

  const loadDevices = async () => {
    if (!branchId) return
    const { data, error } = await db.from('pos_terminals').select('*').eq('branch_id', branchId)
    if (!error && data) {
      setDevices(data)
    }
  }

  const loadHalls = async () => {
    if (!branchId) return
    try {
      const catalog = await loadTableManagementCatalog(branchId)
      if (catalog && catalog.halls) {
        setHalls(catalog.halls)
      }
    } catch (e) {
      console.error('Halls could not be loaded', e)
    }
  }

  const loadCoverSettings = async () => {
    try {
      const { data, error } = await db.from('settings').select('value').eq('key', 'cover_settings').maybeSingle()
      if (!error && data && data.value) {
        setCoverSettings(data.value)
      }
    } catch (e) {
      console.error('Kuver ayarları yüklenemedi', e)
    }
  }

  const loadGlobalSettings = async () => {
    try {
      const settings = await loadKioskSettings()
      setGlobalKdsCombined(settings.kds_pickup_combined === true)
    } catch (e) {
      console.error('Global settings could not be loaded', e)
    }
  }

  const handleToggleKdsCombined = async (val) => {
    try {
      const settings = await loadKioskSettings()
      settings.kds_pickup_combined = val
      await saveKioskSettings(settings)
      setGlobalKdsCombined(val)
      toast(val ? 'Birleşik KDS ve Pickup modu aktif edildi.' : 'Ayrık KDS ve Pickup modu aktif edildi.', 'success')
    } catch (e) {
      toast('Ayar güncellenirken hata oluştu', 'error')
      console.error(e)
    }
  }

  useEffect(() => {
    loadDevices()
    loadCoverSettings()
    loadGlobalSettings()
  }, [branchId])

  useEffect(() => {
    loadHalls()
  }, [branchId])

  const generateActivationCode = () => {
    const random = Math.random().toString(36).substring(2, 8).toUpperCase()
    return `SUT-${random}`
  }

  // device_type → screen_mode eşlemesi (DB'ye yazılacak)
  const DEVICE_TYPE_TO_SCREEN_MODE = {
    pos: 'pos',
    masa: 'garson',
    kds: 'kds',
    pickup: 'pickup',
    queue_screen: 'pos',
    kiosk: 'pos',
    kiosk_tablet: 'pos',
  }

  const handleSave = async (e) => {
    e.preventDefault()

    if (!branchId) {
      toast('Aktif bir şube seçili değil. Lütfen şube seçin.', 'error')
      return
    }

    // Safety check: if master is forced but there's already a master
    if (formData.is_master && hasMaster && (!editingDevice || !editingDevice.is_master)) {
      toast('Sistemde zaten bir Ana Kasa (Master) bulunuyor.', 'error')
      return
    }

    if (editingDevice) {
      const updates = {
        device_type: formData.device_type,
        screen_mode: DEVICE_TYPE_TO_SCREEN_MODE[formData.device_type] || 'pos',
        is_master: Boolean(formData.is_master),
        terminal_role: Boolean(formData.is_master) ? 'master' : 'slave',
        config_data: formData.config_data ?? {},
        terminal_name: (formData.terminal_name && formData.terminal_name.trim()) ? formData.terminal_name.trim() : null
      }
      const { error } = await db.from('pos_terminals').update(updates).eq('id', editingDevice.id)
      if (error) {
        toast(`Cihaz güncellenemedi: ${error.message || JSON.stringify(error)}`, 'error')
        console.error('[DeviceSettings] update error:', error)
      } else {
        if (formData.is_master) {
          await db.from('settings').upsert({ key: 'cover_settings', value: coverSettings })
        }
        const deviceLabel = updates.terminal_name
          ? `'${updates.terminal_name}' başarıyla güncellendi.`
          : 'Cihaz başarıyla güncellendi.'
        toast(deviceLabel, 'success')
        setEditingDevice(null)
        setFormData({ device_type: 'pos', is_master: false, terminal_name: '', config_data: {} })
        setIsModalOpen(false)
        loadDevices()
        loadCoverSettings()
      }
      return
    }

    const newDevice = {
      terminal_id: crypto.randomUUID(),
      branch_id: branchId,
      device_type: formData.device_type,
      screen_mode: DEVICE_TYPE_TO_SCREEN_MODE[formData.device_type] || 'pos',
      is_master: Boolean(formData.is_master),
      terminal_role: Boolean(formData.is_master) ? 'master' : 'slave',
      activation_code: generateActivationCode(),
      is_used: false,
      config_data: formData.config_data ?? {}
    }

    // terminal_name opsiyonel — sadece doluysa gönder
    if (formData.terminal_name && formData.terminal_name.trim()) {
      newDevice.terminal_name = formData.terminal_name.trim()
    }

    const { error } = await db.from('pos_terminals').insert(newDevice)
    if (error) {
      toast(`Cihaz eklenemedi: ${error.message || JSON.stringify(error)}`, 'error')
      console.error('[DeviceSettings] insert error:', error)
    } else {
      if (formData.is_master) {
        await db.from('settings').upsert({ key: 'cover_settings', value: coverSettings })
      }
      const deviceLabel = newDevice.terminal_name
        ? `'${newDevice.terminal_name}' başarıyla oluşturuldu.`
        : 'Cihaz başarıyla oluşturuldu.'
      toast(deviceLabel, 'success')
      setFormData({ device_type: 'pos', is_master: false, terminal_name: '', config_data: {} })
      setIsModalOpen(false)
      loadDevices()
      loadCoverSettings()
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Bu cihazı silmek istediğinize emin misiniz?')) return

    const { error } = await db.from('pos_terminals').delete().eq('id', id)
    if (error) {
      toast('Cihaz silinirken hata oluştu', 'error')
    } else {
      toast('Cihaz başarıyla silindi', 'success')
      loadDevices()
    }
  }

  const handleAddNew = () => {
    setEditingDevice(null)
    setFormData({ device_type: 'pos', is_master: false, terminal_name: '', config_data: {} })
    setIsModalOpen(true)
  }

  const handleEdit = (device) => {
    setEditingDevice(device)
    setFormData({
      device_type: device.device_type,
      is_master: device.is_master,
      terminal_name: device.terminal_name || '',
      config_data: device.config_data || {}
    })
    setIsModalOpen(true)
  }

  const getDeviceIcon = (type) => {
    switch(type) {
      case 'pos': return <Monitor className="w-5 h-5" />
      case 'masa': return <Tablet className="w-5 h-5" />
      case 'kds': return <Server className="w-5 h-5" />
      case 'pickup': return <Smartphone className="w-5 h-5" />
      case 'queue_screen': return <Presentation className="w-5 h-5" />
      case 'kiosk': return <Monitor className="w-5 h-5" />
      case 'kiosk_tablet': return <Tablet className="w-5 h-5" />
      default: return <Monitor className="w-5 h-5" />
    }
  }

  const getDeviceTypeName = (type) => {
    switch(type) {
      case 'pos': return 'Kasa (POS)'
      case 'masa': return 'Garson (Tablet)'
      case 'kds': return 'Mutfak (KDS)'
      case 'pickup': return 'Teslimat (Pickup)'
      case 'queue_screen': return 'Sıra Ekranı'
      case 'kiosk': return 'Kiosk'
      case 'kiosk_tablet': return 'Kiosk Tablet'
      default: return type
    }
  }

  const hasMaster = devices.some(d => d.is_master)
  const sourceDevices = devices.filter(d => ['pos', 'masa', 'kiosk', 'kiosk_tablet'].includes(d.device_type))
  const kdsDevices = devices.filter(d => d.device_type === 'kds')
  const pickupDevices = devices.filter(d => d.device_type === 'pickup')

  // Helper to manage array in config_data
  const toggleConfigArrayItem = (key, value) => {
    const currentArray = formData.config_data[key] || []
    let newArray
    if (currentArray.includes(value)) {
      newArray = currentArray.filter(v => v !== value)
    } else {
      newArray = [...currentArray, value]
    }
    setFormData({
      ...formData,
      config_data: { ...formData.config_data, [key]: newArray }
    })
  }

  const setConfigValue = (key, value) => {
    setFormData({
      ...formData,
      config_data: { ...formData.config_data, [key]: value }
    })
  }

  return (
    <div>
      <Header 
        title="Cihaz Yönetimi" 
        subtitle="Fiziksel POS, Garson, Mutfak (KDS) ve Sıra terminallerinizi merkezi olarak yönetin."
        actions={
          <button className="btn-p gap-2" onClick={handleAddNew}>
            <Plus className="w-4 h-4" />
            Yeni Cihaz Oluştur
          </button>
        }
      />

      <div className="card mt-6 p-4 bg-gray-50 border border-gray-200 rounded-xl flex items-center justify-between">
        <div>
          <div className="text-sm font-bold text-gray-950">KDS + Teslimat Birleşik Çalışsın</div>
          <div className="text-xs text-gray-500 mt-0.5">Açıksa teslim işlemleri KDS tarafında yönetilir, pickup bilgi moduna geçer.</div>
        </div>
        <label className="tog">
          <input 
            type="checkbox" 
            checked={globalKdsCombined} 
            onChange={e => handleToggleKdsCombined(e.target.checked)} 
          />
          <span className="tog-sl" />
        </label>
      </div>

      <div className="card mt-6" style={{ padding: 18 }}>
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3">Tip</th>
              <th className="px-6 py-3">Bağlantı Anahtarı / URL</th>
              <th className="px-6 py-3">Rol</th>
              <th className="px-6 py-3">Özel Ayarlar</th>
              <th className="px-6 py-3 text-right">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {devices.map(device => (
              <tr key={device.id} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-6 py-4 flex items-center gap-3">
                  {getDeviceIcon(device.device_type)}
                  <div>
                    <div className="font-medium">{getDeviceTypeName(device.device_type)}</div>
                    {device.terminal_name && (
                      <div className="text-xs text-gray-500">{device.terminal_name}</div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4">
                  {device.device_type === 'queue_screen' ? (
                    <div style={{ wordBreak: 'break-all' }}>
                      <a href={`/sira-ekrani/${device.activation_code}`} target="_blank" rel="noreferrer" className="text-blue-600 font-mono text-xs hover:underline">
                        {window.location.origin}/sira-ekrani/{device.activation_code}
                      </a>
                    </div>
                  ) : (
                    <span className="font-mono bg-blue-100 text-blue-800 px-2 py-1 rounded text-lg font-bold">
                      {device.activation_code}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4">
                  {device.is_master ? (
                    <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">Master (Ana Kasa)</span>
                  ) : (
                    <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs font-medium">Client</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="text-xs text-gray-500 flex flex-col gap-1 max-w-[200px]">
                    {device.config_data.allowed_zones && device.config_data.allowed_zones.length > 0 && (
                      <div><strong>Salon:</strong> {device.config_data.allowed_zones.join(', ')}</div>
                    )}
                    {device.config_data.allowed_sources && device.config_data.allowed_sources.length > 0 && (
                      <div><strong>Dinlenenler:</strong> {device.config_data.allowed_sources.join(', ')}</div>
                    )}
                    {device.config_data.allowed_kds && device.config_data.allowed_kds.length > 0 && (
                      <div><strong>Dinlenen KDS:</strong> {device.config_data.allowed_kds.join(', ')}</div>
                    )}
                    {device.config_data.allowed_pickups && device.config_data.allowed_pickups.length > 0 && (
                      <div><strong>Dinlenen Teslimat:</strong> {device.config_data.allowed_pickups.join(', ')}</div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <button className="btn-o mr-2" style={{ color: '#3b82f6', borderColor: '#3b82f6', padding: '6px 10px' }} onClick={() => handleEdit(device)}>
                    <i className="fa-solid fa-pen" />
                  </button>
                  <button className="btn-o" style={{ color: '#ef4444', borderColor: '#ef4444', padding: '6px 10px' }} onClick={() => handleDelete(device.id)}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {devices.length === 0 && (
              <tr>
                <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                  Henüz kayıtlı bir cihaz bulunmuyor.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingDevice ? "Cihazı Düzenle" : "Yeni Cihaz Oluştur"}>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Cihaz Tipi</label>
            <select 
              className="f-input"
              value={formData.device_type}
              onChange={e => {
                const newType = e.target.value
                // If switching to a type that can't be master, auto uncheck
                let newIsMaster = formData.is_master
                if (['kds', 'pickup', 'queue_screen', 'kiosk', 'kiosk_tablet'].includes(newType)) {
                  newIsMaster = false
                }
                setFormData({
                  ...formData, 
                  device_type: newType, 
                  is_master: newIsMaster,
                  config_data: {} // Reset config on type change
                })
              }}
            >
              <option value="pos">Kasa (POS)</option>
              <option value="masa">Garson (Tablet)</option>
              <option value="kds">Mutfak (KDS)</option>
              <option value="pickup">Teslimat (Pickup)</option>
              <option value="queue_screen">Sıra Ekranı</option>
              <option value="kiosk">Kiosk</option>
              <option value="kiosk_tablet">Kiosk Tablet</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Cihaz Adı <span className="text-gray-400 font-normal">(İsteğe bağlı)</span>
            </label>
            <input
              type="text"
              className="f-input"
              placeholder={{
                pos: 'örn. Kasa 1, Bahçe POS',
                masa: 'örn. Bahçe Tableti, Garson 2',
                kds: 'örn. Mutfak Ekranı, Sıcak Bölüm',
                pickup: 'örn. Paket Ekranı',
                queue_screen: 'örn. Sıra TV',
                kiosk: 'örn. Kiosk 1',
                kiosk_tablet: 'örn. Kiosk Tablet 1'
              }[formData.device_type] || 'Cihaz adı girin'}
              value={formData.terminal_name || ''}
              onChange={e => setFormData({ ...formData, terminal_name: e.target.value })}
            />
          </div>

          {['pos', 'masa'].includes(formData.device_type) && (
            <>
              <div className={`flex items-center gap-2 mt-4 p-3 rounded-lg border ${hasMaster ? 'bg-gray-50 border-gray-200' : 'bg-blue-50 border-blue-200'}`}>
                <input 
                  type="checkbox" 
                  id="is_master"
                  disabled={hasMaster}
                  checked={formData.is_master}
                  onChange={e => setFormData({...formData, is_master: e.target.checked})}
                  className="w-4 h-4"
                />
                <label htmlFor="is_master" className={`text-sm font-medium ${hasMaster ? 'text-gray-400' : 'text-blue-900'}`}>
                  Ana Kasa (Master) olarak yapılandır
                </label>
                {hasMaster && (
                  <span className="text-xs text-red-500 ml-auto">Sistemde zaten bir master var</span>
                )}
              </div>

              {formData.is_master && (
                <div className="mt-4 p-4 border border-orange-200 rounded-lg bg-orange-50 space-y-3">
                  <h4 className="text-sm font-bold text-orange-950">Kuver Ayarları (Merkezi)</h4>
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      id="tracking_enabled"
                      checked={coverSettings.tracking_enabled}
                      onChange={e => setCoverSettings({ ...coverSettings, tracking_enabled: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <label htmlFor="tracking_enabled" className="text-sm font-medium text-orange-900 cursor-pointer">
                      İşletmede kuver takibi yapılacak mı?
                    </label>
                  </div>
                  
                  {!coverSettings.tracking_enabled && (
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-orange-900">Sipariş Başına Varsayılan Kuver Sayısı</label>
                      <input 
                        type="number" 
                        min="0.1" 
                        step="0.1"
                        className="f-input text-sm p-2 w-24"
                        value={coverSettings.default_count ?? 1}
                        onChange={e => setCoverSettings({ ...coverSettings, default_count: Math.max(0.1, parseFloat(e.target.value) || 1) })}
                      />
                      <p className="text-xs text-orange-800 leading-relaxed mt-1">
                        Kuver takibi kapalıyken her sipariş başına <strong>{coverSettings.default_count ?? 1}</strong> kuver kaydedilecektir. <br/>
                        Kaydedilen kuver sayısı sabit olarak <strong>%40 Kadın, %40 Erkek, %20 Çocuk</strong> oranlarıyla veritabanına yazılacaktır.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {formData.device_type === 'masa' && (
            <div className="mt-4">
              <label className="block text-sm font-medium mb-1">Bağlı Olduğu Salon</label>
              <select 
                className="f-input"
                value={(formData.config_data.allowed_zones && formData.config_data.allowed_zones[0]) || ''}
                onChange={e => {
                  const val = e.target.value
                  const zones = val ? [val] : []
                  setFormData({
                    ...formData,
                    config_data: { ...formData.config_data, allowed_zones: zones }
                  })
                }}
              >
                <option value="">Tüm Masaları Görsün</option>
                {halls.map(hall => (
                  <option key={hall.id} value={hall.name}>{hall.name}</option>
                ))}
              </select>
            </div>
          )}

          {formData.device_type === 'kds' && (
            <>
              <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
                <label className="block text-sm font-medium mb-3">Dinlenecek Sipariş Kaynakları</label>
                {sourceDevices.length === 0 ? (
                  <p className="text-sm text-gray-500">Sistemde henüz POS veya Garson cihazı bulunmuyor.</p>
                ) : (
                  <div className="space-y-2">
                    {sourceDevices.map(src => {
                      const isChecked = (formData.config_data.allowed_sources || []).includes(src.activation_code)
                      return (
                        <label key={src.id} className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-100 rounded">
                          <input 
                            type="checkbox" 
                            checked={isChecked}
                            onChange={() => toggleConfigArrayItem('allowed_sources', src.activation_code)} 
                            className="w-4 h-4"
                          />
                          <span className="text-sm font-medium">{getDeviceTypeName(src.device_type)} - {src.activation_code}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
                <p className="text-xs text-gray-400 mt-3">Hiçbiri seçilmezse, cihaz yapılandırma hatası verir veya tüm siparişleri çeker.</p>
              </div>

              <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-4">
                <h4 className="text-sm font-bold text-gray-800 border-b pb-2">Sesli Uyarı Ayarları</h4>
                
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="kds_sound_enabled"
                    checked={formData.config_data.kds_sound_enabled === true}
                    onChange={e => setConfigValue('kds_sound_enabled', e.target.checked)} 
                    className="w-4 h-4"
                  />
                  <label htmlFor="kds_sound_enabled" className="text-sm font-medium text-gray-900 cursor-pointer">
                    Yeni sipariş gelince ses çal
                  </label>
                </div>

                {formData.config_data.kds_sound_enabled && (
                  <UploadField 
                    label="Ses Dosyası Yükle"
                    hint="Yeni sipariş geldiğinde çalacak ses dosyası (.mp3, .wav vb. önerilir)"
                    value={formData.config_data.kds_sound_url || ''}
                    onChange={val => setConfigValue('kds_sound_url', val)}
                    accept="audio/*"
                    previewKind="audio"
                  />
                )}
              </div>
            </>
          )}

          {formData.device_type === 'pickup' && (
            <>
              <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
                <label className="block text-sm font-medium mb-3">Bağlı Olunan KDS (Mutfak) Cihazları</label>
                {kdsDevices.length === 0 ? (
                  <p className="text-sm text-gray-500">Sistemde henüz KDS (Mutfak) cihazı bulunmuyor.</p>
                ) : (
                  <div className="space-y-2">
                    {kdsDevices.map(kds => {
                      const isChecked = (formData.config_data.allowed_kds || []).includes(kds.activation_code)
                      return (
                        <label key={kds.id} className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-100 rounded">
                          <input 
                            type="checkbox" 
                            checked={isChecked}
                            onChange={() => toggleConfigArrayItem('allowed_kds', kds.activation_code)} 
                            className="w-4 h-4"
                          />
                          <span className="text-sm font-medium">KDS - {kds.activation_code}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-4">
                <h4 className="text-sm font-bold text-gray-800 border-b pb-2">Sesli Uyarı Ayarları</h4>
                
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="pickup_sound_enabled"
                    checked={formData.config_data.pickup_sound_enabled === true}
                    onChange={e => setConfigValue('pickup_sound_enabled', e.target.checked)} 
                    className="w-4 h-4"
                  />
                  <label htmlFor="pickup_sound_enabled" className="text-sm font-medium text-gray-900 cursor-pointer">
                    Sipariş hazır olunca ses çal
                  </label>
                </div>

                {formData.config_data.pickup_sound_enabled && (
                  <UploadField 
                    label="Ses Dosyası Yükle"
                    hint="Sipariş hazır durumuna geldiğinde çalacak ses dosyası (.mp3, .wav vb. önerilir)"
                    value={formData.config_data.pickup_sound_url || ''}
                    onChange={val => setConfigValue('pickup_sound_url', val)}
                    accept="audio/*"
                    previewKind="audio"
                  />
                )}
              </div>
            </>
          )}

          {formData.device_type === 'queue_screen' && (
            <>
              <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
                <label className="block text-sm font-medium mb-3">İlişkili Teslimat (Pickup) Cihazları</label>
                {pickupDevices.length === 0 ? (
                  <p className="text-sm text-gray-500">Sistemde henüz Teslimat (Pickup) cihazı bulunmuyor.</p>
                ) : (
                  <div className="space-y-2">
                    {pickupDevices.map(pu => {
                      const isChecked = (formData.config_data.allowed_pickups || []).includes(pu.activation_code)
                      return (
                        <label key={pu.id} className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-100 rounded">
                          <input 
                            type="checkbox" 
                            checked={isChecked}
                            onChange={() => toggleConfigArrayItem('allowed_pickups', pu.activation_code)} 
                            className="w-4 h-4"
                          />
                          <span className="text-sm font-medium">Pickup - {pu.activation_code}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
                <div className="mt-3 bg-blue-50 text-blue-800 p-2 text-xs rounded border border-blue-200">
                  Oluşturulduktan sonra listeye yansıyacak olan benzersiz URL adresini Sıra Ekranı televizyonundaki tarayıcıda açabilirsiniz.
                </div>
              </div>

              <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-4">
                <h4 className="text-sm font-bold text-gray-800 border-b pb-2">Sıra Ekranı Görsel Ayarları</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Zemin Rengi">
                    <input 
                      type="color" 
                      value={formData.config_data.queue_bg_color || '#0f172a'} 
                      onChange={e => setConfigValue('queue_bg_color', e.target.value)} 
                      className="f-input h-10 p-1 cursor-pointer"
                    />
                  </Field>

                  <Field label="Yön">
                    <select 
                      className="f-input"
                      value={formData.config_data.queue_orientation || 'landscape'}
                      onChange={e => setConfigValue('queue_orientation', e.target.value)}
                    >
                      <option value="landscape">Yatay</option>
                      <option value="portrait">Dikey</option>
                    </select>
                  </Field>
                </div>

                <UploadField 
                  label="Sıra Ekran Logosu" 
                  hint="Sıra ekranında görünen logo. (Önerilen: 512x512 px)" 
                  value={formData.config_data.queue_logo_url || ''} 
                  onChange={val => setConfigValue('queue_logo_url', val)} 
                  aspect="1 / 1" 
                  fit="contain" 
                  targetWidth={512} 
                  targetHeight={512} 
                />

                <Field label="Sıra Medya Tipi">
                  <select 
                    className="f-input"
                    value={formData.config_data.queue_media_type || 'none'}
                    onChange={e => {
                      const nextVal = e.target.value
                      setFormData({
                        ...formData,
                        config_data: {
                          ...formData.config_data,
                          queue_media_type: nextVal,
                          queue_media_url: ''
                        }
                      })
                    }}
                  >
                    <option value="none">Yok</option>
                    <option value="image">Görsel</option>
                    <option value="video">Video</option>
                  </select>
                </Field>

                {formData.config_data.queue_media_type === 'video' && (
                  <Field label="Sıra Video URL">
                    <input 
                      type="text"
                      className="f-input"
                      value={formData.config_data.queue_media_url || ''} 
                      onChange={e => setConfigValue('queue_media_url', e.target.value)} 
                      placeholder="https://..." 
                    />
                  </Field>
                )}

                {formData.config_data.queue_media_type === 'image' && (
                  <UploadField
                    label="Sıra Zemin Görseli"
                    hint={`Sıra ekranının arka plan görseli. (Önerilen: ${formData.config_data.queue_orientation === 'portrait' ? '1080x1920' : '1920x1080'} px)`}
                    value={formData.config_data.queue_media_url || ''}
                    onChange={val => setConfigValue('queue_media_url', val)}
                    aspect={formData.config_data.queue_orientation === 'portrait' ? '9 / 16' : '16 / 9'}
                    fit="cover"
                    targetWidth={formData.config_data.queue_orientation === 'portrait' ? 1080 : 1920}
                    targetHeight={formData.config_data.queue_orientation === 'portrait' ? 1920 : 1080}
                  />
                )}

                {formData.config_data.queue_media_type === 'none' && (
                  <div className="text-xs text-gray-500 bg-gray-100 p-2.5 rounded border border-gray-200">
                    Sıra ekranı için medya seçilmezse yalnızca zemin rengi ve logo ile çalışır.
                  </div>
                )}
              </div>

              <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-4">
                <h4 className="text-sm font-bold text-gray-800 border-b pb-2">Sesli Uyarı Ayarları</h4>
                
                <div className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    id="queue_sound_enabled"
                    checked={formData.config_data.queue_sound_enabled !== false}
                    onChange={e => setConfigValue('queue_sound_enabled', e.target.checked)} 
                    className="w-4 h-4"
                  />
                  <label htmlFor="queue_sound_enabled" className="text-sm font-medium text-gray-900 cursor-pointer">
                    Müşteri çağrılınca (hazır olunca) ses çal
                  </label>
                </div>

                {formData.config_data.queue_sound_enabled !== false && (
                  <UploadField 
                    label="Ses Dosyası Yükle"
                    hint="Müşteri çağrıldığında çalacak ses dosyası (.mp3, .wav vb. önerilir)"
                    value={formData.config_data.queue_sound_url || ''}
                    onChange={val => setConfigValue('queue_sound_url', val)}
                    accept="audio/*"
                    previewKind="audio"
                  />
                )}
              </div>
            </>
          )}

          <div className="pt-6 flex justify-end gap-2">
            <button className="btn-o" type="button" onClick={() => setIsModalOpen(false)}>İptal</button>
            <button className="btn-p" type="submit">{editingDevice ? "Güncelle" : "Oluştur ve Kaydet"}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium">{label}</label>
      {hint && <p className="text-xs text-gray-500 leading-normal">{hint}</p>}
      {children}
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
    if (file.type?.startsWith('audio/') || accept.includes('audio')) {
      const formData = new FormData()
      formData.append('file', file)
      const uploaded = await uploadApiFile(formData)
      onChange(buildApiUrl(uploaded.file_url))
    } else {
      onChange(await uploadFileAndGetUrl(file, targetWidth, targetHeight))
    }
  }

  const hasValue = Boolean(value)
  const fileLabel = lastFileName || (hasValue ? {
    video: 'Yüklü video',
    audio: 'Yüklü ses',
    image: 'Yüklü görsel'
  }[previewKind] || 'Yüklü dosya' : 'Dosya seçilmedi')

  const finalHint = hint || (targetWidth && targetHeight ? `Önerilen boyut: ${targetWidth}x${targetHeight} px` : '')

  return (
    <div className="space-y-2">
      <Field label={label} hint={finalHint}>
        <div />
      </Field>
      <div
        className="relative border border-dashed border-gray-300 rounded-2xl bg-gray-50 p-3"
      >
        <div className="grid grid-cols-[72px_minmax(0,1fr)] gap-3 items-center">
          {previewKind === 'audio' ? (
            <div className="w-[72px] h-[72px] rounded-xl overflow-hidden bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 flex items-center justify-center text-blue-500">
              <i className="fa-solid fa-volume-high" style={{ fontSize: '1.4rem' }} />
            </div>
          ) : (
            <button
              type="button"
              onMouseEnter={() => hasValue && setPreviewOpen(true)}
              onMouseLeave={() => setPreviewOpen(false)}
              onFocus={() => hasValue && setPreviewOpen(true)}
              onBlur={() => setPreviewOpen(false)}
              className="w-[72px] h-[72px] rounded-xl overflow-hidden bg-gradient-to-br from-gray-200 to-gray-50 border border-gray-200 p-0"
              style={{
                cursor: hasValue ? 'zoom-in' : 'default',
              }}
            >
              {hasValue ? (
                previewKind === 'video' ? (
                  <video src={value} muted playsInline className="w-full h-full object-cover block" />
                ) : (
                  <img src={value} alt={label} className="w-full h-full block" style={{ objectFit: fit }} />
                )
              ) : (
                <div className="w-full h-full grid place-items-center text-gray-400">
                  <i className={`fa-solid ${previewKind === 'video' ? 'fa-film' : 'fa-image'}`} style={{ fontSize: '1.1rem' }} />
                </div>
              )}
            </button>
          )}
          <div className="min-w-0 space-y-1">
            <div className="font-bold text-gray-900 text-sm truncate">
              {fileLabel}
            </div>
            {previewKind === 'audio' && hasValue && (
              <audio src={value} controls className="h-8 max-w-[200px] block text-xs" />
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap mt-3">
          <label htmlFor={inputId} className="btn-p py-1.5 px-3 text-xs cursor-pointer inline-flex items-center gap-1.5">
            <i className="fa-solid fa-upload" /> Dosya Yükle
          </label>
          <input id={inputId} type="file" accept={accept} onChange={handleChange} className="hidden" />
          <button type="button" className="btn-o py-1.5 px-3 text-xs" onClick={() => onChange('')}>Temizle</button>
        </div>
        {previewOpen && hasValue && previewKind !== 'audio' ? (
          <div
            onMouseEnter={() => setPreviewOpen(true)}
            onMouseLeave={() => setPreviewOpen(false)}
            className="absolute left-24 top-2 z-10 w-56 rounded-2xl border border-gray-200 bg-white p-2 shadow-xl"
          >
            <div className="w-full overflow-hidden rounded-xl bg-gray-100" style={{ aspectRatio: aspect }}>
              {previewKind === 'video' ? (
                <video src={value} autoPlay loop muted playsInline className="w-full h-full object-cover" />
              ) : (
                <img src={value} alt="Onizleme" className="w-full h-full" style={{ objectFit: fit }} />
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
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
