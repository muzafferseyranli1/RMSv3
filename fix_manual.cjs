const fs = require('fs');
let c = fs.readFileSync('src/components/pages/ManualManagement.jsx', 'utf8');

// The broken line has the condition merged with the card div
// Find and replace
const badPattern = "categories.find(c => c.id === activeTab              <div className=\"card\" style={{ padding: 20 }}>";
const goodReplacement = "categories.find(c => c.id === activeTab)?.name === 'Ürünler' && (editingPage || pageForm.title || pageForm.linked_item_id) ? (\n            <div className=\"card\" style={{ padding: 20 }}>";

if (c.includes(badPattern)) {
  c = c.replace(badPattern, goodReplacement);
  fs.writeFileSync('src/components/pages/ManualManagement.jsx', c, 'utf8');
  console.log('Fixed! Lines:', c.split('\n').length);
} else {
  // Try to find what's actually there
  const idx = c.indexOf('activeTab              ');
  if (idx >= 0) {
    console.log('Found at:', idx, 'Context:', JSON.stringify(c.substring(idx - 20, idx + 100)));
  } else {
    console.log('Pattern not found. Manual check needed.');
    // Show lines 390-395
    const lines = c.split('\n');
    lines.slice(389, 398).forEach((l, i) => console.log((390 + i) + ':', l));
  }
}
