# SuitableRMS v3 — Design Handbook

Yürürlük tarihi: `2026-05-09`
Status: `active — tüm UI agent'ları için bağlayıcı`
Proje dizini: `C:\RMSggl\Dropbox\RMSv3`

---

## 0. İlk Kez Gelen Agent İçin Kullanım Notu

Bu belge tek başına genel proje onboarding dokümanı değildir.
Amacı tasarım ve ekran davranışı standardını sabitlemektir.

Projeye ilk kez dahil olan bir agent şu sırayla ilerlemelidir:

1. Önce `SUITABLERMS_PROJECT_GOVERNANCE.md` okunur.
2. Ardından `README.md` okunur.
3. UI veya ekran geliştirme aşamasında bu `DESIGN_HANDBOOK_V3_TR.md` aktif karar rehberi olarak kullanılır.
4. Mümkün olduğunda canlı referans yüz olarak uygulamadaki `/design-demo` ekranı da kontrol edilir.

Bu belgeden beklenen:

- Yeni ekran tasarlarken görsel yön, renk rolleri, layout davranışı, form standardı ve aksiyon dili konusunda bağlayıcı kural vermesi
- Farklı modüllerde yeni bir tasarım dili üretilmesini engellemesi
- Yeni agent'ın hızlıca uyumlu / uyumsuz karar verebilmesini sağlaması

Kısa karar kuralı:

- Soru `ekran nasıl görünmeli ve nasıl davranmalı` ise önce bu belgeye bakılır.
- Soru `nerede çalışıyorum, neye dokunabilirim, teknik omurga nedir` ise `SUITABLERMS_PROJECT_GOVERNANCE.md` dosyasına bakılır.
- Bu belge ile başka bir belge çelişirse, teknik kapsam için governance dosyası; görsel karar için bu handbook esas alınır.

---

## 1. Hızlı Karar Özeti

- Tema: `siyah sidebar + amber accent`, light ve dark mod destekli; kullanıcı toggle ile geçiş yapar.
- Sol menü `overlay` mantığında çalışır; sabit yan kolon gibi davranmaz.
- Küçük ekranda sidebar tamamen kapanır; orta ekranda ikon-only moda geçer; geniş ekranda tam açık kalır.
- Projede iki ekran sınıfı vardır: `POS-Critical` ve `Admin-Flex`.
- `POS-Critical` ekranlar `4:3 güvenli alan` önceliğiyle düşünülür.
- `Admin-Flex` ekranlar `4:3` alanda bozulmadan çalışır, geniş ekranda aynı akışı yardımcı alanlarla ferahlatır.
- Ortak layout davranışı `Display Mode: Auto | 4:3 Safe | Wide` ayarıyla kontrol edilir.
- `Display Mode` kullanıcı bazlı değil, cihaz/terminal bazlı düşünülür ve o cihaz için saklanır.
- Liste ekranı modülün ana giriş yüzüdür; arama alanı, soft delete görünürlüğü ve üst aksiyon bandı zorunludur.
- Yardımcı üst aksiyonlar ikon-only kalır; ana commit aksiyonu metinli güçlü buton olarak korunur.
- Dropdown alanlarında arama özelliği varsayılandır.
- Soft delete her uygun master-data ekranında varsayılan davranıştır.
- Form ve modal içeriklerinde sekmeli yapı kabul edilir; sekmeler kompakt ve operasyonel olmalıdır.
- POS, Garson, Kiosk ekranları bu handbook'tan ayrı değerlendirilir; backoffice referansı olarak kullanılmaz.

---

## 2. Tema Sistemi

### 2.1 Temel Kimlik

SuitableRMS v3'ün görsel kimliği şu üç unsur üzerine kuruludur:

- `Siyah sidebar` — navigasyon taşıyıcısı
- `Amber / turuncu accent` — birincil aksiyon ve aktif seçim rengi
- `Temiz içerik alanı` — light modda beyaz/gri, dark modda koyu gri/siyah

### 2.2 Light Mod (C1) — Varsayılan

