import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useWorkspace } from '@/context/WorkspaceContext'
import { canAccessSection, getWorkspaceScopeOption, isBranchScopedScope } from '@/lib/workspace'
import { CHANGELOG, VERSION } from '@/version'
import { getTheme, toggleTheme as doToggleTheme } from '@/lib/theme'
import { getDisplayMode, setDisplayMode } from '@/lib/displayMode'
import { useSidebar } from '@/context/SidebarContext'

const NAV = [
  {
    section: 'Merkez Ä°ÅŸlemleri',
    icon: 'fa-building-columns',
    items: [
      { label: 'Åirket KuruluÅŸu', path: '/company', icon: 'fa-sitemap', color: '#f472b6', bg: 'rgba(244,114,182,.18)' },
      {
        label: 'SatÄ±ÅŸ YÃ¶netimi', icon: 'fa-cash-register', color: '#fb923c', bg: 'rgba(251,146,60,.18)',
        group: 'satis-yonetimi',
        children: [
          {
            label: 'SatÄ±ÅŸ MalÄ±', path: '/products', icon: 'fa-utensils', color: '#fb923c', bg: 'rgba(251,146,60,.18)',
            subGroup: 'satis-mali',
            subChildren: [
              { label: 'Combo Menu', path: '/combo-menu', icon: 'fa-burger', color: '#f97316', bg: 'rgba(249,115,22,.18)' },
            ],
          },
          { label: 'YarÄ± Mamul', path: '/semi-products', icon: 'fa-layer-group', color: '#f59e0b', bg: 'rgba(245,158,11,.18)' },
          {
            label: 'SeÃ§enekler', path: '/options', icon: 'fa-sliders', color: '#22d3ee', bg: 'rgba(34,211,238,.18)',
            subGroup: 'secenekler',
            subChildren: [
              { label: 'SeÃ§enek GruplarÄ±', path: '/option-groups', icon: 'fa-layer-group', color: '#a78bfa', bg: 'rgba(167,139,250,.18)' },
            ],
          },
          {
            label: 'Fiyatlar', path: '/prices', icon: 'fa-tag', color: '#f472b6', bg: 'rgba(244,114,182,.18)',
            subGroup: 'fiyatlar',
            subChildren: [
              { label: 'Fiyat DeÄŸiÅŸiklikleri', path: '/price-changes', icon: 'fa-clock-rotate-left', color: '#a78bfa', bg: 'rgba(167,139,250,.18)' },
            ],
          },
          { label: 'SatÄ±ÅŸ RaporlarÄ±', path: '/sales-reports', icon: 'fa-chart-line', color: '#a78bfa', bg: 'rgba(167,139,250,.18)' },
        ],
      },
      {
        label: 'Stok YÃ¶netimi', icon: 'fa-box-open', color: '#34d399', bg: 'rgba(52,211,153,.18)',
        group: 'stok',
        children: [
          { label: 'Stok Hareketleri', path: '/movements', icon: 'fa-arrow-right-arrow-left', color: '#10b981', bg: 'rgba(16,185,129,.18)' },
          { label: 'Stok MalÄ±', path: '/stock-items', icon: 'fa-cube', color: '#34d399', bg: 'rgba(52,211,153,.18)' },
          { label: 'SayÄ±m', path: '/count-flows', icon: 'fa-clipboard-check', color: '#34d399', bg: 'rgba(52,211,153,.18)' },
          { label: 'Stok RaporlarÄ±', path: '/stock-reports', icon: 'fa-chart-bar', color: '#a78bfa', bg: 'rgba(167,139,250,.18)' },
        ],
      },
      {
        label: 'Tedarik Zinciri', icon: 'fa-link', color: '#f87171', bg: 'rgba(248,113,113,.18)',
        group: 'tedarik',
        children: [
          { label: 'TedarikÃ§iler', path: '/suppliers', icon: 'fa-truck-fast', color: '#f87171', bg: 'rgba(248,113,113,.18)' },
          { label: 'SatÄ±nalma YÃ¶neticisi', path: '/purchasing', icon: 'fa-cart-plus', color: '#4ade80', bg: 'rgba(74,222,128,.18)' },
          { label: 'TedarikÃ§i SipariÅŸ Paneli', path: '/supplier-order-panel', icon: 'fa-clipboard-list', color: '#fb7185', bg: 'rgba(251,113,133,.18)' },
          { label: 'SÃ¶zleÅŸmeler', path: '/contracts', icon: 'fa-file-contract', color: '#2dd4bf', bg: 'rgba(45,212,191,.18)' },
        ],
      },
      { label: 'Personel', path: '/personel', icon: 'fa-users', color: '#60a5fa', bg: 'rgba(96,165,250,.18)' },
      { label: 'MÃ¼ÅŸteriler', path: '/musteriler', icon: 'fa-address-book', color: '#818cf8', bg: 'rgba(129,140,248,.18)' },
      { label: 'Çağrı Merkezi', path: '/call-center', icon: 'fa-headset', color: '#22d3ee', bg: 'rgba(34,211,238,.18)' },
      {
        label: 'Mobil App', icon: 'fa-mobile-screen-button', color: '#38bdf8', bg: 'rgba(56,189,248,.18)',
        group: 'mobil-app-merkez',
        children: [
          { label: 'Personel', path: '/mobil-app/personel', icon: 'fa-user-tie', color: '#38bdf8', bg: 'rgba(56,189,248,.18)' },
          { label: 'QR Menü', path: '/mobil-app/qr-menu', icon: 'fa-qrcode', color: '#f59e0b', bg: 'rgba(245,158,11,.18)' },
          { label: 'Müşteri', path: '/mobil-app/musteri', icon: 'fa-user-group', color: '#fb7185', bg: 'rgba(251,113,133,.18)' },
          { label: 'Boss', path: '/mobil-app/boss', icon: 'fa-crown', color: '#a78bfa', bg: 'rgba(167,139,250,.18)' },
        ],
      },
      {
        label: 'Sadakat YÃ¶netimi', icon: 'fa-heart', color: '#f472b6', bg: 'rgba(244,114,182,.18)',
        group: 'sadakat-yonetimi',
        children: [
          { label: 'Kampanyalar', path: '/sadakat', icon: 'fa-bullhorn', color: '#f472b6', bg: 'rgba(244,114,182,.18)' },
          { label: 'Kupon Setleri', path: '/sadakat/kuponlar', icon: 'fa-ticket', color: '#f59e0b', bg: 'rgba(245,158,11,.18)' },
          { label: 'MÃ¼ÅŸteri Kategorileri', path: '/sadakat/kategoriler', icon: 'fa-tags', color: '#fb7185', bg: 'rgba(251,113,133,.18)' },
        ],
      },
      {
        label: 'Raporlar', icon: 'fa-chart-pie', color: '#a78bfa', bg: 'rgba(167,139,250,.18)',
        group: 'merkez-raporlar',
        children: [
          { label: 'Ã–zet Rapor', path: '/reports', icon: 'fa-gauge-high', color: '#2563eb', bg: 'rgba(37,99,235,.16)' },
          { label: 'Aktivite LoglarÄ±', path: '/activity-logs', icon: 'fa-list-check', color: '#0f766e', bg: 'rgba(13,148,136,.16)' },
          { label: 'SatÄ±ÅŸ Raporu', path: '/sales-reports', icon: 'fa-chart-line', color: '#fb923c', bg: 'rgba(251,146,60,.18)' },
          { label: 'SatÄ±ÅŸ MalÄ± KarmasÄ±', path: '/product-mix-report', icon: 'fa-layer-group', color: '#f59e0b', bg: 'rgba(245,158,11,.18)' },
          { label: 'P&L Raporu', path: '/pnl-report', icon: 'fa-file-invoice-dollar', color: '#dc2626', bg: 'rgba(220,38,38,.16)' },
          { label: 'Depo Raporu', path: '/stock-reports', icon: 'fa-box-open', color: '#34d399', bg: 'rgba(52,211,153,.18)' },
          { label: 'GeliÅŸmiÅŸ Rapor', path: '/advanced-reports', icon: 'fa-table-list', color: '#fcd34d', bg: 'rgba(252,211,77,.18)' },
          { label: 'Rapor TasarÄ±mcÄ±sÄ±', path: '/report-designer', icon: 'fa-wand-magic-sparkles', color: '#a78bfa', bg: 'rgba(167,139,250,.18)' },
        ],
      },
      {
        label: 'Ä°ÅŸlemler', icon: 'fa-file-invoice', color: '#60a5fa', bg: 'rgba(96,165,250,.18)',
        group: 'islemler',
        children: [
          { label: 'Belge GiriÅŸi', path: '/documents', icon: 'fa-file-arrow-down', color: '#60a5fa', bg: 'rgba(96,165,250,.18)' },
          { label: 'GÃ¶revler', path: '/tasks', icon: 'fa-list-check', color: '#38bdf8', bg: 'rgba(56,189,248,.18)' },
        ],
      },
      { label: 'DÃ¶nem KapanÄ±ÅŸÄ±', path: '/donem-kapanis', icon: 'fa-calendar-check', color: '#f87171', bg: 'rgba(248,113,113,.18)' },
    ],
  },
  {
    section: 'Åube Ä°ÅŸlemleri',
    icon: 'fa-store',
    items: [
      { label: 'Tahmin', path: '/forecast', icon: 'fa-chart-line', color: '#8b5cf6', bg: 'rgba(139,92,246,.18)' },
      { label: 'SipariÅŸler', path: '/orders', icon: 'fa-receipt', color: '#60a5fa', bg: 'rgba(96,165,250,.18)' },
      { label: 'Mal Kabul', path: '/mal-kabul', icon: 'fa-truck-ramp-box', color: '#34d399', bg: 'rgba(52,211,153,.18)' },
      {
        label: 'Personel', icon: 'fa-users', color: '#60a5fa', bg: 'rgba(96,165,250,.18)',
        group: 'sube-personel',
        children: [
          { label: 'Personel Listesi', path: '/sube-personel', icon: 'fa-address-card', color: '#60a5fa', bg: 'rgba(96,165,250,.18)' },
          {
            label: 'Vardiya PlanÄ±', path: '/timer-manager', icon: 'fa-calendar-days', color: '#34d399', bg: 'rgba(52,211,153,.18)',
            subGroup: 'sube-vardiya-plani',
            subChildren: [
              { label: 'Vardiya AyarlarÄ±', path: '/pre-shift-settings', icon: 'fa-sliders', color: '#34d399', bg: 'rgba(52,211,153,.18)' },
            ],
          },
        ],
      },
      {
        label: 'Zaman Takibi', icon: 'fa-stopwatch', color: '#f59e0b', bg: 'rgba(245,158,11,.18)',
        group: 'sube-zaman-takibi',
        children: [
          {
            label: 'Zaman SayaÃ§larÄ±', path: '/time-tracking/timers', icon: 'fa-stopwatch', color: '#f59e0b', bg: 'rgba(245,158,11,.18)',
            subGroup: 'sube-zaman-sayaclari',
            subChildren: [
              { label: 'Ã–n Ayarlar', path: '/time-tracking/timers/presets', icon: 'fa-sliders', color: '#fb923c', bg: 'rgba(251,146,60,.18)' },
            ],
          },
        ],
      },
      {
        label: 'Ä°ÅŸlemler', icon: 'fa-file-invoice', color: '#60a5fa', bg: 'rgba(96,165,250,.18)',
        group: 'sube-islemler',
        children: [
          { label: 'Belge GiriÅŸi', path: '/sube-documents', icon: 'fa-file-arrow-down', color: '#60a5fa', bg: 'rgba(96,165,250,.18)' },
          { label: 'GÃ¶revler', path: '/sube-tasks', icon: 'fa-list-check', color: '#38bdf8', bg: 'rgba(56,189,248,.18)' },
          { label: 'SayÄ±m', path: '/count', icon: 'fa-clipboard-check', color: '#34d399', bg: 'rgba(52,211,153,.18)' },
          { label: 'Transfer', path: '/sube-transfer', icon: 'fa-right-left', color: '#f59e0b', bg: 'rgba(245,158,11,.18)' },
          { label: 'Zayi KaydÄ±', path: '/sube-zayi-kaydi', icon: 'fa-trash-can', color: '#f87171', bg: 'rgba(248,113,113,.18)' },
          { label: 'Serbest KullanÄ±m KaydÄ±', path: '/sube-serbest-kullanim-kaydi', icon: 'fa-hand-holding', color: '#60a5fa', bg: 'rgba(96,165,250,.18)' },
        ],
      },
      { label: 'Ãœretim', path: '/uretim', icon: 'fa-industry', color: '#4ade80', bg: 'rgba(74,222,128,.18)' },
      {
        label: 'Raporlar', icon: 'fa-chart-pie', color: '#a78bfa', bg: 'rgba(167,139,250,.18)',
        group: 'sube-raporlar',
        children: [
          { label: 'Ã–zet Rapor', path: '/sube-reports', icon: 'fa-gauge-high', color: '#2563eb', bg: 'rgba(37,99,235,.16)' },
          { label: 'SatÄ±ÅŸ RaporlarÄ±', path: '/sube-satis-reports', icon: 'fa-chart-line', color: '#fb923c', bg: 'rgba(251,146,60,.18)' },
          { label: 'SatÄ±ÅŸ MalÄ± KarmasÄ±', path: '/sube-product-mix-report', icon: 'fa-layer-group', color: '#f59e0b', bg: 'rgba(245,158,11,.18)' },
          { label: 'P&L Raporu', path: '/sube-pnl-report', icon: 'fa-file-invoice-dollar', color: '#dc2626', bg: 'rgba(220,38,38,.16)' },
          { label: 'Depo Raporu', path: '/sube-stok-reports', icon: 'fa-box-open', color: '#34d399', bg: 'rgba(52,211,153,.18)' },
          { label: 'Finansal / GeliÅŸmiÅŸ', path: '/sube-finansal-reports', icon: 'fa-coins', color: '#fcd34d', bg: 'rgba(252,211,77,.18)' },
        ],
      },
    ],
  },
  {
    section: 'POS ve Ekranlar',
    icon: 'fa-cash-register',
    items: [
      { label: 'POS', path: '/pos', icon: 'fa-cash-register', color: '#fbbf24', bg: 'rgba(251,191,36,.18)', screenPath: '/pos-screen' },
      {
        label: 'Garson', path: '/garson', icon: 'fa-user-tie', color: '#38bdf8', bg: 'rgba(56,189,248,.18)',
        group: 'pos-garson',
        screenPath: '/garson-screen',
        children: [
          { label: 'Salon Masa Yonetimi', path: '/pos-masa', icon: 'fa-table-cells-large', color: '#38bdf8', bg: 'rgba(56,189,248,.18)' },
        ],
      },
      {
        label: 'Kiosk', icon: 'fa-tablet-screen-button', color: '#a78bfa', bg: 'rgba(167,139,250,.18)',
        group: 'kiosk-group',
        children: [
          { label: 'Kiosk YÃ¶netimi', path: '/kiosk-management', icon: 'fa-sliders', color: '#a78bfa', bg: 'rgba(167,139,250,.18)' },
          { label: 'KDS (Mutfak)', path: '/kds', icon: 'fa-kitchen-set', color: '#f59e0b', bg: 'rgba(245,158,11,.18)', screenPath: '/kds-screen' },
          { label: 'Teslim EkranÄ±', path: '/pickup', icon: 'fa-hand-holding-box', color: '#22c55e', bg: 'rgba(34,197,94,.18)', screenPath: '/pickup-screen' },
          { label: 'SÄ±ra EkranÄ±', path: '/queue', icon: 'fa-tv', color: '#60a5fa', bg: 'rgba(96,165,250,.18)' },
        ],
      },
    ],
  },
  {
    section: 'Merkez Depo / Ãœretim',
    icon: 'fa-warehouse',
    items: [
      { label: 'SipariÅŸler', path: '/merkez-orders', icon: 'fa-receipt', color: '#60a5fa', bg: 'rgba(96,165,250,.18)' },
      { label: 'Ãœretim', path: '/merkez-uretim', icon: 'fa-industry', color: '#4ade80', bg: 'rgba(74,222,128,.18)' },
      {
        label: 'Ä°ÅŸlemler', icon: 'fa-file-invoice', color: '#60a5fa', bg: 'rgba(96,165,250,.18)',
        group: 'merkez-depo-islemler',
        children: [
          { label: 'Belge GiriÅŸi', path: '/merkez-documents', icon: 'fa-file-arrow-down', color: '#60a5fa', bg: 'rgba(96,165,250,.18)' },
          { label: 'GÃ¶revler', path: '/merkez-tasks', icon: 'fa-list-check', color: '#38bdf8', bg: 'rgba(56,189,248,.18)' },
          { label: 'SayÄ±m', path: '/merkez-count', icon: 'fa-clipboard-check', color: '#34d399', bg: 'rgba(52,211,153,.18)' },
          { label: 'Transfer', path: '/merkez-transfer', icon: 'fa-right-left', color: '#f59e0b', bg: 'rgba(245,158,11,.18)' },
          { label: 'Zayi KaydÄ±', path: '/merkez-zayi-kaydi', icon: 'fa-trash-can', color: '#f87171', bg: 'rgba(248,113,113,.18)' },
          { label: 'Serbest KullanÄ±m KaydÄ±', path: '/merkez-serbest-kullanim-kaydi', icon: 'fa-hand-holding', color: '#60a5fa', bg: 'rgba(96,165,250,.18)' },
        ],
      },
      {
        label: 'Zaman Takibi', icon: 'fa-stopwatch', color: '#f59e0b', bg: 'rgba(245,158,11,.18)',
        group: 'merkez-zaman-takibi',
        children: [
          {
            label: 'Zaman SayaÃ§larÄ±', path: '/merkez-time-tracking/timers', icon: 'fa-stopwatch', color: '#f59e0b', bg: 'rgba(245,158,11,.18)',
            subGroup: 'merkez-zaman-sayaclari',
            subChildren: [
              { label: 'Ã–n Ayarlar', path: '/merkez-time-tracking/timers/presets', icon: 'fa-sliders', color: '#fb923c', bg: 'rgba(251,146,60,.18)' },
            ],
          },
        ],
      },
    ],
  },
  {
    section: 'Ayarlar',
    icon: 'fa-gear',
    items: [
      { label: 'Tahmin AyarlarÄ±', path: '/settings', icon: 'fa-gear', color: '#94a3b8', bg: 'rgba(148,163,184,.18)' },
      { label: 'Hesap Ã‡izelgesi', path: '/hesap-cizelgesi', icon: 'fa-book-bookmark', color: '#f59e0b', bg: 'rgba(245,158,11,.18)' },
      { label: 'Muhasebe EÅŸleÅŸtirmeleri', path: '/muhasebe-eslestirmeleri', icon: 'fa-arrow-right-arrow-left', color: '#0f766e', bg: 'rgba(13,148,136,.16)' },
      { label: 'P&L Åablonu', path: '/pnl-template', icon: 'fa-table-columns', color: '#dc2626', bg: 'rgba(220,38,38,.16)' },
      { label: 'SipariÅŸ AkÄ±ÅŸlarÄ±', path: '/order-flows', icon: 'fa-diagram-project', color: '#60a5fa', bg: 'rgba(96,165,250,.18)' },
      { label: 'SayÄ±m AkÄ±ÅŸlarÄ±', path: '/count-flows', icon: 'fa-clipboard-check', color: '#34d399', bg: 'rgba(52,211,153,.18)' },
      { label: 'Vergi TanÄ±mlamalarÄ±', path: '/taxes', icon: 'fa-percent', color: '#c084fc', bg: 'rgba(192,132,252,.18)' },
      { label: 'Birim TanÄ±mlarÄ±', path: '/units', icon: 'fa-ruler', color: '#2dd4bf', bg: 'rgba(45,212,191,.18)' },
      { label: 'Åablonlar', path: '/templates', icon: 'fa-copy', color: '#67e8f9', bg: 'rgba(103,232,249,.18)' },
      {
        label: 'Kategoriler', icon: 'fa-tags', color: '#fcd34d', bg: 'rgba(252,211,77,.18)',
        group: 'kategoriler',
        children: [
          { label: 'Stok MalÄ± Kategorileri', path: '/categories', icon: 'fa-cube', color: '#34d399', bg: 'rgba(52,211,153,.18)' },
          { label: 'SatÄ±ÅŸ MalÄ± Kategorileri', path: '/sale-categories', icon: 'fa-tag', color: '#fb923c', bg: 'rgba(251,146,60,.18)' },
          { label: 'YarÄ±mamul Kategorileri', path: '/semi-categories', icon: 'fa-layer-group', color: '#f59e0b', bg: 'rgba(245,158,11,.18)' },
        ],
      },
      {
        label: 'SatÄ±ÅŸ KanallarÄ±', icon: 'fa-store', color: '#60a5fa', bg: 'rgba(96,165,250,.18)',
        group: 'satis-kanallari',
        children: [
          { label: 'Kanallar', path: '/sales-channels', icon: 'fa-store', color: '#60a5fa', bg: 'rgba(96,165,250,.18)' },
        ],
      },
      {
        label: 'Personel AyarlarÄ±', icon: 'fa-users-gear', color: '#38bdf8', bg: 'rgba(56,189,248,.18)',
        group: 'personel-ayarlari',
        children: [
          { label: 'Pozisyonlar', path: '/positions', icon: 'fa-briefcase', color: '#38bdf8', bg: 'rgba(56,189,248,.18)' },
          { label: 'GÃ¶rev HiyerarÅŸisi', path: '/positions/hierarchy', icon: 'fa-sitemap', color: '#60a5fa', bg: 'rgba(96,165,250,.18)' },
        ],
      },
      { label: 'Demo SatÄ±ÅŸ Yap', path: '/demo-sales', icon: 'fa-wand-magic-sparkles', color: '#f59e0b', bg: 'rgba(245,158,11,.18)' },
    ],
  },
]

