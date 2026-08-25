# SuitableRMS E-Dönüşüm Modülü Kapsamlı Geliştirme Planı

Bu uygulama planı, SuitableRMS içerisindeki E-Dönüşüm (E-Fatura, E-Arşiv, E-İrsaliye, E-Adisyon) modülünün harici entegratör panellerine bağımlılığı ortadan kaldıracak, operasyonel mal kabul süreçlerini akıllı eşleştirme ve finansal tahakkuk entegrasyonuyla güçlendirecek 6 ana geliştirme maddesini içerir.

---

## 📋 Kullanıcı Talepleri & Kapsam Özeti

1. **Entegratör Paneli Bağımsızlığı:** Uyumsoft, EDM gibi portallara giriş ihtiyacını sıfırlayan tam yetenekli RMS E-Dönüşüm altyapısı (Kontör/bakiye takibi, e-Arşiv fatura iptal/itiraz, toplu PDF/UBL indirme, VKN mükellef/etiket sorgulama).
2. **Derin UBL Meta Veri Ayıklama:** Gelen faturaların XML içeriğindeki irsaliye numaraları (`cac:DespatchDocumentReference`), sipariş referansları (`cac:OrderReference`), teslimat adresleri/şubeleri (`cac:Delivery`) ve serbest notların (`cbc:Note`) otomatik ayrıştırılması.
3. **Kademeli Eşleştirme Hiyerarşisi (Matching Waterfall):** 
   - Tedarikçi $\rightarrow$ İrsaliye No $\rightarrow$ Tarih Toleransı $\rightarrow$ Kalem Sayısı $\rightarrow$ Ürün/Miktar/Fiyat $\rightarrow$ Sözleşme Fiyat & Tolerans Kontrolü.
4. **Çoklu İrsaliye — Tek Fatura Konsolidasyonu (N:1):** Günlük/periyodik çoklu irsaliyelerin tek faturada toplanması, otomatik algılama, manuel çoklu seçim sepeti ve canlı tutar dengeleme çubuğu.
5. **İrsaliyeli Fatura Sevkiyatları & Çapraz Numara Denetimi:** Sevkiyatın fatura çıktısıyla yapıldığı ve personelin fatura numarasını irsaliye alanına kaydettiği durumlar için çapraz numara eşleme (`invoice_number` $\leftrightarrow$ `despatch_no`).
6. **Hizmet Faturaları ve Tahakkuk (Accrual) $\rightarrow$ Gerçek Belge Dönüşümü:** Elektrik, su vb. hizmet faturalarının açık gider tahakkuklarıyla (`expense_documents`) eşleştirilmesi, tahakkukun resmi faturaya dönüştürülmesi ve tutar farkının otomatik işlenmesi.

---

## 🛠️ Önerilen Değişiklikler ve Mimari Yapı

### 1. Backend & Veri Modeli Genişletmeleri (PostgreSQL & `server/index.js`)

