# Sadakat Kosul/Eylem Davranis Matrisi

Tarih: 2026-05-11  
Durum: read-only audit  
Kapsam: `src/lib/loyalty.js`, `src/lib/posLoyalty.js`, `src/lib/checkoutLoyalty.js`, POS/Kiosk checkout baglantilari.

## Kisa Verdict

UI/model katmani kosul ve eylemleri tanimlamayi, normalize etmeyi, ozetlemeyi ve `loyalty_campaign_rules.condition_json/action_json` olarak saklamayi biliyor.

Runtime katmani tum listeyi calistirmiyor. POS/Kiosk local runtime su an sadece basit sepet/kanal/kategori/manuel tetik kosullarini ve indirim/hediye urun eylemlerini cozuyor.

Puan, kupon uretimi, frekans/ziyaret, donemsel gecmis, dogum gunu, son ziyaret, referral, SMS/webhook, musteri notu ve kategori yazma gibi alanlar icin DB-first server evaluator ve value-ledger servisi gerekiyor.

## Durum Etiketleri

- `LOCAL_READY`: POS/Kiosk local runtime mevcut siparis baglamiyla uygulayabiliyor.
- `SERVER_REQUIRED`: Gecmis satis, musteri profili, kupon, zaman, referral veya kampanya gecmisi gibi DB sorgusu gerekir.
- `VALUE_LEDGER_REQUIRED`: Kampanya sonucu wallet/transaction/coupon/entitlement/progress/redemption tablosuna yazilmalidir.
- `MODEL_ONLY`: UI/model var, ancak runtime executor yok.
- `PRESENTATION_ONLY`: UI'da gosterim/uyari olabilir, is sonucu yazimi yok.
- `SETTINGS_CONFLICT`: Aktif kod settings tabanli bir yan yol kullaniyor; canonical loyalty tablolariyla uyumlanmali.

## Desteklenen Runtime Cekirdegi

`src/lib/posLoyalty.js` icindeki local destek:

- Kosullar: `always`, `order_total`, `sales_channel`, `manual_approval`, `customer_has_tag`, `customer_lacks_tag`
- Eylemler: `discount_percent`, `total_order_discount_percent`, `order_discount_amount`, `free_products`

Bu cekirdek kampanyayi POS/Kiosk sepetine uygular ve `checkoutLoyalty.js` ile satis basligi/satirlarina attribution alanlari ekler:

- `discount_source`
- `loyalty_campaign_id`
- `loyalty_campaign_name`
- `loyalty_application_mode`
- `loyalty_action_type`
- `loyalty_offer_label`
- `loyalty_source_rule_id`
- `loyalty_discount_allocated_amount`

Bu islem tek basina puan veya cuzdan hareketi yaratmaz.

## Kosul Matrisi

| Kosul | UI/model | Runtime durumu | Beklenen davranis | Eksik kapatma |
|---|---|---|---|---|
| `always` | Var | `LOCAL_READY` | Kanal/hedef kitle uygunsa her sipariste true. | Yok. |
| `calendar_schedule` | Var | `SERVER_REQUIRED` | Gun/hafta/ay/yil takvimine gore kampanya zaman uygunlugu. | Timezone-aware evaluator. |
| `birthday` | Var | `SERVER_REQUIRED` | Musteri dogum tarihi ve once/sonra gun penceresiyle eslesir. | Musteri profil alanlari + date evaluator. |
| `period_total_order_amount` | Var | `SERVER_REQUIRED` | Musterinin secili donemde toplam harcamasini kontrol eder. | `sales` toplam sorgusu, period helper, current order dahil/haric karari. |
| `period_order_count` | Var | `SERVER_REQUIRED` | Musterinin secili donemde siparis/ziyaret adedini kontrol eder. | `sales` count sorgusu, ziyaret tanimi. |
| `period_product_quantity` | Var | `SERVER_REQUIRED` | Musterinin donemde aldigi urun miktarini kontrol eder. | `sale_lines` + urun/kategori mask evaluator. |
| `period_sold_product_quantity` | Var | `SERVER_REQUIRED` | Genel satis hacmini urun/kategori bazinda kontrol eder. | Global/branch `sale_lines` aggregator. |
| `missing_products` | Var | `MODEL_ONLY` | Sepette secili urun/mask yoksa true. | Local cart evaluator eklenebilir. |
| `happy_hour` | Var | `SERVER_REQUIRED` veya `LOCAL_READY` olabilir | Saat/gun araligina gore true. | POS/Kiosk local time evaluator ve timezone kurali. |
| `gift_card_series` | Var | `SERVER_REQUIRED` | Musteri/kart/kupon serisi eslesmesini kontrol eder. | `loyalty_cards`/`loyalty_coupons` lookup. |
| `campaign_triggered` | Var | `SERVER_REQUIRED` | Baska kampanya tetiklendiyse calisir. | Runtime campaign event context + redemption ledger. |
| `coupon_present` | Var | `SERVER_REQUIRED` | Musteride/sepette belirli kupon veya seri varsa true. | Canonical `loyalty_coupons` evaluator; kiosk settings kuponlariyla ayrim. |
| `manual_approval` | Var | `LOCAL_READY` | Personel POS kampanya panelinden manuel tetiklerse true. | Yok; audit/log eklenebilir. |
| `days_since_first_activity` | Var | `SERVER_REQUIRED` | Ilk kayit/ilk siparis tarihinden gun farki. | Musteri first activity kaynagi netlestirilmeli. |
| `customer_has_tag` | Var | `LOCAL_READY` | Bagli musterinin kategori id listesinde hedef kategori varsa true. | Kategori idleri link sirasinda dogru yuklenmeli. |
| `customer_lacks_tag` | Var | `LOCAL_READY` | Bagli musteride hedef kategori yoksa true. | Kategori idleri link sirasinda dogru yuklenmeli. |
| `referral_source` | Var | `SERVER_REQUIRED` | Musteri referral kodu/referrer ile geldiyse true. | `musteriler.referral_code/referred_by_customer_id` evaluator. |
| `sales_channel` | Var | `LOCAL_READY` | POS/Garson/Kiosk/online/mobil kanal eslesirse true. | Kanal adlari standart kalmali. |
| `order_item_quantity` | Var | `MODEL_ONLY` | Mevcut sepette secili urun miktari esigi. | Local cart line evaluator. |
| `order_total` | Var | `LOCAL_READY` | Mevcut sepet tutari esige gore true. | Yok. |
| `last_visit_days` | Var | `SERVER_REQUIRED` | Son siparisten beri gecen gunu kontrol eder. | Son `sales` tarihi sorgusu. |

