import { db } from '../db.js'
import { generateETTN, generateInvoiceNumber, generateDespatchNumber, generateUBLXML, generateDespatchUBLXML, calculateInvoiceTotals } from './coreUblGenerator.js'
import { EINVOICE_STATUS } from './types.js'

/**
 * Recursive helper to find a node by ID in a nested tree structure (like settings.company_tree)
 */
function findNodeInTree(nodes, id) {
  if (!Array.isArray(nodes)) return null
  for (const n of nodes) {
    if (String(n.id) === String(id)) return n
    if (n.children && n.children.length) {
      const found = findNodeInTree(n.children, id)
      if (found) return found
    }
  }
  return null
}

/**
 * Recursive helper to find the parent node of a given child ID in nested tree
 */
function findParentInTree(nodes, childId) {
  if (!Array.isArray(nodes)) return null
  for (const n of nodes) {
    if (n.children && n.children.some((c) => String(c.id) === String(childId))) {
      return n
    }
    if (n.children && n.children.length) {
      const parent = findParentInTree(n.children, childId)
      if (parent) return parent
    }
  }
  return null
}

export class InterCompanyTransferService {
  /**
   * Bir şube, depo, mutfak veya şirket düğümünün bağlı olduğu Tüzel Kişiliği (Legal Entity) Çözer.
   *
   * Çözümleme Mantığı:
   * 1. Düğüm doğrudan 'tuzel' veya 'sirket' tipindeyse veya `is_legal_entity: true` ise kendisi tüzel kişiliktir.
   * 2. `parent_legal_entity_id` tanımlıysa doğrudan o düğüme gider.
   * 3. Hiyerarşide yukarı doğru (`parent_id`) tırmanarak ilk tüzel kişilik düğümünü (VKN ve Ünvanı olan) bulur.
   * 4. Bulunamazsa veritabanındaki kök tüzel kişilik veya varsayılan entegratör ünvan/VKN bilgilerine geri döner.
   */
  async getNodeLegalEntity(nodeIdOrObj) {
    try {
      if (!nodeIdOrObj) {
        return this.getDefaultLegalEntity('Merkez Tüzel Kişilik')
      }

      // If already a resolved legal entity object with taxNumber and legalTitle
      if (typeof nodeIdOrObj === 'object' && nodeIdOrObj.taxNumber && nodeIdOrObj.legalTitle) {
        return {
          id: nodeIdOrObj.id || nodeIdOrObj.nodeId || null,
          nodeId: nodeIdOrObj.nodeId || nodeIdOrObj.id || null,
          nodeName: nodeIdOrObj.nodeName || nodeIdOrObj.name || 'Bilinmeyen Düğüm',
          nodeType: nodeIdOrObj.nodeType || nodeIdOrObj.type || 'sube',
          isLegalEntity: true,
          taxNumber: String(nodeIdOrObj.taxNumber).trim(),
          legalTitle: String(nodeIdOrObj.legalTitle).trim(),
          taxOffice: nodeIdOrObj.taxOffice || 'Merkez',
          legalAddress: nodeIdOrObj.legalAddress || 'Merkez Adresi',
        }
      }

      const targetNodeId = typeof nodeIdOrObj === 'object' ? nodeIdOrObj.id : nodeIdOrObj

      // 1. Fetch all company nodes to construct map & parent hierarchy
      const { data: allNodes, error: nodesErr } = await db
        .from('company_nodes')
        .select('id, type, name, parent_id, tax_number, legal_title, tax_office, legal_address, is_legal_entity, parent_legal_entity_id')

      let targetNode = null
      const nodesById = new Map()

      if (!nodesErr && Array.isArray(allNodes) && allNodes.length > 0) {
        allNodes.forEach((n) => nodesById.set(String(n.id), n))
        targetNode = nodesById.get(String(targetNodeId))
      }

      // If not in company_nodes table, check settings company_tree
      let fallbackTree = []
      if (!targetNode) {
        const { data: settingsRow } = await db
          .from('settings')
          .select('value')
          .eq('key', 'company_tree')
          .single()
        fallbackTree = settingsRow?.value || []
        targetNode = findNodeInTree(fallbackTree, targetNodeId)
      }

      if (!targetNode && typeof nodeIdOrObj === 'object') {
        targetNode = nodeIdOrObj
      }

      if (!targetNode) {
        return this.getDefaultLegalEntity('Bilinmeyen Şube')
      }

      // 2. Direct parent_legal_entity_id check
      if (targetNode.parent_legal_entity_id && nodesById.has(String(targetNode.parent_legal_entity_id))) {
        const legalNode = nodesById.get(String(targetNode.parent_legal_entity_id))
        return this.formatLegalEntityResult(legalNode, targetNode)
      }

      // 3. Check if targetNode is itself a legal entity
      if (
        targetNode.is_legal_entity ||
        targetNode.isLegalEntity ||
        targetNode.type === 'tuzel' ||
        targetNode.type === 'sirket' ||
        (targetNode.tax_number || targetNode.taxNumber)
      ) {
        return this.formatLegalEntityResult(targetNode, targetNode)
      }

      // 4. Traverse parent hierarchy in company_nodes
      let currentParentId = targetNode.parent_id || targetNode.parentId
      let depth = 0
      while (currentParentId && depth < 10) {
        depth++
        const parent = nodesById.get(String(currentParentId))
        if (!parent) break

        if (
          parent.is_legal_entity ||
          parent.type === 'tuzel' ||
          parent.type === 'sirket' ||
          parent.tax_number
        ) {
          return this.formatLegalEntityResult(parent, targetNode)
        }

        currentParentId = parent.parent_id
      }

      // 5. If using fallbackTree, traverse upwards in tree
      if (fallbackTree && fallbackTree.length > 0) {
        let currTreeChildId = targetNode.id
        let treeDepth = 0
        while (currTreeChildId && treeDepth < 10) {
          treeDepth++
          const parentInTree = findParentInTree(fallbackTree, currTreeChildId)
          if (!parentInTree) break

          if (
            parentInTree.type === 'tuzel' ||
            parentInTree.type === 'sirket' ||
            parentInTree.tax_number ||
            parentInTree.taxNumber
          ) {
            return this.formatLegalEntityResult(parentInTree, targetNode)
          }
          currTreeChildId = parentInTree.id
        }
      }

      // 6. Fallback to default
      return this.formatLegalEntityResult(targetNode, targetNode)
    } catch (err) {
      console.error('getNodeLegalEntity error:', err)
      return this.getDefaultLegalEntity('Hata Durumu Varsayılan Tüzel Kişilik')
    }
  }

