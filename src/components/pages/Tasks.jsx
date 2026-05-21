import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Header from '@/components/layout/Header'
import Modal from '@/components/ui/Modal'
import SearchableSelect from '@/components/ui/SearchableSelect'
import { useToast } from '@/hooks/useToast'
import { useWorkspace } from '@/context/WorkspaceContext'
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
} from '@/lib/taskService'
import TaskCard from '@/components/pages/tasks/TaskCard'
import TaskDrawer from '@/components/pages/tasks/TaskDrawer'
import TaskClosureModal from '@/components/pages/tasks/TaskClosureModal'
import TaskSendBackModal from '@/components/pages/tasks/TaskSendBackModal'
import TaskDelegateModal from '@/components/pages/tasks/TaskDelegateModal'

const RECURRENCE_OPTIONS = [
  { value: '', label: 'Tek seferlik' },
  { value: 'daily', label: 'Gunluk' },
  { value: 'weekly', label: 'Haftalik' },
  { value: 'monthly', label: 'Aylik' },
  { value: 'yearly', label: 'Yillik' },
]

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Dusuk' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'Yuksek' },
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
          <span style={{ fontSize: '.76rem', color: '#94a3b8' }}>Secim yok.</span>
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

export default function Tasks({ scope = 'center' }) {
  const toast = useToast()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const workspace = useWorkspace()
  const taskPrefillAppliedRef = useRef(false)
  const [actor, setActor] = useState(null)
  const [actorError, setActorError] = useState('')
  const [branchOptions, setBranchOptions] = useState([])
  const [peopleOptions, setPeopleOptions] = useState([])
  const [peopleById, setPeopleById] = useState(new Map())
  const [positionRecords, setPositionRecords] = useState([])
  const [taskRows, setTaskRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('mine')
  const [statusFilter, setStatusFilter] = useState('active')
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(createInitialForm())
  const [selectedTask, setSelectedTask] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [closureOpen, setClosureOpen] = useState(false)
  const [sendBackOpen, setSendBackOpen] = useState(false)
  const [delegateOpen, setDelegateOpen] = useState(false)

  useEffect(() => {
    let mounted = true

    async function loadActorContext() {
      if (workspace.pickerOpen) return

      const activeUser = readActiveUserSession()
      if (!activeUser?.id) {
        if (!mounted) return
        setActor(null)
        setActorError('Aktif kullanici baglami bulunamadi. Once mevcut calisma baglamini secin.')
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
          setActorError('Aktif kullanici personel kaydiyla eslestirilemedi.')
          setTaskRows([])
          return
        }

        setActor(nextActor)
      } catch (error) {
        if (!mounted) return
        setActor(null)
        setActorError(`Gorev baglami yuklenemedi: ${error.message}`)
        setTaskRows([])
        toast(`Gorev baglami yuklenemedi: ${error.message}`, 'error')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    loadActorContext()
    return () => {
      mounted = false
    }
  }, [toast, workspace.branchId, workspace.pickerOpen])

  async function refreshTasks() {
    if (!actor) return
    setLoading(true)
    const result = await fetchTasks({
      actor,
      scope,
      scopeBranchId: scope === 'center' ? '' : (workspace.branchId || actor.branchId || ''),
      tab,
      statusFilter,
    })
    if (result.error) toast(`Gorev listesi yuklenemedi: ${result.error.message}`, 'error')
    else setTaskRows(result.data || [])
    setLoading(false)
  }

  useEffect(() => {
    refreshTasks()
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

  async function openTask(task) {
    setDetailLoading(true)
    const result = await fetchTaskDetail(task.id)
    if (result.error) toast(`Gorev detayi yuklenemedi: ${result.error.message}`, 'error')
    else setSelectedTask(result.data)
    setDetailLoading(false)
  }

  function setField(key, value) {
    setForm(current => ({ ...current, [key]: value }))
  }

  async function submitCreate() {
    if (!actor) {
      toast('Once mevcut calisma baglamini secin.', 'error')
      workspace.openWorkspacePicker()
      return
    }
    if (!form.title.trim() || !form.responsibleId || !form.locationId) {
      toast('Gorev adi, sorumlu ve lokasyon zorunludur.', 'error')
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
        toast(`Gorev kaydedilemedi: ${result.error.message}`, 'error')
        return
      }
      toast('Gorev olusturuldu.', 'success')
      setCreateOpen(false)
      setForm(createInitialForm(actor.branchId || ''))
      const returnTo = searchParams.get('returnTo')
      if (searchParams.get('source') === 'loyalty_campaign' && returnTo) {
        navigate(returnTo)
        return
      }
      await refreshTasks()
    } catch (error) {
      toast(`Gorev kaydedilemedi: ${error.message}`, 'error')
    }
  }

  async function runTaskAction(action) {
    const result = await action()
    if (result?.error) {
      toast(result.error.message, 'error')
      return false
    }
    await refreshTasks()
    if (selectedTask?.id) {
      const detail = await fetchTaskDetail(selectedTask.id)
      if (!detail.error) setSelectedTask(detail.data)
    }
    return true
  }

  const assignablePeople = useMemo(() => peopleOptions, [peopleOptions])

  return (
    <>
      <Header
        title="Gorevler"
        subtitle="DB-first gorev takip modulu. Liste, detay ve workflow akislari burada yonetilir."
        actions={(
          <>
            <button type="button" className="btn-o" onClick={() => workspace.openWorkspacePicker()}>
              <i className="fa-solid fa-layer-group" /> Calisma Baglami
            </button>
            <button type="button" className="btn-p" onClick={() => setCreateOpen(true)}>
              <i className="fa-solid fa-plus" /> Yeni Gorev
            </button>
          </>
        )}
      />

      {actor && (
        <div className="card" style={{ padding: 14, marginBottom: 16, borderColor: '#bfdbfe', background: '#eff6ff' }}>
          <div style={{ fontSize: '.84rem', fontWeight: 800, color: '#1d4ed8' }}>
            Aktif kullanici: {[peopleById.get(String(actor.id))?.firstName, peopleById.get(String(actor.id))?.lastName].filter(Boolean).join(' ') || [actor.firstName, actor.lastName].filter(Boolean).join(' ') || actor.id}
          </div>
          <div style={{ marginTop: 4, fontSize: '.76rem', color: '#1e40af' }}>
            Scope: {scope} · Sube: {branchOptions.find(option => option.value === actor.branchId)?.label || workspace.branchName || actor.branchId || '-'}
          </div>
        </div>
      )}

      {!actor && actorError && (
        <div className="card" style={{ padding: 18, marginBottom: 16, borderColor: '#fdba74', background: '#fff7ed' }}>
          <div style={{ fontSize: '.9rem', fontWeight: 800, color: '#9a3412' }}>Gorev baglami hazir degil</div>
          <div style={{ marginTop: 6, fontSize: '.82rem', color: '#9a3412' }}>{actorError}</div>
          <div style={{ marginTop: 12 }}>
            <button type="button" className="btn-p" onClick={() => workspace.openWorkspacePicker()}>
              Calisma Baglamini Ac
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {[
          { value: 'mine', label: 'Gorevlerim' },
          { value: 'assigned_by_me', label: 'Verdigim Gorevler' },
          { value: 'watching', label: 'Gozlemci Olduklarim' },
        ].map(item => (
          <button key={item.value} type="button" className={tab === item.value ? 'btn-p' : 'btn-o'} onClick={() => setTab(item.value)}>
            {item.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
        {[
          { value: 'active', label: 'Devam Edenler' },
          { value: 'completed', label: 'Tamamlananlar' },
          { value: 'deleted', label: 'Pasifler' },
        ].map(item => (
          <button key={item.value} type="button" className={statusFilter === item.value ? 'btn-p' : 'btn-o'} onClick={() => setStatusFilter(item.value)}>
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: 38, textAlign: 'center', color: '#94a3b8' }}>Yukleniyor...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          {taskRows.length === 0 ? (
            <div className="card" style={{ padding: 24, color: '#94a3b8' }}>Bu filtrede gorev bulunamadi.</div>
          ) : taskRows.map(task => (
            <TaskCard key={task.id} task={task} peopleById={peopleById} onOpen={openTask} />
          ))}
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Yeni Gorev"
        subtitle="Mevcut gorev formunun DB-first v1 karsiligi."
        width={920}
        flex
        footer={(
          <>
            <button type="button" className="btn-o" onClick={() => setCreateOpen(false)}>Vazgec</button>
            <button type="button" className="btn-p" onClick={submitCreate} disabled={!actor}>Kaydet</button>
          </>
        )}
      >
        <div style={{ display: 'grid', gap: 18 }}>
          <section className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: '.86rem', fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>Gorev Kimligi</div>
            {fieldGrid(
              <>
                <div>
                  <label className="f-label">Gorev Adi</label>
                  <input className="f-input" value={form.title} onChange={event => setField('title', event.target.value)} />
                </div>
                <div>
                  <label className="f-label">Oncelik</label>
                  <SearchableSelect value={form.priority} onChange={value => setField('priority', value)} options={PRIORITY_OPTIONS} allowClear={false} />
                </div>
              </>,
            )}
            <div style={{ marginTop: 14 }}>
              <label className="f-label">Aciklama</label>
              <textarea className="f-input" rows={4} value={form.description} onChange={event => setField('description', event.target.value)} />
            </div>
          </section>

          <section className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: '.86rem', fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>Atama ve Kapsam</div>
            {fieldGrid(
              <>
                <div>
                  <label className="f-label">Birincil Assignee</label>
                  <SearchableSelect value={form.responsibleId} onChange={value => setField('responsibleId', value)} options={assignablePeople} placeholder="Personel secin..." searchPlaceholder="Personel ara..." />
                </div>
                <div>
                  <label className="f-label">Lokasyon</label>
                  <SearchableSelect value={form.locationId} onChange={value => setField('locationId', value)} options={branchOptions} placeholder="Sube secin..." searchPlaceholder="Sube ara..." />
                </div>
              </>,
            )}
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
              <MultiPersonPicker label="Ek Assignee" values={form.collaboratorIds} options={assignablePeople} onChange={value => setField('collaboratorIds', value)} placeholder="Personel ekle..." />
              <MultiPersonPicker label="Watcher" values={form.observerIds} options={assignablePeople} onChange={value => setField('observerIds', value)} placeholder="Watcher ekle..." />
            </div>
          </section>

          <section className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: '.86rem', fontWeight: 800, color: '#0f172a', marginBottom: 12 }}>Takvim</div>
            {fieldGrid(
              <>
                <div>
                  <label className="f-label">Baslangic Tarihi</label>
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
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 24 }}>
                  <input type="checkbox" checked={form.has_specific_time} onChange={event => setField('has_specific_time', event.target.checked)} />
                  <span style={{ fontSize: '.84rem', color: '#0f172a', fontWeight: 600 }}>Saat belirt</span>
                </label>
              </>,
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
                ['delegation_allowed', 'Delege Etmeye Izin Ver'],
                ['approval_required', 'Kapanis Onayi Gerekli'],
                ['closure_summary_required', 'Kapanis Ozeti Zorunlu'],
                ['closure_file_required', 'Kapanis Dosyasi Zorunlu'],
                ['closure_image_required', 'Kapanis Fotograf Zorunlu'],
                ['edit_due_date_allowed', 'Atanan Vade Degistirebilir'],
                ['edit_schedule_allowed', 'Atanan Takvim Degistirebilir'],
                ['incomplete_if_late', 'Suresinde Bitmezse Tamamlanmadi'],
              ].map(([key, label]) => (
                <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px' }}>
                  <input type="checkbox" checked={!!form[key]} onChange={event => setField(key, event.target.checked)} />
                  <span style={{ fontSize: '.84rem', color: '#0f172a', fontWeight: 600 }}>{label}</span>
                </label>
              ))}
            </div>
          </section>
        </div>
      </Modal>

      <TaskDrawer
        open={!!selectedTask}
        task={selectedTask}
        peopleById={peopleById}
        onClose={() => setSelectedTask(null)}
        onStart={() => runTaskAction(() => acceptTask(selectedTask.id, actor.id))}
        onAccept={approvalId => runTaskAction(() => acceptAssignment(selectedTask.id, approvalId, actor.id))}
        onReject={approvalId => {
          const reason = window.prompt('Geri gonderme gerekcesi')
          if (!reason) return
          return runTaskAction(() => rejectAssignment(selectedTask.id, approvalId, actor.id, reason))
        }}
        onSoftDelete={() => {
          if (!window.confirm('Gorev pasife alinsin mi?')) return
          return runTaskAction(() => softDeleteTask(selectedTask.id, actor.id))
        }}
        onRestore={() => runTaskAction(() => restoreTask(selectedTask.id, actor.id))}
        onOpenClosure={() => setClosureOpen(true)}
        onOpenSendBack={() => setSendBackOpen(true)}
        onOpenDelegate={() => setDelegateOpen(true)}
        onApproveCompletion={approvalId => runTaskAction(() => approveCompletion(approvalId, actor.id))}
        onRejectCompletion={approvalId => {
          const reason = window.prompt('Kapanis iade gerekcesi')
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
            toast('Personel bulunamadi.', 'error')
            return
          }
          const success = await runTaskAction(() => delegateTask(selectedTask.id, actor.id, person, {
            actorPositionId: actor.positionId,
            all: positionRecords,
          }))
          if (success) setDelegateOpen(false)
        }}
      />

      {detailLoading && <div style={{ position: 'fixed', right: 20, bottom: 20, background: '#0f172a', color: '#fff', padding: '10px 14px', borderRadius: 12 }}>Detay yukleniyor...</div>}
    </>
  )
}
