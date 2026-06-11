import XLSX from 'xlsx';

const outputPath = 'fifo_lot_sistemi_yazilimci_egitimi.xlsx';

const movements = [
  { id: 'IN-001', at: '2026-06-01 09:00', type: 'purchase_receipt', direction: 'in', qty: 10, unitCost: 400, note: 'Lot 1 açılır' },
  { id: 'OUT-001', at: '2026-06-01 13:00', type: 'recipe_consumption', direction: 'out', qty: 3, unitCost: null, note: 'Lot 1 tüketilir' },
  { id: 'IN-002', at: '2026-06-02 10:00', type: 'purchase_receipt', direction: 'in', qty: 20, unitCost: 460, note: 'Lot 2 açılır' },
  { id: 'OUT-002', at: '2026-06-02 19:00', type: 'recipe_consumption', direction: 'out', qty: 12, unitCost: null, note: 'Lot 1 kalan 7 kg + Lot 2 5 kg' },
  { id: 'IN-003', at: '2026-06-03 10:00', type: 'purchase_receipt', direction: 'in', qty: 15, unitCost: 500, note: 'Lot 3 açılır' },
  { id: 'OUT-003', at: '2026-06-03 21:00', type: 'recipe_consumption', direction: 'out', qty: 18, unitCost: null, note: 'Lot 2 kalan 15 kg + Lot 3 3 kg' },
  { id: 'OUT-004', at: '2026-06-04 21:00', type: 'recipe_consumption', direction: 'out', qty: 20, unitCost: null, note: 'Lot 3 kalan 12 kg yetmez; negatif stok örneği' },
  { id: 'IN-004', at: '2026-06-05 09:00', type: 'purchase_receipt', direction: 'in', qty: 14, unitCost: 560, note: 'Negatif borç kapatılır, kalan 6 kg Lot 4 olur' },
];

const round = (value) => Math.round(value * 1000000) / 1000000;

function buildTrace() {
  const lots = [];
  const lotRows = [];
  const consumptionRows = [];
  const movementRows = [];
  let stockQty = 0;
  let cumulativeIn = 0;
  let cumulativeOut = 0;
  let negativeDebt = 0;
  let lastKnownUnitCost = 0;

  for (const movement of movements) {
    const beforeQty = stockQty;
    let movementCost = 0;
    let engineAction = '';

    if (movement.direction === 'in') {
      let remainingIn = movement.qty;
      lastKnownUnitCost = movement.unitCost;
      const inStart = cumulativeIn;
      cumulativeIn += movement.qty;

      if (negativeDebt > 0) {
        const covered = Math.min(remainingIn, negativeDebt);
        negativeDebt -= covered;
        remainingIn -= covered;
        engineAction += `Önce açık negatif stoktan ${covered} kg kapatılır. `;
        consumptionRows.push({
          movementId: movement.id,
          lotId: 'NEGATIVE_DEBT_CLOSE',
          usedQty: covered,
          unitCost: movement.unitCost,
          totalCost: covered * movement.unitCost,
          note: 'Negatif stok kapatma; gerçek sistemde politika kararı gerekir',
        });
      }

      if (remainingIn > 0) {
        const lotId = `LOT-${String(lotRows.length + 1).padStart(3, '0')}`;
        const lot = {
          lotId,
          sourceMovementId: movement.id,
          receivedAt: movement.at,
          originalQty: remainingIn,
          remainingQty: remainingIn,
          unitCost: movement.unitCost,
          lotStart: inStart + (movement.qty - remainingIn),
          lotEnd: inStart + movement.qty,
        };
        lots.push(lot);
        lotRows.push(lot);
        engineAction += `${remainingIn} kg için ${lotId} açılır.`;
      }
      movementCost = movement.qty * movement.unitCost;
      stockQty += movement.qty;
    } else {
      const outStart = cumulativeOut;
      const outEnd = cumulativeOut + movement.qty;
      cumulativeOut = outEnd;
      let remainingOut = movement.qty;

      while (remainingOut > 0 && lots.length > 0) {
        const lot = lots[0];
        const take = Math.min(remainingOut, lot.remainingQty);
        const totalCost = take * lot.unitCost;
        consumptionRows.push({
          movementId: movement.id,
          lotId: lot.lotId,
          usedQty: take,
          unitCost: lot.unitCost,
          totalCost,
          note: 'Normal FIFO lot tüketimi',
        });
        lot.remainingQty = round(lot.remainingQty - take);
        remainingOut = round(remainingOut - take);
        movementCost += totalCost;
        lastKnownUnitCost = lot.unitCost;
        if (lot.remainingQty <= 0) lots.shift();
      }

      if (remainingOut > 0) {
        negativeDebt = round(negativeDebt + remainingOut);
        const totalCost = remainingOut * lastKnownUnitCost;
        consumptionRows.push({
          movementId: movement.id,
          lotId: 'NEGATIVE_STOCK',
          usedQty: remainingOut,
          unitCost: lastKnownUnitCost,
          totalCost,
          note: 'Açık lot yetmedi; örnek amaçlı son bilinen maliyetle negatif stok yazıldı',
        });
        movementCost += totalCost;
        engineAction += `Açık lot yetmedi; ${remainingOut} kg negatif stok oluştu.`;
      } else {
        engineAction = 'Açık lotlar en eskiden yeniye tüketildi.';
      }
      stockQty -= movement.qty;

      movement.outStart = outStart;
      movement.outEnd = outEnd;
    }

    movementRows.push({
      ...movement,
      beforeQty: round(beforeQty),
      afterQty: round(stockQty),
      movementCost: round(movementCost),
      negativeDebt: round(negativeDebt),
      engineAction,
    });
  }

  return { lotRows, consumptionRows, movementRows };
}

