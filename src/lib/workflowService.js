import { db } from './db'
import { readSettingArray, PERSONNEL_SETTINGS_KEYS, normalizeEmployeeRecord, normalizePositionRecord } from './personnelConfig'
import { ACCOUNT_CHART_KEY, normalizeAccount, DEFAULT_ACCOUNT_CHART } from './accountChart'

// Yardımcı Fonksiyon: Personnel Context verilerini çeker
export async function loadWorkflowPersonnelContext() {
  const [employees, positions, accounts] = await Promise.all([
    readSettingArray(PERSONNEL_SETTINGS_KEYS.employees, normalizeEmployeeRecord),
    readSettingArray(PERSONNEL_SETTINGS_KEYS.positions, normalizePositionRecord),
    readSettingArray(ACCOUNT_CHART_KEY, normalizeAccount).then(res => res.length > 0 ? res : DEFAULT_ACCOUNT_CHART)
  ])

  return {
    employees,
    positions,
    accounts,
    employeesById: new Map(employees.map(e => [String(e.id), e])),
    positionsById: new Map(positions.map(p => [String(p.id), p]))
  }
}

// ------------------------------------------------------------
// 1. ŞABLON TANIMLARI (Workflow Definitions)
// ------------------------------------------------------------

export async function fetchWorkflowDefinitions() {
  return await db.from('workflow_definitions').select('*').order('created_at', { ascending: false })
}

export async function fetchWorkflowDefinition(id) {
  return await db.from('workflow_definitions').select('*').eq('id', id).maybeSingle()
}

export async function createWorkflowDefinition(data) {
  return await db.from('workflow_definitions').insert({
    name: data.name,
    description: data.description,
    workflow_type: data.workflow_type || 'custom',
    blueprint: data.blueprint || { steps: [] },
    version: 1,
    status: 'published'
  }).select().maybeSingle()
}

export async function updateWorkflowDefinition(id, data) {
  return await db.from('workflow_definitions').update({
    name: data.name,
    description: data.description,
    workflow_type: data.workflow_type,
    blueprint: data.blueprint,
    updated_at: new Date().toISOString()
  }).eq('id', id).select().maybeSingle()
}

// ------------------------------------------------------------
// 2. ÇALIŞAN TALEPLER (Workflow Instances)
// ------------------------------------------------------------

export async function fetchWorkflowInstances({ actor, status = 'all', role = 'all' }) {
  let query = db.from('workflow_instances').select('*')
  
  // Şirket bazlı filtreleme
  if (actor?.companyId) {
    query = query.eq('company_id', actor.companyId)
  }

  const { data: instances, error } = await query.order('started_at', { ascending: false })
  if (error) return { data: null, error }

  // Yürütülecek roller ve detayları yüklemek için
  const context = await loadWorkflowPersonnelContext()
  const defsRes = await fetchWorkflowDefinitions()
  const defsMap = new Map((defsRes.data || []).map(d => [d.id, d]))

  const mapped = (instances || []).map(inst => {
    const def = defsMap.get(inst.definition_id)
    const starter = context.employeesById.get(String(inst.started_by))
    return {
      ...inst,
      definition_name: def?.name || 'Bilinmeyen Akış',
      started_by_name: starter ? `${starter.firstName} ${starter.lastName}` : `Personel ID: ${inst.started_by}`,
      started_by_position: starter ? context.positionsById.get(String(starter.positionId))?.name || '-' : '-'
    }
  })

  // Filtreleme
  let filtered = mapped
  if (status !== 'all') {
    filtered = filtered.filter(inst => inst.status === status)
  }

  if (role === 'mine') {
    // Sadece benim başlattıklarım
    filtered = filtered.filter(inst => String(inst.started_by) === String(actor.id))
  } else if (role === 'approver') {
    // Aktif adımı benim onaylamam gerekenler (bizim pozisyonumuza/bize atanan görevleri kontrol ederek)
    // Bu filtreleme UI tarafında tasks modülü üzerinden daha kolay yapıldığı için burada genel listeyi döndürmek yeterlidir.
  }

  return { data: filtered, error: null }
}

