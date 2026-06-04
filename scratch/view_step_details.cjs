const fs = require('fs');
const path = require('path');
const readline = require('readline');

const appDataDir = 'C:\\Users\\muzaf\\.gemini\\antigravity';
const conversationId = '3d28c413-18bb-4e9b-b9b4-ac40552b062f';
const logFilePath = path.join(appDataDir, 'brain', conversationId, '.system_generated', 'logs', 'transcript.jsonl');
const outPath = 'scratch/full_replacements_utf8.txt';

async function run() {
  const fileStream = fs.createReadStream(logFilePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let stepCount = 0;
  const steps = {};
  for await (const line of rl) {
    stepCount++;
    try {
      const obj = JSON.parse(line);
      const stepIdx = obj.step_index || stepCount;
      if (stepIdx === 495 || stepIdx === 515) {
        if (obj.tool_calls) {
          for (const tc of obj.tool_calls) {
            steps[stepIdx] = tc.args.ReplacementContent;
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }

  // Write multi-line text by decoding JSON strings
  let out = `=== STEP 495 ===\n${steps[495] || ''}\n\n=== STEP 515 ===\n${steps[515] || ''}\n`;
  
  // Clean up escapes so it displays as standard multiline text
  try {
    const raw495 = JSON.parse('"' + steps[495].replace(/"/g, '\\"') + '"');
    const raw515 = JSON.parse('"' + steps[515].replace(/"/g, '\\"') + '"');
    out = `=== STEP 495 ===\n${raw495}\n\n=== STEP 515 ===\n${raw515}\n`;
  } catch (e) {
    // fallback to unescaping manually
    out = `=== STEP 495 ===\n${(steps[495] || '').replace(/\\n/g, '\n').replace(/\\"/g, '"')}\n\n=== STEP 515 ===\n${(steps[515] || '').replace(/\\n/g, '\n').replace(/\\"/g, '"')}\n`;
  }

  fs.writeFileSync(outPath, out, 'utf8');
  console.log('UTF-8 setup details written successfully as multiline text.');
}

run();
