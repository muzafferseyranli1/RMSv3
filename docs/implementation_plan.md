# created_by_terminal Enjeksiyonu (FAZ 7) Entegrasyon Planı

Bu plan, POS fiş yazımında ve envanter hareketlerinde terminal bazlı izlenebilirlik sağlamak üzere `created_by_terminal` alanının `src/lib/terminalIdentity.js` katmanı aracılığıyla `src/lib/db.js` insert/upsert veri işlemlerine otomatik enjekte edilmesini kapsar.

## User Review Required

> [!IMPORTANT]
> **Enjeksiyon Koşulları ve Etkilenen Tablolar:**
> * Alan enjeksiyonu yalnızca 3 kritik tablo için etkinleştirilecektir: `'sales'`, `'sale_lines'`, `'inventory_movements'`.
> * Enrichment (veri zenginleştirme) işlemi yalnızca masaüstü/Electron modunda (`isDesktopMode() === true`) ve veri okuma dışındaki yazma işlemlerinde (`operation !== 'select'`) çalışacaktır.
> * Web/tarayıcı modunda `isDesktopMode()` false olacağından zenginleştirme kesinlikle çalışmayacak ve web uyumluluğu etkilenmeyecektir.

---

## Proposed Changes

### 1. Terminal Kimlik Katmanı Güncellemeleri

#### [MODIFY] [terminalIdentity.js](file:///c:/RMSv3/src/lib/terminalIdentity.js)
* `injectTerminalFields(tableName, data)` fonksiyonunun eklenmesi:
  * Gönderilen tablo adı `'sales'`, `'sale_lines'` veya `'inventory_movements'` ise ve aktif terminal ID'si mevcutsa verinin içine `created_by_terminal = terminalId` ekler (tekil veya dizi formatında).
  * Diğer durumlarda veriyi değiştirmeden aynen döndürür.

---

### 2. Veri İstemcisi Entegrasyonu

#### [MODIFY] [db.js](file:///c:/RMSv3/src/lib/db.js)
* `terminalIdentity.js` dosyasından `injectTerminalFields` fonksiyonunun import edilmesi.
* `QueryBuilder._execute()` çağrısında, eğer `isDesktopMode() && this._operation !== 'select'` ise, `this._data` alanının `injectTerminalFields` fonksiyonundan geçirilerek zenginleştirilmiş veri olarak query body'ye yerleştirilmesi.

---

## Verification Plan

### Automated Tests & Manual Verification
1. **Derleme (Build) Testi:**
   * Projenin hatasız derlendiği teyit edilecektir:
     ```bash
     npm run build
     ```
2. **Birim Enjeksiyon Testi:**
   * `injectTerminalFields` ve `db.js` enjeksiyon kurallarını (Array/Object formatları, tablo filtreleri, desktop/web mod durumları) simüle ederek test eden bir doğrulama betiği (`scratch/test-terminal-injection.cjs`) hazırlanıp çalıştırılacaktır:
     ```bash
     npx electron scratch/test-terminal-injection.cjs
     ```