export async function fetchWorkflowInstanceDetail(instanceId) {
  const instRes = await db.from('workflow_instances').select('*').eq('id', instanceId).maybeSingle()
  if (instRes.error || !instRes.data) return instRes

  const instance = instRes.data
  const defRes = await fetchWorkflowDefinition(instance.definition_id)
  const historyRes = await db.from('workflow_history').select('*').eq('instance_id', instanceId).order('created_at', { ascending: true })

  const context = await loadWorkflowPersonnelContext()
  const starter = context.employeesById.get(String(instance.started_by))

  // Geçmiş verilerini isimlendir
  const historyMapped = (historyRes.data || []).map(h => {
    const actor = context.employeesById.get(String(h.actor_id))
    return {
      ...h,
      performed_by_name: h.actor_id === 'system' ? 'Sistem' : (actor ? `${actor.firstName} ${actor.lastName}` : `Personel: ${h.actor_id}`),
      performed_by_position: actor ? context.positionsById.get(String(actor.positionId))?.name || '-' : '-'
    }
  })

  return {
    data: {
      ...instance,
      definition: defRes.data,
      history: historyMapped,
      started_by_name: starter ? `${starter.firstName} ${starter.lastName}` : `Personel ID: ${instance.started_by}`,
      started_by_position: starter ? context.positionsById.get(String(starter.positionId))?.name || '-' : '-'
    },
    error: null
  }
}

// ------------------------------------------------------------
// 3. AKIŞ BAŞLATMA (Start Instance)
// ------------------------------------------------------------

export async function createWorkflowInstance(definitionId, startedByEmployee, formData = {}) {
  const defRes = await fetchWorkflowDefinition(definitionId)
  if (defRes.error || !defRes.data) return { data: null, error: { message: 'İş akışı şablonu bulunamadı' } }

  const definition = defRes.data
  const blueprint = definition.blueprint || { steps: [] }
  const steps = blueprint.steps || []

  const startStep = steps.find(s => s.type === 'start')
  if (!startStep) return { data: null, error: { message: 'İş akışında başlangıç adımı (Start) bulunamadı' } }

  // 1. Instance kaydını oluştur
  const instanceRes = await db.from('workflow_instances').insert({
    definition_id: definition.id,
    definition_version: definition.version,
    current_node_id: startStep.id,
    status: 'running',
    context_data: formData,
    started_by: startedByEmployee.id,
    company_id: startedByEmployee.companyId || null
  }).select().maybeSingle()

  if (instanceRes.error) return instanceRes
  const instance = instanceRes.data

  // 2. Geçmiş kaydı (Start adımını tamamlandı yap)
  await db.from('workflow_history').insert({
    instance_id: instance.id,
    from_node_id: null,
    to_node_id: startStep.id,
    action: 'submit',
    actor_id: startedByEmployee.id,
    notes: 'Talep oluşturuldu ve akış başlatıldı.',
    delta_data: formData
  })

  // 3. Sıradaki adıma ilerlet
  return await advanceToNextStep(instance, steps, startStep.id, startedByEmployee.id)
}

// ------------------------------------------------------------
// 4. AKIŞ İLERLETME MANTIĞI (Advance Workflow)
// ------------------------------------------------------------

