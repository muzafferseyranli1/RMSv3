import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Modal from '@/components/ui/Modal'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { useToast } from '@/hooks/useToast'
import { useWorkspace } from '@/context/WorkspaceContext'
import { db } from '@/lib/db'
import {
  acceptAssignment,
  acceptDelegate,
  acceptTask,
  appendChatMessage,
  approveCompletion,
  completeTask,
  createTask,
  delegateTask,
  fetchTaskDetail,
  fetchTaskOptions,
  fetchTasks,
  rejectAssignment,
  rejectCompletion,
  rejectDelegate,
  restoreTask,
  sendBack,
  softDeleteTask,
  uploadTaskFile,
  fetchAnnouncements,
  createAnnouncement,
  markAnnouncementAsRead,
  changeDueDate,
} from '@/lib/taskService'
import { canReject } from '@/lib/taskHierarchy'
import { notifyAnnouncement, notifyTaskAssigned } from '@/lib/notificationService'
import TaskCard from '@/components/pages/tasks/TaskCard'
import TaskDrawer from '@/components/pages/tasks/TaskDrawer'
import TaskClosureModal from '@/components/pages/tasks/TaskClosureModal'
import TaskSendBackModal from '@/components/pages/tasks/TaskSendBackModal'
import TaskDelegateModal from '@/components/pages/tasks/TaskDelegateModal'

const RECURRENCE_OPTIONS = [
  { value: '', label: 'Tek seferlik' },
  { value: 'daily', label: 'Günlük' },
  { value: 'weekly', label: 'Haftalık' },
  { value: 'monthly', label: 'Aylık' },
  { value: 'yearly', label: 'Yıllık' },
]

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Düşük' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Yüksek' },
  { value: 'urgent', label: 'Kritik' },
]

function readActiveUserSession() {
  try {
    const parsed = JSON.parse(sessionStorage.getItem('rms_active_user') || 'null')
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function buildActorFromWorkspaceUser(activeUser, employee, branchId) {
  if (!activeUser?.id && !employee?.id) return null
  return {
    id: employee?.id || activeUser?.id,
    branchId: branchId || employee?.defaultBranchId || activeUser?.defaultBranchId || '',
    firstName: employee?.firstName || activeUser?.firstName || '',
    lastName: employee?.lastName || activeUser?.lastName || '',
    authorityLevel: employee?.authorityLevel || '',
    positionId: employee?.positionId || '',
    defaultBranchId: employee?.defaultBranchId || activeUser?.defaultBranchId || '',
    workingBranchIds: Array.isArray(employee?.workingBranchIds) ? employee.workingBranchIds : [],
    managedBranchIds: Array.isArray(employee?.managedBranchIds) ? employee.managedBranchIds : [],
  }
}

function createChecklistItem() {
  return { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, text: '' }
}

function createInitialForm(actorBranchId = '') {
  return {
    title: '',
    description: '',
    responsibleId: '',
    collaboratorIds: [],
    observerIds: [],
    completionDate: '',
    startDate: '',
    locationId: actorBranchId,
    recurrence: '',
    completionTime: '',
    weeklyDays: [],
    durationValue: '1',
    monthlyPattern: 'day_of_month',
    monthlyDayOfMonth: '',
    monthlyNth: '1',
    monthlyWeekday: 'monday',
    yearlyPattern: 'specific_dates',
    yearlyDates: '',
    priority: 'normal',
    has_specific_time: false,
    delegation_allowed: false,
    approval_required: false,
    closure_summary_required: false,
    closure_file_required: false,
    closure_image_required: false,
    edit_due_date_allowed: false,
    edit_schedule_allowed: false,
    incomplete_if_late: false,
    checklistItems: [createChecklistItem()],
    files: [],
    images: [],
    formTemplateId: '',
  }
}

function toPersonOption(person) {
  return {
    value: String(person.id),
    label: [person.firstName, person.lastName].filter(Boolean).join(' ') || person.username || person.registryNumber || 'Personel',
    description: person.defaultBranchId || '',
    searchText: [person.firstName, person.lastName, person.username, person.registryNumber].filter(Boolean).join(' '),
  }
}

function toBranchOption(branch) {
  return {
    value: String(branch.id),
    label: branch.name,
    description: branch.legalEntityName || '',
    searchText: [branch.name, branch.legalEntityName].filter(Boolean).join(' '),
  }
}

function MultiPersonPicker({ label, values, options, onChange, placeholder }) {
  const selectedValues = Array.isArray(values) ? values : []
  return (
    <div>
      <label className="f-label">{label}</label>
      <SearchableSelect
        value=""
        onChange={value => {
          if (!value || selectedValues.includes(value)) return
          onChange([...selectedValues, value])
        }}
        options={options.filter(option => !selectedValues.includes(option.value))}
        placeholder={placeholder}
        searchPlaceholder="Personel ara..."
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {selectedValues.length === 0 ? (
          <span style={{ fontSize: '.76rem', color: '#94a3b8' }}>Seçim yok.</span>
        ) : selectedValues.map(value => (
          <span key={value} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, borderRadius: 999, background: '#eff6ff', color: '#1d4ed8', padding: '6px 10px', fontSize: '.76rem', fontWeight: 700 }}>
            {options.find(option => option.value === value)?.label || value}
            <button type="button" onClick={() => onChange(selectedValues.filter(item => item !== value))} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'inherit', padding: 0 }}>
              <i className="fa-solid fa-xmark" />
            </button>
          </span>
        ))}
      </div>
    </div>
  )
}

function fieldGrid(children) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>{children}</div>
}

