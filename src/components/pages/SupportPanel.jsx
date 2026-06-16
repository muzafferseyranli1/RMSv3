import React, { useState, useEffect, useRef } from 'react'
import Header from '@/components/layout/Header'
import { useToast } from '@/hooks/useToast'
import { buildApiUrl } from '@/lib/db'

export default function SupportPanel() {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      sender: 'ai',
      text: `Merhaba! Ben **SuitableRMS Eğitim Danışmanınızım** 🎓

Sistemi kullanmakla ilgili her türlü sorunuzu sorabilirsiniz. Adım adım yönlendiririm. Örneğin:
- *"Menüye yeni ürün nasıl eklenir?"*
- *"Müşterilerim azaldı, ne yapabilirim?"*
- *"Sipariş oluşturmayı anlat"*

Nasıl yardımcı olabilirim?`,
      timestamp: new Date()
    }
  ])
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [feedbackSent, setFeedbackSent] = useState({}) // { messageId: 'positive'|'negative' }
  const messagesEndRef = useRef(null)
  const toast = useToast()

  // Otomatik aşağı kaydırma
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading])

  // Basit ve güvenli inline Markdown parser
  const parseMarkdown = (text) => {
    if (!text) return ''
    
    // HTML enjeksiyonunu engelle
    let clean = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

    // Başlıklar
    clean = clean.replace(/^### (.*?)$/gm, '<h3 class="text-base font-bold mt-3 mb-1.5 text-slate-800">$1</h3>')
    clean = clean.replace(/^## (.*?)$/gm, '<h2 class="text-lg font-bold mt-4 mb-2 text-slate-800 border-b border-slate-100 pb-1">$1</h2>')
    clean = clean.replace(/^# (.*?)$/gm, '<h1 class="text-xl font-bold mt-6 mb-3 text-slate-900 border-b-2 border-slate-200 pb-1.5">$1</h1>')

    // Kalın Yazı
    clean = clean.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-slate-900">$1</strong>')

    // Maddeler / Listeler
    clean = clean.replace(/^\* (.*?)$/gm, '<li class="ml-4 list-disc text-slate-700 my-0.5">$1</li>')
    clean = clean.replace(/^- (.*?)$/gm, '<li class="ml-4 list-disc text-slate-700 my-0.5">$1</li>')

    // Kod Blokları
    clean = clean.replace(/`(.*?)`/g, '<code class="bg-slate-100 text-pink-600 px-1 py-0.5 rounded font-mono text-xs font-semibold">$1</code>')

    // Markdown Linkleri: [Metin](URL)
    // Localhost linkleri yeni sekmede, diğer linkler normal açılır
    clean = clean.replace(/\[(.*?)\]\((.*?)\)/g, (match, linkText, url) => {
      const isLocalhost = url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')
      const target = isLocalhost ? '_blank' : '_self'
      const rel = isLocalhost ? 'noopener noreferrer' : ''
      return `<a href="${url}" target="${target}" rel="${rel}" class="text-emerald-600 hover:text-emerald-700 underline font-semibold transition-colors duration-150">${linkText}</a>`
    })

    // Satır Atlamaları
    clean = clean.replace(/\n/g, '<br/>')

    return <div dangerouslySetInnerHTML={{ __html: clean }} className="space-y-1 text-sm leading-relaxed" />
  }

  const handleSend = async (e) => {
    if (e) e.preventDefault()
    const trimmed = inputValue.trim()
    if (!trimmed || loading) return

    const userMsg = {
      id: `user-${Date.now()}`,
      sender: 'user',
      text: trimmed,
      timestamp: new Date()
    }

    setMessages((prev) => [...prev, userMsg])
    setInputValue('')
    setLoading(true)

    try {
      const response = await fetch(buildApiUrl('/api/support/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: trimmed,
          origin: window.location.origin
        })
      })

      const result = await response.json()
      if (!response.ok || result.error) {
        const err = result.error || {}
        const errorType = err.error_type || 'unknown'
        let friendlyMsg = ''

        if (errorType === 'overload') {
          friendlyMsg = `Yapay zeka şu an yoğun talep altında — biraz bekleyip tekrar deneyin. 🕐\n\n_(Hata: ${err.message})_`
        } else if (errorType === 'api_error') {
          friendlyMsg = `Yapay zeka servisinden bir hata döndü. Lütfen birkaç dakika sonra tekrar deneyin.\n\n_(Hata: ${err.message})_`
        } else if (errorType === 'network_error') {
          friendlyMsg = `Sunucuya ulaşılamadı. Sunucunun çalıştığından emin olun.\n\n_(Hata: ${err.message})_`
        } else {
          friendlyMsg = `Bir sorun oluştu: **${err.message || 'Bilinmeyen hata'}**`
        }

        const errorMsg = {
          id: `err-${Date.now()}`,
          sender: 'ai',
          text: friendlyMsg,
          timestamp: new Date()
        }
        setMessages((prev) => [...prev, errorMsg])
        return
      }

      const aiMsg = {
        id: `ai-${Date.now()}`,
        sender: 'ai',
        text: result.data.reply,
        question: trimmed, // feedback için soruyu sakla
        foundInKb: result.data.foundInKb,
        timestamp: new Date()
      }

      setMessages((prev) => [...prev, aiMsg])
    } catch (err) {
      console.error('Destek mesajı gönderilirken hata oluştu:', err)
      const errorMsg = {
        id: `err-${Date.now()}`,
        sender: 'ai',
        text: `Sunucuya bağlanılamadı. Sunucunun çalıştığından emin olun.\n\n_(${err.message})_`,
        timestamp: new Date()
      }
      setMessages((prev) => [...prev, errorMsg])
    } finally {
      setLoading(false)
    }
  }

  // Feedback gönderme
  const handleFeedback = async (msgId, rating, question, answer) => {
    if (feedbackSent[msgId]) return
    setFeedbackSent(prev => ({ ...prev, [msgId]: rating }))
    try {
      await fetch(buildApiUrl('/api/support/feedback'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, question: question || '', answer: answer?.substring(0, 200) || '' })
      })
    } catch (e) { /* sessiz hata */ }
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <Header title="Yapay Zeka Destek Masası" />
      
      <div className="flex-1 overflow-hidden p-4 md:p-6 flex flex-col max-w-5xl w-full mx-auto">
        {/* Sohbet Alanı Kartı */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-100 shadow-sm flex flex-col overflow-hidden">
          
          {/* Header Durum Barı */}
          <div className="bg-slate-50 border-b border-slate-100 px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-semibold text-slate-600">Eğitim Danışmanı Aktif</span>
            </div>
            <span className="text-[10px] text-slate-400 font-medium">SuitableRMS AI v2.0</span>
          </div>

          {/* Mesaj Listesi */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex w-full ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[82%] rounded-2xl px-4 py-3 shadow-sm ${
                    msg.sender === 'user'
                      ? 'bg-emerald-600 text-white rounded-tr-none'
                      : 'bg-slate-50 text-slate-700 border border-slate-100 rounded-tl-none'
                  }`}
                >
                  {/* Gönderici İsmi */}
                  <div className="flex items-center gap-1.5 mb-1">
                    <i className={`fa ${msg.sender === 'user' ? 'fa-user' : 'fa-graduation-cap'} text-[10px] opacity-75`} />
                    <span className="text-[10px] font-bold tracking-wide uppercase opacity-75">
                      {msg.sender === 'user' ? 'Siz' : 'Eğitim Danışmanı'}
                    </span>
                  </div>

                  {/* Mesaj İçeriği */}
                  <div className="text-slate-800">
                    {msg.sender === 'user' ? (
                      <p className="text-sm whitespace-pre-wrap text-white font-medium">{msg.text}</p>
                    ) : (
                      parseMarkdown(msg.text)
                    )}
                  </div>

                  {/* Saat + Feedback Butonları (sadece AI mesajları için) */}
                  <div className={`mt-1.5 flex items-center ${msg.sender === 'user' ? 'justify-end' : 'justify-between'} gap-2`}>
                    <div className={`text-[9px] opacity-60 ${msg.sender === 'user' ? 'text-white' : 'text-slate-500'}`}>
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    {msg.sender === 'ai' && msg.id !== 'welcome' && (
                      <div className="flex items-center gap-1">
                        {feedbackSent[msg.id] ? (
                          <span className="text-[9px] text-slate-400 italic">
                            {feedbackSent[msg.id] === 'positive' ? '✓ Teşekkürler!' : '✓ Not aldım!'}
                          </span>
                        ) : (
                          <>
                            <button
                              onClick={() => handleFeedback(msg.id, 'positive', msg.question, msg.text)}
                              className="text-[11px] hover:scale-110 transition-transform opacity-50 hover:opacity-100"
                              title="Bu cevap yardımcı oldu"
                            >👍</button>
                            <button
                              onClick={() => handleFeedback(msg.id, 'negative', msg.question, msg.text)}
                              className="text-[11px] hover:scale-110 transition-transform opacity-50 hover:opacity-100"
                              title="Bu cevap yetersizdi"
                            >👎</button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Yükleniyor / Yazıyor Balonu */}
            {loading && (
              <div className="flex w-full justify-start">
                <div className="bg-slate-50 text-slate-700 border border-slate-100 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <i className="fa fa-robot text-[10px] opacity-75" />
                    <span className="text-[10px] font-bold tracking-wide uppercase opacity-75">Destek Asistanı</span>
                  </div>
                  <div className="flex items-center gap-1 py-1 px-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>

          {/* Mesaj Giriş Barı */}
          <form onSubmit={handleSend} className="p-4 border-t border-slate-100 bg-white flex gap-2">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Sorunuzu buraya yazın..."
              disabled={loading}
              className="flex-1 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all duration-150 placeholder-slate-400"
            />
            <button
              type="submit"
              disabled={!inputValue.trim() || loading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:bg-slate-100 disabled:text-slate-400 font-semibold text-sm px-5 rounded-xl flex items-center justify-center gap-2 transition-all duration-150 shadow-sm disabled:shadow-none"
            >
              <i className="fa fa-paper-plane" />
              <span>Gönder</span>
            </button>
          </form>

        </div>
      </div>
    </div>
  )
}
