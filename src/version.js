export const VERSION = '2.1.0'

export const CHANGELOG = [
  {
    version: '2.1.0',
    date: '2026-04-04',
    items: [
      'Workspace scope listesi guclendirildi; /cariler alias route ve /sadakat/kuponlar loyalty sayfasi merkez kapsaminda acikca tanimlandi',
      'Report Designer uzerindeki production debug loglari devre disi birakildi; pivot akisi daha sessiz ve guvenli hale getirildi',
      'Demo satis CLI araci hizli RPC taramasi timeout aldiginda guvenli sube-gun fallback taramasina gecerek eksik gun ve hareket onarimlarini tespit edebilir hale getirildi',
      'Loyalty kampanya ve kupon seti yukleme akisi kismi tablo hatalarina karsi dayanikli hale getirildi; okunabilen veri bos ekrana dusmeden listelenir oldu',
    ],
  },
  {
    version: '2',
    date: '2026-03-28',
    items: [
      'Demo satış üreticisinin başlangıç tarihi 15 Mart 2026 olarak güncellendi ve Demo Satış Yap ekranındaki Türkçe karakterler düzeltildi',
      'Siparişler ve Mal Kabul akışlarında şube kimliği, boş UUID ve tarih kayması kaynaklı otomatik sipariş üretim hataları giderildi',
      'Şube çalışma alanı, personel ve pozisyon yönetimi ekranları aynı sürüm seti içinde canlıya taşınacak şekilde toparlandı',
    ],
  },
  {
    version: '1.8.2',
    date: '2026-03-27',
    items: [
      'Sube operasyonlari icin Siparisler ve Mal Kabul modulleri eklendi; akislari stok mali ve inventory_movements altyapisina baglandi',
      'Uygulama acilisina Merkez, Ana Depo / Merkez Mutfak, Sube ve Admin calisma baglami secimi eklendi; menuler bu baglama gore filtrelenir hale geldi',
      'POS, Tahmin, Siparisler, Mal Kabul ve Stok Hareketleri ekranlari secilen sube baglamina kilitlendi; sol menudeki calisma alani karti sade kompakt yapiya guncellendi',
    ],
  },
  {
    version: '1.8.1',
    date: '2026-03-27',
    items: [
      'Demo Satis Yap: tarama sorgulari hafif SQL RPC fonksiyonlarina tasindi; tum satis satirlarini istemciye cekmeden sube-gun ozeti alinabilir hale geldi',
      'Demo satis uretimi: uzun tek seferlik is yerine kucuk sube-gun parcalariyla arka planda ilerleyen kuyruk mantigina cevrildi; kullanici ekranda kalmadan devam edebilir',
      'Demo satis uretimi: satisi olusmus ama inventory_movements satirlari eksik kalan gunler icin stok hareketi onarim akisina kavustu',
    ],
  },
  {
    version: '1.8.0',
    date: '2026-03-26',
    items: [
      'Ayarlar: Demo Satis Yap ekrani eklendi; 1 Ocak 2026 tarihinden itibaren eksik satis gunleri tum subeler icin taranabiliyor',
      'Demo satis araci: gunluk satis araligi, fis ortalamasi, fis adedi, indirim ve parcali odeme parametreleri yerel ayarlar olarak saklanir hale getirildi',
      'Demo satis araci: aktif satis mallari, boyutlar, secenek gruplari, haftalik agirliklar ve sube bazli dar satis bandi mantigiyla sales, sale_lines ve sale_payments tablolarina veri uretebilir hale geldi',
    ],
  },
  {
    version: '1.7.20',
    date: '2026-03-26',
    items: [
      'Dashboard: sayac sorgulari Promise.allSettled mantigina yakin guvenli tekil yukleme ile yeniden kuruldu; tablo veya sorgu hatasi olsa da ekran artik beyaz ekrana dusmez',
      'Dashboard: kartlar ve placeholder alani sade ve stabil bir yapiyla yeniden olusturuldu',
    ],
  },
  {
    version: '1.7.19',
    date: '2026-03-26',
    items: [
      'POS: bekleyen satis rozeti, senkron sayaci dusmuyor ve kayit hala takiliysa cihazdaki yerel kuyrugu temizlemeyi teklif eden kurtarma akisina kavustu',
      'POS: takili bekleyen satis temizligi sadece bu cihazin IndexedDB kuyrugunu siler; sunucudaki satis verilerine dokunmaz',
    ],
  },
  {
    version: '1.7.18',
    date: '2026-03-26',
    items: [
      'POS: bekleyen satis senkronunda ayni local_id sunucuda zaten olusmussa cihaz kuyrugundan otomatik temizlenecek guvenlik kontrolu eklendi',
      'POS: syncPending hata alsa bile uzakta basariyla olusmus kayitlari ikinci kontrolle kuyruktan dusurerek takili rozet sayacini toparlar hale getirildi',
    ],
  },
  {
    version: '1.7.17',
    date: '2026-03-26',
    items: [
      'POS: eksik kalan cartTotal hesabi geri eklendi; sol toplam paneli ve satis kaydi akisinda olusan runtime hata giderildi',
      'POS: hata paneli sayesinde yakalanan acilis referans problemi temizlendi',
    ],
  },
  {
    version: '1.7.16',
    date: '2026-03-26',
    items: [
      'POS: aktif channel referansi sirasi duzeltilerek acilista beyaz ekran olusturan runtime hata giderildi',
      'POS: rota icine runtime error boundary eklendi; beklenmeyen hata olursa artik bos ekran yerine hata paneli gosterilir',
      'POS: bekleyen satis rozeti ve sube secim ekranindaki Turkce metinler temizlendi',
    ],
  },
  {
    version: '1.7.15',
    date: '2026-03-26',
    items: [
      'POS: cihazda kayitli sube secimi yoksa veya gecersizse test ortami icin varsayilan olarak Kadikoy Subesi secili gelir hale getirildi',
      'POS: mevcut localStorage sube secimi korunmaya devam eder; ilk secim sonraki acilislarda yeniden kullanilir',
    ],
  },
  {
    version: '1.7.14',
    date: '2026-03-26',
    items: [
      'POS: acilista zorunlu sube secimi modali baglandi; secilen sube cihazda hatirlanir ve satis tamamlamadan once zorunlu tutulur hale geldi',
      'POS: sol panelde aktif sube alani eklendi; kullanici istedigi anda sube degistirme akisina donebilir',
      'POS: odeme ekraninda tahsilat basladiktan sonra indirim kontrolleri kilitli kalacak sekilde guvenlik kurali korundu',
    ],
  },
  {
    version: '1.7.13',
    date: '2026-03-26',
    items: [
      'POS: satis kayit akisi sales, sale_lines ve sale_payments tablolarina da yazacak sekilde genisletildi',
      'POS: indirim dagitimi, KDV snapshoti ve recete bazli maliyet snapshoti satis satirlarina kaydedilir hale getirildi',
      'POS: offline kuyruk korunarak yeni satis modeli syncPending akisina guvenli cift yazim olarak baglandi',
    ],
  },
  {
    version: '1.7.12',
    date: '2026-03-26',
    items: [
      'Satis modeli icin sales, sale_lines ve sale_payments tablolarini olusturan guvenli migration SQL dosyasi eklendi',
      'Satis veri modeli icin uygulama sirasi ve kullanim notlarini anlatan kilavuz dosyasi eklendi',
    ],
  },
  {
    version: '1.7.11',
    date: '2026-03-26',
    items: [
      'Ayarlar: Tahmin Ayarlari ekrani eklendi; Excelde paylasilan tahmin parametreleri ayarlar altinda yapilandirildi',
      'Tahmin: geriye bakis, ileriye tahmin, manuel mudahale ve gun ici kilit saati ayarlari ayarlar ekranindan okunur hale getirildi',
    ],
  },
  {
    version: '1.7.10',
    date: '2026-03-26',
    items: [
      'POS: urun normalizasyonu, kategori gorunurlugu ve favori siralama hesaplari useMemo ile sabitlendi; gereksiz yeniden taramalar azaltildi',
      'POS: kategori uygunlugu icin onceden hesaplanan map-set yapisi kullanilarak menu tepkisi iyilestirildi',
    ],
  },
  {
    version: '1.7.9',
    date: '2026-03-26',
    items: [
      'Musteriler: basarili musteri kaydindan sonra modal kapanana kadar kaydetme kilidi korunarak tekrar insert olusmasi engellendi',
    ],
  },
  {
    version: '1.7.8',
    date: '2026-03-26',
    items: [
      'Musteriler: musteri ekle modalinde tekrar tiklamalarda olusan coklu kayit riski engellendi; kaydetme akisi tek seferlik kilitle calisiyor',
      'Musteriler: basarili kayit sonrasi modalin tek seferde kapanmasi saglamlastirildi',
    ],
  },
  {
    version: '1.7.7',
    date: '2026-03-26',
    items: [
      'POS: favoriler ekrani icin oklarla sira duzenleme modu eklendi; sira cihaz bazli localStorage uzerinde saklaniyor',
      'POS: favoriler sirasi yukari ve asagi kontrolleriyle pratik sekilde degistirilebilir hale getirildi',
    ],
  },
  {
    version: '1.7.6',
    date: '2026-03-26',
    items: [
      'POS: favoriler modunda kategori secimi resetlendi; ana ve alt kategori vurgulari gizlenerek ekran mantigi netlestirildi',
    ],
  },
  {
    version: '1.7.5',
    date: '2026-03-26',
    items: [
      'POS: favoriler gorunumu kategori bagimsiz listelenecek sekilde guncellendi; urunler kendi kategorilerinde de kalmaya devam ediyor',
      'POS: siparisi sil butonu alt alana ikon olarak tasindi, satir ici cift sil gorunumu kaldirildi ve stok disi liste ust menuye alindi',
      'POS: boyut secim modalinde opsiyon gerekmiyorsa boyuta dokununca urun dogrudan sepete ekleniyor; opsiyon min-max kurallari korunuyor',
    ],
  },
  {
    version: '1.7.4',
    date: '2026-03-25',
    items: [
      'POS: sepet satirlarindaki adet kontrolu beyaz bolmeli tasarima guncellendi',
      'POS: adet 1 iken sol kontrol cop ikonuna donuserek gorsel ornege daha yakin hale getirildi',
    ],
  },
  {
    version: '1.7.3',
    date: '2026-03-25',
    items: [
      'POS: aktif odeme modal render yolu yeni akisla degistirildi; secili olanlar, bolme ve diger odeme akislari gorunur hale getirildi',
      'POS: odeme ekraninda ayni urunun coklu adetleri ayri tahsilat satirlari olarak korunurken siparis giris ekrani sade birakildi',
      'POS: odeme ekranina yeni adim kartlari, bu adimin odemeleri listesi ve guvenli borclandirma kisiti eklendi',
    ],
  },
  {
    version: '1.7.2',
    date: '2026-03-25',
    items: [
      'POS: odeme ekrani Excel adimlarina gore guncellendi; secili urun, bolme ve diger odeme akislari eklendi',
      'POS: ayni urunden birden fazla adet varsa yalnizca odeme ekraninda ayri satirlar halinde tahsil edilebilir hale getirildi',
      'POS: nakit ve kredi karti ana odemeleri korundu; yemek ceki ve borclandirma kucuk secim ekranina tasindi',
    ],
  },
  {
    version: '1.7.1',
    date: '2026-03-25',
    items: [
      'POS: odeme ekranindaki Turkce karakter ve metin duzeltmeleri tamamlandi',
      'POS: satiri ayir davranisi siparis giris ekranindan kaldirildi; odeme akisina ozel birakildi',
    ],
  },
  {
    version: '1.7.0',
    date: '2026-03-25',
    items: [
      'POS: odeme ekrani yeniden duzenlendi; secili kalem odeme, parcali odeme ve odendi listesi eklendi',
      'POS: indirim alani eklendi; yuzde ve tutar bazli indirim odeme hedefinden dusuluyor',
      'POS: tutar girmeden odeme tipine basinca kalanin tamami tahsil ediliyor; numerik tus takimi eklendi',
      'POS: yemek ceki ve borc kaydet odeme akislari eklendi',
      'POS: borc kaydet akisi mevcut musteri listesi ve cari hareket kaydi ile baglandi',
    ],
  },
  {
    version: '1.6.3',
    date: '2026-03-25',
    items: [
      'POS: miktari 1 den buyuk sepet satirlari icin ayirma aksiyonu eklendi; ayni urun ayri odeme akislari icin bolunebiliyor',
    ],
  },
  {
    version: '1.6.2',
    date: '2026-03-25',
    items: [
      'POS: sepetteki opsiyonlu/boyutlu urunler icin duzenle aksiyonu eklendi; secimler guncellenebiliyor',
      'POS: tum siparis ve tekil urun bazinda not ekleme arayuzu eklendi; notlar satis kalemlerine yaziliyor',
      'POS: tum siparisi sil aksiyonu aciklama zorunluluguyla eklendi; silinen siparisler yerel rapor kaydina aliniyor',
      'POS: Masaya Tasi, Stok Disi Liste ve Favori Ekle icin gecici bilgi modal akislari eklendi',
      'POS: kategorilere Favoriler kisayolu eklendi; favori urunler kategori bagimsiz filtrelenebiliyor',
    ],
  },
  {
    version: '1.6.1',
    date: '2026-03-25',
    items: [
      'POS ekrani dokunmatik kullanim icin optimize edildi; 1024x768 POS terminallerine uygun sabit kart yerlesimi yapildi',
      'POS urun kartlari demo verilerdeki gorsel, buton rengi ve yazi rengini kullanacak sekilde baglandi',
      'POS ana kategori ve alt kategori akisi urun bagli kategorilere gore duzenlendi; bos dallar gizleniyor',
      'POS: boyut ve opsiyon secimi demo urun verileriyle baglandi, modal akisi sade ve kullanilabilir hale getirildi',
      'POS: Fiyatlari Goster / Gizle secenegi eklendi; urun karti metin yerlesimi buna gore duzenlendi',
      'POS: Turkce karakter sorunlari, yukleme ekrani, modal metinleri ve toast bildirimleri temizlendi',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-03-25',
    items: [
      'POS modulu eklendi (/pos) - tam ekran, sidebar yok',
      'POS: Offline-first mimari - satislar IndexedDB ye yazilir, online gelince db e sync edilir',
      'POS: sale_categories den kategori listesi, sale_items dan urunler, channel_prices dan kanal fiyati',
      'POS: Boyut secimi (portions - fiyat farkiyla), secenek gruplari (option_groups - min/max/zorunlu)',
      'POS: Odeme modali - nakit/kart/transfer, nakit ustu hesabi',
      'POS: Cevrimici/cevrimdisi gostergesi, bekleyen satis sayaci ve manuel sync butonu',
      'POS: Kanal secimi (sales_channels), masa no duzenlenebilir, urun arama',
      'POS: Kapat butonu ile /dashboard a donus',
      'App.jsx: POS route u icin AppShell mimarisi - /pos ta sidebar ve padding yok',
      'Menu: Sube Islemleri altina POS - Satis Ekrani eklendi',
      'pos_sales tablosu SQL: local_id (offline eslesme), items JSONB, odeme, alinan, toplam',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-03-25',
    items: [
      'Musteriler modulu eklendi (/musteriler ve /sube-musteriler)',
      'Menu: Merkez Cariler -> Musteriler olarak yeniden adlandirildi',
      'Menu: Sube Islemleri altina Musteriler eklendi',
      'Musteri listesi: telefon + isim arama, Sadece Cari filtresi, tablo gorunumu',
      'Musteri ekleme/duzenleme: cari toggle, musteri tipi (Gercek/Tuzel), e-mail, notlar',
      'Tuzel kisi: sirket adi ve vergi numarasi alanlari',
      'Adres formu: Turkiye il/ilce/mahalle dropdown (cascade), sokak/apt/daire/kat/aciklama',
      'Birden fazla adres eklenebilir, birincil adres secimi',
      'Cari Detaylari: borc/alacak kartlari, Odeme Al / Borc Ekle / Hareket Gecmisi',
      'Manuel Borc Ekle: tarih, neden, tutar, aciklama',
      'Cari Hareketler: borc/odeme gecmisi tablosu, silme, paket no gosterimi',
      'Odeme Al: POS ekrani hazir degilken bilgilendirme modali',
      'Modal cerceve disina tiklayinca kapanma kaldirildi (tum modaller)',
      'SQL: tr_iller, tr_ilceler, tr_mahalleler, musteriler, cari_hareketler tablolari',
      'SQL: mahalle verileri eklendi',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-03-25',
    items: [
      'Siparis Akislari formu sekmeli yapiya gecirildi',
      'Takvim adimina siparis sikligi eklendi: Gunluk / Haftalik / Aylik',
      'Aylik mod: belirli gunler veya ayin belirli haftasinin gunu secilebiliyor',
      'Urunler adimi: Tumu / Urun Sec / Kontratli / Stok Mali Sablonu',
      'Kontratli urunler: contracts tablosundan tedarikciye gore aktif sozlesme kalemleri',
      'Tahmin orani canli gosterim eklendi',
      'Son duzenleme saati ve son iptal saati ayrildi',
      'Genel Merkez onay esigi giris alani eklendi',
      'Babel uyumsuzlugu duzeltildi',
      'order_flows migration SQL: yeni kolonlar',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-03-24',
    items: [
      'Siparis Akislari modulu eklendi (/order-flows)',
      'Iki akis tipi: Otomatik ve Manuel',
      'Tedarikci secici, sube/sablon coklu secici, takvim, miktar onerisi, onay kurallari',
      'order_flows tablosu SQL eklendi',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-03-24',
    items: [
      'Sozlesmeler modulu eklendi (/contracts)',
      'Toggle gorsel hatasi duzeltildi',
      'contracts tablosu SQL eklendi',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-03-24',
    items: [
      'Menu yapisi yeniden duzenlendi',
      'Uretim, Satis Tahmini, Donem Kapanisi modulleri eklendi',
      'db: daily_sales, sales_forecasts, branch_period_locks, production_records tablolari',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-03-23',
    items: [
      'Ilk versiyon - temel moduller',
    ],
  },
]
