## İşlem: Lot & SKT İzlenebilirlik Raporu
Alternatif kullanıcı ifadeleri:
- Lot sorgulama nasıl yapılır?
- Hangi lot hangi şubeye gitti nasıl görürüm?
- Geri çağırma (Recall) listesi nasıl alınır?
- Ürün tarama geçmişi ve hareket defterine nereden bakılır?

Amaç:
Herhangi bir ürün lotunun tedarikçiden kabulünden başlayarak depodaki hareketlerini, hangi şubelere transfer edildiğini, el terminali üzerindeki işlem geçmişini (timeline) takip etmek ve olası bir geri çağırma (recall) durumunda CSV listesi oluşturmak.

Ekran yolu:
Depo ve Üretim Ekranları > Depo WMS > Lot İzlenebilirlik

Link:
/wms-traceability

Adımlar:
1. Lot İzlenebilirlik sayfasına gidin.
2. Arama kutusuna sorgulamak istediğiniz Lot Numarasını girin ve "İzini Sür" butonuna tıklayın.
3. Lot numarasının ait olduğu ürün, SKU ve son tüketim tarihi (SKT) bilgilerini üst kartta doğrulayın.
4. **Şube Dağılım & Geri Çağırma Listesi (Recall):** İlgili lotun hangi şubeye ne kadar sevk edildiğini ve teslimat tarihlerini inceleyin. Sağ üst köşedeki "Geri Çağırma Listesi (CSV)" butonuna tıklayarak şube bazlı etkilenen stok listesini bilgisayarınıza indirin.
5. **Detaylı Stok Hareket Defteri (Ledger):** Sol altta bulunan tabloda lotun depoya girişi, lokasyon taşımaları, zayiler ve çıkışlarına dair zaman damgalı tüm envanter hareketlerini (+/-) inceleyin.
6. **Android Tarama & Görev İcra Zaman Çizelgesi:** Sağ sütunda, bu lot ile ilgili olarak el terminalinde görev icra eden personellerin ad-soyad bilgilerini, okutulan lokasyon/LPN/ürün barkodlarını ve görevlerin ne zaman başlayıp bittiğini dikey bir akış çizgisi (timeline) üzerinde inceleyin.

Önemli uyarı:
Geri çağırma listesi ve zaman çizgisi verileri, geriye dönük lot bazlı envanter hareketlerinden (ledger) ve Android terminal loglarından dinamik olarak çekilir. Eğer sorgulanan lot numarasına ait veri gelmiyorsa, el terminalinden lot girişi yapılmamış veya bu lot numarasıyla sisteme giriş yapılmamış olabilir.
