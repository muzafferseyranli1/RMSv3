import pg from 'pg';
const { Client } = pg;

const connectionString = 'postgresql://postgres:MJCMYcrORctRbKRtxDTwXjReEcxwNVoe@shortline.proxy.rlwy.net:59800/railway';

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
      const nodes = [];
      function walk(node) {
        if (!node) return;
        nodes.push({ id: node.id, name: node.name, type: node.type });
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
      
      console.log("All unique types in tree:", [...new Set(nodes.map(n => n.type))]);
      console.log("anadepo nodes:", nodes.filter(n => n.type === 'anadepo'));
      console.log("uretim nodes:", nodes.filter(n => n.type === 'uretim'));
    }
  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

main();
