# Soru-Cevap Portalı (Q&A) Entegrasyon Planı

Bu plan, projeden bağımsız çalışabilen, şifre korumalı ("2026"), soru ve cevap ekleme/listeleme işlevlerine sahip yeni bir genel portal sayfası eklemeyi hedefler.

## Kullanıcı İncelemesi Gereken Konular

> [!NOTE]
> **Tasarım Tercihleri:**
> - Sayfa, ana backoffice şablonundan (Sidebar ve AdminLayout) tamamen bağımsız olarak tam ekran çalışacaktır.
> - Premium bir kullanıcı deneyimi için koyu tema (gizemli slate/indigo tonları), cam morfolojisi (glassmorphism) efektleri ve yumuşak geçişli animasyonlar kullanılacaktır.
> - Şifre doğrulama durumu sekme ömrü boyunca (`sessionStorage` üzerinde) saklanacaktır, böylece kullanıcı sayfayı açık tuttuğu sürece tekrar şifre girmek zorunda kalmayacaktır.

## Önerilen Değişiklikler

---

### [Veritabanı Katmanı]

#### [MODIFY] [schema-railway-master.sql](file:///x:/RMSv3/schema-railway-master.sql)
- Dosyanın en sonuna yeni `qa_questions` ve `qa_answers` tablolarının DDL tanımları eklenecektir:
  ```sql
  CREATE TABLE IF NOT EXISTS public.qa_questions (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    author_name TEXT NOT NULL,
    question_text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT qa_questions_pkey PRIMARY KEY (id)
  );

  CREATE TABLE IF NOT EXISTS public.qa_answers (
    id UUID DEFAULT gen_random_uuid() NOT NULL,
    question_id UUID NOT NULL,
    author_name TEXT NOT NULL,
    answer_text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    CONSTRAINT qa_answers_pkey PRIMARY KEY (id),
    CONSTRAINT fk_qa_questions FOREIGN KEY (question_id) REFERENCES public.qa_questions (id) ON DELETE CASCADE
  );
  ```

---

### [Backend Sunucu Katmanı]

#### [MODIFY] [index.js](file:///x:/RMSv3/server/index.js)
- `checkSchema` fonksiyonuna, sunucu başlarken veritabanında `qa_questions` ve `qa_answers` tablolarının otomatik olarak oluşturulmasını sağlayacak DDL sorguları eklenecektir.

---

### [Frontend Uygulama Katmanı]

#### [NEW] [QuestionAnswerPortal.jsx](file:///x:/RMSv3/src/components/pages/QuestionAnswerPortal.jsx)
- Yeni bağımsız sayfa bileşeni oluşturulacaktır. Bileşen şu özellikleri barındıracaktır:
  - Giriş ekranında cam efektiyle tasarlanmış şifre formu ("2026" kontrolü).
  - Giriş yapıldıktan sonra iki sütunlu modern bir düzen:
    - **Sol Sütun:** Soru ekleme formu (İsim ve Soru içeriği zorunlu) ve mevcut soruların listesi.
    - **Sağ Sütun:** Seçilen sorunun detayları, soruya ait cevaplar ve yeni cevap ekleme formu (İsim ve Cevap içeriği zorunlu).
  - Soruları ve cevapları PostgreSQL veritabanından çekmek ve kaydetmek için `db.from('qa_questions')` ve `db.from('qa_answers')` API sorguları kullanılacaktır.

#### [MODIFY] [publicDisplayRoutes.js](file:///x:/RMSv3/src/lib/publicDisplayRoutes.js)
- `/soru-cevap` ve `/soru-cevap/` yolları `isPublicDisplayPath` fonksiyonuna dahil edilerek, bu sayfanın şube/depo bağlam seçici modalına takılmadan herkes tarafından doğrudan açılabilmesi sağlanacaktır.

#### [MODIFY] [App.jsx](file:///x:/RMSv3/src/App.jsx)
- `POS_ROUTES` dizisine `/soru-cevap` yolu eklenecektir. Bu sayede sayfa, ana backoffice Sidebar/Layout bileşenlerine sarılmadan, tamamen bağımsız (standalone) bir ekran olarak render edilecektir.
- Standart Router tanımları arasına `/soru-cevap` yolu eklenecek ve `QuestionAnswerPortal` bileşeni lazy-load edilerek buraya bağlanacaktır.

#### [MODIFY] [Sidebar.jsx](file:///x:/RMSv3/src/components/layout/Sidebar.jsx)
- "Ayarlar" menü grubunun en altına, `/soru-cevap` sayfasına yönlendirme yapacak yeni bir menü elemanı eklenecektir ("Soru-Cevap Portalı").

---

## Doğrulama Planı

### Otomatik Testler
- Frontend projesinin hatasız derlenmesi:
  `npm run build`

### Manuel Doğrulama
- Doğrudan `/soru-cevap` linkine gidildiğinde şifre ekranının geldiği ve "2026" haricinde bir şifre girildiğinde hata verdiği doğrulanacaktır.
- Doğru şifre girildiğinde Q&A portalının açıldığı, isim girmeden soru veya cevap eklenemediği doğrulanacaktır.
- Eklenen soruların sol listede göründüğü, tıklanıldığında sağda o soruya ait cevapların listelendiği ve yeni cevap yazılabildiği doğrulanacaktır.
- Ayarlar menüsünün en altında bulunan "Soru-Cevap Portalı" linkine tıklandığında sayfanın açıldığı doğrulanacaktır.
