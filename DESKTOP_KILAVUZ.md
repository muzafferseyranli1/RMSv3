# SuitableRMS Masaüstü (Desktop) Uygulaması Kılavuzu

Bu belge, SuitableRMS masaüstü (.exe) uygulamasının mimarisini, yayınlama süreçlerini, kesin kurallarını (kırmızı çizgilerini) ve sorun giderme yöntemlerini içerir. Gelecekteki geliştirmelerde ve yaşanabilecek sorunlarda bir rehber olması amacıyla hazırlanmıştır.

---

## 1. Mimari Yapı (Nasıl Çalışır?)

SuitableRMS, temelde iki ayrı yapıdan oluşur ancak tek bir kod tabanında (monorepo mantığıyla) yönetilir:

1. **Web (React + Vite):** Kullanıcı arayüzünü (UI) oluşturan bölümdür. Bulutta çalışır ve `npm run dev` ile tarayıcı üzerinden erişilebilir.
2. **Masaüstü (Electron):** Web projesindeki arayüzü alıp, tıpkı Chrome gibi kendi içinde çalıştıran ve Windows sistemine entegre eden (yazıcı bağlantısı, yerel veritabanı okuma/yazma, vb.) kabuktur. 

### Kasa Rolleri: Master (Ana Kasa) ve Slave (Yan Kasa)
* **Master (Ana Kasa):** Şubenin ana makinesidir. Railway (veya Supabase) üzerindeki ana bulut veritabanına doğrudan bağlanır. Kendi yerel ağı içinde (LAN) bir sunucu gibi çalışarak diğer kasalara veri sağlar.
* **Slave (Yan Kasa):** Buluta **asla doğrudan bağlanmaz**. Kendi yerel ağındaki Master kasanın IP adresine (örneğin `192.168.1.100:4000`) bağlanarak verileri Master'dan çeker. Eğer ortamda Master kasa açık değilse, Slave kasa sisteme giremez ve "Ağ Hatası" verir.

---

## 2. Kırmızı Çizgiler (Kesin Kurallar) 🚨

Masaüstü uygulamasında hataların veya veri kayıplarının önüne geçmek için aşağıdaki kurallara **kesinlikle uyulmalıdır:**

1. **Token Güvenliği:** 
   * `GH_TOKEN` bilgisi **ASLA** doğrudan kodların içine (örn: `updater.cjs` veya `package.json`) yazılmaz! 
   * Token bilgisi sadece bilgisayarınızdaki gizli `.env` dosyasında durmalıdır. (Bu dosya `.gitignore` içinde olduğu için GitHub'a gitmez, güvenli kalır).
2. **Versiyon Numarası Kuralı:** 
   * Masaüstü uygulamasında bir yeri değiştirdikten sonra yeni Setup (.exe) üretmeden önce `package.json` içindeki `"version"` numarası **kesinlikle artırılmalıdır.** (Aksi takdirde sahadaki cihazlar güncellemeyi fark etmez).
3. **Rollerin Değiştirilmemesi:** 
   * Bir bilgisayar `Yan Kasa (Slave)` olarak kurulmuşsa arka planda zorla `Ana Kasa (Master)` yapılmaya çalışılmamalıdır. Eşleştirme ekranından cihaz silinip tekrar doğru rolle (Ana Kasa) eşleştirilmelidir.
4. **Klasör Yolları (Paths):** 
   * Electron uygulamasında yerel dosyalarla çalışırken (veritabanı vb.) doğrudan `C:\RMSv3` gibi yollar kullanılmaz. Kullanıcının bilgisayarında projenin nereye kurulacağı belli olmadığı için her zaman `app.getPath('userData')` (Yani `%APPDATA%\suitable-rms`) kullanılmalıdır.

---

## 3. Otomatik Güncelleme (Auto-Updater) Süreci

SuitableRMS, **Electron-Updater** kütüphanesi ile kendi kendini güncelleyebilecek yapıdadır. 

### Sahadaki 100 Cihaz Nasıl Güncellenir?
Eski yöntemdeki "kodu değiştir -> setup yap -> usb ile dağıt" devri kapanmıştır. Yeni süreç şöyledir:

1. Web veya masaüstü kodunda (buton rengi, yeni özellik vb.) değişikliğinizi yapın.
2. Proje ana dizinindeki **`Yayinla.bat`** dosyasına çift tıklayın.
3. Çıkan siyah ekranda:
   * Değişiklik özetini yazın.
   * Versiyon numarasını ne kadar artıracağınızı (1, 2 veya 3) seçin.
4. `Yayinla.bat` arka planda sırasıyla;
   * Kodları GitHub'a yollar.
   * `package.json` içindeki versiyonu günceller.
   * Yepyeni bir `Setup.exe` derler.
   * GitHub deponuzdaki `Releases` sayfasına bu Setup'ı yükler.
5. **Sahadaki Cihazlar:** Cihazlar masaüstü uygulamasını ilk kapattıklarında veya açtıklarında arka planda GitHub'ı kontrol eder. Yeni versiyonu görüp otomatik indirirler ve kullanıcı hiçbir şeye tıklamadan uygulama yeni sürümle açılır.

---

## 4. Sorun Giderme (Troubleshooting)

Sahadan bir hata raporu geldiğinde ilk bakılacak yerler:

* **Cihaz Eşleşmiyor / Pin Kabul Etmiyor:** 
  Cihaz yanlışlıkla "Yan Kasa" olarak kurulmuş olabilir ve ağda Master bulamıyor olabilir. Windows'ta şu klasöre gidin:
  `C:\Users\KullaniciAdiniz\AppData\Roaming\suitable-rms\terminal-config.json`
  Bu dosyayı Not Defteri ile açın. Eğer `terminalRole` kısmı `"slave"` ise cihaz Yan Kasa'dır.
* **Güncelleme Gelmiyor:** 
  Cihazın internet bağlantısını kontrol edin. Son yayınladığınız GitHub sürüm numarasının, cihazdaki sürüm numarasından **büyük** olduğuna emin olun.
* **Publish (Yayın) Başarısız Oluyor:** 
  Terminale `GH_TOKEN` tanımlanmamıştır veya süresi dolmuştur. Yeni bir klasörde çalışıyorsanız klasörün içine bir `.env` dosyası oluşturup içine `GH_TOKEN=ghp_...` yazmayı unutmayın.

---
*Bu belge, uygulamanın sorunsuz bir yaşam döngüsüne sahip olması için Antigravity tarafından oluşturulmuştur.*