// Belirli bir müdürün/onaycının aksiyonuyla (Onayla/Reddet) akışı ilerletir
export async function advanceWorkflow(instanceId, action, actorEmployee, notes = '', deltaData = {}) {
  // 1. Detayları yükle
  const detailRes = await fetchWorkflowInstanceDetail(instanceId)
  if (detailRes.error || !detailRes.data) return { data: null, error: { message: 'Talep detayı yüklenemedi' } }

  const instance = detailRes.data
  const steps = instance.definition?.blueprint?.steps || []
  const currentNodeId = instance.current_node_id
  const currentStep = steps.find(s => s.id === currentNodeId)

  if (!currentStep) return { data: null, error: { message: 'Aktif akış adımı bulunamadı' } }

  // 2. Bu adıma atanmış onay görevlerini tamamla (tasks tablosundaki ilgili görevi completed yap)
  const { data: activeTasks } = await db.from('tasks')
    .select('id')
    .eq('linked_entity_table', 'workflow_instances')
    .eq('linked_entity_id', instanceId)
    .eq('status', 'open')
  
  if (activeTasks && activeTasks.length > 0) {
    const taskIds = activeTasks.map(t => t.id)
    // İlgili personelin katılım durumunu tamamla
    await db.from('task_participants')
      .update({ is_completed: true })
      .in('task_id', taskIds)
      .eq('personnel_id', actorEmployee.id)

    // Görevi kapat
    await db.from('tasks')
      .update({ status: 'completed', closure_summary: `${action === 'approve' ? 'Onaylandı' : 'Reddedildi'}: ${notes}` })
      .in('id', taskIds)
  }

  // 3. Reddedilme durumunda akış yönlendirmesi
  if (action === 'reject') {
    const ifRejected = currentStep.if_rejected || 'reject' // default: tamamen reddet ve kapat

    if (ifRejected === 'reject') {
      // Akışı tamamen reddet ve sonlandır
      const updatedInst = await db.from('workflow_instances').update({
        status: 'rejected',
        completed_at: new Date().toISOString(),
        context_data: { ...instance.context_data, ...deltaData }
      }).eq('id', instanceId).select().maybeSingle()

      await db.from('workflow_history').insert({
        instance_id: instanceId,
        from_node_id: currentNodeId,
        to_node_id: 'rejected',
        action: 'reject',
        actor_id: actorEmployee.id,
        notes: notes || 'Talep reddedildi.',
        delta_data: deltaData
      })

      return updatedInst
    } 
    
    if (ifRejected === 'return_to_start') {
      // Başlangıca geri gönder (Revizyon için)
      const startStep = steps.find(s => s.type === 'start')
      const updatedInst = await db.from('workflow_instances').update({
        current_node_id: startStep.id,
        context_data: { ...instance.context_data, ...deltaData }
      }).eq('id', instanceId).select().maybeSingle()

      await db.from('workflow_history').insert({
        instance_id: instanceId,
        from_node_id: currentNodeId,
        to_node_id: startStep.id,
        action: 'return_to_start',
        actor_id: actorEmployee.id,
        notes: notes || 'Düzeltme için başlangıca geri gönderildi.',
        delta_data: deltaData
      })

      // Talep sahibine düzeltme görevi oluştur
      await createWorkflowApprovalTask({
        instanceId,
        workflowName: instance.definition?.name,
        currentNodeId: startStep.id,
        stepName: 'Düzeltme Talebi',
        assigneeType: 'personnel',
        assigneeId: instance.started_by,
        startedBy: actorEmployee.id,
        branchId: instance.context_data?.branch_id,
        description: `Talebiniz düzeltme için geri gönderildi. Gerekçe: ${notes}`
      })

      return updatedInst
    }
  }

  // 4. Onaylanma durumunda: Geçiş logunu yaz ve bir sonraki adıma ilerlet
  const nextContextData = { ...instance.context_data, ...deltaData }
  const updatedInst = await db.from('workflow_instances').update({
    context_data: nextContextData
  }).eq('id', instanceId).select().maybeSingle()

  await db.from('workflow_history').insert({
    instance_id: instanceId,
    from_node_id: currentNodeId,
    to_node_id: currentNodeId, // Geçici geçiş logu
    action: 'approve',
    actor_id: actorEmployee.id,
    notes: notes || 'Onaylandı.',
    delta_data: deltaData
  })

  return await advanceToNextStep(updatedInst.data, steps, currentNodeId, actorEmployee.id)
}

// ------------------------------------------------------------
// 5. İÇ YARDIMCI FONKSİYONLAR (Internal Helpers)
// ------------------------------------------------------------