  /**
   * Helper to format standard Legal Entity representation
   */
  formatLegalEntityResult(legalNode, originalTargetNode) {
    const rawTaxNumber =
      legalNode.tax_number || legalNode.taxNumber || legalNode.tax_no || legalNode.vkn || ''
    const rawLegalTitle =
      legalNode.legal_title || legalNode.legalTitle || legalNode.title || legalNode.name || 'SuitableRMS Şirketi'
    const rawTaxOffice = legalNode.tax_office || legalNode.taxOffice || 'Merkez Vergi Dairesi'
    const rawLegalAddress =
      legalNode.legal_address || legalNode.legalAddress || legalNode.address || 'Merkez Adresi'

    // If node doesn't have explicit tax number, generate consistent mock/placeholder or default
    const cleanTaxNumber = rawTaxNumber ? String(rawTaxNumber).trim() : '1234567890'

    return {
      id: legalNode.id || originalTargetNode.id,
      legalEntityNodeId: legalNode.id,
      nodeId: originalTargetNode.id,
      nodeName: originalTargetNode.name || 'Düğüm',
      nodeType: originalTargetNode.type || 'sube',
      isLegalEntity: true,
      taxNumber: cleanTaxNumber,
      legalTitle: String(rawLegalTitle).trim(),
      taxOffice: String(rawTaxOffice).trim(),
      legalAddress: String(rawLegalAddress).trim(),
    }
  }

  /**
   * Default legal entity fallback
   */
  getDefaultLegalEntity(nodeName = 'Merkez') {
    return {
      id: '00000000-0000-0000-0000-000000000001',
      legalEntityNodeId: '00000000-0000-0000-0000-000000000001',
      nodeId: null,
      nodeName,
      nodeType: 'sirket',
      isLegalEntity: true,
      taxNumber: '1234567890',
      legalTitle: 'SuitableRMS Restoran Grubu A.Ş.',
      taxOffice: 'Beşiktaş',
      legalAddress: 'Nispetiye Cad. No:12 Beşiktaş / İstanbul',
    }
  }

  /**
   * İki şube/depo/düğüm arasındaki transferin Şirketler Arası (Inter-Company) olup olmadığını kontrol eder.
   * Eğer iki tarafın bağlı olduğu Tüzel Kişiliklerin VKN'leri veya Tüzel Kişilik Düğüm ID'leri farklıysa `true` döner.
   */
  async checkIfInterCompanyTransfer(sourceNodeIdOrObj, targetNodeIdOrObj) {
    try {
      if (!sourceNodeIdOrObj || !targetNodeIdOrObj) {
        return {
          isInterCompany: false,
          sourceLegalEntity: null,
          targetLegalEntity: null,
          reason: 'Kaynak veya hedef düğüm bilgisi eksik.',
        }
      }

      const [sourceLegalEntity, targetLegalEntity] = await Promise.all([
        this.getNodeLegalEntity(sourceNodeIdOrObj),
        this.getNodeLegalEntity(targetNodeIdOrObj),
      ])

      const sourceVkn = String(sourceLegalEntity.taxNumber || '').trim()
      const targetVkn = String(targetLegalEntity.taxNumber || '').trim()
      const sourceEntityId = String(sourceLegalEntity.legalEntityNodeId || sourceLegalEntity.id || '')
      const targetEntityId = String(targetLegalEntity.legalEntityNodeId || targetLegalEntity.id || '')

      const isDifferentVkn = sourceVkn && targetVkn && sourceVkn !== targetVkn
      const isDifferentEntity = sourceEntityId && targetEntityId && sourceEntityId !== targetEntityId

      const isInterCompany = isDifferentVkn || (isDifferentEntity && sourceVkn !== '')

      let reason = ''
      if (isInterCompany) {
        if (isDifferentVkn) {
          reason = `Farklı Vergi Kimlik Numaraları (VKN: ${sourceVkn} -> ${targetVkn})`
        } else {
          reason = `Farklı Tüzel Kişilikler (${sourceLegalEntity.legalTitle} -> ${targetLegalEntity.legalTitle})`
        }
      } else {
        reason = `Aynı Tüzel Kişilik (${sourceLegalEntity.legalTitle}, VKN: ${sourceVkn})`
      }

      return {
        isInterCompany,
        sourceLegalEntity,
        targetLegalEntity,
        reason,
      }
    } catch (err) {
      console.error('checkIfInterCompanyTransfer error:', err)
      return {
        isInterCompany: false,
        sourceLegalEntity: null,
        targetLegalEntity: null,
        reason: 'Kontrol sırasında hata oluştu: ' + err.message,
      }
    }
  }

