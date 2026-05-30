# Eksik Demo Satışların Tamamlanması

Bu plan, `demosales.md` kurallarına sadık kalarak, 26.05.2026 tarihinden bugüne kadar olan (bugün hariç) günlerdeki eksik şube satış verilerini tamamlamak için bir Node.js betiğinin yazılmasını ve çalıştırılmasını kapsar.

## Hedef Kapsam
* **Başlangıç Tarihi:** 27.05.2026
* **Bitiş Tarihi:** 29.05.2026 (30.05.2026 'bugün' olduğu için hariç)
* **Şubeler:** Sistemdeki tüm aktif şubeler.
* **Kural:** Seçili tarihte şube için hali hazırda yeterli düzeyde satış (örn. 100'den fazla) varsa o gün atlanacak. Eğer az sayıda (test amaçlı) satış varsa, bunlar da dikkate alınarak eksik kalan miktar `demosales.md` yönergelerine uygun olarak üretilecek.

## Open Questions
> [!IMPORTANT]
> Veritabanında (Railway Postgres) her şube için günde ortalama 160-300 arası fiş oluşturulacağı düşünülürse, 3 gün x tüm şubeler hesaba katıldığında binlerce satış fişi üretilecektir. Bu durum test ortamınızdaki raporları büyük ölçüde dolduracaktır. Bu işlem onayınızda mıdır?

> [!WARNING]
> Aynı tarihte önceden oluşturulmuş 'demo' etiketli eski test satışları varsa, mükerrer veri yaratmamak adına `integration_ref = 'demo-sales-tool'` olan eski dataları (o gün için) silmeli miyiz, yoksa sadece test amaçlı atılmış birkaç satışın eksiğini hesaplayarak üzerine mi ekleme yapmalıyım? (Silip o gün için temiz, kurallı bir demo bloğu basmak genelde raporları daha sağlıklı kılar).

## Proposed Changes

Aşağıdaki script oluşturularak kullanılacaktır:

### Scripts

#### [NEW] [generate-missing-sales.mjs](file:///c:/RMSv3/scripts/generate-missing-sales.mjs)
Bu script veritabanına bağlanacak, ilgili tarihleri ve şubeleri tarayacak, eksik olan satış miktarını belirleyerek `demosales.md` kural setine göre sepetleri (ürünler, miktarlar, fiyatlandırmalar, varyantlar), indirimleri, ödemeleri ve stok hareketlerini (`inventory_movements`) hesaplayıp "transaction chunk"lar halinde veritabanına yazacaktır.

## Verification Plan
1. Script oluşturulduktan sonra `c:\RMSv3` dizininde çalıştırılacak.
2. İşlem tamamlandığında script tarafından özet rapor loglanacak.
3. Rapor çıktıları (üretilen fiş sayısı, ciro vb.) `OperationSync.md` dosyasına kaydedilerek süreç doğrulanacak.
