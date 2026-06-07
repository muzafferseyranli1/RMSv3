import React from 'react'
import Header from '@/components/layout/Header'

export default function MobileAppShells({ screenKey = 'personnel' }) {
  const isPersonnel = screenKey === 'personnel'
  const isCustomer = screenKey === 'customer'
  const isBoss = screenKey === 'boss'

  let title = ''
  let subtitle = ''
  let icon = ''
  let content = null

  if (isPersonnel) {
    title = 'Mobil App Personel'
    subtitle = 'Mobil personel drawer ve uzaktan Garson kontrol yüzeyi.'
    icon = 'fa-user-tie'
    content = (
      <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 600 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: '#38bdf818', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="fa-solid fa-mobile-screen-button" style={{ fontSize: '1.5rem', color: '#0284c7' }} />
          </div>
          <div>
            <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.1rem' }}>Test APK Kurulumu</h3>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.8rem' }}>Android cihazınızda veya emülatörünüzde test etmek için:</p>
          </div>
        </div>
        
        <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: 16 }}>
          <p style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: '#94a3b8' }}>
            Lütfen test için aşağıdaki klasörden APK dosyasını yükleyin:
          </p>
          <code style={{ display: 'block', wordBreak: 'break-all', backgroundColor: '#0f172a', padding: 12, borderRadius: 6, color: '#38bdf8', fontFamily: 'monospace', fontSize: '0.85rem' }}>
            C:\RMSv3\personel-android\app\build\outputs\apk\debug
          </code>
        </div>

        <a 
          href="file:///C:/RMSv3/personel-android/app/build/outputs/apk/debug"
          style={{ textDecoration: 'none', color: '#38bdf8', fontWeight: 'bold', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <i className="fa-solid fa-folder-open" /> Klasörü Aç (Local Tarayıcılar İçin)
        </a>
      </div>
    )
  } else if (isCustomer) {
    title = 'Mobil App Müşteri'
    subtitle = 'Müşteri sadakat deneyimi, cüzdan ve kupon simülasyonu.'
    icon = 'fa-user-group'
    content = (
      <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 600 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: '#fb718518', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <i className="fa-solid fa-mobile-screen-button" style={{ fontSize: '1.5rem', color: '#e11d48' }} />
          </div>
          <div>
            <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.1rem' }}>Test APK Kurulumu</h3>
            <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.8rem' }}>Android cihazınızda veya emülatörünüzde test etmek için:</p>
          </div>
        </div>
        
        <div style={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 10, padding: 16 }}>
          <p style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: '#94a3b8' }}>
            Lütfen test için aşağıdaki klasörden APK dosyasını yükleyin:
          </p>
          <code style={{ display: 'block', wordBreak: 'break-all', backgroundColor: '#0f172a', padding: 12, borderRadius: 6, color: '#fb7185', fontFamily: 'monospace', fontSize: '0.85rem' }}>
            C:\RMSv3\musteri-android\app\build\outputs\apk\debug
          </code>
        </div>

        <a 
          href="file:///C:/RMSv3/musteri-android/app/build/outputs/apk/debug"
          style={{ textDecoration: 'none', color: '#fb7185', fontWeight: 'bold', fontSize: '0.85rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <i className="fa-solid fa-folder-open" /> Klasörü Aç (Local Tarayıcılar İçin)
        </a>
      </div>
    )
  } else if (isBoss) {
    title = 'Boss Mobil Uygulaması'
    subtitle = 'İşletme sahibi rapor ve yönetim ekranları.'
    icon = 'fa-crown'
    content = (
      <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 600, alignItems: 'center', justifyContent: 'center', textAlign: 'center', minHeight: 200 }}>
        <div style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#a78bfa18', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
          <i className="fa-solid fa-crown" style={{ fontSize: '2rem', color: '#8b5cf6' }} />
        </div>
        <h3 style={{ margin: 0, color: '#f8fafc', fontSize: '1.2rem' }}>Boss Mobil Uygulaması</h3>
        <p style={{ margin: 0, color: '#94a3b8', fontSize: '0.9rem', fontWeight: '500' }}>Yapım Aşamasında</p>
      </div>
    )
  }

  return (
    <>
      <Header title={title} subtitle={subtitle} />
      {content}
    </>
  )
}
