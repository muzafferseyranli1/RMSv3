const fs = require('fs');
const path = require('path');
const readline = require('readline');

const appDataDir = 'C:\\Users\\muzaf\\.gemini\\antigravity';
const conversationId = '3d28c413-18bb-4e9b-b9b4-ac40552b062f';
const logFilePath = path.join(appDataDir, 'brain', conversationId, '.system_generated', 'logs', 'transcript.jsonl');

async function findEdits() {
  if (!fs.existsSync(logFilePath)) {
    console.error('Log file not found:', logFilePath);
    return;
  }

  const fileStream = fs.createReadStream(logFilePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let stepCount = 0;
  for await (const line of rl) {
    stepCount++;
    try {
      const obj = JSON.parse(line);
      const stepIdx = obj.step_index || stepCount;
      if (stepIdx < 600 && obj.tool_calls) {
        for (const tc of obj.tool_calls) {
          if (tc.name === 'write_to_file' || tc.name === 'replace_file_content' || tc.name === 'multi_replace_file_content') {
            const args = tc.args;
            if (args && args.TargetFile && args.TargetFile.includes('FormSubmissions.jsx')) {
              console.log(`--- STEP ${stepIdx} (${tc.name}) ---`);
              console.log(JSON.stringify(args, null, 2));
            }
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }
}

findEdits();
