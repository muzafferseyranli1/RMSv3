# SuitableRMS E-Dönüşüm Platformu — Kapsamlı Sistem Mimarisi, UBL-TR Standartları ve Uçtan Uca Uygulama Kılavuzu

**Versiyon:** `3.0.0 — Master Technical Specification`  
**Yürürlük Tarihi:** `2026-08-25`  
**Kapsam:** Bu doküman, SuitableRMS E-Dönüşüm modülünün sıfırdan bugüne kadar geliştirilmiş olan **TÜM** mimarisini, veri modellerini, yasal GİB standartlarını, algoritmalarını ve kullanıcı arayüzü akışlarını eksiksiz olarak açıklamaktadır.

---

# İÇİNDEKİLER

1. [Sisteme Genel Bakış ve Vizyon](#1-sisteme-genel-bakış-ve-vizyon)
2. [GİB E-Belge Standartları ve Modülleri](#2-gib-e-belge-standartları-ve-modülleri)
   - 2.1. E-Fatura & E-Arşiv Fatura
   - 2.2. E-İrsaliye (Elektronik Sevk İrsaliyesi)
   - 2.3. E-Müstahsil Makbuzu (Hal / Çiftçi Alımları)
   - 2.4. E-Adisyon (Restoran & Masa Siparişleri)
   - 2.5. Grup İçi (Inter-Company) Çapraz Faturalaşma
3. [UBL-TR 2.1 XML Oluşturucu & XSLT Görselleştirici](#3-ubl-tr-21-xml-oluşturucu--xslt-görselleştirici)
   - 3.1. UBL XML Generator Mimarisi
   - 3.2. Vergi Kodları, Tevkifat ve İstisna Yönetimi
   - 3.3. XSLT Şablonu ile HTML / PDF Render Motoru
   - 3.4. Derin UBL Meta Veri & Not Parser (Regex Algoritmaları)
4. [Entegratör Soyutlama Katmanı (Adapter Pattern)](#4-entegratör-soyutlama-katmanı-adapter-pattern)
   - 4.1. `IntegratorAdapter` Soyut Arayüzü
   - 4.2. Uyumsoft Adaptörü (SOAP / XML-RPC)
   - 4.3. EDM Bilişim Adaptörü (REST / Token / SOAP)
   - 4.4. Mock Integrator (Offline & Simülatör Modu)
   - 4.5. Canlı Kontör Sorgulama ve E-Arşiv İptal/İtiraz
5. [3-Way ve Ters Eşleştirme Motoru (Matching Engine)](#5-3-way-ve-ters-eşleştirme-motoru-matching-engine)
   - 5.1. 6 Aşamalı Kademeli Waterfall Doğrulama Pipeline'ı
   - 5.2. Çoklu İrsaliye Konsolidasyonu (N:1 Eşleştirme & Canlı Tutar Terazisi)
   - 5.3. Ters Eşleştirme (İrsaliye ➔ Fatura) & Kesin Tedarikçi İzolasyonu
   - 5.4. Hizmet Faturaları & Açık Gider Tahakkuk Kapatma Dönüşümü
   - 5.5. Tedarikçi Kalem Hafıza Tablosu (`supplier_item_mappings`)
   - 5.6. Sözleşme Fiyat Denetimi & Satınalma Aşım Kilidi
6. [Veritabanı Şeması ve İlişki Modeli (PostgreSQL DDL)](#6-veritabanı-şeması-ve-ilişki-modeli-postgresql-ddl)
7. [Kullanıcı Arayüzü ve Ekran Mimarisi (`EInvoiceManager.jsx`)](#7-kullanıcı-arayüzü-ve-ekran-mimarisi-einvoicemanagerjsx)
8. [Uçtan Uca Veri Akış Şemaları (Sequence & Architecture Diagrams)](#8-uçtan-uca-veri-akış-şemaları-sequence--architecture-diagrams)
9. [Kurulum, Yapılandırma ve Canlıya Alma Kılavuzu](#9-kurulum-yapılandırma-ve-canlıya-alma-kılavuzu)

---

## 1. Sisteme Genel Bakış ve Vizyon

SuitableRMS E-Dönüşüm Portalı; yeme-içme, zincir restoran, otelcilik ve perakende sektöründe faaliyet gösteren işletmelerin e-dönüşüm süreçlerini (Uyumsoft, EDM veya doğrudan GİB) tek bir merkezden yürütmesini sağlayan tam kapsamlı bir mutabakat ve e-belge ekosistemidir.

### Mimarinin 4 Temel Direği:
1. **Zero-Portal Dependency (Dış Panel Bağımsızlığı):** İşletme çalışanlarının veya muhasebecinin Uyumsoft/EDM paneline girmesine gerek kalmaz. Bakiye takibi, gelen/giden faturalar, e-irsaliyeler, e-müstahsil, e-adisyon, iptal/itiraz ve ticari yanıtlar RMS içerisinden yürütülür.
2. **Akıllı Otomasyon & Öğrenen Bellek:** Tedarikçi ürün adları ile restoran stok kartları otomatik eşleşir ve bir kez yapılan eşleştirme `supplier_item_mappings` tablosunda kalıcı hafızaya alınır.
3. **Mali ve Hukuki Bütünlük:** Sözleşme fiyat kontrolleri, GİB 5.000/30.000 TL e-Arşiv limitleri, e-Adisyon $\leftrightarrow$ e-Fatura zorunlu bağları ve Tevkifat/Stopaj oranları tam yasal uyumla denetlenir.
4. **Çift Yönlü 3-Way Matching:** Fatura $\rightarrow$ İrsaliye $\rightarrow$ Sipariş/Sözleşme kontrolü yapılabildiği gibi; Mal Kabul $\rightarrow$ Gelen Fatura (Ters Eşleştirme) da kesin tedarikçi şartıyla yapılabilir.

---

## 2. GİB E-Belge Standartları ve Modülleri

SuitableRMS aşağıdaki 5 temel e-belge standardını UBL-TR 2.1 formatında uçtan uca destekler:

### 2.1. E-Fatura & E-Arşiv Fatura
- **E-Fatura:** Alıcısı GİB e-fatura mükellefi olan kurumlara kesilen veya onlardan gelen belgedir.
  - **Profiller:** `TICARIFATURA` (7 gün içinde Kabul/Red yanıtı verilebilir), `TEMELFATURA` (Sistemden otomatik onaylanır), `IHRACAT`, `KAMU`.
  - **Tipler:** `SATIS`, `IADE`, `TEVKIFAT`, `ISTISNA`, `OZELMATRAH`, `IHRACKAYITLI`.
- **E-Arşiv Fatura:** Alıcısı e-fatura mükellefi olmayan nihai tüketicilere veya vergi mükelleflerine kesilen belgedir.
  - **Profil:** `EARSIVFATURA` (Raporlama usulüyle GİB'e iletilir).
  - **GİB İptal/İtiraz:** Hatalı kesilen e-arşiv faturaları için sistem üzerinden gerekçeli iptal/itiraz kaydı oluşturulabilir.

### 2.2. E-İrsaliye (Elektronik Sevk İrsaliyesi)
- **GİB Standartı:** UBL-TR `DespatchAdvice` XML şeması.
- **Kapsam:** Depolar arası transfer, şubeler arası sevkiyat veya müşteriye mal tesliminde düzenlenir.
- **Zorunlu Alanlar:** Taşıyıcı VKN/TCKN, Şoför Ad/Soyad ve TCKN, Plaka No, Dorse Plaka No, Sevk Tarihi ve Saati, Teslimat Adresi.

### 2.3. E-Müstahsil Makbuzu (Hal / Çiftçi Alımları)
- **Kapsam:** Gerçek usulde vergiye tabi olmayan çiftçilerden / köylülerden doğrudan sebze, meyve, et, süt gibi hammadde alımlarında düzenlenir.
- **Yasal Kesintiler:**
  - **Gelir Vergisi Stopajı (GVK Madde 94):** Zirai mahsuller için %1 - %4 arası stopaj kesintisi.
  - **Bağ-Kur / SGK Tevkifatı:** %2 oranında çiftçi sosyal güvenlik primi kesintisi.
  - **Borsa Tescil Ücreti:** Varsa ticaret borsası tescil payı.
- **Net Ödeme Formülü:**
  $$\text{Net Ödenecek} = \text{Brüt Tutar} - (\text{GV Stopajı} + \text{SGK Tevkifatı} + \text{Borsa Payı})$$

### 2.4. E-Adisyon (Restoran & Masa Siparişleri)
- **GİB Düzenlemesi:** Masada hizmet veren lokanta, restoran ve kafelerin adisyonları elektronik ortamda tutma zorunluluğu.
- **Süreç:**
  1. Masada sipariş açıldığında anında `e_adisyons` kaydı ve benzersiz ETTN (UUID) üretilir.
  2. Karekod (QR Code) oluşturularak masadaki fişte basılır.
  3. Hesap kapatılıp e-fatura/e-arşiv kesildiğinde, faturanın UBL XML'ine `<cac:AdditionalDocumentReference>` olarak adisyon ETTN'si eklenir ve belge kapatılır.

### 2.5. Grup İçi (Inter-Company) Çapraz Faturalaşma
- **Kapsam:** Birden fazla tüzel kişiliğe (şirkete) veya şubeye sahip işletmelerde merkez depodan şubeye veya bir şirketten diğerine ürün aktarımı.
- **Otomasyon:** Gönderici şirket e-faturayı kestiği anda sistem alıcı şirketin gider belgelerine (`expense_documents`) veya gelen faturalarına otomatik taslak/gerçek kayıt açarak iki şirketin cari hesaplarını otomatik mutabık kılar.

---

## 3. UBL-TR 2.1 XML Oluşturucu & XSLT Görselleştirici

UBL-TR 2.1 XML belgeleri [`src/lib/eInvoice/coreUblGenerator.js`](file:///X:/RMSv3/src/lib/eInvoice/coreUblGenerator.js) modülü tarafından üretilir ve ayrıştırılır.

### 3.1. UBL XML Generator Mimarisi
- Belgeye ait XML zarfı oluşturulurken GİB şemalarına (`urn:oasis:names:specification:ubl:schema:xsd:Invoice-2`) tam uyumlu kök etiketler kullanılır.
- ETTN (UUID), Belge No, Düzenleme Tarihi/Saati, Gönderici/Alıcı bilgileri, Vergi Detayları (`cac:TaxTotal`), Ödenecek Tutar (`cac:LegalMonetaryTotal`) ve Kalemler (`cac:InvoiceLine`) hiyerarşik olarak eklenir.

### 3.2. Vergi Kodları, Tevkifat ve İstisna Yönetimi ([`types.js`](file:///X:/RMSv3/src/lib/eInvoice/types.js))
- **Vergi Kodları:** `0015` (KDV), `0003` (Stopaj), `4080` (ÖTV), `8001` (Borsa), `8002` (SGK).
- **Tevkifat Kodları:** `601` (Yapım İşleri), `602` (Temizlik Hizmeti), `603` (Güvenlik Hizmeti), `604` (Makine Bakım Onarım), `605` (Yemek Servis Hizmeti - 5/10).
- **KDV İstisna Kodları:** `301` (11/1-a Mal İhracatı), `351` (KDV İade Hakkı Doğuran İşlemler).

### 3.3. XSLT Şablonu ile HTML / PDF Render Motoru
- UBL XML belgesi, gömülü veya harici standart GİB XSLT şablonu kullanılarak istemci tarafında veya backend'de render edilir.
- Kullanıcı tek tıkla resmi mühürlü, karekodlu ve logolu faturanın HTML önizlemesini görebilir veya PDF/ZIP olarak indirebilir.

### 3.4. Derin UBL Meta Veri & Not Parser (Regex Algoritmaları)
Gelen e-faturanın UBL XML'i sisteme düştüğünde şu ayrıştırmalar yapılır:
1. **İrsaliye Numaraları:** `<cac:DespatchDocumentReference>` düğümleri çekilir. Ayrıca serbest notlardaki (`cbc:Note`) 16 haneli GİB kodları (`[A-Z0-9]{3}20[0-9]{2}[0-9]{9}`) ve `İrsaliye No: ...` metinleri regex ile toplanır.
2. **Hizmet Faturası Tespiti:** Tedarikçi unvanı ve satır açıklamaları elektrik, su, doğalgaz, iletişim, kira anahtar kelimeleriyle taranarak `is_service_invoice = true` bayrağı atanır.
3. **Teslimat Adresleri:** `<cac:Delivery/cac:DeliveryAddress>` içerisinden şube ve lokasyon bilgisi ayıklanır.

---

## 4. Entegratör Soyutlama Katmanı (Adapter Pattern)

Entegratörler arası geçişi şeffaf kılmak için [`src/lib/eInvoice/integratorAdapter.js`](file:///X:/RMSv3/src/lib/eInvoice/integratorAdapter.js) taban sınıfı kullanılmıştır.

```
                  ┌────────────────────────────────────────┐
                  │    IntegratorAdapter (Soyut Taban)     │
                  └───────────────────┬────────────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        │                             │                             │
┌───────▼──────────────┐   ┌──────────▼───────────┐   ┌─────────────▼──────────────┐
│   UyumsoftAdapter    │   │      EdmAdapter      │   │    MockIntegratorAdapter   │
│ (SOAP / Basic Auth)  │   │  (REST / Token Auth) │   │ (Offline / Simülatör Test) │
└──────────────────────┘   └──────────────────────┘   └────────────────────────────┘
```

### Standart Adaptör Metot İmzaları:
- `checkConnection()`: Entegratör API ve kullanıcı kimlik doğrulama testi.
- `getCreditsBalance()`: Kalan e-kontör / kredi sorgulama.
- `sendInvoice(invoiceData)`: Giden faturayı imzalayıp GİB'e iletme.
- `fetchInboundInvoices(startDate, endDate)`: Gelen kutusundaki yeni faturaları çekme.
- `cancelEArchiveInvoice(invoiceNumber, reason)`: GİB e-Arşiv iptal/itiraz talebi gönderme.
- `downloadBatchFiles(invoiceIds, format)`: Çoklu faturaları tek ZIP arşivinde paketleme.
- `sendCommercialResponse(invoiceNumber, responseType, reason)`: Ticari faturaya `KABUL` veya `RED` yanıtı dönme.

---

## 5. 3-Way ve Ters Eşleştirme Motoru (Matching Engine)

[`src/lib/eInvoice/matchingEngine.js`](file:///X:/RMSv3/src/lib/eInvoice/matchingEngine.js), SuitableRMS'in en kritik mutabakat bileşenidir.

### 5.1. 6 Aşamalı Kademeli Waterfall Doğrulama Pipeline'ı
Her gelen fatura ile fiziksel mal kabul irsaliyesi karşılaştırılırken şu 6 aşamalı kontrol zinciri uygulanır:

1. **Aşama 1 — Tedarikçi Doğrulaması (Hard Gate):**
   - VKN/TCKN eşitliği VEYA normalize unvan benzerliği $\ge 0.50$.
   - *Sonuç:* Eşleşmezse diğer adımlara geçilmez, elenir.
2. **Aşama 2 — İrsaliye & Belge Numarası Çapraz Kontrolü:**
   - Faturadaki irsaliye referansı veya notlardaki irsaliye no ile mal kabul no kontrol edilir.
   - Mal kabulde fatura numarasının irsaliye hanesine yazılması durumu (İrsaliyeli Fatura) tespit edilir.
3. **Aşama 3 — Tarih Uyumu & Tolerans:**
   - Fatura tarihi ile sevk tarihi arası fark denetlenir ($\le 7$ gün tam uyum, $\le 30$ gün esnek uyum).
4. **Aşama 4 — Kalem (Satır) Sayısı Birebir Eşitliği:**
   - Fatura satır adedi ile irsaliye satır adedi kontrol edilir.
5. **Aşama 5 — Kalem İsimleri, Miktarlar ve Birim Fiyatlar:**
   - `supplier_item_mappings` hafızası desteğiyle ürünler eşleştirilir, miktar ve fiyat farkları satır bazında denetlenir.
6. **Aşama 6 — Sözleşme Fiyat Denetimi & Aşım Blokajı:**
   - Tedarikçinin aktif sözleşmesindeki birim fiyat + fiyat toleransı kontrol edilir. Aşım varsa ve `block_on_exceed = true` ise onay kilitlenir.

---

### 5.2. Çoklu İrsaliye Konsolidasyonu (N:1 Eşleştirme)
Birden fazla günlük irsaliyenin tek faturada birleştirildiği senaryolarda:
- Kullanıcı açık irsaliyeleri seçer.
- **Canlı Tutar Dengeleme Terazisi:**
  $$\Delta = \text{Fatura Tutarı} - \sum \text{Seçilen İrsaliyeler}$$
- $\Delta = 0.00\text{ ₺}$ olduğunda yeşil **"Denge Sağlandı ✅"** onayı verilir ve tek tıkla tüm irsaliyeler faturanın `matched_receipt_ids` dizisine bağlanır.

---

### 5.3. Ters Eşleştirme (İrsaliye ➔ Gelen Fatura) & Kesin Tedarikçi İzolasyonu
- Mal kabul personeli veya depo sorumlusu fiziki irsaliye üzerinden "Gelen e-Fatura Bul & Eşleştir" dediğinde:
  - **Hard Supplier Filter:** Yalnızca aynı tedarikçiye (VKN veya Ünvan) ait faturalar listelenir.
  - Alakasız tedarikçiler %0 puanla dahi kesinlikle önerilmez.
  - Açık irsaliyeler çoklu seçilerek tek faturaya bağlanabilir.
  - Uyumlu fatura yoksa açıklayıcı *"Uygun e-Fatura Bulunamadı"* boş durum kartı gösterilir.

---

### 5.4. Hizmet Faturaları & Açık Gider Tahakkuk Kapatma
- Elektrik, su, doğalgaz, kira gibi fiziki mal kabulü olmayan faturalar `⚡ HİZMET` olarak işaretlenir.
- **"Tahakkukla Eşleştir"** modalında finans modülünde girilmiş açık tahakkuklar (`expense_documents`) listelenir.
- Tahakkuk seçildiğinde bütçe sapma oranı hesaplanır, tahakkuk faturaya dönüştürülüp kapatılır (`is_matched = true`, `doc_type = 'invoice'`).

---

### 5.5. Tedarikçi Kalem Hafıza Tablosu (`supplier_item_mappings`)
- Tedarikçinin faturada yazdığı "Kutu Süt 1 Lt Pınar" tanımı restoranın "SUT-01 Tam Yağlı Süt" stok kartına bir kez eşleştirildiğinde, sonraki tüm faturalarda sistem bunu hatırlar ve otomatik %100 kalem uyumu sağlar.

---

## 6. Veritabanı Şeması ve İlişki Modeli (PostgreSQL DDL)

```sql
-- Entegratör Konfigürasyonları
CREATE TABLE IF NOT EXISTS e_integrator_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL, -- 'UYUMSOFT', 'EDM', 'MOCK'
    environment VARCHAR(20) DEFAULT 'TEST',
    username VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL,
    company_vkn_tckn VARCHAR(11) NOT NULL,
    company_title VARCHAR(255) NOT NULL,
    company_address TEXT,
    company_tax_office VARCHAR(100),
    credits_balance NUMERIC(15,2) DEFAULT 0,
    last_credit_check_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- E-Faturalar
CREATE TABLE IF NOT EXISTS e_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    direction VARCHAR(10) NOT NULL, -- 'INBOUND', 'OUTBOUND'
    invoice_number VARCHAR(50) NOT NULL,
    uuid VARCHAR(64) NOT NULL UNIQUE,
    profile_id VARCHAR(50) DEFAULT 'TICARIFATURA',
    invoice_type VARCHAR(50) DEFAULT 'SATIS',
    issue_date DATE NOT NULL,
    issue_time TIME,
    sender_vkn_tckn VARCHAR(11) NOT NULL,
    sender_title VARCHAR(255) NOT NULL,
    receiver_vkn_tckn VARCHAR(11) NOT NULL,
    receiver_title VARCHAR(255) NOT NULL,
    payable_amount NUMERIC(15,2) NOT NULL,
    tax_inclusive_amount NUMERIC(15,2),
    line_extension_amount NUMERIC(15,2),
    tax_total_amount NUMERIC(15,2),
    currency_code VARCHAR(10) DEFAULT 'TRY',
    notes TEXT,
    despatch_document_reference VARCHAR(100),
    order_reference VARCHAR(100),
    commercial_status VARCHAR(50) DEFAULT 'BEKLIYOR',
    is_matched BOOLEAN DEFAULT false,
    matched_receipt_id UUID REFERENCES purchase_receipts(id),
    matched_receipt_ids JSONB DEFAULT '[]',
    matched_expense_id UUID REFERENCES expense_documents(id),
    is_service_invoice BOOLEAN DEFAULT false,
    parsed_metadata JSONB DEFAULT '{}',
    ubl_xml TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- E-Fatura Kalemleri
CREATE TABLE IF NOT EXISTS e_invoice_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES e_invoices(id) ON DELETE CASCADE,
    line_number INT NOT NULL,
    item_name VARCHAR(255) NOT NULL,
    item_code VARCHAR(100),
    quantity NUMERIC(15,4) NOT NULL,
    unit_code VARCHAR(20) DEFAULT 'C62',
    unit_price NUMERIC(15,4) NOT NULL,
    line_total_amount NUMERIC(15,2) NOT NULL,
    vat_rate NUMERIC(5,2) DEFAULT 20.00,
    vat_amount NUMERIC(15,2) DEFAULT 0,
    discount_amount NUMERIC(15,2) DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- E-Adisyonlar
CREATE TABLE IF NOT EXISTS e_adisyons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ettn VARCHAR(64) NOT NULL UNIQUE,
    table_id UUID,
    table_name VARCHAR(100),
    pos_terminal_id VARCHAR(100),
    opened_at TIMESTAMPTZ NOT NULL,
    closed_at TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'OPEN', -- 'OPEN', 'BILLED', 'CANCELLED'
    total_amount NUMERIC(15,2) DEFAULT 0,
    linked_invoice_id UUID REFERENCES e_invoices(id),
    linked_invoice_number VARCHAR(50),
    qr_code_data TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- E-Müstahsil Makbuzları
CREATE TABLE IF NOT EXISTS e_producers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_number VARCHAR(50) NOT NULL UNIQUE,
    uuid VARCHAR(64) NOT NULL UNIQUE,
    farmer_name VARCHAR(255) NOT NULL,
    farmer_tckn VARCHAR(11) NOT NULL,
    issue_date DATE NOT NULL,
    gross_total NUMERIC(15,2) NOT NULL,
    stopaj_total NUMERIC(15,2) NOT NULL,
    sgk_total NUMERIC(15,2) DEFAULT 0,
    net_total NUMERIC(15,2) NOT NULL,
    status VARCHAR(50) DEFAULT 'SENT',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tedarikçi Kalem Hafıza Tablosu
CREATE TABLE IF NOT EXISTS supplier_item_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supplier_id UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    supplier_item_name VARCHAR(255) NOT NULL,
    supplier_item_code VARCHAR(100),
    stock_item_id UUID NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(supplier_id, supplier_item_name)
);
```

---

## 7. Kullanıcı Arayüzü ve Ekran Mimarisi (`EInvoiceManager.jsx`)

[`src/components/pages/EInvoiceManager.jsx`](file:///X:/RMSv3/src/components/pages/EInvoiceManager.jsx), portalın tüm sekmelerini ve 10 adet zenginleştirilmiş modalını barındıran reaktif arayüz bileşenidir:

### Ana Sekmeler:
1. **Gelen Kutusu (Alış Faturaları):** Entegratörden gelen e-faturaların listesi, 3-Way eşleştirme butonu, ticari yanıt butonları (Kabul/Red), toplu ZIP indirme.
2. **Giden Kutusu (Satış Faturaları):** Kesilen e-fatura ve e-arşivlerin listesi, GİB durum takibi, e-Arşiv iptal talebi oluşturma.
3. **Grup İçi (Inter-Company):** Şirketler arası transfer ve çapraz faturalaşma izleme.
4. **Fiziki İrsaliyeler (Mal Kabuller):** Mal kabul irsaliyeleri, çoklu seçim kutuları, toplu e-fatura arama ve ters eşleştirme.
5. **Belgeler (Giderler / Tahakkuklar):** Hizmet faturaları ile açık gider tahakkuklarının yönetimi.
6. **E-İrsaliyeler:** Gelen/Giden e-irsaliye listesi, sevk ve taşıyıcı detayları.
7. **E-Müstahsil:** Çiftçi makbuzları ve stopaj kesinti tablosu.
8. **E-Adisyon:** POS masa adisyonları, ETTN ve fatura bağlantıları.
9. **Entegratör Ayarları:** Uyumsoft / EDM / Mock bağlantı ve kimlik tanımları.

### 10 Temel Modal Mimarisi:
1. **Modal 1:** Fatura Resmi HTML / XSLT Önizleme Modalı
2. **Modal 2:** 3-Way Akıllı Eşleştirme & Waterfall Checklist Modalı
3. **Modal 3:** Manuel Yeni Fatura Kesme Sihirbazı
4. **Modal 4:** Eşleştirme & Fiyat Tolerans Ayarları Modalı
5. **Modal 5:** Ticari Fatura Kabul / Red Yanıtı Modalı
6. **Modal 6:** Tedarikçi Kalem Mapping Hafıza Modalı
7. **Modal 7:** Fiziki İrsaliye ➔ Gelen Fatura Ters Eşleştirme Modalı
8. **Modal 8:** Sözleşme Şartları & Birim Fiyat Tablosu Detay Modalı
9. **Modal 9:** Hizmet Faturası & Gider Tahakkuk Eşleştirme Modalı
10. **Modal 10:** E-Arşiv GİB İptal / İtiraz Talep Modalı

---

## 8. Uçtan Uca Veri Akış Şemaları

### Gelen Fatura 3-Way Waterfall Eşleştirme Akışı
```
[Entegratör API] ──► [eInvoiceService.fetchInbound] ──► [PostgreSQL: e_invoices]
                                                              │
[Mal Kabul Depo] ──► [purchase_receipts] ─────────────────────┤
                                                              ▼
                                                 [matchingEngine.evaluateWaterfallPipeline]
                                                              │
                            ┌─────────────────────────────────┴─────────────────────────────────┐
                            ▼                                                                   ▼
                [1:1 Tekil İrsaliye Eşleşti]                                      [N:1 Parçalı İrsaliye Konsolidasyonu]
                            │                                                                   │
                            └───────────────────────────────┬───────────────────────────────────┘
                                                            ▼
                                            [matchingEngine.approveMatch]
                                                            │
                                            ┌───────────────┴───────────────┐
                                            ▼                               ▼
                              [purchase_receipts.is_matched]   [e_invoices.is_matched]
                              [Cari Hesap Bakiyesi Güncellenir] [Stok Giriş Maliyeti Onaylanır]
```

---

## 9. Kurulum, Yapılandırma ve Canlıya Alma Kılavuzu

1. **PostgreSQL Migration:**
   ```bash
   psql -h <HOST> -U <USER> -d <DB> -f sql/056_einvoice_extensions.sql
   ```
2. **Backend Gateway:** `server/index.js` içerisindeki `checkSchema` otomatik olarak yeni kolon ve tabloları denetler.
3. **Frontend Build:**
   ```bash
   npm run build
   ```
4. **Entegratör Bağlantısı:** Portal açıldıktan sonra *Entegratör Ayarları* sekmesinden Uyumsoft veya EDM kullanıcı adı/şifre girilip "Bağlantıyı Sına" butonuna basılarak sistem canlıya alınır.
