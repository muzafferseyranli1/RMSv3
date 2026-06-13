# Task List - Railway Deploy Hatası ve Ekran Güncelleme Sorunları

- `[x]` Sipariş akışları ekranındaki silme/geri alma sonrası anlık güncelleme sorununun çözülmesi
  - `[x]` `src/components/pages/OrderFlows.jsx` içindeki `softDelete` ve `restore` fonksiyonlarının optimistic state güncellemesiyle yenilenmesi
  - `[x]` Vite derleme doğrulaması (`npm run build`)
  - `[x]` Dokümantasyon (`walkthrough.md`) ve `OperationSync.md` güncellemeleri
- `[x]` Koşullu postinstall script'inin (`scripts/postinstall.cjs`) oluşturulması
- `[x]` `package.json` dosyasındaki `"postinstall"` adımının güncellenmesi
- `[x]` Lokal ortamda `npm install` ile entegrasyonun doğrulanması
- `[x]` Git status kontrolünün yapılması ve deploy doğrulaması
- `[x]` Sipariş Akışları sayfasında "Kaydet" butonuna tıklandığında drawer'ın kapanmaması ve listenin yenilenmemesi sorununun giderilmesi
  - `[x]` `FlowForm.save` fonksiyonunda insert/update sorgularından `.single()` çağrısının kaldırılarak PGRST116/No rows found hatasının engellenmesi
  - `[x]` `onFormSaved` fonksiyonundaki UI güncelleme adımlarının `try-catch` blokları ile güvenli hale getirilerek olası hatalarda drawer'ın takılı kalmasının engellenmesi
  - `[x]` `npm run build` ile Vite derleme doğrulaması
