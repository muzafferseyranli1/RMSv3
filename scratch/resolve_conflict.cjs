const fs = require('fs');
const path = require('path');

const filePath = path.join('X:', 'RMSv3', 'OperationSync.md');
let content = fs.readFileSync(filePath, 'utf8');

// We search for conflict markers:
// <<<<<<< Updated upstream
// [upstream content]
// =======
// [stashed content]
// >>>>>>> Stashed changes

const startMarker = '<<<<<<< Updated upstream';
const midMarker = '=======';
const endMarker = '>>>>>>> Stashed changes';

const startIndex = content.indexOf(startMarker);
const midIndex = content.indexOf(midMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex !== -1 && midIndex !== -1 && endIndex !== -1) {
  const upstreamContent = content.substring(startIndex + startMarker.length, midIndex).trim();
  const stashedContent = content.substring(midIndex + midMarker.length, endIndex).trim();

  // Combine them cleanly
  const resolvedSection = upstreamContent + '\n\n' + stashedContent;

  const newContent = content.substring(0, startIndex) + resolvedSection + '\n' + content.substring(endIndex + endMarker.length);
  fs.writeFileSync(filePath, newContent, 'utf8');
  console.log('Conflict resolved successfully.');
} else {
  console.error('Could not find conflict markers.');
}
