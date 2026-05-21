# Loyalty Master Plan

Yururluk tarihi: `2026-05-13`
Status: `active`
Amac: SuitableRMS sadakat / kampanya modulu icin tek sayfada takip edilen ana plan. Bu dosya "ne kaldÄ±, ne bitti, sirada ne var" sorusunun kisa cevabidir.

## Kullanim Kurali

- Bu dosya loyalty tarafinda ilerleme checklist'i olarak kullanilir.
- Tamamlanan maddeler `[x]` ile isaretlenir.
- Devam eden maddeler `[~]` ile isaretlenir.
- Henuz baslanmayan maddeler `[ ]` ile birakilir.
- Ayrintili baglam icin `LOYALTYMEMORY.md`, operasyonel handoff icin `OperationSync.md` kullanilir.
- Bir madde kapatilinca gerekiyorsa ilgili alt notu da guncellenir.

## Faz 0 - Temel Disiplin

- [x] Loyalty specialist skill olusturulsun.
- [x] `LOYALTYMEMORY.md` loyalty-ozel hafiza olarak aktif kullanilsin.
- [x] Skill memory-first continuation protokoluyle calissin.
- [x] Bu master plan her anlamli loyalty tesliminden sonra guncellensin.

## Faz 1 - Backoffice Loyalty Foundation

- [x] Campaign/rule/tier/coupon/category modeli tek loyalty omurgasinda toplansin.
- [x] Ana loyalty management ekranÄ± gercek persistence akÄ±sÄ±na bagli olsun.
- [~] Wizard create flow ile ana editor parity'si netlestirilsin.
  Not: `/sadakat/kampanya/yeni` halen `LoyaltyManagement`, wizard ayrik route'ta. Wizard Adim 4 artik DB kaynakli `loyalty_campaign_conflict_groups` ile kampanya cakişma gruplarini yonetiyor. Adim 5 kupon/puan konusu degil; kampanya kimligi, ozet, Railway storage/DB metadata gorsel kutuphanesi, gorev olusturma ve duyuru hazirligi icin kullaniliyor.
- [ ] Hazir kampanya sablonlari backoffice tarafina eklensin.
- [ ] Hazir segment kutuphanesi backoffice tarafina eklensin.
- [ ] Lifecycle campaign presetleri eklenip operasyon ekibi icin hizlandirilsin.

## Faz 2 - Runtime Loyalty Execution

- [x] POS tarafinda runtime loyalty campaign evaluation olsun.
- [x] Garson / masa tarafinda runtime loyalty campaign evaluation olsun.
- [x] Kiosk tarafinda runtime loyalty campaign evaluation olsun.
- [x] Session'a yazilan secili kampanya / kupon bilgisi POS ve kioskta daha gorunur kullanilsin.
- [x] Manual approval, advanced condition ve live lookup gerektiren akislarda runtime netligi arttirilsin.
- [x] Wallet / points / redemption posting zinciri siparis kapanisinda daha acik ve tutarli hale getirilsin.

## Faz 3 - Customer Mobile Experience

- [x] `/mobil-app/musteri` bos shell olmaktan cikarilsin.
- [x] Mobil customer loyalty app simulasyonu olusturulsun.
- [x] Standalone public mobile route acilsin.
- [x] Device-level remembered customer login/logout eklensin.
- [x] POS / kiosk QR linkleri mobil musteri deneyimine baglansin.
- [x] Session review ekraninda kampanya ve kupon secimi yapilabilsin.
- [x] Fiziksel telefon gerekmeyen "Mobil simulasyonu ac" akisi eklensin.
- [x] Mobil ekranda secilen avantajlarin POS / kiosk tarafinda daha acik geri bildirimi verilsin.
- [ ] Mobil customer app icinde campaign/session confirmation daha zengin hale getirilsin.
- [ ] Gerekirse mobil customer app icin bildirim hazirligi UI seviyesinde eklensin.

## Faz 4 - Productization Gaps

- [ ] Hazir segmentler: yeni musteri, aktif, uzun suredir gelmeyen, yuksek harcayan, VIP.
- [ ] Lifecycle akislari: hos geldin, 2. ziyaret, 3. ziyaret, dogum gunu, win-back, tier yukselme.
- [ ] Reward model consistency: puan, kupon, ucretsiz urun, indirim, stored value davranislari netlestirilsin.
- [ ] Tier behavior strengthening: gorunurluk, hedef, avantaj, reset/koruma kurallari.
- [ ] Basic abuse/fraud controls: tekil kupon kullanimi, kritik islemlerde onay, manuel odul loglama.
- [ ] Campaign performance / analytics temel seviyesi eklensin.

## Faz 5 - Later Phase

- [ ] Subscription loyalty
- [ ] Advanced gamification
- [ ] Experiential rewards
- [ ] Richer customer profile intelligence
- [ ] A/B testing
- [ ] Offline-to-digital bridges

## Simdiki Oncelik

- [~] Call Center dahil loyalty satis smoke ve DB readback ile loyalty_wallets / loyalty_transactions / loyalty_campaign_redemptions zinciri canli veride dogrulansin.
- [ ] Call Center icin kupon giris / kupon secim akisi dusuk maliyetli parity olarak degerlendirilsin.

## Son Tamamlananlar

- [x] Mobil customer app shell -> gercek loyalty simulasyonu
- [x] Standalone mobile route
- [x] Remembered customer login/logout
- [x] Session review + campaign/coupon selection
- [x] QR yerine dogrudan mobil simulasyon acilis linkleri
- [x] POS / Garson / Kiosk yuzeylerinde hazir avantaj gorunurlugu
- [x] Siparis kapanisinda wallet / points / redemption posting zinciri
- [x] Call Center runtime loyalty evaluation + manual trigger + sale loyalty snapshot + ledger posting
- [x] Campaign wizard operasyon adiminda DB kaynakli cakişma grubu dropdown/modal akisi ve kapsam uyumlu kampanya listeleri
- [x] Campaign wizard Adim 5 kupon/puan detaylarindan arindirildi; kampanya kimligi, ozet, gorsel kutuphanesi, gorev ve duyuru hazirligi eklendi
- [x] Kupon seti yeni/duzenle modali sade seri/kod uretim akisina indirildi; kuponun etkisi kosul/eylem kural modeline birakildi
