# Sadakat Akilli Kampanya Wizard Devir Handout

Tarih: 2026-05-12  
Workspace: `C:\RMSggl\Dropbox\RMSv3`  
Durum: Mevcut kampanya editoru bozulmadan, ayri bir gorsel/onizleme sayfasi uzerinde calisiliyor.

## Kisa Ozet

Kullanici, mevcut `/sadakat` kampanya editorunun kosul/eylem tanimi icin fazla karmasik oldugunu soyledi. Istek su: kullaniciya tum editoru ve butun kosul/eylem kutuphanesini bir anda gostermeden, adim adim ilerleyen, secimler biriktikce kampanya tanimini buyuten akilli bir kampanya kurma akisi.

Bu nedenle gercek editor degistirilmedi. Ayri bir preview route eklendi:

`http://localhost:5173/sadakat/kampanya-sihirbazi-onizleme`

Canli dev server kullanicida zaten ayakta olabilir. Kullanici son durumda `http://localhost:5173/` uzerinden calistigini gosterdi.

## Ilgili Dosyalar

- `src/components/pages/LoyaltyCampaignWizardPreview.jsx`
  - Akilli kampanya preview sayfasi.
  - Su an kaydetmez; sadece akisin nasil hissedilecegini ve coklu kosul/eylem modelini gosterir.

- `src/App.jsx`
  - Route kaydi:
    - `/sadakat/kampanya-sihirbazi-onizleme`

- `src/components/pages/LoyaltyManagement.jsx`
  - Ana sadakat ekranina `Akilli Kampanya Kur` butonu eklendi.
  - Ayrica kampanya editorundeki kosul/eylem kartlarina runtime durum rozetleri eklendi.

- `SADAKAT_KOSUL_EYLEM_DAVRANIS_MATRISI.md`
  - Kosul/eylem davranis matrisi.
  - Wizard veya gercek editor degistirilmeden once okunmali.

- `OperationSync.md`
  - Entry 034-038 bu sadakat/wizard calismasinin izini tasiyor.

## Su Ana Kadar Alinan Kararlar

1. Kullaniciya teknik veri kaynagi dili gosterilmemeli.
   - `Railway Postgres`, `public.loyalty_*`, `production tables` gibi ifadeler son kullanici ekraninda uygun degil.
   - Kullanici icin anlamli dil: canli veri, kayit altina alinir, secili kapsam, sadakat tablolari hazir vb.

2. Mevcut kampanya editoru hemen degistirilmeyecek.
   - Once ayri preview sayfasinda tasarim netlestirilecek.
   - Kullanici onayindan sonra gercek kayit modeline baglanacak.

3. Kosul/eylem kutuphanesi ham liste olarak gosterilmemeli.
   - Kullanici 21 kosul saydi ve bunlarin hepsini gostermenin yine karmasa yaratacagini soyledi.
   - Cozum: once kampanya amacina gore `Onerilenler`; isteyen kullanici `Tum kutuphane` acabilir.

4. Coklu kosul ve coklu eylem icin `kosul blogu` modeli korunacak.
   - Her blog: `bu kosullar saglanirsa bu eylemler calisir`.
   - Blog icinde kosullar:
     - `Hepsi gerekli (VE)`
     - `Herhangi biri yeterli (VEYA)`
   - Blog icinde eylemler:
     - `Sirayla uygula`
     - `En iyi eylemi sec`
     - `Kasiyere sectir`

5. Runtime durumu mutlaka gorunur kalmali.
   - `Aninda calisir`
   - `Canli kontrol ister`
   - `Deger defteri yazar`
   - `Motor eksik`
   - `Gosterim`
   - Bu etiketler kullanicinin "tanim var ama calisiyor mu?" karisikligini azaltmak icin eklendi.

## Preview Akisinin Mevcut Yapisi

Sayfa: `src/components/pages/LoyaltyCampaignWizardPreview.jsx`

Adimlar:

1. `Amac`
   - Sepet indirimini hizli kur
   - Tekrar ziyareti artir
   - Uyeye deger kazandir
   - Sepeti buyut

2. `Hedef`
   - Tum musteriler
   - Sadakat uyeleri
   - Secili kategori
   - Kasiyer secsin

3. `Zaman ve kanal`
   - Tum kanallar / POS / Garson / Kiosk / Online
   - Surekli acik / Tarih araligi / Saat araligi

4. `Kosul`
   - Varsayilan: kampanya amacina gore onerilen kosullar.
   - Ileri seviye: `Tum kutuphane`.
   - Blog secimi, yeni blog ekleme, blog silme, kosullari VE/VEYA baglama var.

5. `Eylem`
   - Varsayilan: kampanya amacina gore onerilen eylemler.
   - Ileri seviye: `Tum kutuphane`.
   - Secili blog icinde birden fazla eylem, uygulama sekli secimi var.

6. `Kasa davranisi`
   - Kasiyere sor
   - Uygunsa otomatik uygula
   - Oneri olarak goster

7. `Kontrol`
   - Olusan tanim ve davranis rozetleri gosterilir.

Sag panel:

- Biriken tanim.
- Blog sayisi, toplam kosul sayisi, toplam eylem sayisi.
- Her blogun kosul ve eylem cumlesi.
- Davranis uyarilari.

## Katalog Durumu

Preview icindeki kosul katalogu 21 kosulu kapsayacak sekilde genisletildi:

