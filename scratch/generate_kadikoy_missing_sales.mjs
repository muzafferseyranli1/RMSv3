import pg from 'pg'
import { randomUUID as uuidv4 } from 'node:crypto'

const { Client } = pg

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway'

const TARGET_DATES = [
  '2026-05-29',
  '2026-05-30',
  '2026-05-31',
  '2026-06-01',
  '2026-06-02',
  '2026-06-03'
]

const WEEKDAY_WEIGHTS = {
  1: 8, // Pazartesi
  2: 9, // Salı
  3: 12, // Çarşamba
  4: 11, // Perşembe
  5: 17, // Cuma
  6: 20, // Cumartesi
  0: 23  // Pazar
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function randomFloat(min, max) {
  return (Math.random() * (max - min)) + min
}

function clamp(val, min, max) {
  return Math.min(Math.max(val, min), max)
}

function buildBulkUpsertQuery(table, rows) {
  if (!rows.length) return null
  const columns = Object.keys(rows[0])
  const values = []
  const valueSql = rows.map((row) => {
    const start = values.length + 1
    values.push(...columns.map((column) => {
      let val = row[column];
      if (val !== null && typeof val === 'object') return JSON.stringify(val);
      return val;
    }))
    return `(${columns.map((_, index) => `$${start + index}`).join(', ')})`
  })
  
  return {
    sql: `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES ${valueSql.join(', ')}`,
    values,
  }
}

async function run() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: false
  })

  await client.connect()
  console.log('Veritabanına bağlanıldı.')

  try {
    // 1. Metadata
    const nodesRes = await client.query(`SELECT id, parent_id, type, name FROM company_nodes`)
    const allNodes = nodesRes.rows
    const nodeMap = new Map(allNodes.map(n => [n.id, n]))

    const branches = allNodes.filter(n => n.type === 'sube' && n.name === 'Kadıköy Şubesi').map(b => {
      let company_id = null
      let legal_entity_id = null
      let org_unit_id = null

      let curr = b
      while(curr && curr.parent_id) {
        curr = nodeMap.get(curr.parent_id)
        if (!curr) break
        if (curr.type === 'sirket') company_id = curr.id
        if (curr.type === 'tuzel') legal_entity_id = curr.id
        if (curr.type === 'org') org_unit_id = curr.id
      }
      return {
        branch_id: b.id,
        branch_name: b.name,
        company_id,
        legal_entity_id,
        org_unit_id
      }
    })

    const channelRes = await client.query(`SELECT id, name FROM sales_channels WHERE active = true AND (name ILIKE '%hizli%' OR name ILIKE '%Hızlı Satış%') LIMIT 1`)
    if (!channelRes.rows.length) throw new Error("Hizli Satis kanali bulunamadi.")
    const channel = channelRes.rows[0]

    const taxesRes = await client.query(`SELECT id, name, rate FROM taxes`)
    const taxes = taxesRes.rows
    const taxMap = new Map(taxes.map(t => [t.id, Number(t.rate)]))

    const productsRes = await client.query(`
      SELECT id, sku, name, standard_price, portions, option_groups, channel_prices, 
             recipe_rows, recipe_output_qty, sale_cat_l1, sale_cat_l2, sale_cat_l3, sale_cat_l4, sale_cat_l5
      FROM sale_items 
      WHERE deleted_at IS NULL AND sale_status = true AND setting_active = true
    `)
    let products = productsRes.rows.filter(p => {
      const cp = (p.channel_prices || []).find(c => c.channel_id === channel.id && c.active)
      if (!cp || !Number(cp.price)) return false
      p.currentPrice = Number(cp.price)
      return true
    })

    const categoriesRes = await client.query(`SELECT id, name, parent_id FROM sale_categories`)
    const categoriesMap = new Map(categoriesRes.rows.map(c => [c.id, c.name]))

    const stockItemsRes = await client.query(`SELECT id, name, sku, unit FROM stock_items`)
    const stockMap = new Map(stockItemsRes.rows.map(s => [s.id, s]))

    const semiItemsRes = await client.query(`SELECT id, name, sku, recipe_output_unit as unit FROM semi_items`)
    const semiMap = new Map(semiItemsRes.rows.map(s => [s.id, s]))

    console.log(`Bulunan Şube Sayısı: ${branches.length}`)
    console.log(`Bulunan Aktif Ürün Sayısı: ${products.length}`)

    // Organize Products
    const classifiedProducts = {
      main: [],
      drink: [],
      side: [],
      misc: []
    }

    for (const p of products) {
      const text = (p.name + " " + (categoriesMap.get(p.sale_cat_l2) || "")).toLowerCase()
      if (text.match(/hamburger|burger|sandvic|wrap|taco|pizza/)) {
        classifiedProducts.main.push(p)
      } else if (text.match(/icecek|mesrubat|cola|fanta|kahve|coffee|su |ayran/)) {
        classifiedProducts.drink.push(p)
      } else if (text.match(/yan urun|patates|sogan halkasi|fries|nugget/)) {
        classifiedProducts.side.push(p)
      } else {
        classifiedProducts.misc.push(p)
      }
    }

    // Loop branches and dates
    for (const branch of branches) {
      console.log(`\n--- Şube İşleniyor: ${branch.branch_name} ---`)
      
      for (const targetDate of TARGET_DATES) {
        const startDate = `${targetDate}T00:00:00+03:00`
        const endDate = `${targetDate}T23:59:59+03:00`

        // Check existing sales
        const checkRes = await client.query(`
          SELECT count(*)::int as c FROM sales 
          WHERE branch_id = $1 AND sale_datetime >= $2 AND sale_datetime <= $3
        `, [branch.branch_id, startDate, endDate])
        
        const currentCount = checkRes.rows[0].c

        if (currentCount > 0) {
          console.log(`[${targetDate}] Mevcut satışlar bulundu (${currentCount} adet). Temizleniyor...`)
          await client.query('BEGIN')
          await client.query('ALTER TABLE inventory_movements DISABLE TRIGGER trg_inventory_movements_queue_recalc')
          await client.query(`DELETE FROM sales WHERE branch_id = $1 AND sale_datetime >= $2 AND sale_datetime <= $3`, [branch.branch_id, startDate, endDate])
          await client.query(`DELETE FROM inventory_movements WHERE branch_id = $1 AND movement_at >= $2 AND movement_at <= $3 AND source_doc_type = 'sale'`, [branch.branch_id, startDate, endDate])
          await client.query('ALTER TABLE inventory_movements ENABLE TRIGGER trg_inventory_movements_queue_recalc')
          await client.query('COMMIT')
        }

        // Calculate volumes
        const dateObj = new Date(startDate)
        const dayOfWeek = dateObj.getDay()
        const dayWeight = WEEKDAY_WEIGHTS[dayOfWeek]
        const weekdayFactor = clamp((dayWeight / 100) * 7, 0.7, 1.3)

        const rawCount = Math.floor(randomInt(160, 300) * weekdayFactor * randomFloat(0.78, 1.22))
        const targetReceiptCount = clamp(rawCount, 160, 300)

        console.log(`[${targetDate}] Üretiliyor... Hedef fiş sayısı: ${targetReceiptCount}`)

        let allSales = []
        let allSaleLines = []
        let allPayments = []
        let allMovements = []

        let receiptIdx = 0
        while (receiptIdx < targetReceiptCount) {
          receiptIdx++
          const receiptAverage = randomFloat(480, 795)
          let receiptTarget = receiptAverage
          
          if (receiptIdx % 7 === 0) receiptTarget *= randomFloat(0.65, 1.38)
          else if (receiptIdx % 3 === 0) receiptTarget *= randomFloat(0.76, 1.26)
          else receiptTarget *= randomFloat(0.84, 1.18)

          receiptTarget = clamp(receiptTarget, 480, 795)

          let linesCount = 1
          if (receiptTarget < 350) linesCount = randomInt(1, 2)
          else if (receiptTarget < 700) linesCount = randomInt(1, 3)
          else if (receiptTarget < 1200) linesCount = randomInt(2, 4)
          else if (receiptTarget < 1800) linesCount = randomInt(2, 5)
          else linesCount = randomInt(3, 6)

          let basketItems = []
          let remainingTarget = receiptTarget

          // Decide categories
          let catsToPick = []
          if (receiptTarget >= 360 || Math.random() < 0.82) catsToPick.push('main')
          if (receiptTarget >= 450 ? Math.random() < 0.58 : Math.random() < 0.26) catsToPick.push('drink')
          if (receiptTarget >= 600 ? Math.random() < 0.48 : Math.random() < 0.18) catsToPick.push('side')
          if (receiptTarget >= 1400 && Math.random() < 0.20) catsToPick.push('main')

          while (catsToPick.length < linesCount) {
            const r = Math.random() * 10
            if (r < 4.8) catsToPick.push('main')
            else if (r < 7.15) catsToPick.push('drink')
            else if (r < 9.1) catsToPick.push('side')
            else catsToPick.push('misc')
          }
          catsToPick = catsToPick.slice(0, linesCount)

          for (const cat of catsToPick) {
            const pool = classifiedProducts[cat].length > 0 ? classifiedProducts[cat] : products
            const product = pool[Math.floor(Math.random() * pool.length)]

            let unitPrice = product.currentPrice
            let portionId = null
            let portionName = null
            if (product.portions && product.portions.length > 0) {
              if (product.portions.length === 1 || Math.random() < 0.65) {
                portionId = product.portions[0].id
                portionName = product.portions[0].name
                unitPrice += (Number(product.portions[0].price_offset) || 0)
              } else {
                const pt = product.portions[randomInt(1, product.portions.length - 1)]
                portionId = pt.id
                portionName = pt.name
                unitPrice += (Number(pt.price_offset) || 0)
              }
            }

            let maxQty = (cat === 'main') ? (receiptTarget > 1000 ? 4 : 2) : (receiptTarget > 1000 ? 3 : 2)
            let desiredQty = Math.max(1, Math.round(remainingTarget / (unitPrice || 1)))
            desiredQty = clamp(desiredQty, 1, maxQty)

            basketItems.push({
              product,
              portionId,
              portionName,
              unitPrice,
              qty: desiredQty,
              options: [] 
            })
            remainingTarget -= (desiredQty * unitPrice)
          }

          if (remainingTarget > 50 && basketItems.length > 0) {
            basketItems[0].qty += 1
          }

          let grossBeforeDiscount = basketItems.reduce((acc, item) => acc + (item.unitPrice * item.qty), 0)
          
          let discountRate = 0
          let discountAmount = 0
          if (Math.random() < 0.34) {
            discountRate = randomFloat(5, 15)
            discountAmount = grossBeforeDiscount * (discountRate / 100)
          }

          const saleId = uuidv4()
          const localId = `demo-${branch.branch_id}-${targetDate}-${receiptIdx}-${uuidv4().substring(0,6)}`
          
          const hour = randomInt(9, 20).toString().padStart(2, '0')
          const minute = randomInt(0, 59).toString().padStart(2, '0')
          const second = randomInt(0, 59).toString().padStart(2, '0')
          const saleDatetime = `${targetDate}T${hour}:${minute}:${second}+03:00`

          let netTotal = 0
          let costTotal = 0

          let currentLineNo = 1
          for (const item of basketItems) {
            const lineGrossBefore = item.qty * item.unitPrice
            const lineDiscount = discountAmount > 0 ? (lineGrossBefore / grossBeforeDiscount) * discountAmount : 0
            const lineGrossAfter = lineGrossBefore - lineDiscount
            
            // Tax
            let taxRate = 0
            let taxId = null
            let taxName = null

            // Find tax from channel_prices or product.tax_id
            const cp = (item.product.channel_prices || []).find(c => c.channel_id === channel.id)
            if (cp && cp.tax_id) {
               const taxInfo = taxes.find(t => t.id === cp.tax_id)
               if (taxInfo) {
                 taxRate = Number(taxInfo.rate)
                 taxId = taxInfo.id
                 taxName = taxInfo.name
               }
            }

            const lineNet = lineGrossAfter / (1 + (taxRate / 100))
            netTotal += lineNet

            let lineCost = 0
            const saleLineId = uuidv4()

            // Inventory movements
            if (item.product.recipe_rows && item.product.recipe_rows.length > 0) {
              for (const row of item.product.recipe_rows) {
                if (row.channels && row.channels.length > 0 && !row.channels.includes(channel.id)) continue;
                if (row.portions && row.portions.length > 0 && item.portionId && !row.portions.includes(item.portionId)) continue;
                if (row.portions && row.portions.length > 0 && !item.portionId && !row.portions.includes('__standart__')) continue;

                const baseQty = Number(row.qty) || 0
                const wastePct = Number(row.waste_pct) || 0
                const recOutput = Number(item.product.recipe_output_qty) || 1
                const consumption = (baseQty * (1 + wastePct / 100) / recOutput) * item.qty
                const unitCost = Number(row.cost) || 0
                const totalCost = unitCost * consumption
                lineCost += totalCost

                let sSku = '', sUnit = '', sName = ''
                if (row.ingredient_type === 'stock' && stockMap.has(row.stock_item_id)) {
                  const s = stockMap.get(row.stock_item_id)
                  sSku = s.sku; sUnit = s.unit; sName = s.name
                } else if (row.ingredient_type === 'semi' && semiMap.has(row.semi_item_id)) {
                  const s = semiMap.get(row.semi_item_id)
                  sSku = s.sku; sUnit = s.unit; sName = s.name
                }

                allMovements.push({
                  id: uuidv4(),
                  company_id: branch.company_id,
                  legal_entity_id: branch.legal_entity_id,
                  org_unit_id: branch.org_unit_id,
                  branch_id: branch.branch_id,
                  branch_name: branch.branch_name,
                  item_type: row.ingredient_type === 'stock' ? 'stock_item' : 'semi_item',
                  stock_item_id: row.stock_item_id,
                  semi_item_id: row.semi_item_id,
                  item_name: sName,
                  item_sku: sSku,
                  unit: sUnit,
                  movement_type: 'sale_consumption',
                  source_doc_type: 'sale',
                  direction: 'out',
                  movement_at: saleDatetime,
                  quantity: consumption,
                  source_doc_id: saleId,
                  source_doc_line_id: saleLineId,
                  sale_id: saleId,
                  sale_line_id: saleLineId,
                  sale_item_id: item.product.id,
                  sales_channel_id: channel.id,
                  sales_channel_name: channel.name,
                  portion_id: item.portionId,
                  portion_name: item.portionName,
                  recipe_row_id: row.id,
                  unit_cost: unitCost,
                  total_cost: totalCost,
                  avg_unit_cost_after: 0,
                  balance_qty_after: 0,
                  balance_total_cost_after: 0,
                  calc_status: 'pending',
                  meta: { source: 'demo-sales-tool', waste_pct: wastePct, recipe_output_qty: recOutput, sale_qty: item.qty }
                })
              }
            }

            costTotal += lineCost

            allSaleLines.push({
              id: saleLineId,
              sale_id: saleId,
              line_no: currentLineNo++,
              product_id: item.product.id,
              product_name: item.product.name,
              product_sku: item.product.sku,
              top_category_id: item.product.sale_cat_l1,
              top_category_name: categoriesMap.get(item.product.sale_cat_l1) || '',
              sub_category_id: item.product.sale_cat_l2,
              sub_category_name: categoriesMap.get(item.product.sale_cat_l2) || '',
              portion_id: item.portionId,
              portion_name: item.portionName,
              options_json: [],
              options_summary: '',
              qty: item.qty,
              unit_gross_before_discount: item.unitPrice,
              line_gross_before_discount: lineGrossBefore,
              discount_allocated_amount: lineDiscount,
              unit_gross_after_discount: (lineGrossAfter / item.qty) || 0,
              line_gross_after_discount: lineGrossAfter,
              tax_id: taxId,
              tax_name: taxName,
              tax_rate: taxRate,
              line_net_after_discount: lineNet,
              unit_cost_snapshot: (lineCost / item.qty) || 0,
              line_cost_total: lineCost,
              sales_channel_id: channel.id,
              sales_channel_name: channel.name,
              branch_id: branch.branch_id,
              branch_name: branch.branch_name,
              sale_datetime: saleDatetime
            })
          }

          let grossAfterDiscount = grossBeforeDiscount - discountAmount

          // Payments
          if (grossAfterDiscount > 400 && Math.random() < 0.28) {
            const splitAmount1 = grossAfterDiscount * randomFloat(0.35, 0.65)
            const splitAmount2 = grossAfterDiscount - splitAmount1
            
            const methods = [
              {m: 'nakit', l: 'Nakit'},
              {m: 'kredi_karti', l: 'Kredi Karti'},
              {m: 'transfer', l: 'Transfer'},
              {m: 'yemek_ceki', l: 'Yemek Ceki'}
            ]
            const m1 = methods[randomInt(0, 3)]
            let m2 = methods[randomInt(0, 3)]
            while(m1.m === m2.m) m2 = methods[randomInt(0, 3)]

            allPayments.push({
              id: uuidv4(), sale_id: saleId, payment_method: m1.m, payment_method_label: m1.l, amount: splitAmount1, payment_datetime: saleDatetime
            })
            allPayments.push({
              id: uuidv4(), sale_id: saleId, payment_method: m2.m, payment_method_label: m2.l, amount: splitAmount2, payment_datetime: saleDatetime
            })
          } else {
            const m = Math.random() < 0.72 ? {m: 'kredi_karti', l: 'Kredi Karti'} : {m: 'nakit', l: 'Nakit'}
            allPayments.push({
              id: uuidv4(), sale_id: saleId, payment_method: m.m, payment_method_label: m.l, amount: grossAfterDiscount, payment_datetime: saleDatetime
            })
          }

          allSales.push({
            id: saleId,
            local_id: localId,
            sale_datetime: saleDatetime,
            source: 'pos',
            source_channel_type: 'hizli_satis',
            sales_channel_id: channel.id,
            sales_channel_name: channel.name,
            company_id: branch.company_id,
            company_name: '',
            legal_entity_id: branch.legal_entity_id,
            legal_entity_name: '',
            org_unit_id: branch.org_unit_id,
            org_unit_name: '',
            branch_id: branch.branch_id,
            branch_name: branch.branch_name,
            gross_total_before_discount: grossBeforeDiscount,
            discount_type: discountAmount > 0 ? 'percent' : null,
            discount_value: discountRate,
            discount_amount: discountAmount,
            gross_total_after_discount: grossAfterDiscount,
            payment_total: grossAfterDiscount,
            net_total_after_discount: netTotal,
            cost_total: costTotal,
            status: 'completed',
            integration_ref: 'demo-sales-tool'
          })
        }

        if (allSales.length > 0) {
          console.log(`  >> Toplu Insert Basliyor (${allSales.length} Fiş)...`)
          await client.query('BEGIN')
          try {
            // Chunked Inserts
            const chunkSize = 30
            for(let i=0; i < allSales.length; i+=chunkSize) {
               const chunk = allSales.slice(i, i+chunkSize)
               const st = buildBulkUpsertQuery('sales', chunk)
               await client.query(st.sql, st.values)
            }
            
            for(let i=0; i < allSaleLines.length; i+=chunkSize) {
               const chunk = allSaleLines.slice(i, i+chunkSize)
               const st = buildBulkUpsertQuery('sale_lines', chunk)
               await client.query(st.sql, st.values)
            }
            
            for(let i=0; i < allPayments.length; i+=chunkSize) {
               const chunk = allPayments.slice(i, i+chunkSize)
               const st = buildBulkUpsertQuery('sale_payments', chunk)
               await client.query(st.sql, st.values)
            }
            
            for(let i=0; i < allMovements.length; i+=chunkSize) {
               const chunk = allMovements.slice(i, i+chunkSize)
               const st = buildBulkUpsertQuery('inventory_movements', chunk)
               await client.query(st.sql, st.values)
            }
            
            await client.query('COMMIT')
            console.log(`  >> [${targetDate}] için ${allSales.length} fiş başarıyla yazıldı.`)
          } catch(err) {
            await client.query('ROLLBACK')
            console.error('Veritabanina yazilirken hata olustu:', err.message)
          }
        }
      }
    }

    console.log('\n--- İŞLEM TAMAMLANDI ---')

  } catch (error) {
    console.error('Hata:', error)
  } finally {
    await client.end()
  }
}

run()
