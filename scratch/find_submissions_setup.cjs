const fs = require('fs');
const path = require('path');
const readline = require('readline');

const appDataDir = 'C:\\Users\\muzaf\\.gemini\\antigravity';
const conversationId = '3d28c413-18bb-4e9b-b9b4-ac40552b062f';
const logFilePath = path.join(appDataDir, 'brain', conversationId, '.system_generated', 'logs', 'transcript.jsonl');

async function findSetup() {
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
      if (obj.tool_calls) {
        for (const tc of obj.tool_calls) {
          if (tc.name === 'write_to_file' || tc.name === 'replace_file_content' || tc.name === 'multi_replace_file_content') {
            const args = tc.args;
            if (args && args.TargetFile && args.TargetFile.includes('FormSubmissions.jsx')) {
              // Print steps that mention SearchableMultiSelect or startFillForm modifications
              const val = JSON.stringify(args);
              if (val.includes('SearchableMultiSelect') || val.includes('startFillForm') || val.includes('db.from')) {
                console.log(`--- STEP ${stepIdx} (${tc.name}) ---`);
                console.log('Description:', args.Description || args.Instruction);
                console.log('Keys:', Object.keys(args));
                if (args.TargetContent) console.log('TargetContent length:', args.TargetContent.length);
                if (args.ReplacementContent) console.log('ReplacementContent length:', args.ReplacementContent.length);
                if (args.CodeContent) console.log('CodeContent length:', args.CodeContent.length);
              }
            }
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }
}

findSetup();