## Eylem Matrisi

| Eylem | UI/model | Runtime durumu | Beklenen davranis | Eksik kapatma |
|---|---|---|---|---|
| `free_products` | Var | `LOCAL_READY` | Hediye urun teklifini/sepete etkiyi kampanya offer olarak verir. | Sale line gift attribution ve stok etkisi netlestirilmeli. |
| `product_pricing` | Var | `MODEL_ONLY` | Secili urunlere ozel fiyat/indirim uygular. | Line-level pricing executor. |
| `combo_bundle` | Var | `MODEL_ONLY` | Kombo grup ve fiyat mantigi uygular. | Cart combo executor. |
| `write_customer_note` | Var | `MODEL_ONLY` | Musteri/fis/teslimat notu yazar. | Musteri notu ve sale note write path. |
| `send_sms` | Var | `MODEL_ONLY` | Musteriye SMS yollar. | Messaging provider/job queue. |
| `send_webhook` | Var | `MODEL_ONLY` | Harici webhook tetikler. | Secure webhook dispatcher. |
| `remove_customer_tag` | Var | `MODEL_ONLY` | Musteriyi kategoriden cikarir. | `loyalty_customer_category_members` mutation + audit. |
| `add_customer_tag` | Var | `MODEL_ONLY` | Musteriyi kategoriye ekler. | `loyalty_customer_category_members` mutation + audit. |
| `special_discount` | Var | `MODEL_ONLY` | Ozel indirim uygular. | `order_discount_amount/percent` ile birlestirme veya ayri executor karari. |
| `order_extra_charge_amount` | Var | `MODEL_ONLY` | Siparise sabit ek ucret ekler. | Sale total/tax/payment etkisi tanimlanmali. |
| `order_extra_charge_percent` | Var | `MODEL_ONLY` | Siparise yuzdesel ek ucret ekler. | Sale total/tax/payment etkisi tanimlanmali. |
| `order_discount_amount` | Var | `LOCAL_READY` | Siparis toplamindan sabit indirim duser. | Value ledger/redemption kaydi eksik. |
| `total_order_discount_percent` | Var | `LOCAL_READY` | Siparis toplamindan yuzdesel indirim duser. | Value ledger/redemption kaydi eksik. |
| `warning_message` | Var | `PRESENTATION_ONLY` | Personel/musteriye uyari gosterir. | UX placement ve dismiss/audit karari. |
| `bonus_points` | Var | `VALUE_LEDGER_REQUIRED` | Musteriye sabit puan yukler. | `loyalty_wallets` upsert + `loyalty_transactions` earn/campaign_bonus. |
| `points_percent_of_order` | Var | `VALUE_LEDGER_REQUIRED` | Siparis tutarina gore puan kazandirir. | Points formula + wallet transaction. |
| `points_earn_multiplier` | Var | `VALUE_LEDGER_REQUIRED` | Kazanilacak puani katsayilar. | Base earn model + multiplier pipeline. |
| `points_redeem_multiplier` | Var | `VALUE_LEDGER_REQUIRED` | Puan harcama degerini katsayilar. | Burn/redemption engine. |
| `issue_coupon` | Var | `VALUE_LEDGER_REQUIRED` | Uygun seriden musteriye kupon yaratir/tahsis eder. | `loyalty_coupons` assignment + redemption status. |
| `discount_percent` | Var | `LOCAL_READY` | Yuzdesel indirim uygular. | Value ledger/redemption kaydi eksik. |

## UI Degisiklikleri Icin Kural

UI'da her kosul/eylem kartina su runtime rozetleri eklenmeli:

- `Aninda calisir`: `LOCAL_READY`
- `Canli kontrol ister`: `SERVER_REQUIRED`
- `Deger defteri yazar`: `VALUE_LEDGER_REQUIRED`
- `Tanim var, motor yok`: `MODEL_ONLY`

Bu rozetler kullaniciya uzun teknik aciklama vermeden dogru beklenti kurar.

## Kapatma Sirasi

1. `order_item_quantity`, `missing_products`, `happy_hour` local evaluator ile hizli kapatilabilir.
2. `period_*`, `birthday`, `last_visit_days`, `referral_source`, `coupon_present` server evaluator ister.
3. `bonus_points`, `points_percent_of_order`, `issue_coupon`, `points_*_multiplier` icin value ledger zorunlu.
4. `product_pricing`, `combo_bundle`, `extra_charge`, `tag add/remove`, `note`, `SMS/webhook` ayri executor paketleri olarak ele alinmali.

## Stop Rule

Bir kosul/eylem icin "tamam" denebilmesi icin:

1. UI config alani vardir.
2. Kayit DB'ye yazilip geri okunur.
3. Runtime evaluator o kosulu karar olarak kullanir.
4. Eylem satisa veya ilgili domain tablosuna etki eder.
5. Etki `sales/sale_lines` veya `loyalty_*` tablosundan readback ile dogrulanir.

