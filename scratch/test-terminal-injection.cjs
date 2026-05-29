// Verification Test for created_by_terminal Injection (FAZ 7)

// Mock window and sessionStorage for JSOM/browser simulation
global.window = {
  __ELECTRON_TERMINAL_CONFIG__: {
    terminalId: 'term_UUID_123',
    branchId: 'branch_UUID_abc',
    terminalRole: 'master',
    screenMode: 'pos'
  }
};

const terminalIdentity = require('../src/lib/terminalIdentity.js');
const dbModule = require('../src/lib/db.js');

async function test() {
  console.log('--- STARTING TERMINAL INJECTION VERIFICATION TESTS ---');

  // Test 1: isDesktopMode() check
  if (!terminalIdentity.isDesktopMode()) {
    throw new Error('Expected isDesktopMode() to be true under mock, got false');
  }
  const tId = terminalIdentity.getTerminalId();
  if (tId !== 'term_UUID_123') {
    throw new Error(`Expected terminal ID to be term_UUID_123, got: ${tId}`);
  }
  console.log('✓ Test 1 Passed: mock isDesktopMode() and getTerminalId() verified.');

  // Test 2: injectTerminalFields behavior on tracked tables (Object & Array)
  const trackedTables = ['sales', 'sale_lines', 'inventory_movements'];
  for (const table of trackedTables) {
    const singleData = { total: 100 };
    const arrayData = [{ total: 100 }, { total: 200 }];

    const injectedSingle = terminalIdentity.injectTerminalFields(table, singleData);
    const injectedArray = terminalIdentity.injectTerminalFields(table, arrayData);

    if (injectedSingle.created_by_terminal !== 'term_UUID_123') {
      throw new Error(`Expected single data for table ${table} to have terminal ID`);
    }
    if (injectedArray[0].created_by_terminal !== 'term_UUID_123' || injectedArray[1].created_by_terminal !== 'term_UUID_123') {
      throw new Error(`Expected array rows for table ${table} to have terminal ID`);
    }
  }
  console.log('✓ Test 2 Passed: injectTerminalFields successfully enriches sales, sale_lines and inventory_movements (both single and array formats).');

  // Test 3: injectTerminalFields behavior on untracked tables
  const untrackedData = { name: 'Ahmet' };
  const injectedUntracked = terminalIdentity.injectTerminalFields('customers', untrackedData);
  if (injectedUntracked.created_by_terminal !== undefined) {
    throw new Error('Expected untracked tables (e.g. customers) to not be enriched, but it has created_by_terminal');
  }
  console.log('✓ Test 3 Passed: untracked tables are completely skipped by injectTerminalFields.');

  // Test 4: Web mode bypass
  global.window.__ELECTRON_TERMINAL_CONFIG__ = null;
  global.window.__DESKTOP_MODE__ = false;

  const testSalesData = { total: 50 };
  const injectedWeb = terminalIdentity.injectTerminalFields('sales', testSalesData);
  if (injectedWeb.created_by_terminal !== undefined) {
    throw new Error('Expected no injection under web mode (isDesktopMode false)');
  }
  console.log('✓ Test 4 Passed: injectTerminalFields correctly bypasses injection when isDesktopMode() is false.');

  // Restore desktop mode mock for db integration test
  global.window.__ELECTRON_TERMINAL_CONFIG__ = {
    terminalId: 'term_UUID_123',
    branchId: 'branch_UUID_abc',
    terminalRole: 'master',
    screenMode: 'pos'
  };

  // Test 5: db.js integration with QueryBuilder._execute
  // We spy on QueryBuilder._execute's call to routedQueryApi by mock overriding queryApi / routedQueryApi!
  // Wait, db.js is a module, we can mock it, or check how to test it.
  // Actually, we can just instantiate a query builder and check the _execute method!
  const query = dbModule.db.from('sales').insert({ sale_no: 'S-789' });
  
  // Since db.js imports terminalIdentity, let's see if the query payload data has the enjected ID
  // Wait! QueryBuilder insert(data) sets this._data = data. And it is only enjected inside _execute()!
  // Let's call query._execute() and verify the payload!
  // But wait! routedQueryApi makes a fetch or rpc call. If we mock routedQueryApi, we can intercept the body!
  // Let's check: how can we intercept routedQueryApi?
  // routedQueryApi fetches /api/query which will fail. But we can catch the query, or since routedQueryApi is in scope of db.js,
  // we can mock the fetch function globally!
  let lastRequestBody = null;
  global.fetch = async (url, init) => {
    lastRequestBody = JSON.parse(init.body);
    return {
      ok: true,
      json: async () => ({ data: [], error: null })
    };
  };

  await query; // This will trigger _execute() -> routedQueryApi -> requestApi -> fetch!

  if (!lastRequestBody) {
    throw new Error('Expected query to execute fetch and capture request body.');
  }

  console.log('Captured SQL query payload:', JSON.stringify(lastRequestBody));

  if (lastRequestBody.data.created_by_terminal !== 'term_UUID_123') {
    throw new Error(`Expected QueryBuilder insert payload to have created_by_terminal, got: ${JSON.stringify(lastRequestBody.data)}`);
  }
  console.log('✓ Test 5 Passed: QueryBuilder insert automatically injects terminal fields into SQL query payload on desktop.');

  console.log('\n--- ALL TERMINAL INJECTION VERIFICATION TESTS PASSED SUCCESSFULLY! ---');
  process.exit(0);
}

test().catch(e => {
  console.error('\n❌ TERMINAL INJECTION VERIFICATION TESTS FAILED:');
  console.error(e);
  process.exit(1);
});