| Token | Değer | Kullanım |
|-------|-------|----------|
| `sidebar-bg` | `#111111` | Sol sidebar arka planı |
| `sidebar-text` | `#888888` | Pasif menü öğesi |
| `sidebar-active` | `#f5a623` | Aktif menü öğesi metni |
| `sidebar-active-bg` | `rgba(245,166,35,0.08)` | Aktif menü öğesi arka planı |
| `sidebar-active-border` | `#f5a623` | Aktif öğe sol border vurgusu |
| `app-bg` | `#f5f5f5` | Sayfa zemini |
| `topbar-bg` | `#fafafa` | Üst bar arka planı |
| `surface` | `#ffffff` | Kart, tablo satırı, modal iç yüzeyi |
| `surface-2` | `#efefef` | Tablo başlığı, ikincil yüzey |
| `text-strong` | `#111111` | Ana metin |
| `text-muted` | `#888888` | İkincil metin, label |
| `border` | `#e5e5e5` | Genel border |
| `accent-primary` | `#f5a623` | Birincil buton, aktif badge |
| `accent-text` | `#000000` | Amber üstündeki metin |
| `success` | `#15803d` | Aktif, başarılı durum |
| `success-bg` | `#f0fdf4` | Başarı badge arka planı |
| `warning` | `#b45309` | Beklemede durumu |
| `warning-bg` | `#fffbeb` | Uyarı badge arka planı |
| `danger` | `#dc2626` | Pasif, hata, silme |
| `danger-bg` | `#fef2f2` | Tehlike badge arka planı |

### 2.3 Dark Mod (C2)

| Token | Değer | Kullanım |
|-------|-------|----------|
| `sidebar-bg` | `#0d0d0d` | Sol sidebar arka planı |
| `sidebar-text` | `#666666` | Pasif menü öğesi |
| `sidebar-active` | `#f5a623` | Aktif menü öğesi metni |
| `sidebar-active-bg` | `rgba(245,166,35,0.10)` | Aktif menü öğesi arka planı |
| `app-bg` | `#111111` | Sayfa zemini |
| `topbar-bg` | `#161616` | Üst bar arka planı |
| `surface` | `#131313` | Tablo satırı, kart iç yüzeyi |
| `surface-2` | `#161616` | Tablo başlığı, ikincil yüzey |
| `text-strong` | `#cccccc` | Ana metin |
| `text-muted` | `#555555` | İkincil metin |
| `border` | `#222222` | Genel border |
| `accent-primary` | `#f5a623` | Birincil buton |
| `success` | `#4ade80` | Aktif durum |
| `success-bg` | `#052e16` | Başarı badge arka planı |
| `warning` | `#fbbf24` | Beklemede |
| `warning-bg` | `#451a03` | Uyarı badge arka planı |
| `danger` | `#f87171` | Pasif, hata |
| `danger-bg` | `#450a0a` | Tehlike badge arka planı |

### 2.4 Tema Toggle Kuralları

- Toggle kullanıcı tercihidir; `localStorage`'a `theme: 'light' | 'dark'` olarak saklanır.
- Sistem dark modunu takip etmek isteyen kullanıcı için `auto` seçeneği de sunulabilir.
- Tema değişikliği anlık uygulanır; sayfa yenilemesi gerekmez.
- Toggle konumu: topbar sağ köşe, ikon-only buton.
- POS, Garson, Kiosk ekranları tema toggle'dan etkilenmez; kendi sabit temasını korur.

### 2.5 Renk Yasakları

Şunlar yapılmaz:

- Sidebar'ı amber, yeşil, mor veya başka bir renge boyamak
- Birincil aksiyonu amber dışına taşımak
- Her modülde farklı accent rengi kullanmak
- Başarı rengi olan yeşili dekoratif ana renk olarak kullanmak
- Sayfa zeminini koyu yaparken sidebar ile ayrımı kaybetmek

---

## 3. Sidebar ve Navigasyon

### 3.1 Sidebar Modları

