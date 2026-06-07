import React, { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { buildApiUrl } from '@/lib/db'
import { submitFormResponse } from '@/lib/formService'

export default function PublicSurvey() {
  const { token } = useParams()
  const [loading, setLoading] = useState(true)
  const [tokenData, setTokenData] = useState(null)
  const [branches, setBranches] = useState([])
  const [selectedBranchId, setSelectedBranchId] = useState('')
  const [answers, setAnswers] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState(null)
  const [formStartTime, setFormStartTime] = useState(null)

  // Load Google Fonts programmatically to ensure premium Outfit typography
  useEffect(() => {
    const link = document.createElement('link')
    link.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap'
    link.rel = 'stylesheet'
    document.head.appendChild(link)
    return () => {
      document.head.removeChild(link)
    }
  }, [])

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        setError(null)

        // 1. Fetch token and template details
        const tokenRes = await fetch(buildApiUrl(`/api/survey-tokens/${token}`))
        if (!tokenRes.ok) {
          const errData = await tokenRes.json().catch(() => ({}))
          throw new Error(errData?.error?.message || 'Bağlantı geçersiz veya süresi dolmuş.')
        }
        const tokenJson = await tokenRes.json()
        const tData = tokenJson.data
        setTokenData(tData)

        // Initialize answers
        const schema = tData.template_schema || {}
        const initialAnswers = []
        for (const section of (schema.sections || [])) {
          for (const field of (section.fields || [])) {
            initialAnswers.push({ field_id: field.id, value: null, section_id: section.id })
          }
        }
        setAnswers(initialAnswers)
        setFormStartTime(Date.now())

        // 2. Fetch branch list if token mode is multi_branch or if there is a branch select field
        const hasBranchSelectField = (schema.sections || []).some(s => 
          (s.fields || []).some(f => f.type === 'branch_select')
        )

        if (tData.mode === 'multi_branch' || tData.mode === 'anonymous' || hasBranchSelectField) {
          const branchesRes = await fetch(buildApiUrl('/api/branches/list'))
          if (branchesRes.ok) {
            const branchesJson = await branchesRes.json()
            const allBranches = branchesJson.data || []
            
            if (tData.mode === 'multi_branch' && tData.branch_ids) {
              const allowedIds = Array.isArray(tData.branch_ids) ? tData.branch_ids : JSON.parse(tData.branch_ids || '[]')
              const filtered = allBranches.filter(b => allowedIds.includes(b.id))
              setBranches(filtered)
            } else {
              setBranches(allBranches)
            }
          }
        }

        if (tData.mode === 'branch' && tData.branch_id) {
          setSelectedBranchId(tData.branch_id)
        }

      } catch (err) {
        console.error('Anket yükleme hatası:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [token])

  const updateAnswer = (fieldId, value) => {
    setAnswers(prev => prev.map(a => a.field_id === fieldId ? { ...a, value } : a))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!tokenData) return

    const schema = tokenData.template_schema || {}
    
    // Check if global branch selector is required but empty
    const isMultiBranch = tokenData.mode === 'multi_branch'
    if (isMultiBranch && !selectedBranchId) {
      alert('Lütfen ziyaret ettiğiniz şubeyi seçiniz.')
      return
    }

    // Check if any specific branch select question was answered, and use it
    let finalBranchId = selectedBranchId || null
    const branchSelectAnswer = answers.find(ans => {
      const field = (schema.sections || []).flatMap(s => s.fields || []).find(f => f.id === ans.field_id)
      return field && field.type === 'branch_select'
    })
    if (branchSelectAnswer && branchSelectAnswer.value) {
      // If single value select or multi-select returned branch id
      finalBranchId = Array.isArray(branchSelectAnswer.value) 
        ? branchSelectAnswer.value[0] 
        : branchSelectAnswer.value
    }

    // Required fields validation
    for (const section of (schema.sections || [])) {
      for (const field of (section.fields || [])) {
        if (field.required) {
          const ans = answers.find(a => a.field_id === field.id)
          if (!ans || ans.value === null || ans.value === undefined || ans.value === '') {
            alert(`Lütfen "${field.label}" sorusunu yanıtlayın.`)
            return
          }
        }
      }
    }

    setSubmitting(true)
    try {
      const completionTimeSeconds = formStartTime ? Math.round((Date.now() - formStartTime) / 1000) : null
      
      const metadata = {
        source: 'public_survey',
        token_id: tokenData.id,
        token_mode: tokenData.mode,
        completed_at: new Date().toISOString()
      }

      const { error: submitError } = await submitFormResponse({
        templateId: tokenData.template_id,
        branchId: finalBranchId, // branch_id is nullable if anonymous
        submittedBy: 'anonymous', // public fill is anonymous
        answersJson: answers,
        completionTimeSeconds,
        metadata
      })

      if (submitError) {
        throw new Error(submitError.message || 'Gönderim sırasında hata oluştu.')
      }

      setSubmitted(true)
    } catch (err) {
      console.error('Gönderim hatası:', err)
      alert('Hata: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div style={styles.centerContainer}>
        <div style={styles.spinner}></div>
        <p style={styles.loadingText}>Anket yükleniyor, lütfen bekleyin...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={styles.centerContainer}>
        <div style={styles.errorCard}>
          <i className="fa-solid fa-triangle-exclamation" style={styles.errorIcon}></i>
          <h2 style={styles.errorTitle}>Bağlantı Geçersiz</h2>
          <p style={styles.errorMsg}>{error}</p>
        </div>
      </div>
    )
  }

  if (submitted) {
    return (
      <div style={styles.centerContainer}>
        <div style={styles.successCard}>
          <div style={styles.successBadge}>
            <i className="fa-solid fa-check"></i>
          </div>
          <h2 style={styles.successTitle}>Teşekkür Ederiz!</h2>
          <p style={styles.successMsg}>
            Geri bildiriminiz başarıyla iletildi. Değerli görüşleriniz hizmet kalitemizi artırmamıza yardımcı olacaktır.
          </p>
        </div>
      </div>
    )
  }

  const schema = tokenData.template_schema || {}
  const isMultiBranch = tokenData.mode === 'multi_branch'

  return (
    <div style={styles.pageContainer}>
      <div style={styles.surveyCard}>
        {/* Header */}
        <div style={styles.header}>
          <h1 style={styles.title}>{tokenData.template_title}</h1>
          <p style={styles.subtitle}>Fikirleriniz bizim için çok önemli. Lütfen aşağıdaki soruları yanıtlayın.</p>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          {/* Branch Selector if multi_branch */}
          {isMultiBranch && (
            <div style={styles.fieldCard}>
              <label style={styles.fieldLabel}>
                Ziyaret Ettiğiniz Şube <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div style={styles.selectWrapper}>
                <select
                  value={selectedBranchId}
                  onChange={e => setSelectedBranchId(e.target.value)}
                  style={styles.selectInput}
                  required
                >
                  <option value="">Şube Seçiniz</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Form Sections */}
          {(schema.sections || []).map((section, sIdx) => (
            <div key={section.id || sIdx} style={styles.sectionContainer}>
              <h2 style={styles.sectionTitle}>{section.title}</h2>
              
              <div style={styles.fieldsGrid}>
                {(section.fields || []).map((field) => {
                  const ans = answers.find(a => a.field_id === field.id)
                  return (
                    <div key={field.id} style={styles.fieldCard}>
                      <label style={styles.fieldLabel}>
                        {field.label} {field.required && <span style={{ color: '#ef4444' }}>*</span>}
                      </label>

                      <div style={styles.controlWrapper}>
                        {/* YES NO */}
                        {field.type === 'yes_no' && (
                          <div style={styles.btnGroup}>
                            {[
                              { label: '✓ Evet', value: true },
                              { label: '✗ Hayır', value: false }
                            ].map(opt => {
                              const isActive = ans?.value === opt.value
                              return (
                                <button
                                  key={String(opt.value)}
                                  type="button"
                                  onClick={() => updateAnswer(field.id, opt.value)}
                                  style={{
                                    ...styles.btnGroupItem,
                                    background: isActive ? 'linear-gradient(135deg, #6366f1, #4f46e5)' : '#f3f4f6',
                                    color: isActive ? '#fff' : '#4b5563',
                                    border: isActive ? '1px solid #4f46e5' : '1px solid #d1d5db'
                                  }}
                                >
                                  {opt.label}
                                </button>
                              )
                            })}
                          </div>
                        )}

                        {/* CHECKBOX */}
                        {field.type === 'checkbox' && (
                          <label style={styles.checkboxLabel}>
                            <input
                              type="checkbox"
                              checked={!!ans?.value}
                              onChange={e => updateAnswer(field.id, e.target.checked)}
                              style={styles.checkboxInput}
                            />
                            <span style={styles.checkboxText}>Onaylıyorum</span>
                          </label>
                        )}

                        {/* RATING 5 */}
                        {field.type === 'rating' && (
                          <div style={styles.ratingWrapper}>
                            {[1, 2, 3, 4, 5].map(r => {
                              const isActive = (ans?.value || 0) >= r
                              return (
                                <button
                                  key={r}
                                  type="button"
                                  onClick={() => updateAnswer(field.id, r)}
                                  style={styles.starButton}
                                >
                                  <i
                                    className={isActive ? 'fa-solid fa-star' : 'fa-regular fa-star'}
                                    style={{ color: isActive ? '#f59e0b' : '#d1d5db', fontSize: '2rem' }}
                                  />
                                </button>
                              )
                            })}
                          </div>
                        )}

                        {/* RATING 10 */}
                        {field.type === 'rating_10' && (
                          <div style={styles.ratingWrapper}>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(r => {
                              const isActive = (ans?.value || 0) >= r
                              return (
                                <button
                                  key={r}
                                  type="button"
                                  onClick={() => updateAnswer(field.id, r)}
                                  style={styles.starButtonSmall}
                                >
                                  <i
                                    className={isActive ? 'fa-solid fa-star' : 'fa-regular fa-star'}
                                    style={{ color: isActive ? '#f59e0b' : '#d1d5db', fontSize: '1.4rem' }}
                                  />
                                </button>
                              )
                            })}
                          </div>
                        )}

                        {/* EMOJI RATING */}
                        {field.type === 'emoji_rating' && (
                          <div style={styles.emojiContainer}>
                            {[
                              { val: 'sad', icon: 'fa-face-frown', color: '#ef4444', label: 'Memnun Değilim' },
                              { val: 'neutral', icon: 'fa-face-meh', color: '#f59e0b', label: 'Kararsızım' },
                              { val: 'happy', icon: 'fa-face-smile', color: '#10b981', label: 'Memnunum' },
                            ].map(item => {
                              const isActive = ans?.value === item.val
                              return (
                                <button
                                  key={item.val}
                                  type="button"
                                  onClick={() => updateAnswer(field.id, item.val)}
                                  style={{
                                    ...styles.emojiButton,
                                    background: isActive ? `${item.color}15` : '#f9fafb',
                                    borderColor: isActive ? item.color : '#e5e7eb',
                                    color: isActive ? item.color : '#6b7280',
                                    transform: isActive ? 'scale(1.06)' : 'none'
                                  }}
                                >
                                  <i className={`fa-solid ${item.icon}`} style={{ fontSize: '2rem', color: isActive ? item.color : '#9ca3af' }} />
                                  <span style={{ fontSize: '.75rem', fontWeight: 600, marginTop: 4 }}>{item.label}</span>
                                </button>
                              )
                            })}
                          </div>
                        )}

                        {/* SLIDER */}
                        {field.type === 'slider' && (
                          <div style={styles.sliderWrapper}>
                            <input
                              type="range"
                              min="1"
                              max="10"
                              value={ans?.value ?? 5}
                              onChange={e => updateAnswer(field.id, Number(e.target.value))}
                              style={styles.sliderInput}
                            />
                            <span style={styles.sliderBadge}>
                              {ans?.value ?? 5} / 10
                            </span>
                          </div>
                        )}

                        {/* NPS */}
                        {field.type === 'nps' && (
                          <div style={styles.npsContainer}>
                            <div style={styles.npsButtons}>
                              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(val => {
                                const isActive = ans?.value === val
                                const isDetractor = val <= 6
                                const isPassive = val === 7 || val === 8
                                const activeColor = isDetractor ? '#ef4444' : (isPassive ? '#f59e0b' : '#10b981')
                                return (
                                  <button
                                    key={val}
                                    type="button"
                                    onClick={() => updateAnswer(field.id, val)}
                                    style={{
                                      ...styles.npsButton,
                                      borderColor: isActive ? activeColor : '#d1d5db',
                                      background: isActive ? `${activeColor}15` : '#fff',
                                      color: isActive ? activeColor : '#374151'
                                    }}
                                  >
                                    {val}
                                  </button>
                                )
                              })}
                            </div>
                            <div style={styles.npsLabels}>
                              <span>Hiç Tavsiye Etmem (0)</span>
                              <span>Kesinlikle Tavsiye Ederim (10)</span>
                            </div>
                          </div>
                        )}

                        {/* NUMBER / TEMPERATURE */}
                        {(field.type === 'number' || field.type === 'temperature') && (
                          <input
                            type="number"
                            placeholder={field.type === 'temperature' ? 'Derece (°C)' : 'Sayısal veri giriniz'}
                            value={ans?.value ?? ''}
                            onChange={e => updateAnswer(field.id, e.target.value === '' ? '' : Number(e.target.value))}
                            style={styles.textInput}
                          />
                        )}

                        {/* TEXT */}
                        {field.type === 'text' && (
                          <textarea
                            placeholder="Görüş ve önerilerinizi yazabilirsiniz..."
                            value={ans?.value || ''}
                            onChange={e => updateAnswer(field.id, e.target.value)}
                            style={styles.textareaInput}
                            rows={3}
                          />
                        )}

                        {/* SELECT */}
                        {field.type === 'select' && (
                          <div style={styles.selectWrapper}>
                            <select
                              value={ans?.value || ''}
                              onChange={e => updateAnswer(field.id, e.target.value)}
                              style={styles.selectInput}
                            >
                              <option value="">Seçiniz</option>
                              {(field.options || []).map((opt, i) => {
                                const val = typeof opt === 'object' ? opt.label : opt
                                return <option key={i} value={val}>{val}</option>
                              })}
                            </select>
                          </div>
                        )}

                        {/* DATE */}
                        {field.type === 'date' && (
                          <input
                            type="date"
                            value={ans?.value || ''}
                            onChange={e => updateAnswer(field.id, e.target.value)}
                            style={styles.dateInput}
                          />
                        )}

                        {/* BRANCH SELECT (INLINE QUESTION) */}
                        {field.type === 'branch_select' && (
                          <div style={styles.selectWrapper}>
                            <select
                              value={ans?.value || ''}
                              onChange={e => updateAnswer(field.id, e.target.value)}
                              style={styles.selectInput}
                            >
                              <option value="">Şube Seçiniz</option>
                              {branches.map(b => (
                                <option key={b.id} value={b.id}>{b.name}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={submitting}
            style={styles.submitBtn}
          >
            {submitting ? 'Gönderiliyor...' : 'Anketi Tamamla'}
          </button>
        </form>
      </div>
    </div>
  )
}

const styles = {
  pageContainer: {
    fontFamily: '"Outfit", "Roboto", "Helvetica Neue", sans-serif',
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #EEF2F6 0%, #DCE4EC 100%)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'flex-start',
    padding: '24px 16px',
    boxSizing: 'border-box'
  },
  centerContainer: {
    fontFamily: '"Outfit", "Roboto", sans-serif',
    minHeight: '100vh',
    background: '#f3f4f6',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    boxSizing: 'border-box'
  },
  spinner: {
    width: 50,
    height: 50,
    border: '4px solid rgba(99, 102, 241, 0.1)',
    borderTop: '4px solid #6366f1',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  loadingText: {
    marginTop: 16,
    color: '#4b5563',
    fontWeight: 600,
    fontSize: '0.95rem'
  },
  errorCard: {
    background: '#fff',
    borderRadius: 16,
    padding: 32,
    maxWidth: 400,
    textAlign: 'center',
    boxShadow: '0 10px 25px rgba(0,0,0,0.05)'
  },
  errorIcon: {
    fontSize: '3rem',
    color: '#ef4444',
    marginBottom: 16
  },
  errorTitle: {
    margin: '0 0 8px 0',
    color: '#1f2937',
    fontSize: '1.4rem',
    fontWeight: 800
  },
  errorMsg: {
    margin: 0,
    color: '#6b7280',
    lineHeight: 1.5,
    fontSize: '0.9rem'
  },
  successCard: {
    background: '#fff',
    borderRadius: 24,
    padding: 40,
    maxWidth: 500,
    textAlign: 'center',
    boxShadow: '0 20px 40px rgba(0,0,0,0.08)',
    border: '1px solid rgba(0,0,0,0.03)'
  },
  successBadge: {
    width: 72,
    height: 72,
    background: 'linear-gradient(135deg, #10b981, #059669)',
    color: '#fff',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '2.2rem',
    margin: '0 auto 24px auto',
    boxShadow: '0 8px 20px rgba(16,185,129,0.3)'
  },
  successTitle: {
    margin: '0 0 12px 0',
    color: '#111827',
    fontSize: '1.75rem',
    fontWeight: 800
  },
  successMsg: {
    margin: 0,
    color: '#4b5563',
    lineHeight: 1.6,
    fontSize: '0.95rem'
  },
  surveyCard: {
    width: '100%',
    maxWidth: 680,
    background: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 24,
    boxShadow: '0 20px 40px rgba(8,15,35,0.08), 0 0 0 1px rgba(255,255,255,0.5) inset',
    backdropFilter: 'blur(10px)',
    overflow: 'hidden'
  },
  header: {
    background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
    padding: '32px 24px',
    color: '#fff',
    textAlign: 'center'
  },
  title: {
    margin: 0,
    fontSize: '1.75rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    lineHeight: 1.2
  },
  subtitle: {
    margin: '8px 0 0 0',
    fontSize: '0.9rem',
    color: '#c7d2fe',
    lineHeight: 1.4
  },
  form: {
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: 20
  },
  sectionContainer: {
    borderTop: '1px solid #e5e7eb',
    paddingTop: 20
  },
  sectionTitle: {
    margin: '0 0 16px 0',
    fontSize: '1.15rem',
    fontWeight: 800,
    color: '#1e1b4b',
    borderLeft: '4px solid #4f46e5',
    paddingLeft: 8
  },
  fieldsGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16
  },
  fieldCard: {
    background: '#f9fafb',
    border: '1px solid #f3f4f6',
    borderRadius: 16,
    padding: 16,
    display: 'flex',
    flexDirection: 'column',
    gap: 12
  },
  fieldLabel: {
    fontSize: '0.9rem',
    fontWeight: 700,
    color: '#374151',
    lineHeight: 1.3
  },
  controlWrapper: {
    display: 'flex',
    alignItems: 'center',
    width: '100%'
  },
  btnGroup: {
    display: 'flex',
    gap: 10,
    width: '100%'
  },
  btnGroupItem: {
    flex: 1,
    padding: '12px',
    borderRadius: 10,
    fontWeight: 700,
    fontSize: '0.85rem',
    cursor: 'pointer',
    transition: 'all 0.2s',
    textAlign: 'center'
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    cursor: 'pointer'
  },
  checkboxInput: {
    width: 20,
    height: 20,
    accentColor: '#4f46e5',
    cursor: 'pointer'
  },
  checkboxText: {
    fontSize: '0.85rem',
    color: '#4b5563',
    fontWeight: 600
  },
  ratingWrapper: {
    display: 'flex',
    gap: 8
  },
  starButton: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: 2,
    transition: 'transform 0.15s'
  },
  starButtonSmall: {
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: 1,
    transition: 'transform 0.15s'
  },
  emojiContainer: {
    display: 'flex',
    gap: 10,
    width: '100%',
    flexWrap: 'wrap'
  },
  emojiButton: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    border: '2px solid',
    borderRadius: 14,
    padding: '12px 8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    minWidth: 80
  },
  sliderWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%'
  },
  sliderInput: {
    flex: 1,
    height: 6,
    accentColor: '#4f46e5',
    cursor: 'pointer'
  },
  sliderBadge: {
    minWidth: 50,
    textAlign: 'center',
    fontSize: '0.8rem',
    fontWeight: 800,
    background: 'rgba(79,70,229,0.1)',
    color: '#4f46e5',
    padding: '4px 8px',
    borderRadius: 8,
    border: '1px solid rgba(79,70,229,0.2)'
  },
  npsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    width: '100%'
  },
  npsButtons: {
    display: 'flex',
    gap: 4,
    flexWrap: 'wrap'
  },
  npsButton: {
    flex: 1,
    minWidth: 26,
    height: 32,
    borderRadius: 8,
    border: '1.5px solid',
    fontWeight: 800,
    fontSize: '0.75rem',
    cursor: 'pointer',
    transition: 'all 0.15s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  npsLabels: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.65rem',
    color: '#6b7280',
    fontWeight: 600
  },
  textInput: {
    width: '100%',
    padding: '10px 14px',
    border: '1px solid #d1d5db',
    borderRadius: 10,
    fontSize: '0.85rem',
    boxSizing: 'border-box',
    background: '#fff',
    outline: 'none',
    transition: 'border-color 0.2s'
  },
  textareaInput: {
    width: '100%',
    padding: '10px 14px',
    border: '1px solid #d1d5db',
    borderRadius: 10,
    fontSize: '0.85rem',
    boxSizing: 'border-box',
    background: '#fff',
    outline: 'none',
    resize: 'vertical',
    transition: 'border-color 0.2s'
  },
  selectWrapper: {
    position: 'relative',
    width: '100%'
  },
  selectInput: {
    width: '100%',
    padding: '10px 14px',
    border: '1px solid #d1d5db',
    borderRadius: 10,
    fontSize: '0.85rem',
    boxSizing: 'border-box',
    background: '#fff',
    outline: 'none',
    cursor: 'pointer'
  },
  dateInput: {
    width: '100%',
    padding: '10px 14px',
    border: '1px solid #d1d5db',
    borderRadius: 10,
    fontSize: '0.85rem',
    boxSizing: 'border-box',
    background: '#fff',
    outline: 'none'
  },
  submitBtn: {
    background: 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: 12,
    padding: '14px',
    fontSize: '0.95rem',
    fontWeight: 700,
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginTop: 12,
    boxShadow: '0 8px 16px rgba(79,70,229,0.25)'
  }
}
