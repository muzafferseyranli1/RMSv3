import { Link, useParams } from 'react-router-dom'

const BACKUP_ROOT = 'C:/RMSdrive/RMS/suitable-rms'

const KIOSK_BACKUPS = [
  {
    id: '20260404-first-click-fix',
    label: '4 Nisan 21:13 First Click Fix',
    directory: 'temp-dist-kiosk-category-first-click-fix-20260404',
    summary: 'Kategori ilk dokunus hizalamasi sonrasi build',
  },
  {
    id: '20260404-intent-lock',
    label: '4 Nisan 22:00 Intent Lock',
    directory: 'temp-dist-kiosk-category-intent-lock-20260404',
    summary: 'Kategori intent lock sonrasi build',
  },
  {
    id: '20260404-smooth-drawer-check',
    label: '4 Nisan 22:17 Smooth Drawer Check',
    directory: 'temp-dist-kiosk-smooth-drawer-check-20260404',
    summary: 'Drawer davranisi kontrol buildi',
  },
  {
    id: '20260404-multi-station',
    label: '4 Nisan 23:00 Multi Station',
    directory: 'temp-dist-kiosk-multi-station-20260404',
    summary: 'Gun sonundaki en gec kiosk snapshot',
  },
]

function getBackupUrl(directory) {
  const normalizedRoot = BACKUP_ROOT.replace(/\\/g, '/')
  return encodeURI(`/@fs/${normalizedRoot}/${directory}/index.html`)
}

function frameShellStyle() {
  return {
    minHeight: '100vh',
    background: '#0f172a',
    color: '#e2e8f0',
    display: 'grid',
    gridTemplateRows: 'auto 1fr',
  }
}

export default function KioskBackupPreview() {
  const { backupId } = useParams()
  const activeBackup = KIOSK_BACKUPS.find(item => item.id === backupId) || null

  if (!activeBackup) {
    return (
      <div style={frameShellStyle()}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid rgba(148,163,184,.22)' }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>Kiosk 4 Nisan Arsivleri</div>
          <div style={{ marginTop: 8, fontSize: 14, color: '#94a3b8', maxWidth: 880, lineHeight: 1.6 }}>
            Bu sayfa local gelistirme icin secilen 4 Nisan kiosk snapshotlarini ayri ayri acmak icindir.
            Canli route degildir; localhost altinda karsilastirma icin kullanilir.
          </div>
          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <Link to="/kiosk" style={{ color: '#38bdf8', fontWeight: 700, textDecoration: 'none' }}>/kiosk</Link>
            <span style={{ color: '#fbbf24', fontWeight: 700 }}>/kiosk arsivlerin referans ekranidir</span>
          </div>
        </div>
        <div style={{ padding: 20, display: 'grid', gap: 14, alignContent: 'start' }}>
          {KIOSK_BACKUPS.map(item => (
            <Link
              key={item.id}
              to={`/kiosk/backup/${item.id}`}
              style={{
                textDecoration: 'none',
                color: '#e2e8f0',
                background: 'rgba(15,23,42,.72)',
                border: '1px solid rgba(148,163,184,.18)',
                borderRadius: 18,
                padding: '16px 18px',
                display: 'grid',
                gap: 6,
              }}
            >
              <div style={{ fontSize: 17, fontWeight: 800 }}>{item.label}</div>
              <div style={{ fontSize: 13, color: '#94a3b8' }}>{item.summary}</div>
              <div style={{ fontSize: 12, color: '#38bdf8' }}>/kiosk/backup/{item.id}</div>
            </Link>
          ))}
        </div>
      </div>
    )
  }

  const backupUrl = getBackupUrl(activeBackup.directory)

  return (
    <div style={frameShellStyle()}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(148,163,184,.22)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <Link to="/kiosk/backup" style={{ color: '#38bdf8', fontWeight: 700, textDecoration: 'none' }}>
          Arsiv Listesi
        </Link>
        <Link to="/kiosk" style={{ color: '#94a3b8', fontWeight: 700, textDecoration: 'none' }}>
          Guncel /kiosk
        </Link>
        <div style={{ color: '#e2e8f0', fontWeight: 800 }}>{activeBackup.label}</div>
        <a href={backupUrl} target="_blank" rel="noreferrer" style={{ color: '#fbbf24', fontWeight: 700, textDecoration: 'none' }}>
          Yeni sekmede ac
        </a>
      </div>
      <iframe
        title={activeBackup.label}
        src={backupUrl}
        style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
      />
    </div>
  )
}
