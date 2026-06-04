# RMSv3 Güncelleme Özeti ve Doğrulama Raporu

## 1. Tekrarlayan Görevler, Görsel Modal Ayrımı ve PDKS Vardiya Kontrolü

Bu güncelleme ile görev yönetimi sistemi geliştirilmiş ve mobil PDKS giriş/çıkış işlemlerine vardiya tolerans kontrolü eklenmiştir.

### Neler Yapıldı?

#### Web Paneli Görev Detayları & Modal Tasarımı
- **Tekrarlayan Görev Alanları:** `Tasks.jsx` ekranına Günlük (sıklık), Haftalık (gün seçiciler), Aylık (belirli gün, son gün veya N. gün modelleri) ve Yıllık (tarih listesi) seçeneklerine göre dinamik olarak açılan kural tanımlama alanları eklendi.
- **Görsel Ayrışma (Modal Headers):** Web panelindeki modal kutularının (Yeni Görev, Duyuru Yayınla, Görev Tamamlama, Geri Gönderme, Görevi Devretme) sol üst köşelerine farklı renk tonlarında dikey şeritler (Mor, Sarı, Yeşil, Kırmızı) eklenerek kullanıcı dostu bir görünüm kazandırıldı. Türkçe karakterler tamamen normalize edildi.

#### Mobil Uygulama Görev Yönetimi (Recurrence Support)
- **TaskRepository:** Kotlin veri katmanındaki `createTask` API çağrısı, veritabanındaki `task_recurrence_rules` tablosuyla tam uyumlu çalışacak şekilde tüm yeni parametrelerle (`intervalValue`, `weekdays`, `monthDay`, `monthNth`, `monthWeekday`, `specificDates`) donatıldı.
- **TasksScreen:** Mobil arayüzde yeni görev oluştururken tekrar türü seçimlerine bağlı olarak dinamik alanlar (sayısal girişler, çoklu gün seçiciler) Jetpack Compose bileşenleriyle eklendi.

#### PDKS Vardiya Zaman Toleransı
- **HomeScreen:** Personel bugün kartı üzerinden mesaiye başlarken veya bitirirken planlanmış vardiya zamanı kontrol edilmektedir.
- Planlanan saat ile fiili giriş/çıkış saati arasında 5 dakikadan fazla fark olması durumunda aşağıdaki Türkçe uyarılar diyalog ekranlarında belirgin bir şekilde gösterilir:
  - Giriş Geçi: `⚠️ Vardiya planınızda {dakika} dk geç giriş yapıyorsunuz.`
  - Giriş Erkeni: `⏰ Vardiya planınızda {dakika} dk erken giriş yapıyorsunuz.`
  - Çıkış Erkeni: `⏰ Vardiya planınızda {dakika} dk erken çıkış yapıyorsunuz.`
  - Çıkış Geçi: `⚠️ Vardiya planınızda {dakika} dk geç çıkış yapıyorsunuz.`

### Doğrulama Sonuçları
- **Web Build:** `npm run build` komutuyla projenin sıfır hata ile derlendiği doğrulandı (SUCCESSFUL).
- **Android Build:** `.\gradlew.bat compileDebugKotlin` derleme komutu başarıyla çalıştırıldı (BUILD SUCCESSFUL).

---

## 2. Garson Modülü Güncellemesi

Garson modülü için gerekli olan terminal eşleştirme, bildirim alma ve sipariş atama süreçleri başarıyla tamamlandı. Sistemin genel akışı ve yapılan değişiklikler aşağıda özetlenmiştir.

### Neler Yapıldı?