Sidebar üç modda çalışır; Display Mode ve ekran genişliğine göre otomatik geçer:

| Mod | Genişlik | Tetikleyici |
|-----|----------|-------------|
| Tam açık | `220px` | Geniş ekran (`> 1280px`) veya kullanıcı pin'ledi |
| İkon-only | `48px` | Orta ekran (`768px–1280px`) |
| Kapalı / overlay | `0px` (hamburger ile açılır) | Dar ekran (`< 768px`) |

### 3.2 Sidebar Davranış Kuralları

- Sidebar sabit kolon gibi içerik alanını itmez; overlay modda içerik üstüne gelir.
- İkon-only modda her menü öğesi tooltip ile açıklanır.
- Aktif menü öğesi sol kenarında `2px amber border` ile işaretlenir.
- Menü grupları başlık etiketiyle ayrılır; başlık etiketleri küçük, büyük harf, gri renkte olur.
- Alt menüler aktif öğenin altında accordion gibi açılır; ayrı sayfa açmaz.
- Logo/marka alanı sidebar üstünde sabit durur; menü kaydırıldığında görünmez olmaz.
- Sidebar alt kısmında ayarlar ve tema toggle yer alır.

### 3.3 4:3 Safe Modda Sidebar

- `4:3 Safe` modda sidebar varsayılan olarak ikon-only açılır.
- Kullanıcı manuel olarak tam açık hale getirebilir.
- Tam açık halde içerik alanı daralır ama kırılmaz.

---

## 4. Display Mode

### 4.1 Modlar

- `Auto` — Varsayılan. Ekran genişliğine uyum sağlar. `4:3` alanda bozulmadan kalır, geniş ekranda ferahlar.
- `4:3 Safe` — POS veya dar dokunmatik terminal için. Çalışma alanı sıkı tutulur; varsayılan kolonlar çekirdeğe iner; yardımcı paneller daralır veya kapanır.
- `Wide` — Geniş monitör için. Aynı akış korunur; yan panel, ek kolon ve yardımcı özet alanı daha rahat açılır.

### 4.2 Display Mode Kuralları

- `Display Mode` kullanıcı bazlı değil, cihaz/terminal bazlı düşünülür; `localStorage`'a cihaz başına saklanır.
- `Display Mode` yeni ekran akışı icat etmek için kullanılmaz; aynı akışın farklı koşullarda güvenli görünmesini sağlar.
- `Display Mode` overlay menü mantığını değiştirmez; yalnız içerik tuvali, panel oranları ve görünür kolon varsayılanlarını etkiler.
- Bir panel veya modal `4:3` güvenli alana sığmıyorsa içerik görünmez bırakılamaz; kontrollü dikey scroll üretmek zorundadır.
- `4:3 Safe` modda tablo/matris yapısı korunur; kartlara parçalanmaz.
- `Wide` modda yalnız nefes ve hizalama kazanılır; yeni akış veya yeni panel icat edilmez.

---

## 5. Ekran Sınıfları

### 5.1 POS-Critical

Bu sınıfa dahil ekranlar: `POS`, `Garson`, `Kiosk`, `KDS`, `Teslim`, `Sıra`

- Birinci hedef `4:3` oranıdır; referans çözünürlük `1024x768` – `1280x960` bandıdır.
- Ana işlem akışı tek ekranda tamamlanmalı; yatay scroll oluşmamalı; dokunmatik hedefler küçülmemelidir.
- Bu ekranlar backoffice tasarım referansı olarak kullanılmaz.
- Bu ekranlar tema toggle'dan bağımsızdır; kendi sabit görsel kimliğini korur.

### 5.2 Admin-Flex

Bu sınıfa dahil ekranlar: master data, şirket, kategori, tedarikçi, stok, satış malı, fiyat, rapor, ayar ve tüm yönetim ekranları.

- `4:3` ekranda bozulmadan kullanılabilir kalmalıdır.
- `16:9` ve geniş ekranda aynı akışı yardımcı paneller ve ek kolonlarla genişletmelidir.
- Geniş ekran desteği yeni bir ana akış üretmek için değil, aynı akışı daha ferah sunmak için kullanılır.

