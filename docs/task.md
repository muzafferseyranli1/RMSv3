# Görev Listesi - Geri Bildirim Sisteminin Form ve Görev Yönetimine Dönüştürülmesi

- `[x]` 1. App.jsx Rota ve İçe Aktarma Değişiklikleri
  - `[x]` TicketBoard ve TicketDetail lazy import tanımlarının kaldırılması.
  - `[x]` `/geribildirimler`, `/sube-geribildirimler` ve `/merkez-geribildirimler` rotalarının Navigate ile sırasıyla `/gorev-yoneticisi`, `/sube-tasks` ve `/merkez-tasks` sayfalarına yönlendirilmesi.
- `[x]` 2. Sidebar.jsx Sol Menü Değişiklikleri
  - `[x]` Genel Merkez (center) scope'undaki "Geribildirimler" menü satırının silinmesi ve yerine "Geri Bildirim Girişi" menüsünün eklenmesi.
  - `[x]` Şube ve Merkez Depo bölümlerindeki "Geribildirimler" menü satırlarının tamamen kaldırılması.
- `[x]` 3. NotificationBell.jsx Bildirim Navigasyonu Değişiklikleri
  - `[x]` `getNavigationUrl` içindeki `ticket` navigasyon yönlendirmesinin `/tasks` sayfalarına yönlendirilmesi.
- `[x]` 4. FormSubmissions.jsx Şablon Filtreleme Değişikliği
  - `[x]` URL'deki `type` parametresinin (örn: `?type=notification_form`) okunup `activeTemplates` seçim listesinin filtrelenmesi.
- `[x]` 5. Projenin Derlenmesi ve Doğrulanması
  - `[x]` Projeyi `npm run build` ile derleyerek herhangi bir derleme hatası olmadığını doğrulama.
- `[x]` 6. Git Takip ve Dokümantasyon Güncellemesi
  - `[x]` Değişikliklerin Git'e stage edilmesi.
  - `[x]` `OperationSync.md` dosyasına Entry 052 eklenmesi.
  - `[x]` `walkthrough.md` dosyasının güncellenmesi.

## Yeni İstek: Çağrı Merkezi Geri Bildirim Girişi Modalı

- `[x]` 7. Sol Menü (Sidebar) Temizliği
  - `[x]` Sidebar.jsx içindeki "Geri Bildirim Girişi" satırının tamamen kaldırılması.
- `[x]` 8. Çağrı Merkezi Modalı ve Arayüz Entegrasyonu (CallCenter.jsx)
  - `[x]` Kütüphane içe aktarımlarının (`useRef`, `uploadApiFile`, `fetchFormTemplates`, `submitFormResponse`) eklenmesi.
  - `[x]` Geri bildirim modalı için durum (state) tanımlarının eklenmesi.
  - `[x]` `loadBase` fonksiyonuna `form_templates` şablon yüklemesinin eklenmesi.
  - `[x]` `SearchableMultiSelect` ve diğer dinamik alan yardımcılarının tanımlanması.
  - `[x]` `handleOpenFeedbackModal` ve form gönderim/fotoğraf yükleme işleyicilerinin eklenmesi.
  - `[x]` Eski bilet oluşturma butonu tetikleyicilerinin yeni modal işleyicisiyle değiştirilmesi.
  - `[x]` Eski modal JSX kodunun kaldırılarak yeni dinamik form modalının yerleştirilmesi.
- `[x]` 9. Derleme ve Doğrulama
  - `[x]` `npm run build` ile projeyi derleyerek derleme hatası olmadığını doğrulama.