#### Garson Terminali Seçimi ve Eşleştirme
*   **Terminal Seçim Ekranı:** Garson modülüne girildiğinde, sistem garsonun halihazırda bir terminale bağlı olup olmadığını kontrol eder. Eğer bağlı değilse, veritabanından `device_type = 'masa'` olan cihazlar taranır ve **Garson Terminali Seçin** ekranı gösterilir.
*   **SharedPreferences Yönetimi:** Seçilen terminal bilgileri (`selectedGarsonTerminalId`) yerel olarak kaydedilir.
*   **Bölge Yetkilendirmesi (`allowed_zones`):** Terminal seçildikten sonra masalar, bu terminalin yetkilendirilmiş olduğu bölgelere (`hallId` veya `sectionId`) göre filtrelenir. Eğer kısıtlama yoksa tüm masalar gösterilir.

#### Aktif Garson Takibi
*   **Oturum Kaydı:** Personel bir terminal seçtiğinde (veya daha önceden seçili terminalle ekrana girdiğinde), `settings` tablosundaki `garson_active_sessions` anahtarına kendi personel ID'sini ve terminal ID'sini kaydeder.
*   **Çıkış Yapma:** Personel yan menüden `Çıkış Yap` butonuna bastığında, aktif olduğu garson terminalindeki oturumu veritabanından silinir ve bağlantısı kesilir.

#### Müşteri Talepleri ve Sipariş Atama
*   **Canlı Masa Dinleme:** `TableScreen` üzerinde masaların durumu, açık adisyonları ve müşteri talepleri (Garson çağır / Hesap iste) anlık olarak dinlenmektedir.
*   **Pulse Efekti:** Çağrı veya hesap talebi olan masalar, kolayca fark edilebilmeleri için renkli ve animasyonlu (pulse) bir sınırla gösterilir.
*   **Sipariş Atama (Waiter Assignment):** Müşterilerden gelen ve garson atanmamış siparişler (`status = 'pending_waiter_assignment'`), eğer terminalin yetki alanındaki bir masadan gelmişse anında uyarı ekranı (AlertDialog) çıkartır.
*   **PIN ile Kabul Etme:** Garson, bu gelen bildirimi "Siparişi Kabul Et" diyerek ve kendi personel **PIN** kodunu girerek onaylar. Bu işlem siparişin durumunu `active` yapar ve sipariş ilgili garsonun üzerine yazılır (`waiter_id` güncellenir).

> [!TIP]
> Garson modülü şu anda web tarafıyla tamamen aynı veritabanı altyapısını kullanarak, native mobil deneyimi sağlayacak şekilde güncellenmiştir.

### Ekranlar Arası Geçiş ve Aksiyonlar
Masa kartına tıklandığında açılan alt menü (Dialog) üzerinden:
*   Masa durumu (Dolu / Boş) ve ürün sayısı görüntülenebilir.
*   Yeni sipariş alınabilir.
*   Adisyon detayları görülebilir.
*   Aktif çağrılar ve hesap talepleri kapatılabilir (`resolved`).
*   Masa adisyonu temizlenebilir/boşaltılabilir.

