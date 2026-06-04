const fs = require('fs');
const path = 'src/components/pages/FormSubmissions.jsx';
let content = fs.readFileSync(path, 'utf8');

// Replacement 1: Inside section answers loop
const target1 = `                                        let displayValue = String(ans.value ?? '—')
                                        if (ans.value === true) displayValue = 'Evet'
                                        if (ans.value === false) displayValue = 'Hayır'`;

const replacement1 = `                                        let displayValue = String(ans.value ?? '—')
                                        if (ans.value === true) displayValue = 'Evet'
                                        if (ans.value === false) displayValue = 'Hayır'
                                        if (field.type === 'stock_item_select' || field.type === 'sale_item_select' || field.type === 'semi_product_select' || field.type === 'branch_select') {
                                          if (Array.isArray(ans.value)) {
                                            displayValue = ans.value.map(item => item.name).join(', ') || '—'
                                          } else {
                                            displayValue = '—'
                                          }
                                        }`;

// Replacement 2: Inside fallback answers loop
const target2 = `                                let displayValue = String(ans.value ?? '—')
                                if (ans.value === true) displayValue = 'Evet'
                                if (ans.value === false) displayValue = 'Hayır'`;

const replacement2 = `                                let displayValue = String(ans.value ?? '—')
                                if (ans.value === true) displayValue = 'Evet'
                                if (ans.value === false) displayValue = 'Hayır'
                                if (field && (field.type === 'stock_item_select' || field.type === 'sale_item_select' || field.type === 'semi_product_select' || field.type === 'branch_select')) {
                                  if (Array.isArray(ans.value)) {
                                    displayValue = ans.value.map(item => item.name).join(', ') || '—'
                                  } else {
                                    displayValue = '—'
                                  }
                                }`;

// Replacement 3: Inside PDF print view
const target3 = `                      let displayValue = String(ans.value ?? '—')
                      if (ans.value === true) displayValue = field.type === 'checkbox' ? '☑' : 'Evet'
                      if (ans.value === false) displayValue = field.type === 'checkbox' ? '☐' : 'Hayır'`;

const replacement3 = `                      let displayValue = String(ans.value ?? '—')
                      if (ans.value === true) displayValue = field.type === 'checkbox' ? '☑' : 'Evet'
                      if (ans.value === false) displayValue = field.type === 'checkbox' ? '☐' : 'Hayır'
                      if (field.type === 'stock_item_select' || field.type === 'sale_item_select' || field.type === 'semi_product_select' || field.type === 'branch_select') {
                        if (Array.isArray(ans.value)) {
                          displayValue = ans.value.map(item => item.name).join(', ') || '—'
                        } else {
                          displayValue = '—'
                        }
                      }`;

// Replace occurrences
if (content.includes(target1.replace(/\r\n/g, '\n'))) {
  content = content.replace(target1.replace(/\r\n/g, '\n'), replacement1);
} else if (content.includes(target1)) {
  content = content.replace(target1, replacement1);
} else {
  console.error("Warning: target1 not found");
}

if (content.includes(target2.replace(/\r\n/g, '\n'))) {
  content = content.replace(target2.replace(/\r\n/g, '\n'), replacement2);
} else if (content.includes(target2)) {
  content = content.replace(target2, replacement2);
} else {
  console.error("Warning: target2 not found");
}

if (content.includes(target3.replace(/\r\n/g, '\n'))) {
  content = content.replace(target3.replace(/\r\n/g, '\n'), replacement3);
} else if (content.includes(target3)) {
  content = content.replace(target3, replacement3);
} else {
  console.error("Warning: target3 not found");
}

fs.writeFileSync(path, content, 'utf8');
console.log("FormSubmissions.jsx replacements successfully completed");
