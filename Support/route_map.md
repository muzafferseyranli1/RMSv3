# SuitableRMS Geçerli Ekran ve Link Haritası (Route Map)

> [!IMPORTANT]
> **YAPAY ZEKA ASİSTANI İÇİN KESİN KURAL:** 
> Kullanıcıya bir sayfa linki (URL) verirken **SADECE AŞAĞIDAKİ TABLODA BULUNAN** "Geçerli Yol (Path)" sütunundaki değerleri kullanmalısın. Eğer aradığın modül bu tabloda yoksa KESİNLİKLE LİNK VERME ve uydurma.

## 1. Merkez / Yönetici Ekranları (Backoffice)
| Modül / İşlem Adı | Geçerli Yol (Path) | Modal / Alt Sekme (Varsa) | İlgili Kılavuz Dosyası |
| :--- | :--- | :--- | :--- |
| **Gösterge Paneli** | `/dashboard` | - | - |
| **Destek Paneli** | `/destek` | - | - |
| **Şirket Bilgileri (Şube Tanımlama)** | `/company` | - | `kurulum/01_sube_ve_sirket.md` |
| **Tedarikçiler** | `/suppliers` | - | `kurulum/03_tedarikci_ve_hammadde.md` |
| **Birimler (Ölçü)** | `/units` | - | `kurulum/02_birimler_ve_kategoriler.md` |
| **Kategoriler** | `/categories` | - | `kurulum/02_birimler_ve_kategoriler.md` |
| **Vergiler (KDV)** | `/taxes` | - | - |
| **Şablonlar** | `/templates` | - | - |
| **Stok Kalemleri** | `/stock-items` | - | `kurulum/03_tedarikci_ve_hammadde.md` |
| **Satış Kalemleri (Ürünler)** | `/products` | - | `kurulum/04_satis_mali_tanimlama.md` |
| **Yarı Mamuller** | `/semi-products` | - | - |
| **Maliyet Hesaplama (Reçeteler)** | `/recipes` | - | `kurulum/04_satis_mali_tanimlama.md` |
| **Seçenekler (Opsiyonlar)** | `/options` | - | - |
| **Combo Menüler** | `/combo-menu` | - | - |
| **Satış Kategorileri** | `/sale-categories` | - | `kurulum/02_birimler_ve_kategoriler.md` |
| **Fiyatlar (Fiyat Listeleri)** | `/prices` | - | - |
| **Sistem Ayarları** | `/settings` | - | - |
| **Hesap Çizelgesi** | `/hesap-cizelgesi` | - | - |
| **Muhasebe Eşleştirmeleri** | `/muhasebe-eslestirmeleri` | - | - |
| **Sözleşmeler** | `/contracts` | - | - |
| **Personeller** | `/personel` | - | - |
| **Müşteriler / Cariler** | `/musteriler` | - | - |
| **Sadakat Yönetimi** | `/sadakat` | - | `sadakat/sadakat_sistemi_kapsamli.md` |
| **Sadakat Kampanya Sihirbazı** | `/sadakat/kampanya/yeni` | (Parametreli: `/sadakat/kampanya/:id`) | `sadakat/sadakat_sistemi_kapsamli.md` |
| **Sadakat Kupon Serileri** | `/sadakat/kupon-serileri` | - | `sadakat/sadakat_sistemi_kapsamli.md` |
| **Çağrı Merkezi** | `/call-center` | - | - |
| **Dönem Kapanışı** | `/donem-kapanis` | - | - |

## 2. Şube ve Operasyon Ekranları (Branch Scope)
| Modül / İşlem Adı | Geçerli Yol (Path) | Modal / Alt Sekme (Varsa) | İlgili Kılavuz Dosyası |
| :--- | :--- | :--- | :--- |
| **POS Ekranı** | `/pos` | - | - |
| **Garson Ekranı** | `/garson` | - | - |
| **Kiosk Ekranı** | `/kiosk` | - | - |
| **Sipariş Yönetimi** | `/orders` | - | `isletme/siparis_ve_mal_kabul.md` |
| **Mal Kabul** | `/mal-kabul` | - | `isletme/siparis_ve_mal_kabul.md` |
| **Masa Yönetimi** | `/:branchId/masalar` | (Parametreli branchId doldurulur) | - |
| **Cihaz Ayarları** | `/:branchId/cihazlar` | - | - |
| **Şube Personel** | `/sube-personel` | - | - |
| **Şube Zayi Kaydı** | `/sube-zayi-kaydi` | - | - |
| **Şube Sayım** | `/count` | - | - |
| **Şube Transfer** | `/sube-transfer` | - | - |

## 3. Depo ve Üretim Ekranları (WMS & Merkez Mutfak)
| Modül / İşlem Adı | Geçerli Yol (Path) | Modal / Alt Sekme (Varsa) | İlgili Kılavuz Dosyası |
| :--- | :--- | :--- | :--- |
| **Depo Siparişler** | `/depo-orders` | - | - |
| **Ana Depo Sayım** | `/depo-count` | - | - |
| **Ana Depo Zayi Kaydı** | `/depo-zayi-kaydi` | - | - |
| **Ana Depo Transfer** | `/depo-transfer` | - | - |
| **WMS Görevleri** | `/depo-wms-tasks` | - | `wms_sayim_fark_onay.md` |
| **WMS Mobil Panel** | `/wms-mobile` | - | `wms_mobil_kullanim.md` |
| **Kalite & Karantina** | `/wms-quality` | - | `wms_karantina.md` |
| **Lot İzlenebilirlik** | `/wms-traceability` | - | `wms_izlenebilirlik.md` |
| **Araç Tanımları** | `/wms-vehicles` | - | `wms_arac_yonetimi.md` |
| **Merkez Mutfak Üretim** | `/merkezmutfak-uretim` | - | - |
| **Merkez Mutfak Sayım** | `/merkezmutfak-count` | - | - |

> [!NOTE]
> Sayfa yollarında bulunan `/:branchId` veya `/:campaignId` gibi dinamik parametreleri LLM'in otomatik doldurmasına gerek yoktur. Sistem frontend tarafında gerekli parametreyi kullanıcı oturumuna göre çoğu zaman kendi yönetir. Eğer asistan link veriyorsa orijinal parametreli yolu (Örn: `/sadakat/kampanya/:campaignId`) verebilir veya kullanıcının o işlemi ekranda (butonlarla) yapmasını yönlendirebilir. Eğer bir Modalde açılan bir işlemse link yerine, ana menü yolunu verip ardından eylem adımıyla modalı işaret etmelidir.