[HomeScreen Kodu](file:///C:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/ui/main/HomeScreen.kt)
[TableScreen Kodu](file:///C:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/ui/main/TableScreen.kt)
[Device Repository Kodu (Oturum Yönetimi)](file:///C:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/data/DeviceRepository.kt)

---

## 3. Konum Doğrulamalı QR Mesai Giriş Entegrasyonu

Bu güncelleme ile mobil uygulamada vardiya başlatırken, şubeye özel bir QR kodu taratılması ve cihazın GPS konumu ile şubenin kayıtlı enlem/boylam koordinatları arasındaki mesafenin kontrol edilmesi özelliği başarıyla tamamlanmıştır.

### Neler Yapıldı?

#### Web Paneli (Şube Tanımları Koordinat Girişi)
- [Company (1).jsx](file:///C:/RMSv3/src/components/pages/Company%20(1).jsx) dosyasında şube düğümleri için enlem (`latitude`) ve boylam (`longitude`) alanları eklendi.
- Yöneticilerin şube tanımları formunda koordinatları girmesi ve şube detaylarında bu koordinatların görüntülenebilmesi sağlandı.
- Test amacıyla Kadıköy Şubesi koordinatı veritabanında `41.028595, 29.177221` olarak güncellendi.

#### Android Uygulaması (Oturum Modeli & Konumlu QR Giriş Kontrolü)
- [PinLoginScreen.kt](file:///C:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/ui/main/PinLoginScreen.kt) içerisinde `StaffSession` modeli güncellenerek aktif şubenin enlem ve boylam bilgileri oturum verisi haline getirildi.
- [AndroidManifest.xml](file:///C:/RMSv3/personel-android/app/src/main/AndroidManifest.xml) dosyasına `ACCESS_FINE_LOCATION` ve `ACCESS_COARSE_LOCATION` konum izinleri eklendi.
- [HomeScreen.kt](file:///C:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/ui/main/HomeScreen.kt) üzerinde "Vardiya Başlat" (Bugün kartına tıklanması) işlemi sırasında çalışan akış:
  1. **Konum İzinlerinin Kontrolü:** İzin verilmemişse Compose `RequestMultiplePermissions` launcher'ı ile konum izni istenir.
  2. **QR Barkod Okuyucu:** İzin verildikten sonra zxing barcode okuyucu başlatılır.
  3. **QR Doğrulama:** Okunan QR'ın branchId değeri JSON veya düz dize olarak doğrulanarak personelin aktif şube ID'si ile eşleştiği kontrol edilir.
  4. **GPS Konumu ve Geofencing:** Cihazın GPS konumu native `LocationManager` ile sorgulanır. Şube koordinatları ile cihaz konumu arasındaki mesafe `Location.distanceBetween` kullanılarak hesaplanır.
  5. **Tolerans Kontrolü:** Mesafe 100 metreden fazla ise mesai başlatılması engellenerek `"Şubede görünmüyorsunuz. Giriş yapmak için lütfen şube sınırları içerisinde bulunun."` uyarısı gösterilir. Mesafe 100m veya daha az ise PDKS mesai başlatma diyaloguna geçilerek vardiya başlatılır.
  6. **GPS Zaman Aşımı:** GPS sinyali zayıf olduğunda kullanıcının ekranın kilitlenmesini önlemek için 8 saniyelik bir zaman aşımı eklenmiştir.
  7. **Vardiyayı Bitirme Kontrolü:** Mesai bitirme (Bitir butonu) işlemi tetiklendiğinde cihazın anlık GPS konumu sorgulanır. Şube merkezinden 100 metreden fazla uzaklaşılmışsa mesainin kapatılması engellenerek Türkçe uyarı diyalogu gösterilir.

### Doğrulama ve Derleme Sonuçları
- **Web Build:** `npm run build` ile web projesinin sorunsuz derlendiği doğrulandı.
- **Kotlin Derleme:** `.\gradlew.bat compileDebugKotlin` ile Kotlin kodlarının hatasız derlendiği test edildi.
- **APK Derleme:** `.\gradlew.bat assembleDebug` komutuyla debug APK paketleme işlemi başarıyla tamamlandı.

[PinLoginScreen.kt Kodu](file:///C:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/ui/main/PinLoginScreen.kt)
[HomeScreen.kt Kodu](file:///C:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/ui/main/HomeScreen.kt)
[AndroidManifest.xml](file:///C:/RMSv3/personel-android/app/src/main/AndroidManifest.xml)

---

## 4. Çalışma Planı (Shift Plan) Ekranı Entegrasyonu

Bu güncelleme ile mobil uygulamada personelin kendisi için planlanmış vardiyaları listeleyebileceği modern bir "Çalışma Planı" ekranı entegre edilmiştir.

### Neler Yapıldı?

#### Android Veri Katmanı Değişiklikleri
- [TaskRepository.kt](file:///C:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/data/TaskRepository.kt) dosyasındaki `ShiftScheduleEntry` modeli güncellenerek `breakMinutes` (mola süresi) alanı eklendi ve veritabanındaki `break_minutes` alanı modellendi.
- Tarih aralığı bazlı sorgu için `fetchShiftsForPersonnelRange` fonksiyonu entegre edildi. Bu sayede API'nin gte/lte filtreleri kullanılarak sadece istenilen aralıktaki vardiya verileri çekilmektedir.

#### Navigasyon ve Ekran Yönlendirmeleri
- [NavigationKeys.kt](file:///C:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/NavigationKeys.kt) dosyasına yeni ekranın rotası olan `@Serializable data object ShiftPlan : NavKey` eklendi.
- [MainScreen.kt](file:///C:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/ui/main/MainScreen.kt) içerisinde `shift_plan` yönlendirmesi tanımlandı ve `ShiftPlanScreen` composable'ına yönlendirildi.
- [HomeScreen.kt](file:///C:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/ui/main/HomeScreen.kt) yan menüsüne (Sidebar) "🗓️ Çalışma Planı" seçeneği eklendi. Ayrıca anasayfada yer alan "Yarın" (Tomorrow) ve "Sonraki" (Next) vardiya kartlarının tıklama olaylarına (onClick) `shift_plan` rotasına yönlendirme tanımlandı.

#### Arayüz ve Tasarım (ShiftPlanScreen.kt)
- [ShiftPlanScreen.kt](file:///C:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/ui/main/ShiftPlanScreen.kt) dosyasında Jetpack Compose tabanlı yeni bir arayüz geliştirildi:
  - Sayfanın en üstünde personelin "Bugünkü" vardiya planı en ince ayrıntısına (Giriş/Çıkış saatleri, Mola süresi, Net çalışma süresi) kadar kart tasarımıyla vurgulandı.
  - Alt kısımda cari aya ait diğer tüm vardiya planları kronolojik sıra ile listelenmektedir.
  - Her mesai günü için mola süresi düşülerek net çalışma saati hesaplanır ve gösterilir (örn. "7.5 Saat").
  - Veri trafiğini minimumda tutmak adına, ekran ilk açıldığında sadece **bugün ve gelecek günlerin** vardiya verilerini çeker. Kullanıcı sağ üst köşedeki yenileme butonuna tıkladığında ise **geçmiş günleri de içeren tüm ayın** vardiyaları sorgulanır ve arayüz güncellenir.

### Titreme (Flickering) ve Sürekli Yüklenme Düzeltmesi
- Ekranlar arası her yönlendirmede (`currentRoute` değiştiğinde) `HomeScreen` ve `ShiftPlanScreen` composable bileşenleri yok olduğu için, `shifts` ve `isLoading` gibi yerel durum değişkenleri sıfırlanıyor ve her sayfa açılışında veriler gelene kadar 1-2 saniye boyunca "Vardiya Yok" uyarısı gösteriliyordu.
- Bu sorunu çözmek için vardiya listesi ve yükleme durumları (loading states) üst katman olan [MainScreen.kt](file:///C:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/ui/main/MainScreen.kt) dosyasına taşındı (State Hoisting).
- Veriler üst katmanda saklandığı için, sayfalar arası geçişlerde vardiya bilgileri anında yüklenir ve herhangi bir titreme (flicker) yaşanmaz. Arka planda `LaunchedEffect` ile veri güncelliği sorgulanmaya devam eder.
- Ayrıca yükleme esnasında boş veri gösterilmesini engellemek için, ilk yükleme durumlarında arayüzde "Vardiya Yok" yerine "Yükleniyor..." bilgisi gösterilmesi sağlandı.

### Doğrulama ve Derleme Sonuçları
- **Android Kotlin Derleme:** `.\gradlew.bat compileDebugKotlin` ile Kotlin kodlarının hatasız derlendiği test edildi.
- **Android APK Derleme:** `.\gradlew.bat assembleDebug` komutuyla debug APK paketleme işlemi başarıyla tamamlandı.

[ShiftPlanScreen.kt Kodu](file:///C:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/ui/main/ShiftPlanScreen.kt)
[TaskRepository.kt Kodu](file:///C:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/data/TaskRepository.kt)
[HomeScreen.kt Kodu](file:///C:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/ui/main/HomeScreen.kt)

---

## 5. Görev Ekleri, Form Gösterimi ve Durum Aksiyonları Entegrasyonu

Bu güncelleme ile mobil uygulamadaki görevler ekranında, formlardan otomatik oluşturulmuş görevlerin ve ilişkili eklerin gösterilmesi ile görev durumunu değiştiren aksiyonların entegrasyonu başarıyla tamamlanmıştır.

### Neler Yapıldı?

#### 1. Android Veri Katmanı Değişiklikleri (`TaskRepository.kt`)
- `TaskItem` veri sınıfına `delegationAllowed` özelliği eklendi ve Postgres tablosundaki `delegation_allowed` alanı ile eşleştirildi.
- Eklerin listelenmesi için `TaskAttachment` modeli, form şablonu ve yanıt detayları için `FormSubmissionDetail` ve `FormSubmissionPhoto` modelleri tanımlandı.
- Görev eklerini çeken `fetchTaskAttachments` ve form gönderim yanıtlarını getiren `fetchFormSubmissionDetail` veri sorgu fonksiyonları eklendi.
- "Geri Gönder", "Delege Et", "Pasife Al", "Sistem Mesajı Ekle" işlemleri için `sendBackTask`, `delegateTask`, `softDeleteTask`, ve `addSystemChatMessage` veritabanı eylemleri eklendi.

#### 2. Görev Detayları & Arayüz Temizliği (`TasksScreen.kt`)
- Görev açıklamasındaki `[Form ID: <submission_id>]` gibi teknik form kimlikleri Regex (`\\[Form ID:\\s*([^\\]]+)\\]`) yardımıyla temizlenerek kullanıcılara sade bir açıklama metni sunuldu.
- Temizlenen açıklamaların altında, sadece otomatik formlardan türeyen görevlerde görünen şık bir mor renkli **"İlişkili Form Yanıtını Göster"** butonu yerleştirildi.
- Görevin veritabanında kayıtlı ekleri (`task_attachments`) algılanıp "Ekler" başlığı altında listelendi. Görsel ekler Coil `AsyncImage` ile, diğer dosyalar dosya simgeli tıklanabilir linkler halinde gösterildi.

#### 3. Form Gösterim Ekranı (`FormDetailDialog`) Mobil-First Yeniden Tasarımı
- **Dikey Hizalanmış Stacked Kart Düzeni:** Web sürümünden kalan yan yana (Row) yerleşim modeli, dar mobil ekranlarda soruların dikey olarak tek tek harflerle sarılmasına (`s o r u n l` gibi) ve kaymalara sebep oluyordu. Bunun yerine tüm soru ve cevap blokları dikey olarak üst üste yığılacak (`Stacked Column`) şekilde native mobil tasarıma göre sıfırdan baştan yazıldı. Soru kartları ekran genişliğine göre esneyebilir hale getirildi.
- **Kompakt Mobil Başlık (Header) Alanı:** Ekranın büyük bir kısmını kaplayan hantal mor başlık kutusu kaldırıldı. Yerine form adını, şube adını ve sağ üst köşede temiz bir kapatma simgesi (`Close`) barındıran, dikeyde yer kaplamayan şık ve kompakt bir üst bilgi çubuğu yerleştirildi.
- **Dinamik Kart Çerçeveleri:** Yanıtların durumuna göre (kritik hata veya uygunsuzluk) kartların arka plan ve kenarlıkları (`BorderStroke`) kullanıcıyı görsel olarak uyaracak şekilde yumuşak kırmızı tonlarla, başarılı cevaplar ise standart koyu mavi tonlarla tasarlandı.
- **Dialog Pencere Çerçeveleri:** AlertDialog varsayılan dolguları yerine doğrudan Compose `Dialog` bileşeni kullanılarak ekran alanının maksimum verimle kullanılması ve dialogun dar cihazlarda kenarlara kusursuz oturması sağlandı.

#### 4. Görev Durum Aksiyon Butonları & Popuplar
- Detay modalının alt kısmına dinamik olarak durum eylem butonları eklendi:
  - **Başlat / Tamamla / Aktifleştir**: Görevin durumuna göre (open, in_progress, soft_deleted) uygun aksiyonu başlatan butonlar entegre edildi.
  - **Geri Gönder (Send Back)**: Kullanıcıdan iade gerekçesi alan prompt popup'ı (`AlertDialog`) entegre edildi ve onaylandığında durumu `rejected` yapıp chat akışına sistem mesajı düştü.
  - **Delege Et (Delegate)**: Personelleri listeleyen ve seçim sonrasında onay talebi oluşturan `LazyColumn` içerikli bir delege seçici diyalog eklendi.
  - **Pasife Al (Soft Delete)**: Görev oluşturucuya özel pasife alma onay diyalogu bağlandı.

### Doğrulama ve Derleme Sonuçları
- **Hata Düzeltmeleri:** Compose `AlertDialog` ve Modifier `.border` import eksiklikleri ile `TaskItem` veri sınıfı imza eksiklikleri düzeltildi.
- **Android Kotlin Derleme:** `.\gradlew.bat compileDebugKotlin` komutuyla projenin Kotlin kodlarının sıfır hata ile derlendiği doğrulandı (**BUILD SUCCESSFUL**).

[TasksScreen.kt Kodu](file:///C:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/ui/main/TasksScreen.kt)
[TaskRepository.kt Kodu](file:///C:/RMSv3/personel-android/app/src/main/java/com/suitable/personel/data/TaskRepository.kt)

---

## 6. Görev Tamamlama Arayüzü, Atanan Kişi Kontrolü, Tarih Seçici ve APK Derlemesi

Bu güncelleme ile görevler ekranında detaylı görev tamamlama, tarih güncelleme, çoklu atanan personelin kendi durumunu işaretlemesi (`isCompleted`), izleyicilerin (watchers) onay kutusu şeklinde yönetimi ve son durumun APK paketi haline getirilmesi süreçleri tamamlanmıştır.

### Neler Yapıldı?

#### 1. Çoklu Atanan Kişiler (Assignees) & Tamamlama Checkmark Desteği
- Görev detaylarında her bir atanan personel için durumunu (`isCompleted` değeri ile) işaretleyebileceği bir onay kutusu (Checkbox) yerleşimi eklendi.
- Personeller kendi görev kısımlarını bağımsız olarak tamamlandı/tamamlanmadı şeklinde işaretleyebilmektedir.

#### 2. Görev Başlangıç ve Bitiş Tarihlerinin Güncellenmesi (Tarih Seçici)
- Görevin başlangıç (`startDate`) ve bitiş/teslim (`dueDate`) tarihlerinin güncellenebilmesi amacıyla Compose DatePicker entegrasyonu sağlandı.
- Kullanıcılar görev detayındaki takvim ikonlarına tıklayarak başlangıç ve teslim tarihlerini dinamik olarak değiştirebilmektedir.

#### 3. İzleyiciler (Watchers) Yönetimi
- Göreve dahil olan veya izleyen personellerin yönetimi için checkbox listeleri eklendi.

#### 4. Kapatma Özeti (Closure Summary) Popupları
- Görev kapatılırken/tamamlanırken kapatma özeti ve açıklaması girilmesine olanak tanıyan özel popuplar eklendi.

#### 5. APK Derleme (Build APK)
- Projenin son durumunu içeren debug sürümü Gradle paketi başarıyla derlendi.
- Derleme işlemi `.\gradlew.bat assembleDebug` komutu kullanılarak başarıyla tamamlandı.

### Derleme Sonuçları
- **Android APK Derleme:** `.\gradlew.bat assembleDebug` komutuyla debug APK paketleme işlemi sorunsuz tamamlandı (**BUILD SUCCESSFUL**).
- **Üretilen APK Konumu:** [app-debug.apk](file:///C:/RMSv3/personel-android/app/build/outputs/apk/debug/app-debug.apk) (~20.67 MB).
