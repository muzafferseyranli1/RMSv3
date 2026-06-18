# Uygulama Planı - Operasyon El Kitabı (Faz 3: Kullanıcı Arayüzü)

Bu plan, **"Görev Fazı 3: Kullanıcı Arayüzü (Merkez ve Şube Modülleri)"** gereksinimlerini hayata geçirmeyi hedefler. Önceki fazda oluşturulan API'leri tüketen, modern, duyarlı ve premium React (Tailwind CSS) bileşenlerini tasarlayacaktır.

## User Review Required

> [!IMPORTANT]
> - **Arayüz Tasarımı:** Uygulamanın koyu/açık mod tasarımı (`[data-theme="dark"]`), renk paletleri ve kart (`.card`), buton (`.btn-p`, `.btn-o`), form (`.f-input`, `.f-label`) gibi global CSS sınıfları birebir kullanılacaktır.
> - **Çevrimdışı ve Hata Yönetimi:** Ağ/veri çekme hataları ekranda açık ve net şekilde görüntülenecek (sessizce yutulmayacaktır).
> - **Ekipman Arıza Bildirimi:** Şube personeli bir el kitabı sayfasını okurken, alt kısımdaki "Bu Prosedürde Kullanılan Ekipmanlar" kartından bir ekipmana tıkladığında bir modal açılacak, şubeye ait aktif fiziksel ekipman seçilecek (`equipments` tablosu) ve arıza açıklaması girilerek `maintenance_tickets` tablosuna doğrudan kayıt oluşturulacaktır.

---

## Proposed Changes

### 1. Navigasyon ve Rota Güncellemeleri

#### [MODIFY] [Sidebar.jsx](file:///X:/RMSv3/src/components/layout/Sidebar.jsx)
- **Merkez (HQ) Menüsü:** `İşlemler` (islemler) altına `El Kitabı Yönetimi` (`/manual-yonetimi`, ikon: `fa-book-open-reader`) menü elemanının eklenmesi.
- **Şube Menüsü:** `İşlemler` (sube-islemler) altına `Operasyon El Kitabı` (`/manual`, ikon: `fa-book-open`) menü elemanının eklenmesi.

#### [MODIFY] [App.jsx](file:///X:/RMSv3/src/App.jsx)
- Lazy import listesine `ManualManagement` ve `ManualReader` bileşenlerinin eklenmesi.
- Rota listesine ilgili sayfaların eklenmesi:
  - `/manual-yonetimi` -> `<ManualManagement />`
  - `/manual` -> `<WorkspaceBranchScope><ManualReader /></WorkspaceBranchScope>`

### 2. Arayüz Bileşenlerinin Oluşturulması

#### [NEW] [ManualManagement.jsx](file:///X:/RMSv3/src/components/pages/ManualManagement.jsx)
Merkez yöneticilerinin el kitabı kategorilerini ve sayfalarını yönetebileceği yönetim ekranı:
- **Kategori Yönetimi Sekmesi:** Kategorileri listeleme (CRUD), `display_order` ve açıklama alanlarının eklenip güncellenmesi.
- **Sayfa Yönetimi ve Düzenleyici Sekmesi:**
  - Sayfaları listeleme, silme ve düzenleme paneli.
  - **Editör Formu:**
    - Kategori seçimi (Dropdown).
    - Başlık ve İçerik (Markdown destekli Textarea).
    - Düzenleyen Personel PIN Kodu girişi.
    - **Ekipman İlişkilendir (Multi-select dropdown/onay kutuları):** Sistemde tanımlı küresel ekipman tanımlarını (`/api/manual/equipments`) çekerek sayfaya bağlanmasını sağlayan görsel seçim alanı.

#### [NEW] [ManualReader.jsx](file:///X:/RMSv3/src/components/pages/ManualReader.jsx)
Şube personelinin prosedürleri okuyabileceği ve ilgili ekipmanlara arıza bildirebileceği okuyucu arayüzü:
- **Sol Panel (Accordion/Tree Menü):** Kategorilerin ve altındaki sayfaların listelendiği menü.
- **Sağ Panel (Okuma Alanı):**
  - Seçilen sayfanın başlığı, güncel versiyon numarası (`Versiyon: X`) ve son güncelleyen PIN kodu bilgisi.
  - Markdown prosedür içeriğinin HTML formatına dönüştürülerek estetik biçimde gösterilmesi.
  - **"Bu Prosedürde Kullanılan Ekipmanlar" Kartı (Widget):** Sayfaya LEFT JOIN ile bağlı ekipmanların isimleri ve görsellerini listeler.
- **Arıza Kaydı Açma Modalı:**
  - Bir ekipmana tıklandığında açılır.
  - Şubenin aktif `branchId` bilgisiyle veritabanındaki fiziksel ekipmanları (`db.from('equipments')`) çeker ve listeler.
  - Personelden bir arıza açıklaması alarak `maintenance_tickets` tablosuna doğrudan insert işlemi gerçekleştirir. Başarılı/Hatalı durumları toast mesajı ile bildirilir.

---

## Verification Plan

### Automated Tests
- Proje derleme testi: `npm run build` ile herhangi bir frontend derleme hatası olmadığını doğrulamak.

### Manual Verification
- Merkez modülü üzerinden yeni kategori ("Bar Operasyonu") ve yeni sayfa ("Kahve Değirmeni Kalibrasyonu") oluşturulup, örnek bir ekipman (Espresso Makinesi) ile ilişkilendirilecektir.
- Şube modülüne geçiş yapılarak ilgili sayfa açılacak, sayfa altındaki Espresso Makinesi kartına tıklanıp arıza açıklaması girilerek arıza kaydı oluşturulacak ve veritabanına başarıyla yazıldığı doğrulanacaktır.

