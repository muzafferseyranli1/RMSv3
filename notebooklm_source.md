# Suitable RMS v3 - Proje Dokümantasyonu ve Kaynak Özeti

Bu doküman, Suitable RMS v3 projesinin kapsamını, teknik mimarisini, klasör yapısını ve temel kullanıcı akışlarını NotebookLM gibi yapay zeka araçları için yapılandırılmış bir biçimde açıklamaktadır.

---

## 1. Proje Özeti

**Suitable RMS v3**, restoran zincirleri, franchise ağları, merkez mutfaklar ve depolar için geliştirilmiş kapsamlı ve entegre bir **Restoran ve Tedarik Zinciri Yönetim Sistemidir (Restaurant Management System)**. 

### Çözdüğü Temel Problemler:
- **Çoklu Şube ve Tedarik Zinciri Yönetimi:** Şubelerin depo ve merkez mutfaklarla olan sipariş-ikmal akışını, merkez mutfaktaki üretim süreçlerini (reçete patlatma, hammadde talebi) ve dış müşterilere (B2B) toptan satış işlemlerini uçtan uca tek platformda yönetir.
- **Kesintisiz Satış (Offline-first POS):** İnternet bağlantısı kopsa dahi restoran içindeki POS terminallerinin çalışmaya devam etmesini sağlar. Veriler cihazda yerel olarak saklanır ve internet geldiğinde bulut ile senkronize olur.
- **Genişletilmiş Müşteri Deneyimi (Loyalty & Kiosk):** Müşteri sadakat programları (damga/puan kazanımı), self-servis kiosklar, KDS (Mutfak Ekranı) ve teslimat ekranları ile modern bir restoran deneyimi sunar.

---

## 2. Teknik Mimari

Proje, modern web teknolojileri ve masaüstü hibrit mimarisi kullanılarak inşa edilmiştir.

### Kullanılan Teknolojiler
- **Kullanıcı Arayüzü (Frontend):** React (Vite altyapısı ile), React Router, HTML5, CSS (kısmi Tailwind ve özel bileşenler).
- **Veritabanı ve Bulut Backend:** Supabase (PostgreSQL tabanlı), gerçek zamanlı veri eşzamanlama.
- **Masaüstü İstemcisi:** Electron.js (Windows NSIS paketleyicisi ile). Masaüstü donanımlara (Yazarkasa, Barkod Okuyucu, Fiş Yazıcısı) erişim sağlar.

### Mimari Kararlar ve Kritik Yapılar
- **Offline-first ve Senkronizasyon:** POS modülü, internet bağımlılığını ortadan kaldırmak için Electron üzerinden yerel bir SQLite veritabanı (`better-sqlite3`) kullanır. İşlemler önce yerel veritabanına yazılır, ardından arka planda bir senkronizasyon servisi ile (Supabase) buluta aktarılır.
- **Tedarik Zinciri ve Reçete Motoru:** Şubeler arası veya şube-depo, depo-mutfak arası geçişler sanal tedarikçiler (`internal_warehouse`, `internal_kitchen`) üzerinden yönlendirilir. Bir şube "Yarı Mamul" (ör. SOS) siparişi verdiğinde, sistem reçeteleri çözümler ("patlatır") ve mutfağın alması gereken hammadde ihtiyacını (ör. Ketçap + Mayonez) otomatik hesaplar.
- **B2B ve Cari Hesap Entegrasyonu:** Sistem sadece son kullanıcıya (B2C) değil, toptan alıcılara (B2B) faturalı ve irsaliyeli çıkış yapabilir. Envanter hareketleri (`inventory_movements`) ve cari hesap hareketleri (`cari_hareketler`) çift taraflı kayıt (double-entry) mantığıyla işlenir.

---

## 3. Klasör ve Kod Yapısı

Proje, frontend odaklı olup ana iş kuralları React bileşenleri (components) ve kütüphane (lib) dosyalarında barınmaktadır.

* **`desktop/`**: Electron uygulamasının ana dosyaları.
  * `main.cjs`: Masaüstü uygulamasının giriş noktasıdır. SQLite bağlantısını kurar, IPC (Inter-Process Communication) kanallarını dinleyerek React uygulamasına yerel donanım ve veritabanı erişimi sunar.
