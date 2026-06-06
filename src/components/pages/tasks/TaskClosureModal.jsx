import { useState, useEffect, useCallback } from 'react'
import Modal from '@/components/ui/Modal'

export default function TaskClosureModal({ open, task, onClose, onSubmit }) {
  const [summary, setSummary] = useState('')
  const [files, setFiles] = useState([])
  const [images, setImages] = useState([])
  const [cost, setCost] = useState('')
  const [costCurrency, setCostCurrency] = useState('TRY')
  const [exchangeRate, setExchangeRate] = useState(1.0)
  const [exchangeRateLoading, setExchangeRateLoading] = useState(false)

  // requires_cost_input kuralı: task.rules içinden veya doğrudan task alanından okunur
  const rules = task?.rules || {}
  const requiresCost = !!(rules.requires_cost_input || task?.requires_cost_input)

  const fetchExchangeRate = useCallback(async (curr, dt) => {
    if (curr === 'TRY' || curr === 'TL') {
      setExchangeRate(1.0)
      return
    }
    setExchangeRateLoading(true)
    try {
      const apiOrigin = import.meta.env.VITE_API_URL || window.location.origin
      const response = await fetch(`${apiOrigin}/api/exchange-rate?currency=${curr}&date=${dt}`)
      const result = await response.json()
      if (result.data && result.data.rate) {
        setExchangeRate(result.data.rate)
      }
    } catch (err) {
      console.error('Exchange rate fetch failed:', err)
    } finally {
      setExchangeRateLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open && requiresCost) {
      const todayStr = new Date().toLocaleDateString('en-CA') // YYYY-MM-DD local
      fetchExchangeRate(costCurrency, todayStr)
    }
  }, [costCurrency, open, requiresCost, fetchExchangeRate])

  useEffect(() => {
    if (open) {
      setSummary('')
      setFiles([])
      setImages([])
      setCost('')
      setCostCurrency('TRY')
      setExchangeRate(1.0)
    }
  }, [open])

  const isSummaryMissing = !!task?.closure_summary_required && !summary.trim()
  const isFileMissing = !!task?.closure_file_required && files.length === 0
  const isImageMissing = !!task?.closure_image_required && images.length === 0
  const isCostMissing = requiresCost && (
    !cost || 
    isNaN(parseFloat(cost)) || 
    parseFloat(cost) < 0 || 
    (costCurrency !== 'TRY' && (!exchangeRate || isNaN(parseFloat(exchangeRate)) || parseFloat(exchangeRate) <= 0))
  )
  const isDisabled = isSummaryMissing || isFileMissing || isImageMissing || isCostMissing

  async function handleSubmit() {
    if (isDisabled) return
    await onSubmit({
      summary,
      files,
      images,
      cost: requiresCost ? parseFloat(cost) : null,
      cost_currency: requiresCost ? costCurrency : null,
      cost_exchange_rate: requiresCost ? parseFloat(exchangeRate) : null,
    })
    setSummary('')
    setFiles([])
    setImages([])
    setCost('')
    setCostCurrency('TRY')
    setExchangeRate(1.0)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 4, height: 18, background: '#10b981', borderRadius: 2 }}></span>
          <span>Görevi Tamamla</span>
        </div>
      }
      subtitle="Kapanış kurallarına göre görev kapanış bilgilerini gönder."
      footer={(
        <>
          <button type="button" className="btn-o" onClick={onClose}>Vazgeç</button>
          <button type="button" className="btn-p" onClick={handleSubmit} disabled={isDisabled} style={isDisabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}}>Gönder</button>
        </>
      )}
    >
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ fontSize: '.78rem', color: '#475569', lineHeight: 1.5 }}>
          {task?.approval_required ? 'Bu görev kapanış onayına düşecek.' : 'Bu görev doğrudan tamamlanacak.'}
        </div>

        <div>
          <label className="f-label">
            Kapanış Özeti
            {task?.closure_summary_required && <span style={{ color: '#ef4444', marginLeft: 4 }}>* (Zorunlu)</span>}
          </label>
          <textarea
            className="f-input"
            rows={5}
            value={summary}
            onChange={event => setSummary(event.target.value)}
            placeholder="Yapılan işi kısaca yaz..."
          />
        </div>

        {/* Maliyet Alanı — yalnızca requires_cost_input görev kuralı aktifse görünür */}
        {requiresCost && (
          <div style={{
            background: 'rgba(245,158,11,.06)',
            border: '1px solid rgba(245,158,11,.35)',
            borderRadius: 10,
            padding: '14px 16px'
          }}>
            <label className="f-label" style={{ color: '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="fa-solid fa-coins" style={{ color: '#f59e0b' }} />
              Bakım / Onarım Maliyeti
              <span style={{ color: '#ef4444', marginLeft: 4 }}>* (Zorunlu)</span>
            </label>
            <p style={{ fontSize: '.74rem', color: '#78350f', margin: '4px 0 10px', lineHeight: 1.4 }}>
              Bu görev bir bakım bildiriminden oluşturulmuşsa, girilen tutar ekipman geçmişine otomatik kaydedilir.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="number"
                className="f-input"
                value={cost}
                onChange={e => setCost(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                style={{ flex: 1 }}
              />
              <select
                className="f-input"
                value={costCurrency}
                onChange={e => setCostCurrency(e.target.value)}
                style={{ width: 90 }}
              >
                <option value="TRY">₺ TRY</option>
                <option value="USD">$ USD</option>
                <option value="EUR">€ EUR</option>
              </select>
            </div>
            {costCurrency !== 'TRY' && (
              <div style={{ marginTop: 10 }}>
                <label className="f-label" style={{ fontSize: '.74rem', color: '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}>
                  Döviz Kuru
                  {exchangeRateLoading && <i className="fa-solid fa-spinner fa-spin" style={{ color: '#f59e0b' }} />}
                </label>
                <input
                  type="number"
                  className="f-input"
                  value={exchangeRate}
                  onChange={e => setExchangeRate(e.target.value)}
                  placeholder="1.0000"
                  step="0.0001"
                  style={{ width: '100%' }}
                />
              </div>
            )}
            {costCurrency !== 'TRY' && cost && exchangeRate && !isNaN(parseFloat(cost)) && !isNaN(parseFloat(exchangeRate)) && (
              <div style={{ 
                marginTop: 10, 
                fontSize: '.78rem', 
                color: '#b45309', 
                fontWeight: 700,
                background: 'rgba(245,158,11,.1)',
                padding: '6px 10px',
                borderRadius: 6,
                display: 'inline-block'
              }}>
                Yaklaşık Toplam: ₺ { (parseFloat(cost) * parseFloat(exchangeRate)).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) } TL
              </div>
            )}
            {isCostMissing && cost !== '' && (
              <div style={{ fontSize: '.73rem', color: '#ef4444', marginTop: 4 }}>Geçerli bir tutar giriniz</div>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label className="f-label">
              Kapanış Dosyaları
              {task?.closure_file_required && <span style={{ color: '#ef4444', marginLeft: 4 }}>* (Zorunlu)</span>}
            </label>
            <input type="file" className="f-input" multiple onChange={event => setFiles(Array.from(event.target.files || []))} />
          </div>
          <div>
            <label className="f-label">
              Kapanış Fotoğrafları
              {task?.closure_image_required && <span style={{ color: '#ef4444', marginLeft: 4 }}>* (Zorunlu)</span>}
            </label>
            <input type="file" className="f-input" multiple accept="image/png,image/jpeg,image/webp" onChange={event => setImages(Array.from(event.target.files || []))} />
          </div>
        </div>
      </div>
    </Modal>
  )
}