const trace = buildTrace();

function sheetFromAoA(name, rows, widths = []) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = widths.map((wch) => ({ wch }));
  return { name, ws };
}

const summaryRows = [
  ['FIFO Lot Sistemi - Yazılımcı Eğitim Dosyası'],
  [],
  ['Amaç', 'Excel burada hesap motoru değildir; yazılımcıya FIFO lot modelini, kayıt tablolarını ve işlem sırasını göstermek için hazırlanmıştır.'],
  ['Ana fikir', 'Her alış bir FIFO lotu açar. Her çıkış açık lotlardan en eskiden başlayarak tüketim satırları üretir.'],
  ['Üretim uyarısı', 'Milyon satırda her çıkış için geçmişin tamamı taranmaz. Sadece remaining_qty > 0 açık lot kuyruğu kilitlenip tüketilir.'],
  ['Negatif stok', 'Fail-closed önerilir. Eğer iş kuralı izin verirse negatif debt ayrı izlenir ve sonraki girişle kapatılır.'],
  [],
  ['Önerilen DB tabloları'],
  ['inventory_movements', 'Ham stok hareket defteri: giriş, çıkış, transfer, sayım, reçete tüketimi.'],
  ['fifo_lots', 'Alışlardan oluşan açık/kapalı maliyet katmanları.'],
  ['fifo_consumptions', 'Her çıkış hareketinin hangi lotlardan kaç kg tükettiğini saklayan detay tablo.'],
  ['cost_policy_snapshots', 'Satış/reçete anındaki resmi maliyet yöntemi ve maliyet snapshot bilgisi.'],
  [],
  ['Raporlama kuralı', 'Raporlar FIFO için fifo_consumptions toplamını okur; geçmişi tekrar hesaplamaz.'],
];

const movementRows = [
  ['movement_id', 'item_id', 'location_id', 'movement_at', 'type', 'direction', 'qty', 'purchase_unit_cost', 'stock_before', 'stock_after', 'fifo_movement_cost', 'negative_debt_after', 'engine_action', 'note'],
  ...trace.movementRows.map((m) => [
    m.id,
    'ET001',
    'ANA_DEPO',
    m.at,
    m.type,
    m.direction,
    m.qty,
    m.unitCost ?? '',
    m.beforeQty,
    m.afterQty,
    m.movementCost,
    m.negativeDebt,
    m.engineAction,
    m.note,
  ]),
];

const lotRows = [
  ['lot_id', 'item_id', 'location_id', 'source_in_movement_id', 'received_at', 'original_qty', 'remaining_qty_after_sample', 'unit_cost', 'lot_start_index', 'lot_end_index', 'state'],
  ...trace.lotRows.map((lot) => [
    lot.lotId,
    'ET001',
    'ANA_DEPO',
    lot.sourceMovementId,
    lot.receivedAt,
    lot.originalQty,
    lot.remainingQty,
    lot.unitCost,
    lot.lotStart,
    lot.lotEnd,
    lot.remainingQty > 0 ? 'open' : 'closed',
  ]),
];

const exitMovements = trace.movementRows.filter((m) => m.direction === 'out');
const matrixHeader = ['exit_movement_id', 'exit_qty', 'exit_start_index', 'exit_end_index'];
for (const lot of trace.lotRows) {
  matrixHeader.push(`${lot.lotId} used_qty`, `${lot.lotId} unit_cost`, `${lot.lotId} total_cost`);
}
matrixHeader.push('negative_qty', 'exit_total_fifo_cost', 'formula_model');

