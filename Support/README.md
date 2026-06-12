# SuitableRMS Destek Masası ve Bilgi Bankası (Support Base)

Bu dizin, SuitableRMS sisteminde görev yapan yapay zeka destek asistanlarının (Support Agent) ortak hafızasını, sistem bilgi bankasını ve operasyonel kılavuzları barındırmaktadır.

Tüm destek asistanları, kullanıcılardan gelen sorulara cevap vermeden ve sisteme müdahale etmeden önce bu dokümantasyonu esas almalı ve yeni bir süreç/çözüm geliştirildiğinde buradaki bilgi bankasını güncellemelidir.

---

## 📖 Destek Dokümanları Dizini

Aşağıdaki tabloda, sistemdeki temel iş süreçleri ve bunlara ait teknik rehberler yer almaktadır:

| Doküman | Açıklama | Hedef Kitle |
| :--- | :--- | :--- |
| [Müşteri Destek Yönergesi (README.md)](file:///c:/RMSv3/Support/README.md) | Destek masası kuralları, agent yetkileri ve genel kullanım kılavuzu. | Tüm Destek Asistanları |
| [Yeni Ürün Ekleme ve Menü Tanımlama Kılavuzu](file:///c:/RMSv3/Support/how_to_add_new_product.md) | Yeni bir satış kalemi (örn. Hamburger), reçete, porsiyon ve seçenek gruplarının sisteme girilmesi adımları. | Destek / Backoffice |
| [Tedarikçi Değişikliği Kılavuzu](file:///c:/RMSv3/Support/how_to_change_supplier.md) | Bir stok kartının tedarikçisini değiştirme ve ilgili sipariş akışları ile sözleşmelerin güncellenmesi adımları. | Destek / Satınalma |
| [Maliyet Hesaplama ve Geriye Dönük İşlemler Kılavuzu](file:///c:/RMSv3/Support/cost_recalculation_guide.md) | Geriye dönük girilen faturaların/stok hareketlerinin WAC maliyet hesaplamalarına etkisi ve sistemin çalışması. | Destek / Muhasebe & Depo |
| [Operasyon El Kitabı Tanımları Analiz Raporu](file:///c:/RMSv3/Support/manual_pages_coverage.md) | Ürün ve hammadde el kitaplarının veritabanındaki tanımlanma oranları ve eksik listesi analizi. | Destek / Backoffice |
| [Yeni Müşteri Kazanımı Kampanya Rehberi](file:///c:/RMSv3/Support/campaign_recommendations.md) | Yeni müşteriler kazanmak için referans, kupon ve hoş geldin puan kampanyaları kurulumu. | Destek / Pazarlama |
| [Kayıp Müşteri Geri Kazanım Kılavuzu](file:///c:/RMSv3/Support/customer_retention_guide.md) | Uykudaki/gelmeyi bırakan eski müşterileri segmente etme ve geri kazanma kampanyaları oluşturma. | Destek / Pazarlama |
| [Sistem Mimarisi ve Dosya Haritası](file:///c:/RMSv3/Support/system_architecture_overview.md) | Projenin genel modülleri, ilgili kod yolları, veritabanı tabloları ve sayfa bağlantıları. | Destek / Teknik Ekip |

---

## 🛡️ Yapay Zeka Destek Asistanı Kuralları

1. **Read-Only / Bilgi Verme Modu:** Destek asistanı olarak birincil göreviniz, veritabanı şeması ve frontend kodlarına tamamen hakim olup kullanıcılara **adım adım, açıklayıcı ve yönlendirici** kılavuzlar sunmaktır.
2. **Dokümantasyon Linkleri:** Destek klasöründeki teknik belgelerde ilgili kaynak kod dosyalarına (`file:///...`) ve veritabanı tablolarına ait tıklanabilir bağlantılar bulunmalıdır.
3. **Mevcut Yapıyı Koruma:** Mevcut kod yapısını değiştirmeyin. Kullanıcıya sistemi nasıl kullanacağını veya hangi adımları izlemesi gerektiğini anlatın.
4. **Türkçe İletişim:** Tüm kılavuzlar, planlar ve kullanıcı yanıtları Türkçe dilinde olmalıdır.
5. **Kullanıcı Sohbetlerinde Sadelik (Teknik Detayların Gizlenmesi):** Kullanıcıya (restoran işletmecisine) yazılan doğrudan sohbet yanıtlarında kaynak kod dosya adları, veritabanı tablo isimleri ve teknik parametreler kesinlikle yer almaz. Yanıtlar sadece iş mantığını ve doğrudan tıklanabilir yerel tarayıcı linklerini (`http://localhost:5173/...`) içermelidir.
