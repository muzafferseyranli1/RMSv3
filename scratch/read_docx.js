import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

try {
  if (!fs.existsSync('scratch/temp_docx')) {
    fs.mkdirSync('scratch/temp_docx', { recursive: true });
  }
  execSync('tar -xf "Restoran E-Dönüşüm Entegrasyon Raporu.docx" -C scratch/temp_docx');
  const xmlContent = fs.readFileSync('scratch/temp_docx/word/document.xml', 'utf8');
  
  // Extract all text inside <w:t> tags
  const textMatches = xmlContent.match(/<w:t[^>]*>([^<]+)<\/w:t>/g) || [];
  let fullText = '';
  
  // Also split by paragraphs <w:p>
  const paragraphs = xmlContent.split(/<\/w:p>/);
  for (const p of paragraphs) {
    const pMatches = p.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
    if (pMatches) {
      const line = pMatches.map(m => m.replace(/<w:t[^>]*>|<\/w:t>/g, '')).join('');
      fullText += line + '\n';
    }
  }
  
  fs.writeFileSync('scratch/docx_extracted.txt', fullText, 'utf8');
  console.log('Successfully extracted, total length:', fullText.length);
} catch (err) {
  console.error('Error:', err);
}