const matrixRows = [
  matrixHeader,
  ...exitMovements.map((exit) => {
    const row = [exit.id, exit.qty, exit.outStart, exit.outEnd];
    let total = 0;
    for (const lot of trace.lotRows) {
      const used = Math.max(0, Math.min(exit.outEnd, lot.lotEnd) - Math.max(exit.outStart, lot.lotStart));
      const cappedUsed = Math.min(used, lot.originalQty);
      const cost = cappedUsed * lot.unitCost;
      total += cost;
      row.push(round(cappedUsed), lot.unitCost, round(cost));
    }
    const actualRows = trace.consumptionRows.filter((r) => r.movementId === exit.id);
    const negative = actualRows.filter((r) => r.lotId === 'NEGATIVE_STOCK').reduce((sum, r) => sum + r.usedQty, 0);
    const actualTotal = actualRows.reduce((sum, r) => sum + r.totalCost, 0);
    row.push(negative, round(actualTotal), 'used_qty = max(0, min(exit_end, lot_end) - max(exit_start, lot_start))');
    return row;
  }),
];

const consumptionRows = [
  ['movement_id', 'lot_id', 'used_qty', 'unit_cost', 'total_cost', 'what_this_row_means'],
  ...trace.consumptionRows.map((row) => [
    row.movementId,
    row.lotId,
    row.usedQty,
    row.unitCost,
    round(row.totalCost),
    row.note,
  ]),
];

const pseudoRows = [
  ['Pseudo-code'],
  ['1', 'begin transaction'],
  ['2', 'movement insert edilir veya mevcut movement işlenmek üzere alınır'],
  ['3', 'if direction = in:'],
  ['4', '  varsa negative_debt kapatılır; kalan miktar için fifo_lots satırı açılır'],
  ['5', 'if direction = out:'],
  ['6', '  open lots = SELECT * FROM fifo_lots WHERE item_id=? AND location_id=? AND remaining_qty>0 ORDER BY received_at, lot_id FOR UPDATE'],
  ['7', '  çıkış miktarı bitene kadar açık lotlardan qty_used kadar tüket'],
  ['8', '  her parça için fifo_consumptions(movement_id, lot_id, qty_used, unit_cost, total_cost) yaz'],
  ['9', '  fifo_lots.remaining_qty güncelle'],
  ['10', '  açık lot yetmezse fail-closed hata ver veya izin verilen modda negative_debt yaz'],
  ['11', 'commit'],
  [],
  ['Ölçek notu', 'Bu algoritma tüm geçmişi taramaz. Sadece açık lot kuyruğuna bakar. Bu yüzden milyon satırda Excel formülü değil DB transaction + indexed open lots gerekir.'],
  ['Index önerisi', 'fifo_lots(item_id, location_id, remaining_qty, received_at, lot_id) veya partial index: remaining_qty > 0'],
  ['Idempotency', 'Aynı hareket iki kez işlenmemeli; fifo_consumptions üzerinde movement_id + lot_id veya movement_id + sequence benzersizliği düşünülmeli.'],
  ['Recalc', 'Geçmiş tarihli hareket değişirse aynı item/location için o tarihten sonraki lot/consumption state yeniden kurulur.'],
];

const negativeRows = [
  ['Negatif Stok Politikası'],
  [],
  ['Politika', 'Davranış', 'Ne zaman kullanılır?'],
  ['Fail-closed', 'Açık lot yetmezse işlem reddedilir.', 'Maliyet doğruluğu kritikse önerilen politika budur.'],
  ['Negative debt', 'Çıkış geçici negatif yazılır, sonraki giriş önce bu borcu kapatır.', 'Operasyonel olarak satış durdurulamıyorsa kullanılır; raporda açıkça işaretlenmelidir.'],
  ['Last known cost', 'Negatif çıkış son bilinen birim maliyetle maliyetlenir.', 'Sadece geçici tahmin; sonraki girişte düzeltme muhasebesi gerekebilir.'],
  [],
  ['Öneri', 'RMS gibi DB-first sistemde varsayılan fail-closed olmalı. İş kararıyla izin verilirse negative_debt ayrı tablo/kolonla izlenmeli, sessiz fallback yapılmamalı.'],
];

const sheets = [
  sheetFromAoA('00_Ozet', summaryRows, [24, 120]),
  sheetFromAoA('01_Hareketler', movementRows, [18, 12, 14, 18, 22, 12, 10, 18, 14, 14, 18, 20, 70, 45]),
  sheetFromAoA('02_FIFO_Lotlar', lotRows, [14, 12, 14, 24, 18, 14, 24, 12, 16, 16, 12]),
  sheetFromAoA('03_Tuketim_Matrisi', matrixRows, [18, 10, 16, 16, ...Array(20).fill(16)]),
  sheetFromAoA('04_Tuketim_Kayitlari', consumptionRows, [18, 20, 12, 12, 14, 70]),
  sheetFromAoA('05_Pseudocode_DB', pseudoRows, [16, 120]),
  sheetFromAoA('06_Negatif_Stok', negativeRows, [24, 70, 45]),
];

const wb = XLSX.utils.book_new();
for (const { name, ws } of sheets) {
  XLSX.utils.book_append_sheet(wb, ws, name);
}

XLSX.writeFile(wb, outputPath, { bookType: 'xlsx', compression: true, cellStyles: false });
console.log(outputPath);