  /**
   * Şirketler Arası Transfer için Otomatik UBL-TR 2.1 E-Fatura & E-İrsaliye ve Gelen Ayna Fatura Üretimi
   *
   * @param {Object} transferRecord - Transfer ana kaydı (documentNo, movementDate, notes, sourceBranchId, targetBranchId, vb.)
   * @param {Array}  transferLines  - Transfer kalemleri (itemType, itemId, itemName, itemSku, unit, quantity, unitCost/rowTransferUnitCost)
   * @param {Object} options        - Opsiyonel ayarlar (force, profileId, invoiceType, defaultTaxRate, notes)
   */
  async generateInterCompanyInvoice(transferRecord, transferLines = [], options = {}) {
    try {
      const sourceNodeId =
        transferRecord.sourceBranchId ||
        transferRecord.origin_branch_id ||
        transferRecord.originBranchId ||
        transferRecord.sourceNodeId ||
        transferRecord.originSnapshot?.branchId

      const targetNodeId =
        transferRecord.destinationBranchId ||
        transferRecord.targetBranchId ||
        transferRecord.destination_branch_id ||
        transferRecord.targetNodeId

      // 1. Check if transfer is inter-company
      const checkResult = await this.checkIfInterCompanyTransfer(
        sourceNodeId || transferRecord.originSnapshot,
        targetNodeId || transferRecord.destinationMeta
      )

      if (!checkResult.isInterCompany && !options.force) {
        return {
          success: false,
          isInterCompany: false,
          reason: checkResult.reason || 'Transfer aynı tüzel kişilik sınırları içerisinde yapıldı. E-Fatura gerekmez.',
        }
      }

      const sourceEntity = checkResult.sourceLegalEntity
      const targetEntity = checkResult.targetLegalEntity

      // 2. Prepare lines and calculate totals
      const defaultTaxRate = options.defaultTaxRate ?? 20
      const lines = (transferLines || []).map((line, idx) => {
        const qty = Number(line.quantity || line.rowQuantityOriginal || line.invoiced_quantity || 1)
        const unitPrice = Number(line.rowTransferUnitCost || line.unitCost || line.unit_price || line.price || 0)
        const lineSubtotal = Math.round(qty * unitPrice * 100) / 100
        const taxRate = Number(line.tax_rate ?? line.taxRate ?? defaultTaxRate)
        const taxAmount = Math.round(((lineSubtotal * taxRate) / 100) * 100) / 100
        const totalLineAmount = Math.round((lineSubtotal + taxAmount) * 100) / 100

        return {
          line_number: idx + 1,
          item_name: line.itemName || line.item_name || line.name || 'Transfer Kalemi',
          item_code: line.itemSku || line.item_sku || line.sku || (line.itemId ? String(line.itemId).slice(0, 8) : null),
          item_description: `Stok/Malzeme Transferi: ${line.itemName || line.item_name || ''}`,
          invoiced_quantity: qty,
          unit_code: line.unit || line.unit_code || 'C62', // C62 = Adet / Birim
          unit_price: unitPrice,
          subtotal: lineSubtotal,
          discount_rate: 0,
          discount_amount: 0,
          tax_rate: taxRate,
          tax_amount: taxAmount,
          total_line_amount: totalLineAmount,
          matched_stock_item_id: line.stock_item_id || line.itemId || null,
          matched_stock_item_name: line.itemName || line.item_name || null,
        }
      })

      const totals = calculateInvoiceTotals(lines, 0, 0)
      const outboundEttn = generateETTN()
      const invoiceNumber = generateInvoiceNumber('TRF', new Date().getFullYear(), Math.floor(Math.random() * 899999 + 100000))
      const issueDate = transferRecord.movementDate || new Date().toISOString().split('T')[0]
      const issueTime = new Date().toTimeString().split(' ')[0]
      const documentNo = transferRecord.documentNo || transferRecord.source_doc_no || `TR-${Date.now().toString().slice(-8)}`

      const invoicePayload = {
        ettn: outboundEttn,
        invoice_number: invoiceNumber,
        invoice_type: options.invoiceType || 'SATIS',
        profile_id: options.profileId || 'TICARIFATURA',
        issue_date: issueDate,
        issue_time: issueTime,
        currency_code: 'TRY',
        currency_rate: 1.0,
        sender_vkn_tckn: sourceEntity.taxNumber,
        sender_title: sourceEntity.legalTitle,
        sender_tax_office: sourceEntity.taxOffice,
        sender_address: sourceEntity.legalAddress,
        sender_alias: 'urn:mail:defaultgb@gib.gov.tr',
        receiver_vkn_tckn: targetEntity.taxNumber,
        receiver_title: targetEntity.legalTitle,
        receiver_tax_office: targetEntity.taxOffice,
        receiver_address: targetEntity.legalAddress,
        receiver_alias: 'urn:mail:defaultpk@gib.gov.tr',
        line_extension_amount: totals.lineExtensionAmount,
        tax_exclusive_amount: totals.taxExclusiveAmount,
        tax_inclusive_amount: totals.taxInclusiveAmount,
        allowance_total_amount: totals.allowanceTotalAmount,
        charge_total_amount: totals.chargeTotalAmount,
        tax_total_amount: totals.taxTotalAmount,
        payable_amount: totals.payableAmount,
        notes: `Şirketler Arası Transfer E-Faturası. Sevk Belge/İrsaliye No: ${documentNo}. ${transferRecord.note || transferRecord.notes || ''}`.trim(),
        despatch_document_reference: documentNo,
        source_transfer_doc_no: documentNo,
        is_inter_company: true,
        origin_node_id: sourceNodeId || null,
        destination_node_id: targetNodeId || null,
        lines,
      }

      // 3. Generate standard UBL-TR 2.1 XML
      const ublXml = generateUBLXML(invoicePayload)
      invoicePayload.ubl_xml = ublXml

      // 4. Save OUTBOUND Invoice to `e_invoices`
      const outboundInsertData = {
        direction: 'OUTBOUND',
        ettn: outboundEttn,
        invoice_number: invoiceNumber,
        invoice_type: invoicePayload.invoice_type,
        profile_id: invoicePayload.profile_id,
        issue_date: invoicePayload.issue_date,
        issue_time: invoicePayload.issue_time,
        status_code: EINVOICE_STATUS.DELIVERED_TO_RECEIVER, // 1200 - GİB ve Alıcıya Ulaştı
        status_description: 'Alıcıya Ulaştı / Başarılı (Şirketler Arası)',
        currency_code: invoicePayload.currency_code,
        currency_rate: invoicePayload.currency_rate,
        sender_vkn_tckn: invoicePayload.sender_vkn_tckn,
        sender_title: invoicePayload.sender_title,
        sender_tax_office: invoicePayload.sender_tax_office,
        sender_address: invoicePayload.sender_address,
        sender_alias: invoicePayload.sender_alias,
        receiver_vkn_tckn: invoicePayload.receiver_vkn_tckn,
        receiver_title: invoicePayload.receiver_title,
        receiver_tax_office: invoicePayload.receiver_tax_office,
        receiver_address: invoicePayload.receiver_address,
        receiver_alias: invoicePayload.receiver_alias,
        line_extension_amount: invoicePayload.line_extension_amount,
        tax_exclusive_amount: invoicePayload.tax_exclusive_amount,
        tax_inclusive_amount: invoicePayload.tax_inclusive_amount,
        allowance_total_amount: invoicePayload.allowance_total_amount,
        charge_total_amount: invoicePayload.charge_total_amount,
        tax_total_amount: invoicePayload.tax_total_amount,
        payable_amount: invoicePayload.payable_amount,
        notes: invoicePayload.notes,
        ubl_xml: invoicePayload.ubl_xml,
        is_inter_company: true,
        source_transfer_doc_no: documentNo,
        origin_node_id: sourceNodeId || null,
        destination_node_id: targetNodeId || null,
        raw_json: {
          transferRecord,
          sourceEntity,
          targetEntity,
          interCompanyGenerated: true,
        },
      }

      const { data: savedOutboundArr, error: outboundErr } = await db
        .from('e_invoices')
        .insert(outboundInsertData)
        .select('*')

      if (outboundErr) throw outboundErr
      const savedOutbound = savedOutboundArr?.[0] || outboundInsertData

      // Insert outbound lines
      if (savedOutbound.id) {
        const outboundLinesData = lines.map((l) => ({
          ...l,
          invoice_id: savedOutbound.id,
        }))
        const { error: lineErr } = await db.from('e_invoice_lines').insert(outboundLinesData)
        if (lineErr) console.warn('Outbound lines insert warning:', lineErr)
      }

      // 5. Auto-create INBOUND Mirror Invoice for Receiver Entity (Gelen Kutusu & 3-Way Matching)
      const inboundEttn = generateETTN()
      const inboundInsertData = {
        direction: 'INBOUND',
        ettn: inboundEttn,
        invoice_number: invoiceNumber,
        invoice_type: invoicePayload.invoice_type,
        profile_id: invoicePayload.profile_id,
        issue_date: invoicePayload.issue_date,
        issue_time: invoicePayload.issue_time,
        status_code: EINVOICE_STATUS.DELIVERED_TO_RECEIVER, // 1200 - Gelen Kutusunda Onay/Eşleşme Bekliyor
        status_description: 'Gelen Kutusunda (Şirketler Arası Transfer)',
        currency_code: invoicePayload.currency_code,
        currency_rate: invoicePayload.currency_rate,
        sender_vkn_tckn: invoicePayload.sender_vkn_tckn,
        sender_title: invoicePayload.sender_title,
        sender_tax_office: invoicePayload.sender_tax_office,
        sender_address: invoicePayload.sender_address,
        sender_alias: invoicePayload.sender_alias,
        receiver_vkn_tckn: invoicePayload.receiver_vkn_tckn,
        receiver_title: invoicePayload.receiver_title,
        receiver_tax_office: invoicePayload.receiver_tax_office,
        receiver_address: invoicePayload.receiver_address,
        receiver_alias: invoicePayload.receiver_alias,
        line_extension_amount: invoicePayload.line_extension_amount,
        tax_exclusive_amount: invoicePayload.tax_exclusive_amount,
        tax_inclusive_amount: invoicePayload.tax_inclusive_amount,
        allowance_total_amount: invoicePayload.allowance_total_amount,
        charge_total_amount: invoicePayload.charge_total_amount,
        tax_total_amount: invoicePayload.tax_total_amount,
        payable_amount: invoicePayload.payable_amount,
        notes: invoicePayload.notes,
        ubl_xml: invoicePayload.ubl_xml,
        is_inter_company: true,
        source_transfer_doc_no: documentNo,
        origin_node_id: sourceNodeId || null,
        destination_node_id: targetNodeId || null,
        is_matched: false, // will appear in 3-way matching engine
        raw_json: {
          transferRecord,
          sourceEntity,
          targetEntity,
          isMirrorInbound: true,
          pairedOutboundEttn: outboundEttn,
        },
      }

      const { data: savedInboundArr, error: inboundErr } = await db
        .from('e_invoices')
        .insert(inboundInsertData)
        .select('*')

      if (inboundErr) throw inboundErr
      const savedInbound = savedInboundArr?.[0] || inboundInsertData

      // Insert inbound lines
      if (savedInbound.id) {
        const inboundLinesData = lines.map((l) => ({
          ...l,
          invoice_id: savedInbound.id,
        }))
        const { error: inLineErr } = await db.from('e_invoice_lines').insert(inboundLinesData)
        if (inLineErr) console.warn('Inbound lines insert warning:', inLineErr)

        // 6. Log in `e_invoice_matching_logs`
        await db.from('e_invoice_matching_logs').insert({
          invoice_id: savedInbound.id,
          matching_type: 'INTER_COMPANY_TRANSFER',
          notes: `Şirketler arası transfer otomatik e-fatura & irsaliye oluşturuldu. Transfer Belge No: ${documentNo}. Gönderici: ${sourceEntity.legalTitle} (VKN: ${sourceEntity.taxNumber}) -> Alıcı: ${targetEntity.legalTitle} (VKN: ${targetEntity.taxNumber}).`,
          performed_by: 'AUTO_INTER_COMPANY_SERVICE',
        })
      }

      return {
        success: true,
        isInterCompany: true,
        invoiceNumber,
        outboundInvoice: savedOutbound,
        inboundInvoice: savedInbound,
        ublXml,
        sourceLegalEntity: sourceEntity,
        targetLegalEntity: targetEntity,
        totals,
        message: `Şirketler arası e-Fatura (${invoiceNumber}) başarıyla düzenlendi ve her iki tüzel kişiliğin kayıtlarına işlendi.`,
      }
    } catch (err) {
      console.error('generateInterCompanyInvoice error:', err)
      return {
        success: false,
        isInterCompany: true,
        error: err.message || 'Inter-company fatura üretilirken hata oluştu.',
      }
    }
  }

