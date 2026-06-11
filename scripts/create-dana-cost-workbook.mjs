import fs from 'node:fs';
import XLSX from 'xlsx';

const outputPath = 'dana_eti_tek_tablo_3_maliyet_yontemi_saglam.xlsx';
const colorOutputPath = 'dana_eti_tek_tablo_3_maliyet_yontemi_renkli.xls';

const movements = [
  { no: 1, date: '2026-06-01 09:00', id: 'GR-001', type: 'Alış girişi', inQty: 60, outQty: 0, price: 420, note: 'İlk Dana eti alımı' },
  { no: 2, date: '2026-06-01 13:00', id: 'CK-001', type: 'Reçete tüketimi', inQty: 0, outQty: 22, price: null, note: 'Öğle servis tüketimi' },
  { no: 3, date: '2026-06-02 20:30', id: 'CK-002', type: 'Reçete tüketimi', inQty: 0, outQty: 30, price: null, note: 'Akşam servis tüketimi' },
  { no: 4, date: '2026-06-03 10:15', id: 'GR-002', type: 'Alış girişi', inQty: 40, outQty: 0, price: 455, note: 'Fiyat artışlı alım' },
  { no: 5, date: '2026-06-03 19:00', id: 'CK-003', type: 'Reçete tüketimi', inQty: 0, outQty: 15, price: null, note: 'Servis tüketimi' },
  { no: 6, date: '2026-06-04 08:30', id: 'FIR-001', type: 'Fire/trim', inQty: 0, outQty: 5, price: null, note: 'Temizleme firesi' },
  { no: 7, date: '2026-06-04 11:00', id: 'GR-003', type: 'Alış girişi', inQty: 25, outQty: 0, price: 470, note: 'Yeni parti alım' },
  { no: 8, date: '2026-06-05 21:30', id: 'CK-004', type: 'Reçete tüketimi', inQty: 0, outQty: 38, price: null, note: 'Yoğun servis tüketimi' },
  { no: 9, date: '2026-06-06 22:00', id: 'CK-005', type: 'Reçete tüketimi', inQty: 0, outQty: 24, price: null, note: 'NEGATİF STOK: kayıt fiili stoktan fazla tüketim gösteriyor' },
  { no: 10, date: '2026-06-07 09:20', id: 'GR-004', type: 'Alış girişi', inQty: 20, outQty: 0, price: 510, note: 'Negatif stok kapatma alımı' },
  { no: 11, date: '2026-06-07 15:00', id: 'CK-006', type: 'Reçete tüketimi', inQty: 0, outQty: 6, price: null, note: 'Servis tüketimi' },
  { no: 12, date: '2026-06-08 10:00', id: 'GR-005', type: 'Alış girişi', inQty: 50, outQty: 0, price: 530, note: 'Haftalık alım' },
  { no: 13, date: '2026-06-08 22:15', id: 'CK-007', type: 'Reçete tüketimi', inQty: 0, outQty: 35, price: null, note: 'Akşam servis tüketimi' },
  { no: 14, date: '2026-06-09 22:30', id: 'CK-008', type: 'Reçete tüketimi', inQty: 0, outQty: 28, price: null, note: 'NEGATİF STOK: ikinci açık' },
  { no: 15, date: '2026-06-10 09:10', id: 'GR-006', type: 'Alış girişi', inQty: 20, outQty: 0, price: 560, note: 'Negatif stok kapatma alımı' },
  { no: 16, date: '2026-06-10 18:00', id: 'SYM-001', type: 'Sayım fazlası', inQty: 10, outQty: 0, price: 550, note: 'Sayım farkı girişi' },
  { no: 17, date: '2026-06-11 14:00', id: 'CK-009', type: 'Reçete tüketimi', inQty: 0, outQty: 20, price: null, note: 'Servis tüketimi' },
];

const round = (value) => (value == null || Number.isNaN(value) ? null : Math.round(value * 1000000) / 1000000);

