import XLSX from 'xlsx';

const sourcePath = 'C:/Users/muzaf/Documents/maliyet hesaplama.xlsx';
const outputPath = 'maliyet_hesaplama_fifo_kontrol_duzeltilmis.xlsx';

const wb = XLSX.readFile(sourcePath, { cellFormula: true, cellNF: true, cellDates: false });
const sheetName = wb.SheetNames[0];
const ws = wb.Sheets[sheetName];
const range = XLSX.utils.decode_range(ws['!ref']);

function cell(row, col) {
  return XLSX.utils.encode_cell({ r: row - 1, c: col - 1 });
}

function getValue(row, col) {
  const c = ws[cell(row, col)];
  return c ? c.v : null;
}

function setNumber(row, col, value, formula = null) {
  const address = cell(row, col);
  ws[address] = {
    t: 'n',
    v: value == null || Number.isNaN(value) ? 0 : Math.round(value * 1000000000) / 1000000000,
  };
  if (formula) ws[address].f = formula;
}

function round(value) {
  return value == null || Number.isNaN(value) ? 0 : Math.round(value * 1000000000) / 1000000000;
}

const headerRow = 5;
const headers = {};
for (let c = range.s.c + 1; c <= range.e.c + 1; c += 1) {
  const value = getValue(headerRow, c);
  if (value) headers[String(value).trim()] = c;
}

const required = [
  'MalzemeID',
  'GirişMiktar',
  'ÇıkışMiktar',
  'AlışBirimFiyat',
  'FIFOÇıkışMaliyeti',
  'StokMiktarı',
  'FIFOStokTutarı',
  'FIFOStokBirimMaliyeti',
];
for (const name of required) {
  if (!headers[name]) throw new Error(`Beklenen kolon bulunamadı: ${name}`);
}

const col = {
  material: headers['MalzemeID'],
  inQty: headers['GirişMiktar'],
  outQty: headers['ÇıkışMiktar'],
  price: headers['AlışBirimFiyat'],
  fifoOutCost: headers['FIFOÇıkışMaliyeti'],
  fifoQty: headers['StokMiktarı'],
  fifoValue: headers['FIFOStokTutarı'],
  fifoUnit: headers['FIFOStokBirimMaliyeti'],
};

const states = new Map();
const diagnostics = [];

for (let row = headerRow + 1; row <= range.e.r + 1; row += 1) {
  const material = getValue(row, col.material);
  if (!material) continue;

  if (!states.has(material)) {
    states.set(material, { lots: [], negativeDebt: 0, lastUnit: 0 });
  }
  const state = states.get(material);
  const inQty = Number(getValue(row, col.inQty) || 0);
  const outQty = Number(getValue(row, col.outQty) || 0);
  const price = Number(getValue(row, col.price) || 0);

  const beforeOutCost = Number(getValue(row, col.fifoOutCost) || 0);
  let fifoOutCost = 0;

  if (inQty > 0) {
    let remainingIn = inQty;
    state.lastUnit = price;
    if (state.negativeDebt > 0) {
      const covered = Math.min(remainingIn, state.negativeDebt);
      state.negativeDebt -= covered;
      remainingIn -= covered;
    }
    if (remainingIn > 0) state.lots.push({ qty: remainingIn, unit: price });
  }

  if (outQty > 0) {
    let remainingOut = outQty;
    while (remainingOut > 0 && state.lots.length > 0) {
      const lot = state.lots[0];
      const take = Math.min(remainingOut, lot.qty);
      fifoOutCost += take * lot.unit;
      lot.qty -= take;
      remainingOut -= take;
      state.lastUnit = lot.unit;
      if (lot.qty <= 0.0000001) state.lots.shift();
    }
    if (remainingOut > 0) {
      fifoOutCost += remainingOut * state.lastUnit;
      state.negativeDebt += remainingOut;
    }
  }

  let fifoOpenQty = state.lots.reduce((sum, lot) => sum + lot.qty, 0);
  let fifoOpenValue = state.lots.reduce((sum, lot) => sum + lot.qty * lot.unit, 0);
  if (state.negativeDebt > 0) {
    fifoOpenQty -= state.negativeDebt;
    fifoOpenValue -= state.negativeDebt * state.lastUnit;
  }
  const fifoOpenUnit = fifoOpenQty === 0 ? 0 : fifoOpenValue / fifoOpenQty;

  const rowRef = row;
  const robustFifoFormula =
    `IF($I${rowRef}=0,0,SUMPRODUCT(($B$6:$B${rowRef}=$B${rowRef})*($H$6:$H${rowRef}>0)*$G$6:$G${rowRef}*` +
    `((($P$6:$P${rowRef}<$R${rowRef})*$P$6:$P${rowRef}+($P$6:$P${rowRef}>=$R${rowRef})*$R${rowRef})-` +
    `(($O$6:$O${rowRef}>$Q${rowRef})*$O$6:$O${rowRef}+($O$6:$O${rowRef}<=$Q${rowRef})*$Q${rowRef}))*` +
    `--(((($P$6:$P${rowRef}<$R${rowRef})*$P$6:$P${rowRef}+($P$6:$P${rowRef}>=$R${rowRef})*$R${rowRef})-` +
    `(($O$6:$O${rowRef}>$Q${rowRef})*$O$6:$O${rowRef}+($O$6:$O${rowRef}<=$Q${rowRef})*$Q${rowRef}))>0)))`;

  setNumber(row, col.fifoOutCost, round(fifoOutCost), robustFifoFormula);
  setNumber(row, col.fifoQty, round(fifoOpenQty), `IF($B${rowRef}=$B${rowRef - 1},$X${rowRef - 1},0)+$H${rowRef}-$I${rowRef}`);
  setNumber(row, col.fifoValue, round(fifoOpenValue), `IF($B${rowRef}=$B${rowRef - 1},$Y${rowRef - 1},0)+$H${rowRef}*$G${rowRef}-$W${rowRef}`);
  setNumber(row, col.fifoUnit, round(fifoOpenUnit), `IF($X${rowRef}=0,0,$Y${rowRef}/$X${rowRef})`);

  if (Math.abs(beforeOutCost - fifoOutCost) > 0.0001) {
    diagnostics.push({
      row,
      oldFifoOutCost: beforeOutCost,
      fixedFifoOutCost: round(fifoOutCost),
      fixedFifoQty: round(fifoOpenQty),
      fixedFifoValue: round(fifoOpenValue),
    });
  }
}

XLSX.writeFile(wb, outputPath, { bookType: 'xlsx', compression: true, cellStyles: true });

console.log(JSON.stringify({ outputPath, diagnostics }, null, 2));
