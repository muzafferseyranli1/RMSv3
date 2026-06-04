const fs = require('fs');
const path = 'src/components/pages/FormSubmissions.jsx';
let content = fs.readFileSync(path, 'utf8');

// Normalize line endings to LF
const originalLineEndings = content.includes('\r\n') ? '\r\n' : '\n';
content = content.replace(/\r\n/g, '\n');

// 1. FORM_TYPE_MAP definition below STATUS_MAP
const statusMapTarget = `const STATUS_MAP = {
  draft: { label: 'Taslak', color: '#94a3b8', bg: 'rgba(148,163,184,.15)' },
  syncing: { label: 'Senkronize Ediliyor', color: '#f59e0b', bg: 'rgba(245,158,11,.15)' },
  completed: { label: 'Tamamlandı', color: '#10b981', bg: 'rgba(16,185,129,.15)' },
  anomaly: { label: 'Anomali', color: '#ef4444', bg: 'rgba(239,68,68,.15)' },
}`;
const statusMapRep = `${statusMapTarget}

const FORM_TYPE_MAP = {
  inspection: { label: 'Denetim Formu', icon: 'fa-file-shield' },
  checklist: { label: 'Checklist', icon: 'fa-list-check' },
  customer_survey: { label: 'Müşteri Anketi', icon: 'fa-comments' },
  personnel_survey: { label: 'Personel Anketi', icon: 'fa-users' },
  notification_form: { label: 'Bildirim Formu', icon: 'fa-bell' },
}`;
if (content.includes(statusMapTarget)) {
  content = content.replace(statusMapTarget, statusMapRep);
  console.log('FORM_TYPE_MAP added successfully.');
} else {
  console.error('Error: STATUS_MAP target not found.');
}

// 2. templateOptions in Yeni Form Doldur dropdown
const templateOptionsTarget = `        const templateOptions = activeTemplates.map(t => ({
          value: t.id,
          label: t.title,
          meta: t.form_type === 'checklist' ? 'Checklist' : (t.form_type === 'inspection' ? 'Denetim' : 'Müşteri Anketi'),
          icon: t.form_type === 'checklist' ? 'fa-list-check' : (t.form_type === 'inspection' ? 'fa-file-shield' : 'fa-comments'),
        }))`;
const templateOptionsRep = `        const templateOptions = activeTemplates.map(t => {
          const typeInfo = FORM_TYPE_MAP[t.form_type] || { label: 'Form', icon: 'fa-file' }
          return {
            value: t.id,
            label: t.title,
            meta: typeInfo.label,
            icon: typeInfo.icon,
          }
        })`;
if (content.includes(templateOptionsTarget)) {
  content = content.replace(templateOptionsTarget, templateOptionsRep);
  console.log('templateOptions dynamic mapping applied successfully.');
} else {
  console.error('Error: templateOptions target not found.');
}

// 3. Date field rendering input
const textInputTarget = `                        {field.type === 'text' && (`;
const textInputRep = `                        {field.type === 'date' && (
                          <input
                            type="date"
                            value={answer?.value || ''}
                            onChange={e => updateAnswer(field.id, e.target.value)}
                            className="f-input"
                            style={{ width: 150, padding: '6px 10px', fontSize: '.8rem' }}
                          />
                        )}

                        {field.type === 'text' && (`;
if (content.includes(textInputTarget)) {
  content = content.replace(textInputTarget, textInputRep);
  console.log('Date input rendering applied successfully.');
} else {
  console.error('Error: text input target not found.');
}

// 4. Section 1 Answers Display Value (Regex based)
// We look for displayValue inside the (section.fields || []).map((field, fIdx) => { ... }) loop
const section1Regex = /(\s*)let displayValue = String\(ans\.value \?\? '—'\)\n\s*if \(ans\.value === true\) displayValue = 'Evet'\n\s*if \(ans\.value === false\) displayValue = 'Hayır'/;
const match1 = content.match(section1Regex);
if (match1) {
  const indent = match1[1];
  const replacement1 = `${match1[0]}
${indent}if (field.type === 'stock_item_select' || field.type === 'sale_item_select' || field.type === 'semi_product_select' || field.type === 'branch_select') {
${indent}  if (Array.isArray(ans.value)) {
${indent}    displayValue = ans.value.map(item => item.name).join(', ') || '—'
${indent}  } else {
${indent}    displayValue = '—'
${indent}  }
${indent}}
${indent}if (field.type === 'date' && ans.value) {
${indent}  const parts = String(ans.value).split('-')
${indent}  if (parts.length === 3) {
${indent}    displayValue = \`\${parts[2]}.\${parts[1]}.\${parts[0]}\`
${indent}  }
${indent}}`;
  content = content.replace(section1Regex, replacement1);
  console.log('Section 1 displayValue formatting applied.');
} else {
  console.error('Error: Section 1 displayValue target not found.');
}

