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

// Mock the db object from src/lib/db.js to query the database
const db = {
  from: (table) => ({
    select: (selectStr) => ({
      order: (col) => ({
        order: (col2) => ({
          then: async (resolve) => {
            const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
            await client.connect();
            try {
              const res = await client.query(`SELECT ${selectStr} FROM public.${table} ORDER BY ${col}, ${col2}`);
              resolve({ data: res.rows, error: null });
            } catch (err) {
              resolve({ data: null, error: err });
            } finally {
              await client.end();
            }
          }
        })
      }),
      eq: (col, val) => ({
        single: () => ({
          then: async (resolve) => {
            const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
            await client.connect();
            try {
              const res = await client.query(`SELECT ${selectStr} FROM public.${table} WHERE ${col} = $1 LIMIT 1`, [val]);
              resolve({ data: res.rows[0], error: null });
            } catch (err) {
              resolve({ data: null, error: err });
            } finally {
              await client.end();
            }
          }
        })
      })
    })
  })
};

function parseJsonValue(value, fallback = []) {
  if (value == null) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

function buildBranchContextsFromCompanyTree(treeValue) {
  const tree = parseJsonValue(treeValue, []);
  const result = [];

  function walk(nodes, ctx = {}) {
    for (const node of Array.isArray(nodes) ? nodes : [nodes]) {
      if (!node || typeof node !== 'object') continue;

      const nextCtx = { ...ctx };
      if (node.type === 'sirket') nextCtx.company = { id: node.id, name: node.name };
      if (node.type === 'tuzel') nextCtx.legalEntity = { id: node.id, name: node.name };
      if (node.type === 'org') nextCtx.orgUnit = { id: node.id, name: node.name };

      if ((node.type === 'sube' || node.type === 'anadepo' || node.type === 'mutfak') && node.id && node.name) {
        result.push({
          branchId: String(node.id),
          branchName: String(node.name),
          companyId: nextCtx.company?.id ? String(nextCtx.company.id) : null,
          companyName: nextCtx.company?.name || null,
          legalEntityId: nextCtx.legalEntity?.id ? String(nextCtx.legalEntity.id) : null,
          legalEntityName: nextCtx.legalEntity?.name || null,
          orgUnitId: nextCtx.orgUnit?.id ? String(nextCtx.orgUnit.id) : null,
          orgUnitName: nextCtx.orgUnit?.name || null,
          workspaceScope: node.workspace_scope || (node.type === 'anadepo' ? 'anadepo' : (node.type === 'mutfak' ? 'merkezmutfak' : null)),
        });
      }

      walk(node.children || [], nextCtx);
    }
  }

  walk(tree, {});
  return result.sort((left, right) => String(left.branchName || '').localeCompare(String(right.branchName || ''), 'tr'));
}

async function loadBranchContextsFromDb() {
  const { data: settingsRow, error: settingsError } = await db
    .from('settings')
    .select('value')
    .eq('key', 'company_tree')
    .single();

  const fallbackContexts = buildBranchContextsFromCompanyTree(settingsRow?.value);
  return fallbackContexts;
}

async function main() {
  const contexts = await loadBranchContextsFromDb();
  console.log("Total Contexts Loaded:", contexts.length);
  const mutfakContexts = contexts.filter(c => c.branchName.includes('Mutfak') || c.workspaceScope === 'merkezmutfak');
  console.log("Mutfak Contexts in loaded branches:", JSON.stringify(mutfakContexts, null, 2));
}

main();
