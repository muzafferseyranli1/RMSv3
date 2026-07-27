import fs from 'fs'
import path from 'path'

const filePath = path.resolve('OperationSync.md')
const entry = `

## Entry - 2026-07-18 - Faz B: Depo ↔ Mutfak Sipariş Akışı & Senaryo 5

- \`Timestamp\`: \`2026-07-18T12:41:00+03:00\`
- \`Agent\`: Antigravity
- \`Task\`: Senaryo 5 kapsamındaki Depo'nun Merkez Mutfak'tan sipariş verebilmesi kısıtlamasının esnetilmesi
- \`Intent\`: Ana Depo'nun (\`receiver_scope: 'warehouse'\`) Merkez Mutfak (\`internal_kitchen\`) tedarikçisinden ürün (SOS vb.) sipariş edebilmesini sağlamak.
- \`Files Changed\`:
  - \`src/components/pages/OrderFlows.jsx\` (Depo akışlarında \`internal_kitchen\` tedarikçi seçimine izin verildi)
  - \`src/components/pages/Orders.jsx\` (Depo scope'unda Merkez Mutfak tedarikçisine sipariş oluşturulabilmesi sağlandı)
- \`Commands Run\`:
  - \`npm run build\` (Başarıyla tamamlandı)
- \`Findings\`:
  - Depo ↔ Mutfak ikmal siparişi bağı kuruldu. Mutfaktan depoya yapılan sevkiyatlar depodaki stokları güncellemekte ve otomatik talep planlama motoru güncel bakiyeler üzerinden öneri üretmektedir.
- \`Decisions\`:
  - Deponun mutfaktan sipariş verebilmesi kısıtlaması kaldırılmıştır.
- \`Open Risks\`: Yok.
- \`Handoff Contract\`: Faz B tamamlanmıştır ve proje hatasız derlenmektedir.
`

try {
  fs.appendFileSync(filePath, entry, 'utf8')
  console.log('Successfully appended Faz B entry to OperationSync.md')
} catch (err) {
  console.error('Failed to append entry:', err)
}