function AnnouncementCard({ announcement, peopleById, onOpen }) {
  const priorityColors = {
    high: { bg: '#fee2e2', text: '#dc2626', label: 'Yüksek' },
    normal: { bg: '#f1f5f9', text: '#475569', label: 'Normal' },
    low: { bg: '#f0fdf4', text: '#16a34a', label: 'Düşük' },
  }

  const priority = priorityColors[announcement.priority] || priorityColors.normal
  const dateStr = new Date(announcement.created_at).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

  const creator = peopleById.get(String(announcement.created_by_personnel_id))
  const creatorName = creator ? `${creator.firstName} ${creator.lastName}` : 'Sistem'

  return (
    <div
      className="card"
      onClick={() => onOpen(announcement)}
      style={{
        padding: 16,
        display: 'grid',
        gap: 12,
        cursor: 'pointer',
        position: 'relative',
        borderLeft: announcement.is_read ? '1px solid #e2e8f0' : '4px solid #10b981',
        transition: 'all .2s',
        background: announcement.is_read ? '#fff' : '#f0fdf440',
        borderRadius: 14,
        textAlign: 'left',
      }}
      onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-2px)' }}
      onMouseOut={e => { e.currentTarget.style.transform = 'none' }}
    >
      {!announcement.is_read && (
        <span style={{
          position: 'absolute',
          top: 12,
          right: 12,
          padding: '2px 8px',
          borderRadius: 999,
          background: '#10b981',
          color: '#fff',
          fontSize: '.62rem',
          fontWeight: 900,
        }}>
          YENİ
        </span>
      )}

      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{
          padding: '2px 8px',
          borderRadius: 999,
          background: priority.bg,
          color: priority.text,
          fontSize: '.62rem',
          fontWeight: 800,
        }}>
          {priority.label}
        </span>
        <span style={{ fontSize: '.68rem', color: '#64748b' }}>
          Hedef: <strong>{announcement.target_type === 'all' ? 'Tüm Sistem' : announcement.target_type}</strong>
        </span>
      </div>

      <div style={{ fontSize: '.88rem', fontWeight: 900, color: '#0f172a' }}>
        {announcement.title}
      </div>

      <div style={{ fontSize: '.78rem', color: '#475569', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
        {announcement.content}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: 10, marginTop: 4 }}>
        <span style={{ fontSize: '.7rem', color: '#64748b' }}>
          Yayınlayan: <strong>{creatorName}</strong>
        </span>
        <span style={{ fontSize: '.68rem', color: '#94a3b8' }}>
          {dateStr}
        </span>
      </div>
    </div>
  )
}