function computeRows() {
  let wacQty = 0;
  let wacValue = 0;
  let wacAvg = 0;
  let lastPurchase = 0;
  let lastQty = 0;
  const fifoLots = [];
  let fifoDebt = 0;
  let lastFifoUnit = 0;

  return movements.map((m) => {
    const wacPrevQty = wacQty;
    const wacPrevValue = wacValue;
    const wacOutUnit = m.outQty > 0 ? (wacAvg > 0 ? wacAvg : m.price || 0) : null;
    const wacMoveCost = m.inQty > 0 ? m.inQty * m.price : m.outQty > 0 ? m.outQty * wacOutUnit : 0;
    const wacNextQty = wacQty + m.inQty - m.outQty;
    let wacNextValue;
    if (m.inQty > 0) {
      wacNextValue = wacPrevQty < 0 ? wacNextQty * m.price : wacValue + m.inQty * m.price;
    } else {
      wacNextValue = wacValue - wacMoveCost;
    }
    const wacNextAvg = wacNextQty !== 0 ? wacNextValue / wacNextQty : (m.inQty > 0 ? m.price : wacAvg);
    wacQty = wacNextQty;
    wacValue = wacNextValue;
    wacAvg = wacNextAvg;

    let fifoUnit = null;
    let fifoMoveCost = 0;
    let fifoNegKg = 0;
    let fifoNegUnit = null;
    let fifoNote = '';
    if (m.inQty > 0) {
      let remainingIn = m.inQty;
      lastFifoUnit = m.price;
      if (fifoDebt > 0) {
        const covered = Math.min(remainingIn, fifoDebt);
        fifoDebt -= covered;
        remainingIn -= covered;
        fifoNote = `Önceki negatif stoktan ${covered} kg kapandı`;
      }
      if (remainingIn > 0) {
        fifoLots.push({ qty: remainingIn, unit: m.price });
        fifoNote += `${fifoNote ? '; ' : ''}${remainingIn} kg yeni FIFO lotu açıldı`;
      }
      fifoMoveCost = m.inQty * m.price;
    } else if (m.outQty > 0) {
      let remainingOut = m.outQty;
      let cost = 0;
      while (remainingOut > 0 && fifoLots.length > 0) {
        const lot = fifoLots[0];
        const take = Math.min(remainingOut, lot.qty);
        cost += take * lot.unit;
        lot.qty -= take;
        remainingOut -= take;
        lastFifoUnit = lot.unit;
        if (lot.qty <= 0.0000001) fifoLots.shift();
      }
      if (remainingOut > 0) {
        fifoNegKg = remainingOut;
        fifoNegUnit = lastFifoUnit || 0;
        cost += remainingOut * fifoNegUnit;
        fifoDebt += remainingOut;
        fifoNote = `Mevcut FIFO lotu yetmedi; ${remainingOut} kg negatif stok olarak maliyetlendi`;
      }
      fifoMoveCost = cost;
      fifoUnit = cost / m.outQty;
    }
    let fifoOpenQty = fifoLots.reduce((sum, lot) => sum + lot.qty, 0);
    let fifoOpenValue = fifoLots.reduce((sum, lot) => sum + lot.qty * lot.unit, 0);
    if (fifoDebt > 0) {
      fifoOpenQty -= fifoDebt;
      fifoOpenValue -= fifoDebt * lastFifoUnit;
    }

    if (m.inQty > 0) lastPurchase = m.price;
    const lastMoveCost = m.inQty > 0 ? m.inQty * m.price : m.outQty > 0 ? m.outQty * lastPurchase : 0;
    lastQty = lastQty + m.inQty - m.outQty;
    const lastValue = lastQty * lastPurchase;

    return {
      ...m,
      wacPrevQty: round(wacPrevQty),
      wacPrevValue: round(wacPrevValue),
      wacOutUnit: round(wacOutUnit),
      wacMoveCost: round(wacMoveCost),
      wacQty: round(wacNextQty),
      wacValue: round(wacNextValue),
      wacAvg: round(wacNextAvg),
      fifoUnit: round(fifoUnit),
      fifoMoveCost: round(fifoMoveCost),
      fifoOpenQty: round(fifoOpenQty),
      fifoOpenValue: round(fifoOpenValue),
      fifoNegKg: round(fifoNegKg),
      fifoNegUnit: round(fifoNegUnit),
      fifoNote,
      lastPurchase: round(lastPurchase),
      lastMoveCost: round(lastMoveCost),
      lastQty: round(lastQty),
      lastValue: round(lastValue),
    };
  });
}