async function advanceToNextStep(instance, steps, currentNodeId, actorId) {
  const currentIndex = steps.findIndex(s => s.id === currentNodeId)
  if (currentIndex === -1 || currentIndex === steps.length - 1) {
    // Adım kalmadıysa akışı tamamla
    return await completeWorkflow(instance.id, currentNodeId, actorId)
  }

  const nextStep = steps[currentIndex + 1]

  // Koşul kontrolü (Limit vs.)
  if (nextStep.condition) {
    const isConditionMet = evaluateCondition(nextStep.condition, instance.context_data)
    if (!isConditionMet) {
      // Koşul sağlanmıyorsa bu adımı atla ve bir sonrakine geç
      console.log(`Step ${nextStep.name} skipped because condition not met.`)
      return await advanceToNextStep(instance, steps, nextStep.id, 'system')
    }
  }

  // Akış durumunu güncelle (Yeni aktif düğüm)
  const updatedInst = await db.from('workflow_instances').update({
    current_node_id: nextStep.id
  }).eq('id', instance.id).select().maybeSingle()

  await db.from('workflow_history').insert({
    instance_id: instance.id,
    from_node_id: currentNodeId,
    to_node_id: nextStep.id,
    action: 'transition',
    actor_id: actorId,
    notes: `${nextStep.name} adımına geçildi.`
  })

  // Bir sonraki adımın aksiyonunu tetikle
  if (nextStep.type === 'approval') {
    // İnsan onay görevi oluştur
    await createWorkflowApprovalTask({
      instanceId: instance.id,
      workflowName: instance.definition_name || 'Talep',
      currentNodeId: nextStep.id,
      stepName: nextStep.name,
      assigneeType: nextStep.assignee_type,
      assigneeId: nextStep.assignee_id,
      startedBy: instance.started_by,
      branchId: instance.context_data?.branch_id || null,
      description: `Lütfen bu talebi inceleyerek onaylayın veya reddedin.`
    })
  } else if (nextStep.type === 'automated_task') {
    // Otomatik görev (Sistem eylemi)
    await runAutomatedTask(instance.id, nextStep, instance.context_data)
    // Otomatik görevi tamamlayıp hemen bir sonrakine ilerle
    return await advanceToNextStep(updatedInst.data, steps, nextStep.id, 'system')
  } else if (nextStep.type === 'end') {
    return await completeWorkflow(instance.id, nextStep.id, 'system')
  }

  return updatedInst
}

// Akışı başarıyla sonlandırma
async function completeWorkflow(instanceId, currentNodeId, actorId) {
  const updatedInst = await db.from('workflow_instances').update({
    status: 'completed',
    completed_at: new Date().toISOString()
  }).eq('id', instanceId).select().maybeSingle()

  await db.from('workflow_history').insert({
    instance_id: instanceId,
    from_node_id: currentNodeId,
    to_node_id: 'completed',
    action: 'complete',
    actor_id: actorId,
    notes: 'İş akışı başarıyla tamamlandı.'
  })

  return updatedInst
}

// İstemci Tarafı Koşul Değerlendirme (Örn: Tutar > 5000)
function evaluateCondition(condition, contextData = {}) {
  const { field, operator, value } = condition
  if (!field) return true

  // contextData hiyerarşik nesnesinden değeri bul
  let actualValue = contextData[field]
  if (actualValue === undefined) return false

  // Eğer değer financial_input objesi ise (.amount alanını al)
  if (actualValue && typeof actualValue === 'object' && actualValue.amount !== undefined) {
    actualValue = actualValue.amount
  } else if (actualValue && typeof actualValue === 'string' && actualValue.startsWith('{')) {
    try {
      const parsed = JSON.parse(actualValue)
      if (parsed && parsed.amount !== undefined) {
        actualValue = parsed.amount
      }
    } catch (e) {}
  }

  const left = !isNaN(Number(actualValue)) ? Number(actualValue) : actualValue
  const right = !isNaN(Number(value)) ? Number(value) : value

  switch (operator) {
    case 'gt': return left > right
    case 'gte': return left >= right
    case 'lt': return left < right
    case 'lte': return left <= right
    case 'eq': return String(left) === String(right)
    case 'neq': return String(left) !== String(right)
    default: return false
  }
}

