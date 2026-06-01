import fs from 'node:fs/promises';
import QRCode from 'qrcode';
const branchId = '4e488f4b-669d-4279-8f0d-0fd382fe1d87';
const records = [
  { tableName: 'Masa 1', tableNumber: '1', hallName: '1 kat salon', sectionName: 'balkon', token: '1da67b9c7ae642a1a22cbc0a20bb046c' },
  { tableName: 'masa 2', tableNumber: '2', hallName: '1 kat salon', sectionName: 'balkon', token: 'b7403f368e39485d856015e84f17f391' },
  { tableName: 'masa 3', tableNumber: '3', hallName: '1 kat salon', sectionName: 'balkon', token: 'ULW25KU9' },
  { tableName: 'masa 4', tableNumber: '4', hallName: '1 kat salon', sectionName: 'balkon', token: 'JAFRLX28' },
];
for (const record of records) {
  record.payload = `http://localhost:5173/mobil-app/qr-menu?b=${encodeURIComponent(branchId)}&t=${encodeURIComponent(record.token)}`;
  record.svg = await QRCode.toString(record.payload, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' });
}
const esc = (s) => String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const cards = records.map(r => `
      <article class="card">
        <div class="qr">${r.svg}</div>
        <div class="info">
          <div class="name">${esc(r.tableName)}</div>
          <div class="where">${esc(r.hallName)} / ${esc(r.sectionName)}</div>
          <div class="number">Masa No: ${esc(r.tableNumber)}</div>
        </div>
      </article>`).join('\n');
const html = `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Salon QR Kodlari</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111827; background: #f4f6fa; }
    .page { width: min(1180px, calc(100% - 32px)); margin: 28px auto; background: #fff; border: 1px solid #dbe3ef; border-radius: 18px; padding: 28px; box-shadow: 0 18px 50px rgba(15, 23, 42, 0.10); }
    .toolbar { display: flex; justify-content: space-between; align-items: center; gap: 18px; padding-bottom: 20px; margin-bottom: 22px; border-bottom: 1px solid #dbe3ef; }
    h1 { margin: 0; font-size: 28px; line-height: 1.1; }
    .sub { margin-top: 7px; color: #64748b; font-size: 14px; font-weight: 700; }
    button { height: 42px; border: 0; border-radius: 10px; padding: 0 18px; background: #f59e0b; color: #fff; font-size: 14px; font-weight: 900; cursor: pointer; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
    .card { min-height: 235px; border: 1px solid #dbe3ef; border-radius: 14px; padding: 22px; display: grid; grid-template-columns: 200px 1fr; gap: 24px; align-items: center; background: #fff; break-inside: avoid; }
    .qr { width: 200px; height: 200px; display: grid; place-items: center; background: #fff; }
    .qr svg { width: 200px; height: 200px; display: block; }
    .name { font-size: 30px; font-weight: 900; line-height: 1.05; }
    .where { margin-top: 9px; font-size: 15px; color: #64748b; font-weight: 700; }
    .number { margin-top: 7px; font-size: 17px; font-weight: 900; }
    @media (max-width: 760px) { .toolbar { align-items: flex-start; flex-direction: column; } .grid { grid-template-columns: 1fr; } .card { grid-template-columns: 150px 1fr; } .qr, .qr svg { width: 150px; height: 150px; } }
    @media print {
      @page { size: A4 portrait; margin: 8mm; }
      body { background: #fff; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .page { width: 100%; margin: 0; padding: 0; border: 0; border-radius: 0; box-shadow: none; }
      .toolbar { display: none; }
      .grid { grid-template-columns: repeat(2, 96mm); gap: 6mm; align-items: start; }
      .card { width: 96mm; min-height: 132mm; padding: 7mm; border: 1px solid #111827; border-radius: 0; display: block; page-break-inside: avoid; break-inside: avoid; }
      .qr { width: 80mm; height: 80mm; margin: 0 auto 7mm; }
      .qr svg { width: 80mm; height: 80mm; }
      .name { font-size: 24pt; text-align: center; }
      .where, .number { text-align: center; }
    }
  </style>
</head>
<body>
  <main class="page">
    <header class="toolbar">
      <div>
        <h1>Salon QR Kodlari</h1>
        <div class="sub">Sube: Kadikoy Sube / Salon: 1 kat salon / Bolge: balkon</div>
      </div>
      <button type="button" onclick="window.print()">Yazdir</button>
    </header>
    <section class="grid">${cards}
    </section>
  </main>
</body>
</html>
`;
await fs.writeFile('standalone-table-qrs.html', html, 'utf8');
