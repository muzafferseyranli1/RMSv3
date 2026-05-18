# Ağaç Görünümlerini Design Demo Standardına Taşıma Planı

## Özet
Amaç, projedeki hiyerarşik ekranları `/dashboard/design-demo` içindeki “Ağaç Yapısı” örneğiyle aynı görsel ve davranış omurgasına almak. Uygulama kapsamı: stok kategorileri, satış kategorileri, yarı mamul kategorileri, şirket kuruluşu ve hesap çizelgesi. POS/Garson/Kiosk içindeki operasyonel kategori navigasyonları bu işin dışında kalacak.

## Temel Uygulama Kararı
- Yeni ortak bileşen oluşturulacak: `TreeExplorer`.
- Görsel baz doğrudan design demo ağacı olacak: kompakt satır, 24px ikon kutusu, chevron expand/collapse, `depth * 20px` girinti, seçili satırda amber/warning arka plan, pasif satırda düşük opacity.
- Mevcut büyük/süslü kategori kartları ve şirket ağacı satırları bu ortak stile indirgenecek.
- Ortak bileşen hem “sadece ağaç” hem “ağaç + sağ detay paneli” modunu destekleyecek.
- Veri kaynağı veya kayıt mantığı değişmeyecek; sadece görünüm ve seçim/aksiyon yüzeyi standardize edilecek.

## Modül Bazlı Değişiklikler
- `Stok Kategorileri`, `Satış Kategorileri`, `Yarı Mamul Kategorileri`
  - Mevcut hiyerarşi verisi korunacak: `parent_id`, `children`, `deleted_at`, SKU mask, muhasebe bağlantıları.
  - `CategoryHierarchyView` tasarımı design-demo uyumlu `TreeExplorer` omurgasına taşınacak.
  - Sağ panelde mevcut bilgiler korunacak: genel bilgiler, alt kategoriler, SKU önizleme, bağlı hesap, durum.
  - `Tümünü Aç`, `Tümünü Kapat`, arama ve aktif/silinmiş filtreleri mevcut davranışla kalacak.
  - Silinmiş kayıtlar pasif/soluk satır olarak gösterilecek; geri al aksiyonu korunacak.

- `Şirket Kuruluşu`
  - Mevcut `CT` tip sözlüğü korunacak: Şirket, Tüzel Kişilik, Organizasyon, Şube, Depo vb.
  - El yapımı `CTRow` yerine `TreeExplorer` kullanılacak.
  - Node ikon/renk/etiketleri `CT` üzerinden ortak bileşene verilecek.
  - Sağ detay panelinde mevcut içerik korunacak: tür, bağlı olduğu düğüm, para birimi, vergi özeti, işçilik parametreleri, alt düğümler.
  - Kural korunacak: hangi düğümün altına hangi tür eklenebilir bilgisi aynı şekilde çalışacak.

- `Hesap Çizelgesi`
  - Mevcut düz grup kartları ağaç yapısına çevrilecek: Bölüm → Grup → Hesap.
  - Bölüm düğümleri: Gelirler, Giderler, Nakitler, Diğer.
  - Grup düğümleri: mevcut `account.group || "Ana Kalemler"`.
  - Hesap düğümleri: tekil hesap kayıtları.
  - Sağ panelde seçili hesap düzenleme formu gösterilecek; bölüm/grup seçilirse özet ve “bu bölüme/gruba hesap ekle” aksiyonu gösterilecek.
  - Mevcut kayıt şekli korunacak: `account_chart` settings değeri, `normalizeAccountChart`, `writeSettingValue`.

## Ortak Bileşen Sözleşmesi
- `TreeExplorer` props:
  - `nodes`: normalize edilmiş ağaç.
  - `selectedId`, `onSelect`.
  - `expandedIds`, `onToggle`, `onExpandAll`, `onCollapseAll`.
  - `getNodeMeta(node)`: label, icon, color, disabled, deleted, badges.
  - `renderDetail(node)`: sağ panel içeriği.
  - `emptyText`, `loading`, `sectionTitle`, `sectionSubtitle`.
- Ortak node şekli:
  - `id`, `label`, `children`, optional `disabled`, `deleted`, `type`, `raw`.
- Aksiyonlar:
  - Parent satıra tıklayınca seçer.
  - Chevron sadece expand/collapse yapar.
  - Disabled node seçilmez.
  - Search sonucu açıkken eşleşen parent zinciri otomatik görünür kalır.

## Test Planı
- `npm.cmd run build:web` çalışmalı.
- `npm.cmd run check:encoding` çalıştırılmalı; bu iş yeni mojibake üretmemeli. Mevcut `SaleItems.jsx` hataları ayrı açık risk olarak kalabilir.
- Browser smoke:
  - `/categories`
  - `/sale-categories`
  - `/semi-categories`
  - `/company`
  - `/hesap-cizelgesi`
  - `/dashboard/design-demo`
- Her ekranda kontrol:
  - Expand/collapse çalışıyor.
  - Seçili satır amber vurgulu.
  - Sağ detay paneli seçime göre değişiyor.
  - Ekle/düzenle/sil/geri al aksiyonları eski veri davranışını bozmuyor.
  - 4:3 Safe görünümde yatay taşma yok; gerekiyorsa sadece iç panel scroll alıyor.

## Varsayımlar
- POS/Garson/Kiosk ürün kategori navigasyonları bu işin dışında.
- Hesap çizelgesi artık gerçek ağaç ekranı sayılacak ve Bölüm → Grup → Hesap yapısına alınacak.
- Mevcut DB/settings kayıt formatları değişmeyecek; migration yok.
- `/dashboard/design-demo` mevcut ve canonical görsel referans olarak kullanılacak.
