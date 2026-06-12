# SUITABLERMS DESTEK (SUPPORT) SİSTEMİ - AGENT KURALLARI (HANDOFF)

Bu dosya, herhangi bir makine değişikliğinde veya yeni bir sohbette Yapay Zeka Ajanının (Agent) `Support` klasörü altındaki dokümantasyon görevine kaldığı yerden devam edebilmesi için hazırlanmış ana kurallar bütünüdür.

**Eğer bir Agent olarak bu dosyayı okuyorsan, görevin SuitableRMS için Son Kullanıcı (Restoran Müdürü) Operasyonel Kılavuzlarını hazırlamak ve güncellemektir.** Lütfen aşağıdaki kurallara harfiyen uy.

---

## 1. SİSTEMİN GENEL KURALLARI (AGENT DAVRANIŞI)
1. **Teknik Detayları Gizle:** Son kullanıcı destek kılavuzlarında ASLA veritabanı tablo isimlerinden (`public.musteriler`, `inventory_movements` vb.), dosya dizinlerinden (`src/components/...`) veya çevresel değişkenlerden (`GEMINI_API_KEY`) bahsetme. 
2. **Yönlendirmeler:** Sayfa yönlendirmelerinde her zaman tarayıcıdan tıklanabilir localhost linkleri kullan. Örn: `http://localhost:5173/destek` veya `http://localhost:5173/sadakat/kampanya`
3. **Gerçekçi Ol:** Olmayan bir özelliği veya butonu uydurma. Bir kılavuz yazmadan önce MUTLAKA projenin kaynak kodlarını (`src/components/` ve `server/`) tarayarak ekranın gerçekten nasıl çalıştığını analiz et.
4. **Dil ve Üslup:** Tüm dokümanları açık, anlaşılır, restoran operasyonlarına uygun ve akıcı bir Türkçe ile yaz.

## 2. DESTEK (SUPPORT) SİSTEMİNİN KURALLARI
1. **Dosya Formatı:** Destek sisteminin okuduğu tüm kılavuzlar `Support/` klasörü içerisinde ve `.md` (Markdown) formatında olmalıdır.
2. **RAG Mimarisi:** Backend (`server/index.js` içerisindeki `/api/support/chat`), buradaki tüm `.md` dosyalarını birleştirip Gemini API'ye gönderir. Dosya isimlerinin açıklayıcı olmasına (örn: `wms_depo.md`, `maliyet_hesaplama.md`) dikkat et.
3. **Doküman Yapısı:** Yeni bir kılavuz oluştururken şu hiyerarşiyi kullan:
   * Modülün Amacı (Ne işe yarar?)
   * Ekranlara Erişim (Nasıl girilir? MUTLAKA frontend URL yolunu belirtin, Örn: `/donem-kapanis`)
   * Önemli Adımlar / Kurallar (Kullanım detayları)
   * Sık Sorulan Sorular / Sorun Giderme
4. **Linklerin Önemi:** Asistanın kullanıcıyı doğru sayfaya yönlendirebilmesi için hazırladığın dokümanın içinde o sayfanın doğrudan link (URL path) karşılığı mutlaka bulunmalıdır.
5. **Geliştirme Döngüsü (Workflow):** Kullanıcı "X modülünü anlat" dediğinde; 
   - Önce ilgili bileşen kodunu oku.
   - Modülün iş mantığını anla.
   - `Support/x_modulu.md` dosyasını oluştur.
   - Kullanıcıya özet bir bilgi vererek görevi tamamla.

---

## 3. CEVAPLANAMAYAN SORULARIN TOPLANMASI (GELİŞTİRME YOL HARİTASI)
Bu sistem canlıya alındığında, asistanın mevcut kılavuzlarda bulamadığı (cevaplayamadığı) soruları toplamak için izlenecek strateji şudur:

1. **Yapay Zeka Talimat Güncellemesi:** Canlıdaki `server/index.js` dosyasında Gemini'ye gönderilen "systemInstruction" bölümüne şu kural eklenecektir:
   * *"Eğer kullanıcının sorusunun cevabı sana verilen kılavuzlarda kesinlikle yoksa, cevap uydurma. Yanıtına tam olarak şu cümleyi ekle: `[UNANSWERED]` ve ardından sorunun neden cevaplanamadığını nazikçe belirt."*
2. **Backend Loglama Mekanizması:** Backend, Gemini'den dönen cevabın içinde `[UNANSWERED]` kelimesini gördüğünde, kullanıcının sorduğu orijinal soruyu yakalayacak ve veritabanında yeni oluşturulacak bir tabloya (örn: `support_unanswered_queries`) veya bir log dosyasına (`Support/unanswered.log`) kaydedecektir.
3. **Yapay Zeka ile Geri Bildirim Döngüsü (Feedback Loop):** 
   * Geliştirici (Kullanıcı), periyodik olarak Agent'a *"Cevaplanamayan soruları analiz et"* komutu verecektir.
   * Agent bu log tablosunu okuyacak, insanların en çok hangi konuları (örneğin "Vardiya nasıl kapatılır?") sorduğunu tespit edecektir.
   * Ardından Agent, kaynak kodu tarayarak "Vardiya Kapatma" modülünü öğrenecek ve `Support/vardiya_kapatma.md` dosyasını otomatik olarak oluşturacaktır.
   * Böylece sistem, müşterilerin sorduğu ama bilmediği soruları öğrenerek **sürekli ve otomatik olarak kendini genişleten** bir bilgi bankasına dönüşecektir.

---

## 4. OTOMATİK DOKÜMAN SENKRONİZASYONU VE KONTROL (AUTO-SYNC WORKFLOW)
Kullanıcı sana **"supportrules.md dosyasını oku"** veya **"dokümanları senkronize et"** dediğinde aşağıdaki adımları sırasıyla (bir Implementation Plan çıkararak) uygulamalısın:

1. **Cevaplanamayan Soruları Bul:** Sistem loglarından (veya kullanıcının ilettiği listeden) cevapsız kalan soruları tespit et.
2. **OperationSync.md Taraması:** `OperationSync.md` dosyasını aç ve en son bıraktığın `[SUPPORT_SYNC_MARKER]` işaretinden sonraki (yeni) kayıtları oku.
3. **Değişiklik ve Yeni Özellik Tespiti:** 
   * Mevcut özelliklerde değişiklik varsa -> İlgili kılavuzları güncellemeye karar ver.
   * Tamamen yeni bir özellik yapıldıysa -> Yeni bir kılavuz (`.md`) hazırlamaya karar ver.
4. **Kullanıcıya Plan Sunma (Implementation Plan):** Yapacağın bu doküman güncellemelerini bir `implementation_plan.md` dosyası olarak kullanıcıya sun. Planın içine **"Açık Sorular" (Open Questions)** bölümü ekle ve kullanıcıdan her madde için yorum (comment) iste. Örnek format:
   * *Cevaplanamayan Sorular (Örn: Combo menü nasıl fiyatlandırılır?)* -> Yorum: Cevap oluştur / oluşturma (Cevap verilmezse 'oluştur' kabul edilir)
   * *Değişen Kurallar (Örn: X ekranında şube seçimi zorunlu oldu)* -> Yorum: Düzelt / düzeltme
   * *Yeni Eklenenler (Örn: WMS modülü geliştirildi)* -> Yorum: Yeni doküman oluştur / oluşturma
5. **Onay ve Uygulama:** Kullanıcı bu açık sorulara yorumlarını (comment) yazdıktan sonra planı onayı doğrultusunda uygula. İlgili `.md` dosyalarını yarat veya güncelle. 
6. **Marker Güncelleme:** İşlem bittiğinde, bir sonraki senkronizasyon için `OperationSync.md` dosyasının en sonuna güncel bir `[SUPPORT_SYNC_MARKER]` işareti koy.
