# Personel Native Android Uygulaması (personel-android) Geliştirme Planı

Bu plan, web tabanlı simülasyon olarak çalışan `/personel-app` uygulamasının, tıpkı `musteri-android` gibi native bir Android uygulamasına dönüştürülmesini hedefler. İlk aşamada "Garson" sekmesine ağırlık verilecek ve sipariş alma ekranı müşteri uygulamasıyla birebir aynı olacaktır.

## 1. Geliştirme Aşamasında Uygulamaların Karışmasını Önleme Stratejisi

İki farklı mobil uygulamayı aynı projede geliştirirken (Müşteri ve Personel), AI taleplerinin ve kodların birbirine girmemesi için aşağıdaki yöntemleri izleyeceğiz:

*   **Fiziksel İzolasyon:** Personel uygulaması `C:\RMSv3\personel-android` adlı tamamen yeni ve ayrı bir klasörde yaşayacak.
*   **Paket (Package) Ayrımı:** Müşteri uygulaması `com.suitable.musteri` paketini kullanırken, personel uygulaması `com.suitable.personel` paketini kullanacak.
*   **Açık İletişim:** Benden (Antigravity'den) bir şey isterken mutlaka hangi uygulamada değişiklik istediğinizi belirtin (Örn: *"Personel uygulamasındaki garson ekranında..."* veya *"Müşteri uygulamasının sepetinde..."*).
*   **Bağımsız Veri Katmanı:** İlk aşamada (MVP) iki uygulamanın ortak kullandığı sınıfları (Örn: `ApiClient.kt`, Veritabanı modelleri) tek bir kütüphane yapmak yerine **kopyalayarak çoğaltacağız**. Böylece personel uygulamasına eklediğimiz yeni bir yetenek, yanlışlıkla müşteri uygulamasını bozmayacak.

## 2. Mimari ve İlk Kurulum

*   `C:\RMSv3\musteri-android` projesinin temel iskeleti klonlanarak `C:\RMSv3\personel-android` oluşturulacak.
*   Paket adları, Gradle ayarları ve uygulama adı (`Personel App`) güncellenecek.
*   Material 3 tasarımı ve Jetpack Compose kullanılmaya devam edilecek.

## 3. Ekranlar (React Simülasyonundan Native'e)

### A. Personel Girişi (PIN Gate)
*   **Mevcut (React):** `StaffPinGate`
*   **Native:** `PinLoginScreen.kt`. Sadece yetkili personelin (Garson, Müdür vb.) sisteme PIN ile giriş yapmasını sağlayacak ekran.

### B. Ana Navigasyon (Drawer / Bottom Bar)
*   Uygulama açıldığında bir Navigation Drawer (Yan Menü) veya Bottom Navigation ile şu sekmeler olacak:
    *   Ana Sayfa (Dashboard - Görevler, PDKS durumu)
    *   Görevler
    *   PDKS (Giriş/Çıkış)
    *   **Garson Terminali** (Şu anki odak noktamız)
    *   Siparişler
    *   Mal Kabul

### C. Garson Terminali ve Sipariş Alma (Odak Noktası)
*   **Masalar Ekranı:** Garsonların masaları gördüğü, dolu/boş durumunu takip ettiği liste/grid.
*   **Sipariş Alma Ekranı:** `musteri-android` içindeki `TableOrderScreen.kt` dosyası buraya taşınacak.
    *   *Fark:* Müşteri uygulamasında sipariş verilirken "Müşteri Bilgisi" giderken, burada "Garson Bilgisi" (`activeStaff`) ile sipariş `sales` tablosuna yazılacak.
    *   Sipariş ekranı görsel ve fonksiyonel olarak tamamen müşteri ile aynı (uçan animasyonlar, sepet vb.) olacak.

## User Review Required

> [!IMPORTANT]  
> 1. İki uygulamanın karışmaması için `personel-android` adında yeni bir Android projesi başlatacağım ve ilk adım olarak Garson sekmesini (Masa listesi + Müşteri uygulamasındaki Sipariş Ekranı) yapacağım. Uygun mudur?
> 2. Projenin iskeletini oluşturmak için `musteri-android` projesini kopyalayıp isimlerini değiştirmek en hızlı ve güvenli yoldur. Bu şekilde ilerleyebilir miyim?
> 3. İki uygulama arasındaki kodları ortak bir "core" kütüphaneye koymak yerine, ilk aşamada ayrı ayrı tutmayı önerdim (bağımsızlık için). Onaylıyor musunuz?

Lütfen planı inceleyip onay verin, ardından Android projesini oluşturmaya başlayalım.