  /**
   * Aynı Şirket İçi Transferler İçin UBL-TR 2.1 e-İrsaliye (Sevk İrsaliyesi) Üretimi
   * VKN'ler aynı olduğunda e-Fatura gerekmez, yalnızca yasal sevkiyat e-İrsaliyesi düzenlenir.
   */
  async generateIntraCompanyDespatch(transferRecord, transferLines = [], options = {}) {
    try {
      const sourceNodeId =
        transferRecord.sourceBranchId ||
        transferRecord.origin_branch_id ||
        transferRecord.originBranchId ||
        transferRecord.sourceNodeId ||
        transferRecord.originSnapshot?.branchId

      const targetNodeId =
        transferRecord.destinationBranchId ||
        transferRecord.targetBranchId ||
        transferRecord.destination_branch_id ||
        transferRecord.targetNodeId

      const [sourceLegalEntity, targetLegalEntity] = await Promise.all([
        this.getNodeLegalEntity(sourceNodeId || transferRecord.originSnapshot),
        this.getNodeLegalEntity(targetNodeId || transferRecord.destinationMeta),
      ])

      const outboundEttn = generateETTN()
      const despatchNumber = generateDespatchNumber('IRS', new Date().getFullYear(), Math.floor(Math.random() * 899999 + 100000))
      const issueDate = transferRecord.movementDate || new Date().toISOString().split('T')[0]
      const issueTime = new Date().toTimeString().split(' ')[0]
      const documentNo = transferRecord.documentNo || transferRecord.source_doc_no || `TRF-IRS-${Date.now().toString().slice(-8)}`

      const lines = (transferLines || []).map((line, idx) => {
        const qty = Number(line.quantity || line.rowQuantityOriginal || line.invoiced_quantity || 1)
        const unitPrice = Number(line.rowTransferUnitCost || line.unitCost || line.unit_price || line.price || 0)
        const lineSubtotal = Math.round(qty * unitPrice * 100) / 100

        return {
          line_number: idx + 1,
          item_name: line.itemName || line.item_name || line.name || 'Transfer Kalemi',
          item_code: line.itemSku || line.item_sku || line.sku || (line.itemId ? String(line.itemId).slice(0, 8) : null),
          item_description: `Şirket İçi Sevk İrsaliyesi Kalemi: ${line.itemName || line.item_name || ''}`,
          invoiced_quantity: qty,
          unit_code: line.unit || line.unit_code || 'C62',
          unit_price: unitPrice,
          subtotal: lineSubtotal,
          tax_rate: 0,
          tax_amount: 0,
          total_line_amount: lineSubtotal,
          matched_stock_item_id: line.stock_item_id || line.itemId || null,
          matched_stock_item_name: line.itemName || line.item_name || null,
        }
      })

      const despatchPayload = {
        ettn: outboundEttn,
        despatch_number: despatchNumber,
        invoice_number: despatchNumber,
        profile_id: 'TEMELIRSALIYE',
        invoice_type: 'SEVK_IRSALIYESI',
        issue_date: issueDate,
        issue_time: issueTime,
        sender_vkn_tckn: sourceLegalEntity.taxNumber,
        sender_title: sourceLegalEntity.legalTitle,
        sender_tax_office: sourceLegalEntity.taxOffice,
        sender_address: sourceLegalEntity.legalAddress,
        receiver_vkn_tckn: targetLegalEntity.taxNumber,
        receiver_title: targetLegalEntity.legalTitle,
        receiver_tax_office: targetLegalEntity.taxOffice,
        receiver_address: targetLegalEntity.legalAddress,
        notes: `Şirket İçi Sevk İrsaliyesi (Aynı VKN: ${sourceLegalEntity.taxNumber}). Sevk Belge No: ${documentNo}. ${transferRecord.note || transferRecord.notes || ''}`.trim(),
        lines,
      }

      const ublXml = generateDespatchUBLXML(despatchPayload)

      // Save OUTBOUND e-Despatch
      const outboundInsertData = {
        direction: 'OUTBOUND',
        ettn: outboundEttn,
        invoice_number: despatchNumber,
        invoice_type: 'SEVK_IRSALIYESI',
        profile_id: 'TEMELIRSALIYE',
        issue_date: issueDate,
        issue_time: issueTime,
        status_code: EINVOICE_STATUS.DELIVERED_TO_RECEIVER, // 1200
        status_description: 'Sevk İrsaliyesi İletildi (Şirket İçi)',
        currency_code: 'TRY',
        currency_rate: 1.0,
        sender_vkn_tckn: sourceLegalEntity.taxNumber,
        sender_title: sourceLegalEntity.legalTitle,
        sender_tax_office: sourceLegalEntity.taxOffice,
        sender_address: sourceLegalEntity.legalAddress,
        receiver_vkn_tckn: targetLegalEntity.taxNumber,
        receiver_title: targetLegalEntity.legalTitle,
        receiver_tax_office: targetLegalEntity.taxOffice,
        receiver_address: targetLegalEntity.legalAddress,
        line_extension_amount: lines.reduce((s, l) => s + l.subtotal, 0),
        tax_exclusive_amount: lines.reduce((s, l) => s + l.subtotal, 0),
        tax_inclusive_amount: lines.reduce((s, l) => s + l.subtotal, 0),
        tax_total_amount: 0,
        payable_amount: lines.reduce((s, l) => s + l.subtotal, 0),
        notes: despatchPayload.notes,
        ubl_xml: ublXml,
        is_inter_company: false,
        source_transfer_doc_no: documentNo,
        origin_node_id: sourceNodeId || null,
        destination_node_id: targetNodeId || null,
        raw_json: {
          transferRecord,
          sourceLegalEntity,
          targetLegalEntity,
          isDespatchOnly: true,
        },
      }

      const { data: savedOutboundArr, error: outboundErr } = await db
        .from('e_invoices')
        .insert(outboundInsertData)
        .select('*')

      if (outboundErr) throw outboundErr
      const savedOutbound = savedOutboundArr?.[0] || outboundInsertData

      if (savedOutbound.id) {
        const outboundLinesData = lines.map((l) => ({
          ...l,
          invoice_id: savedOutbound.id,
        }))
        await db.from('e_invoice_lines').insert(outboundLinesData)
      }

      // Auto-create mirrored INBOUND Despatch
      const inboundEttn = generateETTN()
      const inboundInsertData = {
        direction: 'INBOUND',
        ettn: inboundEttn,
        invoice_number: despatchNumber,
        invoice_type: 'SEVK_IRSALIYESI',
        profile_id: 'TEMELIRSALIYE',
        issue_date: issueDate,
        issue_time: issueTime,
        status_code: EINVOICE_STATUS.DELIVERED_TO_RECEIVER,
        status_description: 'Sevk İrsaliyesi Alındı (Şirket İçi Transfer)',
        currency_code: 'TRY',
        currency_rate: 1.0,
        sender_vkn_tckn: sourceLegalEntity.taxNumber,
        sender_title: sourceLegalEntity.legalTitle,
        sender_tax_office: sourceLegalEntity.taxOffice,
        sender_address: sourceLegalEntity.legalAddress,
        receiver_vkn_tckn: targetLegalEntity.taxNumber,
        receiver_title: targetLegalEntity.legalTitle,
        receiver_tax_office: targetLegalEntity.taxOffice,
        receiver_address: targetLegalEntity.legalAddress,
        line_extension_amount: lines.reduce((s, l) => s + l.subtotal, 0),
        tax_exclusive_amount: lines.reduce((s, l) => s + l.subtotal, 0),
        tax_inclusive_amount: lines.reduce((s, l) => s + l.subtotal, 0),
        tax_total_amount: 0,
        payable_amount: lines.reduce((s, l) => s + l.subtotal, 0),
        notes: despatchPayload.notes,
        ubl_xml: ublXml,
        is_inter_company: false,
        source_transfer_doc_no: documentNo,
        origin_node_id: sourceNodeId || null,
        destination_node_id: targetNodeId || null,
        is_matched: true,
        raw_json: {
          transferRecord,
          sourceLegalEntity,
          targetLegalEntity,
          isDespatchOnly: true,
          pairedOutboundEttn: outboundEttn,
        },
      }

      const { data: savedInboundArr, error: inboundErr } = await db
        .from('e_invoices')
        .insert(inboundInsertData)
        .select('*')

      if (inboundErr) throw inboundErr
      const savedInbound = savedInboundArr?.[0] || inboundInsertData

      if (savedInbound.id) {
        const inboundLinesData = lines.map((l) => ({
          ...l,
          invoice_id: savedInbound.id,
        }))
        await db.from('e_invoice_lines').insert(inboundLinesData)

        await db.from('e_invoice_matching_logs').insert({
          invoice_id: savedInbound.id,
          matching_type: 'INTRA_COMPANY_DESPATCH',
          notes: `Aynı şirket içi transfer için e-İrsaliye düzenlendi. Belge No: ${despatchNumber}. Kaynak: ${sourceLegalEntity.legalTitle} -> Hedef: ${targetLegalEntity.legalTitle} (Aynı VKN).`,
          performed_by: 'AUTO_INTRA_COMPANY_SERVICE',
        })
      }

      return {
        success: true,
        isInterCompany: false,
        despatchNumber,
        outboundDespatch: savedOutbound,
        inboundDespatch: savedInbound,
        ublXml,
        message: `Aynı şirket içi transfer için yalnız e-İrsaliye (${despatchNumber}) başarıyla düzenlendi.`,
      }
    } catch (err) {
      console.error('generateIntraCompanyDespatch error:', err)
      return { success: false, isInterCompany: false, error: err.message }
    }
  }

