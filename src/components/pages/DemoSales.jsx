import { useMemo, useState } from 'react'
import Header from '@/components/layout/Header'
import { useToast } from '@/hooks/useToast'
import { useDemoSalesJob } from '@/hooks/useDemoSalesJob'
import { db } from '@/lib/db'
import {
  DEFAULT_DEMO_SALES_SETTINGS,
  DEMO_WEEKDAY_FIELDS,
  writeDemoSalesSettings,
  readDemoSalesSettings,
} from '@/lib/demoSalesSettings'
import {
  collectBranchContexts,
  buildMissingSalesSummary,
  resolveScanWindow,
} from '@/lib/demoSalesGenerator'
import { fetchRowsByIsoDayChunks, runBranchDayTasks } from '@/lib/demoSalesScan'

function normalizeBranchKey(branchId, branchName) {
  const id = String(branchId || '').trim()
  if (id) return `id:${id}`
  const name = String(branchName || '').trim().toLocaleLowerCase('tr')
  return name ? `name:${name}` : ''
}

function numberInputStyle() {
  return { display: 'grid', gap: 6 }
}

function formatDisplayDate(isoDay) {
  const [year, month, day] = String(isoDay || '').split('-').map(Number)
  const value = new Date(year, (month || 1) - 1, day || 1, 12, 0, 0, 0)
  return value.toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function buildDayWeightTotal(settings) {
  return DEMO_WEEKDAY_FIELDS.reduce((sum, field) => sum + (Number(settings.dayWeights?.[field.key]) || 0), 0)
}

function parseTreeSetting(row) {
  const value = row?.value
  if (!value) return []
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return []
    }
  }
  return Array.isArray(value) ? value : []
}

function sortBranches(branches) {
  return [...branches].sort((a, b) => a.branchName.localeCompare(b.branchName, 'tr'))
}

function chunkProgressText(progress) {
  if (progress.status === 'running') return `${progress.processed}/${progress.total} şube-gün işleniyor`
  if (progress.status === 'paused') return 'Duraklatıldı'
  if (progress.status === 'completed') return 'Tamamlandı'
  if (progress.status === 'error') return 'Hata'
  return 'Hazır'
}

function isRecoverableScanError(error) {
  const message = String(error?.message || '').toLowerCase()
  return (
    error?.code === 'PGRST202' ||
    error?.code === '57014' ||
    message.includes('statement timeout') ||
    message.includes('canceling statement due to statement timeout')
  )
}

function getIsoDayBounds(isoDay) {
  return {
    startAt: `${isoDay}T00:00:00+03:00`,
    endAt: `${isoDay}T23:59:59+03:00`,
  }
}

function getRowIsoDay(row) {
  if (row?.sale_day) return String(row.sale_day).slice(0, 10)
  if (row?.sale_datetime) return String(row.sale_datetime).slice(0, 10)
  return ''
}

function buildPresenceRow(branch, isoDay) {
  return {
    branch_id: branch.branchId,
    branch_name: branch.branchName,
    sale_datetime: `${isoDay}T12:00:00+03:00`,
  }
}

function buildMovementStatusRow(branch, isoDay, hasMovement) {
  return {
    branch_id: branch.branchId,
    branch_name: branch.branchName,
    sale_day: isoDay,
    sale_count: 1,
    movement_count: hasMovement ? 1 : 0,
  }
}

function formatFallbackProgress(label, progress) {
  const branchName = progress?.task?.branch?.branchName
  const isoDay = progress?.task?.isoDay || ''
  return `${label} ${progress.processed}/${progress.total}: ${branchName || '-'} / ${isoDay}`
}

