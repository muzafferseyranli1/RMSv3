# SuitableRMS Geçerli Ekran ve Link Haritası (Route Map)

> [!IMPORTANT]
> **YAPAY ZEKA ASİSTANI İÇİN KESİN KURAL:** 
> Kullanıcıya bir sayfa linki (URL) verirken **SADECE AŞAĞIDAKİ TABLODA BULUNAN** "Geçerli Yol (Path)" sütunundaki değerleri kullanmalısın. Eğer aradığın modül bu tabloda yoksa KESİNLİKLE LİNK VERME ve uydurma.

## 1. Merkez / Yönetici Ekranları (Backoffice)
| Modül / İşlem Adı | Geçerli Yol (Path) | Modal / Alt Sekme (Varsa) | İlgili Kılavuz Dosyası |
| :--- | :--- | :--- | :--- |
| **Gösterge Paneli** | `/dashboard` | - | - |
| **Destek Paneli** | `/destek` | - | - |
| **Şirket Bilgileri (Şube Tanımlama)** | `/company` | - | `sube_tanimlama.md` |
| **Tedarikçiler** | `/suppliers` | - | - |
| **Birimler (Ölçü)** | `/units` | - | - |
| **Kategoriler** | `/categories` | - | - |
| **Vergiler (KDV)** | `/taxes` | - | - |
| **Şablonlar** | `/templates` | - | - |
| **Stok Kalemleri** | `/stock-items` | - | - |
| **Satış Kalemleri (Ürünler)** | `/products` | - | `how_to_add_new_product.md` |
| **Yarı Mamuller** | `/semi-products` | - | - |
| **Maliyet Hesaplama (Reçeteler)** | `/recipes` | - | `maliyet_hesaplama.md` |
| **Seçenekler (Opsiyonlar)** | `/options` | - | - |
| **Combo Menüler** | `/combo-menu` | - | - |
| **Satış Kategorileri** | `/sale-categories` | - | - |
| **Fiyatlar (Fiyat Listeleri)** | `/prices` | - | - |
| **Sistem Ayarları** | `/settings` | - | - |
| **Hesap Çizelgesi** | `/hesap-cizelgesi` | - | - |
| **Muhasebe Eşleştirmeleri** | `/muhasebe-eslestirmeleri` | - | - |
| **Sözleşmeler** | `/contracts` | - | - |
| **Personeller** | `/personel` | - | - |
| **Müşteriler / Cariler** | `/musteriler` | - | - |
| **Sadakat Yönetimi** | `/sadakat` | - | - |
| **Sadakat Kampanya Sihirbazı** | `/sadakat/kampanya/yeni` | (Parametreli: `/sadakat/kampanya/:id`) | `sadakat_kampanya_sihirbazi.md` |
| **Çağrı Merkezi** | `/call-center` | - | - |
| **Dönem Kapanışı** | `/donem-kapanis` | - | `donem_kapanisi.md` |

## 2. Şube ve Operasyon Ekranları (Branch Scope)
| Modül / İşlem Adı | Geçerli Yol (Path) | Modal / Alt Sekme (Varsa) | İlgili Kılavuz Dosyası |
| :--- | :--- | :--- | :--- |
| **POS Ekranı** | `/pos` | - | - |
| **Garson Ekranı** | `/garson` | - | - |
| **Kiosk Ekranı** | `/kiosk` | - | - |
| **Sipariş Yönetimi** | `/orders` | - | `siparis_yonetimi.md` |
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
| **WMS Görevleri** | `/depo-wms-tasks` | - | - |
| **WMS Mobil Panel** | `/wms-mobile` | - | `wms_mobil_kullanim.md` |
| **Merkez Mutfak Üretim** | `/merkezmutfak-uretim` | - | - |
| **Merkez Mutfak Sayım** | `/merkezmutfak-count` | - | - |

> [!NOTE]
> Sayfa yollarında bulunan `/:branchId` veya `/:campaignId` gibi dinamik parametreleri LLM'in otomatik doldurmasına gerek yoktur. Sistem frontend tarafında gerekli parametreyi kullanıcı oturumuna göre çoğu zaman kendi yönetir. Eğer asistan link veriyorsa orijinal parametreli yolu (Örn: `/sadakat/kampanya/:campaignId`) verebilir veya kullanıcının o işlemi ekranda (butonlarla) yapmasını yönlendirebilir. Eğer bir Modalde açılan bir işlemse link yerine, ana menü yolunu verip ardından eylem adımıyla modalı işaret etmelidir.