* **`src/`**: React uygulamasının kaynak kodları.
  * **`App.jsx`**: Tüm uygulamanın ana yönlendirme (routing) merkezidir. Kullanıcının yetkisine ve şubesine (Merkez Depo, Merkez Mutfak, Şube) göre erişebileceği ekranları belirler.
  * **`lib/`**: İş mantığı ve yardımcı fonksiyonlar.
    * `db.js`: Supabase bağlantısı ve temel veritabanı CRUD işlemleri.
    * `branchPurchasing.js`: Şube siparişlerinin hangi tedarikçiye (dış tedarikçi mi, merkez depo mu) gideceğini belirleyen kural motoru.
    * `kitchenDemandPlanning.js`: Merkez Mutfak için reçete çözümleme ve hammadde talep planlama algoritması.
  * **`components/pages/`**: Arayüz sayfaları (Ana ekranlar).
    * `POS.jsx`: Kasiyerlerin kullandığı satış ekranı (Offline destekli).
    * `OrderFlows.jsx` & `Orders.jsx`: Şube ve depoların satın alma taleplerini oluşturduğu ekran.
    * `MutfakOrders.jsx`: Merkez mutfağın, şubelerden gelen talepleri gördüğü, hazırladığı ve sevk ettiği ekran.
    * `B2BOrders.jsx`: Depo veya Mutfaktan dış kurumsal müşterilere toptan satış yapılan ekran.
    * `InventoryMovements.jsx`: Stok giriş-çıkış (transfer, zayi, mal kabul) işlemlerinin listelendiği log ekranı.
    * `Musteriler.jsx`: Bireysel ve B2B kurumsal müşterilerin (vergi dairesi vb. bilgileriyle) tanımlandığı ekran.
* **`schema-railway-master.sql`**: Uygulamanın PostgreSQL veritabanı şemasını içeren referans dosyasıdır (Tablolar: `stock_items`, `inventory_movements`, `purchase_orders`, `b2b_sales_orders`, vb.).

---

## 4. Kullanıcı Akışları (User Flows)

Uygulama üzerindeki en kritik iş süreçlerinin adım adım senaryoları:

### Akış 1: POS Satış ve Tahsilat
1. **Giriş:** Kasiyer pin/şifre ile terminale giriş yapar.
2. **Sipariş Alma:** Ekranda kategoriler ve ürünler listelenir. Ürünlere veya kombo menülere (içeriği seçilebilir opsiyonlu menüler) dokunularak sepete eklenir.
3. **Ödeme:** Sepet onaylanır, ödeme ekranına geçilir. Nakit, Kredi Kartı veya Sadakat (Loyalty) puanlarıyla parçalı ödeme yapılabilir.
4. **Kapanış:** Ödeme tamamlandığında adisyon kapanır, mutfak ekranına (KDS) bildirim gider ve termal yazıcıdan fiş/fatura yazdırılır. Sistem arka planda envanterden (reçeteye göre) malzeme düşer.

### Akış 2: Şubeden Merkeze Sipariş ve Mal Kabul (Tedarik Zinciri)
1. **Talep Oluşturma:** Şube yetkilisi `OrderFlows.jsx` üzerinden sistemin önerdiği eksik ürünleri görür. "Sipariş Ver" dediğinde, sistem ürünün "Merkez Depo" malı mı yoksa "Dış Tedarikçi" malı mı olduğuna karar verir (`branchPurchasing.js`).
2. **Sevk (Depo/Mutfak):** Eğer sipariş Merkez Mutfağa düştüyse, mutfak personeli `MutfakOrders.jsx` ekranından siparişi görür. Depodaki stok yeterliyse "Sevk Et" butonuna basarak ürünleri şubeye yola çıkarır. Bu işlem mutfak stoğunu azaltır.
3. **Mal Kabul:** Şube yetkilisi gelen ürünleri `MalKabul.jsx` ekranında sayarak teslim alır. Onay verildiğinde ürünler şube stoğuna (inventory) girer.

### Akış 3: B2B Toptan Satış ve Cari İşlem
1. **Müşteri Tanımı:** Depo yetkilisi `Musteriler.jsx` üzerinden bir "B2B Kurumsal Müşteri" oluşturur ve vergi bilgilerini girer.
2. **Sipariş Girişi:** `B2BOrders.jsx` ekranından "Yeni B2B Siparişi" butonuna basılır. Müşteri seçilir, satılacak stok veya yarı mamuller eklenir, KDV ve fiyatlar belirlenip sipariş kaydedilir.
3. **İrsaliye ve Sevk:** Sipariş "Sevk Et" butonu ile onaylandığında iki olay gerçekleşir:
   - İlgili ürünler satıcı (Depo/Mutfak) stoğundan `b2b_sale_out` hareketi ile düşülür.
   - Müşterinin cari hesabına toplam fatura tutarı kadar "Borç" kaydı (`cari_hareketler`) işlenir.
4. **Yazdırma:** Belge irsaliye şablonuyla yazdırılarak kamyona/kuryeye teslim edilir.

### Akış 4: Merkez Mutfak Talep Planlama (Reçete Patlatma)
1. **İhtiyaç Analizi:** Mutfak şefi sipariş ekranına girer, şubelerin 50 kg SOS istediğini görür.
2. **Hesaplama:** Sistem `kitchenDemandPlanning.js` aracılığıyla 50 kg SOS üretmek için reçetedeki bileşenleri hesaplar (Ör: 30 kg Mayonez, 20 kg Ketçap).
3. **Satın Alma:** Mutfak şefi bu hesaplanan hammaddeleri Ana Depo'dan veya Dış Tedarikçiden sipariş etmek için otomatik satın alma belgesi (Purchase Order) oluşturur.