// 5. Section 2 (fallback loop) Answers Display Value (Regex based)
// We look for displayValue inside the (Array.isArray(selectedSub.answers_json) ...).map((ans, i) => { ... }) loop
const fallbackRegex = /(\s*)let displayValue = String\(ans\.value \?\? '—'\)\n\s*if \(ans\.value === true\) displayValue = 'Evet'\n\s*if \(ans\.value === false\) displayValue = 'Hayır'/;
// Since we already replaced the first occurrence (Section 1), the second occurrence will be Section 2
const match2 = content.match(new RegExp(fallbackRegex.source, 'g'));
if (match2 && match2.length >= 2) {
  // Let's find the position of the second match
  let firstIdx = content.indexOf('let displayValue = String(ans.value ?? \'—\')');
  let secondIdx = content.indexOf('let displayValue = String(ans.value ?? \'—\')', firstIdx + 1);
  
  if (secondIdx !== -1) {
    // Find the indent spaces before the second match
    let lineStart = content.lastIndexOf('\n', secondIdx) + 1;
    let indent = content.slice(lineStart, secondIdx);
    
    let targetStr = content.slice(secondIdx, content.indexOf('Hayır', secondIdx) + 5);
    let replacement2 = `const field = template?.schema_json?.sections?.flatMap(s => s.fields || [])?.find(f => f.id === ans.field_id)
${indent}${targetStr}
${indent}if (field && (field.type === 'stock_item_select' || field.type === 'sale_item_select' || field.type === 'semi_product_select' || field.type === 'branch_select')) {
${indent}  if (Array.isArray(ans.value)) {
${indent}    displayValue = ans.value.map(item => item.name).join(', ') || '—'
${indent}  } else {
${indent}    displayValue = '—'
${indent}  }
${indent}}
${indent}if (field && field.type === 'date' && ans.value) {
${indent}  const parts = String(ans.value).split('-')
${indent}  if (parts.length === 3) {
${indent}    displayValue = \`\${parts[2]}.\${parts[1]}.\${parts[0]}\`
${indent}  }
${indent}}`;
    content = content.slice(0, secondIdx) + replacement2 + content.slice(content.indexOf('Hayır', secondIdx) + 5);
    console.log('Section 2 displayValue formatting applied.');
  } else {
    console.error('Error: Section 2 displayValue match failed.');
  }
} else {
  console.error('Error: Fallback loop matches not found or not enough.');
}

// 6. Section 3 (PDF print view) Answers Display Value (Regex based)
const pdfRegex = /(\s*)let displayValue = String\(ans\.value \?\? '—'\)\n\s*if \(ans\.value === true\) displayValue = field\.type === 'checkbox' \? '☑' : 'Evet'\n\s*if \(ans\.value === false\) displayValue = field\.type === 'checkbox' \? '☐' : 'Hayır'/;
const matchPdf = content.match(pdfRegex);
if (matchPdf) {
  const indent = matchPdf[1];
  const replacementPdf = `${matchPdf[0]}
${indent}if (field.type === 'stock_item_select' || field.type === 'sale_item_select' || field.type === 'semi_product_select' || field.type === 'branch_select') {
${indent}  if (Array.isArray(ans.value)) {
${indent}    displayValue = ans.value.map(item => item.name).join(', ') || '—'
${indent}  } else {
${indent}    displayValue = '—'
${indent}  }
${indent}}
${indent}if (field.type === 'date' && ans.value) {
${indent}  const parts = String(ans.value).split('-')
${indent}  if (parts.length === 3) {
${indent}    displayValue = \`\${parts[2]}.\${parts[1]}.\${parts[0]}\`
${indent}  }
${indent}}`;
  content = content.replace(pdfRegex, replacementPdf);
  console.log('PDF print displayValue formatting applied.');
} else {
  console.error('Error: PDF print displayValue target not found.');
}

