const fs = require('fs');
const path = require('path');

const files = [
  path.join(__dirname, '../migrations/050_wms_barcode_and_package_sync.sql'),
  path.join(__dirname, '../schema-railway-master.sql'),
  path.join(__dirname, '../src/components/pages/StockItems.jsx'),
  path.join(__dirname, '../scratch/test_wms_barcode_package_units.cjs')
];

for (const file of files) {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    const cleaned = content.split(/\r?\n/).map(line => line.trimEnd()).join('\n');
    fs.writeFileSync(file, cleaned, 'utf8');
    console.log(`Cleaned trailing whitespace in: ${file}`);
  } else {
    console.warn(`File not found: ${file}`);
  }
}
