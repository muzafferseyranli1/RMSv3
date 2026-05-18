import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Header from '@/components/layout/Header'
import Modal from '@/components/ui/Modal'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useToast } from '@/hooks/useToast'
import AddButton from '@/components/ui/AddButton'
import { useWorkspace } from '@/context/WorkspaceContext'
import {
  AUTHORITY_LEVEL_OPTIONS,
  CONTRACT_TYPES,
  GENDER_OPTIONS,
  PERSONNEL_SETTINGS_KEYS,
  createEmptyEmployee,
  createUniquePin,
  createUid,
  formatAmount,
  getEnabledContractTypes,
  getPositionDefaultSalary,
  normalizeEmployeeRecord,
  normalizePositionRecord,
  readSettingArray,
  writeSettingArray,
} from '@/lib/personnelConfig'
import { buildPersonnelNodesFromCompanyNodes } from '@/lib/branchContexts'
import { db } from '@/lib/db'

function BranchPicker({ title, branches, selectedIds, onChange, emptyText }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef(null)

  useEffect(() => {
    function handleOutsideClick(event) {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  const filteredBranches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return branches
    return branches.filter(branch => (
      branch.name.toLowerCase().includes(q) ||
      (branch.legalEntityName || '').toLowerCase().includes(q)
    ))
  }, [branches, query])

  const selectedBranches = useMemo(() => (
    selectedIds.map(id => branches.find(branch => branch.id === id)).filter(Boolean)
  ), [branches, selectedIds])

  function toggleBranch(branchId) {
    onChange(
      selectedIds.includes(branchId)
        ? selectedIds.filter(item => item !== branchId)
        : [...selectedIds, branchId]
    )
  }

  function selectAllVisibleBranches() {
    const next = [...selectedIds]
    for (const branch of filteredBranches) {
      if (!next.includes(branch.id)) next.push(branch.id)
    }
    onChange(next)
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <label className="f-label">{title}</label>
      {branches.length === 0 ? (
        <div style={{ border: '1px dashed #cbd5e1', borderRadius: 12, padding: '12px 14px', color: '#94a3b8', fontSize: '.8rem' }}>
          {emptyText}
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => { setOpen(value => !value); setQuery('') }}
            style={{
              width: '100%', minHeight: 42, position: 'relative', textAlign: 'left',
              border: `1.5px solid ${open ? '#fbbf24' : '#c4cdd9'}`, borderRadius: 12,
              padding: '9px 38px 9px 12px', background: '#fff', cursor: 'pointer',
              display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6,
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,.06)',
            }}
          >
            {selectedBranches.length === 0 ? (
              <span style={{ color: '#94a3b8' }}>Şube seçin...</span>
            ) : selectedBranches.map(branch => (
              <span key={branch.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: 999, background: '#fffbeb', color: '#b45309', fontSize: '.74rem', fontWeight: 700 }}>
                {branch.name}
                <span onClick={event => { event.stopPropagation(); toggleBranch(branch.id) }} style={{ cursor: 'pointer', opacity: 0.65 }}>×</span>
              </span>
            ))}
            <i className="fa-solid fa-chevron-down" style={{ position: 'absolute', right: 12, top: '50%', transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`, color: '#94a3b8', fontSize: '.65rem', pointerEvents: 'none' }} />
          </button>

          {open && (
            <div style={{ position: 'absolute', left: 0, right: 0, top: 'calc(100% + 6px)', background: '#fff', border: '1.5px solid #e2e8f0', borderRadius: 14, boxShadow: '0 12px 30px rgba(15,23,42,.14)', zIndex: 250, overflow: 'hidden' }}>
              <div style={{ padding: '8px 10px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 8, alignItems: 'center' }}>
                <i className="fa-solid fa-magnifying-glass" style={{ color: '#94a3b8', fontSize: '.75rem' }} />
                <input className="f-input" placeholder="Şube ara..." value={query} onChange={event => setQuery(event.target.value)} onClick={event => event.stopPropagation()} style={{ padding: '6px 10px', fontSize: '.83rem', border: 'none', outline: 'none', boxShadow: 'none', flex: 1 }} autoFocus />
                {filteredBranches.length > 0 && <button type="button" onClick={event => { event.stopPropagation(); selectAllVisibleBranches() }} style={{ border: 'none', background: 'none', color: '#64748b', fontSize: '.75rem', cursor: 'pointer' }}>Tumunu Sec</button>}
                {selectedIds.length > 0 && <button type="button" onClick={event => { event.stopPropagation(); onChange([]) }} style={{ border: 'none', background: 'none', color: '#94a3b8', fontSize: '.75rem', cursor: 'pointer' }}>Temizle</button>}
              </div>
              <div style={{ maxHeight: 260, overflowY: 'auto', padding: 6 }}>
                {filteredBranches.length === 0 ? (
                  <div style={{ padding: 14, textAlign: 'center', fontSize: '.8rem', color: '#94a3b8' }}>Sonuç bulunamadı</div>
                ) : filteredBranches.map(branch => {
                  const checked = selectedIds.includes(branch.id)
                  return (
                    <button key={branch.id} type="button" onClick={event => { event.stopPropagation(); toggleBranch(branch.id) }} style={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: 10, border: `1px solid ${checked ? '#fcd34d' : '#e2e8f0'}`, background: checked ? '#fffbeb' : '#fff', borderRadius: 12, padding: '10px 12px', cursor: 'pointer', textAlign: 'left', marginBottom: 8 }}>
                      <input type="checkbox" checked={checked} readOnly style={{ marginTop: 3, pointerEvents: 'none' }} />
                      <span>
                        <span style={{ display: 'block', fontWeight: 700, color: '#0f172a' }}>{branch.name}</span>
                        {branch.legalEntityName && <span style={{ display: 'block', marginTop: 2, fontSize: '.74rem', color: '#64748b' }}>{branch.legalEntityName}</span>}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function InfoBox({ label, value }) {
  return (
    <div>
      <label className="f-label">{label}</label>
      <div style={{ minHeight: 42, border: '1px solid #e2e8f0', borderRadius: 12, background: '#f8fafc', padding: '10px 12px', color: '#475569', fontSize: '.84rem', lineHeight: 1.55 }}>
        {value || 'Tanımlı değil'}
      </div>
    </div>
  )
}

const isTerminatedEmployee = employee => !!String(employee?.terminationDate || '').trim()

function getEmployeeStatus(employee) {
  if (employee.deletedAt) return { label: 'Pasif', icon: 'fa-ban', style: { background: '#fee2e2', color: '#b91c1c' } }
  if (isTerminatedEmployee(employee)) return { label: 'Ayrıldı', icon: 'fa-user-slash', style: { background: '#ffedd5', color: '#c2410c' } }
  return { label: 'Aktif', icon: 'fa-check', style: { background: '#dcfce7', color: '#166534' } }
}

export function PersonnelPage({ mode = 'center' }) {
  const isBranchView = mode === 'branch'
  const toast = useToast()
  const { branchId, branchName } = useWorkspace()
  const [employees, setEmployees] = useState([])
  const [positions, setPositions] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [showDeleted, setShowDeleted] = useState(false)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(createEmptyEmployee())
  const [editId, setEditId] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const positionMap = useMemo(() => Object.fromEntries(positions.map(position => [position.id, position])), [positions])
  const branchMap = useMemo(() => Object.fromEntries(branches.map(branch => [branch.id, branch])), [branches])
  const activePositions = useMemo(() => positions.filter(position => !position.deletedAt).sort((a, b) => a.name.localeCompare(b.name, 'tr')), [positions])
  const scopedEmployees = useMemo(() => employees.filter(employee => !isBranchView || employee.defaultBranchId === branchId), [employees, isBranchView, branchId])
  const activeEmployeeCount = useMemo(() => scopedEmployees.filter(employee => !employee.deletedAt && !isTerminatedEmployee(employee)).length, [scopedEmployees])
  const selectedPosition = form.positionId ? positionMap[form.positionId] : null
  const enabledContractTypes = useMemo(() => getEnabledContractTypes(selectedPosition), [selectedPosition])
  const workingBranchesText = useMemo(() => (form.workingBranchIds || []).map(id => branchMap[id]?.name).filter(Boolean).join(', '), [form.workingBranchIds, branchMap])
  const managedBranchesText = useMemo(() => (form.managedBranchIds || []).map(id => branchMap[id]?.name).filter(Boolean).join(', '), [form.managedBranchIds, branchMap])

  const visibleEmployees = useMemo(() => (
    scopedEmployees
      .filter(employee => showDeleted || !employee.deletedAt)
      .filter(employee => {
        if (!search.trim()) return true
        const query = search.toLowerCase()
        const fullName = `${employee.firstName} ${employee.middleName} ${employee.lastName}`.toLowerCase()
        const positionName = positionMap[employee.positionId]?.name?.toLowerCase() || ''
        return (
          fullName.includes(query) ||
          positionName.includes(query) ||
          employee.registryNumber.toLowerCase().includes(query) ||
          employee.username.toLowerCase().includes(query)
        )
      })
      .sort((first, second) => {
        const firstName = `${first.firstName} ${first.lastName}`.trim()
        const secondName = `${second.firstName} ${second.lastName}`.trim()
        return firstName.localeCompare(secondName, 'tr')
      })
  ), [scopedEmployees, showDeleted, search, positionMap])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [employeeRecords, positionRecords, nodesResult] = await Promise.all([
        readSettingArray(PERSONNEL_SETTINGS_KEYS.employees, normalizeEmployeeRecord),
        readSettingArray(PERSONNEL_SETTINGS_KEYS.positions, normalizePositionRecord),
        db.from('company_nodes').select('id,type,name,parent_id,sort_order,can_sell').order('sort_order').order('name'),
      ])
      setEmployees(employeeRecords)
      setPositions(positionRecords)
      setBranches(buildPersonnelNodesFromCompanyNodes(nodesResult.data || []))
    } catch (error) {
      toast('Personel ekranı yüklenemedi: ' + error.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  function openCreate() {
    if (isBranchView) return
    setForm(createEmptyEmployee())
    setEditId(null)
    setModalOpen(true)
  }

  function openEdit(employee) {
    setForm(normalizeEmployeeRecord(employee))
    setEditId(employee.id)
    setModalOpen(true)
  }

  function closeModal() {
    setForm(createEmptyEmployee())
    setEditId(null)
    setModalOpen(false)
  }

  function setField(key, value) {
    setForm(current => ({ ...current, [key]: value }))
  }

  function applyPositionDefaults(positionId) {
    const position = positionMap[positionId]
    const contracts = getEnabledContractTypes(position)
    const contractType = contracts.some(contract => contract.key === form.contractType)
      ? form.contractType
      : (contracts[0]?.key || CONTRACT_TYPES[0].key)
    const defaultSalary = getPositionDefaultSalary(position, contractType)

    setForm(current => ({
      ...current,
      positionId,
      contractType,
      salary: defaultSalary === '' ? current.salary : defaultSalary,
    }))
  }

  function handleContractTypeChange(contractType) {
    const defaultSalary = getPositionDefaultSalary(selectedPosition, contractType)
    setForm(current => ({
      ...current,
      contractType,
      salary: defaultSalary === '' ? current.salary : defaultSalary,
    }))
  }

  function handlePhotoChange(event) {
    const file = event.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = loadEvent => {
      setField('photo', loadEvent.target?.result || '')
    }
    reader.readAsDataURL(file)
  }

  async function persist(nextEmployees, message, type = 'success') {
    await writeSettingArray(PERSONNEL_SETTINGS_KEYS.employees, nextEmployees)
    setEmployees(nextEmployees.map(employee => normalizeEmployeeRecord(employee)))
    toast(message, type)
  }

  async function save() {
    if (!form.firstName.trim()) return toast('Adı zorunludur', 'error')
    if (!form.lastName.trim()) return toast('Soyadı zorunludur', 'error')
    if (!form.positionId) return toast('Görev seçmelisiniz', 'error')
    if (!form.defaultBranchId) return toast('Varsayılan şube seçmelisiniz', 'error')
    if (form.hireDate && form.terminationDate && form.terminationDate < form.hireDate) {
      return toast('İşten ayrılma tarihi işe başlama tarihinden önce olamaz', 'error')
    }

    const duplicateUsername = employees.find(employee =>
      employee.id !== editId &&
      !employee.deletedAt &&
      employee.username &&
      employee.username.toLowerCase() === form.username.trim().toLowerCase(),
    )
    if (duplicateUsername) return toast('Bu kullanıcı adı zaten kullanılıyor', 'error')

    const siblingPins = employees.filter(employee => employee.id !== editId && !employee.deletedAt).map(employee => employee.pin)
    let resolvedPin = form.pin.trim()
    if (resolvedPin) {
      if (!/^\d{4,6}$/.test(resolvedPin)) return toast('PIN 4-6 haneli rakamlardan oluşmalıdır', 'error')
      if (siblingPins.includes(resolvedPin)) return toast('Bu PIN başka bir personel tarafından kullanılmaktadır. Lütfen farklı bir PIN girin.', 'error')
    } else {
      resolvedPin = createUniquePin(siblingPins)
      toast('PIN otomatik atandı: ' + resolvedPin, 'info')
    }

    const timestamp = new Date().toISOString()
    const payload = normalizeEmployeeRecord({
      ...form,
      id: editId || createUid('emp_'),
      firstName: form.firstName.trim(),
      middleName: form.middleName.trim(),
      lastName: form.lastName.trim(),
      registryNumber: form.registryNumber.trim(),
      sgkNumber: form.sgkNumber.trim(),
      address: form.address.trim(),
      phone: form.phone.trim(),
      mobilePhone: form.mobilePhone.trim(),
      telegramUsername: form.telegramUsername.trim(),
      email: form.email.trim(),
      contractType: enabledContractTypes.some(contractType => contractType.key === form.contractType)
        ? form.contractType
        : (enabledContractTypes[0]?.key || CONTRACT_TYPES[0].key),
      username: form.username.trim(),
      bankName: form.bankName.trim(),
      iban: form.iban.trim(),
      pin: resolvedPin,
      createdAt: editId ? form.createdAt : timestamp,
      updatedAt: timestamp,
      deletedAt: null,
    })

    const nextEmployees = editId
      ? employees.map(employee => employee.id === editId ? payload : employee)
      : [...employees, payload]

    try {
      await persist(nextEmployees, editId ? 'Personel kaydı güncellendi' : 'Personel kaydı eklendi')
      closeModal()
    } catch (error) {
      toast('Personel kaydı kaydedilemedi: ' + error.message, 'error')
    }
  }

  async function archiveEmployee(employee) {
    try {
      const nextEmployees = employees.map(item => item.id === employee.id ? { ...item, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() } : item)
      await persist(nextEmployees, `"${employee.firstName} ${employee.lastName}" pasife alındı`, 'info')
    } catch (error) {
      toast('Personel pasife alınamadı: ' + error.message, 'error')
    } finally {
      setConfirm(null)
    }
  }

  async function restoreEmployee(employee) {
    try {
      const nextEmployees = employees.map(item => item.id === employee.id ? { ...item, deletedAt: null, updatedAt: new Date().toISOString() } : item)
      await persist(nextEmployees, `"${employee.firstName} ${employee.lastName}" yeniden aktif edildi`)
    } catch (error) {
      toast('Personel geri alınamadı: ' + error.message, 'error')
    }
  }

  const confirmTitle = confirm
    ? `"${confirm.firstName} ${confirm.lastName}" pasife alınsın mı?`
    : 'Bu kayıt pasife alınsın mı?'

  return (
    <div className="page-enter">
      <Header
        title="Personel"
        subtitle={isBranchView ? `${activeEmployeeCount} aktif personel${branchName ? ` / ${branchName}` : ''}` : `${activeEmployeeCount} aktif personel`}
        actions={<>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '.83rem', fontWeight: 600, color: showDeleted ? '#dc2626' : '#64748b', background: showDeleted ? '#fee2e2' : '#f1f5f9', padding: '7px 14px', borderRadius: 10, userSelect: 'none' }}>
            <label className="tog" onClick={event => event.stopPropagation()}>
              <input type="checkbox" checked={showDeleted} onChange={event => setShowDeleted(event.target.checked)} />
              <span className="tog-sl" />
            </label>
            Pasifleri göster
          </label>
          {!isBranchView && <AddButton onClick={openCreate} label="Personel Ekle" icon="fa-user-plus" />}
        </>}
      />

      {!isBranchView && activePositions.length === 0 && (
        <div style={{ background: '#fff7ed', border: '1px solid #fdba74', color: '#9a3412', borderRadius: 14, padding: '12px 16px', marginBottom: 16, fontSize: '.83rem', lineHeight: 1.5 }}>
          Personel kartı oluşturmadan önce `Ayarlar &gt; Personel Ayarları &gt; Pozisyonlar` altında en az bir pozisyon tanımlamanız önerilir.
        </div>
      )}

      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ position: 'relative' }}>
          <i className="fa-solid fa-search" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '.75rem' }} />
          <input className="f-input" value={search} onChange={event => setSearch(event.target.value)} placeholder="Ad, sicil numarası, görev veya kullanıcı adı ara..." style={{ paddingLeft: 30 }} />
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 42, textAlign: 'center', color: '#94a3b8' }}>
          <i className="fa-solid fa-spinner fa-spin" />
          <span style={{ marginLeft: 8 }}>Yükleniyor...</span>
        </div>
      ) : (
        <div className="card" style={{ overflow: 'hidden' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Personel</th>
                <th>Görev</th>
                <th>Yetki / Şube</th>
                <th>İletişim</th>
                <th>Ücret</th>
                <th>Durum</th>
                <th>İşlem</th>
              </tr>
            </thead>
            <tbody>
              {visibleEmployees.length === 0 && (
                <tr>
                  <td colSpan={7}><div className="empty"><i className="fa-solid fa-users" /><p>Personel kaydı bulunamadı</p></div></td>
                </tr>
              )}

              {visibleEmployees.map(employee => {
                const fullName = [employee.firstName, employee.middleName, employee.lastName].filter(Boolean).join(' ')
                const position = positionMap[employee.positionId]
                const defaultBranch = branchMap[employee.defaultBranchId]
                const status = getEmployeeStatus(employee)

                return (
                  <tr key={employee.id} className={employee.deletedAt ? 'deleted' : ''}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 12, background: '#eff6ff', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {employee.photo ? <img src={employee.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <i className="fa-solid fa-user" style={{ color: '#2563eb' }} />}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: '#0f172a' }}>{fullName}</div>
                          <div style={{ marginTop: 4, fontSize: '.74rem', color: '#64748b' }}>Sicil: {employee.registryNumber || '—'} · PIN: {employee.pin || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{position?.name || '—'}</div>
                      <div style={{ marginTop: 4, fontSize: '.74rem', color: '#64748b' }}>{CONTRACT_TYPES.find(contractType => contractType.key === employee.contractType)?.label || '—'}</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{employee.authorityLevel || '—'}</div>
                      <div style={{ marginTop: 4, fontSize: '.74rem', color: '#64748b' }}>Varsayılan Şube: {defaultBranch?.name || '—'}</div>
                    </td>
                    <td>
                      <div>{employee.mobilePhone || employee.phone || '—'}</div>
                      <div style={{ marginTop: 4, fontSize: '.74rem', color: '#64748b' }}>{employee.email || '—'}</div>
                    </td>
                    <td>{formatAmount(employee.salary)}</td>
                    <td><span className="badge" style={status.style}><i className={`fa-solid ${status.icon}`} style={{ fontSize: '.65rem' }} />{status.label}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {isBranchView ? (
                          !employee.deletedAt && <button className="ico-btn edit" title="Düzenle" onClick={() => openEdit(employee)}><i className="fa-solid fa-pen" /></button>
                        ) : employee.deletedAt ? (
                          <button className="ico-btn" title="Geri Al" onClick={() => restoreEmployee(employee)} style={{ color: '#16a34a', background: '#d1fae5' }}><i className="fa-solid fa-rotate-left" /></button>
                        ) : (
                          <>
                            <button className="ico-btn edit" title="Düzenle" onClick={() => openEdit(employee)}><i className="fa-solid fa-pen" /></button>
                            <button className="ico-btn del" title="Pasife Al" onClick={() => setConfirm(employee)}><i className="fa-solid fa-trash" /></button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={closeModal}
        width={960}
        flex
        title={editId ? 'Personel Kartını Düzenle' : 'Yeni Personel Kartı'}
        subtitle={isBranchView ? 'Şube ekranında yalnızca izin verilen alanlar güncellenebilir.' : 'Excel’de paylaşılan personel kartı alanları baz alınmıştır.'}
        footer={<><button className="btn-g" onClick={closeModal}>İptal</button><button className="btn-p" onClick={save}><i className="fa-solid fa-check" />Kaydet</button></>}
      >
        <div style={{ display: 'grid', gap: 18 }}>
          <section style={{ display: 'grid', gap: 14 }}>
            <div style={{ fontSize: '.82rem', fontWeight: 800, color: '#475569', letterSpacing: '.08em', textTransform: 'uppercase' }}>Kimlik ve İletişim</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
              <div><label className="f-label">Adı <span style={{ color: '#ef4444' }}>*</span></label><input className="f-input" value={form.firstName} onChange={event => setField('firstName', event.target.value)} placeholder="Muzaffer" disabled={isBranchView} /></div>
              <div><label className="f-label">İkinci Adı</label><input className="f-input" value={form.middleName} onChange={event => setField('middleName', event.target.value)} placeholder="Opsiyonel" disabled={isBranchView} /></div>
              <div><label className="f-label">Soyadı <span style={{ color: '#ef4444' }}>*</span></label><input className="f-input" value={form.lastName} onChange={event => setField('lastName', event.target.value)} placeholder="Seyranlı" disabled={isBranchView} /></div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 }}>
              <div><label className="f-label">Sicil Numarası</label><input className="f-input" value={form.registryNumber} onChange={event => setField('registryNumber', event.target.value)} /></div>
              <div><label className="f-label">SGK Numarası</label><input className="f-input" value={form.sgkNumber} onChange={event => setField('sgkNumber', event.target.value)} /></div>
              <div><label className="f-label">Cinsiyet</label><div className="sel-wrap"><select className="f-input" value={form.gender} onChange={event => setField('gender', event.target.value)}><option value="">Seçin...</option>{GENDER_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div></div>
              <div><label className="f-label">Doğum Tarihi</label><input className="f-input" type="date" value={form.birthDate} onChange={event => setField('birthDate', event.target.value)} /></div>
            </div>

            <div><label className="f-label">Adres</label><textarea className="f-input" rows={3} value={form.address} onChange={event => setField('address', event.target.value)} placeholder="Adres bilgisi" style={{ resize: 'vertical', minHeight: 88 }} /></div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 }}>
              <div><label className="f-label">Telefon Numarası</label><input className="f-input" value={form.phone} onChange={event => setField('phone', event.target.value)} /></div>
              <div><label className="f-label">Cep Telefon Numarası</label><input className="f-input" value={form.mobilePhone} onChange={event => setField('mobilePhone', event.target.value)} /></div>
              <div><label className="f-label">Telegram Kullanıcı Adı</label><input className="f-input" value={form.telegramUsername} onChange={event => setField('telegramUsername', event.target.value)} placeholder="@kullaniciadi" /></div>
              <div><label className="f-label">E-Posta Adresi</label><input className="f-input" type="email" value={form.email} onChange={event => setField('email', event.target.value)} /></div>
            </div>
          </section>

          <section style={{ display: 'grid', gap: 14 }}>
            <div style={{ fontSize: '.82rem', fontWeight: 800, color: '#475569', letterSpacing: '.08em', textTransform: 'uppercase' }}>Organizasyon ve Yetki</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
              {isBranchView ? (
                <InfoBox label="Yetki Düzeyi" value={form.authorityLevel || '—'} />
              ) : (
                <div><label className="f-label">Yetki Düzeyi</label><div className="sel-wrap"><select className="f-input" value={form.authorityLevel} onChange={event => setField('authorityLevel', event.target.value)}><option value="">Seçin...</option>{AUTHORITY_LEVEL_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div></div>
              )}
              <div><label className="f-label">Görevi <span style={{ color: '#ef4444' }}>*</span></label><div className="sel-wrap"><select className="f-input" value={form.positionId} onChange={event => applyPositionDefaults(event.target.value)}><option value="">Pozisyon seçin...</option>{activePositions.map(position => <option key={position.id} value={position.id}>{position.name} ({position.shortCode})</option>)}</select></div></div>
              {isBranchView ? (
                <InfoBox label="Varsayılan Şube" value={branchMap[form.defaultBranchId]?.name || '—'} />
              ) : (
                <div><label className="f-label">Varsayılan Şube <span style={{ color: '#ef4444' }}>*</span></label><div className="sel-wrap"><select className="f-input" value={form.defaultBranchId} onChange={event => setField('defaultBranchId', event.target.value)}><option value="">Şube seçin...</option>{branches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}{branch.legalEntityName ? ` (${branch.legalEntityName})` : ''}</option>)}</select></div></div>
              )}
            </div>

            {selectedPosition && (
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 14, padding: 14, background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 12, background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><i className="fa-solid fa-briefcase" /></div>
                  <div>
                    <div style={{ fontWeight: 800, color: '#0f172a' }}>{selectedPosition.name}</div>
                    <div style={{ fontSize: '.78rem', color: '#64748b' }}>Kısa kod: {selectedPosition.shortCode} · Geç giriş toleransı: {selectedPosition.lateToleranceMinutes} dk</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
                  {enabledContractTypes.map(contractType => (
                    <button
                      key={contractType.key}
                      type="button"
                      onClick={() => handleContractTypeChange(contractType.key)}
                      style={{ textAlign: 'left', border: `1px solid ${form.contractType === contractType.key ? '#f59e0b' : '#e2e8f0'}`, background: form.contractType === contractType.key ? '#fffbeb' : '#fff', borderRadius: 12, padding: '12px 14px', cursor: 'pointer' }}
                    >
                      <div style={{ fontWeight: 800, color: '#0f172a' }}>{contractType.label}</div>
                      <div style={{ marginTop: 4, fontSize: '.78rem', color: '#64748b' }}>Varsayılan ücret: {formatAmount(getPositionDefaultSalary(selectedPosition, contractType.key))}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
              {isBranchView ? (
                <>
                  <InfoBox label="Çalışabileceği Şubeler" value={workingBranchesText} />
                  <InfoBox label="Sorumlu Olduğu Şubeler" value={managedBranchesText} />
                </>
              ) : (
                <>
                  <BranchPicker title="Çalıştığı Şubeler" branches={branches} selectedIds={form.workingBranchIds} onChange={value => setField('workingBranchIds', value)} emptyText="Şirket ağacında şube bulunamadı." />
                  <BranchPicker title="Sorumlu Olduğu Şubeler" branches={branches} selectedIds={form.managedBranchIds} onChange={value => setField('managedBranchIds', value)} emptyText="Şirket ağacında şube bulunamadı." />
                </>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
              <div><label className="f-label">İşe Başlama Tarihi</label><input className="f-input" type="date" value={form.hireDate} onChange={event => setField('hireDate', event.target.value)} disabled={isBranchView} /></div>
              <div><label className="f-label">İşten Ayrılma Tarihi</label><input className="f-input" type="date" value={form.terminationDate} onChange={event => setField('terminationDate', event.target.value)} /></div>
            </div>
          </section>

          <section style={{ display: 'grid', gap: 14 }}>
            <div style={{ fontSize: '.82rem', fontWeight: 800, color: '#475569', letterSpacing: '.08em', textTransform: 'uppercase' }}>Sistem ve Ücret Bilgileri</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14 }}>
              <div><label className="f-label">Kullanıcı Adı</label><input className="f-input" value={form.username} onChange={event => setField('username', event.target.value)} /></div>
              <div><label className="f-label">Kullanıcı Şifresi</label><input className="f-input" type="password" value={form.password} onChange={event => setField('password', event.target.value)} /></div>
              <div>
                <label className="f-label">PIN</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    className="f-input"
                    type="text"
                    value={form.pin}
                    onChange={event => {
                      const v = event.target.value.replace(/\D/g, '').slice(0, 6)
                      setField('pin', v)
                    }}
                    placeholder="Boş bırakılırsa otomatik üretilir"
                    style={{ flex: 1 }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const siblings = employees.filter(e => e.id !== editId && !e.deletedAt).map(e => e.pin)
                      let attempts = 0
                      let generated = null
                      while (attempts < 10) {
                        const candidate = String(Math.floor(1000 + Math.random() * 9000))
                        if (!siblings.includes(candidate)) { generated = candidate; break }
                        attempts++
                      }
                      if (generated) {
                        setField('pin', generated)
                      } else {
                        toast('Uygun PIN bulunamadı, lütfen manuel girin', 'warning')
                      }
                    }}
                    style={{ whiteSpace: 'nowrap', padding: '9px 14px', borderRadius: 10, border: 'none', background: '#f59e0b', color: '#fff', fontWeight: 700, fontSize: '.8rem', cursor: 'pointer', flexShrink: 0 }}
                  >
                    Oluştur
                  </button>
                </div>
              </div>
              <div>
                <label className="f-label">Fotoğraf</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <label style={{ cursor: 'pointer' }}>
                    <span className="btn-o" style={{ fontSize: '.8rem', padding: '8px 12px' }}><i className="fa-solid fa-upload" />Fotoğraf Yükle</span>
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
                  </label>
                  {form.photo && <button className="btn-g" onClick={() => setField('photo', '')}>Kaldır</button>}
                </div>
              </div>
            </div>

            {form.photo && <div style={{ width: 86, height: 86, borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#fff' }}><img src={form.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div>}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 14 }}>
              <div><label className="f-label">Maaş / Ücret</label><input className="f-input" type="number" min="0" step="0.01" value={form.salary} onChange={event => setField('salary', event.target.value)} placeholder="Pozisyondan önerilir, istenirse değiştirilebilir" /></div>
              <div><label className="f-label">Banka</label><input className="f-input" value={form.bankName} onChange={event => setField('bankName', event.target.value)} /></div>
              <div><label className="f-label">IBAN</label><input className="f-input" value={form.iban} onChange={event => setField('iban', event.target.value)} /></div>
            </div>
          </section>
        </div>
      </Modal>

      <ConfirmDialog
        open={!isBranchView && !!confirm}
        title={confirmTitle}
        desc="Personel kaydı pasife alınır, ancak kart bilgileri saklanmaya devam eder."
        onConfirm={() => archiveEmployee(confirm)}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}

export default function Personnel() {
  return <PersonnelPage mode="center" />
}