// 7. calculateFieldScore scoring logic update
const target543 = `  if (field.type === 'rating' || field.type === 'rating_10' || field.type === 'slider' || field.type === 'nps') {
    const val = Number(value) || 0
    const divisor = field.type === 'rating' ? 5 : 10
    return Math.min((val / divisor) * maxPoints, maxPoints)
  }`;
const rep543 = `  if (field.type === 'rating' || field.type === 'rating_10' || field.type === 'slider' || field.type === 'nps') {
    const val = Number(value) || 0
    const divisor = field.type === 'rating' ? 5 : 10
    return Math.min((val / divisor) * maxPoints, maxPoints)
  }
  if (field.type === 'stock_item_select' || field.type === 'sale_item_select' || field.type === 'semi_product_select' || field.type === 'branch_select') {
    return (Array.isArray(value) && value.length > 0) ? maxPoints : 0
  }`;
if (content.includes(target543)) {
  content = content.replace(target543, rep543);
  console.log('Step 543 scoring logic applied.');
} else {
  console.error('Error: Step 543 scoring logic target not found.');
}

// 8. Update preview headers and report headers
const previewHeaderTarget = `          {template?.form_type === 'checklist' ? 'Kontrol Listesi Önizleme' : 'Denetim Raporu Önizleme'}`;
const previewHeaderRep = `          {template?.form_type === 'checklist' ? 'Kontrol Listesi Önizleme' : (template?.form_type === 'notification_form' ? 'Bildirim Formu Önizleme' : (template?.form_type === 'customer_survey' || template?.form_type === 'personnel_survey' ? 'Anket Raporu Önizleme' : 'Denetim Raporu Önizleme'))}`;
if (content.includes(previewHeaderTarget)) {
  content = content.replace(previewHeaderTarget, previewHeaderRep);
  console.log('Preview header updated successfully.');
} else {
  console.error('Error: previewHeader target not found.');
}

const reportHeaderTarget = `              {isCriticalFailed ? 'KRİTİK HATA RAPORU' : (template?.form_type === 'checklist' ? 'KONTROL LİSTESİ' : 'DENETİM RAPORU')}`;
const reportHeaderRep = `              {isCriticalFailed ? 'KRİTİK HATA RAPORU' : (template?.form_type === 'checklist' ? 'KONTROL LİSTESİ' : (template?.form_type === 'notification_form' ? 'BİLDİRİM FORMU RAPORU' : (template?.form_type === 'customer_survey' || template?.form_type === 'personnel_survey' ? 'ANKET RAPORU' : 'DENETİM RAPORU')))}`;
if (content.includes(reportHeaderTarget)) {
  content = content.replace(reportHeaderTarget, reportHeaderRep);
  console.log('Report header updated successfully.');
} else {
  console.error('Error: reportHeader target not found.');
}

const qResultsHeaderTarget = `            {template?.form_type === 'checklist' ? 'KONTROL LİSTESİ SORULARI VE YANITLAR' : 'DENETİM SORULARI VE YANITLAR'}`;
const qResultsHeaderRep = `            {template?.form_type === 'checklist' ? 'KONTROL LİSTESİ SORULARI VE YANITLAR' : (template?.form_type === 'notification_form' ? 'BİLDİRİM FORMU SORULARI VE YANITLAR' : (template?.form_type === 'customer_survey' || template?.form_type === 'personnel_survey' ? 'ANKET SORULARI VE YANITLAR' : 'DENETİM SORULARI VE YANITLAR'))}`;
if (content.includes(qResultsHeaderTarget)) {
  content = content.replace(qResultsHeaderTarget, qResultsHeaderRep);
  console.log('Questionnaire results header updated successfully.');
} else {
  console.error('Error: qResultsHeader target not found.');
}

// Restore line endings
if (originalLineEndings === '\r\n') {
  content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync(path, content, 'utf8');
console.log('FormSubmissions.jsx recovery and edits completed successfully.');
