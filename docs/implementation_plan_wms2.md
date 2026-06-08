# WMS Tamamlama Planı

## Mevcut 4. Sekme (Depo Ayarları) Analizi

### ✅ Doğru Yapılanlar
- `warehouse_settings` objesi form state'inde tutuluyor
- `openEdit()` sırasında `stock_item_warehouse_settings` tablosundan mevcut kayıtlar yükleniyor
- `save()` sırasında upsert/delete ile doğru şekilde kaydediliyor
- Yalnızca `workspace_scope === 'anadepo'` olan şubeler gösteriliyor

### ⚠️ Sorunlar ve Düzeltme Önerileri

**Sorun 1: `stock_item_warehouse_settings` tablosu DB'de yok**
UI kodu kusursuz yazılmış ama tablo schema'da eksik. Kaydet'e basıldığında DB hatası oluyor.

**Sorun 2: Tab 1 (Ölçüm & Stok) ile Tab 4 (Depo Ayarları) çakışıyor**
- Tab 1'de zaten `min_stock`, `max_stock`, `reorder`, `order_unit`, `min_order`, `max_order` alanları var  
- Tab 4'te ana depo bazında aynı alanlar tekrar girilebiliyor
- Bu mantıken doğru: Tab 1 = **global şube varsayılanı**, Tab 4 = **her Ana Depo için override** şeklinde okunmalı
- **Ancak bunu kullanıcıya açıklayan bir başlık/ipucu yok.** Kafa karıştırıcı.

**Sorun 3: Ambalaj birimleri (packaging_units) Tab 4'te de kullanılabilir ama gösterilmiyor**
LPN ile bağlantı için "palet içindeki koli sayısı" gibi bilgilere ihtiyaç var.

**Sorun 4: Depo ayarı olmasına rağmen lokasyon (Depo Bölgesi/Raf) bilgisi yok**
Bir ürünün hangi raf/zona atandığı şu an girilen alanlar içinde yok. WMS Lokasyon bağlantısı eksik.

---

## Proposed Changes

### 1. Veritabanı — SQL Schema

#### [NEW] `stock_item_warehouse_settings` Tablosu
```sql
CREATE TABLE IF NOT EXISTS public.stock_item_warehouse_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  stock_item_id UUID NOT NULL REFERENCES public.stock_items(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL,
  order_unit TEXT DEFAULT 'ana',
  min_order NUMERIC,
  max_order NUMERIC,
  min_stock NUMERIC,
  safety_stock NUMERIC,
  default_location_id UUID REFERENCES public.warehouse_locations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT stock_item_warehouse_settings_uq UNIQUE (stock_item_id, branch_id)
);
CREATE INDEX ON public.stock_item_warehouse_settings(stock_item_id);
CREATE INDEX ON public.stock_item_warehouse_settings(branch_id);
```

> `default_location_id` ekliyorum: Bir ürün için hangi raf/zona varsayılan olduğunu tutmak için. WMS Lokasyonlar sayfasıyla bağlantı buradan kurulacak.

#### [MODIFY] `inventory_movements` Tablosu — Yeni Kolonlar
```sql
ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.warehouse_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lpn_id UUID REFERENCES public.warehouse_lpns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lot_number TEXT,
  ADD COLUMN IF NOT EXISTS expiration_date DATE;
CREATE INDEX IF NOT EXISTS inventory_movements_location_idx ON public.inventory_movements(location_id);
CREATE INDEX IF NOT EXISTS inventory_movements_lpn_idx ON public.inventory_movements(lpn_id);
```

> `warehouse_lpns` tablosu zaten schema'da var. `warehouse_locations` da var.

---

### 2. StockItems.jsx — 4. Sekme İyileştirmeleri

#### [MODIFY] `StockItems.jsx`

**a) Tab 1 ile Tab 4 arasındaki farkı açıklayan bilgi kutusu ekle**
Tab 4'ün üstüne şunu ekle:
> "Bu alandaki değerler, ana şubedeki genel stok kurallarını (Tab 1) o Ana Depo için ezer. Boş bırakılan alanlar için Tab 1'deki değerler kullanılır."

**b) Tab 4'e `default_location_id` (Varsayılan Raf/Lokasyon) alanı ekle**
Her Ana Depo kartına warehouse_locations tablosundan seçilebilen bir "Varsayılan Depo Lokasyonu" dropdown'ı eklenecek.

