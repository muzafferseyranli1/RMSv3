const { Client } = require('pg');

const connectionString = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';

async function checkTreeSearch() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Connected to DB.');
    
    const res = await client.query("SELECT value FROM public.settings WHERE key = 'company_tree';");
    const tree = res.rows[0].value;
    
    function findNodeInArray(arr, id) {
      for (const node of arr) {
        if (node.id === id) return node;
        if (node.children) {
          const found = findNodeInArray(node.children, id);
          if (found) return found;
        }
      }
      return null;
    }
    
    const targetNode = findNodeInArray(tree, '4e488f4b-669d-4279-8f0d-0fd382fe1d87');
    console.log('Found Node in Tree:', targetNode);
  } catch (err) {
    console.error('Error querying DB:', err);
  } finally {
    await client.end();
  }
}

checkTreeSearch();
