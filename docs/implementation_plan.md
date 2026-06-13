# Görev WMS-04A: Kalite Hold Şeması Uygulama Planı

Bu plan `warehouse_quality_holds` tablosunun eklenmesini ve karantina stok hareketlerinin (quarantine inventory movements) bu tabloya otomatik olarak yansımasını sağlayacak veritabanı şemasını içerir.

## User Review Required

Lütfen aşağıdaki tablo tasarımını ve otomatik trigger mantığını inceleyip onaylayın.

## Proposed Changes

### Database Schema

#### [NEW] `migrations/047_add_warehouse_quality_holds.sql`
Bu migration dosyasında `warehouse_quality_holds` tablosunu ve karantina hareketlerinden otomatik kayıt oluşturan DB Trigger'ını tanımlayacağız.

1. **Tablo Tanımı (`warehouse_quality_holds`)**:
   - `id`: UUID PRIMARY KEY
   - `branch_id`: UUID NOT NULL REFERENCES company_nodes
   - `stock_item_id`: UUID NOT NULL REFERENCES stock_items
   - `movement_id`: UUID REFERENCES inventory_movements (kaynak hareket referansı)
   - `location_id`: UUID
   - `lpn_id`: UUID
   - `lot_number`: TEXT
   - `expiration_date`: DATE
   - `hold_qty`: NUMERIC(18,4) NOT NULL
   - `status`: TEXT DEFAULT 'hold' (hold, released, rejected, scrapped)
   - `reason`: TEXT
   - `source_task_id`: UUID REFERENCES warehouse_tasks
   - `source_event_id`: UUID REFERENCES warehouse_task_events
   - `evidence_photo_url`: TEXT
   - `released_by`: TEXT
   - `released_at`: TIMESTAMPTZ
   - `meta`: JSONB DEFAULT '{}'

2. **Trigger Tanımı**:
   - `inventory_movements` tablosu üzerinde `AFTER INSERT` çalışan bir trigger eklenecektir.
   - Eğer yeni hareketin `meta->>'availability_status'` değeri `'quarantine'` ise (veya `direction = 'in'` gibi mantıklı bir filtre), `warehouse_quality_holds` tablosuna otomatik olarak bir kayıt (`status = 'hold'`) atılacaktır.
   - Eğer bu hareket bir `warehouse_tasks` tarafından tetiklenmişse (`source_doc_type = 'warehouse_tasks'`), trigger ilgili task'ı bulacak ve en son event içindeki `payload->>'evidence_photo_url'` bilgisini ve `source_event_id` bilgisini çekerek `warehouse_quality_holds` kaydına ekleyecektir. Böylece Android'den gelen exception fotoğrafları otomatik olarak kalite onay ekranında görülebilecektir.

#### [MODIFY] `schema-railway-master.sql`
- Yeni eklenen tabloyu ve trigger'ı Railway için ana schema dosyasına dahil edeceğiz.

## Verification Plan

### Manual Verification
- Bir `inventory_movements` kaydı (quarantine statüsünde) manuel olarak atılarak `warehouse_quality_holds` tablosuna başarılı şekilde kaydın düşüp düşmediği incelenecek.
- Fotoğraf ve event referanslarının doğru bir şekilde doldurulduğu kontrol edilecek.
