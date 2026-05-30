import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Smartphone, Monitor, Server, Tablet, Presentation } from 'lucide-react'
import { db } from '@/lib/db'
import { useToast } from '@/hooks/useToast'
import Header from '@/components/layout/Header'
import Modal from '@/components/ui/Modal'
import { useWorkspace } from '@/context/WorkspaceContext'
import { loadTableManagementCatalog } from '@/lib/posTableCatalogService'

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

  useEffect(() => {
    loadDevices()
  }, [branchId])

  useEffect(() => {
    loadHalls()
  }, [branchId])

  const generatePairKey = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase()
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
        const deviceLabel = updates.terminal_name
          ? `'${updates.terminal_name}' başarıyla güncellendi.`
          : 'Cihaz başarıyla güncellendi.'
        toast(deviceLabel, 'success')
        setEditingDevice(null)
        setFormData({ device_type: 'pos', is_master: false, terminal_name: '', config_data: {} })
        setIsModalOpen(false)
        loadDevices()
      }
      return
    }

    const generatedPairKey = generatePairKey()
    const newDevice = {
      terminal_id: crypto.randomUUID(),
      branch_id: branchId,
      device_type: formData.device_type,
      is_master: Boolean(formData.is_master),
      terminal_role: Boolean(formData.is_master) ? 'master' : 'slave',
      pair_key: generatedPairKey,
      activation_code: `SUT-${generatedPairKey}`,
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
      const deviceLabel = newDevice.terminal_name
        ? `'${newDevice.terminal_name}' başarıyla oluşturuldu.`
        : 'Cihaz başarıyla oluşturuldu.'
      toast(deviceLabel, 'success')
      setFormData({ device_type: 'pos', is_master: false, terminal_name: '', config_data: {} })
      setIsModalOpen(false)
      loadDevices()
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

      <div className="card mt-6" style={{ padding: 18 }}>
        <table className="w-full text-sm text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3">Tip</th>
              <th className="px-6 py-3">Bağlantı Anahtarı (Pair Key) / URL</th>
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
                      <a href={`/sira-ekrani/${device.pair_key}`} target="_blank" rel="noreferrer" className="text-blue-600 font-mono text-xs hover:underline">
                        {window.location.origin}/sira-ekrani/{device.pair_key}
                      </a>
                    </div>
                  ) : (
                    <span className="font-mono bg-blue-100 text-blue-800 px-2 py-1 rounded text-lg font-bold">
                      {device.pair_key}
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
            <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
              <label className="block text-sm font-medium mb-3">Dinlenecek Sipariş Kaynakları</label>
              {sourceDevices.length === 0 ? (
                <p className="text-sm text-gray-500">Sistemde henüz POS veya Garson cihazı bulunmuyor.</p>
              ) : (
                <div className="space-y-2">
                  {sourceDevices.map(src => {
                    const isChecked = (formData.config_data.allowed_sources || []).includes(src.pair_key)
                    return (
                      <label key={src.id} className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-100 rounded">
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={() => toggleConfigArrayItem('allowed_sources', src.pair_key)} 
                          className="w-4 h-4"
                        />
                        <span className="text-sm font-medium">{getDeviceTypeName(src.device_type)} - {src.pair_key}</span>
                      </label>
                    )
                  })}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-3">Hiçbiri seçilmezse, cihaz yapılandırma hatası verir veya tüm siparişleri çeker.</p>
            </div>
          )}

          {formData.device_type === 'pickup' && (
            <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
              <label className="block text-sm font-medium mb-3">Bağlı Olunan KDS (Mutfak) Cihazları</label>
              {kdsDevices.length === 0 ? (
                <p className="text-sm text-gray-500">Sistemde henüz KDS (Mutfak) cihazı bulunmuyor.</p>
              ) : (
                <div className="space-y-2">
                  {kdsDevices.map(kds => {
                    const isChecked = (formData.config_data.allowed_kds || []).includes(kds.pair_key)
                    return (
                      <label key={kds.id} className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-100 rounded">
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={() => toggleConfigArrayItem('allowed_kds', kds.pair_key)} 
                          className="w-4 h-4"
                        />
                        <span className="text-sm font-medium">KDS - {kds.pair_key}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {formData.device_type === 'queue_screen' && (
            <div className="mt-4 p-4 border border-gray-200 rounded-lg bg-gray-50">
              <label className="block text-sm font-medium mb-3">İlişkili Teslimat (Pickup) Cihazları</label>
              {pickupDevices.length === 0 ? (
                <p className="text-sm text-gray-500">Sistemde henüz Teslimat (Pickup) cihazı bulunmuyor.</p>
              ) : (
                <div className="space-y-2">
                  {pickupDevices.map(pu => {
                    const isChecked = (formData.config_data.allowed_pickups || []).includes(pu.pair_key)
                    return (
                      <label key={pu.id} className="flex items-center gap-2 cursor-pointer p-2 hover:bg-gray-100 rounded">
                        <input 
                          type="checkbox" 
                          checked={isChecked}
                          onChange={() => toggleConfigArrayItem('allowed_pickups', pu.pair_key)} 
                          className="w-4 h-4"
                        />
                        <span className="text-sm font-medium">Pickup - {pu.pair_key}</span>
                      </label>
                    )
                  })}
                </div>
              )}
              <div className="mt-3 bg-blue-50 text-blue-800 p-2 text-xs rounded border border-blue-200">
                Oluşturulduktan sonra listeye yansıyacak olan benzersiz URL adresini Sıra Ekranı televizyonundaki tarayıcıda açabilirsiniz.
              </div>
            </div>
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