export default function Tasks({ scope = 'center', isMobile = false }) {
  const toast = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const workspace = useWorkspace()
  const taskPrefillAppliedRef = useRef(false)
  const urlTaskIdRef = useRef(null)
  const [actor, setActor] = useState(null)
  const [actorError, setActorError] = useState('')
  const [branchOptions, setBranchOptions] = useState([])
  const [peopleOptions, setPeopleOptions] = useState([])
  const [peopleById, setPeopleById] = useState(new Map())
  const [positionRecords, setPositionRecords] = useState([])
  const [taskRows, setTaskRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('mine') // 'mine', 'assigned_by_me', 'watching', 'announcements'
  const [statusFilter, setStatusFilter] = useState('active') // 'active', 'completed', 'overdue', 'not_completed', 'pending_approval', 'deleted', 'all', 'unread'
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(createInitialForm())
  const [selectedTask, setSelectedTask] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [closureOpen, setClosureOpen] = useState(false)
  const [sendBackOpen, setSendBackOpen] = useState(false)
  const [delegateOpen, setDelegateOpen] = useState(false)

  // Announcements States
  const [announcements, setAnnouncements] = useState([])
  const [announcementsLoading, setAnnouncementsLoading] = useState(false)
  const [announcementCreateOpen, setAnnouncementCreateOpen] = useState(false)
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null)
  const [readReceipts, setReadReceipts] = useState([])
  const [receiptsLoading, setReceiptsLoading] = useState(false)
  const [annForm, setAnnForm] = useState({
    title: '',
    content: '',
    target_type: 'all',
    target_id: '',
    priority: 'normal',
    request_read_receipt: false,
  })

  // Search & Sorting States
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('due_soon')
  const [formTemplates, setFormTemplates] = useState([])

  useEffect(() => {
    async function loadTemplates() {
      try {
        const { data, error } = await db
          .from('form_templates')
          .select('id,title')
          .eq('active', true)
          .is('deleted_at', null)
          .order('title')
        if (!error && data) {
          setFormTemplates(data)
        }
      } catch (err) {
        console.error('Failed to load form templates:', err)
      }
    }
    loadTemplates()
  }, [])

  useEffect(() => {
    let mounted = true

    async function loadActorContext() {
      if (workspace.pickerOpen) return

      const activeUser = readActiveUserSession()
      if (!activeUser?.id) {
        if (!mounted) return
        setActor(null)
        setActorError('Aktif kullanıcı bağlamı bulunamadı. Önce mevcut çalışma bağlamını seçin.')
        setPeopleOptions([])
        setPeopleById(new Map())
        setPositionRecords([])
        setBranchOptions([])
        setTaskRows([])
        setLoading(false)
        return
      }

      setLoading(true)
      setActorError('')

      try {
        const options = await fetchTaskOptions({
          id: activeUser.id,
          branchId: workspace.branchId || activeUser.defaultBranchId || '',
          defaultBranchId: activeUser.defaultBranchId || '',
        })
        if (!mounted) return

        const employees = options.employees || []
        const employeeRecord = employees.find(employee => String(employee.id) === String(activeUser.id))
        const nextActor = buildActorFromWorkspaceUser(
          activeUser,
          employeeRecord,
          workspace.branchId || activeUser.defaultBranchId || '',
        )

        setPeopleOptions(employees.map(toPersonOption))
        setPeopleById(new Map(employees.map(employee => [String(employee.id), employee])))
        setPositionRecords(options.positions || [])
        setBranchOptions((options.branches || []).map(toBranchOption))

        if (!nextActor?.id) {
          setActor(null)
          setActorError('Aktif kullanıcı personel kaydıyla eşleştirilemedi.')
          setTaskRows([])
          return
        }

        setActor(nextActor)
      } catch (error) {
        if (!mounted) return
        setActor(null)
        setActorError(`Görev bağlamı yüklenemedi: ${error.message}`)
        setTaskRows([])
        toast(`Görev bağlamı yüklenemedi: ${error.message}`, 'error')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadActorContext()
    return () => {
      mounted = false
    }
  }, [toast, workspace.branchId, workspace.pickerOpen])

  async function refreshAll() {
    if (!actor) return
    setLoading(true)

    // Determine query filter compatibility
    let apiStatusFilter = 'active'
    if (statusFilter === 'completed') apiStatusFilter = 'completed'
    if (statusFilter === 'deleted') apiStatusFilter = 'deleted'
    if (statusFilter === 'all') apiStatusFilter = 'active'

    const taskResult = await fetchTasks({
      actor,
      scope,
      scopeBranchId: scope === 'center' ? '' : (workspace.branchId || actor.branchId || ''),
      tab: tab === 'announcements' ? 'mine' : tab,
      statusFilter: apiStatusFilter,
    })
    if (taskResult.error) {
      toast(`Görev listesi yüklenemedi: ${taskResult.error.message}`, 'error')
    } else {
      setTaskRows(taskResult.data || [])
    }

    setAnnouncementsLoading(true)
    const annResult = await fetchAnnouncements({ actor })
    if (annResult.error) {
      toast(`Duyurular yüklenemedi: ${annResult.error.message}`, 'error')
    } else {
      setAnnouncements(annResult.data || [])
    }
    setAnnouncementsLoading(false)
    setLoading(false)
  }

  const handleFillForm = (templateId) => {
    let path = '/formlar'
    if (scope === 'branch') {
      path = '/sube-formlar'
    } else if (scope === 'warehouse') {
      path = '/merkez-depo-formlar'
    }
    window.open(`${path}?fillTemplateId=${templateId}`, '_blank')
  }

  useEffect(() => {
    refreshAll()
  }, [actor, scope, workspace.branchId, tab, statusFilter])

  useEffect(() => {
    if (actor) {
      setForm(current => current.locationId ? current : createInitialForm(actor.branchId || ''))
    }
  }, [actor])

  useEffect(() => {
    if (!actor || taskPrefillAppliedRef.current || searchParams.get('create') !== '1') return
    const campaignName = searchParams.get('campaignName') || ''
    const taskTitle = searchParams.get('taskTitle') || (campaignName ? `Kampanya görevi: ${campaignName}` : '')
    const taskDescription = searchParams.get('taskDescription') || (campaignName ? `Kampanya adı: ${campaignName}` : '')
    taskPrefillAppliedRef.current = true
    setForm({
      ...createInitialForm(actor.branchId || ''),
      title: taskTitle,
      description: taskDescription,
    })
    setCreateOpen(true)
  }, [actor, searchParams])

  useEffect(() => {
    const tid = searchParams.get('taskId')
    if (tid && urlTaskIdRef.current !== tid) {
      // Find in local rows first
      const found = taskRows.find(t => String(t.id) === tid)
      if (found) {
        urlTaskIdRef.current = tid
        openTask(found)
      } else if (taskRows.length > 0) {
        // If local rows are loaded but task is not found, fetch it directly
        urlTaskIdRef.current = tid
        setDetailLoading(true)
        fetchTaskDetail(tid).then(result => {
          if (!result.error && result.data) {
            setSelectedTask(result.data)
          }
          setDetailLoading(false)
        })
      }
    }
  }, [searchParams, taskRows])

  async function openTask(task) {
    setDetailLoading(true)
    const result = await fetchTaskDetail(task.id)
    if (result.error) toast(`Görev detayı yüklenemedi: ${result.error.message}`, 'error')
    else setSelectedTask(result.data)
    setDetailLoading(false)
  }

  async function openAnnouncement(ann) {
    setSelectedAnnouncement(ann)
    if (!ann.is_read && actor?.id) {
      await markAnnouncementAsRead(ann.id, actor.id)
      // Instant state update for UX
      setAnnouncements(prev => prev.map(a => a.id === ann.id ? { ...a, is_read: true } : a))
    }

    if (String(ann.created_by_personnel_id) === String(actor?.id)) {
      setReceiptsLoading(true)
      try {
        const { data } = await db
          .from('announcement_reads')
          .select('personnel_id, read_at')
          .eq('announcement_id', ann.id)
        setReadReceipts(data || [])
      } catch (err) {
        console.error('Error fetching receipts:', err)
      } finally {
        setReceiptsLoading(false)
      }
    }
  }

  function setField(key, value) {
    setForm(current => ({ ...current, [key]: value }))
  }

  function setAnnField(key, value) {
    setAnnForm(current => ({ ...current, [key]: value }))
  }

  async function submitCreate() {
    if (!actor) {
      toast('Önce çalışma bağlamını seçin.', 'error')
      workspace.openWorkspacePicker()
      return
    }
    if (!form.title.trim() || !form.responsibleId || !form.locationId) {
      toast('Görev adı, sorumlu ve lokasyon zorunludur.', 'error')
      return
    }

    try {
      const uploadedFiles = []
      for (const file of form.files) {
        const uploaded = await uploadTaskFile(file)
        uploadedFiles.push({ ...uploaded, attachment_type: 'file' })
      }
      for (const file of form.images) {
        const uploaded = await uploadTaskFile(file)
        uploadedFiles.push({ ...uploaded, attachment_type: 'image' })
      }

      const result = await createTask(form, actor, uploadedFiles)
      if (result.error) {
        toast(`Görev kaydedilemedi: ${result.error.message}`, 'error')
        return
      }
      // Sorumluya bildirim gönder
      if (form.responsibleId && form.responsibleId !== String(actor.id)) {
        const actorName = [actor.firstName, actor.lastName].filter(Boolean).join(' ') || 'Bir yönetici'
        notifyTaskAssigned(form.responsibleId, form.title, result.data?.id, actorName).catch(() => {})
      }
      toast('Görev oluşturuldu.', 'success')
      setCreateOpen(false)
      setForm(createInitialForm(actor.branchId || ''))
      const returnTo = searchParams.get('returnTo')
      if (searchParams.get('source') === 'loyalty_campaign' && returnTo) {
        navigate(returnTo)
        return
      }
      await refreshAll()
    } catch (error) {
      toast(`Görev kaydedilemedi: ${error.message}`, 'error')
    }
  }

  async function submitCreateAnnouncement() {
    if (!actor) {
      toast('Önce çalışma bağlamını seçin.', 'error')
      return
    }
    if (!annForm.title.trim() || !annForm.content.trim()) {
      toast('Başlık ve metin alanları zorunludur.', 'error')
      return
    }

    try {
      const result = await createAnnouncement(annForm, actor)
      if (result.error) {
        toast(`Duyuru yayınlanamadı: ${result.error.message}`, 'error')
        return
      }
      // Tüm personele bildirim gönder (arka planda, hata sessizce yutulur)
      try {
        const { data: allPersonnel } = await db.from('personnel').select('id').eq('active', true)
        const recipientIds = (allPersonnel || [])
          .map(p => String(p.id))
          .filter(id => id !== String(actor.id))
        if (recipientIds.length > 0) {
          notifyAnnouncement(recipientIds, annForm.title, annForm.content, result.data?.id).catch(() => {})
        }
      } catch { /* bildirim hatası sessizce geçilir */ }
      toast('Duyuru başarıyla yayınlandı.', 'success')
      setAnnouncementCreateOpen(false)
      setAnnForm({
        title: '',
        content: '',
        target_type: 'all',
        target_id: '',
        priority: 'normal',
        request_read_receipt: false,
      })
      await refreshAll()
    } catch (err) {
      toast(`Duyuru yayınlanamadı: ${err.message}`, 'error')
    }
  }

  async function runTaskAction(action) {
    const result = await action()
    if (result?.error) {
      toast(result.error.message, 'error')
      return false
    }
    await refreshAll()
    if (selectedTask?.id) {
      const detail = await fetchTaskDetail(selectedTask.id)
      if (!detail.error) setSelectedTask(detail.data)
    }
    return true
  }

  const isAssignee = useMemo(() => {
    if (!selectedTask || !actor) return false
    return (selectedTask.participants || []).some(p => String(p.personnel_id) === String(actor.id) && p.participant_type === 'assignee')
  }, [selectedTask, actor])

  const isWatcher = useMemo(() => {
    if (!selectedTask || !actor) return false
    return (selectedTask.participants || []).some(p => String(p.personnel_id) === String(actor.id) && p.participant_type === 'watcher')
  }, [selectedTask, actor])

  const canRejectCreator = useMemo(() => {
    if (!selectedTask || !actor || selectedTask.form_template_id) return false
    return canReject(selectedTask.created_by_position_id, actor.positionId, positionRecords)
  }, [selectedTask, actor, positionRecords])

  const assignablePeople = useMemo(() => peopleOptions, [peopleOptions])

  const legalEntityOptions = useMemo(() => {
    const entities = [...new Set(branchOptions.map(b => b.description).filter(Boolean))]
    return entities.map(le => ({ value: le, label: le }))
  }, [branchOptions])

  const positionOptions = useMemo(() => {
    return positionRecords.map(pos => ({ value: String(pos.id), label: pos.name }))
  }, [positionRecords])

  // In-Memory Filtering and Sorting
  const processedTasks = useMemo(() => {
    let result = [...taskRows]

    // Local sub-tab filter
    if (statusFilter === 'active') {
      result = result.filter(t => t.status === 'open' || t.status === 'in_progress')
    } else if (statusFilter === 'overdue') {
      result = result.filter(t => t.display_status === 'overdue' || (t.due_at && new Date(t.due_at) < new Date() && t.status !== 'completed'))
    } else if (statusFilter === 'not_completed') {
      result = result.filter(t => t.status === 'not_completed')
    } else if (statusFilter === 'pending_approval') {
      result = result.filter(t => t.status === 'pending_approval' || t.status === 'pending_completion_approval')
    }

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      result = result.filter(task => (
        task.title?.toLowerCase().includes(term) ||
        task.description?.toLowerCase().includes(term)
      ))
    }

    // Sorting
    if (sortBy === 'due_soon') {
      result.sort((a, b) => {
        if (!a.due_at) return 1
        if (!b.due_at) return -1
        return new Date(a.due_at) - new Date(b.due_at)
      })
    } else if (sortBy === 'created_desc') {
      result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    } else if (sortBy === 'priority_desc') {
      const priorityWeights = { urgent: 4, high: 3, normal: 2, low: 1 }
      result.sort((a, b) => (priorityWeights[b.priority] || 0) - (priorityWeights[a.priority] || 0))
    }

    return result
  }, [taskRows, statusFilter, searchTerm, sortBy])

  const processedAnnouncements = useMemo(() => {
    let result = [...announcements]

    // Sub-tab filter
    if (statusFilter === 'unread') {
      result = result.filter(ann => !ann.is_read)
    }

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      result = result.filter(ann => (
        ann.title?.toLowerCase().includes(term) ||
        ann.content?.toLowerCase().includes(term)
      ))
    }

    // Sort descending
    result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

    return result
  }, [announcements, statusFilter, searchTerm])

  const subTabs = tab === 'announcements'
    ? [
        { value: 'all', label: 'Tümü' },
        { value: 'unread', label: 'Okunmamışlar' }
      ]
    : [
        { value: 'active', label: 'Devam Edenler' },
        { value: 'completed', label: 'Tamamlananlar' },
        { value: 'overdue', label: 'Gecikenler' },
        { value: 'not_completed', label: 'Tamamlanmadı' },
        { value: 'pending_approval', label: 'Onay Bekleyenler' },
        { value: 'deleted', label: 'Silinmişler' },
        { value: 'all', label: 'Tümü' }
      ]

  const getSubTabStyle = (isActive) => ({
    padding: '6px 14px',
    borderRadius: 8,
    fontSize: '.76rem',
    fontWeight: 700,
    border: '1px solid',
    borderColor: isActive ? '#0d9488' : '#e2e8f0',
    background: isActive ? '#f0fdfa' : '#fff',
    color: isActive ? '#0f766e' : '#475569',
    cursor: 'pointer',
    transition: 'all .15s ease',
  })

  return (
    <div style={isMobile ? { padding: '4px 10px 80px', minHeight: 0 } : {}}>
      {/* Custom Premium Header */}
      {!isMobile && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#fff',
          padding: '16px 20px',
          borderRadius: 16,
          border: '1px solid #e2e8f0',
          boxShadow: '0 4px 12px rgba(15,23,42,.02)',
          marginBottom: 20
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: '#0f172a',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.1rem'
            }}>
              <i className="fa-solid fa-list-check" />
            </div>
            <div>
              <div style={{ fontSize: '.72rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                {scope === 'center' ? 'Merkez Görevleri' : 'Şube Görevleri'}
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a', marginTop: 2 }}>
                Görevler
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => setAnnouncementCreateOpen(true)}
              style={{
                padding: '10px 18px',
                borderRadius: 12,
                border: 'none',
                background: '#f59e0b',
                color: '#0f172a',
                fontWeight: 900,
                fontSize: '.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                boxShadow: '0 4px 10px rgba(245,158,11,.15)',
                transition: 'all .2s'
              }}
            >
              <span style={{ fontSize: '1.1rem', lineHeight: 0 }}>•</span> Yeni Duyuru
            </button>
            
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              style={{
                padding: '10px 18px',
                borderRadius: 12,
                border: 'none',
                background: '#eab308',
                color: '#0f172a',
                fontWeight: 900,
                fontSize: '.82rem',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                boxShadow: '0 4px 10px rgba(234,179,8,.15)',
                transition: 'all .2s'
              }}
            >
              <i className="fa-solid fa-plus" /> Yeni Görev
            </button>
          </div>
        </div>
      )}

      {actor && !isMobile && (
        <div className="card" style={{ padding: 14, marginBottom: 16, borderColor: '#bfdbfe', background: '#eff6ff' }}>
          <div style={{ fontSize: '.84rem', fontWeight: 800, color: '#1d4ed8' }}>
            Aktif kullanıcı: {[peopleById.get(String(actor.id))?.firstName, peopleById.get(String(actor.id))?.lastName].filter(Boolean).join(' ') || [actor.firstName, actor.lastName].filter(Boolean).join(' ') || actor.id}
          </div>
          <div style={{ marginTop: 4, fontSize: '.76rem', color: '#1e40af' }}>
            Kapsam: {scope} · Şube: {branchOptions.find(option => option.value === actor.branchId)?.label || workspace.branchName || actor.branchId || '-'}
          </div>
        </div>
      )}

      {!actor && actorError && (
        <div className="card" style={{ padding: 18, marginBottom: 16, borderColor: '#fdba74', background: '#fff7ed' }}>
          <div style={{ fontSize: '.9rem', fontWeight: 800, color: '#9a3412' }}>Görev bağlamı hazır değil</div>
          <div style={{ marginTop: 6, fontSize: '.82rem', color: '#9a3412' }}>{actorError}</div>
          <div style={{ marginTop: 12 }}>
            <button type="button" className="btn-p" onClick={() => workspace.openWorkspacePicker()}>
              Çalışma Bağlamını Aç
            </button>
          </div>
        </div>
      )}

      {/* Row 1 Main Tabs */}
      <div style={{
        display: 'flex',
        gap: 8,
        borderBottom: '1px solid #e2e8f0',
        paddingBottom: 12,
        marginBottom: 16,
        overflowX: isMobile ? 'auto' : 'visible',
        whiteSpace: isMobile ? 'nowrap' : 'normal',
        width: '100%',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}>
        {[
          { value: 'mine', label: 'Görevlerim', icon: 'fa-user-check' },
          { value: 'assigned_by_me', label: 'Verdiğim Görevler', icon: 'fa-user-pen' },
          { value: 'watching', label: 'Gözlemci Olduklarım', icon: 'fa-eye' },
          { value: 'announcements', label: 'Duyurular', icon: 'fa-bullhorn' },
        ].map(item => {
          const isActive = tab === item.value
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => {
                setTab(item.value)
                if (item.value === 'announcements') {
                  setStatusFilter('all')
                } else {
                  setStatusFilter('active')
                }
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: isMobile ? '8px 12px' : '10px 20px',
                borderRadius: 12,
                border: '1px solid',
                borderColor: isActive ? '#0d9488' : '#e2e8f0',
                background: isActive ? '#f0fdfa' : '#fff',
                color: isActive ? '#0f766e' : '#475569',
                fontWeight: 800,
                fontSize: isMobile ? '.76rem' : '.84rem',
                cursor: 'pointer',
                flexShrink: 0,
                boxShadow: isActive ? '0 4px 12px rgba(13,148,136,.1)' : 'none',
                transition: 'all .2s'
              }}
            >
              <i className={`fa-solid ${item.icon}`} />
              {item.label}
            </button>
          )
        })}
      </div>

      {/* Row 2 Sub-Tabs, Search & Sort */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between',
        alignItems: isMobile ? 'stretch' : 'center',
        gap: 12,
        marginBottom: 18
      }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {subTabs.map(item => (
            <button
              key={item.value}
              type="button"
              style={getSubTabStyle(statusFilter === item.value)}
              onClick={() => setStatusFilter(item.value)}
            >
              {item.label}
            </button>
          ))}
          
          {tab !== 'announcements' && !isMobile && (
            <button
              type="button"
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: '.76rem',
                fontWeight: 700,
                border: '1px solid #e2e8f0',
                background: '#fff',
                color: '#475569',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                cursor: 'pointer',
              }}
              onClick={() => toast('Gelişmiş filtreler yakında...', 'info')}
            >
              <i className="fa-solid fa-sliders" /> Gelişmiş Filtreler
            </button>
          )}
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: isMobile ? '100%' : 'auto',
        }}>
          <div style={{ position: 'relative', flex: isMobile ? 1 : 'unset', width: isMobile ? '100%' : 220 }}>
            <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '.8rem' }} />
            <input
              type="text"
              placeholder={tab === 'announcements' ? "Duyuru ara..." : "Görev, kişi..."}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px 8px 30px',
                borderRadius: 10,
                border: '1px solid #e2e8f0',
                fontSize: '.78rem',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {tab !== 'announcements' && (
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: 10,
                border: '1px solid #e2e8f0',
                fontSize: '.78rem',
                background: '#fff',
                color: '#0f172a',
                fontWeight: 700,
                outline: 'none',
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <option value="due_soon">Süresi en az kalan</option>
              <option value="created_desc">Yeni eklenenler</option>
              <option value="priority_desc">Önceliğe göre</option>
            </select>
          )}
        </div>
      </div>

      {/* Main Grid View */}
      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>
          <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: 8 }} /> Yükleniyor...
        </div>
      ) : tab === 'announcements' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {processedAnnouncements.length === 0 ? (
            <div className="card" style={{ padding: 32, gridColumn: '1 / -1', color: '#94a3b8', textAlign: 'center' }}>
              Bu kapsamda henüz duyuru yok.
            </div>
          ) : processedAnnouncements.map(ann => (
            <AnnouncementCard key={ann.id} announcement={ann} peopleById={peopleById} onOpen={openAnnouncement} />
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
          {processedTasks.length === 0 ? (
            <div className="card" style={{ padding: 32, gridColumn: '1 / -1', color: '#94a3b8', textAlign: 'center' }}>
              Bu kapsamda henüz görev bulunamadı.
            </div>
          ) : processedTasks.map(task => (
            <TaskCard key={task.id} task={task} peopleById={peopleById} onOpen={openTask} />
          ))}
        </div>
      )}

      {/* Modal: Yeni Görev */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 4, height: 18, background: '#0284c7', borderRadius: 2 }}></span>
            <span>Yeni Görev</span>
          </div>
        }
        subtitle="Sisteme yeni bir iş/görev tanımlayın."
        width={920}
        flex
        footer={(
          <>
            <button type="button" className="btn-o" onClick={() => setCreateOpen(false)}>Vazgeç</button>
            <button type="button" className="btn-p" onClick={submitCreate} disabled={!actor} style={{ background: '#0284c7', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontWeight: 800, cursor: 'pointer' }}>Kaydet</button>
          </>
        )}
      >
        <div style={{ display: 'grid', gap: 18 }}>
          <section className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: '.86rem', fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>Görev Kimliği</div>
            {fieldGrid(
              <>
                <div>
                  <label className="f-label">Görev Adı</label>
                  <input className="f-input" value={form.title} onChange={event => setField('title', event.target.value)} />
                </div>
                <div>
                  <label className="f-label">Öncelik</label>
                  <SearchableSelect value={form.priority} onChange={value => setField('priority', value)} options={PRIORITY_OPTIONS} allowClear={false} />
                </div>
              </>,
            )}
            <div style={{ marginTop: 14 }}>
              <label className="f-label">Açıklama</label>
              <textarea className="f-input" rows={4} value={form.description} onChange={event => setField('description', event.target.value)} />
            </div>
          </section>

          <section className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: '.86rem', fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>Atama ve Kapsam</div>
            {fieldGrid(
              <>
                <div>
                  <label className="f-label">Birincil Sorumlu (Assignee)</label>
                  <SearchableSelect value={form.responsibleId} onChange={value => setField('responsibleId', value)} options={assignablePeople} placeholder="Personel seçin..." searchPlaceholder="Personel ara..." />
                </div>
                <div>
                  <label className="f-label">Lokasyon (Şube)</label>
                  <SearchableSelect value={form.locationId} onChange={value => setField('locationId', value)} options={branchOptions} placeholder="Şube seçin..." searchPlaceholder="Şube ara..." />
                </div>
              </>,
            )}
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
              <MultiPersonPicker label="Ek Sorumlular (Collaborator)" values={form.collaboratorIds} options={assignablePeople} onChange={value => setField('collaboratorIds', value)} placeholder="Personel ekle..." />
              <MultiPersonPicker label="Gözlemciler (Watcher)" values={form.observerIds} options={assignablePeople} onChange={value => setField('observerIds', value)} placeholder="Watcher ekle..." />
            </div>
          </section>

          <section className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: '.86rem', fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>Takvim</div>
            {fieldGrid(
              <>
                <div>
                  <label className="f-label">Başlangıç Tarihi</label>
                  <input type="date" className="f-input" value={form.startDate} onChange={event => setField('startDate', event.target.value)} />
                </div>
                <div>
                  <label className="f-label">Vade Tarihi</label>
                  <input type="date" className="f-input" value={form.completionDate} onChange={event => setField('completionDate', event.target.value)} />
                </div>
                <div>
                  <label className="f-label">Tekrar</label>
                  <SearchableSelect value={form.recurrence} onChange={value => setField('recurrence', value)} options={RECURRENCE_OPTIONS} />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 24, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.has_specific_time} onChange={event => setField('has_specific_time', event.target.checked)} />
                  <span style={{ fontSize: '.84rem', color: '#0f172a', fontWeight: 600 }}>Saat belirt</span>
                </label>
              </>,
            )}
            
            {/* Dynamic Recurrence Sub-Options */}
            {form.recurrence === 'daily' && (
              <div style={{ marginTop: 14, maxWidth: 220 }}>
                <label className="f-label">Tekrarlama Sıklığı (Gün)</label>
                <input
                  type="number"
                  min="1"
                  className="f-input"
                  value={form.durationValue || '1'}
                  onChange={event => setField('durationValue', event.target.value)}
                  placeholder="Örn. 1"
                />
              </div>
            )}

            {form.recurrence === 'weekly' && (
              <div style={{ marginTop: 14 }}>
                <label className="f-label">Tekrarlanacak Günler</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                  {[
                    { value: 'monday', label: 'Pazartesi' },
                    { value: 'tuesday', label: 'Salı' },
                    { value: 'wednesday', label: 'Çarşamba' },
                    { value: 'thursday', label: 'Perşembe' },
                    { value: 'friday', label: 'Cuma' },
                    { value: 'saturday', label: 'Cumartesi' },
                    { value: 'sunday', label: 'Pazar' }
                  ].map(day => {
                    const isSelected = form.weeklyDays?.includes(day.value)
                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => {
                          const nextDays = isSelected
                            ? form.weeklyDays.filter(d => d !== day.value)
                            : [...(form.weeklyDays || []), day.value]
                          setField('weeklyDays', nextDays)
                        }}
                        style={{
                          padding: '6px 12px',
                          borderRadius: 8,
                          fontSize: '.75rem',
                          fontWeight: 700,
                          border: '1px solid',
                          borderColor: isSelected ? '#0d9488' : '#e2e8f0',
                          background: isSelected ? '#f0fdfa' : '#fff',
                          color: isSelected ? '#0f766e' : '#475569',
                          cursor: 'pointer',
                          transition: 'all .15s'
                        }}
                      >
                        {day.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {form.recurrence === 'monthly' && (
              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
                <div>
                  <label className="f-label">Aylık Tekrarlama Şekli</label>
                  <select
                    className="f-input"
                    value={form.monthlyPattern || 'day_of_month'}
                    onChange={event => setField('monthlyPattern', event.target.value)}
                    style={{ height: 38 }}
                  >
                    <option value="day_of_month">Belirli Bir Gün</option>
                    <option value="last_day">Ayın Son Günü</option>
                    <option value="nth_weekday">N. Hafta Günü (Örn. 2. Pazartesi)</option>
                  </select>
                </div>
                {form.monthlyPattern === 'day_of_month' && (
                  <div>
                    <label className="f-label">Ayın Günü (1-31)</label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      className="f-input"
                      value={form.monthlyDayOfMonth || ''}
                      onChange={event => setField('monthlyDayOfMonth', event.target.value)}
                      placeholder="Örn. 15"
                    />
                  </div>
                )}
                {form.monthlyPattern === 'nth_weekday' && (
                  <>
                    <div>
                      <label className="f-label">Kaçıncı Hafta Günü</label>
                      <select
                        className="f-input"
                        value={form.monthlyNth || '1'}
                        onChange={event => setField('monthlyNth', event.target.value)}
                        style={{ height: 38 }}
                      >
                        <option value="1">1. (İlk)</option>
                        <option value="2">2.</option>
                        <option value="3">3.</option>
                        <option value="4">4.</option>
                        <option value="5">5. (Son)</option>
                      </select>
                    </div>
                    <div>
                      <label className="f-label">Hangi Gün</label>
                      <select
                        className="f-input"
                        value={form.monthlyWeekday || 'monday'}
                        onChange={event => setField('monthlyWeekday', event.target.value)}
                        style={{ height: 38 }}
                      >
                        <option value="monday">Pazartesi</option>
                        <option value="tuesday">Salı</option>
                        <option value="wednesday">Çarşamba</option>
                        <option value="thursday">Perşembe</option>
                        <option value="friday">Cuma</option>
                        <option value="saturday">Cumartesi</option>
                        <option value="sunday">Pazar</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            )}

            {form.recurrence === 'yearly' && (
              <div style={{ marginTop: 14, display: 'grid', gap: 14 }}>
                <div>
                  <label className="f-label">Yıllık Tekrarlama Şekli</label>
                  <select
                    className="f-input"
                    value={form.yearlyPattern || 'specific_dates'}
                    onChange={event => setField('yearlyPattern', event.target.value)}
                    style={{ height: 38 }}
                  >
                    <option value="specific_dates">Belirli Tarihler</option>
                  </select>
                </div>
                <div>
                  <label className="f-label">Tarihler (MM-DD veya YYYY-MM-DD formatında, virgülle veya alt alta ayırarak yazın)</label>
                  <textarea
                    className="f-input"
                    rows={3}
                    value={form.yearlyDates || ''}
                    onChange={event => setField('yearlyDates', event.target.value)}
                    placeholder="Örn. 01-01, 10-29"
                  />
                </div>
              </div>
            )}

            {form.has_specific_time && (
              <div style={{ marginTop: 14, maxWidth: 220 }}>
                <label className="f-label">Saat</label>
                <input type="time" className="f-input" value={form.completionTime} onChange={event => setField('completionTime', event.target.value)} />
              </div>
            )}
          </section>

          <section className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: '.86rem', fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>Checklist ve Ekler</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {form.checklistItems.map((item, index) => (
                <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
                  <input className="f-input" value={item.text} onChange={event => {
                    const next = [...form.checklistItems]
                    next[index] = { ...next[index], text: event.target.value }
                    setField('checklistItems', next)
                  }} placeholder={`Madde ${index + 1}`} />
                  <button type="button" className="btn-o" onClick={() => setField('checklistItems', form.checklistItems.filter(entry => entry.id !== item.id))}>Sil</button>
                </div>
              ))}
              <div>
                <button type="button" className="btn-o" onClick={() => setField('checklistItems', [...form.checklistItems, createChecklistItem()])}>
                  <i className="fa-solid fa-plus" /> Madde Ekle
                </button>
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <label className="f-label">Görevin Formu (İsteğe Bağlı)</label>
              <select
                className="f-input"
                value={form.formTemplateId}
                onChange={event => setField('formTemplateId', event.target.value)}
                style={{ height: 38 }}
              >
                <option value="">Form Seçilmedi</option>
                {formTemplates.map(tpl => (
                  <option key={tpl.id} value={tpl.id}>{tpl.title}</option>
                ))}
              </select>
            </div>

            <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label className="f-label">Dosya Ekleri</label>
                <input type="file" className="f-input" multiple onChange={event => setField('files', Array.from(event.target.files || []))} />
              </div>
              <div>
                <label className="f-label">Resim Ekleri</label>
                <input type="file" className="f-input" multiple accept="image/png,image/jpeg,image/webp" onChange={event => setField('images', Array.from(event.target.files || []))} />
              </div>
            </div>
          </section>

          <section className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: '.86rem', fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>Kurallar</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {[
                ['delegation_allowed', 'Delege Etmeye İzin Ver'],
                ['approval_required', 'Kapanış Onayı Gerekli'],
                ['closure_summary_required', 'Kapanış Özeti Zorunlu'],
                ['closure_file_required', 'Kapanış Dosyası Zorunlu'],
                ['closure_image_required', 'Kapanış Fotoğrafı Zorunlu'],
                ['edit_due_date_allowed', 'Atanan Vade Değiştirebilir'],
                ['edit_schedule_allowed', 'Atanan Takvim Değiştirebilir'],
                ['incomplete_if_late', 'Süresinde Bitmezse Tamamlanmadı'],
              ].map(([key, label]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!form[key]} onChange={event => setField(key, event.target.checked)} />
                  <span style={{ fontSize: '.84rem', color: '#0f172a', fontWeight: 600 }}>{label}</span>
                </label>
              ))}
            </div>
          </section>
        </div>
      </Modal>

      {/* Modal: Publish Announcement */}
      <Modal
        open={announcementCreateOpen}
        onClose={() => setAnnouncementCreateOpen(false)}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 4, height: 18, background: '#f59e0b', borderRadius: 2 }}></span>
            <span>Duyuru Yayınla</span>
          </div>
        }
        subtitle="Sisteme yeni bir duyuru/ilan yayınlayın."
        width={560}
        footer={(
          <>
            <button type="button" className="btn-o" onClick={() => setAnnouncementCreateOpen(false)}>Vazgeç</button>
            <button
              type="button"
              onClick={submitCreateAnnouncement}
              disabled={!actor}
              style={{
                padding: '10px 20px',
                borderRadius: 10,
                border: 'none',
                background: '#f59e0b',
                color: '#fff',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Duyuruyu yayınla
            </button>
          </>
        )}
      >
        <div style={{ display: 'grid', gap: 16 }}>
          <div>
            <label className="f-label">Başlık</label>
            <input
              type="text"
              className="f-input"
              value={annForm.title}
              onChange={e => setAnnField('title', e.target.value)}
              placeholder="Kısa duyuru başlığı"
            />
          </div>
          <div>
            <label className="f-label">Metin</label>
            <textarea
              className="f-input"
              rows={5}
              value={annForm.content}
              onChange={e => setAnnField('content', e.target.value)}
              placeholder="Duyuru içeriği"
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label className="f-label">Hedef ön tanımı</label>
              <select
                className="f-input"
                value={annForm.target_type}
                onChange={e => setAnnField('target_type', e.target.value)}
                style={{ height: 38 }}
              >
                <option value="all">Tüm Sistem</option>
                <option value="legal_entity">Tüzel Kişilik</option>
                <option value="branch">Şube</option>
                <option value="position">Pozisyon</option>
                <option value="personal">Kişisel</option>
              </select>
            </div>
            <div>
              <label className="f-label">Öncelik</label>
              <select
                className="f-input"
                value={annForm.priority}
                onChange={e => setAnnField('priority', e.target.value)}
                style={{ height: 38 }}
              >
                <option value="normal">Normal</option>
                <option value="high">Yüksek</option>
                <option value="low">Düşük</option>
              </select>
            </div>
          </div>

          {/* Dynamic Target Selection */}
          {annForm.target_type === 'legal_entity' && (
            <div>
              <label className="f-label">Tüzel Kişilik Seçin</label>
              <SearchableSelect
                value={annForm.target_id}
                onChange={value => setAnnField('target_id', value)}
                options={legalEntityOptions}
                placeholder="Tüzel Kişilik ara/seç..."
              />
            </div>
          )}

          {annForm.target_type === 'branch' && (
            <div>
              <label className="f-label">Şube Seçin</label>
              <SearchableSelect
                value={annForm.target_id}
                onChange={value => setAnnField('target_id', value)}
                options={branchOptions}
                placeholder="Şube ara/seç..."
              />
            </div>
          )}

          {annForm.target_type === 'position' && (
            <div>
              <label className="f-label">Pozisyon Seçin</label>
              <SearchableSelect
                value={annForm.target_id}
                onChange={value => setAnnField('target_id', value)}
                options={positionOptions}
                placeholder="Pozisyon ara/seç..."
              />
            </div>
          )}

          {annForm.target_type === 'personal' && (
            <div>
              <label className="f-label">Personel Seçin</label>
              <SearchableSelect
                value={annForm.target_id}
                onChange={value => setAnnField('target_id', value)}
                options={assignablePeople}
                placeholder="Personel ara/seç..."
              />
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', cursor: 'pointer', marginTop: 6 }}>
            <input
              type="checkbox"
              checked={annForm.request_read_receipt}
              onChange={e => setAnnField('request_read_receipt', e.target.checked)}
            />
            <span style={{ fontSize: '.84rem', color: '#0f172a', fontWeight: 600 }}>Okundu bilgisi iste ve raporla</span>
          </label>
        </div>
      </Modal>

      {/* Modal: Announcement Details & Read Receipts */}
      <Modal
        open={!!selectedAnnouncement}
        onClose={() => setSelectedAnnouncement(null)}
        title={selectedAnnouncement?.title || 'Duyuru Detayı'}
        subtitle="Yayınlanan duyuru içeriği ve okundu takibi."
        width={560}
      >
        {selectedAnnouncement && (
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ fontSize: '.9rem', color: '#334155', lineHeight: 1.6, whiteSpace: 'pre-wrap', background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e2e8f0' }}>
              {selectedAnnouncement.content}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.78rem', color: '#64748b' }}>
              <span>Öncelik: <strong>{selectedAnnouncement.priority === 'high' ? 'Yüksek' : selectedAnnouncement.priority === 'low' ? 'Düşük' : 'Normal'}</strong></span>
              <span>Yayın Tarihi: <strong>{new Date(selectedAnnouncement.created_at).toLocaleDateString('tr-TR')}</strong></span>
            </div>

            {/* Read Receipt list for creator */}
            {selectedAnnouncement.request_read_receipt && String(selectedAnnouncement.created_by_personnel_id) === String(actor?.id) && (
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14, marginTop: 6 }}>
                <div style={{ fontSize: '.84rem', fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>
                  Okundu Raporu ({readReceipts.length} Kişi Okudu)
                </div>
                {receiptsLoading ? (
                  <div style={{ fontSize: '.76rem', color: '#94a3b8' }}>Rapor yükleniyor...</div>
                ) : readReceipts.length === 0 ? (
                  <div style={{ fontSize: '.76rem', color: '#94a3b8' }}>Henüz okundu bilgisi yok.</div>
                ) : (
                  <div style={{ display: 'grid', gap: 8, maxHeight: 150, overflowY: 'auto', background: '#f8fafc', padding: 10, borderRadius: 10, border: '1px solid #e2e8f0' }}>
                    {readReceipts.map(rec => {
                      const person = peopleById.get(String(rec.personnel_id))
                      const name = person ? `${person.firstName} ${person.lastName}` : rec.personnel_id
                      return (
                        <div key={rec.personnel_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.72rem', color: '#475569' }}>
                          <span>{name}</span>
                          <span style={{ color: '#94a3b8' }}>{new Date(rec.read_at).toLocaleString('tr-TR')}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Task Drawer & Workflows */}
      <TaskDrawer
        open={!!selectedTask}
        task={selectedTask}
        peopleById={peopleById}
        formTemplates={formTemplates}
        onFillForm={handleFillForm}
        onClose={() => setSelectedTask(null)}
        isAssignee={isAssignee}
        isWatcher={isWatcher}
        canRejectCreator={canRejectCreator}
        onChangeDates={({ dueAt, startAt }) => runTaskAction(() => changeDueDate(selectedTask.id, actor.id, { dueAt, startAt }))}
        onStart={() => runTaskAction(() => acceptTask(selectedTask.id, actor.id))}
        onAccept={approvalId => runTaskAction(() => acceptAssignment(selectedTask.id, approvalId, actor.id))}
        onReject={approvalId => {
          const reason = window.prompt('Geri gönderme gerekçesi')
          if (!reason) return
          return runTaskAction(() => rejectAssignment(selectedTask.id, approvalId, actor.id, reason))
        }}
        onSoftDelete={() => {
          if (!window.confirm('Görev pasife alınsın mi?')) return
          return runTaskAction(() => softDeleteTask(selectedTask.id, actor.id))
        }}
        onRestore={() => runTaskAction(() => restoreTask(selectedTask.id, actor.id))}
        onOpenClosure={() => setClosureOpen(true)}
        onOpenSendBack={() => setSendBackOpen(true)}
        onOpenDelegate={() => setDelegateOpen(true)}
        onApproveCompletion={approvalId => runTaskAction(() => approveCompletion(approvalId, actor.id))}
        onRejectCompletion={approvalId => {
          const reason = window.prompt('Kapanış iade gerekçesi')
          if (!reason) return
          return runTaskAction(() => rejectCompletion(approvalId, actor.id, reason))
        }}
        onSendMessage={body => runTaskAction(() => appendChatMessage(selectedTask.id, actor.id, body))}
      />

      <TaskClosureModal
        open={closureOpen}
        task={selectedTask}
        onClose={() => setClosureOpen(false)}
        onSubmit={async payload => {
          const uploadedFiles = []
          for (const file of payload.files || []) {
            const uploaded = await uploadTaskFile(file)
            uploadedFiles.push(uploaded)
          }
          const uploadedImages = []
          for (const file of payload.images || []) {
            const uploaded = await uploadTaskFile(file)
            uploadedImages.push(uploaded)
          }
          const success = await runTaskAction(() => completeTask(selectedTask.id, actor.id, {
            summary: payload.summary,
            files: uploadedFiles,
            images: uploadedImages,
          }))
          if (success) setClosureOpen(false)
        }}
      />

      <TaskSendBackModal
        open={sendBackOpen}
        onClose={() => setSendBackOpen(false)}
        onSubmit={async reason => {
          const success = await runTaskAction(() => sendBack(selectedTask.id, actor.id, reason))
          if (success) setSendBackOpen(false)
        }}
      />

      <TaskDelegateModal
        open={delegateOpen}
        onClose={() => setDelegateOpen(false)}
        options={assignablePeople.filter(option => option.value !== String(actor?.id || ''))}
        onSubmit={async personnelId => {
          const person = peopleById.get(String(personnelId))
          if (!person) {
            toast('Personel bulunamadı.', 'error')
            return
          }
          const success = await runTaskAction(() => delegateTask(selectedTask.id, actor.id, person, {
            actorPositionId: actor.positionId,
            all: positionRecords,
          }))
          if (success) setDelegateOpen(false)
        }}
      />

      {isMobile && (
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            width: 56,
            height: 56,
            borderRadius: 28,
            background: '#0ea5e9',
            color: '#fff',
            border: 'none',
            boxShadow: '0 4px 14px rgba(14,165,233,.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.4rem',
            cursor: 'pointer',
            zIndex: 80,
            transition: 'transform 0.2s',
          }}
          onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseOut={e => e.currentTarget.style.transform = 'none'}
        >
          <i className="fa-solid fa-plus" />
        </button>
      )}

      {detailLoading && <div style={{ position: 'fixed', right: 20, bottom: 20, background: '#0f172a', color: '#fff', padding: '10px 14px', borderRadius: 12 }}>Detay yükleniyor...</div>}
    </div>
  )
}