---

## 6. Sayfa Kurgusu

### 6.1 Standart Sayfa Yapısı

Her Admin-Flex ekranı şu sırayla kurulur:

```
Topbar (breadcrumb + aksiyon bandı)
├── Başlık (modül adı, sol hizalı)
├── Arama + filtre bandı
├── Yardımcı aksiyonlar (ikon-only, sağ hizalı)
└── Ana aksiyon (+ Yeni, amber buton, sağ hizalı)

İçerik alanı
└── Tablo / liste (tam genişlik)

Modal (kayıt detayı, ekleme, düzenleme)
└── Sekmeli form
```

### 6.2 Liste Standartları

- Her modülde önce liste görünümü gelir; liste ana giriş yüzüdür.
- Liste ekranında en az bir arama alanı zorunludur.
- Sütun başlıkları ile veri hücreleri aynı grid şablonunu paylaşır.
- Soft delete davranışı her master-data ekranında varsayılandır; `Silinmişleri göster` filtresi zorunludur.
- Liste sayfasında `+ Yeni` butonu daima görünür ve kolay bulunur olmalıdır.
- Yardımcı aksiyonlar ikon-only olmalı; yalnız ana commit aksiyonu yazılı güçlü buton olarak kalmalıdır.

### 6.3 Kolon Öncelik Sistemi

Liste kolonları A / B / C öncelik mantığıyla ele alınır:

- `A` — Her zaman görünür çekirdek kolonlar (`Kod`, `Ad`, `Durum` gibi)
- `B` — Genişlik varsa açık gelen operasyon kolonları (`Kategori`, `Birim`, `Tedarikçi` gibi)
- `C` — Dar ekranda kapalı kalan, kullanıcı isterse açtığı ikincil kolonlar (`Entegrasyon ID`, muhasebe kodu, not gibi)

`4:3 Safe` modda yalnız `A` öncelikli kolonlar varsayılan açık kalır.
`Wide` modda `B` ve `C` kolonları varsayılan açık olabilir.

### 6.4 Hiyerarşik Ağaç Ekranları

Şirket, Kategori gibi parent-child yapılı ekranlar için:

- Ebeveyn-çocuk ilişkisi ilk bakışta okunmalıdır.
- Seviye farkı yalnız renkle değil; hizalama, girinti, çizgi veya taşıyıcı etiketle de anlaşılmalıdır.
- Üst düğüm, alt düğüm ve yaprak kayıt aynı görsel ağırlıkta olmamalıdır.
- Aç/kapat, seç, taşı ve ekle aksiyonları hiyerarşi okumasını bozmamalıdır.
- Dar ekranda hiyerarşi kırıldığında ebeveyn-çocuk ilişkisi hâlâ anlaşılır olmalıdır.
- Breadcrumb veya bağlı olduğu ebeveyn bağlamı her zaman görünür olmalıdır.

---

## 7. Modal ve Form Standardı

### 7.1 Modal Kuralları

- Ekleme ve düzenleme işlemleri modal pencere içinde açılır; ayrı sayfa açılmaz.
- Modal açılırken arka plan karardığında içerik alanı scroll edilemez hale gelir.
- Modal başlığı net ve tek satırda kalmalıdır.
- Modal footer'ında yalnız ana commit butonu (`Kaydet`, `Onayla`) ve `İptal` bulunur.
- Modal kapandığında liste yenilenir; kullanıcı son işlem yaptığı konuma döner.

### 7.2 Sekmeli Form Kuralları

- Uzun formlar sekmelere ayrılır.
- Sekmeler iş akışına göre soldan sağa mantıklı sıra izler.
- Sekmeler modal header içinde kısa etiketli ve toolbar gibi görünür; büyük kart görünümlü tab girişleri kabul edilmez.
- Sekmeler arası geçişte modal boyutu sabit kalır; içerik değişir, pencere boyutu değişmez.
- Sekme geçişi kaydedilmeden yapılabilir; sekme değişikliği veri kaybına neden olmaz.
- Zorunlu alanlar olmadan sekme değiştirilebilir; ancak kaydetme anında tüm sekmeler validate edilir.

