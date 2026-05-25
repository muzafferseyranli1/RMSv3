# Kupon Koşulu (`coupon_present`) Yerel Değerlendirme Planı

Bu plan, "Kupon mevcut" (`coupon_present`) sadakat koşulunun POS, Garson, Kiosk ve Mobil Uygulama gibi tüm kanallarda sunucu değerlendiricisi gerektirmeden yerel/istemci tarafında (local) çözülebilmesi için gerekli altyapıyı tanımlar.

## Kullanıcı İncelemesi Gereken Konular

> [!IMPORTANT]
> - **Kupon Geçerlilik Kriterleri**: 
>   - Kupon aktif olmalıdır (`active !== false`).
>   - Kupon daha önce kullanılmamış olmalıdır (`is_used !== true` ve `redemption_status` değeri `'used'`, `'expired'`, `'cancelled'` olmamalıdır).
>   - Süresi dolmamış olmalıdır (varsa `expires_at >= now`).
>   - Kupon serisi, kuralın `seriesIds` listesinde tanımlı olmalıdır (eğer `anySeries` seçili değilse).
> - **Veri Çekme Yaklaşımı**: Yerel değerlendirici senkron çalıştığından, kupon detayları `evaluateRuntimeOrderCampaignsAsync` fonksiyonu içerisinde önceden asenkron olarak veritabanından çekilip `orderContext` nesnesine (`couponDetails`) eklenecektir.

---

## Yapılacak Değişiklikler

### 1. İş Mantığı Katmanı (JavaScript)

#### [MODIFY] [posLoyalty.js](file:///C:/RMSv3/src/lib/posLoyalty.js)

- **Veritabanı İmport Ayarı**: Dosyanın en üstüne `import { db } from '@/lib/db'` eklenecektir.
- **Koşulun Yerel Listeye Eklenmesi**: `LOCAL_RULE_CONDITION_KEYS` kümesine `'coupon_present'` eklenecektir.
- **Kupon Özet Metni**: `getConditionPreview` fonksiyonunda `case 'coupon_present':` eklenerek kampanya detaylarında gösterilecek metin ayarlanacaktır:
  - `anySeries` aktif ise: *"Herhangi bir kupon serisi"*
  - Değilse: *"Seçili X kupon serisinden biri"*
- **Asenkron Kupon Detayı Çekimi**: `evaluateRuntimeOrderCampaignsAsync` fonksiyonunun başında, `options.selectedCouponCode` veya `options.customerContext?.selectedCouponCode` alanlarından kupon kodu (`selectedCouponCode`) ayıklanacaktır.
  - Eğer bir kupon kodu tanımlanmışsa, veritabanından asenkron olarak bilgileri çekilecektir:
    ```javascript
    const res = await db.from('loyalty_coupons')
      .select('id,code,series_id,is_used,active,redemption_status,expires_at')
      .eq('code', selectedCouponCode)
      .maybeSingle()
    ```
  - Çekilen veri `couponDetails` adıyla `evaluateRuntimeOrderCampaigns` çağrısına argüman olarak eklenecektir.
- **Kural Değerlendirme Parametreleri**: `evaluateRuntimeOrderCampaigns` fonksiyonu argümanlarında `selectedCouponCode` ve `couponDetails` parametrelerini karşılayacaktır. Bu değerler `buildCampaignCard` içindeki `orderContext` nesnesine aktarılacaktır.
- **Koşul Değerlendirme Mantığı**: `evaluateSingleCondition` fonksiyonu altına `case 'coupon_present':` bloğu eklenerek aşağıdaki kontroller gerçekleştirilecektir:
  - Aktiflik, kullanım durumu, son kullanma tarihi ve seri eşleşme doğrulamaları.

#### [MODIFY] [loyaltyRuntimeStatus.js](file:///C:/RMSv3/src/lib/loyaltyRuntimeStatus.js)

- **Durum Güncellemesi**: `CONDITION_KEY_STATUS` haritasındaki `coupon_present` kaydının `category` değeri `'server'` yerine `'local'` olarak güncellenecektir. Böylece arayüzler ve motor bu kuralı doğrudan yerel olarak çalıştırılabilir kabul edecektir.

---

## Doğrulama Planı

### Otomatik Testler (Derleme Kontrolü)
- Projeyi derleyerek React bileşenlerinin sorunsuz yüklendiğini ve herhangi bir TypeScript/JavaScript derleme hatası olmadığını doğrulayacağız:
  ```powershell
  npm run build
  ```

### Manuel Doğrulama
- Kampanya Yönetimi panelinden "Kupon" koşuluna sahip bir kampanya oluşturulacaktır.
- İlgili kupon serisi ve kodları tanımlandıktan sonra sepet ekranında bu kupon kodu girilerek kampanyanın yerel olarak tetiklendiği doğrulanacaktır.
