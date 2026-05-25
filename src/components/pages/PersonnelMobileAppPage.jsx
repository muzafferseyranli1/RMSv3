import { useEffect } from 'react'
import { PersonnelPhone } from './MobileAppShells'

function injectMetaTag(name, content) {
  let tag = document.querySelector(`meta[name="${name}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute('name', name)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

export default function PersonnelMobileAppPage() {
  useEffect(() => {
    // PWA meta tags
    injectMetaTag('apple-mobile-web-app-capable', 'yes')
    injectMetaTag('apple-mobile-web-app-status-bar-style', 'black-translucent')
    injectMetaTag('mobile-web-app-capable', 'yes')
    injectMetaTag('theme-color', '#0f172a')

    // Add viewport viewport-fit=cover
    const viewport = document.querySelector('meta[name="viewport"]')
    if (viewport) {
      const currentContent = viewport.getAttribute('content') || ''
      if (!currentContent.includes('viewport-fit')) {
        viewport.setAttribute('content', currentContent + ', viewport-fit=cover')
      }
    }

    const originalTitle = document.title
    document.title = 'Personel Uygulaması'

    return () => {
      document.title = originalTitle
    }
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      width: '100vw',
      display: 'grid',
      placeItems: 'center',
      background: '#0f172a',
      padding: 0,
      overflow: 'hidden',
      boxSizing: 'border-box'
    }}>
      <PersonnelPhone mode="standalone" />
    </div>
  )
}