const computed = computeRows();

const rows = [
  ['Dana Eti - Tek Tabloda 3 Maliyet Yöntemi Simülasyonu'],
  ['Aynı stok hareketi satırı WAC, FIFO ve Son Alış yöntemleriyle yan yana hesaplanır. Excel Table nesnesi yoktur.'],
  ['Resmi maliyet yöntemi seçimi', 'Ağırlıklı Ortalama', '', 'B3 hücresine Ağırlıklı Ortalama / FIFO / Son Alış yazınca mor kolonlar ona göre formülle değişir.'],
  ['Ürün', 'Dana eti', '', 'Birim', 'kg'],
  ['Renk kodu', 'Gri: ortak hareket | Mavi: WAC | Yeşil: FIFO | Turuncu: Son Alış | Mor: seçili resmi yöntem'],
  [],
  ['Ortak hareket verisi', '', '', '', '', '', '', '', 'Ağırlıklı Ortalama / WAC', '', '', '', '', '', '', 'FIFO', '', '', '', '', '', '', 'Son Alış Fiyatı', '', '', '', 'Seçili resmi yöntem'],
  [
    'No', 'Tarih/Saat', 'Hareket ID', 'Hareket Tipi', 'Girdi kg', 'Çıktı kg', 'Alış birim fiyatı', 'Açıklama',
    'WAC önceki kg', 'WAC önceki değer', 'WAC çıkış birim', 'WAC hareket maliyeti', 'WAC bakiye kg', 'WAC bakiye değer', 'WAC ortalama birim',
    'FIFO çıkış birim', 'FIFO hareket maliyeti', 'FIFO açık lot kg', 'FIFO açık lot değeri', 'FIFO negatif kg', 'FIFO negatif birim', 'FIFO notu',
    'Son alış birim', 'Son alış hareket maliyeti', 'Son alış bakiye kg', 'Son alış bakiye değer',
    'Seçili yöntem birim', 'Seçili yöntem hareket maliyeti', 'Seçili yöntem bakiye kg', 'Seçili yöntem bakiye değer', 'Stok durumu',
  ],
];

