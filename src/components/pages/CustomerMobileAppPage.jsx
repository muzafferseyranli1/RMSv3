import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import CustomerLoyaltyMobileApp from '@/components/mobile/CustomerLoyaltyMobileApp'

function injectMetaTag(name, content) {
  let tag = document.querySelector(`meta[name="${name}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute('name', name)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

export default function CustomerMobileAppPage({ linkChannel = '' }) {
  const { token = '' } = useParams()
  const linkSession = linkChannel && token
    ? { channel: linkChannel, token }
    : null

  useEffect(() => {
    // PWA meta tag'ları — mobil uygulama davranışı için
    injectMetaTag('apple-mobile-web-app-capable', 'yes')
    injectMetaTag('apple-mobile-web-app-status-bar-style', 'black-translucent')
    injectMetaTag('mobile-web-app-capable', 'yes')
    injectMetaTag('theme-color', '#0f172a')

    // Viewport'a viewport-fit=cover ekle (notch desteği)
    const viewport = document.querySelector('meta[name="viewport"]')
    if (viewport) {
      const currentContent = viewport.getAttribute('content') || ''
      if (!currentContent.includes('viewport-fit')) {
        viewport.setAttribute('content', currentContent + ', viewport-fit=cover')
      }
    }

    // Sayfa başlığı
    const originalTitle = document.title
    document.title = 'Sadakat Uygulaması'

    return () => {
      document.title = originalTitle
    }
  }, [])

  return (
    <CustomerLoyaltyMobileApp
      mode="standalone"
      linkSession={linkSession}
    />
  )
}
