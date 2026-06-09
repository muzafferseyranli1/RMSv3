import fs from 'fs';
import path from 'path';

// Conversation ID and Gemini brain directories
const conversationId = '752c9610-6e1e-4be4-9116-0e94f7ace3af';
const appDataDir = 'C:\\Users\\muzaf\\.gemini\\antigravity';
const brainDir = path.join(appDataDir, 'brain', conversationId);

const filesToSync = [
  'implementation_plan.md',
  'task.md',
  'walkthrough.md'
];

async function main() {
  const workspaceDocsDir = path.resolve('docs');
  if (!fs.existsSync(workspaceDocsDir)) {
    fs.mkdirSync(workspaceDocsDir, { recursive: true });
  }

  console.log(`Syncing files from brain directory: ${brainDir}`);
  console.log(`To workspace docs directory: ${workspaceDocsDir}`);

  for (const filename of filesToSync) {
    const srcPath = path.join(brainDir, filename);
    const destPath = path.join(workspaceDocsDir, filename);

    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`✅ Synced: ${filename}`);
    } else {
      console.log(`⚠️ Source file not found: ${srcPath}`);
    }
  }
}

main();
