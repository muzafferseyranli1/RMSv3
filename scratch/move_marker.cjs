const fs = require('fs');

const filePath = 'X:/RMSv3/OperationSync.md';
const markerText = '[SUPPORT_SYNC_MARKER] - Baseline established after initial documentation setup.';

try {
  let lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

  // Remove the marker if it exists anywhere
  lines = lines.filter(line => line.trim() !== markerText);

  // Find the index of "## Entry 211" which corresponds to the first entry after 12:00 on 12.06.2026
  let targetIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('## Entry 211 - 2026-06-12')) {
      targetIndex = i;
      break;
    }
  }

  if (targetIndex !== -1) {
    // Insert the marker before Entry 211
    lines.splice(targetIndex, 0, markerText, '');
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    console.log('Marker successfully moved before Entry 211.');
  } else {
    console.log('Entry 211 not found!');
  }
} catch (e) {
  console.error('Error:', e);
}

