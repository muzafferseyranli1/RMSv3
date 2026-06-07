import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { db } from '@/lib/db'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/hooks/useToast'
import { readSettingArray, PERSONNEL_SETTINGS_KEYS, normalizeEmployeeRecord } from '@/lib/personnelConfig'
import { fetchFormTemplates } from '@/lib/formService'
import TaskDrawer from '@/components/pages/tasks/TaskDrawer'
import FormSubmissionDetailModal from '@/components/ui/FormSubmissionDetailModal'

export default function TaskManager() {
  const { user } = useAuth()
  const toast = useToast()

  const [activeTab, setActiveTab] = useState('tasks')
  const [loading, setLoading] = useState(true)

  // Data states
  const [tasks, setTasks] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [templates, setTemplates] = useState([])
  const [branches, setBranches] = useState([])
  const [employees, setEmployees] = useState([])
  const [positions, setPositions] = useState([])

  // Filtering states
  const [taskFilter, setTaskFilter] = useState({
    status: '',
    priority: '',
    branchId: '',
    search: '',
  })
  const [submissionFilter, setSubmissionFilter] = useState({
    templateId: '',
    branchId: '',
    status: '',
    search: '',
  })

  // Detail Drawer states
  const [selectedTask, setSelectedTask] = useState(null)
  const [taskDrawerOpen, setTaskDrawerOpen] = useState(false)
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(null)

  // Manager admin states (for task_manager created tasks)
  const [editingBranchId, setEditingBranchId] = useState('')
  const [newAssigneeId, setNewAssigneeId] = useState('')
  const [attachingFile, setAttachingFile] = useState(false)

  // Load basic reference data
  const loadReferenceData = useCallback(async () => {
    try {
      const [empData, posData, templateRes, branchRes] = await Promise.all([
        readSettingArray(PERSONNEL_SETTINGS_KEYS.employees, normalizeEmployeeRecord),
        readSettingArray(PERSONNEL_SETTINGS_KEYS.positions),
        fetchFormTemplates({ activeOnly: false }),
        fetch('/api/branches/list').then(r => r.json().catch(() => ({ data: [] }))),
      ])

      setEmployees(empData || [])
      setPositions(posData || [])
      setTemplates(templateRes.data || [])
      setBranches(branchRes.data || [])
    } catch (err) {
      console.error('Failed to load reference data:', err)
      toast('Referans veriler yüklenirken hata oluştu.', 'error')
    }
  }, [toast])

  // Fetch tasks
  const loadTasks = useCallback(async () => {
    try {
      const { data, error } = await db.from('tasks').select('*').order('created_at', { ascending: false })
      if (error) throw error

      // For each task, fetch its participants and history to match TaskDrawer expectation
      const tasksWithMeta = await Promise.all((data || []).map(async (task) => {
        const [partRes, histRes, threadRes] = await Promise.all([
          db.from('task_participants').select('*').eq('task_id', task.id),
          db.from('task_history').select('*').eq('task_id', task.id).order('created_at', { ascending: true }),
          db.from('task_chat_threads').select('id').eq('task_id', task.id).maybeSingle(),
        ])

        let messages = []
        if (threadRes.data?.id) {
          const msgRes = await db.from('task_chat_messages').select('*').eq('thread_id', threadRes.data.id).order('created_at', { ascending: true })
          messages = msgRes.data || []
        }

        const attachmentsRes = await db.from('task_attachments').select('*').eq('task_id', task.id)

        return {
          ...task,
          participants: partRes.data || [],
          history: histRes.data || [],
          messages,
          attachments: attachmentsRes.data || [],
          threadId: threadRes.data?.id || null,
        }
      }))

      setTasks(tasksWithMeta)
    } catch (err) {
      console.error('Failed to load tasks:', err)
      toast('Görevler yüklenemedi', 'error')
    }
  }, [toast])

  // Fetch submissions
  const loadSubmissions = useCallback(async () => {
    try {
      const { data, error } = await db.from('form_submissions').select('*').order('created_at', { ascending: false })
      if (error) throw error
      setSubmissions(data || [])
    } catch (err) {
      console.error('Failed to load submissions:', err)
      toast('Form gönderileri yüklenemedi', 'error')
    }
  }, [toast])

  // Initialize
  useEffect(() => {
    setLoading(true)
    Promise.all([loadReferenceData(), loadTasks(), loadSubmissions()]).finally(() => {
      setLoading(false)
    })
  }, [loadReferenceData, loadTasks, loadSubmissions])

  // People mapping Map for TaskDrawer
  const peopleById = useMemo(() => {
    const map = new Map()
    employees.forEach(emp => {
      map.set(String(emp.id), emp)
    })
    return map
  }, [employees])

  // Load single task detail (refresh)
  const refreshTaskDetails = async (taskId) => {
    try {
      const taskObj = tasks.find(t => t.id === taskId)
      if (!taskObj) return

      const [partRes, histRes, threadRes, attachmentsRes] = await Promise.all([
        db.from('task_participants').select('*').eq('task_id', taskId),
        db.from('task_history').select('*').eq('task_id', taskId).order('created_at', { ascending: true }),
        db.from('task_chat_threads').select('id').eq('task_id', taskId).maybeSingle(),
        db.from('task_attachments').select('*').eq('task_id', taskId)
      ])

      let messages = []
      if (threadRes.data?.id) {
        const msgRes = await db.from('task_chat_messages').select('*').eq('thread_id', threadRes.data.id).order('created_at', { ascending: true })
        messages = msgRes.data || []
      }

      const updated = {
        ...taskObj,
        participants: partRes.data || [],
        history: histRes.data || [],
        messages,
        attachments: attachmentsRes.data || [],
        threadId: threadRes.data?.id || null,
      }

      setTasks(prev => prev.map(t => t.id === taskId ? updated : t))
      setSelectedTask(updated)
    } catch (err) {
      console.error('Failed to refresh task details:', err)
    }
  }

  // Handle Note Submission (Manager Note)
  const handleSendManagerNote = async (body) => {
    if (!selectedTask) return
    let threadId = selectedTask.threadId

    try {
      if (!threadId) {
        const threadInsert = await db.from('task_chat_threads').insert({ task_id: selectedTask.id }).select().maybeSingle()
        if (threadInsert.error) throw threadInsert.error
        threadId = threadInsert.data.id
      }

      const { error } = await db.from('task_chat_messages').insert({
        thread_id: threadId,
        task_id: selectedTask.id,
        message_type: 'manager_note',
        body,
        sender_id: user?.id || null,
      })

      if (error) throw error
      toast('Yönetici notu eklendi', 'success')
      refreshTaskDetails(selectedTask.id)
    } catch (err) {
      console.error(err)
      toast('Not eklenemedi', 'error')
    }
  }

  // Handle Change Branch (Task delegation for auto surveys)
  const handleChangeTaskBranch = async () => {
    if (!selectedTask || !editingBranchId) return
    const targetBranch = branches.find(b => String(b.id) === String(editingBranchId))
    const branchName = targetBranch ? targetBranch.name : `Şube ID: ${editingBranchId}`

    try {
      const { error } = await db.from('tasks').update({
        branch_node_id: editingBranchId,
        updated_at: new Date().toISOString()
      }).eq('id', selectedTask.id)

      if (error) throw error

      // Log to history and chat thread
      let threadId = selectedTask.threadId
      if (!threadId) {
        const threadInsert = await db.from('task_chat_threads').insert({ task_id: selectedTask.id }).select().maybeSingle()
        threadId = threadInsert.data?.id
      }

      if (threadId) {
        await db.from('task_history').insert({
          task_id: selectedTask.id,
          action: 'delegated',
          performed_by: user?.id || 'task_manager',
          metadata: { branch_id: editingBranchId, branch_name: branchName }
        })

        await db.from('task_chat_messages').insert({
          thread_id: threadId,
          task_id: selectedTask.id,
          message_type: 'system',
          body: `Görev şubesi yönetici tarafından "${branchName}" olarak değiştirildi.`,
        })
      }

      toast('Şube başarıyla güncellendi', 'success')
      setEditingBranchId('')
      refreshTaskDetails(selectedTask.id)
      loadTasks()
    } catch (err) {
      console.error(err)
      toast('Şube değiştirilemedi', 'error')
    }
  }

  // Handle Add Assignee
  const handleAddAssignee = async () => {
    if (!selectedTask || !newAssigneeId) return
    const addedEmployee = employees.find(e => String(e.id) === String(newAssigneeId))
    const name = addedEmployee ? `${addedEmployee.firstName} ${addedEmployee.lastName}` : `ID: ${newAssigneeId}`

    try {
      // Check if already participant
      const exists = selectedTask.participants.some(p => String(p.personnel_id) === String(newAssigneeId) && p.participant_type === 'assignee')
      if (exists) {
        toast('Bu kişi zaten görev sorumlusu olarak atanmış.', 'warning')
        return
      }

      const { error } = await db.from('task_participants').insert({
        task_id: selectedTask.id,
        participant_type: 'assignee',
        personnel_id: newAssigneeId,
        node_id: selectedTask.branch_node_id || null
      })

      if (error) throw error

      // Log system chat message
      let threadId = selectedTask.threadId
      if (threadId) {
        await db.from('task_chat_messages').insert({
          thread_id: threadId,
          task_id: selectedTask.id,
          message_type: 'system',
          body: `"${name}" görev sorumlusu olarak eklendi.`,
        })
      }

      toast('Atanan kişi eklendi', 'success')
      setNewAssigneeId('')
      refreshTaskDetails(selectedTask.id)
    } catch (err) {
      console.error(err)
      toast('Atama başarısız', 'error')
    }
  }

  // Handle Remove Assignee
  const handleRemoveAssignee = async (personnelId) => {
    if (!selectedTask) return
    const emp = employees.find(e => String(e.id) === String(personnelId))
    const name = emp ? `${emp.firstName} ${emp.lastName}` : `ID: ${personnelId}`

    try {
      const { error } = await db.from('task_participants')
        .delete()
        .eq('task_id', selectedTask.id)
        .eq('personnel_id', personnelId)

      if (error) throw error

      let threadId = selectedTask.threadId
      if (threadId) {
        await db.from('task_chat_messages').insert({
          thread_id: threadId,
          task_id: selectedTask.id,
          message_type: 'system',
          body: `"${name}" görev sorumluları listesinden kaldırıldı.`,
        })
      }

      toast('Atanan kişi kaldırıldı', 'success')
      refreshTaskDetails(selectedTask.id)
    } catch (err) {
      console.error(err)
      toast('Kaldırma başarısız', 'error')
    }
  }

  // Handle File Upload
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !selectedTask) return

    setAttachingFile(true)
    try {
      const { uploadTaskFile } = await import('@/lib/taskService')
      const uploaded = await uploadTaskFile(selectedTask.id, file, file.name, user?.id)
      if (uploaded) {
        toast('Dosya başarıyla eklendi', 'success')
        refreshTaskDetails(selectedTask.id)
      } else {
        throw new Error('Yükleme başarısız')
      }
    } catch (err) {
      console.error(err)
      toast('Dosya yüklenemedi', 'error')
    } finally {
      setAttachingFile(false)
    }
  }

  // Filtering Logic for Tasks
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (taskFilter.status && t.status !== taskFilter.status) return false
      if (taskFilter.priority && t.priority !== taskFilter.priority) return false
      if (taskFilter.branchId && String(t.branch_node_id) !== String(taskFilter.branchId)) return false
      if (taskFilter.search) {
        const query = taskFilter.search.toLowerCase()
        const matchTitle = (t.title || '').toLowerCase().includes(query)
        const matchDesc = (t.description || '').toLowerCase().includes(query)
        return matchTitle || matchDesc
      }
      return true
    })
  }, [tasks, taskFilter])

  // Filtering Logic for Submissions
  const filteredSubmissions = useMemo(() => {
    return submissions.filter(s => {
      if (submissionFilter.templateId && s.template_id !== submissionFilter.templateId) return false
      if (submissionFilter.branchId && String(s.branch_id) !== String(submissionFilter.branchId)) return false
      if (submissionFilter.status && s.status !== submissionFilter.status) return false
      if (submissionFilter.search) {
        const query = submissionFilter.search.toLowerCase()
        const template = templates.find(t => t.id === s.template_id)
        const matchTemplate = template && template.title.toLowerCase().includes(query)
        const matchBranch = branches.find(b => String(b.id) === String(s.branch_id))?.name.toLowerCase().includes(query)
        return matchTemplate || matchBranch
      }
      return true
    })
  }, [submissions, submissionFilter, templates, branches])

  // Report Calculations
  const reportsData = useMemo(() => {
    const openTasks = tasks.filter(t => t.status === 'open' || t.status === 'in_progress').length
    const lateTasks = tasks.filter(t => (t.status === 'open' || t.status === 'in_progress') && t.due_at && new Date(t.due_at) < new Date()).length
    
    // Survey Submissions in last 7 days
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const recentSurveys = submissions.filter(s => {
      const t = templates.find(temp => temp.id === s.template_id)
      return t && t.form_type === 'customer_survey' && new Date(s.created_at) >= sevenDaysAgo
    }).length

    // NPS Calculation
    let promoters = 0, detractors = 0, totalNps = 0
    const surveySubmissions = submissions.filter(s => {
      const t = templates.find(temp => temp.id === s.template_id)
      return t && t.form_type === 'customer_survey'
    })

    surveySubmissions.forEach(sub => {
      const answers = Array.isArray(sub.answers_json) ? sub.answers_json : []
      answers.forEach(ans => {
        const val = Number(ans.value)
        if (ans.value !== null && ans.value !== undefined && !isNaN(val) && val >= 0 && val <= 10) {
          const template = templates.find(t => t.id === sub.template_id)
          const field = template?.schema_json?.sections?.flatMap(s => s.fields || [])?.find(f => f.id === ans.field_id)
          if (field?.type === 'nps') {
            totalNps++
            if (val >= 9) promoters++
            else if (val <= 6) detractors++
          }
        }
      })
    })
    const npsScore = totalNps > 0 ? Math.round(((promoters - detractors) / totalNps) * 100) : 0

    // Branch Distribution for Surveys
    const branchSurveyCounts = {}
    surveySubmissions.forEach(sub => {
      if (sub.branch_id) {
        branchSurveyCounts[sub.branch_id] = (branchSurveyCounts[sub.branch_id] || 0) + 1
      } else {
        branchSurveyCounts['anonymous'] = (branchSurveyCounts['anonymous'] || 0) + 1
      }
    })

    const branchSurveyList = Object.keys(branchSurveyCounts).map(bid => {
      const branchName = bid === 'anonymous' ? 'Anonim (Şubesiz)' : (branches.find(b => String(b.id) === String(bid))?.name || `Şube: ${bid}`)
      return {
        name: branchName,
        count: branchSurveyCounts[bid],
      }
    }).sort((a, b) => b.count - a.count)

    return {
      openTasks,
      lateTasks,
      recentSurveys,
      npsScore,
      totalNps,
      branchSurveyList
    }
  }, [tasks, submissions, templates, branches])

  return (
    <div style={{ fontFamily: '"Outfit", sans-serif', color: 'var(--text-main)', paddingBottom: 60 }}>
      {/* Header Banner */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, color: 'var(--text-strong)', letterSpacing: '-0.02em' }}>
            <i className="fa-solid fa-shield-halved" style={{ marginRight: 10, color: '#4f46e5' }} />
            Görev Yöneticisi (Task Manager)
          </h1>
          <p style={{ fontSize: '.85rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Şubelerden bağımsız, sistem genelindeki tüm anketleri, gönderileri ve otomatik atanan görevleri tek noktadan kontrol edin.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', marginBottom: 20 }}>
        {[
          { id: 'tasks', label: 'Tüm Görevler', icon: 'fa-tasks' },
          { id: 'submissions', label: 'Form Gönderileri', icon: 'fa-file-invoice' },
          { id: 'reports', label: 'Analiz ve NPS Raporu', icon: 'fa-chart-line' },
        ].map(tab => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 18px',
                fontSize: '.85rem',
                fontWeight: 700,
                border: 'none',
                background: 'transparent',
                borderBottom: isActive ? '3px solid #4f46e5' : '3px solid transparent',
                color: isActive ? '#4f46e5' : 'var(--text-muted)',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <i className={`fa-solid ${tab.icon}`} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} /> Veriler yükleniyor...
        </div>
      ) : (
        <>
          {/* TAB 1: TASKS */}
          {activeTab === 'tasks' && (
            <div>
              {/* Filters */}
              <div className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <input
                    type="text"
                    placeholder="Görev adı veya açıklamasında ara..."
                    className="f-input"
                    value={taskFilter.search}
                    onChange={e => setTaskFilter(p => ({ ...p, search: e.target.value }))}
                    style={{ width: '100%', padding: '6px 12px', fontSize: '.8rem' }}
                  />
                </div>
                <select
                  className="f-input"
                  value={taskFilter.status}
                  onChange={e => setTaskFilter(p => ({ ...p, status: e.target.value }))}
                  style={{ padding: '6px 12px', height: 34, fontSize: '.8rem', minWidth: 120 }}
                >
                  <option value="">Durum (Tümü)</option>
                  <option value="open">Açık</option>
                  <option value="in_progress">Devam Ediyor</option>
                  <option value="pending_approval">Kabul Bekliyor</option>
                  <option value="pending_completion_approval">Onay Bekliyor</option>
                  <option value="completed">Tamamlandı</option>
                </select>
                <select
                  className="f-input"
                  value={taskFilter.priority}
                  onChange={e => setTaskFilter(p => ({ ...p, priority: e.target.value }))}
                  style={{ padding: '6px 12px', height: 34, fontSize: '.8rem', minWidth: 120 }}
                >
                  <option value="">Öncelik (Tümü)</option>
                  <option value="low">Düşük</option>
                  <option value="normal">Normal</option>
                  <option value="high">Yüksek</option>
                  <option value="urgent">Kritik</option>
                </select>
                <select
                  className="f-input"
                  value={taskFilter.branchId}
                  onChange={e => setTaskFilter(p => ({ ...p, branchId: e.target.value }))}
                  style={{ padding: '6px 12px', height: 34, fontSize: '.8rem', minWidth: 150 }}
                >
                  <option value="">Şube (Tümü)</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* Grid List */}
              {filteredTasks.length === 0 ? (
                <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                  Arama kriterlerinize uygun görev bulunamadı.
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
                  {filteredTasks.map(task => {
                    const branchName = branches.find(b => String(b.id) === String(task.branch_node_id))?.name || 'Anonim / Merkez'
                    const isSurveyAuto = task.created_by_personnel_id === 'task_manager'

                    return (
                      <div
                        key={task.id}
                        onClick={() => {
                          setSelectedTask(task)
                          setTaskDrawerOpen(true)
                        }}
                        className="card"
                        style={{
                          padding: 18,
                          cursor: 'pointer',
                          borderLeft: isSurveyAuto ? '4px solid #4f46e5' : '4px solid #94a3b8',
                          transition: 'transform 0.15s, box-shadow 0.15s',
                        }}
                        onMouseOver={e => {
                          e.currentTarget.style.transform = 'translateY(-2px)'
                          e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.05)'
                        }}
                        onMouseOut={e => {
                          e.currentTarget.style.transform = 'none'
                          e.currentTarget.style.boxShadow = 'none'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                          <span style={{ fontSize: '.7rem', fontWeight: 800, padding: '3px 8px', borderRadius: 99, background: 'var(--surface-2)', color: 'var(--text-muted)' }}>
                            {branchName}
                          </span>
                          <span style={{
                            fontSize: '.7rem',
                            fontWeight: 800,
                            padding: '3px 8px',
                            borderRadius: 99,
                            background: task.priority === 'urgent' ? 'rgba(239, 68, 68, 0.15)' : (task.priority === 'high' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(100, 116, 139, 0.15)'),
                            color: task.priority === 'urgent' ? '#ef4444' : (task.priority === 'high' ? '#f59e0b' : '#64748b')
                          }}>
                            {task.priority === 'urgent' ? 'Kritik' : (task.priority === 'high' ? 'Yüksek' : 'Normal')}
                          </span>
                        </div>
                        <h4 style={{ fontSize: '.9rem', fontWeight: 800, color: 'var(--text-strong)', margin: '0 0 6px 0', lineHeight: 1.3 }}>
                          {task.title}
                        </h4>
                        <p style={{ fontSize: '.78rem', color: 'var(--text-muted)', margin: '0 0 12px 0', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4 }}>
                          {task.description}
                        </p>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.72rem', borderTop: '1px solid var(--border)', paddingTop: 10, color: 'var(--text-muted)' }}>
                          <span>Atananlar: <strong>{task.participants.filter(p => p.participant_type === 'assignee').length} Kişi</strong></span>
                          <span style={{
                            fontWeight: 700,
                            color: task.status === 'completed' ? '#10b981' : (task.status === 'in_progress' ? '#3b82f6' : '#f59e0b')
                          }}>
                            {task.status.toUpperCase().replaceAll('_', ' ')}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: SUBMISSIONS */}
          {activeTab === 'submissions' && (
            <div>
              {/* Filters */}
              <div className="card" style={{ padding: 16, marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <input
                    type="text"
                    placeholder="Şablon veya şube adında ara..."
                    className="f-input"
                    value={submissionFilter.search}
                    onChange={e => setSubmissionFilter(p => ({ ...p, search: e.target.value }))}
                    style={{ width: '100%', padding: '6px 12px', fontSize: '.8rem' }}
                  />
                </div>
                <select
                  className="f-input"
                  value={submissionFilter.templateId}
                  onChange={e => setSubmissionFilter(p => ({ ...p, templateId: e.target.value }))}
                  style={{ padding: '6px 12px', height: 34, fontSize: '.8rem', minWidth: 150 }}
                >
                  <option value="">Form Tipi (Tümü)</option>
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
                <select
                  className="f-input"
                  value={submissionFilter.branchId}
                  onChange={e => setSubmissionFilter(p => ({ ...p, branchId: e.target.value }))}
                  style={{ padding: '6px 12px', height: 34, fontSize: '.8rem', minWidth: 150 }}
                >
                  <option value="">Şube (Tümü)</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <select
                  className="f-input"
                  value={submissionFilter.status}
                  onChange={e => setSubmissionFilter(p => ({ ...p, status: e.target.value }))}
                  style={{ padding: '6px 12px', height: 34, fontSize: '.8rem', minWidth: 120 }}
                >
                  <option value="">Durum (Tümü)</option>
                  <option value="completed">Başarılı</option>
                  <option value="anomaly">Anomali</option>
                </select>
              </div>

              {/* Table list */}
              {filteredSubmissions.length === 0 ? (
                <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                  Arama kriterlerinize uygun form gönderisi bulunmuyor.
                </div>
              ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <table className="table" style={{ width: '100%', fontSize: '.8rem' }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', padding: '12px 16px' }}>Form Şablonu</th>
                        <th style={{ textAlign: 'left', padding: '12px 16px' }}>Doldurulduğu Şube</th>
                        <th style={{ textAlign: 'left', padding: '12px 16px' }}>Dolduran Kaynak</th>
                        <th style={{ textAlign: 'left', padding: '12px 16px' }}>Tarih</th>
                        <th style={{ textAlign: 'left', padding: '12px 16px' }}>Skor / Durum</th>
                        <th style={{ width: 100, textAlign: 'right', padding: '12px 16px' }}>Aksiyon</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSubmissions.map(sub => {
                        const template = templates.find(t => t.id === sub.template_id)
                        const branchName = branches.find(b => String(b.id) === String(sub.branch_id))?.name || 'Anonim / Belirtilmemiş'
                        
                        let sourceText = 'Mobil Uygulama / Personel'
                        if (sub.metadata?.source === 'public_survey') {
                          sourceText = 'Müşteri QR (Anonim)'
                        } else if (sub.metadata?.source === 'customer_app') {
                          sourceText = 'Loyalty Müşteri Uygulaması'
                        }

                        return (
                          <tr key={sub.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ fontWeight: 800, padding: '12px 16px', color: 'var(--text-strong)' }}>
                              {template ? template.title : 'Bilinmeyen Şablon'}
                            </td>
                            <td style={{ padding: '12px 16px', fontWeight: 600 }}>{branchName}</td>
                            <td style={{ padding: '12px 16px' }}>{sourceText}</td>
                            <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>
                              {new Date(sub.created_at).toLocaleString('tr-TR')}
                            </td>
                            <td style={{ padding: '12px 16px' }}>
                              {sub.score_percentage !== null ? (
                                <span style={{ fontWeight: 700, marginRight: 8 }}>%{sub.score_percentage}</span>
                              ) : null}
                              <span style={{
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontSize: '.7rem',
                                fontWeight: 700,
                                background: sub.status === 'anomaly' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                color: sub.status === 'anomaly' ? '#ef4444' : '#10b981'
                              }}>
                                {sub.status === 'anomaly' ? 'Anomali' : 'Tamamlandı'}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right', padding: '12px 16px' }}>
                              <button
                                className="btn-o"
                                onClick={() => setSelectedSubmissionId(sub.id)}
                                style={{ padding: '4px 8px', fontSize: '.75rem' }}
                              >
                                Detay Aç
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: REPORTS */}
          {activeTab === 'reports' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Metric Cards Row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                <div className="card" style={{ padding: 20, textAlign: 'center', borderTop: '4px solid #4f46e5' }}>
                  <div style={{ fontSize: '.78rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Müşteri NPS Skoru</div>
                  <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#4f46e5' }}>
                    {reportsData.npsScore > 0 ? `+${reportsData.npsScore}` : reportsData.npsScore}
                  </div>
                  <p style={{ fontSize: '.72rem', color: 'var(--text-muted)', margin: '8px 0 0 0' }}>
                    Toplam {reportsData.totalNps} NPS değerlendirmesinden hesaplandı.
                  </p>
                </div>

                <div className="card" style={{ padding: 20, textAlign: 'center', borderTop: '4px solid #ef4444' }}>
                  <div style={{ fontSize: '.78rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Geciken Görevler</div>
                  <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#ef4444' }}>
                    {reportsData.lateTasks}
                  </div>
                  <p style={{ fontSize: '.72rem', color: 'var(--text-muted)', margin: '8px 0 0 0' }}>
                    Süresi dolmuş fakat hala tamamlanmamış görevler.
                  </p>
                </div>

                <div className="card" style={{ padding: 20, textAlign: 'center', borderTop: '4px solid #10b981' }}>
                  <div style={{ fontSize: '.78rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Açık Görev Sayısı</div>
                  <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#10b981' }}>
                    {reportsData.openTasks}
                  </div>
                  <p style={{ fontSize: '.72rem', color: 'var(--text-muted)', margin: '8px 0 0 0' }}>
                    İşlem yapılması beklenen aktif görevler.
                  </p>
                </div>

                <div className="card" style={{ padding: 20, textAlign: 'center', borderTop: '4px solid #f59e0b' }}>
                  <div style={{ fontSize: '.78rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Son 7 Gün Anket Gönderimi</div>
                  <div style={{ fontSize: '2.2rem', fontWeight: 900, color: '#f59e0b' }}>
                    {reportsData.recentSurveys}
                  </div>
                  <p style={{ fontSize: '.72rem', color: 'var(--text-muted)', margin: '8px 0 0 0' }}>
                    Müşteri QR ve uygulamadan son 1 haftada gelen anketler.
                  </p>
                </div>
              </div>

              {/* Branch Survey distribution bar charts */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr .8fr', gap: 20 }}>
                <div className="card" style={{ padding: 24 }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: '0 0 16px 0', color: 'var(--text-strong)' }}>
                    Şubelere Göre Anket Dağılımı
                  </h3>
                  
                  {reportsData.branchSurveyList.length === 0 ? (
                    <p style={{ fontSize: '.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>Henüz şubeli anket gönderimi bulunmuyor.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {reportsData.branchSurveyList.map((item, idx) => {
                        const maxCount = reportsData.branchSurveyList[0]?.count || 1
                        const percentage = Math.round((item.count / maxCount) * 100)
                        
                        return (
                          <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.8rem', fontWeight: 600 }}>
                              <span>{item.name}</span>
                              <strong>{item.count} anket</strong>
                            </div>
                            <div style={{ width: '100%', height: 12, background: 'var(--surface-2)', borderRadius: 99, overflow: 'hidden' }}>
                              <div style={{ width: `${percentage}%`, height: '100%', background: 'linear-gradient(90deg, #4f46e5, #6366f1)', borderRadius: 99 }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: '0 0 12px 0', color: 'var(--text-strong)' }}>
                    NPS Değerlendirme Metrikleri
                  </h3>
                  <p style={{ fontSize: '.78rem', color: 'var(--text-muted)', margin: '0 0 16px 0', lineHeight: 1.4 }}>
                    NPS (Net Promoter Score) skoru, müşterilerinizin işletmenizi başkalarına tavsiye etme olasılığını ölçer. 9-10 Promoters (Tavsiye Eden), 0-6 Detractors (Kötüleyen) olarak sınıflandırılır.
                  </p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '.8rem', padding: 8, background: 'rgba(16, 185, 129, 0.08)', borderRadius: 8 }}>
                      <span style={{ flex: 1, fontWeight: 700, color: '#10b981' }}>Promoters (9-10 Puan)</span>
                      <strong style={{ color: '#10b981' }}>Öneren Müşteriler</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '.8rem', padding: 8, background: 'rgba(245, 158, 11, 0.08)', borderRadius: 8 }}>
                      <span style={{ flex: 1, fontWeight: 700, color: '#f59e0b' }}>Passives (7-8 Puan)</span>
                      <strong style={{ color: '#f59e0b' }}>Kararsız Müşteriler</strong>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '.8rem', padding: 8, background: 'rgba(239, 68, 68, 0.08)', borderRadius: 8 }}>
                      <span style={{ flex: 1, fontWeight: 700, color: '#ef4444' }}>Detractors (0-6 Puan)</span>
                      <strong style={{ color: '#ef4444' }}>Şikayetçi/Detraktör Müşteriler</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ADMIN CONTROLS MODAL ON SELECTED TASK DRAWER */}
      {taskDrawerOpen && selectedTask && (
        <TaskDrawer
          open={taskDrawerOpen}
          task={selectedTask}
          peopleById={peopleById}
          formTemplates={templates}
          onClose={() => {
            setTaskDrawerOpen(false)
            setSelectedTask(null)
          }}
          onSendMessage={handleSendManagerNote}
          isAssignee={false}
          isWatcher={true}
          isCreator={selectedTask.created_by_personnel_id === 'task_manager'}
          canRejectCreator={false}
          onAccept={() => {}}
          onReject={() => {}}
          onSoftDelete={async () => {
            await db.from('tasks').update({ status: 'soft_deleted', updated_at: new Date().toISOString() }).eq('id', selectedTask.id)
            toast('Görev pasife alındı', 'success')
            setTaskDrawerOpen(false)
            loadTasks()
          }}
          onRestore={async () => {
            await db.from('tasks').update({ status: 'open', updated_at: new Date().toISOString() }).eq('id', selectedTask.id)
            toast('Görev geri açıldı', 'success')
            setTaskDrawerOpen(false)
            loadTasks()
          }}
          onStart={() => {}}
          onOpenClosure={() => {}}
          onOpenDelegate={() => {}}
          onApproveCompletion={() => {}}
          onRejectCompletion={() => {}}
          onChangeDates={async ({ startAt, dueAt }) => {
            await db.from('tasks').update({ start_at: startAt, due_at: dueAt, updated_at: new Date().toISOString() }).eq('id', selectedTask.id)
            toast('Tarihler güncellendi', 'success')
            refreshTaskDetails(selectedTask.id)
          }}
        />
      )}

      {/* Task Manager Custom Sidebar Panel for Giver/Task Manager details */}
      {taskDrawerOpen && selectedTask && selectedTask.created_by_personnel_id === 'task_manager' && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: 20,
          width: 320,
          height: '100vh',
          zIndex: 1050,
          background: 'var(--surface)',
          boxShadow: '-10px 0 30px rgba(0,0,0,0.1)',
          padding: 20,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          borderLeft: '1px solid var(--border)',
          overflowY: 'auto'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
            <h4 style={{ margin: 0, fontSize: '.9rem', fontWeight: 800, color: 'var(--text-strong)' }}>
              <i className="fa-solid fa-screwdriver-wrench" style={{ marginRight: 6, color: '#4f46e5' }} />
              Yönetici Kontrolleri
            </h4>
            <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}>Anket Görevi</span>
          </div>

          {/* Change Branch Delegation */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="f-label">Görevli Şubeyi Değiştir</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <select
                className="f-input"
                value={editingBranchId}
                onChange={e => setEditingBranchId(e.target.value)}
                style={{ flex: 1, padding: 6, fontSize: '.8rem', height: 32 }}
              >
                <option value="">Şube Seçin...</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <button className="btn-p" onClick={handleChangeTaskBranch} style={{ padding: '4px 10px', fontSize: '.75rem' }}>Ata</button>
            </div>
          </div>

          {/* Edit Assignees list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="f-label">Sorumlu Ekle / Çıkar</label>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <select
                className="f-input"
                value={newAssigneeId}
                onChange={e => setNewAssigneeId(e.target.value)}
                style={{ flex: 1, padding: 6, fontSize: '.8rem', height: 32 }}
              >
                <option value="">Merkez Personeli Seçin...</option>
                {employees.filter(emp => !emp.deletedAt).map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName}</option>
                ))}
              </select>
              <button className="btn-p" onClick={handleAddAssignee} style={{ padding: '4px 10px', fontSize: '.75rem' }}>Ekle</button>
            </div>
            
            <div style={{ maxHeight: 150, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8, padding: 6, display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--surface-2)' }}>
              {selectedTask.participants.filter(p => p.participant_type === 'assignee').map(p => {
                const empObj = employees.find(e => String(e.id) === String(p.personnel_id))
                const name = empObj ? `${empObj.firstName} ${empObj.lastName}` : `ID: ${p.personnel_id}`
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '.75rem', padding: '4px 6px', background: 'var(--surface)', borderRadius: 4, border: '1px solid var(--border)' }}>
                    <span style={{ flex: 1, fontWeight: 600 }}>{name}</span>
                    <button
                      onClick={() => handleRemoveAssignee(p.personnel_id)}
                      style={{ border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', padding: 2 }}
                      title="Sorumluluktan Çıkar"
                    >
                      <i className="fa-solid fa-trash-can" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Add Attachments */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label className="f-label">Dosya / Fotoğraf Ekle</label>
            <input
              type="file"
              onChange={handleFileUpload}
              disabled={attachingFile}
              style={{ fontSize: '.75rem' }}
            />
            {attachingFile && <span style={{ fontSize: '.7rem', color: 'var(--text-muted)' }}><i className="fa-solid fa-spinner fa-spin" /> Yükleniyor...</span>}
          </div>
        </div>
      )}

      {/* Submission Detail Modal */}
      {selectedSubmissionId && (
        <FormSubmissionDetailModal
          submissionId={selectedSubmissionId}
          templates={templates}
          onClose={() => setSelectedSubmissionId(null)}
        />
      )}
    </div>
  )
}
