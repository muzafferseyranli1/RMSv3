import pg from 'pg';
const { Client } = pg;
import fs from 'fs';
import path from 'path';
import { loadBranchContextsFromDb } from '../src/lib/branchContexts.js';

let connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  try {
    const envPath = path.resolve('server/.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const match = envContent.match(/DATABASE_URL=(.*)/);
      if (match) {
        connectionString = match[1].trim();
      }
    }
  } catch (err) {
    console.error("Failed to read server/.env:", err.message);
  }
}

if (!connectionString) {
  connectionString = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';
}

global.window = {
  localStorage: {
    getItem: () => null,
    setItem: () => null
  }
};

async function main() {
  const contexts = await loadBranchContextsFromDb();
  console.log("Total Contexts Loaded:", contexts.length);
  const mutfakContexts = contexts.filter(c => c.branchName.includes('Mutfak') || c.workspaceScope === 'merkezmutfak');
  console.log("Mutfak Contexts in loaded branches:", JSON.stringify(mutfakContexts, null, 2));
}

main();
