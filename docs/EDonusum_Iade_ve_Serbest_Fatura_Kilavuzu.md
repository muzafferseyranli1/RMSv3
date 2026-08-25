# Serbest Fatura & Orijinal Fatura Referanslı E-İade Faturası (Stok Entegreli) Walkthrough

SuitableRMS E-Dönüşüm platformuna **Serbest Fatura Oluşturma Sihirbazı** ile GİB standartlarında `<cac:BillingReference>` içeren ve depodan otomatik stok çıkışı yapan **E-İade Faturası Modülü** başarıyla entegre edilmiştir.

---

## 🚀 Eklenen ve Tamamlanan Özellikler

### 1. Serbest E-Fatura / E-Arşiv Oluşturma Sihirbazı (Modal 11)
- **Giden Kutusu** üst çubuğuna **"➕ Yeni Serbest Fatura Oluştur"** butonu eklendi.
- **Özellikler:**
  - Profil Seçimi: `TICARIFATURA`, `TEMELFATURA`, `EARSIVFATURA`, `IHRACAT`.
  - Fatura Tipi: `SATIS`, `TEVKIFAT`, `ISTISNA`, `OZELMATRAH`.
  - Alıcı Bilgileri: VKN/TCKN, Ünvan, Adres ve Vergi Dairesi.
  - Kalem Tablosu: Kalem adı, miktar, birim (Adet, KG, Litre, Paket vb.), birim fiyat, KDV oranı (%0, %1, %10, %20), iskonto.
  - Canlı Matrah, KDV ve Genel Toplam Hesaplayıcı.
  - "Taslak Kaydet" ve "İmzala & GİB'e Gönder" aksiyonları.

---

### 2. Gelen Faturaya Referanslı E-İade Faturası & Depodan Stok Düşme (Modal 12)
- **Gelen Kutusu** tablosunda her faturanın yanına **"↩️ İade Kes"** butonu eklendi.
- **GİB UBL-TR 2.1 Yasal Kuralı (BillingReference):**
  - İade faturasının UBL XML'ine `<cac:BillingReference><cac:InvoiceDocumentReference>` düğümü otomatik eklenir ve orijinal fatura numarası ile tarihi mühürlenir.
- **Kısmi veya Tam İade:**
  - Orijinal faturanın satırları ve birim fiyatları listelenir; kullanıcı sadece iade edilecek kalemleri ve iade miktarını seçer.
- **Entegre Stok Çıkışı (`inventory_movements`):**
  - "İade edilen ürünleri depodan otomatik stok çıkışı yap" seçildiğinde, seçilen Şube/Depo için `movement_type = 'purchase_return'` satırları yazılarak envanterden çıkış yapılır ve dönem içi alış maliyeti düzeltilir.
- **Orijinal Fatura İlişkilendirmesi:**
  - Orijinal faturanın meta verisine ve notlarına `[İade Faturası Düzenlendi: #IAD2026...]` notu işlenir.

---

## 🛠️ Değiştirilen Dosyalar

| Dosya | Değişiklik Özeti |
|---|---|
| [`coreUblGenerator.js`](file:///X:/RMSv3/src/lib/eInvoice/coreUblGenerator.js) | `generateUBLXML` içine `<cac:BillingReference>` düğümü eklendi. |
| [`eInvoiceService.js`](file:///X:/RMSv3/src/lib/eInvoice/eInvoiceService.js) | `createAndSendOutboundInvoice` ve `createAndSendReturnInvoice` (stok hareketleri entegrasyonlu) metotları eklendi. |
| [`EInvoiceManager.jsx`](file:///X:/RMSv3/src/components/pages/EInvoiceManager.jsx) | Modal 11 (Serbest Fatura Sihirbazı), Modal 12 (İade Faturası & Stok Çıkış Modalı), "Yeni Serbest Fatura" ve "İade Kes" butonları entegre edildi. |
| [`docs/EDonusum_Sistem_Mimarisi_ve_Uygulama_Kilavuzu.md`](file:///X:/RMSv3/docs/EDonusum_Sistem_Mimarisi_ve_Uygulama_Kilavuzu.md) | Master teknik dokümantasyon güncellendi. |
| [`OperationSync.md`](file:///X:/RMSv3/OperationSync.md) | Operasyonel loglar kaydedildi. |

---

## 🔍 Derleme ve Doğrulama
- `npm run build` çalıştırıldı ve sıfır hata ile tamamlandı (`✓ built in 57.75s`).
