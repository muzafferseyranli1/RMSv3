import React, { useEffect, useState } from 'react'
import { db } from '@/lib/db'
import { useToast } from '@/hooks/useToast'

export default function QuestionAnswerPortal() {
  const toast = useToast()
  
  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')

  // QA states
  const [questions, setQuestions] = useState([])
  const [selectedQuestion, setSelectedQuestion] = useState(null)
  const [answers, setAnswers] = useState([])
  const [loadingQuestions, setLoadingQuestions] = useState(false)
  const [loadingAnswers, setLoadingAnswers] = useState(false)

  // Form states
  const [questionForm, setQuestionForm] = useState({ authorName: '', questionText: '' })
  const [answerForm, setAnswerForm] = useState({ authorName: '', answerText: '' })

  // Check auth in sessionStorage on mount
  useEffect(() => {
    try {
      const isAuth = window.sessionStorage.getItem('qa_portal_auth') === 'true'
      if (isAuth) {
        setIsAuthenticated(true)
      }
    } catch (e) {
      // ignore
    }
  }, [])

  // Load questions when authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadQuestions()
    }
  }, [isAuthenticated])

  // Load answers when selected question changes
  useEffect(() => {
    if (selectedQuestion) {
      loadAnswers(selectedQuestion.id)
    } else {
      setAnswers([])
    }
  }, [selectedQuestion])

  // Load questions from DB
  async function loadQuestions() {
    setLoadingQuestions(true)
    // We select all questions and order by created_at desc
    const { data, error } = await db.from('qa_questions')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      toast('Sorular yüklenirken hata oluştu: ' + error.message, 'error')
    } else {
      // For each question, we'll also fetch answer count.
      // Since this is a simple portal, we can fetch all answers once or get counts.
      // To keep it simple and robust, let's fetch all answers to build a count map.
      const { data: allAnswers, error: ansError } = await db.from('qa_answers').select('question_id')
      if (!ansError && allAnswers) {
        const counts = {}
        allAnswers.forEach(ans => {
          counts[ans.question_id] = (counts[ans.question_id] || 0) + 1
        })
        const questionsWithCounts = (data || []).map(q => ({
          ...q,
          answerCount: counts[q.id] || 0
        }))
        setQuestions(questionsWithCounts)
      } else {
        setQuestions((data || []).map(q => ({ ...q, answerCount: 0 })))
      }
    }
    setLoadingQuestions(false)
  }

  // Load answers for a question from DB
  async function loadAnswers(questionId) {
    setLoadingAnswers(true)
    const { data, error } = await db.from('qa_answers')
      .select('*')
      .eq('question_id', questionId)
      .order('created_at', { ascending: true })

    if (error) {
      toast('Cevaplar yüklenirken hata oluştu: ' + error.message, 'error')
    } else {
      setAnswers(data || [])
    }
    setLoadingAnswers(false)
  }

  // Handle portal login
  function handleLogin(e) {
    e.preventDefault()
    if (password === '2026') {
      try {
        window.sessionStorage.setItem('qa_portal_auth', 'true')
      } catch (err) {
        // ignore
      }
      setIsAuthenticated(true)
      setAuthError('')
      toast('Giriş başarılı!', 'success')
    } else {
      setAuthError('Hatalı şifre. Lütfen tekrar deneyin.')
      toast('Şifre hatalı!', 'error')
    }
  }

  // Handle logout
  function handleLogout() {
    try {
      window.sessionStorage.removeItem('qa_portal_auth')
    } catch (e) {
      // ignore
    }
    setIsAuthenticated(false)
    setSelectedQuestion(null)
    setQuestions([])
    setPassword('')
    toast('Çıkış yapıldı.', 'info')
  }

  // Handle add question
  async function handleAddQuestion(e) {
    e.preventDefault()
    const author = questionForm.authorName.trim()
    const text = questionForm.questionText.trim()

    if (!author) {
      toast('Lütfen adınızı yazın.', 'error')
      return
    }
    if (!text) {
      toast('Lütfen sorunuzu yazın.', 'error')
      return
    }

    const payload = {
      author_name: author,
      question_text: text
    }

    const { data, error } = await db.from('qa_questions').insert(payload)
    if (error) {
      toast('Soru eklenirken hata oluştu: ' + error.message, 'error')
    } else {
      toast('Sorunuz başarıyla eklendi.', 'success')
      setQuestionForm({ authorName: author, questionText: '' }) // keep the author name for convenience
      loadQuestions()
    }
  }

  // Handle add answer
  async function handleAddAnswer(e) {
    e.preventDefault()
    if (!selectedQuestion) return

    const author = answerForm.authorName.trim()
    const text = answerForm.answerText.trim()

    if (!author) {
      toast('Lütfen adınızı yazın.', 'error')
      return
    }
    if (!text) {
      toast('Lütfen cevabınızı yazın.', 'error')
      return
    }

    const payload = {
      question_id: selectedQuestion.id,
      author_name: author,
      answer_text: text
    }

    const { data, error } = await db.from('qa_answers').insert(payload)
    if (error) {
      toast('Cevap eklenirken hata oluştu: ' + error.message, 'error')
    } else {
      toast('Cevabınız başarıyla eklendi.', 'success')
      setAnswerForm({ authorName: author, answerText: '' }) // keep the author name for convenience
      loadAnswers(selectedQuestion.id)
      
      // Update selected question answer count locally and in question list
      setQuestions(prev => prev.map(q => {
        if (q.id === selectedQuestion.id) {
          return { ...q, answerCount: q.answerCount + 1 }
        }
        return q
      }))
    }
  }

  // Format date helper
  function formatDate(dateStr) {
    if (!dateStr) return ''
    try {
      const d = new Date(dateStr)
      if (isNaN(d.getTime())) return ''
      return d.toLocaleString('tr-TR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch (e) {
      return ''
    }
  }

  // Login Screen Render
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center relative overflow-hidden px-4">
        {/* Decorative background glow circles */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full filter blur-[80px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-600/20 rounded-full filter blur-[80px]" />

        <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-xl border border-slate-800 p-8 rounded-2xl shadow-2xl relative z-10">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-tr from-purple-500 to-indigo-500 mb-4 shadow-lg shadow-purple-500/35">
              <i className="fa-solid fa-circle-question text-white text-2xl" />
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-violet-400 via-pink-400 to-amber-300 bg-clip-text text-transparent mb-2">
              Soru-Cevap Portalı
            </h1>
            <p className="text-slate-400 text-sm">
              SuitableRMS iş birliği ve fikir paylaşım platformu.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-slate-300 text-sm font-medium mb-2">Giriş Şifresi</label>
              <div className="relative">
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950/70 border border-slate-800 text-white rounded-lg px-4 py-3 outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition-all placeholder-slate-600"
                  required
                  autoFocus
                />
              </div>
              {authError && (
                <p className="text-red-400 text-xs mt-2 flex items-center gap-1">
                  <i className="fa-solid fa-triangle-exclamation" /> {authError}
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold py-3 px-4 rounded-lg shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition-all duration-300 transform active:scale-[0.98]"
            >
              Giriş Yap
            </button>
          </form>
        </div>
      </div>
    )
  }

  // Dashboard Render
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Header */}
      <header className="border-b border-slate-900 bg-slate-950/80 backdrop-blur-md sticky top-0 z-20 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center shadow-md shadow-purple-500/20">
            <i className="fa-solid fa-circle-question text-white text-lg" />
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-amber-300 bg-clip-text text-transparent">
              SuitableRMS Q&A Portalı
            </h1>
            <p className="text-xs text-slate-500">Projeden bağımsız soru sorma ve yanıtlama alanı</p>
          </div>
        </div>

        <div className="hidden lg:flex items-center gap-5 bg-slate-900/40 border border-slate-900 px-5 py-2 rounded-xl text-xs text-slate-300">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-purple-400 text-sm">#1</span>
            <span>Restoran Kuryesi</span>
          </div>
          <div className="w-px h-4 bg-slate-800" />
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-pink-400 text-sm">#2</span>
            <span>Platform Kuryesi</span>
          </div>
          <div className="w-px h-4 bg-slate-800" />
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-amber-400 text-sm">#3</span>
            <span>restoranın anlaşmalı olduğu kurye firması</span>
          </div>
          <div className="w-px h-4 bg-slate-800" />
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-emerald-400 text-sm">#4</span>
            <span>Bağımsız Kurye</span>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-2 bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white px-4 py-2 rounded-lg text-sm font-medium transition-all"
        >
          <i className="fa-solid fa-right-from-bracket" />
          Çıkış Yap
        </button>
      </header>

      {/* Main Container */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 max-h-[calc(100vh-73px)] overflow-hidden">
        
        {/* Left Column: Soru Sor & Soru Listesi */}
        <section className="flex flex-col gap-6 overflow-hidden h-full">
          {/* Question Form */}
          <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 shadow-xl flex-shrink-0">
            <h2 className="text-md font-bold mb-4 flex items-center gap-2 text-purple-400">
              <i className="fa-solid fa-pen-nib" /> Yeni Soru Ekle
            </h2>
            <form onSubmit={handleAddQuestion} className="space-y-4">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-slate-400 text-xs font-medium mb-1">Adınız Soyadınız *</label>
                  <input
                    type="text"
                    placeholder="Örn: Ahmet Yılmaz"
                    value={questionForm.authorName}
                    onChange={(e) => setQuestionForm(prev => ({ ...prev, authorName: e.target.value }))}
                    className="w-full bg-slate-950/60 border border-slate-900 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-600 transition-all"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-400 text-xs font-medium mb-1">Sorunuz *</label>
                  <textarea
                    placeholder="Sormak istediğiniz konuyu detaylıca yazın..."
                    rows={3}
                    value={questionForm.questionText}
                    onChange={(e) => setQuestionForm(prev => ({ ...prev, questionText: e.target.value }))}
                    className="w-full bg-slate-950/60 border border-slate-900 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-purple-600 transition-all resize-none"
                    required
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold py-2 px-5 rounded-lg shadow-md shadow-purple-500/10 hover:shadow-purple-500/20 transition-all"
                >
                  Soru Ekle
                </button>
              </div>
            </form>
          </div>

          {/* Questions List */}
          <div className="bg-slate-900/20 border border-slate-900 rounded-xl flex-1 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-900 flex items-center justify-between flex-shrink-0">
              <h2 className="text-sm font-bold flex items-center gap-2 text-slate-300">
                <i className="fa-solid fa-list-ul" /> Sorular ({questions.length})
              </h2>
              <button 
                onClick={loadQuestions} 
                className="text-slate-500 hover:text-slate-300 text-xs transition-colors p-1"
                title="Soruları Yenile"
              >
                <i className="fa-solid fa-rotate" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {loadingQuestions ? (
                <div className="h-32 flex flex-col items-center justify-center text-slate-500 text-sm gap-2">
                  <i className="fa-solid fa-spinner fa-spin text-purple-500 text-lg" />
                  Sorular yükleniyor...
                </div>
              ) : questions.length === 0 ? (
                <div className="h-32 flex flex-col items-center justify-center text-slate-600 text-sm italic">
                  Henüz soru eklenmemiş. İlk soruyu yukarıdaki formdan sorabilirsiniz!
                </div>
              ) : (
                questions.map((q) => (
                  <div
                    key={q.id}
                    onClick={() => setSelectedQuestion(q)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all duration-300 group ${
                      selectedQuestion?.id === q.id
                        ? 'bg-purple-600/10 border-purple-500 shadow-md shadow-purple-500/5'
                        : 'bg-slate-900/30 border-slate-900 hover:bg-slate-900/50 hover:border-slate-800'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2 gap-2">
                      <span className="font-semibold text-sm text-purple-300 group-hover:text-purple-200 transition-colors">
                        {q.author_name}
                      </span>
                      <span className="text-[10px] text-slate-500 whitespace-nowrap">
                        {formatDate(q.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 line-clamp-3 mb-3 pr-2 break-words">
                      {q.question_text}
                    </p>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500">
                      <i className="fa-regular fa-comment-dots text-purple-400/80" />
                      <span>{q.answerCount} cevap</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* Right Column: Soru Detayı & Cevap Ekle */}
        <section className="overflow-hidden h-full flex flex-col">
          {!selectedQuestion ? (
            <div className="flex-1 bg-slate-900/10 border border-dashed border-slate-900 rounded-xl flex flex-col items-center justify-center p-8 text-center text-slate-600 h-full">
              <div className="w-16 h-16 rounded-full bg-slate-900/50 flex items-center justify-center mb-4">
                <i className="fa-regular fa-comments text-2xl text-slate-700" />
              </div>
              <h3 className="text-slate-500 font-bold mb-1">Cevapları Görüntüle</h3>
              <p className="text-xs max-w-sm">
                Cevapları incelemek veya bu soruya yeni bir cevap yazmak için soldaki listeden bir soru seçin.
              </p>
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-6 overflow-hidden h-full">
              {/* Selected Question Detail */}
              <div className="bg-slate-900/30 border border-slate-900 rounded-xl p-5 shadow-xl flex-shrink-0">
                <div className="flex items-center justify-between mb-3 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5 font-semibold text-purple-400">
                    <i className="fa-solid fa-circle-question" /> Soru Sahibi: {selectedQuestion.author_name}
                  </span>
                  <span>{formatDate(selectedQuestion.created_at)}</span>
                </div>
                <p className="text-sm text-slate-200 leading-relaxed break-words max-h-40 overflow-y-auto pr-2">
                  {selectedQuestion.question_text}
                </p>
              </div>

              {/* Answers List */}
              <div className="bg-slate-900/20 border border-slate-900 rounded-xl flex-1 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-slate-900 flex items-center justify-between flex-shrink-0">
                  <h3 className="text-sm font-bold flex items-center gap-2 text-slate-300">
                    <i className="fa-regular fa-comment-dots" /> Cevaplar ({answers.length})
                  </h3>
                  <button 
                    onClick={() => loadAnswers(selectedQuestion.id)} 
                    className="text-slate-500 hover:text-slate-300 text-xs transition-colors p-1"
                    title="Cevapları Yenile"
                  >
                    <i className="fa-solid fa-rotate" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {loadingAnswers ? (
                    <div className="h-32 flex flex-col items-center justify-center text-slate-500 text-sm gap-2">
                      <i className="fa-solid fa-spinner fa-spin text-purple-500 text-lg" />
                      Cevaplar yükleniyor...
                    </div>
                  ) : answers.length === 0 ? (
                    <div className="h-32 flex flex-col items-center justify-center text-slate-600 text-sm italic">
                      Bu soruya henüz cevap yazılmamış. İlk yanıtı aşağıdaki formdan ekleyebilirsiniz!
                    </div>
                  ) : (
                    answers.map((ans) => (
                      <div key={ans.id} className="p-4 rounded-lg bg-slate-900/50 border border-slate-900/60">
                        <div className="flex justify-between items-center mb-2 text-xs">
                          <span className="font-semibold text-emerald-400 flex items-center gap-1">
                            <i className="fa-solid fa-user-pen" /> {ans.author_name}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {formatDate(ans.created_at)}
                          </span>
                        </div>
                        <p className="text-sm text-slate-300 break-words leading-relaxed">
                          {ans.answer_text}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Answer Add Form */}
              <div className="bg-slate-900/40 border border-slate-900 rounded-xl p-5 shadow-xl flex-shrink-0">
                <h3 className="text-sm font-bold mb-3 flex items-center gap-2 text-emerald-400">
                  <i className="fa-regular fa-comment" /> Cevap Yaz
                </h3>
                <form onSubmit={handleAddAnswer} className="space-y-4">
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <input
                        type="text"
                        placeholder="Adınız Soyadınız *"
                        value={answerForm.authorName}
                        onChange={(e) => setAnswerForm(prev => ({ ...prev, authorName: e.target.value }))}
                        className="w-full bg-slate-950/60 border border-slate-900 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 transition-all"
                        required
                      />
                    </div>
                    <div>
                      <textarea
                        placeholder="Soruyu yanıtlayın..."
                        rows={2}
                        value={answerForm.answerText}
                        onChange={(e) => setAnswerForm(prev => ({ ...prev, answerText: e.target.value }))}
                        className="w-full bg-slate-950/60 border border-slate-900 text-white rounded-lg px-3 py-2 text-sm outline-none focus:border-emerald-600 transition-all resize-none"
                        required
                      />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold py-2 px-5 rounded-lg shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20 transition-all"
                    >
                      Cevap Gönder
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </section>

      </main>
    </div>
  )
}
