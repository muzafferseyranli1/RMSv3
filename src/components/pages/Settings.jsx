import { useState } from 'react'
import Header from '@/components/layout/Header'
import { useToast } from '@/hooks/useToast'
import {
  DEFAULT_FORECAST_SETTINGS,
  readForecastSettings,
  writeForecastSettings,
} from '@/lib/forecastSettings'

const FORECAST_FIELDS = [
  {
    key: 'lookbackWeeks',
    label: 'Tahmin yaparken kaç haftalık veri analiz edilecek',
    type: 'number',
    min: 1,
    max: 12,
  },
  {
    key: 'forecastWeeks',
    label: 'İleriye dönük kaç haftalık tahmin yapılacak',
    type: 'number',
    min: 1,
    max: 8,
  },
  {
    key: 'allowFutureManualAdjustments',
    label: 'Gelecek günler için tahminlere manuel müdahale edilebilecek mi',
    type: 'checkbox',
  },
  {
    key: 'currentDayManualCutoffHour',
    label: 'Mevcut gün için en son manuel müdahale saati',
    type: 'time-hour',
  },
  {
    key: 'orderForecastGenerationHour',
    label: 'Siparis tahmini olusturma saati',
    type: 'time-hour',
  },
  {
    key: 'includeWasteRecords',
    label: 'Sipariş tahmininde zayi kayıtlarını dikkate al',
    type: 'checkbox',
    hint: 'Günlük ortalama tüketim üzerinden stok malı tahminine eklenir.',
  },
  {
    key: 'includeProvisionRecords',
    label: 'Sipariş tahmininde iaşe kayıtlarını dikkate al',
    type: 'checkbox',
    hint: 'Günlük ortalama tüketim üzerinden stok malı tahminine eklenir.',
  },
  {
    key: 'ignorePastSpecialEventDays',
    label: 'Özel etkinlik günlerini geçmişe dönük dikkate alma',
    type: 'checkbox',
  },
  {
    key: 'excludeManualEventIncreaseFromHistory',
    label: 'Özel etkinlik için manuel artırılan kısım geçmişe taşınmasın',
    type: 'checkbox',
    hint: 'Örnek: konser nedeniyle 10.000 yerine 25.000’e çıkarılan gün, sonraki hafta için 25.000 değil normal satış seviyesini baz alsın.',
  },
  {
    key: 'useLastYearData',
    label: 'Geçen yılın verilerini kullan',
    type: 'checkbox',
    hint: 'Mevsim geçişlerindeki değişim oranları ayrıca dikkate alınır.',
  },
  {
    key: 'ignorePastDiscounts',
    label: 'Tahmin yaparken geçmişte yapılan indirimleri göz ardı et',
    type: 'checkbox',
    hint: 'Tahminler güncel satış fiyatı üzerinden hesaplanır.',
  },
  {
    key: 'forecastNonRecipeStockItems',
    label: 'Reçetesiz stok malları için tahmin yap',
    type: 'checkbox',
    hint: 'Deterjan gibi reçetesiz ürünlerde gerçek envanter yerine önceki dönemin günlük ortalaması ile geçici öneri üretilir.',
  },
]

function formatHour(hour) {
  return `${String(hour).padStart(2, '0')}:00`
}

export default function Settings() {
  const toast = useToast()
  const [settings, setSettings] = useState(() => readForecastSettings())

  function setField(key, value) {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  function saveSettings() {
    const next = writeForecastSettings(settings)
    setSettings(next)
    toast('Tahmin ayarlari kaydedildi', 'success')
  }

  function resetSettings() {
    const next = writeForecastSettings(DEFAULT_FORECAST_SETTINGS)
    setSettings(next)
    toast('Varsayilan tahmin ayarlarina donuldu', 'info')
  }

  return (
    <div>
      <Header
        title="Ayarlar"
        subtitle="Tahmin sayfasinda kullanilacak parametreleri buradan yonetin"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-o" onClick={resetSettings}>Varsayilanlar</button>
            <button className="btn-p" onClick={saveSettings}>
              <i className="fa-solid fa-floppy-disk" style={{ marginRight: 6 }} />
              Kaydet
            </button>
          </div>
        }
      />

      <div className="card" style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(99,102,241,.12)', color: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="fa-solid fa-chart-line" />
          </div>
          <div>
            <div style={{ fontWeight: 800, color: '#0f172a' }}>Tahmin Ayarları</div>
            <div style={{ fontSize: '.82rem', color: '#64748b' }}>Şube İşlemleri &gt; Tahmin ekranının davranış parametreleri</div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 12 }}>
          {FORECAST_FIELDS.map(field => (
            <div key={field.key} style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 14, background: '#fff' }}>
              {field.type === 'checkbox' ? (
                <label style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={!!settings[field.key]}
                    onChange={e => setField(field.key, e.target.checked)}
                    style={{ marginTop: 3 }}
                  />
                  <span>
                    <span style={{ display: 'block', fontWeight: 700, color: '#0f172a' }}>{field.label}</span>
                    {field.hint && <span style={{ display: 'block', fontSize: '.8rem', color: '#64748b', marginTop: 4 }}>{field.hint}</span>}
                  </span>
                </label>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 180px', gap: 12, alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{field.label}</div>
                    {field.hint && <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 4 }}>{field.hint}</div>}
                  </div>
                  {field.type === 'time-hour' ? (
                    <select className="f-input" value={settings[field.key]} onChange={e => setField(field.key, parseInt(e.target.value, 10) || 0)}>
                      {Array.from({ length: 24 }, (_, hour) => (
                        <option key={hour} value={hour}>{formatHour(hour)}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="f-input"
                      type="number"
                      min={field.min}
                      max={field.max}
                      value={settings[field.key]}
                      onChange={e => setField(field.key, parseInt(e.target.value, 10) || field.min)}
                    />
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
