const fs = require('fs');
const path = require('path');
const readline = require('readline');

const appDataDir = 'C:\\Users\\muzaf\\.gemini\\antigravity';
const conversationId = '3d28c413-18bb-4e9b-b9b4-ac40552b062f';
const logFilePath = path.join(appDataDir, 'brain', conversationId, '.system_generated', 'logs', 'transcript.jsonl');
const outPath = 'scratch/extracted_edits_utf8.txt';

async function extract() {
  if (!fs.existsSync(logFilePath)) {
    console.error('Log file not found:', logFilePath);
    return;
  }

  const targetSteps = [495, 501, 515, 523, 527, 543];
  const fileStream = fs.createReadStream(logFilePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  let stepCount = 0;
  let outContent = '';
  for await (const line of rl) {
    stepCount++;
    try {
      const obj = JSON.parse(line);
      const stepIdx = obj.step_index || stepCount;
      if (targetSteps.includes(stepIdx)) {
        if (obj.tool_calls) {
          for (const tc of obj.tool_calls) {
            if (tc.name === 'replace_file_content' || tc.name === 'multi_replace_file_content') {
              outContent += `\n=================== STEP ${stepIdx} ===================\n`;
              outContent += `Description: ${tc.args.Description}\n`;
              outContent += `StartLine: ${tc.args.StartLine}\n`;
              outContent += `EndLine: ${tc.args.EndLine}\n`;
              outContent += `TargetContent:\n${tc.args.TargetContent}\n`;
              outContent += `ReplacementContent:\n${tc.args.ReplacementContent}\n`;
            }
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }

  fs.writeFileSync(outPath, outContent, 'utf8');
  console.log('UTF-8 extract file written successfully to:', outPath);
}

extract();