  /**
   * Transfer Belgesi Otomasyonu (Smart Router)
   * - Aynı VKN: Yalnızca e-İrsaliye (Sevk İrsaliyesi)
   * - Farklı VKN: Hem e-İrsaliye hem de e-Fatura
   */
  async generateTransferDocuments(transferRecord, transferLines = [], options = {}) {
    const sourceNodeId =
      transferRecord.sourceBranchId ||
      transferRecord.origin_branch_id ||
      transferRecord.originBranchId ||
      transferRecord.sourceNodeId ||
      transferRecord.originSnapshot?.branchId

    const targetNodeId =
      transferRecord.destinationBranchId ||
      transferRecord.targetBranchId ||
      transferRecord.destination_branch_id ||
      transferRecord.targetNodeId

    const checkResult = await this.checkIfInterCompanyTransfer(
      sourceNodeId || transferRecord.originSnapshot,
      targetNodeId || transferRecord.destinationMeta
    )

    if (!checkResult.isInterCompany) {
      // Intra-company: Generate only e-Despatch
      const despatchResult = await this.generateIntraCompanyDespatch(transferRecord, transferLines, options)
      return {
        success: despatchResult.success,
        isInterCompany: false,
        documentType: 'DESPATCH_ONLY',
        despatch: despatchResult,
        invoice: null,
        message: despatchResult.message,
      }
    } else {
      // Inter-company: Generate both e-Invoice and e-Despatch
      const invoiceResult = await this.generateInterCompanyInvoice(transferRecord, transferLines, { ...options, force: true })
      const despatchResult = await this.generateIntraCompanyDespatch(transferRecord, transferLines, options)
      return {
        success: invoiceResult.success && despatchResult.success,
        isInterCompany: true,
        documentType: 'INVOICE_AND_DESPATCH',
        invoice: invoiceResult,
        despatch: despatchResult,
        message: `Şirketler arası transfer için e-Fatura (${invoiceResult.invoiceNumber}) ve e-İrsaliye (${despatchResult.despatchNumber}) başarıyla üretildi.`,
      }
    }
  }

