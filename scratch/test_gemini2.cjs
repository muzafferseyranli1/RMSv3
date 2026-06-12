const fs = require('fs');
const path = require('path');
require('dotenv').config();

const apiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("No API key found in .env");
  process.exit(1);
}

const supportDir = path.join(__dirname, '../Support');
let kbContent = '';
if (fs.existsSync(supportDir)) {
  const files = fs.readdirSync(supportDir);
  for (const file of files) {
    if (file.endsWith('.md')) {
      const filePath = path.join(supportDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      kbContent += `\n=== DOKÜMAN: ${file} ===\n${content}\n`;
    }
  }
}

const message = "yeni açılan bir şubeyi sisteme nasıl tanımlarım";
const clientOrigin = "http://localhost:5173";

const body = {
  contents: [{
    parts: [{ text: message }]
  }],
  systemInstruction: {
    parts: [{
      text: `Sen SuitableRMS sisteminin yapay zeka destek asistanısın.
Kullanıcıların (restoran işletmecilerinin) sorularına yanıt verirken sadece sana sağlanan bilgi bankasını (Knowledge Base) referans al.

KURALLAR (BU KURALLARA UYMAMAK SİSTEMİ ÇÖKERTİR):
1. Eğer sorunun cevabı sana sağlanan bilgi bankasında KESİNLİKLE YOKSA, [UNANSWERED] yaz ve başka bir şey söyleme.
2. DOKÜMANLARDAKİ BİLGİLERİ ASLA KISA KESME VEYA ÖZETLEME. Adım adım kılavuzları, SSS bölümlerini ve "ÖNEMLİ UYARI" gibi kısımları atlamadan, detaylıca ve birebir aktar. Yüzeysel ve kısa cevaplar vermek kesinlikle yasaktır.
3. Doküman metninin içinde sayfa yönlendirmesi için '/' ile başlayan bir URL yolu (Örn: /donem-kapanis, /satislar vb.) varsa, YANITININ EN ALTINA MUTLAKA ŞU LİNKİ EKLE:
[Sayfaya Git](${clientOrigin}/o-yol)
(Örnek: [Dönem Kapanışı Sayfasına Git](${clientOrigin}/donem-kapanis))
4. Yanıtlarını akıcı ve profesyonel Türkçe ile ver. Teknik tablo isimlerini gizle.

BİLGİ BANKASI:
${kbContent}

ÇIKTI FORMATI:
Yanıtını MUTLAKA aşağıdaki JSON formatında ver:
{
  "foundInKb": true veya false (Eğer sorunun cevabı BİLGİ BANKASINDA YOKSA kesinlikle false yap),
  "reply": "Detaylı cevabın. (Eğer foundInKb false ise bu alanı boş bırak)"
}`
    }]
  },
  generationConfig: {
    temperature: 0.1,
    maxOutputTokens: 1500,
    responseMimeType: 'application/json'
  }
};

fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body)
})
.then(res => res.json())
.then(data => {
  if (data.error) {
    console.error("API Error:", data.error);
  } else {
    const rawText = data.candidates[0].content.parts[0].text;
    console.log("RAW TEXT RETURNED BY GEMINI:\n", rawText);
  }
});
