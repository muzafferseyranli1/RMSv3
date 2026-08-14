# E-Dönüşüm ve E-Fatura Entegrasyonu Görev Takip Listesi (task.md)

## FAZ 1: Çekirdek E-Dönüşüm Altyapısı & Mock Entegratör Simülatörü
- `[x]` 1. Veritabanı Şeması: `e_invoices`, `e_invoice_lines`, `e_integrator_configs`, `e_document_responses`, `e_invoice_matching_logs` tablolarının VPS Postgres'e uygulanması
- `[x]` 2. Çekirdek UBL-TR & Adaptör Mimarisi: `src/lib/eInvoice/` katmanının (`types.js`, `coreUblGenerator.js`, `integratorAdapter.js`, `mockIntegratorAdapter.js`, `eInvoiceService.js`) yazılması
- `[x]` 3. Backend Mock Servisleri: `server/` API endpoint'lerinin (Gelen kutusu mock, senaryo üretici, gönderim, yanıt, durum güncelleme) eklenmesi
- `[x]` 4. Arayüz: `EInvoiceManager.jsx` (Gelen/Giden kutusu, GİB fatura önizleyici, simülatör kontrol paneli, ticari yanıt modalı)
- `[x]` 5. Derleme & Doğrulama: `npm run build` ve simülatör testlerinin ana agent tarafından denetlenip onaylanması

## FAZ 2: Gelen e-Fatura ile Mal Kabul (İrsaliye) 3-Way Matching
- `[x]` 1. Tedarikçi VKN Eşleştirme ve İrsaliye Tespit Algoritması
- `[x]` 2. Satır Bazlı Miktar, Fiyat, KDV ve Tolerans Karşılaştırma Motoru
- `[x]` 3. `MalKabul.jsx` Entegrasyonu ve Yan Yana Eşleştirme Modalı
- `[x]` 4. Eşleşme Onayı ve `cari_hareketler` Cari Borçlandırma Entegrasyonu
- `[x]` 5. Faz 2 Ana Agent Kalite Denetimi & Onayı

## FAZ 3: Şirket Ağacı ve Tüzel Kişilikler Arası Transferlerin Faturalaşması
- `[x]` 1. `company_nodes` Tüzel Kişilik / VKN Tanımları
- `[x]` 2. Şubeler/Depolar Arası Transfer Tetikleyicisi ve Otomatik e-İrsaliye & e-Fatura Üretimi
- `[x]` 3. Faz 3 Ana Agent Kalite Denetimi & Onayı

## FAZ 4: Çoklu Entegratör (Uyumsoft / EDM) & E-Adisyon
- `[x]` 1. `UyumsoftAdapter` ve `EdmAdapter` Adaptör Sınıfları
- `[x]` 2. E-Adisyon ETTN Üretimi ve Fatura `AdditionalDocumentReference` Bağı
- `[x]` 3. Uçtan Uca Doğrulama & Faz 4 Ana Agent Onayı