  /**
   * 1-Click Aynı Şirket İçi Transfer E-İrsaliyesi Simülasyonu
   * Test ve demo amaçlı aynı VKN transferi için yalnız sevk irsaliyesi üretir.
   */
  async simulateIntraCompanyTransferDespatch(options = {}) {
    try {
      const timestamp = new Date().toISOString()
      const dateText = timestamp.slice(0, 10)
      const docNo = `TRF-IRS-${Math.floor(100000 + Math.random() * 900000)}`

      // Source: Ana Depo (Same VKN: 1234567890)
      const sourceEntity = {
        id: '11111111-1111-4111-a111-111111111111',
        nodeId: '11111111-1111-4111-a111-111111111111',
        nodeName: 'Merkez Ana Depo',
        nodeType: 'anadepo',
        isLegalEntity: true,
        taxNumber: '1234567890',
        legalTitle: 'SuitableRMS Restoran Grubu A.Ş.',
        taxOffice: 'Beşiktaş',
        legalAddress: 'Büyükdere Cad. No:100 Levent / Beşiktaş / İstanbul',
      }

      // Target: Beşiktaş Şubesi (Same VKN: 1234567890)
      const targetEntity = {
        id: '33333333-3333-4333-a333-333333333333',
        nodeId: '33333333-3333-4333-a333-333333333333',
        nodeName: 'Beşiktaş Çarşı Şubesi',
        nodeType: 'sube',
        isLegalEntity: false,
        parent_legal_entity_id: '11111111-1111-4111-a111-111111111111',
        taxNumber: '1234567890',
        legalTitle: 'SuitableRMS Restoran Grubu A.Ş.',
        taxOffice: 'Beşiktaş',
        legalAddress: 'Çarşı Cad. No:18 Beşiktaş / İstanbul',
      }

      const mockLines = [
        {
          itemType: 'stock_item',
          itemId: '33333333-3333-4333-a333-333333333333',
          itemName: 'Taze Sıkma Portakal Suyu (10 Lt)',
          itemSku: 'ICE-POR-10',
          unit: 'LTR',
          quantity: 20.0,
          rowTransferUnitCost: 65.0,
        },
        {
          itemType: 'stock_item',
          itemId: '44444444-4444-4444-a444-444444444444',
          itemName: 'Kağıt Pipet & Servis Peçetesi Seti',
          itemSku: 'AMB-PIP-100',
          unit: 'PK',
          quantity: 15.0,
          rowTransferUnitCost: 45.0,
        },
      ]

      const transferRecord = {
        documentNo: docNo,
        movementDate: dateText,
        notes: 'Beşiktaş Çarşı Şubesi dahili sarf ve içecek ikmali (Aynı Şirket İçi)',
        sourceBranchId: sourceEntity.nodeId,
        sourceBranchName: sourceEntity.nodeName,
        originSnapshot: sourceEntity,
        targetBranchId: targetEntity.nodeId,
        targetBranchName: targetEntity.nodeName,
        destinationMeta: targetEntity,
      }

      const result = await this.generateIntraCompanyDespatch(transferRecord, mockLines, options)
      return result
    } catch (err) {
      console.error('simulateIntraCompanyTransferDespatch error:', err)
      return { success: false, error: err.message }
    }
  }

