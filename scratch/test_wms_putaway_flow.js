import pkg from 'pg';
const { Client } = pkg;

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is missing. Please define it in environment variables.");
  process.exit(1);
}

async function runTest() {
  const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("Connected to DB successfully.");

    await client.query("BEGIN;");
    console.log("Started transaction.");

    // 1. Şube ve Depo düğümlerini seç
    const branchRes = await client.query("SELECT id, name FROM public.company_nodes LIMIT 1;");
    if (branchRes.rows.length === 0) {
      console.log("Test atlanıyor: company_nodes tablosunda kayıt bulunamadı.");
      await client.query("ROLLBACK;");
      await client.end();
      return;
    }
    const branch = branchRes.rows[0];
    console.log(`Seçilen Şube/Düğüm: ${branch.name} (${branch.id})`);

    // 2. Bir stock_item seç
    const itemRes = await client.query("SELECT id, name, sku, unit FROM public.stock_items WHERE deleted_at IS NULL LIMIT 1;");
    if (itemRes.rows.length === 0) {
      console.log("Test atlanıyor: stock_items tablosunda kayıt bulunamadı.");
      await client.query("ROLLBACK;");
      await client.end();
      return;
    }
    const item = itemRes.rows[0];
    console.log(`Seçilen Ürün: ${item.name} (${item.id})`);

    // 3. Lokasyonları oluştur/seç (Karantina/Kabul alanı ve Hedef lokasyon)
    const kabulLocRes = await client.query(
      `INSERT INTO public.warehouse_locations (branch_id, zone_code, aisle, rack, level, bin, is_active)
       VALUES ($1, 'Receiving', 'Kabul', '1', '1', '1', true)
       RETURNING id;`,
      [branch.id]
    );
    const kabulLocId = kabulLocRes.rows[0].id;

    const hedefLocRes = await client.query(
      `INSERT INTO public.warehouse_locations (branch_id, zone_code, aisle, rack, level, bin, is_active)
       VALUES ($1, 'Zone A', 'Raf', 'A', '2', 'B', true)
       RETURNING id;`,
      [branch.id]
    );
    const hedefLocId = hedefLocRes.rows[0].id;

    console.log(`Oluşturulan Kabul Lokasyonu: ${kabulLocId}`);
    console.log(`Oluşturulan Hedef Lokasyonu: ${hedefLocId}`);

    // DB-First: stock_item_warehouse_settings tablosuna bu ürün ve şube için varsayılan hedef lokasyonu tanımlayalım
    await client.query(
      `INSERT INTO public.stock_item_warehouse_settings (stock_item_id, branch_id, default_location_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (stock_item_id, branch_id) DO UPDATE SET default_location_id = $3;`,
      [item.id, branch.id, hedefLocId]
    );
    console.log(`Varsayılan hedef lokasyon settings tablosuna tanımlandı.`);

    // 4. Mal kabul hareketi oluştur (availability_status = 'putaway_pending')
    const sourceMovRes = await client.query(
      `INSERT INTO public.inventory_movements (
        company_id, branch_id, branch_name, item_type, stock_item_id, item_name, item_sku, unit,
        movement_type, source_doc_type, direction, movement_at, quantity,
        unit_cost, total_cost, currency_code, location_id, meta
      ) VALUES (
        $1, $1, $2, 'stock_item', $3, $4, $5, $6,
        'purchase_receipt', 'purchase_receipt', 'in', now(), 10,
        15.0, 150.0, 'TRY', $7, $8
      ) RETURNING id;`,
      [
        branch.id, branch.name, item.id, item.name, item.sku, item.unit,
        kabulLocId,
        JSON.stringify({ availability_status: 'putaway_pending' })
      ]
    );
    const sourceMovementId = sourceMovRes.rows[0].id;
    console.log(`Oluşturulan Mal Kabul Hareketi ID: ${sourceMovementId}`);

    // 5. DB-First & Fail-Closed: Trigger tarafından otomatik oluşturulan Putaway Görevini bul
    console.log("Trigger tarafından oluşturulan putaway görevi sorgulanıyor...");
    const taskRes = await client.query(
      `SELECT id, meta, description FROM public.warehouse_tasks 
       WHERE branch_id = $1 AND task_type = 'putaway' AND (meta->>'source_movement_id')::UUID = $2;`,
      [branch.id, sourceMovementId]
    );

    if (taskRes.rows.length === 0) {
      throw new Error("Hata: inventory_movements insert edildikten sonra otomatik putaway görevi trigger tarafından oluşturulamadı.");
    }

    const taskId = taskRes.rows[0].id;
    console.log(`✔ Doğrulama Başarılı: Putaway görevi veritabanı trigger'ı tarafından otomatik oluşturuldu.`);
    console.log(`Otomatik Oluşturulan Putaway Görevi ID: ${taskId}`);
    console.log(`Görev Açıklaması: ${taskRes.rows[0].description}`);

    // 6. RPC'yi çalıştırarak putaway görevini tamamla
    console.log("complete_warehouse_putaway_task RPC çağrılıyor...");
    const rpcRes = await client.query(
      `SELECT public.complete_warehouse_putaway_task($1, $2, $3) AS result;`,
      [taskId, 'test-personnel-id', hedefLocId]
    );
    const result = rpcRes.rows[0].result;
    console.log("RPC Sonucu:", result);

    // 7. Doğrulamalar
    // A) Görevin done olduğunu doğrula
    const checkTaskRes = await client.query("SELECT status, completed_at, meta FROM public.warehouse_tasks WHERE id = $1;", [taskId]);
    const task = checkTaskRes.rows[0];
    if (task.status !== 'done') {
      throw new Error(`Hata: Görev durumu 'done' olmalıydı fakat '${task.status}'`);
    }
    console.log("✔ Doğrulama Başarılı: Görev durumu 'done'.");

    // B) Event tablosunu kontrol et
    const checkEventRes = await client.query("SELECT event_type, from_status, to_status FROM public.warehouse_task_events WHERE task_id = $1;", [taskId]);
    if (checkEventRes.rows.length === 0) {
      throw new Error("Hata: Olay kaydı (event) oluşturulmadı.");
    }
    const event = checkEventRes.rows[0];
    if (event.event_type !== 'completed') {
      throw new Error(`Hata: Olay tipi 'completed' olmalıydı fakat '${event.event_type}'`);
    }
    console.log("✔ Doğrulama Başarılı: Olay kaydı (completed) mevcut.");

    // C) Stok hareketlerini kontrol et (transfer_out ve transfer_in)
    const checkMovementsRes = await client.query(
      `SELECT id, movement_type, direction, quantity, quantity_signed, location_id, meta
       FROM public.inventory_movements
       WHERE source_doc_id = $1 ORDER BY direction DESC;`,
      [taskId]
    );

    if (checkMovementsRes.rows.length !== 2) {
      throw new Error(`Hata: 2 adet transfer hareketi bekliyorduk ancak ${checkMovementsRes.rows.length} adet bulundu.`);
    }

    const outMovement = checkMovementsRes.rows.find(m => m.direction === 'out');
    const inMovement = checkMovementsRes.rows.find(m => m.direction === 'in');

    if (!outMovement || outMovement.movement_type !== 'transfer_out' || Number(outMovement.quantity_signed) !== -10) {
      throw new Error("Hata: transfer_out hareketi hatalı.");
    }
    if (outMovement.location_id !== kabulLocId) {
      throw new Error("Hata: transfer_out lokasyonu mal kabul alanı olmalıydı.");
    }
    if (outMovement.meta.availability_status !== 'putaway_pending') {
      throw new Error("Hata: transfer_out meta availability_status 'putaway_pending' olmalıydı.");
    }
    console.log("✔ Doğrulama Başarılı: transfer_out hareketi eksiksiz ve doğru.");

    if (!inMovement || inMovement.movement_type !== 'transfer_in' || Number(inMovement.quantity_signed) !== 10) {
      throw new Error("Hata: transfer_in hareketi hatalı.");
    }
    if (inMovement.location_id !== hedefLocId) {
      throw new Error("Hata: transfer_in lokasyonu hedef raf olmalıydı.");
    }
    if (inMovement.meta.availability_status !== 'available') {
      throw new Error("Hata: transfer_in meta availability_status 'available' olmalıydı.");
    }
    console.log("✔ Doğrulama Başarılı: transfer_in hareketi eksiksiz ve doğru.");

    console.log("\n>>> TÜM TESTLER BAŞARIYLA GEÇTİ! <<<");

  } catch (error) {
    console.error("Test sırasında hata fırlatıldı:", error);
  } finally {
    await client.query("ROLLBACK;");
    console.log("Transaction geri alındı (ROLLBACK).");
    await client.end();
  }
}

runTest();
