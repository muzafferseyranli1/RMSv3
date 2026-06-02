# SuitableRMS — Yapay Zeka Hafıza Senkronizasyon Talimatı (`docs.md`)

Bu dosya, projenin hangi bilgisayarda veya hangi kullanıcı hesabı altında çalıştığından bağımsız olarak, bu projede görev alan tüm yapay zeka asistanları (agent) için **kesin bir senkronizasyon talimatıdır**.

---

## 1. SENKRONİZASYON TALİMATLARI (ZORUNLU ADIMLAR)

Yapay zeka asistanı, her görevin sonunda veya turn'ünü (turunu) bitirip teslim etmeden önce aşağıdaki adımları sırasıyla uygulamakla **yükümlüdür**:

### Adım 1: Dinamik Konum Tespiti
- Asistan, aktif çalıştığı ortamdaki **Conversation ID** (Sohbet Kimliği) bilgisini ve yerel sistemdeki Gemini uygulama verileri (`appDataDir` veya `.gemini/antigravity/brain/<sohbet-id>`) yolunu dinamik olarak tespit etmelidir. Kesinlikle statik kullanıcı yolları (örrn: `C:\Users\muzaf\...`) kodlanmayacaktır.

### Adım 2: Belgelerin `./docs/` Klasörüne Kopyalanması
- Asistan, kendi ortak hafıza klasöründe (brain dizininde) oluşturduğu veya güncellediği aşağıdaki dosyaları, projenin Git ile takip edilen kök dizinindeki `./docs/` klasörüne kopyalamalıdır:
  1. `implementation_plan.md` $\rightarrow$ `./docs/implementation_plan.md`
  2. `task.md` $\rightarrow$ `./docs/task.md`
  3. `walkthrough.md` $\rightarrow$ `./docs/walkthrough.md`
- Eğer hedef dosyalar zaten varsa, üzerine yazılmalı ve güncel sürüm proje dizinine yansıtılmalıdır.

### Adım 3: `OperationSync.md` Güncellemesi
- Asistan, bu oturumda yaptığı tüm değişiklikleri ve güncellemeleri projenin kök dizinindeki `OperationSync.md` dosyasının sonuna yeni bir `## Entry` (örneğin `## Entry 139`) olarak eklemelidir.
- eğer android mobil uygulaması geliştirdiysen yıkarıdaklere ek olarak uygulama klasöründek Handout.md dosyasını güncelle

### Adım 4: Git Takip Doğrulaması
- Asistan, yukarıdaki kopyalama ve güncellemeleri yaptıktan sonra projenin ana dizininde `git status` komutunu çalıştırarak:
  - `./docs/` altındaki dosyaların,
  - `docs.md` dosyasının,
  - `OperationSync.md` dosyasının,
  Git takibinde (`modified` veya `untracked` durumunda) olduğunu gözle doğrulamalıdır.

---

## 2. UYGUNLUK VE DENETİM
Bu kurallara uyulmaması, yapay zekanın sonraki oturumlarda (veya başka bilgisayarlarda) hafıza kaybı yaşamasına sebep olacağından, talimatların eksiksiz yerine getirilmesi sistem başarısı için kritiktir.
