import React, { useState, useEffect } from 'react';
import { db, resolveImageUrl } from '@/lib/db';
import toast from 'react-hot-toast';

const PREDEFINED_BUTTON_TYPES = [
  { id: 'kampanyalar', label: 'Kampanyalar', desc: 'Kampanyalar sayfasına gider.' },
  { id: 'siparis_ver', label: 'Sipariş Ver', desc: 'Sipariş (Paket/Masa) modalı açar.' },
  { id: 'telefon_et', label: 'Telefon Et', desc: 'Girdiğiniz numarayı arar.' },
  { id: 'kurumsal', label: 'Kurumsal', desc: 'Kurumsal bilgi veya site açar.' },
  { id: 'sosyal_medya', label: 'Sosyal Medya', desc: 'Sosyal medya hesaplarını listeler.' },
  { id: 'geri_bildirim', label: 'Geri Bildirim', desc: 'Geri bildirim sayfasını açar.' },
  { id: 'bize_ulasin', label: 'Bize Ulaşın', desc: 'WA, Mail, Telefon gibi iletişim kanallarını açar.' },
  { id: 'ozel_web', label: 'Özel Web Sitesi', desc: 'Girdiğiniz dış web sitesine yönlendirir.' },
  { id: 'ozel_uyg_ici', label: 'Özel Uygulama İçi', desc: 'Uygulama içindeki serbest bir ekrana gider.' },
];