for (const [idx, m] of computed.entries()) {
  const rowNum = idx + 9;
  const officialUnitFormula = `IF($B$3="FIFO",P${rowNum},IF($B$3="Son Alış",W${rowNum},O${rowNum}))`;
  const officialMoveFormula = `IF($B$3="FIFO",Q${rowNum},IF($B$3="Son Alış",X${rowNum},L${rowNum}))`;
  const officialQtyFormula = `IF($B$3="FIFO",R${rowNum},IF($B$3="Son Alış",Y${rowNum},M${rowNum}))`;
  const officialValueFormula = `IF($B$3="FIFO",S${rowNum},IF($B$3="Son Alış",Z${rowNum},N${rowNum}))`;
  rows.push([
    m.no, m.date, m.id, m.type, m.inQty || null, m.outQty || null, m.price, m.note,
    m.wacPrevQty, m.wacPrevValue, m.wacOutUnit, m.wacMoveCost, m.wacQty, m.wacValue, m.wacAvg,
    m.fifoUnit, m.fifoMoveCost, m.fifoOpenQty, m.fifoOpenValue, m.fifoNegKg, m.fifoNegUnit, m.fifoNote,
    m.lastPurchase, m.lastMoveCost, m.lastQty, m.lastValue,
    { f: officialUnitFormula, v: m.wacAvg },
    { f: officialMoveFormula, v: m.wacMoveCost },
    { f: officialQtyFormula, v: m.wacQty },
    { f: officialValueFormula, v: m.wacValue },
    { f: `IF(AC${rowNum}<0,"NEGATİF STOK","OK")`, v: m.wacQty < 0 ? 'NEGATİF STOK' : 'OK' },
  ]);
}

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(rows);
ws['!ref'] = `A1:AE${rows.length}`;
ws['!merges'] = [
  { s: { r: 0, c: 0 }, e: { r: 0, c: 30 } },
  { s: { r: 1, c: 0 }, e: { r: 1, c: 30 } },
  { s: { r: 2, c: 3 }, e: { r: 2, c: 30 } },
  { s: { r: 4, c: 1 }, e: { r: 4, c: 30 } },
  { s: { r: 6, c: 0 }, e: { r: 6, c: 7 } },
  { s: { r: 6, c: 8 }, e: { r: 6, c: 14 } },
  { s: { r: 6, c: 15 }, e: { r: 6, c: 21 } },
  { s: { r: 6, c: 22 }, e: { r: 6, c: 25 } },
  { s: { r: 6, c: 26 }, e: { r: 6, c: 30 } },
];
ws['!cols'] = [
  { wch: 6 }, { wch: 18 }, { wch: 13 }, { wch: 18 }, { wch: 11 }, { wch: 11 }, { wch: 16 }, { wch: 48 },
  ...Array.from({ length: 23 }, () => ({ wch: 17 })),
];
ws['!autofilter'] = { ref: `A8:AE${rows.length}` };
XLSX.utils.book_append_sheet(wb, ws, 'Dana_Eti_Tek_Tablo');
XLSX.writeFile(wb, outputPath, { bookType: 'xlsx', compression: true, cellStyles: false });

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const htmlRows = rows.map((row, rowIndex) => {
  const cells = [];
  for (let colIndex = 0; colIndex < 31; colIndex += 1) {
    const raw = row[colIndex];
    const value = raw && typeof raw === 'object' && 'v' in raw ? raw.v : raw;
    let cls = 'common';
    if (colIndex >= 8 && colIndex <= 14) cls = 'wac';
    else if (colIndex >= 15 && colIndex <= 21) cls = 'fifo';
    else if (colIndex >= 22 && colIndex <= 25) cls = 'last';
    else if (colIndex >= 26) cls = 'official';
    if (rowIndex === 0) cls += ' title';
    if (rowIndex === 6 || rowIndex === 7) cls += ' header';
    if (rowIndex >= 8 && row[7] && String(row[7]).startsWith('NEGATİF STOK')) cls += ' negative';
    cells.push(`<td class="${cls}">${escapeHtml(value)}</td>`);
  }
  return `<tr>${cells.join('')}</tr>`;
}).join('\n');

const htmlWorkbook = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
body { font-family: Calibri, Arial, sans-serif; }
table { border-collapse: collapse; font-size: 11pt; }
td { border: 1px solid #d1d5db; padding: 5px 7px; vertical-align: top; white-space: nowrap; }
.title { font-size: 16pt; font-weight: 700; }
.header { color: #fff; font-weight: 700; text-align: center; white-space: normal; }
.common.header { background: #6b7280; }
.wac.header { background: #2563eb; }
.fifo.header { background: #15803d; }
.last.header { background: #c2410c; }
.official.header { background: #6d28d9; }
.common { background: #fff; }
.wac { background: #dcebff; }
.fifo { background: #dcfce7; }
.last { background: #ffedd5; }
.official { background: #f3e8ff; }
.negative { background: #fee2e2 !important; font-weight: 700; }
</style>
</head>
<body>
<table>
${htmlRows}
</table>
</body>
</html>`;

fs.writeFileSync(colorOutputPath, htmlWorkbook, 'utf8');

console.log(outputPath);
console.log(colorOutputPath);
