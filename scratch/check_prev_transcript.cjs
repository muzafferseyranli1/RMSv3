const fs = require('fs');
const path = require('path');

const transcriptPath = 'c:/Users/muzaf/.gemini/antigravity/brain/8da2ec39-0aea-459f-a99e-1c983f7b5a4a/.system_generated/logs/transcript.jsonl';

if (!fs.existsSync(transcriptPath)) {
  console.log('Transcript file does not exist at:', transcriptPath);
  process.exit(1);
}

console.log('Reading transcript...');
const content = fs.readFileSync(transcriptPath, 'utf8');
const lines = content.split('\n');
console.log(`Total lines: ${lines.length}`);

let foundCount = 0;
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.includes('test_wms_analytics')) {
    foundCount++;
    console.log(`Line ${i + 1} matches:`);
    try {
      const obj = JSON.parse(line);
      console.log('Type:', obj.type);
      console.log('Tool calls or content excerpt:', JSON.stringify(obj.tool_calls || obj.content || '').substring(0, 1000));
    } catch (e) {
      console.log('Line snippet:', line.substring(0, 300));
    }
    console.log('--------------------------------------------------');
  }
}

console.log(`Search complete. Found matches: ${foundCount}`);