**c) `save()` fonksiyonunda `default_location_id` kaydetme eklenmeli**

---

### 3. WMS Lokasyonlar Sayfası (`/wms-locations`)

Depo içi fiziksel adres yönetimi. Ağaç yapısı: **Bölge (Zone) → Koridor (Aisle) → Raf (Rack) → Göz (Bin)**

#### Sayfa Özellikleri:
- Ana Depo seçici (birden fazla depoya sahip olunabilir)
- Lokasyon listesi (zone_code, aisle, rack, level, bin)
- Ekleme/Düzenleme modal
- Lokasyon tipine göre renk: Ambient=mavi, Chilled=yeşil, Frozen=mor
- `is_active` toggle ile pasif lokasyonlar

#### Form Alanları:
| Alan | Tip | Açıklama |
|------|-----|----------|
| `branch_id` | Select | Hangi Ana Depo |
| `zone_code` | Text | Örn: A, B, SOĞUK |
| `aisle` | Text | Koridor numarası |
| `rack` | Text | Raf numarası |
| `level` | Text | Göz seviyesi |
| `bin` | Text | Göz kodu |
| `temperature_class` | Select | Ambient / Chilled / Frozen |
| `usage_type` | Select | RESERVE / PICK_FACE |
| `is_active` | Boolean | Aktif/Pasif |

Tam adres = `{zone_code}-{aisle}{rack}-{level}{bin}` → Örn: `A-02B-03`

---

### 4. WMS LPN / Paletler Sayfası (`/wms-lpns`)

Palet ve koli plakası takibi.

#### Sayfa Özellikleri:
- LPN listesi (lpn_code, branch_id, status, current_location)
- Status göstergesi: Active=yeşil, Empty=gri, Blocked=kırmızı
- Filtre: Depo seçici + Durum filtresi
- Ekleme: Tekli + Toplu (aralık oluştur: LP0001–LP0100)
- LPN üstüne tıklayınca içindeki mallar (inventory_movements ile JOIN)

#### Form Alanları:
| Alan | Tip | Açıklama |
|------|-----|----------|
| `lpn_code` | Text | GS1 veya iç kodlama |
| `branch_id` | Select | Hangi Ana Depo |
| `status` | Select | Active / Empty / Blocked |
| `location_id` | Select | Şu an hangi raf/lokasyonda |

#### `warehouse_lpns` Tablosu Ek Kolon İhtiyacı:
Mevcut tablo eklenmiş ama `location_id` kolonu yok. Eklenecek:
```sql
ALTER TABLE public.warehouse_lpns
  ADD COLUMN IF NOT EXISTS location_id UUID REFERENCES public.warehouse_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
```

---

## Bağlantı Haritası

```
stock_items
  └── stock_item_warehouse_settings  (per-depo sipariş kuralları)
        └── default_location_id → warehouse_locations (varsayılan raf)

warehouse_locations  (raf/zona ağacı)
  └── branch_id → branches

warehouse_lpns  (palet plakaları)
  └── location_id → warehouse_locations (şu an nerede)

inventory_movements  (stok hareketleri defteri)
  ├── location_id → warehouse_locations (hangi raftan)
  └── lpn_id → warehouse_lpns (hangi paletle)
```

---

## Açık Sorular

> [!IMPORTANT]
> **LPN Kodu Formatı**: GS1-128 standardı mı (00 + 18 hane) yoksa kendi iç kodlamanız mı? (Örn: `LP-2024-0001`)

> [!IMPORTANT]
> **Toplu LPN Oluşturma**: Seri palet plakaları oluşturulacak mı? (Örn: LP0001'den LP0100'e kadar 100 palet bir anda)

> [!NOTE]
> **`product_external_barcodes`**: GS1 barkod-ürün eşleştirme ve karantina onay sistemi. Bu ilk aşamada mı yapılsın yoksa ikinci aşamaya mı bırakılsın?

---

## Uygulama Sırası

1. SQL tabloları ekle (schema-railway-master.sql)
2. StockItems 4. sekme iyileştirmeleri + `default_location_id`
3. WMS Lokasyonlar sayfası
4. WMS LPN/Paletler sayfası
5. (İkinci Aşama) `product_external_barcodes` ve karantina akışı
