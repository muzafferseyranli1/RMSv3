const fs = require('fs');
const path = require('path');
const readline = require('readline');

const appDataDir = 'C:\\Users\\muzaf\\.gemini\\antigravity';
const conversationId = '9b9ee184-ec1c-4bd8-b2f9-f9c1857e73f6';
const logFilePath = path.join(appDataDir, 'brain', conversationId, '.system_generated', 'logs', 'transcript.jsonl');

async function searchLog() {
  if (!fs.existsSync(logFilePath)) {
    console.error('Log file not found at:', logFilePath);
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
      if (obj.tool_calls) {
        for (const tc of obj.tool_calls) {
          if (tc.name === 'write_to_file' || tc.name === 'replace_file_content' || tc.name === 'multi_replace_file_content') {
            const args = tc.args;
            if (args && args.TargetFile && args.TargetFile.includes('FormSubmissions.jsx')) {
              console.log(`Step: ${obj.step_index || stepCount} | Tool: ${tc.name} | Args:`, JSON.stringify(args).slice(0, 500));
            }
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }
}

searchLog();