  /**
   * 1-Click Şirketler Arası Transfer E-Faturası Simülasyonu
   * Test ve demo amaçlı tam otomatik inter-company transfer faturası üretir.
   */
  async simulateInterCompanyTransferInvoice(options = {}) {
    try {
      const timestamp = new Date().toISOString()
      const dateText = timestamp.slice(0, 10)
      const docNo = `TR-SIM-${Math.floor(100000 + Math.random() * 900000)}`

      // Source: Ana Depo / Merkez Şirketi
      const sourceEntity = {
        id: '11111111-1111-4111-a111-111111111111',
        nodeId: '11111111-1111-4111-a111-111111111111',
        nodeName: 'Merkez Ana Depo (Lojistik A.Ş.)',
        nodeType: 'anadepo',
        isLegalEntity: true,
        taxNumber: '1234567890',
        legalTitle: 'SuitableRMS Lojistik ve Tedarik A.Ş.',
        taxOffice: 'Beşiktaş',
        legalAddress: 'Büyükdere Cad. No:100 Levent / Beşiktaş / İstanbul',
      }

      // Target: Kadıköy Şubesi (Kadıköy Restorancılık Ltd. Şti.)
      const targetEntity = {
        id: '22222222-2222-4222-a222-222222222222',
        nodeId: '22222222-2222-4222-a222-222222222222',
        nodeName: 'Kadıköy Moda Şubesi',
        nodeType: 'sube',
        isLegalEntity: true,
        taxNumber: '9876543210',
        legalTitle: 'Kadıköy Gastronomi ve Restorancılık Ltd. Şti.',
        taxOffice: 'Kadıköy',
        legalAddress: 'Moda Cad. No:45/A Kadıköy / İstanbul',
      }

      const mockLines = [
        {
          itemType: 'stock_item',
          itemId: '33333333-3333-4333-a333-333333333333',
          itemName: 'Dana Antrikot (Vakumlu 5kg)',
          itemSku: 'ET-001-ANT',
          unit: 'KG',
          quantity: 25.0,
          rowTransferUnitCost: 450.0,
          taxRate: 1, // Gıdada %1 veya %10 KDV
        },
        {
          itemType: 'stock_item',
          itemId: '44444444-4444-4444-a444-444444444444',
          itemName: 'Özel Burger Sosu (5 Lt Bidon)',
          itemSku: 'SOS-004-BGR',
          unit: 'ADET',
          quantity: 10.0,
          rowTransferUnitCost: 280.0,
          taxRate: 10,
        },
        {
          itemType: 'semi_item',
          itemId: '55555555-5555-4555-a555-555555555555',
          itemName: 'Hazırlanmış Burger Köftesi 150g',
          itemSku: 'YM-KFT-150',
          unit: 'KG',
          quantity: 40.0,
          rowTransferUnitCost: 320.0,
          taxRate: 1,
        },
      ]

      const transferRecord = {
        documentNo: docNo,
        movementDate: dateText,
        notes: 'Kadıköy Şubesi haftalık et ve yarı mamul sevkiyatı (Simülasyon)',
        sourceBranchId: sourceEntity.nodeId,
        sourceBranchName: sourceEntity.nodeName,
        originSnapshot: sourceEntity,
        targetBranchId: targetEntity.nodeId,
        targetBranchName: targetEntity.nodeName,
        destinationMeta: targetEntity,
      }

      const result = await this.generateInterCompanyInvoice(transferRecord, mockLines, {
        force: true,
        profileId: 'TICARIFATURA',
        invoiceType: 'SATIS',
      })

      return result
    } catch (err) {
      console.error('simulateInterCompanyTransferInvoice error:', err)
      return { success: false, error: err.message }
    }
  }
}

export const interCompanyTransferService = new InterCompanyTransferService()
