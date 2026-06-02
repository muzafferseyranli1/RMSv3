# Walkthrough: Küsüratlı Kuver Dağıtımı ve Veritabanı Entegrasyonu

Bu güncelleme; 1.5 gibi küsüratlı ortalama kuver sayılarının tam sayıya yuvarlanmadan, birebir oranlara (%40 Kadın, %40 Erkek, %20 Çocuk) göre bölüştürülerek ondalıklı olarak kaydedilmesini, verilerin veritabanında kayıp olmadan saklanabilmesini ve sepet durumlarındaki olası çökmelerin önlenmesini kapsamaktadır.

## Yapılan Değişiklikler

### 1. Veritabanı Şeması Güncellemesi (SQL Migration)
* **Dosya:** [025_alter_guest_counts_to_numeric.sql](file:///c:/RMSv3/migrations/025_alter_guest_counts_to_numeric.sql)
* **Açıklama:** Canlı Railway PostgreSQL veritabanındaki `sales` ve `pos_sales` tablolarında yer alan kuver ve misafir kolonları `INTEGER` tipinden `NUMERIC(12,2)` tipine yükseltildi.
* **Uygulanan Kolonlar:** `cover_count`, `female_guest_count`, `male_guest_count`, `child_guest_count`

### 2. Küsüratlı Dağıtım Algoritması (`distributeCover`)
* **Dosyalar:** [POS.jsx](file:///c:/RMSv3/src/components/pages/POS.jsx) ve [Garson.jsx](file:///c:/RMSv3/src/components/pages/Garson.jsx)
* **Açıklama:** Tam sayı yuvarlaması kaldırıldı. Yüzen noktalı sayı duyarlılık farkları (precision error) çocuk kuverine eklenerek toplamın tam olarak girilen sayıya (`n`) eşit olması sağlandı.
  ```javascript
  function distributeCover(n) {
    const women = parseFloat((n * 0.4).toFixed(2));
    const men = parseFloat((n * 0.4).toFixed(2));
    const children = parseFloat((n - (women + men)).toFixed(2));
    return { women, men, children };
  }
  ```

### 3. Arayüz ve Sepet Hotfixi (Undone Properties Hatası Giderildi)
* **Dosyalar:** [POS.jsx](file:///c:/RMSv3/src/components/pages/POS.jsx) ve [Garson.jsx](file:///c:/RMSv3/src/components/pages/Garson.jsx)
* **Açıklama:** Arayüzde ödeme alma veya sepet işlemleri sırasında sepet elemanlarında `prod` nesnesinin tanımsız (undefined) olması durumunda `Cannot read properties of undefined (reading 'sale_cat_l5')` hatası alınması engellendi. `getProductCategoryId` fonksiyonu güvenli isteğe bağlı zincirleme (`optional chaining` `item?.`) kullanacak şekilde güncellendi.
  ```javascript
  function getProductCategoryId(item) {
    return item?.sale_cat_l5
      || item?.sale_cat_l4
      || item?.sale_cat_l5 // ...
  }
  ```

## Doğrulama Sonuçları
* ✅ SQL migration Railway veritabanına uygulandı.
* ✅ `npm run build` komutu çalıştırıldı ve production build **0 hata ile %100 başarılı** bir şekilde tamamlandı.
