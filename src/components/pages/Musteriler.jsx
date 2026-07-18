import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { db } from '@/lib/db'
import { useToast } from '@/hooks/useToast'
import Header from '@/components/layout/Header'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import AddButton from '@/components/ui/AddButton'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { useWorkspace } from '@/context/WorkspaceContext'
import {
  loadLoyaltyCustomerCategoryAssignments,
  saveLoyaltyCustomerCategoryAssignments,
} from '@/lib/loyalty'
import LoyaltyReadback from '@/components/shared/LoyaltyReadback'

function fmtDateTime(d) {
  if (!d) return '-'
  return new Date(d).toLocaleString('tr-TR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function Musteriler() {
  const toast = useToast()
  const [musteriler, setMusteriler] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [viewMode, setViewMode] = useState('active')
  const [sadeceCari, setSadeceCari] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [lastLoadedAt, setLastLoadedAt] = useState('')
  const [loadError, setLoadError] = useState('')
  const [modal, setModal] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [iller, setIller] = useState([])
  const [ilceler, setIlceler] = useState({})
  const [mahalleler, setMahalleler] = useState({})

  const load = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    setLoadError('')

    try {
      const { data, error } = await db.from('musteriler').select('*').order('ad_soyad')
      if (error) throw error
      setMusteriler(data || [])
      setLastLoadedAt(new Date().toISOString())
    } catch (error) {
      const message = error?.message || 'Bilinmeyen hata'
      setLoadError(message)
      setMusteriler([])
      toast(`Musteri listesi okunamadi: ${message}`, 'error')
    } finally {
      if (silent) setRefreshing(false)
      else setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    let active = true
    db.from('tr_iller').select('id,ad').order('ad').then(({ data }) => {
      if (active) setIller(data || [])
    })
    return () => {
      active = false
    }
  }, [])

  async function softDelete(id) {
    await db.from('musteriler').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    toast('Musteri silindi', 'success')
    load({ silent: true })
  }

  async function restoreCustomer(id) {
    await db.from('musteriler').update({ deleted_at: null }).eq('id', id)
    toast('Musteri geri alindi', 'success')
    load({ silent: true })
  }

  async function cariYap(customer) {
    await db.from('musteriler').update({ cari: true }).eq('id', customer.id)
    toast('Cari musteri yapildi', 'success')
    load({ silent: true })
  }

  const stats = useMemo(() => {
    const total = musteriler.length
    const deleted = musteriler.filter(item => Boolean(item.deleted_at)).length
    const active = total - deleted
    const cari = musteriler.filter(item => item.cari && !item.deleted_at).length
    const loyalty = musteriler.filter(item => String(item.loyalty_status || '').trim()).length
    return { total, active, deleted, cari, loyalty }
  }, [musteriler])

  const filtered = useMemo(() => {
    const normalizedSearch = searchText.trim().toLocaleLowerCase('tr-TR')

    return musteriler.filter(customer => {
      const isDeleted = Boolean(customer.deleted_at)
      if (viewMode === 'active' && isDeleted) return false
      if (viewMode === 'deleted' && !isDeleted) return false
      if (sadeceCari && !customer.cari) return false
      if (!normalizedSearch) return true

      const haystack = [
        customer.ad_soyad,
        customer.telefon,
        customer.email,
        customer.sirket_adi,
        customer.external_customer_ref,
        customer.normalized_phone,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('tr-TR')

      return haystack.includes(normalizedSearch)
    })
  }, [musteriler, searchText, sadeceCari, viewMode])

  const emptyStateText = searchText
    ? 'Arama sonucu bulunamadi.'
    : viewMode === 'deleted'
      ? 'Silinmis musteri bulunamadi.'
      : viewMode === 'all'
        ? 'Bu backendde goruntulenecek musteri bulunamadi.'
        : 'Aktif musteri bulunamadi.'

  return (
    <div>
      <Header
        title="Musteriler"
        subtitle="Veritabani merkezli musteri listesi, cari hesap ve loyalty gorunurlugu"
        actions={(
          <>
            <button className="btn-o" type="button" onClick={() => load({ silent: true })} disabled={refreshing}>
              <i className={`fa-solid ${refreshing ? 'fa-spinner fa-spin' : 'fa-rotate-right'}`} style={{ marginRight: 6 }} />
              Yenile
            </button>
            <button className="btn-p" type="button" onClick={() => setModal({ type: 'form', musteri: null })}>
              <i className="fa-solid fa-plus" style={{ marginRight: 6 }} />
              Yeni Musteri
            </button>
          </>
        )}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        <StatsCard label="Toplam satir" value={stats.total} hint="Kaynak: Railway Postgres / RMSv3 API" accent="#0f172a" />
        <StatsCard label="Aktif musteri" value={stats.active} hint="deleted_at bos olan kayitlar" accent="#1d4ed8" bg="#f8fbff" />
        <StatsCard label="Silinmis musteri" value={stats.deleted} hint="deleted_at dolu olan kayitlar" accent="#b91c1c" bg="#fff7f7" />
        <StatsCard label="Cari musteri" value={stats.cari} hint="Aktif cari hesaplar" accent="#166534" bg="#f8fff9" />
      </div>

      <div className="card" style={{ padding: 14, marginBottom: 16, border: loadError ? '1px solid #fecaca' : '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '.78rem', fontWeight: 900, color: loadError ? '#b91c1c' : '#1d4ed8', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              Veri durumu
            </div>
            <div style={{ marginTop: 6, fontSize: '.88rem', color: '#334155', lineHeight: 1.6 }}>
              {loadError
                ? `Musteri tablosu okunurken hata alindi: ${loadError}`
                : stats.active === 0 && stats.deleted > 0
                  ? `Bu backendde aktif musteri gorunmuyor, ancak ${stats.deleted} silinmis kayit bulundu. "Tum" veya "Silinmis" gorunumunden kayitlari inceleyip geri alabilirsiniz.`
                  : `Liste ayni backendden toplu okunuyor. Son yenileme: ${lastLoadedAt ? fmtDateTime(lastLoadedAt) : 'heniz yok'}.`}
            </div>
          </div>
          <div style={{ fontSize: '.78rem', color: '#64748b' }}>
            Loyalty durumlu kayit: <strong style={{ color: '#0f172a' }}>{stats.loyalty}</strong>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <input
          className="f-input"
          placeholder="Isim, telefon, email, sirket veya external ref ile ara"
          value={searchText}
          onChange={event => setSearchText(event.target.value)}
          style={{ minWidth: 280, flex: '1 1 320px' }}
        />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <FilterChip active={viewMode === 'active'} icon="fa-user-check" label={`Aktif (${stats.active})`} onClick={() => setViewMode('active')} />
          <FilterChip active={viewMode === 'all'} icon="fa-users" label={`Tum (${stats.total})`} onClick={() => setViewMode('all')} />
          <FilterChip active={viewMode === 'deleted'} icon="fa-trash-can" label={`Silinmis (${stats.deleted})`} onClick={() => setViewMode('deleted')} />
          <FilterChip active={sadeceCari} icon="fa-star" label="Sadece cari" onClick={() => setSadeceCari(current => !current)} />
        </div>

        <div style={{ marginLeft: 'auto', fontSize: '.82rem', color: '#64748b', fontWeight: 700 }}>
          Gorunen kayit: {filtered.length}
        </div>
      </div>

      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '1.5rem', display: 'block', marginBottom: 10 }} />
            Yukleniyor...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <i className="fa-solid fa-users" style={{ fontSize: '2rem', color: '#e2e8f0', display: 'block', marginBottom: 10 }} />
            <p style={{ color: '#94a3b8', margin: 0 }}>{emptyStateText}</p>
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>Durum</th>
                <th>Musteri</th>
                <th>Telefon</th>
                <th>Email</th>
                <th>Adres</th>
                <th>Loyalty</th>
                <th>Borc</th>
                <th>Alacak</th>
                <th>Siparis</th>
                <th>Islemler</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(customer => {
                const isCari = !!customer.cari
                const status = getMusteriDurumMeta(customer)
                return (
                  <tr key={customer.id} style={{ opacity: customer.deleted_at ? 0.72 : 1 }}>
                    <td>
                      <div style={{ display: 'grid', gap: 6 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 999, padding: '5px 10px', background: status.bg, color: status.color, fontWeight: 800, fontSize: '.74rem' }}>
                          {status.label}
                        </span>
                        <span style={{ fontSize: '.72rem', color: '#94a3b8' }}>{status.hint}</span>
                      </div>
                    </td>

                    <td>
                      <div style={{ fontWeight: 700, color: '#1e293b' }}>{customer.ad_soyad || 'Adsiz musteri'}</div>
                      <div style={{ marginTop: 4, fontSize: '.75rem', color: '#64748b' }}>
                        {customer.sirket_adi || (isCari ? 'Cari hesap' : 'Bireysel musteri')}
                      </div>
                      {customer.external_customer_ref ? (
                        <div style={{ marginTop: 4, fontSize: '.72rem', color: '#94a3b8' }}>
                          Ref: {customer.external_customer_ref}
                        </div>
                      ) : null}
                    </td>

                    <td style={{ fontSize: '.84rem', color: '#475569', fontWeight: 600 }}>
                      {getMusteriTelefonu(customer)}
                    </td>

                    <td style={{ fontSize: '.8rem', color: customer.email ? '#475569' : '#94a3b8' }}>
                      {customer.email || 'Email yok'}
                    </td>

                    <td style={{ fontSize: '.8rem', color: '#64748b', maxWidth: 220 }}>
                      {getAdresOzet(customer)}
                    </td>

                    <td>
                      <div style={{ display: 'grid', gap: 6 }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 999,
                          padding: '5px 10px',
                          background: customer.loyalty_status ? '#f3e8ff' : '#f8fafc',
                          color: customer.loyalty_status ? '#7e22ce' : '#64748b',
                          fontWeight: 800,
                          fontSize: '.74rem',
                        }}>
                          {customer.loyalty_status || 'Yok'}
                        </span>
                        {customer.loyalty_enrolled_at ? (
                          <span style={{ fontSize: '.72rem', color: '#94a3b8' }}>{fmtDate(customer.loyalty_enrolled_at)}</span>
                        ) : null}
                      </div>
                    </td>

                    <td style={{ fontWeight: 700, color: Number(customer.toplam_borc) > 0 ? '#ef4444' : '#94a3b8' }}>
                      {isCari ? fmt(customer.toplam_borc) : '-'}
                    </td>

                    <td style={{ fontWeight: 700, color: Number(customer.toplam_alacak) > 0 ? '#22c55e' : '#94a3b8' }}>
                      {isCari ? fmt(customer.toplam_alacak) : '-'}
                    </td>

                    <td style={{ fontWeight: 600, color: '#475569' }}>
                      {customer.siparis_sayisi ?? customer.total_order_count ?? 0}
                    </td>

                    <td>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        {customer.deleted_at ? (
                          <button
                            type="button"
                            onClick={() => restoreCustomer(customer.id)}
                            style={{ padding: '5px 10px', borderRadius: 7, border: 'none', background: '#0f766e', color: '#fff', fontWeight: 700, fontSize: '.75rem', cursor: 'pointer' }}
                          >
                            Geri al
                          </button>
                        ) : (
                          <>
                            <button className="ico-btn edit" title="Duzenle" onClick={() => setModal({ type: 'form', musteri: customer })}>
                              <i className="fa-solid fa-pen" />
                            </button>

                            <button
                              onClick={() => setModal({ type: 'loyalty', musteri: customer })}
                              style={{ padding: '5px 10px', borderRadius: 7, border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 700, fontSize: '.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                            >
                              <i className="fa-solid fa-gift" style={{ fontSize: '.65rem' }} />
                              Sadakat Cuzdani
                            </button>

                            <button
                              onClick={() => setModal({ type: 'loyalty-categories', musteri: customer })}
                              style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid #ddd6fe', background: '#f5f3ff', color: '#6d28d9', fontWeight: 700, fontSize: '.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                            >
                              <i className="fa-solid fa-tags" style={{ fontSize: '.65rem' }} />
                              Kategoriler
                            </button>

                            {isCari ? (
                              <button
                                onClick={() => setModal({ type: 'cari', musteri: customer })}
                                style={{ padding: '5px 10px', borderRadius: 7, border: 'none', background: '#0ea5e9', color: '#fff', fontWeight: 700, fontSize: '.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                              >
                                <i className="fa-solid fa-chart-line" style={{ fontSize: '.65rem' }} />
                                Cari Detaylari
                              </button>
                            ) : (
                              <button
                                onClick={() => cariYap(customer)}
                                style={{ padding: '5px 10px', borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '.75rem', cursor: 'pointer' }}
                              >
                                Cari Yap
                              </button>
                            )}

                            {isCari ? (
                              <button
                                onClick={() => setModal({ type: 'odeme', musteri: customer })}
                                style={{ padding: '5px 10px', borderRadius: 7, border: 'none', background: '#22c55e', color: '#fff', fontWeight: 700, fontSize: '.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                              >
                                <i className="fa-solid fa-cash-register" style={{ fontSize: '.65rem' }} />
                                Odeme Al
                              </button>
                            ) : null}

                            <button className="ico-btn del" title="Sil" onClick={() => setConfirmDel(customer.id)}>
                              <i className="fa-solid fa-trash" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {modal?.type === 'form' ? (
        <MusteriModal
          musteri={modal.musteri}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            load({ silent: true })
          }}
          iller={iller}
          ilceler={ilceler}
          setIlceler={setIlceler}
          mahalleler={mahalleler}
          setMahalleler={setMahalleler}
        />
      ) : null}

      {modal?.type === 'cari' ? (
        <CariDetayModal
          musteri={modal.musteri}
          onClose={() => setModal(null)}
          onBorcEkle={() => setModal({ type: 'borc', musteri: modal.musteri })}
          onOdemeAl={() => setModal({ type: 'odeme', musteri: modal.musteri })}
          onHareketler={() => setModal({ type: 'hareketler', musteri: modal.musteri })}
        />
      ) : null}

      {modal?.type === 'loyalty' ? (
        <LoyaltyWalletModal musteri={modal.musteri} onClose={() => setModal(null)} />
      ) : null}

      {modal?.type === 'loyalty-categories' ? (
        <LoyaltyCategoryMembershipModal musteri={modal.musteri} onClose={() => setModal(null)} />
      ) : null}

      {modal?.type === 'borc' ? (
        <BorcEkleModal
          musteri={modal.musteri}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null)
            load({ silent: true })
          }}
        />
      ) : null}

      {modal?.type === 'hareketler' ? (
        <HareketlerModal musteri={modal.musteri} onClose={() => setModal(null)} />
      ) : null}

      {modal?.type === 'odeme' ? (
        <OdemeAlModal musteri={modal.musteri} onClose={() => setModal(null)} />
      ) : null}

      <ConfirmDialog
        open={!!confirmDel}
        message="Bu musteri silinsin mi?"
        onConfirm={() => {
          softDelete(confirmDel)
          setConfirmDel(null)
        }}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  )
}

function isSchemaMissingError(error) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('does not exist') || error?.code === 'PGRST204'
}

function getEntitlementStatusMeta(status) {
  switch (status) {
    case 'available':
      return { label: 'Kullanilabilir', bg: '#dcfce7', color: '#166534' }
    case 'reserved':
      return { label: 'Ayrildi', bg: '#dbeafe', color: '#1d4ed8' }
    case 'consumed':
      return { label: 'Kullanildi', bg: '#e2e8f0', color: '#475569' }
    case 'expired':
      return { label: 'Suresi Doldu', bg: '#fee2e2', color: '#b91c1c' }
    case 'cancelled':
      return { label: 'Iptal', bg: '#f3e8ff', color: '#7e22ce' }
    default:
      return { label: status || 'Bilinmiyor', bg: '#f1f5f9', color: '#475569' }
  }
}

function formatTargetScope(scopeType, scopeJson) {
  const scope = scopeJson && typeof scopeJson === 'object' ? scopeJson : {}
  if (scopeType === 'category') return scope.categoryName || scope.categoryCode || 'Kategori'
  if (scopeType === 'product') return scope.productName || scope.productCode || 'Urun'
  if (scopeType === 'mask') return scope.maskName || 'Maske'
  return 'Tum uygun urunler'
}

function formatRewardPayload(payload) {
  const normalized = payload && typeof payload === 'object' ? payload : {}
  const discountType = normalized.discountType
  const discountValue = parseFloat(normalized.discountValue)
  if (discountType === 'percent' && !Number.isNaN(discountValue)) return `%${discountValue} indirim`
  if (discountType === 'amount' && !Number.isNaN(discountValue)) return `${fmt(discountValue)} indirim`
  if (!Number.isNaN(discountValue) && discountValue > 0) return `${fmt(discountValue)} deger`
  return 'Hak tanimli'
}

function formatProgressType(progressType) {
  if (progressType === 'visits') return 'Ziyaret'
  if (progressType === 'stamps') return 'Damga'
  if (progressType === 'orders') return 'Siparis'
  if (progressType === 'products') return 'Urun'
  return progressType || 'Ilerleme'
}

function getTransactionStatusMeta(status) {
  switch (status) {
    case 'posted':
      return { label: 'Islendi', bg: '#dcfce7', color: '#166534' }
    case 'pending':
      return { label: 'Bekliyor', bg: '#fef3c7', color: '#92400e' }
    case 'cancelled':
      return { label: 'Iptal', bg: '#fee2e2', color: '#b91c1c' }
    case 'expired':
      return { label: 'Suresi doldu', bg: '#ede9fe', color: '#6d28d9' }
    case 'reversed':
      return { label: 'Ters kayit', bg: '#e2e8f0', color: '#475569' }
    default:
      return { label: status || 'Bilinmiyor', bg: '#f1f5f9', color: '#475569' }
  }
}

function formatWalletType(walletType) {
  if (walletType === 'points') return 'Puan'
  if (walletType === 'reward') return 'Odul'
  if (walletType === 'frequency') return 'Frekans'
  if (walletType === 'stored_value') return 'Bakiye'
  return walletType || 'Cuzdan'
}

function formatTransactionType(transactionType) {
  switch (transactionType) {
    case 'earn': return 'Puan kazanimi'
    case 'burn': return 'Puan kullanimi'
    case 'adjustment': return 'Manuel duzeltme'
    case 'expire': return 'Puan son kullanma'
    case 'refund': return 'Iade'
    case 'campaign_bonus': return 'Kampanya bonusu'
    case 'welcome_bonus': return 'Hos geldin bonusu'
    case 'birthday_bonus': return 'Dogum gunu bonusu'
    case 'frequency_step': return 'Frekans adimi'
    case 'frequency_reward': return 'Frekans odulu'
    case 'card_load': return 'Kart yukleme'
    case 'card_spend': return 'Kart harcama'
    case 'card_refund': return 'Kart iadesi'
    case 'card_adjustment': return 'Kart duzeltme'
    default: return transactionType || 'Hareket'
  }
}

function fmtNumber(value, digits = 2) {
  const numeric = Number(value || 0)
  if (Number.isNaN(numeric)) return '0'
  return numeric.toLocaleString('tr-TR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })
}

function fmtSignedNumber(value, digits = 2) {
  const numeric = Number(value || 0)
  if (Number.isNaN(numeric)) return '0'
  const sign = numeric > 0 ? '+' : ''
  return `${sign}${fmtNumber(numeric, digits)}`
}

function formatWalletBalance(wallet) {
  if (!wallet) return '0'
  if (wallet.wallet_type === 'stored_value') return fmt(wallet.current_points_balance || 0)
  return fmtNumber(wallet.current_points_balance || 0)
}

// ── Helpers ───────────────────────────────────────────────────
function fmt(n) {
  if (n == null) return '₺0,00'
  return '₺' + parseFloat(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('tr-TR')
}

// ── Adres Formu (tek adres) ───────────────────────────────────
function AdresForm({ adres, onChange, onRemove, idx, iller, ilceler, mahalleler, onIlChange, onIlceChange }) {
  return (
    <div style={{ background: '#f8fafc', borderRadius: 12, padding: '14px 16px', marginBottom: 10, border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '.8rem', fontWeight: 700, color: '#6366f1' }}>Adres {idx + 1}</span>
          <input
            className="f-input"
            placeholder="Başlık (Ev, İş…)"
            value={adres.baslik || ''}
            onChange={e => onChange({ ...adres, baslik: e.target.value })}
            style={{ width: 120, padding: '4px 8px', fontSize: '.8rem' }}
          />
        </div>
        <button type="button" className="ico-btn del" onClick={onRemove}><i className="fa-solid fa-xmark" /></button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
        <div>
          <label className="f-label">Şehir</label>
          <SearchableSelect
            value={adres.il_id || ''}
            onChange={v => onIlChange(idx, v)}
            options={iller.map(i => ({value:i.id, label:i.ad}))}
            placeholder="Seç"
          />
        </div>
        <div>
          <label className="f-label">İlçe</label>
          <SearchableSelect
            value={adres.ilce_id || ''}
            onChange={v => onIlceChange(idx, v)}
            options={(ilceler[adres.il_id] || []).map(i => ({value:i.id, label:i.ad}))}
            placeholder="Seç"
            disabled={!adres.il_id}
          />
        </div>
        <div>
          <label className="f-label">Mahalle</label>
          <SearchableSelect
            value={adres.mahalle_id || ''}
            onChange={v => onChange({ ...adres, mahalle_id: v || null })}
            options={(mahalleler[adres.ilce_id] || []).map(m => ({value:m.id, label:m.ad}))}
            placeholder="Seç"
            disabled={!adres.ilce_id}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
        <div>
          <label className="f-label">Sokak</label>
          <input className="f-input" placeholder="Sokak / Cadde" value={adres.sokak || ''} onChange={e => onChange({ ...adres, sokak: e.target.value })} />
        </div>
        <div>
          <label className="f-label">Apt No</label>
          <input className="f-input" placeholder="Apt No" value={adres.apt_no || ''} onChange={e => onChange({ ...adres, apt_no: e.target.value })} />
        </div>
        <div>
          <label className="f-label">Daire No</label>
          <input className="f-input" placeholder="Daire No" value={adres.daire_no || ''} onChange={e => onChange({ ...adres, daire_no: e.target.value })} />
        </div>
        <div>
          <label className="f-label">Kat</label>
          <input className="f-input" placeholder="Kat" value={adres.kat || ''} onChange={e => onChange({ ...adres, kat: e.target.value })} />
        </div>
      </div>

      <div style={{ marginBottom: 8 }}>
        <label className="f-label">Açıklama</label>
        <input className="f-input" placeholder="Adres açıklaması…" value={adres.aciklama || ''} onChange={e => onChange({ ...adres, aciklama: e.target.value })} />
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', cursor: 'pointer', color: '#f59e0b', fontWeight: 600 }}>
        <input type="radio" name={`birincil`} checked={!!adres.birincil} onChange={() => onChange({ ...adres, birincil: true })} />
        <i className="fa-solid fa-star" style={{ fontSize: '.72rem' }} /> Birincil Adres
      </label>
    </div>
  )
}

// ── Müşteri Formu Modal ───────────────────────────────────────
function MusteriModal({ musteri, onClose, onSaved, iller, ilceler, setIlceler, mahalleler, setMahalleler }) {
  const isNew = !musteri?.id
  const empty = {
    ad_soyad: '', cari: false, is_b2b: false, tax_office: '', musteri_tipi: 'gercek',
    sirket_adi: '', vergi_no: '', email: '', notlar: '',
    telefon: '', telefon_ulke: '+90',
    adresler: [{ baslik: 'Ev', il_id: '', ilce_id: '', mahalle_id: null, sokak: '', apt_no: '', daire_no: '', kat: '', aciklama: '', birincil: true }]
  }
  const [form, setForm] = useState(isNew ? empty : {
    ...empty, ...musteri,
    adresler: typeof musteri.adresler === 'string' ? JSON.parse(musteri.adresler || '[]') : (musteri.adresler || [])
  })
  const [saving, setSaving] = useState(false)
  const saveLockRef = useRef(false)
  const toast = useToast()

  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function loadIlceler(ilId, adresIdx) {
    if (!ilId || ilceler[ilId]) return
    const { data } = await db.from('tr_ilceler').select('id,ad').eq('il_id', ilId).order('ad')
    setIlceler(prev => ({ ...prev, [ilId]: data || [] }))
  }

  async function loadMahalleler(ilceId, adresIdx) {
    if (!ilceId || mahalleler[ilceId]) return
    const { data } = await db.from('tr_mahalleler').select('id,ad').eq('ilce_id', ilceId).order('ad')
    setMahalleler(prev => ({ ...prev, [ilceId]: data || [] }))
  }

  function handleIlChange(idx, ilId) {
    const next = form.adresler.map((a, i) => i === idx ? { ...a, il_id: ilId || '', ilce_id: '', mahalle_id: null } : a)
    setF('adresler', next)
    if (ilId) loadIlceler(ilId, idx)
  }

  function handleIlceChange(idx, ilceId) {
    const next = form.adresler.map((a, i) => i === idx ? { ...a, ilce_id: ilceId || '', mahalle_id: null } : a)
    setF('adresler', next)
    if (ilceId) loadMahalleler(ilceId, idx)
  }

  function addAdres() {
    setF('adresler', [...form.adresler, { baslik: `Adres ${form.adresler.length + 1}`, il_id: '', ilce_id: '', mahalle_id: null, sokak: '', apt_no: '', daire_no: '', kat: '', aciklama: '', birincil: false }])
  }

  function updateAdres(idx, val) {
    // birincil seçilince diğerleri false
    let next = form.adresler.map((a, i) => i === idx ? val : (val.birincil ? { ...a, birincil: false } : a))
    setF('adresler', next)
  }

  function removeAdres(idx) {
    setF('adresler', form.adresler.filter((_, i) => i !== idx))
  }

  async function save() {
    if (saving || saveLockRef.current) return
    if (!form.ad_soyad.trim()) { toast('Ad Soyad zorunlu', 'error'); return }
    saveLockRef.current = true
    setSaving(true)
    let saved = false
    try {
      let cleanPhone = form.telefon?.trim() || null
      if (cleanPhone && cleanPhone.startsWith('0')) {
        cleanPhone = cleanPhone.slice(1).trim()
      }
      let normalizedPhone = null
      if (cleanPhone) {
        let digits = cleanPhone.replace(/\D/g, '')
        const countryDigits = form.telefon_ulke ? form.telefon_ulke.replace(/\D/g, '') : '90'
        if (digits.startsWith('900')) {
          digits = '90' + digits.slice(3)
        } else if (digits.startsWith('0')) {
          digits = digits.slice(1)
        }
        if (digits.length === 10 && digits.startsWith('5')) {
          normalizedPhone = countryDigits + digits
        } else if (digits.startsWith(countryDigits)) {
          normalizedPhone = digits
        } else {
          normalizedPhone = countryDigits + digits
        }
      }

      const payload = {
        ad_soyad: form.ad_soyad.trim(),
        cari: form.cari,
        is_b2b: !!form.is_b2b,
        tax_office: form.tax_office?.trim() || null,
        musteri_tipi: form.musteri_tipi,
        sirket_adi: form.sirket_adi?.trim() || null,
        vergi_no: form.vergi_no?.trim() || null,
        email: form.email?.trim() || null,
        notlar: form.notlar?.trim() || null,
        telefon: cleanPhone,
        telefon_ulke: form.telefon_ulke,
        normalized_phone: normalizedPhone,
        adresler: JSON.stringify(form.adresler),
      }
    const { error } = isNew
      ? await db.from('musteriler').insert(payload)
      : await db.from('musteriler').update(payload).eq('id', musteri.id)
    if (error) { toast('Hata: ' + error.message, 'error'); return }
    toast(isNew ? 'Müşteri eklendi' : 'Güncellendi', 'success')
    saved = true
    onSaved()
    } finally {
      if (!saved) {
        saveLockRef.current = false
        setSaving(false)
      }
    }
  }

  return (
    <div className="modal-bg open" onClick={e => e.stopPropagation()}>
      <div className="modal-box" style={{ width: 720, maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
            {isNew ? 'Yeni Müşteri Ekle' : 'Müşteriyi Düzenle'}
          </h2>
          <button className="ico-btn" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>

        <div className="modal-body" style={{ overflowY: 'auto', flex: 1 }}>
          {/* Ad Soyad */}
          <div style={{ marginBottom: 12 }}>
            <label className="f-label">Ad Soyad <span style={{ color: '#ef4444' }}>*</span></label>
            <input className="f-input" placeholder="Ad Soyad" value={form.ad_soyad} onChange={e => setF('ad_soyad', e.target.value)} />
          </div>

          {/* Cari toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '10px 14px', background: form.cari ? '#fffbeb' : '#f8fafc', borderRadius: 10, border: `1.5px solid ${form.cari ? '#fbbf24' : '#e2e8f0'}`, cursor: 'pointer' }}
            onClick={() => setF('cari', !form.cari)}>
            <div className="tog"><div className={`tog-sl${form.cari ? ' on' : ''}`} /></div>
            <span style={{ fontSize: '.855rem', fontWeight: 600, color: form.cari ? '#92400e' : '#64748b' }}>Cari Müşteri olarak işaretle</span>
          </div>

          {/* B2B toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, padding: '10px 14px', background: form.is_b2b ? '#f5f3ff' : '#f8fafc', borderRadius: 10, border: `1.5px solid ${form.is_b2b ? '#8b5cf6' : '#e2e8f0'}`, cursor: 'pointer' }}
            onClick={() => setF('is_b2b', !form.is_b2b)}>
            <div className="tog"><div className={`tog-sl${form.is_b2b ? ' on' : ''}`} /></div>
            <span style={{ fontSize: '.855rem', fontWeight: 600, color: form.is_b2b ? '#6d28d9' : '#64748b' }}>B2B Müşteri (Toptan Alıcı) olarak işaretle</span>
          </div>

          {form.is_b2b && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12, background: '#faf5ff', padding: 12, borderRadius: 10, border: '1px solid #ddd6fe' }}>
              <div>
                <label className="f-label">Vergi Dairesi</label>
                <input className="f-input" placeholder="Örn: Kadıköy VD" value={form.tax_office || ''} onChange={e => setF('tax_office', e.target.value)} />
              </div>
              <div>
                <label className="f-label">Şirket / Ticari Unvan</label>
                <input className="f-input" placeholder="Örn: ABC Restoran Gıda A.Ş." value={form.sirket_adi || ''} onChange={e => setF('sirket_adi', e.target.value)} />
              </div>
            </div>
          )}

          {/* Cari — ek alanlar */}
          {form.cari && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label className="f-label">Müşteri Tipi</label>
                <SearchableSelect
                  value={form.musteri_tipi}
                  onChange={v => setF('musteri_tipi', v)}
                  options={[{value:'gercek',label:'Gerçek Kişi'},{value:'tuzel',label:'Tüzel Kişi'}]}
                  allowClear={false}
                />
              </div>
              <div>
                <label className="f-label">E-mail</label>
                <input className="f-input" type="email" placeholder="ornek@email.com" value={form.email || ''} onChange={e => setF('email', e.target.value)} />
              </div>
              {form.musteri_tipi === 'tuzel' && <>
                <div>
                  <label className="f-label">Şirket Adı</label>
                  <input className="f-input" placeholder="ABC Ltd. Şti." value={form.sirket_adi || ''} onChange={e => setF('sirket_adi', e.target.value)} />
                </div>
                <div>
                  <label className="f-label">Vergi Numarası</label>
                  <input className="f-input" placeholder="1234567890" value={form.vergi_no || ''} onChange={e => setF('vergi_no', e.target.value)} />
                </div>
              </>}
              <div style={{ gridColumn: '1/-1' }}>
                <label className="f-label">Notlar</label>
                <textarea className="f-input" placeholder="Müşteri hakkında notlar…" value={form.notlar || ''} onChange={e => setF('notlar', e.target.value)} rows={3} style={{ resize: 'vertical' }} />
              </div>
            </div>
          )}

          {/* Telefon */}
          <div style={{ marginBottom: 12 }}>
            <label className="f-label">Telefon Numarası</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ width: 120 }}>
                <SearchableSelect
                  value={form.telefon_ulke}
                  onChange={v => setF('telefon_ulke', v)}
                  options={[
                    {value:'+90',label:'🇹🇷 +90'},
                    {value:'+1',label:'🇺🇸 +1'},
                    {value:'+44',label:'🇬🇧 +44'},
                    {value:'+49',label:'🇩🇪 +49'},
                    {value:'+33',label:'🇫🇷 +33'},
                  ]}
                  allowClear={false}
                />
              </div>
              <input className="f-input" placeholder="5xx xxx xx xx" value={form.telefon || ''} onChange={e => setF('telefon', e.target.value)} style={{ flex: 1 }} />
            </div>
          </div>

          {/* Adresler */}
          <div style={{ marginBottom: 4 }}>
            <label className="f-label">Adresler</label>
            {form.adresler.map((adres, idx) => (
              <AdresForm key={idx} adres={adres} idx={idx}
                onChange={val => updateAdres(idx, val)}
                onRemove={() => removeAdres(idx)}
                iller={iller} ilceler={ilceler} mahalleler={mahalleler}
                onIlChange={handleIlChange} onIlceChange={handleIlceChange} />
            ))}
            <button type="button" onClick={addAdres} style={{ fontSize: '.82rem', color: '#6366f1', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, padding: '4px 0', fontWeight: 600 }}>
              <i className="fa-solid fa-plus" style={{ fontSize: '.7rem' }} /> Yeni Adres Ekle
            </button>
          </div>
        </div>

        <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-o" onClick={onClose}>İptal</button>
          <button className="btn-p" onClick={save} disabled={saving}>
            {saving ? <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} />Kaydediliyor…</> : isNew ? 'Ekle' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Cari Detayları Modal ──────────────────────────────────────
function CariDetayModal({ musteri, onClose, onBorcEkle, onOdemeAl, onHareketler }) {
  return (
    <div className="modal-bg open" onClick={e => e.stopPropagation()}>
      <div className="modal-box" style={{ width: 560 }}>
        <div className="modal-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
            {musteri.ad_soyad} — Cari Hesap Detayları
          </h2>
          <button className="ico-btn" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className="modal-body">
          {/* Borç / Alacak kartları */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
            <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ef4444' }}>{fmt(musteri.toplam_borc)}</div>
              <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 4, fontWeight: 600 }}>Toplam Borç</div>
            </div>
            <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#22c55e' }}>{fmt(musteri.toplam_alacak)}</div>
              <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 4, fontWeight: 600 }}>Toplam Alacak</div>
            </div>
          </div>

          {/* Aksiyon butonları */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
            <button onClick={onOdemeAl} style={{ background: '#22c55e', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: '.855rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="fa-solid fa-money-bill-wave" /> Ödeme Al
            </button>
            <button onClick={onBorcEkle} style={{ background: '#f59e0b', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: '.855rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="fa-solid fa-circle-plus" /> Borç Ekle
            </button>
            <button onClick={onHareketler} style={{ background: '#0ea5e9', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', fontWeight: 700, fontSize: '.855rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="fa-solid fa-clock-rotate-left" /> Hareket Geçmişi
            </button>
          </div>

          {/* Müşteri bilgileri */}
          <div style={{ background: '#f8fafc', borderRadius: 10, padding: '14px 16px', fontSize: '.855rem', lineHeight: 1.8 }}>
            <div style={{ fontWeight: 700, color: '#374151', marginBottom: 6 }}>Müşteri Bilgileri:</div>
            {musteri.telefon && <div><strong>Telefon:</strong> {musteri.telefon_ulke}{musteri.telefon}</div>}
            {musteri.email && <div><strong>E-mail:</strong> {musteri.email}</div>}
            {musteri.adresler && (() => {
              const adresler = typeof musteri.adresler === 'string' ? JSON.parse(musteri.adresler || '[]') : (musteri.adresler || [])
              const birincil = adresler.find(a => a.birincil) || adresler[0]
              return birincil ? <div><strong>Adres:</strong> {[birincil.sokak, birincil.apt_no, birincil.daire_no, birincil.aciklama].filter(Boolean).join(' ')}</div> : null
            })()}
            <div><strong>Sipariş Sayısı:</strong> {musteri.siparis_sayisi}</div>
            <div><strong>Müşteri Tipi:</strong> {musteri.musteri_tipi === 'tuzel' ? 'Tüzel Kişi' : 'Gerçek Kişi'}</div>
          </div>
        </div>
        <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-o" onClick={onClose}>Kapat</button>
        </div>
      </div>
    </div>
  )
}

// ── Manuel Borç Ekle Modal ────────────────────────────────────
// NOT: personel_adi alanı şu an boş bırakılıyor. Personel modülü eklenince
// oturum açan kullanıcının adı otomatik doldurulacak.
function LoyaltyWalletModal({ musteri, onClose }) {
  const [loading, setLoading] = useState(true)
  const [schemaReady, setSchemaReady] = useState(true)
  const [errorText, setErrorText] = useState('')
  const [missingTables, setMissingTables] = useState([])
  const [wallets, setWallets] = useState([])
  const [transactions, setTransactions] = useState([])
  const [entitlements, setEntitlements] = useState([])
  const [progressRows, setProgressRows] = useState([])
  const [programMap, setProgramMap] = useState({})
const [campaignMap, setCampaignMap] = useState({})
  const [tierMap, setTierMap] = useState({})
  const [recentSales, setRecentSales] = useState([])
  const [loadingRecentSales, setLoadingRecentSales] = useState(false)

  useEffect(() => {
    let active = true

    async function loadWallet() {
      setLoading(true)
      setSchemaReady(true)
      setErrorText('')
      setMissingTables([])

      try {
        const queryResults = await Promise.all([
          db
            .from('loyalty_wallets')
            .select('id,program_id,tier_id,wallet_type,current_points_balance,lifetime_earned_points,lifetime_burned_points,lifetime_expired_points,last_transaction_at,created_at,updated_at,metadata')
            .eq('customer_id', musteri.id)
            .order('updated_at', { ascending: false }),
          db
            .from('loyalty_transactions')
            .select('id,wallet_id,program_id,campaign_id,tier_id,wallet_type,transaction_type,status,source_channel,source_type,source_ref_id,source_ref_no,branch_name,points_delta,points_before,points_after,monetary_amount,expires_at,occurred_at,note,metadata')
            .eq('customer_id', musteri.id)
            .order('occurred_at', { ascending: false })
            .limit(40),
          db
            .from('loyalty_reward_entitlements')
            .select('id,program_id,campaign_id,entitlement_type,entitlement_status,title,description,target_scope_type,target_scope_json,reward_payload,quantity,earned_at,available_from,expires_at,consumed_at,metadata')
            .eq('customer_id', musteri.id)
            .is('deleted_at', null)
            .order('earned_at', { ascending: false }),
          db
            .from('loyalty_frequency_progress')
            .select('id,program_id,campaign_id,progress_type,current_count,target_count,completed_cycles,last_qualified_at,metadata,updated_at')
            .eq('customer_id', musteri.id)
            .is('deleted_at', null)
            .order('updated_at', { ascending: false }),
        ])

        const [
          { data: walletRows, error: walletError },
          { data: transactionRows, error: transactionError },
          { data: entitlementRows, error: entitlementError },
          { data: progressData, error: progressError },
        ] = queryResults

        const nextMissingTables = []
        const nonSchemaErrors = []
        if (walletError) {
          if (isSchemaMissingError(walletError)) nextMissingTables.push('loyalty_wallets')
          else nonSchemaErrors.push(`loyalty_wallets: ${walletError.message || 'okunamadi'}`)
        }
        if (transactionError) {
          if (isSchemaMissingError(transactionError)) nextMissingTables.push('loyalty_transactions')
          else nonSchemaErrors.push(`loyalty_transactions: ${transactionError.message || 'okunamadi'}`)
        }
        if (entitlementError) {
          if (isSchemaMissingError(entitlementError)) nextMissingTables.push('loyalty_reward_entitlements')
          else nonSchemaErrors.push(`loyalty_reward_entitlements: ${entitlementError.message || 'okunamadi'}`)
        }
        if (progressError) {
          if (isSchemaMissingError(progressError)) nextMissingTables.push('loyalty_frequency_progress')
          else nonSchemaErrors.push(`loyalty_frequency_progress: ${progressError.message || 'okunamadi'}`)
        }

        const nextWallets = walletRows || []
        const nextTransactions = transactionRows || []
        const nextEntitlements = entitlementRows || []
        const nextProgress = progressData || []
        const programIds = [...new Set([
          ...nextWallets.map(row => row.program_id).filter(Boolean),
          ...nextTransactions.map(row => row.program_id).filter(Boolean),
          ...nextEntitlements.map(row => row.program_id).filter(Boolean),
          ...nextProgress.map(row => row.program_id).filter(Boolean),
        ])]
        const campaignIds = [...new Set([
          ...nextTransactions.map(row => row.campaign_id).filter(Boolean),
          ...nextEntitlements.map(row => row.campaign_id).filter(Boolean),
          ...nextProgress.map(row => row.campaign_id).filter(Boolean),
        ])]
        const tierIds = [...new Set([
          ...nextWallets.map(row => row.tier_id).filter(Boolean),
          ...nextTransactions.map(row => row.tier_id).filter(Boolean),
        ])]

        const [programLookup, campaignLookup, tierLookup] = await Promise.all([
          programIds.length
            ? db.from('loyalty_programs').select('id,name').in('id', programIds).is('deleted_at', null)
            : Promise.resolve({ data: [], error: null }),
          campaignIds.length
            ? db.from('loyalty_campaigns').select('id,name').in('id', campaignIds).is('deleted_at', null)
            : Promise.resolve({ data: [], error: null }),
          tierIds.length
            ? db.from('loyalty_tiers').select('id,name').in('id', tierIds).is('deleted_at', null)
            : Promise.resolve({ data: [], error: null }),
        ])

        if (programLookup.error) {
          if (isSchemaMissingError(programLookup.error)) nextMissingTables.push('loyalty_programs')
          else nonSchemaErrors.push(`loyalty_programs: ${programLookup.error.message || 'okunamadi'}`)
        }
        if (campaignLookup.error) {
          if (isSchemaMissingError(campaignLookup.error)) nextMissingTables.push('loyalty_campaigns')
          else nonSchemaErrors.push(`loyalty_campaigns: ${campaignLookup.error.message || 'okunamadi'}`)
        }
        if (tierLookup.error) {
          if (isSchemaMissingError(tierLookup.error)) nextMissingTables.push('loyalty_tiers')
          else nonSchemaErrors.push(`loyalty_tiers: ${tierLookup.error.message || 'okunamadi'}`)
        }
        if (!active) return

        setSchemaReady(nextMissingTables.length === 0)
        setMissingTables([...new Set(nextMissingTables)])
        setWallets(nextWallets)
        setTransactions(nextTransactions)
        setEntitlements(nextEntitlements)
        setProgressRows(nextProgress)
setProgramMap(Object.fromEntries((programLookup.data || []).map(row => [row.id, row.name])))
        setCampaignMap(Object.fromEntries((campaignLookup.data || []).map(row => [row.id, row.name])))
        setTierMap(Object.fromEntries((tierLookup.data || []).map(row => [row.id, row.name])))
        setErrorText(nonSchemaErrors.join(' | '))

        // Recent sales loyalty readback'lerini yükle
        if (!active) return
        setLoadingRecentSales(true)
        try {
          const { data: salesData } = await db
            .from('satislar')
            .select('id, created_at, loyalty_snapshot')
            .eq('musteri_id', musteri.id)
            .not('loyalty_snapshot', 'is', null)
            .order('created_at', { ascending: false })
            .limit(10)
          if (active) setRecentSales(salesData || [])
        } catch (err) {
          console.warn('Recent sales loyalty readback yuklenemedi:', err?.message)
          if (active) setRecentSales([])
        } finally {
          if (active) setLoadingRecentSales(false)
        }
      } catch (error) {
        if (!active) return
        setSchemaReady(false)
        setErrorText(error?.message || 'Sadakat cuzdani okunamadi')
        setMissingTables([])
        setWallets([])
        setTransactions([])
        setEntitlements([])
        setProgressRows([])
      } finally {
        if (active) setLoading(false)
      }
    }

    loadWallet()
    return () => { active = false }
  }, [musteri.id])

  const walletCount = wallets.length
  const pointsBalance = wallets
    .filter(item => item.wallet_type === 'points')
    .reduce((sum, item) => sum + Number(item.current_points_balance || 0), 0)
  const availableCount = entitlements.filter(item => item.entitlement_status === 'available').length
  const activeProgressCount = progressRows.filter(item => parseInt(item.target_count || 0, 10) > 0).length

  return (
    <div className="modal-bg open" onClick={e => e.stopPropagation()}>
      <div className="modal-box" style={{ width: 'min(96vw, 980px)', maxHeight: '88vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
            {musteri.ad_soyad} - Sadakat Cuzdani
          </h2>
          <button className="ico-btn" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className="modal-body" style={{ overflowY: 'auto', display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#0f766e' }}>{walletCount}</div>
              <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 4, fontWeight: 600 }}>Cuzdan</div>
            </div>
            <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#2563eb' }}>{fmtNumber(pointsBalance)}</div>
              <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 4, fontWeight: 600 }}>Puan Bakiyesi</div>
            </div>
            <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#7c3aed' }}>{transactions.length}</div>
              <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 4, fontWeight: 600 }}>Hareket</div>
            </div>
            <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#be185d' }}>{availableCount}</div>
              <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 4, fontWeight: 600 }}>Kullanilabilir Hak</div>
            </div>
            <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: '16px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#92400e' }}>{activeProgressCount}</div>
              <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 4, fontWeight: 600 }}>Aktif Birikim</div>
            </div>
          </div>

          {!schemaReady && (
            <div style={{ background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412', borderRadius: 12, padding: '12px 14px', fontSize: '.85rem', lineHeight: 1.6 }}>
              Bu ekranda sadece okunabilen loyalty tablolari gosteriliyor. Eksik veya hazir olmayan tablo: {(missingTables || []).join(', ') || 'bilinmiyor'}.
            </div>
          )}

          {errorText && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 12, padding: '12px 14px', fontSize: '.85rem' }}>
              {errorText}
            </div>
          )}

          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>Cuzdanlar ve Bakiyeler</div>
                <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 4 }}>Her program tipine ait bakiye, toplam kazanma ve tuketim degerleri burada gorunur.</div>
              </div>
              <div style={{ padding: 16 }}>
                {loading ? (
                  <div style={{ color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>
                    <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
                    Yukleniyor...
                  </div>
                ) : wallets.length === 0 ? (
                  <div style={{ color: '#94a3b8', textAlign: 'center', padding: '8px 0' }}>Bu musteride aktif wallet kaydi bulunamadi.</div>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {wallets.map(wallet => (
                      <div key={wallet.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', background: '#fff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                          <div>
                            <div style={{ fontWeight: 800, color: '#0f172a' }}>
                              {formatWalletType(wallet.wallet_type)} Cuzdani
                            </div>
                            <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 4 }}>
                              {programMap[wallet.program_id] || 'Programsiz'}{wallet.tier_id ? ` / ${tierMap[wallet.tier_id] || wallet.tier_id}` : ''}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: wallet.wallet_type === 'stored_value' ? '#0f766e' : '#2563eb' }}>
                              {formatWalletBalance(wallet)}
                            </div>
                            <div style={{ fontSize: '.75rem', color: '#64748b', marginTop: 4 }}>Mevcut bakiye</div>
                          </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 10, marginTop: 12, fontSize: '.78rem', color: '#475569' }}>
                          <div><strong>Toplam Kazanim:</strong> {wallet.wallet_type === 'stored_value' ? fmt(wallet.lifetime_earned_points || 0) : fmtNumber(wallet.lifetime_earned_points || 0)}</div>
                          <div><strong>Tuketilen:</strong> {wallet.wallet_type === 'stored_value' ? fmt(wallet.lifetime_burned_points || 0) : fmtNumber(wallet.lifetime_burned_points || 0)}</div>
                          <div><strong>Gecerlilik Kaybi:</strong> {wallet.wallet_type === 'stored_value' ? fmt(wallet.lifetime_expired_points || 0) : fmtNumber(wallet.lifetime_expired_points || 0)}</div>
                          <div><strong>Son Hareket:</strong> {fmtDateTime(wallet.last_transaction_at)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>Hareket Gecmisi</div>
                <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 4 }}>Puan kazanimi, harcama, bonus ve duzeltme hareketleri burada listelenir.</div>
              </div>
              <div style={{ padding: 16 }}>
                {loading ? (
                  <div style={{ color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>
                    <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
                    Yukleniyor...
                  </div>
                ) : transactions.length === 0 ? (
                  <div style={{ color: '#94a3b8', textAlign: 'center', padding: '8px 0' }}>Bu musteride wallet hareketi bulunamadi.</div>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {transactions.map(item => {
                      const status = getTransactionStatusMeta(item.status)
                      const delta = Number(item.points_delta || 0)
                      const deltaColor = delta > 0 ? '#166534' : delta < 0 ? '#b91c1c' : '#475569'
                      return (
                        <div key={item.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', background: '#fff' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 800, color: '#0f172a' }}>{formatTransactionType(item.transaction_type)}</div>
                              <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 4 }}>
                                {programMap[item.program_id] || 'Programsiz'}{item.campaign_id ? ` / ${campaignMap[item.campaign_id] || item.campaign_id}` : ''}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                              <span style={{ padding: '4px 10px', borderRadius: 999, background: status.bg, color: status.color, fontSize: '.74rem', fontWeight: 800 }}>
                                {status.label}
                              </span>
                              <div style={{ fontWeight: 900, color: deltaColor, fontSize: '.95rem' }}>
                                {item.wallet_type === 'stored_value' ? fmtSignedNumber(item.monetary_amount || delta) : fmtSignedNumber(delta)}
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 10, marginTop: 12, fontSize: '.78rem', color: '#475569' }}>
                            <div><strong>Cuzdan Tipi:</strong> {formatWalletType(item.wallet_type)}</div>
                            <div><strong>Kaynak:</strong> {item.source_channel || item.source_type || 'manuel'}</div>
                            <div><strong>Sube:</strong> {item.branch_name || 'Genel'}</div>
                            <div><strong>Zaman:</strong> {fmtDateTime(item.occurred_at)}</div>
                            <div><strong>Once:</strong> {item.wallet_type === 'stored_value' ? fmt(item.points_before || 0) : fmtNumber(item.points_before || 0)}</div>
                            <div><strong>Sonra:</strong> {item.wallet_type === 'stored_value' ? fmt(item.points_after || 0) : fmtNumber(item.points_after || 0)}</div>
                            <div><strong>Parasal Tutar:</strong> {Number(item.monetary_amount || 0) !== 0 ? fmt(item.monetary_amount || 0) : '0'}</div>
                            <div><strong>Ref:</strong> {item.source_ref_no || item.source_ref_id || item.note || '-'}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>Kullanilabilir Haklar</div>
                <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 4 }}>Bedava urun, kupon benzeri haklar ve bekleyen oduller burada gorunur.</div>
              </div>
              <div style={{ padding: 16 }}>
                {loading ? (
                  <div style={{ color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>
                    <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
                    Yukleniyor...
                  </div>
                ) : entitlements.length === 0 ? (
                  <div style={{ color: '#94a3b8', textAlign: 'center', padding: '8px 0' }}>Bu musteride bekleyen hak bulunamadi.</div>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {entitlements.map(item => {
                      const status = getEntitlementStatusMeta(item.entitlement_status)
                      return (
                        <div key={item.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', background: '#fff' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 800, color: '#0f172a' }}>{item.title || 'Sadakat Hakki'}</div>
                              <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 4 }}>
                                {item.description || `${formatTargetScope(item.target_scope_type, item.target_scope_json)} icin ${formatRewardPayload(item.reward_payload)}`}
                              </div>
                            </div>
                            <span style={{ padding: '4px 10px', borderRadius: 999, background: status.bg, color: status.color, fontSize: '.74rem', fontWeight: 800, whiteSpace: 'nowrap' }}>
                              {status.label}
                            </span>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10, marginTop: 12, fontSize: '.78rem', color: '#475569' }}>
                            <div><strong>Program:</strong> {programMap[item.program_id] || item.program_id || '-'}</div>
                            <div><strong>Kampanya:</strong> {campaignMap[item.campaign_id] || item.campaign_id || '-'}</div>
                            <div><strong>Miktar:</strong> {item.quantity || 0}</div>
                            <div><strong>Hedef:</strong> {formatTargetScope(item.target_scope_type, item.target_scope_json)}</div>
                            <div><strong>Kazanim:</strong> {fmtDateTime(item.earned_at)}</div>
                            <div><strong>Son Kullanma:</strong> {fmtDateTime(item.expires_at)}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>Birikim ve Ilerleme</div>
                <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 4 }}>5 kahve al 1 bedava gibi ilerleme bazli kampanyalar burada takip edilir.</div>
              </div>
              <div style={{ padding: 16 }}>
                {loading ? (
                  <div style={{ color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>
                    <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
                    Yukleniyor...
                  </div>
                ) : progressRows.length === 0 ? (
                  <div style={{ color: '#94a3b8', textAlign: 'center', padding: '8px 0' }}>Bu musteride aktif ilerleme kaydi bulunamadi.</div>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {progressRows.map(item => {
                      const current = parseInt(item.current_count || 0, 10)
                      const target = parseInt(item.target_count || 0, 10)
                      const progressRatio = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0
                      return (
                        <div key={item.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', background: '#fff' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                            <div>
                              <div style={{ fontWeight: 800, color: '#0f172a' }}>{campaignMap[item.campaign_id] || programMap[item.program_id] || 'Frekans Kampanyasi'}</div>
                              <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 4 }}>
                                {formatProgressType(item.progress_type)} birikimi
                              </div>
                            </div>
                            <div style={{ fontWeight: 800, color: '#7c3aed', whiteSpace: 'nowrap' }}>
                              {current} / {target || 0}
                            </div>
                          </div>
                          <div style={{ height: 10, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden', marginTop: 12 }}>
                            <div style={{ width: `${progressRatio}%`, height: '100%', background: 'linear-gradient(90deg, #8b5cf6, #06b6d4)' }} />
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10, marginTop: 12, fontSize: '.78rem', color: '#475569' }}>
                            <div><strong>Tamamlanan Cevrim:</strong> {item.completed_cycles || 0}</div>
                            <div><strong>Son Esik:</strong> {fmtDateTime(item.last_qualified_at)}</div>
<div><strong>Program:</strong> {programMap[item.program_id] || item.program_id || '-'}</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* SIPARIS LOYALTY READBACK GECMISI */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 800, color: '#0f172a' }}>Siparis Sadakat Gecmisi</div>
                <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 4 }}>Son siparislerde uygulanan sadakat bilgileri ve puan kullanimi</div>
              </div>
              <div style={{ padding: 16 }}>
                {loadingRecentSales ? (
                  <div style={{ color: '#94a3b8', textAlign: 'center', padding: '12px 0' }}>
                    <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
                    Yukleniyor...
                  </div>
                ) : recentSales.length === 0 ? (
                  <div style={{ color: '#94a3b8', textAlign: 'center', padding: '8px 0' }}>
                    Bu musteride siparis sadakat gecmisi bulunamadi.
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 10 }}>
                    {recentSales.map(sale => {
                      let snapshot = sale.loyalty_snapshot
                      if (typeof snapshot === 'string') {
                        try { snapshot = JSON.parse(snapshot) } catch { snapshot = null }
                      }
                      if (!snapshot) return null
                      return (
                        <div key={sale.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 0, overflow: 'hidden', background: '#fff' }}>
                          <div style={{ background: '#f8fafc', padding: '10px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '.8rem', fontWeight: 700, color: '#475569' }}>
                              #{String(sale.id).slice(-6)} — {fmtDateTime(sale.created_at)}
                            </span>
                          </div>
                          <div style={{ padding: 12 }}>
                            <LoyaltyReadback loyaltySnapshot={snapshot} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button className="btn-o" onClick={onClose}>Kapat</button>
        </div>
      </div>
    </div>
  )
}

function LoyaltyCategoryMembershipModal({ musteri, onClose }) {
  const toast = useToast()
  const workspace = useWorkspace()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [schemaReady, setSchemaReady] = useState(true)
  const [databaseUnavailable, setDatabaseUnavailable] = useState(false)
  const [storageModeLabel, setStorageModeLabel] = useState('Production Tables')
  const [errorText, setErrorText] = useState('')
  const [categories, setCategories] = useState([])
  const [selectedCategoryIds, setSelectedCategoryIds] = useState([])

  function resolveStorageModeLabel(result) {
    if (result?.fallbackMode === 'musteriler.tags') return 'Musteriler.tags'
    if (result?.schemaReady) return 'Production Tables'
    return 'Database Unavailable'
  }

  useEffect(() => {
    let active = true

    async function loadMembership() {
      setLoading(true)
      setErrorText('')

      try {
        const result = await loadLoyaltyCustomerCategoryAssignments({
          scope: workspace.scope,
          branchId: workspace.branchId,
          branchName: workspace.branchName,
        }, musteri.id)

        if (!active) return

        setSchemaReady(result.schemaReady)
        setDatabaseUnavailable(Boolean(result.databaseUnavailable))
        setStorageModeLabel(resolveStorageModeLabel(result))
        setCategories(result.categories || [])
        setSelectedCategoryIds(result.selectedCategoryIds || [])
      } catch (error) {
        if (!active) return
        setErrorText(error?.message || 'Musteri kategorileri yuklenemedi')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadMembership()
    return () => { active = false }
  }, [musteri.id, workspace.scope, workspace.branchId, workspace.branchName])

  function toggleCategory(categoryId) {
    setSelectedCategoryIds(current => (
      current.includes(categoryId)
        ? current.filter(id => id !== categoryId)
        : [...current, categoryId]
    ))
  }

  async function saveAll() {
    setSaving(true)
    try {
      const result = await saveLoyaltyCustomerCategoryAssignments({
        scope: workspace.scope,
        branchId: workspace.branchId,
        branchName: workspace.branchName,
      }, musteri.id, selectedCategoryIds)

      setSchemaReady(result.schemaReady)
      setDatabaseUnavailable(false)
      setStorageModeLabel(resolveStorageModeLabel(result))
      setSelectedCategoryIds(result.categoryIds || selectedCategoryIds)
      toast('Musteri kategori atamalari kaydedildi', 'success')
    } catch (error) {
      toast(error?.message || 'Musteri kategori atamalari kaydedilemedi', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-bg open" onClick={e => e.stopPropagation()}>
      <div className="modal-box" style={{ width: 'min(92vw, 680px)', maxHeight: '86vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="modal-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
              {musteri.ad_soyad} - Musteri Kategorileri
            </h2>
            <div style={{ marginTop: 4, fontSize: '.8rem', color: '#64748b' }}>
              Kampanya hedeflemelerinde kullanilacak musteri kategori uyeliklerini burada yonetin.
            </div>
          </div>
          <button className="ico-btn" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>

        <div className="modal-body" style={{ overflowY: 'auto', display: 'grid', gap: 14, flex: 1, minHeight: 0, overscrollBehavior: 'contain' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
            <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#6d28d9' }}>{selectedCategoryIds.length}</div>
              <div style={{ marginTop: 4, fontSize: '.8rem', color: '#64748b', fontWeight: 600 }}>Secili Kategori</div>
            </div>
            <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0f766e' }}>{categories.length}</div>
              <div style={{ marginTop: 4, fontSize: '.8rem', color: '#64748b', fontWeight: 600 }}>Aktif Kategori</div>
            </div>
            <div style={{ background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: '.95rem', fontWeight: 800, color: schemaReady ? '#166534' : '#9a3412' }}>
                {storageModeLabel}
              </div>
              <div style={{ marginTop: 4, fontSize: '.8rem', color: '#64748b', fontWeight: 600 }}>Kayit Modu</div>
            </div>
          </div>

          {storageModeLabel === 'Musteriler.tags' ? (
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: 12, padding: '12px 14px', fontSize: '.84rem', lineHeight: 1.6 }}>
              Bu ortamda musteri kategori uyelikleri `musteriler.tags` alanina yaziliyor. Kategori hedeflemeleri ve POS musteri tanima akisi bu veriyi okuyabilir.
            </div>
          ) : null}

          {databaseUnavailable ? (
            <div style={{ background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412', borderRadius: 12, padding: '12px 14px', fontSize: '.84rem', lineHeight: 1.6 }}>
              Musteri kategori atamalari production is verisidir. Tablo semasi okunamiyorsa bu ekranda kayit yapilmaz.
            </div>
          ) : null}

          {errorText ? (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 12, padding: '12px 14px', fontSize: '.84rem', lineHeight: 1.6 }}>
              {errorText}
            </div>
          ) : null}

          <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
            <div style={{ padding: '14px 16px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ fontWeight: 800, color: '#0f172a' }}>Kategori Listesi</div>
              <div style={{ fontSize: '.8rem', color: '#64748b', marginTop: 4 }}>
                Secilen kategoriler, loyalty kampanyalarindaki hedef kitle ve kosul editorlerinde kullanilir.
              </div>
            </div>

            <div style={{ padding: 16 }}>
              {loading ? (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '14px 0' }}>
                  <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} />
                  Yukleniyor...
                </div>
              ) : categories.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#94a3b8', padding: '14px 0' }}>
                  Henuz aktif loyalty musteri kategorisi yok.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 10 }}>
                  {categories.map(category => {
                    const checked = selectedCategoryIds.includes(category.id)
                    return (
                      <label
                        key={category.id}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 12,
                          border: `1px solid ${checked ? '#c4b5fd' : '#e2e8f0'}`,
                          background: checked ? '#faf5ff' : '#fff',
                          borderRadius: 12,
                          padding: '12px 14px',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCategory(category.id)}
                          style={{ marginTop: 2 }}
                        />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <div style={{ fontWeight: 800, color: '#0f172a' }}>{category.name}</div>
                            <span style={{ borderRadius: 999, padding: '3px 8px', fontSize: '.7rem', fontWeight: 800, background: '#eef2ff', color: '#4338ca' }}>
                              {category.code}
                            </span>
                          </div>
                          <div style={{ marginTop: 4, fontSize: '.8rem', color: '#64748b' }}>
                            {category.description || 'Aciklama girilmemis.'}
                          </div>
                        </div>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="modal-foot" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: '.8rem', color: '#64748b' }}>
            Secimler bu musteri icin loyalty segment hedeflemelerinde kullanilir.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-o" onClick={onClose}>Kapat</button>
            <button className="btn-p" onClick={saveAll} disabled={saving || loading || databaseUnavailable || !schemaReady}>
              {saving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function BorcEkleModal({ musteri, onClose, onSaved }) {
  const [form, setForm] = useState({ tutar: '', tarih: new Date().toISOString().split('T')[0], neden: '', aciklama: '' })
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  function setF(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function save() {
    if (!form.tutar || parseFloat(form.tutar) <= 0) { toast('Geçerli bir tutar giriniz', 'error'); return }
    setSaving(true)
    const tutar = parseFloat(form.tutar)
    const { error: hErr } = await db.from('cari_hareketler').insert({
      musteri_id: musteri.id, tur: 'borc', tutar,
      aciklama: form.aciklama || 'Manuel borç ekleme',
      tarih: form.tarih, neden: form.neden,
      personel_adi: null, // Personel modülü gelince doldurulacak
    })
    if (!hErr) {
      await db.from('musteriler').update({
        toplam_borc: (parseFloat(musteri.toplam_borc) || 0) + tutar
      }).eq('id', musteri.id)
    }
    setSaving(false)
    if (hErr) { toast('Hata: ' + hErr.message, 'error'); return }
    toast('Borç eklendi', 'success'); onSaved()
  }

  return (
    <div className="modal-bg open" onClick={e => e.stopPropagation()}>
      <div className="modal-box" style={{ width: 480 }}>
        <div className="modal-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>Manuel Borç Ekle</h2>
          <button className="ico-btn" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#fef3c7', borderRadius: 10, padding: '10px 14px', fontSize: '.82rem', color: '#92400e', fontWeight: 600, display: 'flex', gap: 6, alignItems: 'center' }}>
            <i className="fa-solid fa-user" />
            <span>{musteri.ad_soyad}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label className="f-label">Tutar (₺) <span style={{ color: '#ef4444' }}>*</span></label>
              <input className="f-input" type="number" min={0} step={0.01} placeholder="0,00"
                value={form.tutar} onChange={e => setF('tutar', e.target.value)} />
            </div>
            <div>
              <label className="f-label">Tarih</label>
              <input className="f-input" type="date" value={form.tarih} onChange={e => setF('tarih', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="f-label">Ekleme Nedeni</label>
            <input className="f-input" placeholder="Borç ekleme nedeni…" value={form.neden} onChange={e => setF('neden', e.target.value)} />
          </div>
          <div>
            <label className="f-label">Açıklama</label>
            <input className="f-input" placeholder="Ek açıklama…" value={form.aciklama} onChange={e => setF('aciklama', e.target.value)} />
          </div>
          <div style={{ background: '#f1f5f9', borderRadius: 8, padding: '8px 12px', fontSize: '.78rem', color: '#64748b' }}>
            <i className="fa-solid fa-circle-info" style={{ marginRight: 5 }} />
            Eklemeyi yapan personel: <em>Personel modülü entegre edilince otomatik doldurulacak</em>
          </div>
        </div>
        <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-o" onClick={onClose}>İptal</button>
          <button className="btn-p" onClick={save} disabled={saving}>
            {saving ? <><i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 6 }} />Ekleniyor…</> : 'Borç Ekle'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Cari Hareketler Modal ─────────────────────────────────────
function HareketlerModal({ musteri, onClose }) {
  const [hareketler, setHareketler] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data } = await db.from('cari_hareketler')
        .select('*').eq('musteri_id', musteri.id)
        .is('deleted_at', null).order('created_at', { ascending: false })
      setHareketler(data || [])
      setLoading(false)
    }
    load()
  }, [musteri.id])

  const TUR_BADGE = {
    borc:   { bg: '#fee2e2', color: '#b91c1c', label: 'BORÇ' },
    odeme:  { bg: '#dcfce7', color: '#166534', label: 'ÖDEME' },
  }

  return (
    <div className="modal-bg open" onClick={e => e.stopPropagation()}>
      <div className="modal-box" style={{ width: 820, maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>
            {musteri.ad_soyad} — Hareket Geçmişi
          </h2>
          <button className="ico-btn" onClick={onClose}><i className="fa-solid fa-xmark" /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
              <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '1.2rem', display: 'block', marginBottom: 8 }} />Yükleniyor…
            </div>
          ) : hareketler.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontSize: '.9rem' }}>
              Henüz hareket kaydı yok
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Tür</th>
                  <th>Tutar</th>
                  <th>Neden / Açıklama</th>
                  <th>Paket No</th>
                  <th>Personel</th>
                  <th>İşlem</th>
                </tr>
              </thead>
              <tbody>
                {hareketler.map(h => {
                  const badge = TUR_BADGE[h.tur] || TUR_BADGE.borc
                  return (
                    <tr key={h.id}>
                      <td style={{ fontSize: '.8rem', color: '#64748b' }}>
                        {fmtDate(h.tarih)}<br />
                        <span style={{ fontSize: '.72rem' }}>{new Date(h.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}</span>
                      </td>
                      <td>
                        <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: '.72rem', fontWeight: 700, background: badge.bg, color: badge.color }}>
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ fontWeight: 700, color: h.tur === 'borc' ? '#ef4444' : '#22c55e' }}>
                        {h.tur === 'borc' ? '+' : '-'}{fmt(h.tutar)}
                      </td>
                      <td style={{ fontSize: '.83rem' }}>
                        <div>{h.neden || h.aciklama || '—'}</div>
                        {h.neden && h.aciklama && <div style={{ fontSize: '.75rem', color: '#94a3b8' }}>{h.aciklama}</div>}
                      </td>
                      <td style={{ fontSize: '.78rem' }}>
                        {h.paket_no
                          ? <span style={{ background: '#eff6ff', color: '#1d4ed8', borderRadius: 6, padding: '2px 8px', fontWeight: 700 }}>{h.paket_no}</span>
                          : <span style={{ color: '#94a3b8' }}>—</span>}
                      </td>
                      <td style={{ fontSize: '.82rem', color: '#64748b' }}>{h.personel_adi || <em style={{ color: '#cbd5e1' }}>—</em>}</td>
                      <td>
                        <button className="ico-btn del" title="Sil" onClick={async () => {
                          await db.from('cari_hareketler').update({ deleted_at: new Date().toISOString() }).eq('id', h.id)
                          setHareketler(prev => prev.filter(x => x.id !== h.id))
                        }}><i className="fa-solid fa-trash" /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-o" onClick={onClose}>Kapat</button>
        </div>
      </div>
    </div>
  )
}

// ── Ödeme Al Uyarı Modal ──────────────────────────────────────
function OdemeAlModal({ musteri, onClose }) {
  return (
    <div className="modal-bg open" onClick={e => e.stopPropagation()}>
      <div className="modal-box" style={{ width: 440 }}>
        <div className="modal-head">
          <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#1e293b' }}>Ödeme Al</h2>
        </div>
        <div className="modal-body" style={{ textAlign: 'center', padding: '28px 26px' }}>
          <i className="fa-solid fa-cash-register" style={{ fontSize: '2.4rem', color: '#f59e0b', marginBottom: 14, display: 'block' }} />
          <p style={{ fontSize: '.92rem', color: '#374151', margin: '0 0 8px', fontWeight: 600 }}>
            {musteri.ad_soyad} müşterisine ait borçlanılan ürünler POS ekranına aktarılacak.
          </p>
          <p style={{ fontSize: '.82rem', color: '#94a3b8', margin: 0 }}>
            POS ekranı henüz tasarlanmadı. Bu özellik POS modülü tamamlandığında aktif olacak.
          </p>
        </div>
        <div className="modal-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn-o" onClick={onClose}>Kapat</button>
          <button className="btn-p" disabled style={{ opacity: .5 }}>
            <i className="fa-solid fa-cash-register" style={{ marginRight: 6 }} />POS'a Aktar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Ana Sayfa ─────────────────────────────────────────────────
function parseAdresler(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function getAdresOzet(musteri = {}) {
  const adresler = parseAdresler(musteri.adresler)
  const secilenAdres = adresler.find(item => item?.birincil) || adresler[0]
  if (!secilenAdres) return 'Adres yok'

  return [
    secilenAdres.baslik,
    secilenAdres.sokak,
    secilenAdres.apt_no,
    secilenAdres.daire_no ? `D:${secilenAdres.daire_no}` : '',
  ].filter(Boolean).join(' - ') || 'Adres yok'
}

function getMusteriTelefonu(musteri = {}) {
  const kod = String(musteri.telefon_ulke || '').trim()
  const telefon = String(musteri.telefon || '').trim()
  return `${kod}${telefon}`.trim() || 'Telefon yok'
}

function getMusteriDurumMeta(musteri = {}) {
  if (musteri.deleted_at) {
    return {
      label: 'Silinmis',
      bg: '#fee2e2',
      color: '#b91c1c',
      hint: fmtDateTime(musteri.deleted_at),
    }
  }

  if (musteri.cari) {
    return {
      label: 'Cari',
      bg: '#dcfce7',
      color: '#166534',
      hint: 'Aktif cari hesap',
    }
  }

  return {
    label: 'Aktif',
    bg: '#dbeafe',
    color: '#1d4ed8',
    hint: 'Aktif musteri',
  }
}

function StatsCard({ label, value, hint, accent = '#0f172a', bg = '#fff' }) {
  return (
    <div className="card" style={{ padding: 16, background: bg }}>
      <div style={{ fontSize: '.76rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.04em' }}>
        {label}
      </div>
      <div style={{ marginTop: 8, fontSize: '1.8rem', fontWeight: 900, color: accent }}>
        {value}
      </div>
      {hint ? (
        <div style={{ marginTop: 6, fontSize: '.78rem', color: '#94a3b8', lineHeight: 1.5 }}>
          {hint}
        </div>
      ) : null}
    </div>
  )
}

function FilterChip({ active, icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '9px 14px',
        borderRadius: 999,
        border: `1px solid ${active ? '#2563eb' : '#dbeafe'}`,
        background: active ? '#eff6ff' : '#fff',
        color: active ? '#1d4ed8' : '#475569',
        fontWeight: 800,
        fontSize: '.8rem',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <i className={`fa-solid ${icon}`} />
      {label}
    </button>
  )
}

function MusterilerLegacy() {
  const [musteriler, setMusteriler] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [viewMode, setViewMode] = useState('active')
  const [sadeceCari, setSadeceCari] = useState(false)
  const [searchText, setSearchText] = useState('')
  const [lastLoadedAt, setLastLoadedAt] = useState('')
  const [loadError, setLoadError] = useState('')
  const [modal, setModal] = useState(null) // {type, musteri?}
  const [confirmDel, setConfirmDel] = useState(null)
  const [iller, setIller] = useState([])
  const [ilceler, setIlceler] = useState({})
  const [mahalleler, setMahalleler] = useState({})
  const toast = useToast()

  const load = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true)
    else setLoading(true)
    setLoadError('')
    try {
      const { data, error } = await db.from('musteriler').select('*').order('ad_soyad')
      if (error) throw error
      setMusteriler(data || [])
      setLastLoadedAt(new Date().toISOString())
    } catch (error) {
      const message = error?.message || 'Bilinmeyen hata'
      setLoadError(message)
      toast('Musteri listesi okunamadi: ' + message, 'error')
      setMusteriler([])
    } finally {
      if (silent) setRefreshing(false)
      else setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    db.from('tr_iller').select('id,ad').order('ad').then(({ data }) => setIller(data || []))
  }, [])

  async function softDelete(id) {
    await db.from('musteriler').update({ deleted_at: new Date().toISOString() }).eq('id', id)
    toast('Müşteri silindi', 'success'); load()
  }

  async function cariYap(m) {
    await db.from('musteriler').update({ cari: true }).eq('id', m.id)
    toast('Cari müşteri yapıldı', 'success'); load()
  }

  const filtered = musteriler.filter(m => {
    const adOk = !searchAd || m.ad_soyad.toLowerCase().includes(searchAd.toLowerCase())
    const telOk = !searchTel || (m.telefon || '').includes(searchTel)
    return adOk && telOk
  })

  function adresOzet(m) {
    const adresler = typeof m.adresler === 'string' ? JSON.parse(m.adresler || '[]') : (m.adresler || [])
    const a = adresler.find(x => x.birincil) || adresler[0]
    if (!a) return '—'
    return [a.baslik, a.sokak, a.apt_no].filter(Boolean).join(' ') || '—'
  }

  return (
    <div>
      <Header
        title="Müşteriler"
        subtitle="Müşteri listesi ve cari hesap yönetimi"
        actions={
          <AddButton onClick={() => setModal({ type: 'form', musteri: null })} label="Yeni Müşteri Ekle" />
        }
      />

      {/* Araçlar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <input className="f-input" placeholder="☎ Telefon Örn: 5123456789" value={searchTel}
          onChange={e => setSearchTel(e.target.value)} style={{ maxWidth: 220 }} />
        <input className="f-input" placeholder="İsim ile Ara" value={searchAd}
          onChange={e => setSearchAd(e.target.value)} style={{ maxWidth: 220 }} />
        <button onClick={() => setSadeceCari(v => !v)}
          style={{ padding: '8px 16px', borderRadius: 10, border: `1.5px solid ${sadeceCari ? '#6366f1' : '#e2e8f0'}`,
            background: sadeceCari ? '#f5f3ff' : '#fff', color: sadeceCari ? '#4338ca' : '#64748b',
            fontWeight: 600, fontSize: '.855rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <i className="fa-solid fa-star" />Sadece Cari Müşteriler
        </button>
        <div style={{ marginLeft: 'auto', fontSize: '.82rem', color: '#64748b' }}>
          {filtered.length} müşteri
        </div>
      </div>

      {/* Tablo */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 60, textAlign: 'center', color: '#94a3b8' }}>
            <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '1.5rem', display: 'block', marginBottom: 10 }} />
            Yükleniyor…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 60, textAlign: 'center' }}>
            <i className="fa-solid fa-users" style={{ fontSize: '2rem', color: '#e2e8f0', display: 'block', marginBottom: 10 }} />
            <p style={{ color: '#94a3b8', margin: 0 }}>{searchAd || searchTel ? 'Arama sonucu bulunamadı' : 'Henüz müşteri eklenmedi'}</p>
          </div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>Ad Soyad</th>
                <th>Telefon</th>
                <th>Adres</th>
                <th>Cari</th>
                <th>Borç</th>
                <th>Alacak</th>
                <th>Sipariş</th>
                <th>İşlemler</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m, idx) => {
                const isCari = m.cari
                return (
                  <tr key={m.id}>
                    <td style={{ color: '#94a3b8', fontWeight: 600 }}>{idx + 1}</td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#1e293b' }}>{m.ad_soyad}</div>
                      {m.sirket_adi && <div style={{ fontSize: '.75rem', color: '#94a3b8' }}>{m.sirket_adi}</div>}
                    </td>
                    <td style={{ fontSize: '.845rem', color: '#475569' }}>{m.telefon ? `${m.telefon_ulke || ''}${m.telefon}` : '—'}</td>
                    <td style={{ fontSize: '.8rem', color: '#64748b', maxWidth: 180 }}>{adresOzet(m)}</td>
                    <td>
                      {isCari
                        ? <span style={{ width: 28, height: 28, borderRadius: 7, background: '#22c55e', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '.8rem' }}>
                            <i className="fa-solid fa-check" />
                          </span>
                        : <span style={{ width: 28, height: 28, borderRadius: 7, border: '1.5px solid #e2e8f0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '.65rem', color: '#cbd5e1' }}>
                            <i className="fa-solid fa-circle" />
                          </span>}
                    </td>
                    <td style={{ fontWeight: 700, color: parseFloat(m.toplam_borc) > 0 ? '#ef4444' : '#94a3b8' }}>
                      {isCari ? fmt(m.toplam_borc) : '—'}
                    </td>
                    <td style={{ fontWeight: 700, color: parseFloat(m.toplam_alacak) > 0 ? '#22c55e' : '#94a3b8' }}>
                      {isCari ? fmt(m.toplam_alacak) : '—'}
                    </td>
                    <td style={{ fontWeight: 600, color: '#475569' }}>{m.siparis_sayisi ?? 0}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                        <button className="ico-btn edit" title="Düzenle"
                          onClick={() => setModal({ type: 'form', musteri: m })}>
                          <i className="fa-solid fa-pen" />
                        </button>
                        <button
                          onClick={() => setModal({ type: 'loyalty', musteri: m })}
                          style={{ padding: '5px 10px', borderRadius: 7, border: 'none', background: '#7c3aed', color: '#fff', fontWeight: 700, fontSize: '.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                        >
                          <i className="fa-solid fa-gift" style={{ fontSize: '.65rem' }} />Sadakat Cuzdani
                        </button>
                        {isCari ? (
                          <button onClick={() => setModal({ type: 'cari', musteri: m })}
                            style={{ padding: '5px 10px', borderRadius: 7, border: 'none', background: '#0ea5e9', color: '#fff', fontWeight: 700, fontSize: '.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <i className="fa-solid fa-chart-line" style={{ fontSize: '.65rem' }} />Cari Detayları
                          </button>
                        ) : (
                          <button onClick={() => cariYap(m)}
                            style={{ padding: '5px 10px', borderRadius: 7, border: '1.5px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: '.75rem', cursor: 'pointer' }}>
                            Cari Yap
                          </button>
                        )}
                        {isCari && (
                          <button onClick={() => setModal({ type: 'odeme', musteri: m })}
                            style={{ padding: '5px 10px', borderRadius: 7, border: 'none', background: '#22c55e', color: '#fff', fontWeight: 700, fontSize: '.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <i className="fa-solid fa-cash-register" style={{ fontSize: '.65rem' }} />Ödeme Al
                          </button>
                        )}
                        <button className="ico-btn del" title="Sil"
                          onClick={() => setConfirmDel(m.id)}>
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

      {/* Modaller */}
      {modal?.type === 'form' && (
        <MusteriModal musteri={modal.musteri} onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }}
          iller={iller} ilceler={ilceler} setIlceler={setIlceler}
          mahalleler={mahalleler} setMahalleler={setMahalleler} />
      )}
      {modal?.type === 'cari' && (
        <CariDetayModal musteri={modal.musteri} onClose={() => setModal(null)}
          onBorcEkle={() => setModal({ type: 'borc', musteri: modal.musteri })}
          onOdemeAl={() => setModal({ type: 'odeme', musteri: modal.musteri })}
          onHareketler={() => setModal({ type: 'hareketler', musteri: modal.musteri })} />
      )}
      {modal?.type === 'loyalty' && (
        <LoyaltyWalletModal musteri={modal.musteri} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'borc' && (
        <BorcEkleModal musteri={modal.musteri} onClose={() => setModal(null)}
          onSaved={() => { setModal(null); load() }} />
      )}
      {modal?.type === 'hareketler' && (
        <HareketlerModal musteri={modal.musteri} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'odeme' && (
        <OdemeAlModal musteri={modal.musteri} onClose={() => setModal(null)} />
      )}

      <ConfirmDialog open={!!confirmDel} message="Bu müşteri silinsin mi?"
        onConfirm={() => { softDelete(confirmDel); setConfirmDel(null) }}
        onCancel={() => setConfirmDel(null)} />
    </div>
  )
}
