# Demo Satış Üretiminde "Unterminated string in JSON" Hatasının Çözümü

Bu plan, Demo Satış Üreticisi (`/demo-sales`) sayfasında "Üretimi Başlat" butonuna tıklandıktan hemen sonra karşılaşılan ve tarayıcıda `Unterminated string in JSON at position 50592` hatasına sebep olan veri boyutu/kesilme sorununu çözmeyi hedefler.

## User Review Required

> [!IMPORTANT]
> **Yapılan Değişiklik ve Performans Kazanımı:**
> - `sale_items` tablosundaki `pos_image` ve `channel_image` sütunları, ürün görsellerini base64 formatında saklamaktadır ve satır başına ortalama ~580 KB yer kaplamaktadır (74 satır için toplam ~43 MB).
> - Demo satış simülasyonu çalışırken ürün görsellerine hiçbir şekilde ihtiyaç duymamaktadır.
> - Bu değişiklik ile, `useDemoSalesJob.jsx` içindeki `sale_items` sorgusu `*` yerine yalnızca simülasyon motorunun kullandığı alanları (`select(...)`) isteyecek şekilde güncellenecektir.
> - Bu sayede veri boyutu **42.89 MB**'tan **~217 KB**'a düşürülerek (%99.5 tasarruf) ağ trafiği ve sunucu yükü minimize edilecek, JSON kesilme hatası tamamen giderilecektir.

---

## Proposed Changes

### Arayüz ve Job Bileşenleri (Frontend Updates)

#### [MODIFY] [useDemoSalesJob.jsx](file:///c:/RMSv3/src/hooks/useDemoSalesJob.jsx)
- `buildRuntime` fonksiyonundaki `sale_items` sorgusunu (`db.from('sale_items').select('*')`) şu şekilde güncelleyeceğiz:
  ```javascript
  db.from('sale_items')
    .select('id,sku,name,deleted_at,sale_status,setting_active,standard_price,portions,option_groups,channel_prices,sale_cat_l1,sale_cat_l2,sale_cat_l3,sale_cat_l4,sale_cat_l5,recipe_rows,recipe_output_qty')
    .is('deleted_at', null)
    .order('name')
  ```

---

## Verification Plan

### Automated & Manual Verification
1. **Derleme (Build) Doğrulaması:**
   - Frontend kodunun hatasız derlendiğini doğrulayacağız:
     ```powershell
     npm run build
     ```
2. **Yerel Test:**
   - Değişikliği uyguladıktan sonra `/demo-sales` sayfasına gidip "Üretimi Başlat" diyerek işlemin ilk adımdan itibaren (0/115 yerine ilerleyerek) sorunsuz çalıştığını kontrol edeceğiz.