export default function CustomerAppAdminSettings() {
  const [configId, setConfigId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Branding state
  const [branding, setBranding] = useState({
    companyName: '',
    logoUrl: '',
    backgroundImageUrl: '',
    backgroundColor: '#0f172a',
    logoAreaBackgroundColor: 'transparent',
    buttonShape: 'rounded'
  });

  // Buttons state (max 4)
  const [buttons, setButtons] = useState([
    { id: 'btn1', type: 'siparis_ver', label: 'Sipariş Ver', icon: 'fa-utensils', color: '#be185d', config: { paketServisUrl: '' } },
    { id: 'btn2', type: 'kampanyalar', label: 'Kampanyalar', icon: 'fa-bullhorn', color: '#10b981', config: {} },
    { id: 'btn3', type: 'telefon_et', label: 'Telefon Et', icon: 'fa-phone', color: '#3b82f6', config: { phone: '' } },
    { id: 'btn4', type: 'kurumsal', label: 'Kurumsal', icon: 'fa-building', color: '#f59e0b', config: { url: '', text: '' } }
  ]);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const { data, error } = await db.from('customer_app_config').select('*').eq('config_key', 'default').maybeSingle();
        if (data) {
          setConfigId(data.id);
          if (data.branding) setBranding(data.branding);
          if (data.home_buttons && data.home_buttons.length > 0) setButtons(data.home_buttons);
        }
      } catch (err) {
        console.error('Config loading error', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload = { branding, home_buttons: buttons };
      let res;
      if (configId) {
        res = await db.from('customer_app_config').update(payload).eq('id', configId);
      } else {
        res = await db.from('customer_app_config').insert({ ...payload, config_key: 'default' });
      }
      
      if (res && res.error) {
        toast.error('Ayarlar kaydedilirken bir hata oluştu: ' + res.error.message);
      } else {
        toast.success('Müşteri uygulaması ayarları başarıyla kaydedildi.');
      }
    } catch (err) {
      toast.error('Ayarlar kaydedilirken bir hata oluştu.');
    } finally {
      setIsSaving(false);
    }
  };

  const updateButton = (index, field, value) => {
    const newBtns = [...buttons];
    newBtns[index][field] = value;
    setButtons(newBtns);
  };

  const updateButtonConfig = (index, field, value) => {
    const newBtns = [...buttons];
    if (!newBtns[index].config) newBtns[index].config = {};
    newBtns[index].config[field] = value;
    setButtons(newBtns);
  };

  if (isLoading) return <div className="p-4">Yükleniyor...</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Müşteri Uygulaması Ayarları (Ana Ekran)</h1>
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="bg-blue-600 text-white px-6 py-2 rounded shadow hover:bg-blue-700 disabled:opacity-50"
        >
          {isSaving ? 'Kaydediliyor...' : 'Değişiklikleri Kaydet'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Branding Settings */}
        <div className="bg-white p-6 rounded shadow space-y-4">
          <h2 className="text-xl font-semibold mb-4 border-b pb-2">Genel Tasarım (Branding)</h2>
          
          <div>
            <label className="block text-sm font-medium mb-1">Firma Adı</label>
            <input 
              type="text" 
              className="w-full border rounded p-2"
              value={branding.companyName || ''}
              onChange={e => setBranding({...branding, companyName: e.target.value})}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Logo Yükle</label>
            <div className="flex items-center gap-4">
              {branding.logoUrl && (
                <img src={branding.logoUrl} alt="Logo" className="h-12 w-12 object-contain border rounded bg-gray-50" />
              )}
              <input 
                type="file" 
                accept="image/*"
                className="w-full border rounded p-2"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const toastId = toast.loading('Logo yükleniyor...');
                  try {
                    const formData = new FormData();
                    formData.append('file', file);
                    const { uploadApiFile } = await import('@/lib/db');
                    const uploadResult = await uploadApiFile(formData);
                    const url = typeof uploadResult === 'string' 
                      ? uploadResult 
                      : (uploadResult?.url || uploadResult?.publicUrl || uploadResult?.public_url || uploadResult?.path || uploadResult?.fileUrl || uploadResult?.file_url || '');
                    if (url) {
                      const absoluteUrl = resolveImageUrl(url);
                      setBranding({ ...branding, logoUrl: absoluteUrl });
                      toast.success('Logo yüklendi', { id: toastId });
                    } else {
                      throw new Error('Geçersiz yanıt');
                    }
                  } catch (err) {
                    toast.error('Logo yüklenemedi: ' + err.message, { id: toastId });
                  }
                }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Mevcut URL: {branding.logoUrl}</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Logo Alanı Zemin Rengi</label>
            <div className="flex items-center gap-2">
              <input 
                type="color" 
                className="w-10 h-10 border rounded cursor-pointer"
                value={branding.logoAreaBackgroundColor || '#ffffff'}
                onChange={e => setBranding({...branding, logoAreaBackgroundColor: e.target.value})}
              />
              <input 
                type="text" 
                className="flex-1 border rounded p-2"
                value={branding.logoAreaBackgroundColor || ''}
                onChange={e => setBranding({...branding, logoAreaBackgroundColor: e.target.value})}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Örn: #ffffff veya transparent</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Buton Şekli</label>
            <select
              className="w-full border rounded p-2 bg-white"
              value={branding.buttonShape || 'rounded'}
              onChange={e => setBranding({ ...branding, buttonShape: e.target.value })}
            >
              <option value="square">Kare (Square)</option>
              <option value="rounded">Yuvarlatılmış (Rounded)</option>
              <option value="pill">Tam Oval (Pill)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Sayfa Zemin Resmi Yükle</label>
            <div className="flex items-center gap-4">
              {branding.backgroundImageUrl && (
                <img src={branding.backgroundImageUrl} alt="Zemin" className="h-12 w-12 object-cover border rounded bg-gray-50" />
              )}
              <input 
                type="file" 
                accept="image/*"
                className="w-full border rounded p-2"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const toastId = toast.loading('Zemin resmi yükleniyor...');
                  try {
                    const formData = new FormData();
                    formData.append('file', file);
                    const { uploadApiFile } = await import('@/lib/db');
                    const uploadResult = await uploadApiFile(formData);
                    const url = typeof uploadResult === 'string' 
                      ? uploadResult 
                      : (uploadResult?.url || uploadResult?.publicUrl || uploadResult?.public_url || uploadResult?.path || uploadResult?.fileUrl || uploadResult?.file_url || '');
                    if (url) {
                      const absoluteUrl = resolveImageUrl(url);
                      setBranding({ ...branding, backgroundImageUrl: absoluteUrl });
                      toast.success('Zemin resmi yüklendi', { id: toastId });
                    } else {
                      throw new Error('Geçersiz yanıt');
                    }
                  } catch (err) {
                    toast.error('Zemin resmi yüklenemedi: ' + err.message, { id: toastId });
                  }
                }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">Mevcut URL: {branding.backgroundImageUrl}</p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Sayfa Zemin Rengi (Resim Yoksa)</label>
            <div className="flex items-center gap-2">
              <input 
                type="color" 
                className="w-10 h-10 border rounded cursor-pointer"
                value={branding.backgroundColor || '#0f172a'}
                onChange={e => setBranding({...branding, backgroundColor: e.target.value})}
              />
              <input 
                type="text" 
                className="flex-1 border rounded p-2"
                value={branding.backgroundColor || ''}
                onChange={e => setBranding({...branding, backgroundColor: e.target.value})}
              />
            </div>
          </div>
        </div>

        {/* Home Buttons Settings */}
        <div className="bg-white p-6 rounded shadow space-y-6 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 120px)' }}>
          <h2 className="text-xl font-semibold mb-4 border-b pb-2">Ana Ekran Butonları (4 Adet)</h2>
          <p className="text-sm text-gray-600">Mobil uygulamanın ana ekranında görünecek olan 4 butonu aşağıdan özelleştirebilirsiniz.</p>

          {buttons.map((btn, index) => (
            <div key={index} className="border p-4 rounded bg-gray-50 space-y-3 relative">
              <h3 className="font-bold text-lg absolute -top-3 left-4 bg-gray-50 px-2 text-blue-600">Buton {index + 1}</h3>
              
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div>
                  <label className="block text-sm font-medium mb-1">Buton Tipi</label>
                  <select 
                    className="w-full border rounded p-2"
                    value={btn.type}
                    onChange={e => updateButton(index, 'type', e.target.value)}
                  >
                    {PREDEFINED_BUTTON_TYPES.map(type => (
                      <option key={type.id} value={type.id}>{type.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Görünür İsim (Etiket)</label>
                  <input 
                    type="text" 
                    className="w-full border rounded p-2"
                    value={btn.label || ''}
                    onChange={e => updateButton(index, 'label', e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">İkon (örn: fa-phone)</label>
                  <input 
                    type="text" 
                    className="w-full border rounded p-2"
                    value={btn.icon || ''}
                    onChange={e => updateButton(index, 'icon', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Arka Plan Rengi</label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="color" 
                      className="w-10 h-10 border rounded cursor-pointer"
                      value={btn.color || '#3b82f6'}
                      onChange={e => updateButton(index, 'color', e.target.value)}
                    />
                    <input 
                      type="text" 
                      className="flex-1 border rounded p-2"
                      value={btn.color || ''}
                      onChange={e => updateButton(index, 'color', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* Dinamik Konfigürasyon Alanları */}
              <div className="mt-4 border-t pt-3">
                <h4 className="text-sm font-semibold mb-2">Seçilen Tipe Özel Ayarlar</h4>
                
                {btn.type === 'siparis_ver' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Paket Servis Yönlendirme Linki (URL)</label>
                    <input 
                      type="text" 
                      placeholder="https://play.google.com/..."
                      className="w-full border rounded p-2"
                      value={btn.config?.paketServisUrl || ''}
                      onChange={e => updateButtonConfig(index, 'paketServisUrl', e.target.value)}
                    />
                    <p className="text-xs text-gray-500 mt-1">Boş bırakılırsa varsayılan SuitableLive uygulamasına yönlendirilir.</p>
                  </div>
                )}

                {btn.type === 'telefon_et' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Aranacak Telefon Numarası</label>
                    <input 
                      type="text" 
                      placeholder="+905551234567"
                      className="w-full border rounded p-2"
                      value={btn.config?.phone || ''}
                      onChange={e => updateButtonConfig(index, 'phone', e.target.value)}
                    />
                  </div>
                )}

                {btn.type === 'kurumsal' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium mb-1">Kurumsal Web Sitesi (Opsiyonel)</label>
                      <input 
                        type="text" 
                        placeholder="https://sirketiniz.com"
                        className="w-full border rounded p-2"
                        value={btn.config?.url || ''}
                        onChange={e => updateButtonConfig(index, 'url', e.target.value)}
                      />
                      <p className="text-xs text-gray-500 mt-1">URL girilirse direkt site açılır. Girilmezse alttaki yazı uygulama içinde gösterilir.</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Hakkımızda Yazısı</label>
                      <textarea 
                        className="w-full border rounded p-2"
                        rows="3"
                        value={btn.config?.text || ''}
                        onChange={e => updateButtonConfig(index, 'text', e.target.value)}
                      ></textarea>
                    </div>
                  </div>
                )}

                {btn.type === 'sosyal_medya' && (
                  <div className="grid grid-cols-2 gap-2">
                    <input type="text" placeholder="Instagram URL" className="border rounded p-2 text-sm" value={btn.config?.instagram || ''} onChange={e => updateButtonConfig(index, 'instagram', e.target.value)} />
                    <input type="text" placeholder="Facebook URL" className="border rounded p-2 text-sm" value={btn.config?.facebook || ''} onChange={e => updateButtonConfig(index, 'facebook', e.target.value)} />
                    <input type="text" placeholder="Twitter/X URL" className="border rounded p-2 text-sm" value={btn.config?.twitter || ''} onChange={e => updateButtonConfig(index, 'twitter', e.target.value)} />
                    <input type="text" placeholder="TikTok URL" className="border rounded p-2 text-sm" value={btn.config?.tiktok || ''} onChange={e => updateButtonConfig(index, 'tiktok', e.target.value)} />
                  </div>
                )}

                {btn.type === 'bize_ulasin' && (
                  <div className="grid grid-cols-1 gap-2">
                    <input type="text" placeholder="WhatsApp Numarası (Örn: +90555...)" className="border rounded p-2 text-sm" value={btn.config?.whatsapp || ''} onChange={e => updateButtonConfig(index, 'whatsapp', e.target.value)} />
                    <input type="email" placeholder="E-Posta Adresi" className="border rounded p-2 text-sm" value={btn.config?.email || ''} onChange={e => updateButtonConfig(index, 'email', e.target.value)} />
                    <input type="text" placeholder="Telefon Numarası" className="border rounded p-2 text-sm" value={btn.config?.phone || ''} onChange={e => updateButtonConfig(index, 'phone', e.target.value)} />
                  </div>
                )}

                {btn.type === 'geri_bildirim' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Form ID (Opsiyonel)</label>
                    <input 
                      type="text" 
                      placeholder="Müşteri anketi form ID'si"
                      className="w-full border rounded p-2"
                      value={btn.config?.formTemplateId || ''}
                      onChange={e => updateButtonConfig(index, 'formTemplateId', e.target.value)}
                    />
                  </div>
                )}

                {btn.type === 'ozel_web' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Yönlendirilecek Dış Bağlantı (URL)</label>
                    <input 
                      type="text" 
                      placeholder="https://..."
                      className="w-full border rounded p-2"
                      value={btn.config?.url || ''}
                      onChange={e => updateButtonConfig(index, 'url', e.target.value)}
                    />
                  </div>
                )}

                {btn.type === 'ozel_uyg_ici' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Uygulama İçi Sayfa Hedefi</label>
                    <input 
                      type="text" 
                      placeholder="Örn: profile, loyalty_cards"
                      className="w-full border rounded p-2"
                      value={btn.config?.targetPage || ''}
                      onChange={e => updateButtonConfig(index, 'targetPage', e.target.value)}
                    />
                  </div>
                )}
                
                {btn.type === 'kampanyalar' && (
                  <p className="text-sm text-gray-500 italic">Bu buton tipi için ek bir ayar gerekmez. Direkt Kampanyalar sayfasına gider.</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