#### [MODIFY] [schema-railway-master.sql](file:///X:/RMSv3/schema-railway-master.sql)
- `e_invoices` tablosuna çoklu irsaliye ve derin meta veriler için kolonlar:
  - `matched_receipt_ids JSONB DEFAULT '[]'` (Çoklu irsaliye ID'leri)
  - `parsed_metadata JSONB DEFAULT '{}'` (Ayıklanan sipariş no, teslimat adresi, çoklu irsaliyeler vb.)
  - `is_service_invoice BOOLEAN DEFAULT false` (Hizmet/Masraf faturası ayrımı)
  - `matched_expense_id UUID REFERENCES expense_documents(id)` (Eşleşen tahakkuk/gider referansı)
- `e_integrator_configs` tablosuna kontör ve bakiye takibi kolonları:
  - `credits_balance INTEGER DEFAULT 0`, `last_credit_check_at TIMESTAMPTZ`

#### [MODIFY] [server/index.js](file:///X:/RMSv3/server/index.js)
- Entegratör SOAP/REST uçları için güvenli backend proxy/köprü endpoint'leri:
  - `/api/einvoice/check-credits` (Kalan kontör sorgulama)
  - `/api/einvoice/cancel-earchive` (E-Arşiv iptal talebi)
  - `/api/einvoice/download-batch-pdf` (Toplu fatura PDF/ZIP indirme)
  - `/api/einvoice/check-taxpayer` (GİB VKN/Etiket sorgulama)

---

### 2. Çekirdek Servisler & İş Motorları (`src/lib/eInvoice/`)

#### [MODIFY] [coreUblGenerator.js](file:///X:/RMSv3/src/lib/eInvoice/coreUblGenerator.js)
- `parseUBLXML` fonksiyonunun derin parser olarak güçlendirilmesi:
  - Çoklu `cac:DespatchDocumentReference` ve `cac:OrderReference` bloklarını dizi olarak çıkarma.
  - `cac:DeliveryAddress` (Şube/ilçe adı tespiti).
  - Çoklu `cbc:Note` alanlarını regex ile analiz ederek metin içindeki olası irsaliye numaralarını (`IRS...`, `...nolu irsaliye`) çıkarma (`extractDespatchNumbersFromText`).

#### [MODIFY] [matchingEngine.js](file:///X:/RMSv3/src/lib/eInvoice/matchingEngine.js)
- **6 Aşamalı Waterfall Pipeline:**
  - Aşama 1: Tedarikçi VKN/Ünvan filtrelemesi.
  - Aşama 2: Çapraz numara eşleme (`invoice_number` vs `despatch_no` & `doc_no`).
  - Aşama 3: Esnek tarih toleransı denetimi (İrsaliye Tarihi $\le$ Fatura Tarihi, $\pm 15$ gün aralık).
  - Aşama 4: Satır sayısı karşılaştırması.
  - Aşama 5: Fonetik ürün eşleştirme, miktar ve birim fiyat kontrolleri.
  - Aşama 6: `contractPriceValidator` ile sözleşme fiyat aşımı denetimi.
- **Çoklu İrsaliye Konsolidasyonu (N:1):**
  - Birden fazla irsaliyeyi birleştirip faturayla toplam ve satır bazında dengeleyen `matchMultipleReceiptsToInvoice` fonksiyonu.
- **Hizmet Faturası & Tahakkuk Eşleme:**
  - Gelen hizmet faturasını `expense_documents` (status: `accrual`) kayıtları ile eşleştiren ve fark tutarını hesaplayan `matchInvoiceToAccrual` fonksiyonu.

#### [MODIFY] [integratorAdapter.js](file:///X:/RMSv3/src/lib/eInvoice/integratorAdapter.js), [uyumsoftAdapter.js](file:///X:/RMSv3/src/lib/eInvoice/uyumsoftAdapter.js), [edmAdapter.js](file:///X:/RMSv3/src/lib/eInvoice/edmAdapter.js)
- Standart arayüze `getCreditsBalance()`, `cancelEArchiveInvoice()`, `downloadBatchFiles()` metotlarının eklenmesi ve adaptörlerde gerçeklenmesi.

---

### 3. Kullanıcı Arayüzü (UI) Geliştirmeleri (`src/components/pages/`)

#### [MODIFY] [EInvoiceManager.jsx](file:///X:/RMSv3/src/components/pages/EInvoiceManager.jsx)
1. **3-Way Matching Modalı Yenilemesi:**
   - **Doğrulama Sağlık Skoru (Step-by-Step Checklist):** 6 aşamanın durumunu gösteren net görsel akış (Tedarikçi ✅, İrsaliye No ✅, Tarih ⚠️, Satırlar ✅, Kalem/Fiyat ✅, Sözleşme ✅).
   - **Çoklu İrsaliye Konsolidasyon Modu:** Çoklu irsaliye seçim checkbox'ları ve sağ panelde canlı tutar dengeleme çubuğu (*Fatura: 10.000 ₺ | Seçilenler: 10.000 ₺ | Kalan Fark: 0 ₺ ✅*).
   - **İrsaliyeli Fatura Rozeti:** Fatura no irsaliye alanıyla eşleştiğinde bilgilendirici uyarı etiketi.
2. **Hizmet Faturası & Tahakkuk Eşleştirme Sekmesi/Modalı:**
   - Hizmet faturaları için açık tahakkukları listeleyen, bütçe sapmasını (*Tahakkuk: 20.000 ₺ vs Gerçek: 22.000 ₺*) gösteren ve tek tıkla tahakkuku faturaya dönüştüren arayüz.
3. **Entegratör Bağımsızlık Araçları:**
   - Üst bilgi çubuğunda canlı **Kalan Kontör / Kredi Sayacı**.
   - Giden e-Arşiv faturaları için **İptal / İtiraz Et** butonu ve gerekçe modalı.
   - Toplu fatura seçimi ve **Toplu İndir (PDF / UBL ZIP)** aksiyonu.

#### [MODIFY] [IntegratorStudio.jsx](file:///X:/RMSv3/src/components/pages/IntegratorStudio.jsx)
- Simülatör tarafında çoklu irsaliyeli fatura üretme senaryoları, hizmet faturası üretme ve irsaliyeli fatura çapraz hata test modülleri ekleme.

---

## 🧪 Doğrulama ve Test Planı

### Otomatik & Mantıksal Testler:
- `coreUblGenerator.js`: Çoklu irsaliye, sipariş no, teslimat adresi ve notlardan regex ayıklama testleri.
- `matchingEngine.js`: 6 aşamalı waterfall doğrulama, çapraz numara eşleme, çoklu irsaliye dengeleme ve tahakkuk fark hesaplama testleri.

### Manuel Doğrulama Senaryoları:
1. **Çoklu İrsaliye Senaryosu:** 3 adet ayrı mal kabul irsaliyesi oluşturulup tek bir e-fatura ile seçilerek bağlanması, canlı denge çubuğunun 0 TL farkı doğrulayıp yeşile dönmesi.
2. **İrsaliyeli Fatura Senaryosu:** Mal kabulde irsaliye no alanına fatura numarası girilmiş bir kaydın, portala gelen e-fatura ile otomatik eşleştiğinin doğrulanması.
3. **Hizmet & Tahakkuk Senaryosu:** Finans modülünde 20.000 TL elektrik tahakkuku girilmesi, gelen 22.000 TL elektrik faturasıyla eşleştirildiğinde tahakkukun kapanması ve +2.000 TL farkın bütçeye yansıması.
4. **Entegratör Yetenekleri:** Kontör sorgulama, VKN mükellef sorgulama ve e-Arşiv iptal akışlarının test edilmesi.

---

## 🔒 Kurallar & Güvenlik
- **DB-First İlkesi:** Tüm eşleşmeler, çoklu irsaliye bağlantıları ve tahakkuk güncellemeleri Hosting Dünyam VPS PostgreSQL üzerinde kalıcı tablolara yazılacaktır.
- **Operationsync Loglama:** Yapılan tüm geliştirmeler ve mimari güncellemeler `OperationSync.md` dosyasına kaydedilecektir.
