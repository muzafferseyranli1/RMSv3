## İşlem: WMS Lot ve SKT İzlenebilirlik Raporu (Recall)

Alternatif kullanıcı ifadeleri:
- Hangi lot hangi şubelere gönderildi nasıl görebilirim?
- Ürün geri çağırma (recall) listesini nasıl çıkarırım?
- Bozuk çıkan bir ürün partisinin geçmişini ve hareketlerini nasıl izlerim?
- El terminalinden hangi personel hangi barkodu okutmuş nasıl takip ederim?

Amaç:
Gıda güvenliği veya kalite problemleri durumunda, belirli bir Lot (Parti) / SKT (Son Kullanma Tarihi) numarasına sahip stokların tedarikçiden depoya girişinden itibaren şubelere sevk edilmesine, el terminalinde taranma anlarına ve şubelerdeki güncel dağılım miktarlarına kadar tüm geçmişinin izlenmesi ve gerekirse geri çağırma (recall) listesinin dışa aktarılması.

Ekran yolu:
Ana Depo / WMS > Lot İzlenebilirlik Raporu

Link:
/wms-traceability

Adımlar:
1. Tarayıcıdan [http://localhost:5173/wms-traceability](http://localhost:5173/wms-traceability) adresine giderek **Lot İzlenebilirlik Raporu** ekranını açın.
2. **Lot Numarası Girin** kutusuna izlemek istediğiniz parti/lot numarasını yazıp **İzini Sür** butonuna tıklayın.
3. Rapor yüklendiğinde üstteki **Özet Bilgi** alanından ürün adı, SKU kodu ve SKT tarihini doğrulayın.
4. **Şube Dağılımı (Geri Çağırma Listesi)** tablosundan, bu lotlu ürünlerin hangi şubelere ne miktarda sevk edildiğini ve ilk/son alım tarihlerini inceleyin.
5. Bir geri çağırma operasyonu başlatacaksanız, tablonun sağ üstündeki kırmızı **Geri Çağırma Listesi (CSV)** butonuna tıklayarak Excel/CSV listesini indirin.
6. Sayfanın altındaki **Stok Hareketleri Geçmişi** tablosundan ürünün depoya girişinden (mal kabul) çıkışına (şube sevk, zayi, imha) kadar gerçekleşen tüm finansal/fiziksel hareketleri inceleyin.
7. En alttaki **Mobil Tarama ve Görev Geçmişi** zaman çizgisinden (timeline), depodaki görevlilerin el terminali üzerinden bu lotla yaptığı taramaları (LPN, lokasyon, ürün barkodu okutma anları, miktar onayları ve karşılaşılan hata kayıtları) tarih/saat ve personel adı bazında takip edin.

Önemli uyarı:
Geri çağırma (recall) operasyonlarında şubelerin ellerindeki stok miktarlarını anlık tespit edebilmek için şubelerdeki mal kabul ve transfer işlemlerinin güncel olarak tamamlanmış olması şarttır.