const CP1252_FALLBACK_MAP = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
}

const MOJIBAKE_PATTERN = /[ÃÅÄ]/
const utf8Decoder = new TextDecoder('utf-8')

function fixMojibakeText(value) {
  if (typeof value !== 'string' || !MOJIBAKE_PATTERN.test(value)) return value
  const bytes = Uint8Array.from(
    [...value].map(char => {
      const codePoint = char.codePointAt(0)
      return codePoint <= 0xff ? codePoint : (CP1252_FALLBACK_MAP[codePoint] ?? 0x3f)
    }),
  )

  try {
    return utf8Decoder.decode(bytes)
  } catch {
    return value
  }
}

function getFirstChildPath(item) {
  if (!item.children) return null
  for (const child of item.children) {
    if (child.path) return child.path
    if (child.subChildren) {
      for (const sub of child.subChildren) {
        if (sub.path) return sub.path
      }
    }
  }
  return null
}

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, authBusy, signOut } = useAuth()
  const { scope, branchName, openWorkspacePicker } = useWorkspace()
  const { mode, mobileOpen, setMobileOpen, togglePin, isPinned, autoMode } = useSidebar()
  const scopeOption = getWorkspaceScopeOption(scope)
  const isIconOnly = mode === 'icon'
  const isMobileMode = mode === 'closed'
  const isVisible = !isMobileMode || mobileOpen

  const visibleSections = useMemo(
    () => NAV.filter(section => canAccessSection(scope, section.section)),
    [scope],
  )

  const matchesPath = path => location.pathname === path || location.pathname.startsWith(`${path}/`)

  const getInitialGroups = () => {
    const groups = {}
    visibleSections.forEach(section => {
      section.items.forEach(item => {
        if (item.group && item.children) {
          const isChildActive = item.children.some(child =>
            matchesPath(child.path) ||
            child.subChildren?.some(subChild => matchesPath(subChild.path)),
          )
          groups[item.group] = isChildActive
          item.children.forEach(child => {
            if (child.subGroup) {
              groups[child.subGroup] = child.subChildren?.some(subChild => matchesPath(subChild.path)) || false
            }
          })
        }
      })
    })
    return groups
  }

  const [openGroups, setOpenGroups] = useState(getInitialGroups)
  const [searchQ, setSearchQ] = useState('')
  const [showChangelog, setShowChangelog] = useState(false)
  const [theme, setTheme] = useState(getTheme)
  const [displayMode, setDisplayModeState] = useState(getDisplayMode)
  const searchRef = useRef()

  const [activeUser, setActiveUser] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('rms_active_user') || 'null') } catch { return null }
  })

  useEffect(() => {
    try { setActiveUser(JSON.parse(sessionStorage.getItem('rms_active_user') || 'null')) } catch { setActiveUser(null) }
  }, [scope])

  const isActive = path => matchesPath(path)
  const toggleGroup = groupName => setOpenGroups(state => ({ ...state, [groupName]: !state[groupName] }))

  useEffect(() => {
    if (!isVisible) {
      setSearchQ('')
      setShowChangelog(false)
    }
  }, [isVisible])

  useEffect(() => {
    if (isIconOnly) setShowChangelog(false)
  }, [isIconOnly])

  useEffect(() => {
    if (!mobileOpen) return
    const onKeyDown = event => {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mobileOpen, setMobileOpen])

  const handleNavSelect = path => {
    if (!path) return
    navigate(path)
    if (isMobileMode) setMobileOpen(false)
  }

  const handleToggleTheme = () => {
    doToggleTheme()
    setTheme(getTheme())
  }

  const handleDisplayMode = m => {
    setDisplayMode(m)
    setDisplayModeState(m)
  }

  const allNavItems = useMemo(() => {
    const result = []
    visibleSections.forEach(section => {
      section.items.forEach(item => {
        if (item.path) result.push({ ...item, section: section.section })
        if (item.children) {
          item.children.forEach(child => {
            if (child.path) result.push({ ...child, section: section.section })
            if (child.subChildren) {
              child.subChildren.forEach(subChild => {
                if (subChild.path) result.push({ ...subChild, section: section.section })
              })
            }
          })
        }
      })
    })
    return result
  }, [visibleSections])

  const searchResults = searchQ.trim()
    ? allNavItems.filter(item => fixMojibakeText(item.label).toLowerCase().includes(searchQ.toLowerCase()))
    : []

  const iconOnlyBtn = (icon, label, onClick, extra = {}) => (
    <button
      type="button"
      title={label}
      onClick={onClick}
      style={{
        width: 32, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer',
        background: 'rgba(255,255,255,.07)', color: '#888', display: 'flex',
        alignItems: 'center', justifyContent: 'center', fontSize: '.75rem', flexShrink: 0,
        ...extra,
      }}
    >
      <i className={`fa-solid ${icon}`} />
    </button>
  )

  const mobileOpenClass = isMobileMode && mobileOpen ? 'mobile-open' : ''

  return (
    <>
      {isMobileMode && mobileOpen && (
        <div id="sidebar-overlay" className="open" onClick={() => setMobileOpen(false)} />
      )}

      <div id="sidebar-panel" className={mobileOpenClass} onClick={e => e.stopPropagation()}>

        {/* Changelog overlay */}
        {showChangelog && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 999, background: 'rgba(13,13,13,.97)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
            <div style={{ padding: '14px 12px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <i className="fa-solid fa-clock-rotate-left" style={{ color: '#a78bfa', fontSize: '.8rem' }} />
                <span style={{ fontWeight: 800, fontSize: '.85rem', color: '#ccc' }}>Neler Yapıldı</span>
              </div>
              <button onClick={() => setShowChangelog(false)} style={{ background: 'rgba(255,255,255,.08)', border: 'none', borderRadius: 6, width: 24, height: 24, color: '#888', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="fa-solid fa-xmark" style={{ fontSize: '.7rem' }} />
              </button>
            </div>
            <div style={{ padding: '12px', flex: 1 }}>
              {CHANGELOG.map(log => (
                <div key={log.version} style={{ marginBottom: 18 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ background: 'rgba(99,102,241,.3)', color: '#a78bfa', fontSize: '.66rem', fontWeight: 800, padding: '2px 8px', borderRadius: 99 }}>v{log.version}</span>
                    <span style={{ fontSize: '.63rem', color: '#555' }}>{log.date}</span>
                  </div>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {log.items.map((item, i) => (
                      <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: '.7rem', color: 'rgba(204,204,204,.8)', lineHeight: 1.5 }}>
                        <i className="fa-solid fa-circle-check" style={{ color: '#4ade80', fontSize: '.58rem', marginTop: 3, flexShrink: 0 }} />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Logo area */}
        {isIconOnly ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 0 8px', gap: 5, flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,.06)' }}>
            <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg,#e8521a,#f5a623)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <i className="fa-solid fa-utensils" style={{ color: '#fff', fontSize: '.75rem' }} />
            </div>
            <button
              type="button"
              onClick={togglePin}
              title="Sidebar'ı genişlet"
              style={{ width: 28, height: 20, border: 'none', borderRadius: 4, cursor: 'pointer', background: 'rgba(255,255,255,.07)', color: '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.6rem' }}
            >
              <i className="fa-solid fa-angles-right" />
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '14px 12px 12px', flexShrink: 0, borderBottom: '1px solid rgba(255,255,255,.06)' }}>
            <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg,#e8521a,#f5a623)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <i className="fa-solid fa-utensils" style={{ color: '#fff', fontSize: '.75rem' }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '.95rem', fontWeight: 900, letterSpacing: '-.01em', display: 'flex', alignItems: 'baseline', gap: 3 }}>
                <span style={{ color: '#e8521a' }}>Suitable</span>
                <span style={{ color: '#f5a623', fontWeight: 900 }}>RMS</span>
              </div>
              <button
                onClick={() => setShowChangelog(s => !s)}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, marginTop: 1 }}
              >
                <span style={{ fontSize: '.56rem', color: '#555', fontWeight: 700, letterSpacing: '.06em' }}>v{VERSION}</span>
                <i className="fa-solid fa-clock-rotate-left" style={{ fontSize: '.48rem', color: '#444' }} />
              </button>
            </div>
            {!isMobileMode && (
              <button
                type="button"
                onClick={togglePin}
                title="Sidebar'ı daralt"
                style={{ width: 26, height: 26, border: 'none', borderRadius: 5, cursor: 'pointer', background: 'rgba(255,255,255,.07)', color: isPinned ? '#f5a623' : '#666', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.65rem', flexShrink: 0 }}
              >
                <i className="fa-solid fa-angles-left" />
              </button>
            )}
            {isMobileMode && (
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                style={{ background: 'rgba(255,255,255,.07)', border: 'none', borderRadius: 6, width: 26, height: 26, color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
              >
                <i className="fa-solid fa-xmark" style={{ fontSize: '.75rem' }} />
              </button>
            )}
          </div>
        )}

        {/* Active user block */}
        {!isIconOnly && activeUser && (
          <div
            style={{ padding: '6px 10px', flexShrink: 0, cursor: 'pointer' }}
            onClick={openWorkspacePicker}
            title="Kullanıcı değiştir"
          >
            <div style={{ borderRadius: 10, background: 'rgba(255,255,255,.05)', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 30,
                height: 30,
                borderRadius: 999,
                background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '.8rem',
                flexShrink: 0,
              }}>
                {(activeUser.firstName?.[0] || '?').toUpperCase()}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: '.78rem', fontWeight: 700, color: '#ccc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {[activeUser.firstName, activeUser.lastName].filter(Boolean).join(' ') || 'Personel'}
                </div>
              </div>
            </div>
          </div>
        )}
        {isIconOnly && activeUser && (
          <div style={{ padding: '6px 10px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
            <button
              type="button"
              title={[activeUser.firstName, activeUser.lastName].filter(Boolean).join(' ') || 'Personel'}
              onClick={openWorkspacePicker}
              style={{ width: 28, height: 28, borderRadius: 999, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '.75rem' }}
            >
              {(activeUser.firstName?.[0] || '?').toUpperCase()}
            </button>
          </div>
        )}

        {/* Scope picker */}
        {!isIconOnly && scopeOption && (
          <div style={{ padding: '8px 10px', flexShrink: 0 }}>
            <div style={{ borderRadius: 10, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.04)', padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }} onClick={openWorkspacePicker}>
              <span style={{ width: 28, height: 28, borderRadius: 8, background: scopeOption.bg, color: scopeOption.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '.75rem' }}>
                <i className={`fa-solid ${isBranchScopedScope(scope) ? 'fa-store' : scopeOption.icon}`} />
              </span>
              <div style={{ minWidth: 0, flex: 1, fontSize: '.8rem', color: '#bbb', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {isBranchScopedScope(scope) && branchName ? branchName : scopeOption.label}
              </div>
              <i className="fa-solid fa-arrow-right-arrow-left" style={{ fontSize: '.6rem', color: '#555', flexShrink: 0 }} />
            </div>
          </div>
        )}
        {isIconOnly && scopeOption && (
          <div style={{ padding: '8px 10px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
            <button type="button" title={isBranchScopedScope(scope) && branchName ? branchName : scopeOption.label} onClick={openWorkspacePicker}
              style={{ width: 28, height: 28, borderRadius: 8, background: scopeOption.bg, color: scopeOption.accent, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.75rem' }}>
              <i className={`fa-solid ${isBranchScopedScope(scope) ? 'fa-store' : scopeOption.icon}`} />
            </button>
          </div>
        )}

        {/* Search (full mode only) */}
        {!isIconOnly && (
          <div style={{ padding: '0 10px 8px', position: 'relative', flexShrink: 0 }}>
            <div style={{ position: 'relative' }}>
              <i className="fa-solid fa-search" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#555', fontSize: '.68rem', pointerEvents: 'none' }} />
              <input
                ref={searchRef}
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="Menüde ara..."
                style={{ width: '100%', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 7, padding: '6px 28px 6px 28px', color: '#bbb', fontSize: '.75rem', outline: 'none', boxSizing: 'border-box' }}
              />
              {searchQ && (
                <i className="fa-solid fa-xmark" onClick={() => setSearchQ('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: '#555', fontSize: '.68rem', cursor: 'pointer' }} />
              )}
            </div>
            {searchResults.length > 0 && (
              <div style={{ position: 'absolute', left: 10, right: 10, top: 'calc(100% - 4px)', background: '#161616', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.5)', zIndex: 999, overflow: 'hidden', maxHeight: 260, overflowY: 'auto' }}>
                {searchResults.map(item => (
                  <div key={item.path} onClick={() => { handleNavSelect(item.path); setSearchQ('') }}
                    style={{ padding: '7px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(255,255,255,.05)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,.05)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{ width: 24, height: 24, borderRadius: 6, background: item.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <i className={`fa-solid ${item.icon}`} style={{ color: item.color, fontSize: '.65rem' }} />
                    </span>
                    <div>
                      <div style={{ fontSize: '.77rem', fontWeight: 600, color: '#ccc' }}>{fixMojibakeText(item.label)}</div>
                      <div style={{ fontSize: '.63rem', color: '#555' }}>{fixMojibakeText(item.section)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {searchQ.trim() && searchResults.length === 0 && (
              <div style={{ position: 'absolute', left: 10, right: 10, top: 'calc(100% - 4px)', background: '#161616', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, padding: '10px', textAlign: 'center', fontSize: '.75rem', color: '#555', zIndex: 999 }}>
                Sonuç bulunamadı
              </div>
            )}
          </div>
        )}

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: isIconOnly ? '4px 0' : '0 0 8px' }}>
          {visibleSections.map(section => (
            <div key={section.section}>
              {!isIconOnly && (
                <div className="sec-lbl">
                  <i className={`fa-solid ${section.icon}`} style={{ fontSize: '.6rem' }} />
                  <span>{fixMojibakeText(section.section)}</span>
                  <div className="sec-lbl-line" />
                </div>
              )}
              {isIconOnly && <div style={{ height: 8 }} />}

              {section.section === 'Sube Islemleri' && branchName && !isIconOnly && (
                <button type="button" onClick={openWorkspacePicker} title="Çalışma bağlamını değiştir"
                  style={{ width: '100%', margin: '2px 0 8px', padding: '6px 10px', border: '1px solid rgba(245,166,35,.2)', background: 'rgba(245,166,35,.06)', color: '#f5a623', display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer', textAlign: 'left', borderRadius: 0 }}>
                  <span style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(245,166,35,.15)', color: '#f5a623', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <i className="fa-solid fa-store" style={{ fontSize: '.65rem' }} />
                  </span>
                  <span style={{ minWidth: 0, flex: 1, fontSize: '.73rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{branchName}</span>
                  <i className="fa-solid fa-pen-to-square" style={{ fontSize: '.65rem', opacity: 0.6, flexShrink: 0 }} />
                </button>
              )}

              {section.items.map(item => (
                item.children ? (
                  <div key={item.label} className={`nav-parent ${openGroups[item.group] ? 'open' : ''}`}>
                    {isIconOnly ? (
                      <div className="nav-item" title={fixMojibakeText(item.label)} style={{ justifyContent: 'center', padding: '8px 0', pointerEvents: 'all' }}
                        onClick={() => handleNavSelect(item.path ?? getFirstChildPath(item))}>
                        <span className="nav-icon-box">
                          <i className={`fa-solid ${item.icon}`} />
                        </span>
                      </div>
                    ) : (
                      <div className="nav-item" onClick={() => {
                        if (item.path) navigate(item.path)
                        toggleGroup(item.group)
                      }}>
                        <span className="nav-icon-box">
                          <i className={`fa-solid ${item.icon}`} />
                        </span>
                        <span style={{ flex: 1, color: 'inherit' }}>{fixMojibakeText(item.label)}</span>
                        {item.screenPath && (
                          <button type="button" title="Ekran modunda aç (4:3)" onClick={e => { e.stopPropagation(); window.open(item.screenPath, '_blank') }}
                            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.3)', cursor: 'pointer', padding: '2px 4px', borderRadius: 4, fontSize: '.6rem', lineHeight: 1, flexShrink: 0 }}>
                            <i className="fa-solid fa-arrow-up-right-from-square" />
                          </button>
                        )}
                        <i className={`fa-solid fa-chevron-${openGroups[item.group] ? 'down' : 'right'}`} style={{ fontSize: '.55rem', opacity: 0.4 }} />
                      </div>
                    )}

                    {!isIconOnly && openGroups[item.group] && item.children.map(child => (
                      child.subGroup ? (
                        <div key={child.subGroup}>
                          <div className={`nav-item nav-child ${isActive(child.path) ? 'on' : ''}`} style={{ paddingRight: 8 }}
                            onClick={() => { if (child.path) navigate(child.path); toggleGroup(child.subGroup) }}>
                            <span className="nav-icon-box">
                              <i className={`fa-solid ${child.icon}`} />
                            </span>
                            <span style={{ flex: 1, color: 'inherit' }}>{fixMojibakeText(child.label)}</span>
                            <i className={`fa-solid fa-chevron-${openGroups[child.subGroup] ? 'down' : 'right'}`}
                              style={{ fontSize: '.5rem', opacity: 0.4 }}
                              onClick={e => { e.stopPropagation(); toggleGroup(child.subGroup) }} />
                          </div>
                          {openGroups[child.subGroup] && child.subChildren.map(subChild => (
                            <div key={subChild.path} className={`nav-item nav-child ${isActive(subChild.path) ? 'on' : ''}`}
                              style={{ paddingLeft: 36 }} onClick={() => handleNavSelect(subChild.path)}>
                              <span className="nav-icon-box" style={{ width: 22, height: 22, fontSize: '.62rem' }}>
                                <i className={`fa-solid ${subChild.icon}`} />
                              </span>
                              <span style={{ fontSize: '.78rem', color: 'inherit' }}>{fixMojibakeText(subChild.label)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div key={child.path} className={`nav-item nav-child ${isActive(child.path) ? 'on' : ''}`} onClick={() => handleNavSelect(child.path)}>
                          <span className="nav-icon-box">
                            <i className={`fa-solid ${child.icon}`} />
                          </span>
                          <span style={{ flex: 1, color: 'inherit' }}>{fixMojibakeText(child.label)}</span>
                          {child.screenPath && (
                            <button type="button" title="Ekran modunda aç (4:3)" onClick={e => { e.stopPropagation(); window.open(child.screenPath, '_blank') }}
                              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.3)', cursor: 'pointer', padding: '2px 4px', borderRadius: 4, fontSize: '.6rem', lineHeight: 1, flexShrink: 0 }}>
                              <i className="fa-solid fa-arrow-up-right-from-square" />
                            </button>
                          )}
                        </div>
                      )
                    ))}
                  </div>
                ) : (
                  <div key={item.path} className={`nav-item ${isActive(item.path) ? 'on' : ''}`}
                    style={isIconOnly ? { justifyContent: 'center', padding: '8px 0', pointerEvents: 'all' } : {}}
                    title={isIconOnly ? fixMojibakeText(item.label) : undefined}
                    onClick={() => handleNavSelect(item.path)}>
                    <span className="nav-icon-box">
                      <i className={`fa-solid ${item.icon}`} />
                    </span>
                    {!isIconOnly && (
                      <>
                        <span style={{ flex: 1, color: 'inherit' }}>{fixMojibakeText(item.label)}</span>
                        {item.screenPath && (
                          <button type="button" title="Ekran modunda aç (4:3)" onClick={e => { e.stopPropagation(); window.open(item.screenPath, '_blank') }}
                            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.3)', cursor: 'pointer', padding: '2px 4px', borderRadius: 4, fontSize: '.6rem', lineHeight: 1, flexShrink: 0 }}>
                            <i className="fa-solid fa-arrow-up-right-from-square" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )
              ))}
            </div>
          ))}
        </nav>

        {/* Bottom bar */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,.06)', padding: isIconOnly ? '8px 10px' : '8px 10px', flexShrink: 0 }}>
          {/* User info */}
          {!isIconOnly && user?.email && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                <span style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(59,130,246,.15)', color: '#60a5fa', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '.75rem' }}>
                  <i className="fa-solid fa-user" />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '.63rem', color: '#444', textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 700 }}>Hesap</div>
                  <div style={{ color: '#888', fontWeight: 600, fontSize: '.72rem', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>
                </div>
                <button type="button" onClick={signOut} disabled={authBusy} title="Çıkış Yap"
                  style={{ width: 26, height: 26, border: '1px solid rgba(248,113,113,.25)', background: 'rgba(127,29,29,.15)', color: '#f87171', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '.65rem' }}>
                  <i className={authBusy ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-arrow-right-from-bracket'} />
                </button>
              </div>
            </div>
          )}

          {/* Controls row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: isIconOnly ? 'center' : 'flex-start' }}>
            {/* Theme toggle */}
            <button type="button" title={theme === 'dark' ? 'Aydınlık moda geç' : 'Karanlık moda geç'} onClick={handleToggleTheme}
              style={{ width: 32, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'rgba(255,255,255,.07)', color: theme === 'dark' ? '#fbbf24' : '#888', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.75rem', flexShrink: 0 }}>
              <i className={`fa-solid ${theme === 'dark' ? 'fa-sun' : 'fa-moon'}`} />
            </button>

            {/* Display mode selector (full mode only) */}
            {!isIconOnly && (
              <div style={{ display: 'flex', gap: 3, marginLeft: 'auto' }}>
                {['auto', '4:3-safe', 'wide'].map(m => (
                  <button key={m} type="button" onClick={() => handleDisplayMode(m)} title={`Görüntüleme: ${m}`}
                    style={{ height: 28, padding: '0 7px', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: '.62rem', fontWeight: 700, letterSpacing: '.02em',
                      background: displayMode === m ? 'rgba(245,166,35,.18)' : 'rgba(255,255,255,.05)',
                      color: displayMode === m ? '#f5a623' : '#555' }}>
                    {m === 'auto' ? 'Auto' : m === '4:3-safe' ? '4:3' : 'Wide'}
                  </button>
                ))}
              </div>
            )}

            {/* Icon mode: user sign-out */}
            {isIconOnly && user?.email && (
              <button type="button" onClick={signOut} disabled={authBusy} title="Çıkış Yap"
                style={{ width: 32, height: 32, border: '1px solid rgba(248,113,113,.2)', background: 'rgba(127,29,29,.12)', color: '#f87171', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: '.7rem' }}>
                <i className={authBusy ? 'fa-solid fa-spinner fa-spin' : 'fa-solid fa-arrow-right-from-bracket'} />
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
