import fs from 'fs';
import path from 'path';

const files = [
  'src/components/loyalty/LoyaltyCampaignWizard.jsx',
  'src/components/pages/ComboMenu.jsx',
  'src/components/pages/Contracts.jsx',
  'src/components/pages/InventoryMovements.jsx',
  'src/components/pages/Options.jsx',
  'src/components/pages/OrderFlows.jsx',
  'src/components/pages/PeriodClose.jsx',
  'src/components/pages/Prices.jsx',
  'src/components/pages/SaleItems.jsx',
  'src/components/pages/SemiProducts.jsx',
  'src/components/pages/StockItems.jsx',
  'src/components/pages/Templates.jsx',
  'src/features/catalog/utils/catalogHelpers.js',
  'src/lib/branchPurchasing.js',
  'src/lib/countFlowUtils.js',
  'src/lib/demoSalesGenerator.js',
  'src/lib/personnelConfig.js'
];

for (const f of files) {
  const filePath = path.resolve(f);
  if (!fs.existsSync(filePath)) {
    console.log(`Skipping non-existent file: ${f}`);
    continue;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  const original = content;

  // Let's do replacements
  content = content.replace(/(x\.type|node\.type|node\?\.type)\s*===\s*['"]mutfak['"]/g, (match, prefix) => {
    return `${match} || ${prefix} === 'uretim'`;
  });

  // Special checks without prefix in walk functions:
  // e.g. "x.type==='sube' || x.type==='anadepo' || x.type==='mutfak'"
  content = content.replace(/x\.type\s*===\s*['"]mutfak['"]/g, "x.type === 'mutfak' || x.type === 'uretim'");
  content = content.replace(/x\.type===\s*['"]mutfak['"]/g, "x.type === 'mutfak' || x.type === 'uretim'");
  
  // Special check in StockItems.jsx:
  content = content.replace(/x\.type\s*===\s*['"]mutfak['"]\s*\?\s*['"]merkezmutfak['"]\s*:\s*null/g,
    "(x.type === 'mutfak' || x.type === 'uretim') ? 'merkezmutfak' : null");

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated file: ${f}`);
  }
}
