## İşlem: Maliyet Yeniden Hesaplama ve Geriye Dönük İşlemler
Alternatif kullanıcı ifadeleri:
- Geçmişe dönük fatura girdim maliyet düzeldi mi?
- Geriye dönük mal kabul maliyeti nasıl hesaplanır?
- Satış raporlarındaki eski maliyetleri nasıl düzeltirim?

Amaç:
Geriye dönük girilen fatura/mal kabul veya stok hareketlerinin sistem tarafından Ağırlıklı Ortalama Maliyet (WAC) hesaplamalarına olan etkisini yönetmek.

Ekran yolu:
Depo > Mal Kabul (Tetiklenen işlemler arka planda çalışır)

Link:
/mal-kabul

Adımlar:
1. Mal Kabul ekranından geriye dönük bir hareket girdiğinizde sistem otomatik olarak yeniden hesaplama kuyruğuna görev ekler.
2. Stok defteri ve güncel stok maliyetleri kronolojik sırayla otomatik olarak hesaplanır ve düzeltilir.
3. Geçmiş satış raporlarındaki maliyet snapshot'larının (dondurulmuş maliyetlerin) güncellenmesi gerekiyorsa teknik ekibe haber vererek ilgili scripti (generate-missing-sales.mjs) çalıştırtın.

Önemli uyarı:
Sistem stok defteri maliyetlerini otomatik düzeltir ancak POS ve Garson üzerinden yapılan geçmiş satışların kârlılık raporlarındaki snapshot maliyetleri otomatik değişmez.