- `always`
- `calendar_schedule`
- `birthday`
- `period_total_order_amount`
- `period_order_count`
- `period_product_quantity`
- `period_sold_product_quantity`
- `missing_products`
- `happy_hour`
- `gift_card_series`
- `campaign_triggered`
- `coupon_present`
- `manual_approval`
- `days_since_first_activity`
- `customer_has_tag`
- `customer_lacks_tag`
- `referral_source`
- `sales_channel`
- `order_item_quantity`
- `order_total`
- `last_visit_days`

Preview icindeki eylem katalogu genisletildi:

- `free_products`
- `product_pricing`
- `combo_bundle`
- `write_customer_note`
- `send_sms`
- `send_webhook`
- `remove_customer_tag`
- `add_customer_tag`
- `special_discount`
- `order_extra_charge_amount`
- `order_extra_charge_percent`
- `total_order_discount_percent`
- `order_discount_amount`
- `suggest_products`
- `bonus_points`
- `points_percent_of_order`
- `points_earn_multiplier`
- `points_redeem_multiplier`
- `issue_coupon`
- `discount_percent`
- `warning_message`

Not: Bu preview katalogu UI/prototip katalogudur. Gercek runtime davranisi icin `SADAKAT_KOSUL_EYLEM_DAVRANIS_MATRISI.md` esas alinmali.

## Bilinen Sinirlar

- Preview henuz DB'ye yazmaz.
- Preview henuz `loyalty_campaigns` / `loyalty_campaign_rules` modeline taslak uretmez.
- Preview state'i component state'indedir; sayfa yenilenince sifirlanir.
- Runtime status siniflamasi preview icinde tekrar tanimli. Ileride ortak helper'a alinmali.
- Mevcut editor ve preview arasinda henuz birebir import/export yok.
- `Motor eksik`, `Canli kontrol ister`, `Deger defteri yazar` olan secimler gercek executor/value-ledger olmadan "tam calisir" sayilmamalidir.

## Son Dogrulama

Son basarili komut:

```powershell
npm.cmd run build
```

Sonuc:

- Vite build temiz gecti.
- `LoyaltyCampaignWizardPreview` chunk'i olustu.
- OperationSync Entry 038 bu durumu kaydetti.

## Devralan Agent Icin Baslangic Sirasi

1. Once bu dosyayi oku.
2. Sonra `SADAKAT_KOSUL_EYLEM_DAVRANIS_MATRISI.md` dosyasini oku.
3. Sonra `OperationSync.md` Entry 034-038 araligini oku.
4. Preview route'u ac:
   - `http://localhost:5173/sadakat/kampanya-sihirbazi-onizleme`
5. Kullanici yorumunu alirken suna dikkat et:
   - "Kosul/eylem sayisi cok" derse katalogu gizle, onerileri iyilestir.
   - "Birden fazla kosul/eylem nasil olacak" derse blog modelini gelistir.
   - "Gercek kullanima al" derse hemen DB yazmaya gecme; once preview draft -> mevcut campaign/rule schema mapping plani cikar.

## Siradaki En Dogru Isler

1. Preview icin kullanici gozlemi al.
   - Akis fazla uzun mu?
   - Blog modeli anlasilir mi?
   - `Tum kutuphane` butonu fazla gorunur mu?
   - Sag panel kullaniciya yeterince guven veriyor mu?

2. Davranis katalogunu tek kaynaga indir.
   - Su an preview icinde ayri katalog var.
   - Gercek `src/lib/loyalty.js` kosul/eylem tanimlari ve davranis matrisiyle drift riski var.

3. Preview draft modelini gercek kampanya modeline map et.
   - `blocks[]` -> `applicableRules[]` / `periodicRules[]`
   - `conditions[]` -> rule condition + additional conditions
   - `actions[]` -> rule action + additional actions
   - `conditionMode` -> `additionalConditionsMode`
   - `actionMode` icin mevcut modele karsilik veya yeni config alani gerekecek.

4. Kaydetme butonu icin stop rule koy.
   - Preview kaydetmeye baglanmadan once mapping, DB write, readback ve runtime etkisi ayrilmali.
   - Sadece UI kaydetmek "kampanya calisir" anlamina gelmez.

5. UI dilini sade tut.
   - Teknik backend isimleri kullanici ekranina geri gelmemeli.
   - Runtime rozetleri kalmali ama aciklamalari is diliyle yazilmali.

## Dokunma / Dikkat

- Mevcut `/sadakat` kampanya editorunu preview onayi olmadan komple degistirme.
- `SADAKAT_KOSUL_EYLEM_DAVRANIS_MATRISI.md` olmadan kosul/eylem silme veya yeniden adlandirma.
- `OperationSync.md` append-only kullaniliyor; yeni anlamli calismayi yeni entry olarak ekle.
- DB-first proje kurali gecerlidir; final kalicilik localStorage gibi gecici kaynaklara baglanmamali.
- Runtime olmayan eylemleri kullaniciya "hazir/calisir" diye sunma.

## Kullanici Beklentisi

Kullanici tek tek tum kosul/eylemleri tekrar anlatmak istemiyor. Agent'tan beklenen:

- Sadakat modulunu ogrenmis gibi davranmak.
- Kosul/eylem farklarini bilmek.
- UI karmasasini azaltmak.
- Gerekirse kullanici davranis tariflerini alacak zemin hazirlamak.
- Eksik runtime/value-ledger noktalarini saklamadan belirtmek.

