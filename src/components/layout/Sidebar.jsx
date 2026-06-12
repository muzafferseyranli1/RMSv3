import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { WORKSPACE_SECTION, useWorkspace } from '@/context/WorkspaceContext'
import { CHANGELOG, VERSION } from '@/version'
import { getTheme, toggleTheme as doToggleTheme } from '@/lib/theme'
import { getDisplayMode, setDisplayMode } from '@/lib/displayMode'
import { useSidebar } from '@/context/SidebarContext'
import { db } from '@/lib/db'

const NAV = [
  {
    section: 'Merkez',
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
          { label: 'Referans Programları', path: '/sadakat/referanslar', icon: 'fa-people-arrows', color: '#8b5cf6', bg: 'rgba(139,92,246,.18)' },
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
        label: 'İşlemler', icon: 'fa-file-invoice', color: '#60a5fa', bg: 'rgba(96,165,250,.18)',
        group: 'islemler',
        children: [
          { label: 'Belge Girişi', path: '/documents', icon: 'fa-file-arrow-down', color: '#60a5fa', bg: 'rgba(96,165,250,.18)' },
          { label: 'Görevler', path: '/tasks', icon: 'fa-list-check', color: '#38bdf8', bg: 'rgba(56,189,248,.18)' },
          { label: 'Görev Yöneticisi', path: '/gorev-yoneticisi', icon: 'fa-shield-halved', color: '#4f46e5', bg: 'rgba(79,70,229,.18)' },
          { label: 'Talepler ve İş Akışları', path: '/is-akisleri', icon: 'fa-route', color: '#10b981', bg: 'rgba(16,185,129,.18)' },
          { label: 'Form Şablonları', path: '/form-sablonlari', icon: 'fa-clipboard-list', color: '#8b5cf6', bg: 'rgba(139,92,246,.18)' },
          { label: 'Formlar', path: '/formlar', icon: 'fa-file-lines', color: '#22d3ee', bg: 'rgba(34,211,238,.18)' },
          { label: 'El Kitabı Yönetimi', path: '/manual-yonetimi', icon: 'fa-book-open-reader', color: '#a78bfa', bg: 'rgba(167,139,250,.18)' },
          { label: 'Ekipman Yönetimi', path: '/ekipman-yonetimi', icon: 'fa-screwdriver-wrench', color: '#f59e0b', bg: 'rgba(245,158,11,.18)' },
        ],
      },
      { label: 'DÃ¶nem KapanÄ±ÅŸÄ±', path: '/donem-kapanis', icon: 'fa-calendar-check', color: '#f87171', bg: 'rgba(248,113,113,.18)' },
    ],
  },
  {
    section: 'Şube',
    icon: 'fa-store',
    items: [
      { label: 'Masa Düzeni', path: '/:branchId/masalar', icon: 'fa-chair', color: '#8b5cf6', bg: 'rgba(139,92,246,.18)' },
      { label: 'POS ve Cihazlar', path: '/:branchId/cihazlar', icon: 'fa-cash-register', color: '#60a5fa', bg: 'rgba(96,165,250,.18)' },
      { label: 'Kiosk YÃ¶netimi', path: '/kiosk-management', icon: 'fa-sliders', color: '#a78bfa', bg: 'rgba(167,139,250,.18)' },
      { label: 'Tahmin', path: '/forecast', icon: 'fa-chart-line', color: '#8b5cf6', bg: 'rgba(139,92,246,.18)' },
      { label: 'SipariÅŸler', path: '/orders', icon: 'fa-receipt', color: '#60a5fa', bg: 'rgba(96,165,250,.18)' },
      { label: 'Mal Kabul', path: '/mal-kabul', icon: 'fa-truck-ramp-box', color: '#34d399', bg: 'rgba(52,211,153,.18)' },
      { label: 'Operasyon El Kitabı', path: '/manual', icon: 'fa-book-open', color: '#f59e0b', bg: 'rgba(245,158,11,.18)' },
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
          { label: 'Talepler ve İş Akışları', path: '/is-akisleri', icon: 'fa-route', color: '#10b981', bg: 'rgba(16,185,129,.18)' },
          { label: 'SayÄ±m', path: '/count', icon: 'fa-clipboard-check', color: '#34d399', bg: 'rgba(52,211,153,.18)' },
          { label: 'Transfer', path: '/sube-transfer', icon: 'fa-right-left', color: '#f59e0b', bg: 'rgba(245,158,11,.18)' },
          { label: 'Zayi KaydÄ±', path: '/sube-zayi-kaydi', icon: 'fa-trash-can', color: '#f87171', bg: 'rgba(248,113,113,.18)' },
          { label: 'Serbest KullanÄ±m KaydÄ±', path: '/sube-serbest-kullanim-kaydi', icon: 'fa-hand-holding', color: '#60a5fa', bg: 'rgba(96,165,250,.18)' },
          { label: 'Formlar', path: '/sube-formlar', icon: 'fa-file-lines', color: '#22d3ee', bg: 'rgba(34,211,238,.18)' },
          { label: 'Operasyon El Kitabı', path: '/manual', icon: 'fa-book-open', color: '#f59e0b', bg: 'rgba(245,158,11,.18)' },
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
      },
      { label: 'Kiosk', path: '/kiosk', icon: 'fa-tablet-screen-button', color: '#a78bfa', bg: 'rgba(167,139,250,.18)' },
      { label: 'Kiosk Tablet', path: '/kiosk-tablet', icon: 'fa-tablet', color: '#8b5cf6', bg: 'rgba(139,92,246,.18)' },
      { label: 'KDS (Mutfak)', path: '/kds', icon: 'fa-kitchen-set', color: '#f59e0b', bg: 'rgba(245,158,11,.18)', screenPath: '/kds-screen' },
      { label: 'Teslim EkranÄ±', path: '/pickup', icon: 'fa-hand-holding-box', color: '#22c55e', bg: 'rgba(34,197,94,.18)', screenPath: '/pickup-screen' },
      { label: 'SÄ±ra EkranÄ±', path: '/queue', icon: 'fa-tv', color: '#60a5fa', bg: 'rgba(96,165,250,.18)' },
    ],
  },
  {
    section: 'Ana Depo / WMS',
    icon: 'fa-warehouse',
    items: [
      { label: 'Şube Talepleri / Sevk Konsolu', path: '/depo-orders', icon: 'fa-warehouse', color: '#38bdf8', bg: 'rgba(56,189,248,.18)' },
      { label: 'Depo Satınalma Siparişleri', path: '/depo-satinalma', icon: 'fa-cart-shopping', color: '#fb923c', bg: 'rgba(251,146,60,.18)' },
      { label: 'Mal Kabul & Putaway', path: '/depo-mal-kabul', icon: 'fa-truck-ramp-box', color: '#34d399', bg: 'rgba(52,211,153,.18)' },
      {
        label: 'İşlemler', icon: 'fa-file-invoice', color: '#60a5fa', bg: 'rgba(96,165,250,.18)',
        group: 'anadepo-islemler',
        children: [
          { label: 'Belge Girişi', path: '/depo-documents', icon: 'fa-file-arrow-down', color: '#60a5fa', bg: 'rgba(96,165,250,.18)' },
          { label: 'Sayım', path: '/depo-count', icon: 'fa-clipboard-check', color: '#34d399', bg: 'rgba(52,211,153,.18)' },
          { label: 'Transfer', path: '/depo-transfer', icon: 'fa-right-left', color: '#f59e0b', bg: 'rgba(245,158,11,.18)' },
          { label: 'Lokasyon Taşıma', path: '/depo-iclokasyon-tasima', icon: 'fa-arrows-left-right', color: '#a78bfa', bg: 'rgba(167,139,250,.18)' },
          { label: 'Zayi Kaydı', path: '/depo-zayi-kaydi', icon: 'fa-trash-can', color: '#f87171', bg: 'rgba(248,113,113,.18)' },
          { label: 'Serbest Kullanım Kaydı', path: '/depo-serbest-kullanim-kaydi', icon: 'fa-hand-holding', color: '#60a5fa', bg: 'rgba(96,165,250,.18)' },
          { label: 'Formlar', path: '/depo-formlar', icon: 'fa-file-lines', color: '#22d3ee', bg: 'rgba(34,211,238,.18)' },
        ],
      },
      { label: 'GÃ¶revler', path: '/depo-tasks', icon: 'fa-list-check', color: '#38bdf8', bg: 'rgba(56,189,248,.18)' },
      { label: 'WMS Görevleri', path: '/depo-wms-tasks', icon: 'fa-tasks', color: '#818cf8', bg: 'rgba(129,140,248,.18)' },
      { label: 'WMS Mobil Panel', path: '/wms-mobile', icon: 'fa-mobile-screen-button', color: '#10b981', bg: 'rgba(16,185,129,.18)' },
      {
        label: 'Depo Ayarları', icon: 'fa-gear', color: '#f59e0b', bg: 'rgba(245,158,11,.18)',
        group: 'anadepo-ayarlar',
        children: [
          { label: 'Lokasyonlar', path: '/wms-locations', icon: 'fa-map-location-dot', color: '#34d399', bg: 'rgba(52,211,153,.18)' },
          { label: 'LPN / Paletler', path: '/wms-lpns', icon: 'fa-pallet', color: '#f59e0b', bg: 'rgba(245,158,11,.18)' },
          { label: 'Stok Parametreleri', path: '/wms-stock-params', icon: 'fa-sliders', color: '#6366f1', bg: 'rgba(99,102,241,.18)' },
        ],
      },
    ],
  },
  {
    section: 'Merkez Mutfak',
    icon: 'fa-industry',
    items: [
      { label: 'Ãœretim', path: '/merkezmutfak-uretim', icon: 'fa-industry', color: '#4ade80', bg: 'rgba(74,222,128,.18)' },
      { label: 'Mutfak Satınalma Siparişleri', path: '/merkezmutfak-satinalma', icon: 'fa-cart-shopping', color: '#fb923c', bg: 'rgba(251,146,60,.18)' },
      {
        label: 'Ä°ÅŸlemler', icon: 'fa-file-invoice', color: '#60a5fa', bg: 'rgba(96,165,250,.18)',
        group: 'merkez-mutfak-islemler',
        children: [
          { label: 'Belge GiriÅŸi', path: '/merkezmutfak-documents', icon: 'fa-file-arrow-down', color: '#60a5fa', bg: 'rgba(96,165,250,.18)' },
          { label: 'SayÄ±m', path: '/merkezmutfak-count', icon: 'fa-clipboard-check', color: '#34d399', bg: 'rgba(52,211,153,.18)' },
          { label: 'Transfer', path: '/merkezmutfak-transfer', icon: 'fa-right-left', color: '#f59e0b', bg: 'rgba(245,158,11,.18)' },
          { label: 'Zayi KaydÄ±', path: '/merkezmutfak-zayi-kaydi', icon: 'fa-trash-can', color: '#f87171', bg: 'rgba(248,113,113,.18)' },
          { label: 'Serbest KullanÄ±m KaydÄ±', path: '/merkezmutfak-serbest-kullanim-kaydi', icon: 'fa-hand-holding', color: '#60a5fa', bg: 'rgba(96,165,250,.18)' },
          { label: 'Formlar', path: '/merkezmutfak-formlar', icon: 'fa-file-lines', color: '#22d3ee', bg: 'rgba(34,211,238,.18)' },
        ],
      },
      { label: 'GÃ¶revler', path: '/merkezmutfak-tasks', icon: 'fa-list-check', color: '#38bdf8', bg: 'rgba(56,189,248,.18)' },
      {
        label: 'Zaman Takibi', icon: 'fa-stopwatch', color: '#f59e0b', bg: 'rgba(245,158,11,.18)',
        group: 'merkez-mutfak-zaman-takibi',
        children: [
          {
            label: 'Zaman Sayaçları', path: '/merkezmutfak-time-tracking/timers', icon: 'fa-stopwatch', color: '#f59e0b', bg: 'rgba(245,158,11,.18)',
            subGroup: 'merkez-mutfak-zaman-sayaclari',
            subChildren: [
              { label: 'Ön Ayarlar', path: '/merkezmutfak-time-tracking/timers/presets', icon: 'fa-sliders', color: '#fb923c', bg: 'rgba(251,146,60,.18)' },
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
      { label: 'Yapay Zeka Destek', path: '/destek', icon: 'fa-robot', color: '#10b981', bg: 'rgba(16,185,129,.18)' },
      { label: 'Tahmin AyarlarÄ±', path: '/settings', icon: 'fa-gear', color: '#94a3b8', bg: 'rgba(148,163,184,.18)' },
      { label: 'Müşteri App Ayarları', path: '/customer-app-settings', icon: 'fa-mobile-screen', color: '#10b981', bg: 'rgba(16,185,129,.18)' },
      { label: 'Hesap Ã‡izelgesi', path: '/hesap-cizelgesi', icon: 'fa-book-bookmark', color: '#f59e0b', bg: 'rgba(245,158,11,.18)' },
      { label: 'Muhasebe EÅŸleÅŸtirmeleri', path: '/muhasebe-eslestirmeleri', icon: 'fa-arrow-right-arrow-left', color: '#0f766e', bg: 'rgba(13,148,136,.16)' },
      { label: 'P&L Åžablonu', path: '/pnl-template', icon: 'fa-table-columns', color: '#dc2626', bg: 'rgba(220,38,38,.16)' },
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
      { label: 'Geribildirim Kategorileri', path: '/geribildirim-kategorileri', icon: 'fa-tags', color: '#ef4444', bg: 'rgba(239,68,68,.18)' },
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

const SECTION_COLORS = {
  'Merkez': '#60a5fa',         // Blue
  'Şube': '#ef4444',           // Red
  'POS ve Ekranlar': '#c084fc', // Purple
  'Ana Depo / WMS': '#34d399',  // Green
  'Merkez Mutfak': '#f97316',   // Orange
  'Ayarlar': '#f59e0b',         // Yellow/Orange
}

function getNavSectionKey(sectionName) {
  const name = String(sectionName || '').trim()
  if (name === 'Merkez') return WORKSPACE_SECTION.center
  if (name === 'Sube' || name === 'Şube' || name === 'Åube') return WORKSPACE_SECTION.branch
  if (name === 'POS ve Ekranlar') return WORKSPACE_SECTION.pos
  if (name === 'Ana Depo / WMS') return WORKSPACE_SECTION.warehouse
  if (name === 'Merkez Mutfak') return WORKSPACE_SECTION.kitchen
  if (name === 'Ayarlar') return WORKSPACE_SECTION.settings
  return WORKSPACE_SECTION.center
}

function prepareNavItem(item, sectionKey, branchId) {
  const rawPath = item.path || ''
  const path = rawPath.includes(':branchId') && branchId
    ? rawPath.replace(':branchId', branchId)
    : rawPath
  return {
    ...item,
    sectionKey,
    rawPath,
    path,
    children: item.children?.map(child => ({
      ...prepareNavItem(child, sectionKey, branchId),
      subChildren: child.subChildren?.map(subChild => prepareNavItem(subChild, sectionKey, branchId)),
    })),
  }
}

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, authBusy, signOut } = useAuth()
  const {
    getSectionSession,
    getSectionStatus,
    isSectionVisible,
    toggleSectionVisible,
    openSectionLogin,
    resolveSectionPath,
  } = useWorkspace()
  const { mode, mobileOpen, setMobileOpen, togglePin, isPinned, autoMode } = useSidebar()

  const branchSession = getSectionSession(WORKSPACE_SECTION.branch)
  const warehouseSession = getSectionSession(WORKSPACE_SECTION.warehouse)
  const branchId = branchSession?.branchId || ''
  const branchName = branchSession?.branchName || ''
  const wmsBranchId = warehouseSession?.branchId || ''
  const [wmsPendingOrdersCount, setWmsPendingOrdersCount] = useState(0)
  const [wmsIncomingShipmentsCount, setWmsIncomingShipmentsCount] = useState(0)

  useEffect(() => {
    let active = true
    if (!wmsBranchId) {
      setWmsPendingOrdersCount(0)
      setWmsIncomingShipmentsCount(0)
      return
    }

    async function fetchWmsCounts() {
      try {
        // 1. Fetch outgoing pending orders count for WMS console
        // First find synced internal supplier for this depot branch
        const { data: supplierData } = await db
          .from('suppliers')
          .select('id')
          .eq('supplier_kind', 'internal_warehouse')
          .eq('source_branch_id', wmsBranchId)
          .is('deleted_at', null)
          .limit(1)

        if (active && supplierData && supplierData.length > 0) {
          const supplierId = supplierData[0].id
          const { data: outgoingOrders } = await db
            .from('purchase_orders')
            .select('meta')
            .eq('supplier_id', supplierId)
            .eq('flow_channel', 'warehouse_replenishment')
            .eq('status', 'submitted')
            .is('deleted_at', null)

          if (active && outgoingOrders) {
            const pending = outgoingOrders.filter(o => {
              const parsed = typeof o.meta === 'string' ? JSON.parse(o.meta) : (o.meta || {})
              return !parsed.supplier_marked_sent && !parsed.supplier_sent_at
            })
            setWmsPendingOrdersCount(pending.length)
          }
        } else if (active) {
          setWmsPendingOrdersCount(0)
        }

        // 2. Fetch incoming WMS shipments count for Mal Kabul (where current branch is receiver)
        const { data: incomingOrders } = await db
          .from('purchase_orders')
          .select('meta')
          .eq('branch_id', wmsBranchId)
          .eq('flow_channel', 'warehouse_replenishment')
          .in('status', ['submitted', 'partially_received'])
          .is('deleted_at', null)

        if (active && incomingOrders) {
          const incoming = incomingOrders.filter(o => {
            const parsed = typeof o.meta === 'string' ? JSON.parse(o.meta) : (o.meta || {})
            return parsed.supplier_marked_sent || parsed.supplier_sent_at
          })
          setWmsIncomingShipmentsCount(incoming.length)
        } else if (active) {
          setWmsIncomingShipmentsCount(0)
        }
      } catch (err) {
        console.error('Error fetching WMS counts for sidebar:', err)
      }
    }

    fetchWmsCounts()
    // Refresh every 30 seconds
    const interval = setInterval(fetchWmsCounts, 30000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [wmsBranchId])
  const isIconOnly = mode === 'icon'
  const isMobileMode = mode === 'closed'
  const isVisible = !isMobileMode || mobileOpen

  const visibleSections = useMemo(
    () => NAV
      .map(section => ({
        ...section,
        sectionKey: getNavSectionKey(fixMojibakeText(section.section)),
        items: section.items.map(item => prepareNavItem(item, getNavSectionKey(fixMojibakeText(section.section)), branchId)),
      })),
    [branchId],
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

  const handleNavSelect = (path, sectionKey) => {
    if (!path) return
    const sectionSession = getSectionSession(sectionKey)
    if (!sectionSession?.employeeId) {
      openSectionLogin(sectionKey, { targetPath: path })
      return
    }
    const resolvedPath = resolveSectionPath(sectionKey, path)
    if (!resolvedPath || resolvedPath.includes(':branchId')) {
      openSectionLogin(sectionKey, { targetPath: path })
      return
    }
    navigate(resolvedPath)
    if (isMobileMode) setMobileOpen(false)
  }

  const handleScreenOpen = (screenPath, sectionKey) => {
    if (!screenPath) return
    const sectionSession = getSectionSession(sectionKey)
    if (!sectionSession?.employeeId) {
      openSectionLogin(sectionKey, { targetPath: screenPath })
      return
    }
    window.open(resolveSectionPath(sectionKey, screenPath) || screenPath, '_blank')
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
      if (!isSectionVisible(section.sectionKey)) return
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
  }, [visibleSections, isSectionVisible])

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
                  <div key={item.path} onClick={() => { handleNavSelect(item.rawPath || item.path, item.sectionKey); setSearchQ('') }}
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
          {visibleSections.map(section => {
            const secName = fixMojibakeText(section.section)
            const sectionColor = SECTION_COLORS[secName] || '#888888'
            const sectionKey = section.sectionKey
            const sectionOpen = isSectionVisible(sectionKey)
            const sectionStatus = getSectionStatus(sectionKey)
            return (
              <div key={section.section} style={!isIconOnly ? {
                borderLeft: `3px solid ${sectionColor}`,
                background: `linear-gradient(90deg, ${sectionColor}05, transparent)`,
                marginBottom: '16px',
              } : {}}>
                {!isIconOnly && (
                  <div className="sec-lbl" onClick={() => openSectionLogin(sectionKey)} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '12px 14px 6px',
                    color: sectionColor,
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    cursor: 'pointer',
                  }}>
                    <i className={`fa-solid ${section.icon}`} style={{ fontSize: '0.75rem', color: sectionColor }} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span>{secName}</span>
                      {sectionStatus && (
                        <span style={{ display: 'block', marginTop: 2, fontSize: '.58rem', color: '#9ca3af', letterSpacing: 0, textTransform: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {sectionStatus}
                        </span>
                      )}
                    </span>
                    <input
                      type="checkbox"
                      checked={sectionOpen}
                      onChange={event => {
                        event.stopPropagation()
                        toggleSectionVisible(sectionKey)
                      }}
                      onClick={event => event.stopPropagation()}
                      title="Alt menuleri goster/gizle"
                      style={{ width: 13, height: 13, accentColor: sectionColor, cursor: 'pointer', flexShrink: 0 }}
                    />
                    <div className="sec-lbl-line" style={{ background: `linear-gradient(90deg, ${sectionColor}22, transparent)` }} />
                  </div>
                )}
                {isIconOnly && (
                  <button
                    type="button"
                    title={sectionStatus ? `${secName} - ${sectionStatus}` : secName}
                    onClick={() => openSectionLogin(sectionKey)}
                    style={{ width: '100%', height: 30, border: 'none', background: 'transparent', color: sectionColor, cursor: 'pointer' }}
                  >
                    <i className={`fa-solid ${section.icon}`} />
                  </button>
                )}

              {sectionOpen && section.items.map(item => (
                item.children ? (
                  <div key={item.label} className={`nav-parent ${openGroups[item.group] ? 'open' : ''}`}>
                    {isIconOnly ? (
                      <div className="nav-item" title={fixMojibakeText(item.label)} style={{ justifyContent: 'center', padding: '8px 0', pointerEvents: 'all' }}
                        onClick={() => handleNavSelect(item.rawPath || item.path || getFirstChildPath(item), item.sectionKey)}>
                        <span className="nav-icon-box">
                          <i className={`fa-solid ${item.icon}`} />
                        </span>
                      </div>
                    ) : (
                      <div className="nav-item" onClick={() => {
                        if (item.path) handleNavSelect(item.rawPath || item.path, item.sectionKey)
                        toggleGroup(item.group)
                      }}>
                        <span className="nav-icon-box">
                          <i className={`fa-solid ${item.icon}`} />
                        </span>
                        <span style={{ flex: 1, color: 'inherit' }}>{fixMojibakeText(item.label)}</span>
                        {item.screenPath && (
                          <button type="button" title="Ekran modunda aç (4:3)" onClick={e => { e.stopPropagation(); handleScreenOpen(item.screenPath, item.sectionKey) }}
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
                            onClick={() => { if (child.path) handleNavSelect(child.rawPath || child.path, child.sectionKey); toggleGroup(child.subGroup) }}>
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
                              style={{ paddingLeft: 36 }} onClick={() => handleNavSelect(subChild.rawPath || subChild.path, subChild.sectionKey)}>
                              <span className="nav-icon-box" style={{ width: 22, height: 22, fontSize: '.62rem' }}>
                                <i className={`fa-solid ${subChild.icon}`} />
                              </span>
                              <span style={{ fontSize: '.78rem', color: 'inherit' }}>{fixMojibakeText(subChild.label)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div key={child.path} className={`nav-item nav-child ${isActive(child.path) ? 'on' : ''}`} onClick={() => handleNavSelect(child.rawPath || child.path, child.sectionKey)}>
                          <span className="nav-icon-box">
                            <i className={`fa-solid ${child.icon}`} />
                          </span>
                          <span style={{ flex: 1, color: 'inherit' }}>{fixMojibakeText(child.label)}</span>
                          {child.screenPath && (
                            <button type="button" title="Ekran modunda aç (4:3)" onClick={e => { e.stopPropagation(); handleScreenOpen(child.screenPath, child.sectionKey) }}
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
                    onClick={() => handleNavSelect(item.rawPath || item.path, item.sectionKey)}>
                    <span className="nav-icon-box">
                      <i className={`fa-solid ${item.icon}`} />
                    </span>
                    {!isIconOnly && (
                      <>
                        <span style={{ flex: 1, color: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span>{fixMojibakeText(item.label)}</span>
                          {item.path === '/depo-orders' && wmsPendingOrdersCount > 0 && (
                            <span style={{
                              background: '#38bdf8',
                              color: '#0f172a',
                              fontSize: '.7rem',
                              fontWeight: 900,
                              borderRadius: 6,
                              padding: '2px 6px',
                              lineHeight: 1
                            }}>
                              {wmsPendingOrdersCount}
                            </span>
                          )}
                          {item.path === '/depo-mal-kabul' && wmsIncomingShipmentsCount > 0 && (
                            <span style={{
                              background: '#34d399',
                              color: '#064e3b',
                              fontSize: '.7rem',
                              fontWeight: 900,
                              borderRadius: 6,
                              padding: '2px 6px',
                              lineHeight: 1
                            }}>
                              {wmsIncomingShipmentsCount}
                            </span>
                          )}
                        </span>
                        {item.screenPath && (
                          <button type="button" title="Ekran modunda aç (4:3)" onClick={e => { e.stopPropagation(); handleScreenOpen(item.screenPath, item.sectionKey) }}
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
          )})}
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
