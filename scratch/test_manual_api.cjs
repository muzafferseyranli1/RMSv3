const http = require('http');

const API_URL = 'http://localhost:3001';

// Helper function to make HTTP requests
function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_URL);
    const options = {
      method: method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', (err) => { reject(err); });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('Starting Phase 2 API verification tests...');
  let testCategoryId = null;
  let testPageId = null;
  let equipmentId = null;

  try {
    // 1. Get initial categories
    console.log('\n--- 1. Testing GET /api/manual/categories ---');
    const getCats = await request('GET', '/api/manual/categories');
    console.log('Status:', getCats.status);
    console.log('Categories count:', getCats.body?.data?.length);
    if (getCats.body?.data?.length > 0) {
      console.log('Seeded Categories:', getCats.body.data.map(c => c.name));
    }

    // 2. Create category
    console.log('\n--- 2. Testing POST /api/manual/categories ---');
    const newCat = {
      name: 'Test Mutfak Güvenliği',
      description: 'Lokal test için oluşturulan mutfak güvenliği kategorisi.',
      display_order: 5
    };
    const createCat = await request('POST', '/api/manual/categories', newCat);
    console.log('Status:', createCat.status);
    console.log('Created Category:', createCat.body?.data);
    if (createCat.body?.data?.id) {
      testCategoryId = createCat.body.data.id;
    } else {
      throw new Error('Failed to create test category');
    }

    // 3. Get single category
    console.log('\n--- 3. Testing GET /api/manual/categories/:id ---');
    const getCat = await request('GET', `/api/manual/categories/${testCategoryId}`);
    console.log('Status:', getCat.status);
    console.log('Fetched Category:', getCat.body?.data);

    // 4. Update category
    console.log('\n--- 4. Testing PUT /api/manual/categories/:id ---');
    const updatedCat = {
      name: 'Test Mutfak Güvenliği V2',
      description: 'Açıklama güncellendi.',
      display_order: 6
    };
    const updateCat = await request('PUT', `/api/manual/categories/${testCategoryId}`, updatedCat);
    console.log('Status:', updateCat.status);
    console.log('Updated Category:', updateCat.body?.data);

    // 5. Fetch equipment definitions to use for page linking
    console.log('\n--- 5. Testing GET /api/manual/equipments ---');
    const getEquips = await request('GET', '/api/manual/equipments');
    console.log('Status:', getEquips.status);
    console.log('Equipments count:', getEquips.body?.data?.length);
    if (getEquips.body?.data?.length > 0) {
      equipmentId = getEquips.body.data[0].id;
      console.log(`Using equipment: ${getEquips.body.data[0].name} (ID: ${equipmentId})`);
    } else {
      throw new Error('No equipment definitions found in DB');
    }

    // 6. Create page with equipment linking
    console.log('\n--- 6. Testing POST /api/manual/pages ---');
    const newPage = {
      category_id: testCategoryId,
      title: 'Fritöz Temizlik Prosedürü',
      content: '# Fritöz Temizliği\n1. Cihazı kapatın.\n2. Yağı boşaltın.',
      last_updated_by_pin: '1234',
      equipment_ids: [equipmentId]
    };
    const createPage = await request('POST', '/api/manual/pages', newPage);
    console.log('Status:', createPage.status);
    console.log('Created Page:', createPage.body?.data);
    if (createPage.body?.data?.id) {
      testPageId = createPage.body.data.id;
    } else {
      throw new Error('Failed to create page');
    }

    // 7. Get all pages
    console.log('\n--- 7. Testing GET /api/manual/pages ---');
    const getPages = await request('GET', '/api/manual/pages');
    console.log('Status:', getPages.status);
    console.log('Pages count:', getPages.body?.data?.length);

    // 8. Get single page with relations (JOIN test)
    console.log('\n--- 8. Testing GET /api/manual/pages/:id (JOIN Query) ---');
    const getPageDetails = await request('GET', `/api/manual/pages/${testPageId}`);
    console.log('Status:', getPageDetails.status);
    console.log('Page Details:', getPageDetails.body?.data);
    console.log('Joined Equipments:', getPageDetails.body?.data?.equipments);
    if (!getPageDetails.body?.data?.equipments || getPageDetails.body.data.equipments.length === 0) {
      throw new Error('Linked equipment was not fetched via JOIN');
    }

    // 9. Update page (automatic version increment & transaction update)
    console.log('\n--- 9. Testing PUT /api/manual/pages/:id (Versioning & Transaction) ---');
    const updatedPage = {
      category_id: testCategoryId,
      title: 'Fritöz Temizlik ve Bakım Prosedürü',
      content: '# Fritöz Temizliği\n1. Kapatın.\n2. Temizleyin.\n3. Yağı süzün.',
      last_updated_by_pin: '5678',
      equipment_ids: [equipmentId] // Keep or update
    };
    const updatePage = await request('PUT', `/api/manual/pages/${testPageId}`, updatedPage);
    console.log('Status:', updatePage.status);
    console.log('Updated Page:', updatePage.body?.data);
    if (updatePage.body?.data?.version !== 2) {
      throw new Error(`Expected page version to be 2, got ${updatePage.body?.data?.version}`);
    }
    console.log('Version incremented successfully to:', updatePage.body?.data?.version);

    // 10. Clean up - Delete page
    console.log('\n--- 10. Cleaning up: DELETE /api/manual/pages/:id ---');
    const delPage = await request('DELETE', `/api/manual/pages/${testPageId}`);
    console.log('Status:', delPage.status);
    console.log('Deleted Page:', delPage.body?.data);

    // 11. Clean up - Delete category
    console.log('\n--- 11. Cleaning up: DELETE /api/manual/categories/:id ---');
    const delCat = await request('DELETE', `/api/manual/categories/${testCategoryId}`);
    console.log('Status:', delCat.status);
    console.log('Deleted Category:', delCat.body?.data);

    console.log('\n=========================================');
    console.log('ALL PHASE 2 API TESTS PASSED SUCCESSFULLY!');
    console.log('=========================================');
  } catch (err) {
    console.error('\nTest failed with error:', err.message);
    process.exit(1);
  }
}

// Check if server is running, if not ask to start it
const req = http.get(API_URL + '/api/manual/categories', (res) => {
  res.on('data', () => {});
  res.on('end', () => {
    runTests();
  });
});

req.on('error', (err) => {
  console.error(`Cannot connect to local API server at ${API_URL}. Please start the API server first using 'npm run dev' or 'node server/index.js'.`);
  process.exit(1);
});
