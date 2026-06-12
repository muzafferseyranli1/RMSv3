# Operasyon El Kitabı Tanımları Analiz Raporu

Bu rapor, SuitableRMS projesinde yer alan satış ürünleri ve hammadde stok kartlarının operasyon el kitabı (Operation Manual) içeriklerinin tamamlanma durumunu (kapsama oranını) gösterir.

---

## 📊 Genel Tamamlanma Durumu (Özet)

| Kategori | Toplam Kayıt | Kılavuzu Olan | Kılavuzu Olmayan | Kapsama Oranı |
| :--- | :---: | :---: | :---: | :---: |
| **Satış Ürünleri (Products)** | 74 | 1 | 73 | **%1.35** |
| **Hammaddeler (Stock Items)** | 35 | 1 | 34 | **%2.85** |

---

## 🔍 Mevcut Tanımlı Kılavuzlar

Şu anda veritabanında (`public.manual_pages`) sadece **3 adet** el kitabı sayfası kayıtlıdır:

1. **BBQ Sos** (Hammadde Kılavuzu) — Bağlı Kimlik: `stock_item` (b0e10016-0000-4000-8000-000000000022)
2. **Acı Mayo Burger** (Ürün Kılavuzu) — Bağlı Kimlik: `sale_item` (b1040000-0000-4000-8000-000000000007)
3. **mayo burger** (Ürün Kılavuzu - Alternatif Versiyon) — Bağlı Kimlik: `sale_item` (b1040000-0000-4000-8000-000000000007)

---

## 🛠️ Eksik Kılavuzların Girişi Nasıl Yapılır?

Eksik olan 73 ürünün ve 34 hammaddenin operasyon kılavuzlarını ve ekipman eşleştirmelerini tanımlamak için el kitabı yönetim arayüzünü kullanabilirsiniz.

* **El Kitabı Yönetim Ekranı:** [http://localhost:5173/manual-management](http://localhost:5173/manual-management)
* **El Kitabı Okuma Ekranı (Personel):** [http://localhost:5173/manual-reader](http://localhost:5173/manual-reader)
* **İlgili Kaynak Kod Dosyaları:**
  * Yönetim Paneli: [ManualManagement.jsx](file:///c:/RMSv3/src/components/pages/ManualManagement.jsx)
  * Okuyucu Paneli: [ManualReader.jsx](file:///c:/RMSv3/src/components/pages/ManualReader.jsx)
* **İlgili Veritabanı Tabloları:**
  * `public.manual_pages` (Kılavuz sayfaları ve içerikleri)
  * `public.manual_categories` (Kılavuz kategorileri)
  * `public.manual_page_equipments` (Kılavuza bağlı hazırlık ekipmanları)