### 7.3 Form Alan Kuralları

- Tüm benzer formlarda input yüksekliği, padding, yazı boyutu ve buton ölçüleri aynı kalmalıdır.
- Kısa sayısal alanlar gereksiz geniş kartlara yayılmaz; kompakt grid mantığıyla gösterilir.
- `Açık / Kapalı`, `Aktif / Pasif` gibi kısa durum bilgileri tam genişlik readonly input gibi sunulmaz; kompakt toggle veya chip kullanılır.
- Reçete, stok ve üretim tablolarındaki miktar ve tutarlar virgülden sonra `4` hane; satış tarafında ise `2` hane gösterilir.
- Birim gösteriminde önce kısa sembol kullanılır (`kg`, `g`, `L`, `ml`); kısa gösterim yoksa uzun ad kullanılır.

### 7.4 Dropdown Kuralları

- Dropdown alanlarında arama özelliği varsayılandır; istisnası yoktur.
- Arama ikonu `14px` – `16px` bandında kalır; container büyüse de ikon büyümez.
- Çoklu seçimli dropdownlarda liste sırası: önce `Tümünü Seç`, sonra grup veya şablonlar, sonra tekil kayıtlar.
- Bir grup veya şablon seçildiğinde kapsadığı tekil kayıtlar listede inaktif / seçilemez görünür.

---

## 8. Soft Delete

- Sil butonu varsayılan olarak fiziksel silme anlamına gelmez.
- Kayıt önce soft delete ile pasife alınır.
- `Silinmişleri göster` filtresiyle geri görünür olur.
- Silinen kayıtlar listede görsel olarak geri çekilir; satır gizlenmez, yalnız soluk gösterilir.
- Fiziksel silme yalnızca admin yetkisiyle ve ayrı bir onay adımıyla yapılabilir.
- Soft delete davranışı her uygun master-data ekranında zorunludur.

---

## 9. Aksiyon Bandı

- Üst aksiyon bandında yalnızca birincil commit aksiyonu yazılı buton olarak kalır.
- `Kaydet`, `Onayla`, `Yayınla` gibi geri dönüşü etkileyen ana aksiyonlar amber renkli metinli buton olur.
- Bunun dışındaki ikincil araçlar ikon-only buton olarak gösterilir.
- İkon-only butonların açıklaması hover ve focus anında tooltip ile verilir.
- Aynı satırda birden fazla yardımcı araç varsa metin tekrarından kaçınılır.
- Export, import, daralt, genişlet, yenile, filtreyi temizle — tümü ikon-only kalır.

---

## 10. Tipografi ve Metin

- Arayüz dili Türkçe'dir; Türkçe karakterler eksiksiz kullanılmak zorundadır.
- ASCII yaklaşıkları kullanılmaz (`Satis` değil `Satış`, `Sube` değil `Şube`).
- Placeholder metinleri de bu kurala dahildir.
- Yardımcı açıklama ve hint metinleri ana etiketten daha küçük ve daha geri planda kalmalıdır.
- Teknik not veya geliştirici dili kullanıcıya sızmamalıdır.

---

## 11. Tekrar Kullanılabilirlik

- `Vergi Tanımları`, `Birim Tanımları`, `Satış Malı`, `Stok Malı`, `Satış Kanalları` gibi ekranlar ortak iskelet üzerinden kurulur.
- Liste, filtre, aksiyon alanı, modal başlığı, sekme yapısı ve footer butonları ortak tasarım sistemine bağlıdır.
- Farklı modüller yeni tasarım dili üretmek yerine mevcut standardı genişletir.
- Aynı veri veya aynı aksiyon için iki ayrı kullanıcı yüzeyi kurulmaz.

---

## 12. Kontrol Listesi

Yeni bir ekran yayına alınmadan önce şu maddeler kontrol edilir:

**Genel**
- [ ] Modül `POS-Critical` mi, `Admin-Flex` mi doğru sınıflandırıldı mı
- [ ] Cihaz için doğru `Display Mode` seçimi düşünüldü mü
- [ ] `4:3` tuval korunuyor mu
- [ ] `4:3 Safe` modda ana akış eksiksiz tamamlanabiliyor mu
- [ ] `Wide` modda yeni akış icat edilmeden yalnız yardımcı genişleme mi yapılıyor

**Tema**
- [ ] Sidebar `#111111` siyah arka planda mı
- [ ] Aktif menü öğesi amber renkte ve sol border vurgulu mu
- [ ] Birincil buton amber (`#f5a623`) mi
- [ ] Light/dark toggle topbar'da mevcut mu
- [ ] Dark modda tüm metin okunabilir mi

**Sidebar**
- [ ] Overlay modda içerik üstüne geliyor mu, itiyor mu
- [ ] Geniş ekranda tam açık, orta ekranda ikon-only, dar ekranda kapalı mı
- [ ] İkon-only modda tooltip var mı

**Liste**
- [ ] Liste önce geliyor mu
- [ ] Arama alanı var mı
- [ ] `+ Yeni` butonu görünür ve kolay bulunur mu
- [ ] Soft delete + `Silinmişleri göster` var mı
- [ ] Sütun başlıkları ile veri hücreleri aynı hizada mı
- [ ] Kolon öncelik sistemi (A/B/C) uygulandı mı
- [ ] Yardımcı aksiyonlar ikon-only mu

**Modal ve Form**
- [ ] Ekleme/düzenleme modal içinde mi açılıyor
- [ ] Uzun form sekmelere ayrıldı mı
- [ ] Sekmeler arası geçişte modal boyutu sabit mi
- [ ] Dropdown'larda arama var mı
- [ ] Türkçe karakterler eksiksiz mi
- [ ] Zorunlu alan işaretleri save guard ile uyumlu mu

**Hiyerarşik Ekranlar**
- [ ] Ebeveyn-çocuk ilişkisi ilk bakışta okunuyor mu
- [ ] Seviye farkı girinti + renk + tipografi ile destekleniyor mu
- [ ] Dar ekranda hiyerarşi hâlâ anlaşılır mı
- [ ] Breadcrumb veya ebeveyn bağlamı görünür mü

**Soft Delete**
- [ ] Sil işlemi fiziksel değil, soft delete mi
- [ ] Silinen satır gizlenmeyip soluk gösterildi mi
- [ ] `Silinmişleri göster` filtresi çalışıyor mu

---

## 13. Agent İçin Yasaklar

Bir agent şunları yapamaz:

- Sidebar'ı amber, yeşil, lacivert veya başka bir renge boyamak
- Birincil aksiyonu amber dışına taşımak
- Dropdown'a arama eklemeden bırakmak
- Soft delete olmadan fiziksel silme uygulamak
- POS/Garson/Kiosk'u backoffice referansı olarak kullanmak
- Sekmeler arası geçişte modal boyutunu değiştirmek
- Yardımcı aksiyonu metinli büyük buton yapmak
- `4:3 Safe` modda tablo yerine kart düzenine geçmek
- Türkçe karakter yerine ASCII yaklaşıkları kullanmak
- Her modül için ayrı renk sistemi icat etmek
- `Wide` modda yeni akış üretmek; yalnız mevcut akışı ferahlatmak geçerlidir

---

## 14. Tasarım Demo Ekranı

- `/design-demo` ekranı kanonik UI iskeletleri ve kabul edilmiş ekran omurgaları için referans yüzdür.
- Eşdeğer bir form veya ekran örneği `/design-demo`'da varsa, agent yeni görsel dil üretemez; o omurga doğrudan baz alınır.
- `/design-demo` çalışma panosu veya proje durum ekranı değildir; yalnız kanonik UI referansı içindir.
- Bu handbook ile `/design-demo` çelişirse, önce handbook ve demo birlikte güncellenir, sonra ekran yazılır.
