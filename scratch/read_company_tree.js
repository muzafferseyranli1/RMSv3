import pg from 'pg';
const { Client } = pg;
import fs from 'fs';
import path from 'path';

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

async function main() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    const res = await client.query("SELECT value FROM public.settings WHERE key = 'company_tree';");
    if (res.rows.length === 0) {
      console.log("No company_tree setting found.");
    } else {
      const tree = res.rows[0].value;
      
      // Let's search for nodes of type uretim, mutfak, or name containing Mutfak
      const results = [];
      function walk(node) {
        if (!node) return;
        if (node.type === 'mutfak' || node.type === 'uretim' || String(node.name).toLowerCase().includes('mutfak')) {
          results.push({ id: node.id, name: node.name, type: node.type, workspace_scope: node.workspace_scope });
        }
        if (node.children) {
          for (const child of node.children) {
            walk(child);
          }
        }
      }
      
      if (Array.isArray(tree)) {
        tree.forEach(walk);
      } else {
        walk(tree);
      }
      
      console.log("Nodes containing Mutfak or with type mutfak/uretim:");
      console.log(JSON.stringify(results, null, 2));
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