function buildBranchSummaryResult({
  branches,
  salesRows,
  movementStatusRows,
  startIsoDay,
  endIsoDay,
  settings,
}) {
  const summary = buildMissingSalesSummary(branches, salesRows, startIsoDay, endIsoDay, settings)
  const branchByKey = new Map(
    branches
      .map(branch => [normalizeBranchKey(branch.branchId, branch.branchName), branch])
      .filter(([key]) => key)
  )
  const repairBranchDays = (movementStatusRows || [])
    .filter(row => Number(row?.sale_count || 0) > 0 && Number(row?.movement_count || 0) === 0)
    .map(row => {
      const branch = branchByKey.get(normalizeBranchKey(row?.branch_id, row?.branch_name))
      if (!branch) return null
      return {
        branchId: branch.branchId,
        branchName: branch.branchName,
        isoDay: String(row.sale_day || '').slice(0, 10),
      }
    })
    .filter(Boolean)

  return {
    ...summary,
    repairBranchDays,
    repairBranchDayCount: repairBranchDays.length,
    totalWorkCount: summary.missingBranchDayCount + repairBranchDays.length,
    startIsoDay,
    endIsoDay,
    branches,
  }
}

export default function DemoSales() {
  const toast = useToast()
  const { job, startJob, pauseJob, resumeJob, clearJob } = useDemoSalesJob()
  const [settings, setSettings] = useState(() => readDemoSalesSettings())
  const [scanState, setScanState] = useState({
    loading: false,
    message: '',
    error: '',
    summary: null,
    hasScanned: false,
  })

  const progress = useMemo(() => ({
    running: job?.status === 'running',
    status: job?.status || 'idle',
    processed: job?.processedBranchDays || 0,
    total: job?.totalBranchDays || 0,
    sales: job?.salesCreated || 0,
    lines: job?.linesCreated || 0,
    payments: job?.paymentsCreated || 0,
    movements: job?.movementsCreated || 0,
    repairedBranchDays: job?.repairedBranchDays || 0,
    message: job?.message || '',
    error: job?.error || '',
  }), [job])
  const todayIsoDay = useMemo(() => resolveScanWindow().endIsoDay, [])
  const activeScanWindow = useMemo(() => resolveScanWindow(settings), [settings])
  const DEMO_SALES_BASE_DATE = activeScanWindow.startIsoDay

  async function fetchSalesPresenceChunk(startIsoDay, endIsoDay) {
    const { data, error } = await db.rpc('get_sales_count_by_branch_day', {
      p_start: `${startIsoDay}T00:00:00+03:00`,
      p_end: `${endIsoDay}T23:59:59+03:00`,
    })

    if (error) throw error

    return (data || []).map(row => ({
      branch_id: row.branch_id,
      branch_name: row.branch_name,
      sale_datetime: `${row.sale_day}T12:00:00+03:00`,
      sale_count: Number(row.sale_count) || 0,
    }))
  }

  async function fetchDemoMovementStatusChunk(startIsoDay, endIsoDay) {
    const { data, error } = await db.rpc('get_demo_sales_movement_status_by_branch_day', {
      p_start: `${startIsoDay}T00:00:00+03:00`,
      p_end: `${endIsoDay}T23:59:59+03:00`,
    })

    if (error) throw error

    return data || []
  }

  async function fetchSalesPresence(startIsoDay, endIsoDay, onProgress) {
    return fetchRowsByIsoDayChunks({
      startIsoDay,
      endIsoDay,
      fetchChunk: async range => fetchSalesPresenceChunk(range.startIsoDay, range.endIsoDay),
      onProgress: chunk => {
        onProgress?.(`Satış taraması ${chunk.index}/${chunk.total}: ${chunk.startIsoDay}`)
      },
    })
  }

  async function hasDemoSalesInWindow(startIsoDay, endIsoDay) {
    const { data, error } = await db
      .from('sales')
      .select('id')
      .eq('integration_ref', 'demo-sales-tool')
      .gte('sale_datetime', `${startIsoDay}T00:00:00+03:00`)
      .lte('sale_datetime', `${endIsoDay}T23:59:59+03:00`)
      .limit(1)

    if (error) throw error
    return (data || []).length > 0
  }

  async function fetchDemoMovementStatus(startIsoDay, endIsoDay, onProgress) {
    return fetchRowsByIsoDayChunks({
      startIsoDay,
      endIsoDay,
      fetchChunk: async range => fetchDemoMovementStatusChunk(range.startIsoDay, range.endIsoDay),
      onProgress: chunk => {
        onProgress?.(`Demo hareket taraması ${chunk.index}/${chunk.total}: ${chunk.startIsoDay}`)
      },
    })
  }

  async function checkBranchDayHasDemoSales(branch, isoDay) {
    const { startAt, endAt } = getIsoDayBounds(isoDay)
    const { data, error } = await db
      .from('sales')
      .select('id')
      .eq('integration_ref', 'demo-sales-tool')
      .eq('branch_name', branch.branchName)
      .gte('sale_datetime', startAt)
      .lte('sale_datetime', endAt)
      .limit(1)

    if (error) throw error
    return (data || []).length > 0
  }

  async function checkBranchDayHasSaleMovements(branch, isoDay) {
    const { startAt, endAt } = getIsoDayBounds(isoDay)
    const { data, error } = await db
      .from('inventory_movements')
      .select('id')
      .eq('source_doc_type', 'sale')
      .eq('branch_name', branch.branchName)
      .is('deleted_at', null)
      .eq('is_cancelled', false)
      .gte('movement_at', startAt)
      .lte('movement_at', endAt)
      .limit(1)

    if (error) throw error
    return (data || []).length > 0
  }

  async function fetchBranchStatusFallback(branches, startIsoDay, endIsoDay, onProgress) {
    const rows = await runBranchDayTasks({
      branches,
      startIsoDay,
      endIsoDay,
      onProgress: progress => {
        onProgress?.(formatFallbackProgress('Güvenli tarama', progress))
      },
      worker: async ({ branch, isoDay }) => {
        const hasSales = await checkBranchDayHasDemoSales(branch, isoDay)
        let hasMovement = false

        if (hasSales) {
          hasMovement = await checkBranchDayHasSaleMovements(branch, isoDay)
        }

        return {
          branch,
          isoDay,
          hasSales,
          hasMovement,
        }
      },
    })

    return {
      salesRows: rows
        .filter(row => row.hasSales)
        .map(row => buildPresenceRow(row.branch, row.isoDay)),
      movementStatusRows: rows
        .filter(row => row.hasSales)
        .map(row => buildMovementStatusRow(row.branch, row.isoDay, row.hasMovement)),
    }
  }

  async function fetchMovementStatusFallback(branches, salesRows, onProgress) {
    const branchByKey = new Map(
      branches
        .map(branch => [normalizeBranchKey(branch.branchId, branch.branchName), branch])
        .filter(([key]) => key)
    )
    const taskMap = new Map()

    for (const row of salesRows || []) {
      const isoDay = getRowIsoDay(row)
      const branch = branchByKey.get(normalizeBranchKey(row?.branch_id, row?.branch_name))
      if (!branch || !isoDay) continue
      taskMap.set(`${normalizeBranchKey(branch.branchId, branch.branchName)}::${isoDay}`, { branch, isoDay })
    }

    const rows = await runBranchDayTasks({
      tasks: Array.from(taskMap.values()),
      onProgress: progress => {
        onProgress?.(formatFallbackProgress('Güvenli hareket taraması', progress))
      },
      worker: async ({ branch, isoDay }) => ({
        branch,
        isoDay,
        hasMovement: await checkBranchDayHasSaleMovements(branch, isoDay),
      }),
    })

    return rows.map(row => buildMovementStatusRow(row.branch, row.isoDay, row.hasMovement))
  }

  async function fetchBranchSummary(currentSettings = settings, onProgress) {
    const { startIsoDay, endIsoDay } = resolveScanWindow(currentSettings)

    onProgress?.('Şube ağacı okunuyor...')
    const { data: settingsRow, error: settingsError } = await db
      .from('settings')
      .select('value')
      .eq('key', 'company_tree')
      .single()

    if (settingsError) throw settingsError

    const tree = parseTreeSetting(settingsRow)
    const branches = sortBranches(collectBranchContexts(tree))

    let salesRows = []
    let movementStatusRows = []

    try {
      onProgress?.('Satış taraması başlatılıyor...')
      salesRows = await fetchSalesPresence(startIsoDay, endIsoDay, onProgress)
    } catch (error) {
      if (!isRecoverableScanError(error)) throw error

      onProgress?.('Hızlı tarama zaman aşımına düştü, güvenli taramaya geçiliyor...')
      const fallback = await fetchBranchStatusFallback(branches, startIsoDay, endIsoDay, onProgress)

      return buildBranchSummaryResult({
        branches,
        salesRows: fallback.salesRows,
        movementStatusRows: fallback.movementStatusRows,
        startIsoDay,
        endIsoDay,
        settings: currentSettings,
      })
    }

    onProgress?.('Demo satış kontrolü yapılıyor...')
    if (await hasDemoSalesInWindow(startIsoDay, endIsoDay)) {
      try {
        movementStatusRows = await fetchDemoMovementStatus(startIsoDay, endIsoDay, onProgress)
      } catch (error) {
        if (!isRecoverableScanError(error)) throw error

        onProgress?.('Hızlı hareket taraması zaman aşımına düştü, güvenli harekete geçiliyor...')
        movementStatusRows = await fetchMovementStatusFallback(branches, salesRows, onProgress)
      }
    } else {
      onProgress?.('Bu aralıkta demo satış yok, onarım taraması atlandı.')
    }

    return buildBranchSummaryResult({
      branches,
      salesRows,
      movementStatusRows,
      startIsoDay,
      endIsoDay,
      settings: currentSettings,
    })
  }

  async function rescan() {
    setScanState(prev => ({ ...prev, loading: true, message: 'Tarama hazırlanıyor...', error: '' }))
    try {
      const summary = await fetchBranchSummary(settings, message => {
        setScanState(prev => ({ ...prev, loading: true, message, error: '' }))
      })
      setScanState({ loading: false, message: '', error: '', summary, hasScanned: true })
    } catch (error) {
      setScanState({
        loading: false,
        message: '',
        error: error?.message || 'Eksik günler taranırken bir hata oluştu',
        summary: null,
        hasScanned: true,
      })
    }
  }

  function setField(key, value) {
    setSettings(prev => ({ ...prev, [key]: value }))
    if (key === 'baseDate') {
      setScanState(prev => ({
        ...prev,
        loading: false,
        message: '',
        error: '',
        summary: null,
        hasScanned: false,
      }))
    }
  }

  function setDayWeight(key, value) {
    setSettings(prev => ({
      ...prev,
      dayWeights: {
        ...prev.dayWeights,
        [key]: Math.max(0, Number(value) || 0),
      },
    }))
  }

  function saveSettings() {
    const next = writeDemoSalesSettings(settings)
    setSettings(next)
    toast('Demo satış ayarları kaydedildi', 'success')
  }

  function resetSettings() {
    const next = writeDemoSalesSettings(DEFAULT_DEMO_SALES_SETTINGS)
    setSettings(next)
    setScanState(prev => ({
      ...prev,
      loading: false,
      message: '',
      error: '',
      summary: null,
      hasScanned: false,
    }))
    toast('Demo satış ayarları varsayılanlara döndü', 'info')
  }

  async function generateDemoSales() {
    const totalWorkCount = Number(scanState.summary?.totalWorkCount || 0)
    if (!totalWorkCount) {
      toast('Çalışacak eksik gün veya onarım işi bulunmuyor', 'info')
      return
    }

    const confirmed = window.confirm(
      `${scanState.summary.missingBranchDayCount} eksik şube-gün ve ${scanState.summary.repairBranchDayCount || 0} onarım günü arka planda işlenecek. Devam edilsin mi?`
    )
    if (!confirmed) return

    try {
      const freshSummary = await fetchBranchSummary(settings)
      setScanState({ loading: false, message: '', error: '', summary: freshSummary, hasScanned: true })
      if (!freshSummary.totalWorkCount) {
        toast('Eksik gün veya onarım işi kalmadı', 'info')
        return
      }
      startJob({ summary: freshSummary, settings })
    } catch (error) {
      toast(error?.message || 'Demo satış kuyruğu başlatılamadı', 'error')
    }
  }

  const dayWeightTotal = useMemo(() => buildDayWeightTotal(settings), [settings])

  return (
    <div>
      <Header
        title="Demo Satış Yap"
        subtitle="Eksik günler ve eksik stok hareketleri için satış kuyruğu çalıştırın"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-o" onClick={rescan} disabled={scanState.loading || progress.running}>
              <i className="fa-solid fa-rotate-right" style={{ marginRight: 6 }} />
              Tekrar Tara
            </button>
            <button className="btn-o" onClick={resetSettings} disabled={progress.running}>Varsayılanlar</button>
            <button className="btn-p" onClick={saveSettings} disabled={progress.running}>
              <i className="fa-solid fa-floppy-disk" style={{ marginRight: 6 }} />
              Kaydet
            </button>
          </div>
        }
      />

      <div className="card" style={{ padding: 18, marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr', gap: 18 }}>
          <div>
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>Çalışma Mantığı</div>
            <div style={{ color: '#475569', lineHeight: 1.65, fontSize: '.92rem' }}>
              Bu araç <strong>{formatDisplayDate(DEMO_SALES_BASE_DATE)}</strong> tarihinden bugüne kadar tüm şubeleri tarar, eksik kalan şube-günleri
              ve stok hareketi olmayan demo satış günlerini bulur. Başlattığınız anda iş kuyruğa alınır; işlem <strong>sadece bu sayfa açık kaldığı sürece</strong> devam eder. Sekmeyi kapatırsanız işlem durur. Sunucuyu yormamak adına küçük parçacıklar halinde ilerler.
            </div>
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 14, background: '#fff' }}>
              <div style={{ fontSize: '.78rem', color: '#64748b' }}>Tarama aralığı</div>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
                {DEMO_SALES_BASE_DATE} - {scanState.summary?.endIsoDay || resolveScanWindow().endIsoDay}
              </div>
            </div>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 14, background: '#fff' }}>
              <div style={{ fontSize: '.78rem', color: '#64748b' }}>İşlem durumu</div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', marginTop: 4 }}>
                {chunkProgressText(progress)}
              </div>
              <div style={{ fontSize: '.78rem', color: '#64748b', marginTop: 4 }}>{progress.message || 'Hazır'}</div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr', gap: 18, alignItems: 'start' }}>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>Üretim Parametreleri</div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 14, marginBottom: 18 }}>
            <div style={{ ...numberInputStyle(), gridColumn: '1 / -1' }}>
              <label>Tarama baslangic tarihi</label>
              <input
                className="f-input"
                type="date"
                value={settings.baseDate}
                max={todayIsoDay}
                onChange={e => setField('baseDate', e.target.value)}
              />
              <div style={{ fontSize: '.8rem', color: '#64748b' }}>
                Bu tarihten bugune kadar eksik sube-gunleri ve demo hareket onarimlari taranir.
              </div>
            </div>
            <div style={numberInputStyle()}>
              <label>Fiş ortalaması min</label>
              <input className="f-input" type="number" value={settings.receiptAverageMin} onChange={e => setField('receiptAverageMin', e.target.value)} />
            </div>
            <div style={numberInputStyle()}>
              <label>Fiş ortalaması max</label>
              <input className="f-input" type="number" value={settings.receiptAverageMax} onChange={e => setField('receiptAverageMax', e.target.value)} />
            </div>
            <div style={numberInputStyle()}>
              <label>Fiş sayısı min</label>
              <input className="f-input" type="number" value={settings.receiptCountMin} onChange={e => setField('receiptCountMin', e.target.value)} />
            </div>
            <div style={numberInputStyle()}>
              <label>Fiş sayısı max</label>
              <input className="f-input" type="number" value={settings.receiptCountMax} onChange={e => setField('receiptCountMax', e.target.value)} />
            </div>
          </div>

          <div style={{ fontSize: '.82rem', color: '#64748b', marginTop: -4, marginBottom: 18, lineHeight: 1.6 }}>
            Günlük satış alanı ayrıca sorulmaz. Sistem her gün için satışı <strong>fiş sayısı x fiş ortalaması</strong> mantığıyla hesaplar.
          </div>

          <div style={{ display: 'grid', gap: 14, marginBottom: 18 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, color: '#0f172a' }}>
              <input type="checkbox" checked={settings.discountEnabled} onChange={e => setField('discountEnabled', e.target.checked)} />
              İndirim uygulansın
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 14, opacity: settings.discountEnabled ? 1 : 0.55 }}>
              <div style={numberInputStyle()}>
                <label>İndirim oran min %</label>
                <input className="f-input" type="number" value={settings.discountRateMin} disabled={!settings.discountEnabled} onChange={e => setField('discountRateMin', e.target.value)} />
              </div>
              <div style={numberInputStyle()}>
                <label>İndirim oran max %</label>
                <input className="f-input" type="number" value={settings.discountRateMax} disabled={!settings.discountEnabled} onChange={e => setField('discountRateMax', e.target.value)} />
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 700, color: '#0f172a' }}>
              <input type="checkbox" checked={settings.splitPaymentEnabled} onChange={e => setField('splitPaymentEnabled', e.target.checked)} />
              Parçalı ödeme kullanılsın
            </label>
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 800, color: '#0f172a' }}>Haftalık gün ağırlıkları</div>
              <div style={{ fontSize: '.82rem', fontWeight: 700, color: dayWeightTotal === 100 ? '#16a34a' : '#b45309' }}>
                Toplam: {dayWeightTotal}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
              {DEMO_WEEKDAY_FIELDS.map(field => (
                <div key={field.key} style={numberInputStyle()}>
                  <label>{field.label}</label>
                  <input
                    className="f-input"
                    type="number"
                    value={settings.dayWeights[field.key]}
                    onChange={e => setDayWeight(field.key, e.target.value)}
                  />
                </div>
              ))}
            </div>
            <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 10 }}>
              Kaydederken oranlar 100 toplam verecek şekilde normalize edilir. Üretimde haftalık dağılıma kontrollü rastgele kayma uygulanır.
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 18 }}>
          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>Tarama Özeti</div>

            {scanState.loading ? (
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ color: '#64748b' }}>Eksik günler taranıyor...</div>
                <div style={{ color: '#94a3b8', fontSize: '.82rem' }}>{scanState.message || 'Tarama sürüyor...'}</div>
              </div>
            ) : !scanState.hasScanned ? (
              <div style={{ color: '#64748b', lineHeight: 1.6 }}>
                Tarama otomatik başlatılmıyor. Veritabanı yükünü kontrollü tutmak için
                <strong> Tekrar Tara </strong>
                butonuyla manuel başlatın.
              </div>
            ) : scanState.error ? (
              <div style={{ color: '#dc2626', lineHeight: 1.6 }}>{scanState.error}</div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 10 }}>
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
                    <div style={{ fontSize: '.76rem', color: '#64748b' }}>Toplam şube</div>
                    <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0f172a' }}>{scanState.summary?.branchCount || 0}</div>
                  </div>
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
                    <div style={{ fontSize: '.76rem', color: '#64748b' }}>Taranan gün</div>
                    <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0f172a' }}>{scanState.summary?.scannedDayCount || 0}</div>
                  </div>
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
                    <div style={{ fontSize: '.76rem', color: '#64748b' }}>Eksik şube-gün</div>
                    <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#dc2626' }}>{scanState.summary?.missingBranchDayCount || 0}</div>
                  </div>
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
                    <div style={{ fontSize: '.76rem', color: '#64748b' }}>Eksik takvim günü</div>
                    <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0f172a' }}>{scanState.summary?.missingCalendarDayCount || 0}</div>
                  </div>
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
                    <div style={{ fontSize: '.76rem', color: '#64748b' }}>Onarılacak hareket günü</div>
                    <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#b45309' }}>{scanState.summary?.repairBranchDayCount || 0}</div>
                  </div>
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
                    <div style={{ fontSize: '.76rem', color: '#64748b' }}>Toplam İşlem</div>
                    <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#0f172a' }}>{scanState.summary?.totalWorkCount || 0}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {progress.status === 'running' ? (
                    <button className="btn-p" onClick={pauseJob}>
                      <i className="fa-solid fa-pause" style={{ marginRight: 6 }} />
                      İşlemi Duraklat
                    </button>
                  ) : (
                    <button className="btn-p" onClick={generateDemoSales} disabled={scanState.loading || !!scanState.error}>
                      <i className="fa-solid fa-wand-magic-sparkles" style={{ marginRight: 6 }} />
                      Üretimi Başlat
                    </button>
                  )}

                  {(progress.status === 'paused' || progress.status === 'error') && (
                    <button className="btn-o" onClick={resumeJob} disabled={!job?.queue?.length}>
                      <i className="fa-solid fa-play" style={{ marginRight: 6 }} />
                      Devam Et
                    </button>
                  )}

                  {(progress.status === 'completed' || progress.status === 'paused' || progress.status === 'error') && (
                    <button className="btn-o" onClick={clearJob}>
                      <i className="fa-solid fa-broom" style={{ marginRight: 6 }} />
                      Kuyruğu Temizle
                    </button>
                  )}
                </div>

                <div style={{ fontSize: '.8rem', color: '#dc2626', lineHeight: 1.6, fontWeight: 600 }}>
                  DİKKAT: Üretimin devam etmesi için bu sayfayı AÇIK TUTMANIZ gerekmektedir. Sayfadan ayrılırsanız işlem durur.
                  Mevcut satışı olan günler yeniden yazılmaz (eksiklik varsa üzerine eklenir), stok hareketi eksik olan günler onarılır.
                </div>
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>İlerleme</div>
            <div style={{ display: 'grid', gap: 8, fontSize: '.88rem', color: '#334155' }}>
              <div>Durum: <strong>{progress.message || 'Hazır'}</strong></div>
              <div>İşlenen şube-gün: <strong>{progress.processed}</strong> / <strong>{progress.total}</strong></div>
              <div>Oluşan satış: <strong>{progress.sales}</strong></div>
              <div>Oluşan satış satırı: <strong>{progress.lines}</strong></div>
              <div>Oluşan ödeme satırı: <strong>{progress.payments}</strong></div>
              <div>Oluşan stok hareketi: <strong>{progress.movements}</strong></div>
              <div>Onarılan gün: <strong>{progress.repairedBranchDays}</strong></div>
              {progress.error && <div style={{ color: '#dc2626' }}>Son hata: <strong>{progress.error}</strong></div>}
            </div>
          </div>

          <div className="card" style={{ padding: 18 }}>
            <div style={{ fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>Eksiği En Yüksek Şubeler</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {(scanState.summary?.topMissingBranches || []).length === 0 ? (
                <div style={{ color: '#64748b', fontSize: '.88rem' }}>Eksik şube listesi boş.</div>
              ) : (
                scanState.summary.topMissingBranches.map(row => (
                  <div key={row.branch.branchId} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
                    <div style={{ fontWeight: 700, color: '#0f172a' }}>{row.branch.branchName}</div>
                    <div style={{ color: '#64748b', fontSize: '.82rem', marginTop: 4 }}>{row.count} eksik gün</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
