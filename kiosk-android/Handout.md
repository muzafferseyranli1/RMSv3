# Kiosk Android — Devir Notu (Handout)

**Tarih:** 2026-06-19  
**Proje:** `X:\RMSv3\kiosk-android\`  
**Paket:** `com.suitable.kiosk.debug` (Debug Modu)  
**Son Build:** DEBUG APK — BUILD SUCCESSFUL ✅

---

## Genel Durum ve Yapılanlar

| Faz | Kapsam | Durum | Açıklama |
|-----|--------|-------|----------|
| Faz 1 | Proje iskeleti + Eşleme ekranı | ✅ TAMAMLANDI | Kolon adları mismatch giderildi (`activation_code`, `device_type`, `terminal_name`). |
| Faz 2 | Veri katmanı | ✅ TAMAMLANDI | `channel_prices` JSON dizisi çözme ve fiyat hesabı çözüldü. |
| Faz 3 | BigScreen UI | ✅ TAMAMLANDI | Kategori sidebar, ürün gridi, sepetFAB ve ödeme onay ekranı. |
| Faz 4 | Tablet UI | ⏳ BEKLİYOR | Yatay (split layout) ve dikey mod desteği. |
| Faz 5 | Ortak bileşenler | ⏳ SÜRÜYOR | ComboBuilder adımları tamamlandı. |
| Faz 6 | PIN / Sıfırlama | ✅ TAMAMLANDI | Logo 7 kez tıklama + "1903" admin PIN ile sıfırlama çalışıyor. |

---

## Son Gelişmeler ve Sipariş Gönderme Hatası
1. **Derleme & Kurulum**: Uygulama sıfır hata ile derleniyor (`BUILD SUCCESSFUL`).
2. **Kiosk Logo & Karşılama (Idle) Ekranı**: Web kiosk paritesiyle uyumlu şekilde `settings.kiosk_logo_url` üzerinden Ironman Kaskı logosu yükleniyor.
3. **ComboBuilder Entegrasyonu**: Adımlar (Hamburger -> Patates -> Coca-Cola) arasında "Sonraki" ve "Sepete Ekle" geçişleri başarıyla tamamlandı. Sepet Fab rozeti `1` olarak güncelleniyor.
4. **Ödeme Akışı Hatası**: Sepetten "Ödemeye Geç" dedikten sonra "Ödemeyi Onayla" butonuna basıldığında `Sipariş kaydedilemedi` (Sipariş Gönderilemedi) uyarısı alınıyor. 
   - `test_sales_insert.js` üzerinden yapılan manuel node.js POST testi, `kiosk_station_code` alanı çıkarıldığında veritabanına başarıyla kaydetti.
   - Detaylı hata teşhisi için `KioskRepository.kt` içerisindeki Retrofit `HttpLoggingInterceptor` log seviyesi `BASIC`'ten `BODY`'ye yükseltildi.

---

## Sonraki Adımlar (Gelecek Agent İçin Handoff)
1. **Logcat Teşhisi**: Uygulamayı emülatörde çalıştırıp sepeti onaylayın ve logcat üzerinden HTTP istek/yanıt detaylarını (veritabanı hatasını) inceleyin.
2. **Hata Düzeltme**: `sales`, `sale_lines` ve `sale_payments` tablolarına insert edilirken DB şemasının reddettiği bir alan var mı tespit edin ve `KioskDataViewModel.submitOrder()` içindeki veri oluşturma akışını düzeltin.
3. **Faz 4 Tablet Ekranı**: `KioskTabletScreen.kt` yatay modda sepeti her zaman açık (split-layout) gösterecek şekilde doğrulanmalı/tamamlanmalıdır.