// İstemci Tarafı Otomatik Görev Yürütücü (Asenkron)
async function runAutomatedTask(instanceId, step, contextData) {
  const config = step.task_config || {}
  const actionType = config.action_type // e.g., 'send_notification', 'create_task'
  
  if (actionType === 'send_notification') {
    // Sistem içi bildirim oluştur
    await db.from('notifications').insert({
      personnel_id: contextData.started_by || config.recipient_id,
      title: 'Talep Durum Güncellemesi',
      body: `Talebiniz otomatik süreç adımını (${step.name}) geçti.`,
      is_read: false
    })
  } else if (actionType === 'create_task') {
    // Dış bağımsız bir görev oluştur
    await db.from('tasks').insert({
      title: config.task_title || 'İş Akışı Otomatik Görevi',
      description: config.task_description || 'Akış adımı gereği oluşturuldu.',
      status: 'open',
      priority: 'normal',
      created_by_personnel_id: 'system'
    })
  }
}

// İş akışı onaycısı için tasks tablosunda özel görev oluşturur
async function createWorkflowApprovalTask({
  instanceId,
  workflowName,
  currentNodeId,
  stepName,
  assigneeType,
  assigneeId,
  startedBy,
  branchId,
  description
}) {
  const context = await loadWorkflowPersonnelContext()
  const starter = context.employeesById.get(String(startedBy))
  const startedByName = starter ? `${starter.firstName} ${starter.lastName}` : `Personel`
  
  // 1. Görevi oluştur
  const taskRes = await db.from('tasks').insert({
    title: `Onay Talebi: ${workflowName} (${stepName})`,
    description: `Talep Sahibi: ${startedByName}\nAçıklama: ${description}`,
    status: 'open',
    priority: 'high',
    linked_entity_table: 'workflow_instances',
    linked_entity_id: instanceId,
    branch_node_id: branchId || null,
    created_by_personnel_id: startedBy,
    created_by_position_id: starter?.positionId || null
  }).select().maybeSingle()

  if (taskRes.error || !taskRes.data) return

  const task = taskRes.data

  // 2. Katılımcıları (assignee) ata
  const participantRows = []

  if (assigneeType === 'personnel') {
    // Doğrudan personele ata
    participantRows.push({
      task_id: task.id,
      participant_type: 'assignee',
      personnel_id: String(assigneeId),
      position_id: context.employeesById.get(String(assigneeId))?.positionId || null
    })
  } else if (assigneeType === 'position') {
    // Pozisyondaki tüm çalışanlara ata (Müdürler vb.)
    const matches = context.employees.filter(e => String(e.positionId) === String(assigneeId) && !e.deletedAt && !e.terminationDate)
    matches.forEach(e => {
      participantRows.push({
        task_id: task.id,
        participant_type: 'assignee',
        personnel_id: String(e.id),
        position_id: String(assigneeId)
      })
    })

    // Eğer o pozisyonda aktif personel yoksa, fallback olarak talep sahibinin kendi yöneticisine veya sistem yöneticisine atarız
    if (participantRows.length === 0) {
      participantRows.push({
        task_id: task.id,
        participant_type: 'assignee',
        personnel_id: startedBy,
        position_id: starter?.positionId || null
      })
    }
  } else if (assigneeType === 'dynamic_manager') {
    // Talep sahibinin hiyerarşik yöneticisi (canReject/approval zinciri)
    // Şimdilik basitleştirmek adına talep edenin kendi departman müdürüne atıyoruz
    const starterManager = context.employees.find(e => e.authorityLevel === 'Genel Merkez' && String(e.positionId) === 'pos-manager' && !e.deletedAt)
    const managerId = starterManager ? starterManager.id : startedBy

    participantRows.push({
      task_id: task.id,
      participant_type: 'assignee',
      personnel_id: String(managerId),
      position_id: context.employeesById.get(String(managerId))?.positionId || null
    })
  }

  if (participantRows.length > 0) {
    await db.from('task_participants').insert(participantRows)
  }
}
