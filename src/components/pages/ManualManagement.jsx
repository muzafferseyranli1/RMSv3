import React, { useEffect, useState } from 'react'
import { useToast } from '@/hooks/useToast'
import { db, buildApiUrl, resolveImageUrl } from '@/lib/db'

const SYSTEM_CATEGORIES = [
  { name: 'Ürünler', display_order: 11, description: 'Satış malları prosedürleri belirlenir' },
  { name: 'Hammaddeler', display_order: 12, description: 'Ürün ve yarı mamullerin hazırlanmasında kullanılan hammaddelerdir.' },
  { name: 'Ekipmanlar', display_order: 13, description: 'Ürünlerin hazırlanmasında, saklanmasında kullanılan tüm ekipmanlar' },
  { name: 'Operasyon', display_order: 14, description: 'Vardiya yönetimi, açılış kapanış kuralları, hijyen standartları' },
  { name: 'Hizmet Standartları', display_order: 15, description: '-' }
]
const SYSTEM_CATEGORY_NAMES = SYSTEM_CATEGORIES.map(c => c.name)

function getSpecTheme(label) {
  const l = (label || '').toLowerCase();
  if (l.includes('hazır') || l.includes('prep') || l.includes('süre')) {
    return {
      icon: 'fa-clock fa-spin',
      iconStyle: { color: '#f97316', animationDuration: '8s' },
      bgTop: '#fff7ed',
      bgBottom: '#ffffff',
      border: 'rgba(249, 115, 22, 0.15)',
      valColor: '#ea580c'
    };
  }
  if (l.includes('çöz') || l.includes('thaw')) {
    return {
      icon: 'fa-snowflake fa-spin',
      iconStyle: { color: '#38bdf8', animationDuration: '10s' },
      bgTop: '#f0f9ff',
      bgBottom: '#ffffff',
      border: 'rgba(56, 189, 248, 0.15)',
      valColor: '#0284c7'
    };
  }
  if (l.includes('ılık') || l.includes('ılın') || l.includes('soğu') || l.includes('cool')) {
    return {
      icon: 'fa-temperature-arrow-down fa-bounce',
      iconStyle: { color: '#10b981' },
      bgTop: '#f0fdf4',
      bgBottom: '#ffffff',
      border: 'rgba(16, 185, 129, 0.15)',
      valColor: '#16a34a'
    };
  }
  if (l.includes('ağırlık') || l.includes('porsiyon') || l.includes('gram') || l.includes('gr') || l.includes('weight') || l.includes('boyut')) {
    return {
      icon: 'fa-scale-balanced fa-beat',
      iconStyle: { color: '#eab308' },
      bgTop: '#fefce8',
      bgBottom: '#ffffff',
      border: 'rgba(234, 179, 8, 0.15)',
      valColor: '#ca8a04'
    };
  }
  if (l.includes('raf') || l.includes('ömür') || l.includes('shelf')) {
    return {
      icon: 'fa-hourglass-half fa-flip',
      iconStyle: { color: '#ec4899', animationDuration: '3s' },
      bgTop: '#fdf2f8',
      bgBottom: '#ffffff',
      border: 'rgba(236, 72, 153, 0.15)',
      valColor: '#db2777'
    };
  }
  if (l.includes('piş') || l.includes('fırın') || l.includes('ızgara') || l.includes('cook')) {
    return {
      icon: 'fa-fire-burner fa-fade',
      iconStyle: { color: '#ef4444' },
      bgTop: '#fef2f2',
      bgBottom: '#ffffff',
      border: 'rgba(239, 68, 68, 0.15)',
      valColor: '#dc2626'
    };
  }
  // Default fallback
  return {
    icon: 'fa-circle-info fa-beat',
    iconStyle: { color: '#6366f1' },
    bgTop: '#f5f3ff',
    bgBottom: '#ffffff',
    border: 'rgba(99, 102, 241, 0.15)',
    valColor: '#4f46e5'
  };
}

function renderFormattedDescription(text) {
  if (!text) return null;
  const lines = text.split('\n');
  
  let currentListType = null; // 'ul', 'ol', or null
  const elements = [];
  let listItems = [];
  
  const flushList = (key) => {
    if (listItems.length > 0) {
      if (currentListType === 'ul') {
        elements.push(
          <ul key={key} style={{ margin: '8px 0 8px 24px', paddingLeft: 0, listStyleType: 'disc', textAlign: 'left' }}>
            {listItems.map((item, idx) => (
              <li key={idx} style={{ marginBottom: '4px', lineHeight: '1.5', fontSize: 'inherit' }}>{item}</li>
            ))}
          </ul>
        );
      } else if (currentListType === 'ol') {
        elements.push(
          <ol key={key} style={{ margin: '8px 0 8px 24px', paddingLeft: 0, listStyleType: 'decimal', textAlign: 'left' }}>
            {listItems.map((item, idx) => (
              <li key={idx} style={{ marginBottom: '4px', lineHeight: '1.5', fontSize: 'inherit' }}>{item}</li>
            ))}
          </ol>
        );
      }
      listItems = [];
      currentListType = null;
    }
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const bulletMatch = line.match(/^\s*([-\*•])\s+(.*)$/);
    const numberMatch = line.match(/^\s*(\d+)[\.\)]\s+(.*)$/);

    if (bulletMatch) {
      if (currentListType !== 'ul') {
        flushList(`list-before-${index}`);
        currentListType = 'ul';
      }
      listItems.push(bulletMatch[2]);
    } else if (numberMatch) {
      if (currentListType !== 'ol') {
        flushList(`list-before-${index}`);
        currentListType = 'ol';
      }
      listItems.push(numberMatch[2]);
    } else {
      flushList(`list-before-${index}`);
      if (trimmed === '') {
        elements.push(<div key={index} style={{ height: '8px' }} />);
      } else {
        elements.push(
          <p key={index} style={{ margin: '6px 0', lineHeight: '1.6', fontSize: 'inherit', textAlign: 'inherit' }}>
            {line}
          </p>
        );
      }
    }
  });
  
  flushList('list-final');
  return <div className="mr-formatted-desc" style={{ display: 'inline-block', width: '100%', textAlign: 'inherit' }}>{elements}</div>;
}

function parseStepText(description, idx) {
  if (!description) return { stepNumber: idx + 1, title: '', body: '' };
  
  const match = description.match(/^(Adım\s+\d+[:.-]?\s*[^.\n]+)(.*)$/i) ||
                description.match(/^([^.\n]+)(.*)$/);
                 
  if (match) {
    let title = match[1].trim();
    let body = match[2].trim();
    
    title = title.replace(/\s+/g, ' ');
    
    if (body.length < 5) {
      const cleanTitleMatch = description.match(/^Adım\s+\d+[:.-]?\s*(.*)$/i);
      const cleanTitle = cleanTitleMatch ? cleanTitleMatch[1].trim() : description;
      return {
        stepNumber: idx + 1,
        title: cleanTitle || '',
        body: description
      };
    }
    
    const cleanTitleMatch = title.match(/^Adım\s+\d+[:.-]?\s*(.*)$/i);
    const cleanTitle = cleanTitleMatch ? cleanTitleMatch[1].trim() : title;
    
    body = body.replace(/^[.:\-\s]+/, '').trim();
    
    return { stepNumber: idx + 1, title: cleanTitle || title, body };
  }
  
  return {
    stepNumber: idx + 1,
    title: '',
    body: description
  };
}

function renderChannelsTooltipInline(r, globalChannels) {
  const rowChannels = r.channels || [];
  const allChannels = globalChannels || [];
  
  const quantityText = `${r.qty} ${r.unit}`;
  
  if (allChannels.length === 0) {
    return <span>{quantityText}</span>;
  }

  const isActiveAll = rowChannels.length === 0 || rowChannels.length === allChannels.length;

  const getChannelIcon = (c) => {
    if (c.icon) return c.icon;
    const nameLower = (c.name || '').toLowerCase();
    if (nameLower.includes('hızlı') || nameLower.includes('pos')) return 'fa-solid fa-bolt';
    if (nameLower.includes('gel al') || nameLower.includes('paket')) return 'fa-solid fa-bag-shopping';
    if (nameLower.includes('masa')) return 'fa-solid fa-chair';
    if (nameLower.includes('qr')) return 'fa-solid fa-qrcode';
    if (nameLower.includes('kiosk')) return 'fa-solid fa-desktop';
    if (nameLower.includes('yemeksepeti') || nameLower.includes('yemek sepeti')) return 'fa-solid fa-basket-shopping';
    if (nameLower.includes('getir')) return 'fa-solid fa-motorcycle';
    if (nameLower.includes('trendyol')) return 'fa-solid fa-shop';
    if (nameLower.includes('çağrı') || nameLower.includes('call')) return 'fa-solid fa-phone';
    return 'fa-solid fa-circle-nodes';
  };

  return (
    <div className="mr-channel-tooltip-container" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
      <span>
        {quantityText}
      </span>
      <div className="mr-channel-tooltip-content" style={{ textAlign: 'left', fontWeight: 'normal' }}>
        <div className="mr-channel-tooltip-arrow-border" />
        <div className="mr-channel-tooltip-arrow" />
        <div className="mr-channel-tooltip-title">
          {isActiveAll ? 'Tüm Kanallar' : 'Geçerli Kanallar'}
        </div>
        <ul className="mr-channel-list">
          {allChannels.map(c => {
            const isActive = isActiveAll || rowChannels.includes(c.id);
            if (!isActive) return null;
            return (
              <li key={c.id} className="mr-channel-item">
                <i className={getChannelIcon(c)} style={{ color: isActiveAll ? '#10b981' : '#6366f1', width: '14px', textAlign: 'center' }} />
                <span>{c.name}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

const DEFAULT_METADATA_HAMMADDELER = {
  erp_code: '',
  approved_suppliers: '',
  subcategory: '',
  ideal_product_photo: '',
  dimensions: '',
  weight: '',
  slicing_standard: '',
  texture: '',
  // Bölüm 2: Sipariş ve Lojistik Dinamikleri
  order_unit: '',
  min_order_qty: '',
  delivery_lead_time: '',
  critical_stock_level: '',
  max_stack_qty: '',
  storage_location: '',
  // Bölüm 3+: Lojistik Kabul
  delivery_temp: '',
  packaging_qty: '',
  box_condition: '',
  storage_area: '',
  primary_shelf_life: '',
  thawing_procedure: '',
  secondary_shelf_life: '',
  toast_temp: '',
  toast_time: '',
  caramelization_target: '',
  rejection_logistics: '',
  rejection_cutting: '',
  rejection_cold_chain: '',
  rejection_visual: '',
  visual_comparisons: [],
  custom_parameters: [],
  shelf_lives: [],
  steps: [
    {
      description: 'bu stok malı kullanım için herhangi bir ön hazırlığa gerek yoktur doğrudan kullanılabilir.',
      imageUrl: '__default_check__'
    }
  ]
};

export default function ManualManagement() {
  const toast = useToast()

  const handleInsertFormat = (id, format, setter) => {
    const el = document.getElementById(id);
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = el.value;
    const before = text.substring(0, start);
    const after  = text.substring(end, text.length);
    const prefix = (start === 0 || text.charAt(start - 1) === '\n') ? '' : '\n';
    const textToInsert = prefix + format;
    const newValue = before + textToInsert + after;
    
    setter(newValue);
    
    setTimeout(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + textToInsert.length;
    }, 0);
  };
  
  // States
  const [activeTab, setActiveTab] = useState('categories') // UUID of category or 'categories' for management
  const [categories, setCategories] = useState([])
  const [pages, setPages] = useState([])
  const [equipments, setEquipments] = useState([])
  const [systemItems, setSystemItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [eqSearch, setEqSearch] = useState('')

  // Category Form State
  const [editingCategory, setEditingCategory] = useState(null) // null or { id, name, description, display_order }
  const [categoryForm, setCategoryForm] = useState({ name: '', description: '', display_order: 0 })

  // Page Form State
  const [editingPage, setEditingPage] = useState(null) // null or {...}
  const [recipeContext, setRecipeContext] = useState([])
  const [recipeMeta, setRecipeMeta] = useState({ portionNames: { '__standart__': 'Standart' }, allChannels: [] })
  const [showOpsDetails, setShowOpsDetails] = useState(false)
  const [pageForm, setPageForm] = useState({
    category_id: '',
    title: '',
    content: '',
    last_updated_by_pin: '',
    equipment_ids: [],
    linked_item_id: '',
    linked_item_type: '',
    is_draft: false,
    metadata: { product_image: '', description: '', steps: [] }
  })

  // ── Akıllı Kırpma + Boyut Sınırlama ─────────────────────────
  // Hedef en-boy oranına göre resmi canvas'ta kırpar ve sıkıştırır.
  // Odak noktası: resmin yoğun (parlak) piksel bölgesini bulur.
  const cropAndResizeImage = (file, targetAspect = 16 / 9, maxWidth = 1200) => {
    return new Promise((resolve, reject) => {
      const img = new Image()
      const reader = new FileReader()
      reader.onload = (ev) => {
        img.onload = () => {
          const srcW = img.naturalWidth
          const srcH = img.naturalHeight
          const srcAspect = srcW / srcH

          // Kırpma alanı hesapla
          let cropW, cropH, cropX, cropY
          if (srcAspect > targetAspect) {
            // Kaynak daha geniş → yatay kırp
            cropH = srcH
            cropW = Math.round(srcH * targetAspect)
            // Yatay odak: piksel yoğunluğu merkezine kaydır
            const offscreen = document.createElement('canvas')
            offscreen.width = srcW; offscreen.height = 1
            const ctx2 = offscreen.getContext('2d')
            ctx2.drawImage(img, 0, 0, srcW, srcH, 0, 0, srcW, 1)
            const data2 = ctx2.getImageData(0, 0, srcW, 1).data
            let totalBrightness = 0, weightedX = 0
            for (let x = 0; x < srcW; x++) {
              const brightness = data2[x * 4] * 0.299 + data2[x * 4 + 1] * 0.587 + data2[x * 4 + 2] * 0.114
              totalBrightness += brightness
              weightedX += brightness * x
            }
            const focusX = totalBrightness > 0 ? weightedX / totalBrightness : srcW / 2
            cropX = Math.max(0, Math.min(srcW - cropW, Math.round(focusX - cropW / 2)))
            cropY = 0
          } else {
            // Kaynak daha dar → dikey kırp
            cropW = srcW
            cropH = Math.round(srcW / targetAspect)
            // Dikey odak: piksel yoğunluğu merkezine kaydır
            const offscreen = document.createElement('canvas')
            offscreen.width = 1; offscreen.height = srcH
            const ctx2 = offscreen.getContext('2d')
            ctx2.drawImage(img, 0, 0, srcW, srcH, 0, 0, 1, srcH)
            const data2 = ctx2.getImageData(0, 0, 1, srcH).data
            let totalBrightness = 0, weightedY = 0
            for (let y = 0; y < srcH; y++) {
              const brightness = data2[y * 4] * 0.299 + data2[y * 4 + 1] * 0.587 + data2[y * 4 + 2] * 0.114
              totalBrightness += brightness
              weightedY += brightness * y
            }
            const focusY = totalBrightness > 0 ? weightedY / totalBrightness : srcH / 2
            cropX = 0
            cropY = Math.max(0, Math.min(srcH - cropH, Math.round(focusY - cropH / 2)))
          }

          // Hedef canvas boyutu
          const outW = Math.min(maxWidth, cropW)
          const outH = Math.round(outW / targetAspect)

          const canvas = document.createElement('canvas')
          canvas.width = outW; canvas.height = outH
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, outW, outH)

          canvas.toBlob((blob) => {
            if (!blob) return reject(new Error('Canvas kırpma başarısız'))
            resolve(blob)
          }, 'image/jpeg', 0.88)
        }
        img.onerror = reject
        img.src = ev.target.result
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  const uploadImage = async (file, aspectRatio = 16 / 9) => {
    const croppedBlob = await cropAndResizeImage(file, aspectRatio)
    const formData = new FormData()
    formData.append('file', croppedBlob, file.name.replace(/\.[^.]+$/, '.jpg'))
    const res = await fetch(buildApiUrl('/api/upload'), { method: 'POST', body: formData })
    const data = await res.json()
    if (data.error) throw new Error(data.error.message)
    return data.data.file_url
  }

  // Load Initial Data
  const loadData = async () => {
    setLoading(true)
    try {
      const [catsRes, pagesRes, equipsRes, saleRes, semiRes, stockRes] = await Promise.all([
        fetch(buildApiUrl('/api/manual/categories')).then(r => r.json()),
        fetch(buildApiUrl('/api/manual/pages')).then(r => r.json()),
        fetch(buildApiUrl('/api/manual/equipments')).then(r => r.json()),
        db.from('sale_items').select('id,name').is('deleted_at', null).order('name'),
        db.from('semi_items').select('id,name').is('deleted_at', null).order('name'),
        db.from('stock_items').select('id,name').is('deleted_at', null).order('name')
      ])

      if (catsRes.error) throw new Error(catsRes.error.message)
      if (pagesRes.error) throw new Error(pagesRes.error.message)
      if (equipsRes.error) throw new Error(equipsRes.error.message)

      if (equipsRes.error) throw new Error(equipsRes.error.message)

      let fetchedCats = catsRes.data || []
      let needsReload = false
      for (const sysCat of SYSTEM_CATEGORIES) {
        const existing = fetchedCats.find(c => c.name === sysCat.name)
        if (!existing) {
          await fetch(buildApiUrl('/api/manual/categories'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sysCat)
          })
          needsReload = true
        } else if (existing.display_order !== sysCat.display_order) {
          await fetch(buildApiUrl(`/api/manual/categories/${existing.id}`), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...existing, display_order: sysCat.display_order })
          })
          needsReload = true
        }
      }

      if (needsReload) {
        const reCatsRes = await fetch(buildApiUrl('/api/manual/categories')).then(r => r.json())
        fetchedCats = reCatsRes.data || []
      }

      setCategories(fetchedCats.sort((a,b) => a.display_order - b.display_order))
      setPages(pagesRes.data || [])
      setEquipments(equipsRes.data || [])
      
      const sysItems = [
        ...(saleRes?.data || []).map(i => ({ id: i.id, name: i.name, type: 'sale_item', typeName: 'Ürün' })),
        ...(semiRes?.data || []).map(i => ({ id: i.id, name: i.name, type: 'semi_product', typeName: 'Yarı Mamul' })),
        ...(stockRes?.data || []).map(i => ({ id: i.id, name: i.name, type: 'stock_item', typeName: 'Hammadde' }))
      ]
      setSystemItems(sysItems.sort((a,b) => a.name.localeCompare(b.name)))
    } catch (err) {
      console.error('Veriler yüklenemedi:', err)
      toast('Veriler yüklenirken hata oluştu: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // CATEGORY OPERATIONS
  const handleSaveCategory = async (e) => {
    e.preventDefault()
    if (!categoryForm.name.trim()) {
      return toast('Kategori adı zorunludur', 'warning')
    }

    try {
      const method = editingCategory ? 'PUT' : 'POST'
      const url = editingCategory ? buildApiUrl(`/api/manual/categories/${editingCategory.id}`) : buildApiUrl('/api/manual/categories')
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(categoryForm)
      })
      const result = await response.json()

      if (result.error) throw new Error(result.error.message)

      toast(editingCategory ? 'Kategori güncellendi' : 'Kategori oluşturuldu', 'success')
      setCategoryForm({ name: '', description: '', display_order: 0 })
      setEditingCategory(null)
      loadData()
    } catch (err) {
      toast('Kategori kaydedilemedi: ' + err.message, 'error')
    }
  }

  const handleEditCategory = (cat) => {
    setEditingCategory(cat)
    setCategoryForm({
      name: cat.name || '',
      description: cat.description || '',
      display_order: cat.display_order || 0
    })
  }

  const handleDeleteCategory = async (id, name) => {
    if (SYSTEM_CATEGORY_NAMES.includes(name)) {
      return toast('Bu bir sistem kategorisidir, silinemez!', 'error')
    }
    if (!window.confirm('Bu kategoriyi silmek istediğinize emin misiniz? Altındaki tüm sayfalar da silinecektir.')) return

    try {
      const response = await fetch(buildApiUrl(`/api/manual/categories/${id}`), {
        method: 'DELETE'
      })
      const result = await response.json()

      if (result.error) throw new Error(result.error.message)

      toast('Kategori başarıyla silindi', 'success')
      loadData()
    } catch (err) {
      toast('Kategori silinemedi: ' + err.message, 'error')
    }
  }

  // PAGE OPERATIONS
  const handleSavePage = async (e) => {
    e.preventDefault()
    if (activeTab === 'categories') return toast('Kategori sekmesinde olmalısınız', 'warning')
    if (!pageForm.title.trim()) return toast('Sayfa başlığı zorunludur', 'warning')
    if (!pageForm.last_updated_by_pin.trim()) return toast('PIN kodu zorunludur', 'warning')

    const activeCategory = categories.find(c => c.id === (pageForm.category_id || activeTab));
    const activeCategoryName = activeCategory?.name || '';
    const isUrunler = activeCategoryName.toLowerCase().includes('ürün') || activeCategoryName.toLowerCase().includes('urun');
    const isHammaddeler = activeCategoryName.toLowerCase().includes('hammad');
    let finalContent = pageForm.content;

    if (isUrunler) {
      if (!pageForm.linked_item_id) return toast('Lütfen bir ürün seçiniz.', 'warning')
      const { product_image, steps } = pageForm.metadata || { steps: [] };
      let md = '';
      if (product_image) md += `![Ürün Görseli](${product_image})\n\n`;
      const validSteps = steps.filter(s => s.description?.trim() || s.imageUrl);
      if (validSteps.length > 0) {
        md += `## Ürün hazırlığı ${validSteps.length > 1 ? 'Adımları' : 'prosedürleri'}\n\n`;
        validSteps.forEach((step, idx) => {
          md += `**${idx + 1}. Adım:**\n${step.description || ''}\n`;
          if (step.imageUrl) md += `\n![Adım ${idx + 1} Görseli](${step.imageUrl})\n`;
          md += `\n---\n`;
        });
      }

      const comps = pageForm.metadata?.visual_comparisons || [];
      const validComps = comps.filter(c => c.correct_image || c.wrong_image);
      if (validComps.length > 0) {
        md += `## Görsel Karşılaştırma Rehberleri\n\n`;
        validComps.forEach(comp => {
          if (comp.title) md += `### ${comp.title}\n`;
          if (comp.description) md += `${comp.description}\n\n`;
          if (comp.correct_image) md += `* **DOĞRU:** ![Doğru](${comp.correct_image})\n`;
          if (comp.wrong_image) md += `* **YANLIŞ:** ![Yanlış](${comp.wrong_image})\n`;
          md += `\n`;
        });
      }

      finalContent = md;
    } else if (isHammaddeler) {
      if (!pageForm.linked_item_id) return toast('Lütfen bir hammadde seçiniz. Hammaddeler kategorisi için bu alan zorunludur.', 'warning')
      const meta = pageForm.metadata || {};
      let md = '';
      
      md += `## 1. Kimlik ve Sistem Bilgileri\n`;
      md += `* **Sistem/ERP Kodu:** ${meta.erp_code || '-'}\n`;
      md += `* **Onaylı Tedarikçi(ler):** ${meta.approved_suppliers || '-'}\n`;
      md += `* **Kategori:** ${meta.subcategory || '-'}\n\n`;

      md += `## 2. Sipariş ve Lojistik Dinamikleri\n`;
      md += `* **Sipariş Birimi:** ${meta.order_unit || '-'}\n`;
      md += `* **Minimum Sipariş Miktarı:** ${meta.min_order_qty || '-'}\n`;
      md += `* **Teslimat / Tedarik Süresi:** ${meta.delivery_lead_time || '-'}\n`;
      md += `* **Kritik Stok Seviyesi:** ${meta.critical_stock_level || '-'}\n`;
      md += `* **Maksimum İstifleme:** ${meta.max_stack_qty || '-'}\n`;
      md += `* **Depolama Lokasyonu:** ${meta.storage_location || '-'}\n\n`;

      md += `## 3. Fiziksel ve Görsel Spesifikasyonlar\n`;
      if (meta.ideal_product_photo) {
        md += `![İdeal Ürün Fotoğrafı](${meta.ideal_product_photo})\n\n`;
      }
      md += `* **Çap ve Yükseklik:** ${meta.dimensions || '-'}\n`;
      md += `* **Gramaj:** ${meta.weight || '-'}\n`;
      md += `* **Tat - Koku:** ${meta.slicing_standard || '-'}\n`;
      md += `* **Doku/Görünüm:** ${meta.texture || '-'}\n\n`;

      md += `## 4. Lojistik Kabul Kriterleri\n`;
      md += `* **Sevkiyat Sıcaklığı:** ${meta.delivery_temp || '-'}\n`;
      md += `* **Ambalajlama Miktarı/Düzeni:** ${meta.packaging_qty || '-'}\n`;
      md += `* **Kutu Kondisyonu:** ${meta.box_condition || '-'}\n\n`;

      md += `## 5. Depolama ve Raf Ömrü\n`;
      const shelfLives = meta.shelf_lives || [];
      if (shelfLives.length > 0) {
        md += `| Durum | Saklama Alanı | Raf Ömrü |\n`;
        md += `| :--- | :--- | :--- |\n`;
        shelfLives.forEach(item => {
          md += `| ${item.status || '-'} | ${item.storage_area || '-'} | ${item.duration || '-'} |\n`;
        });
        md += `\n`;
      } else {
        md += `* **Birincil Raf Ömrü:** ${meta.primary_shelf_life || '-'}\n`;
        md += `* **İkincil Raf Ömrü:** ${meta.secondary_shelf_life || '-'}\n\n`;
      }

      md += `## 6. Kullanıma Hazırlık\n\n`;
      const hammadSteps = meta.steps || [];
      const validHammadSteps = hammadSteps.filter(s => s.description?.trim() || s.imageUrl);
      if (validHammadSteps.length > 0) {
        validHammadSteps.forEach((step, idx) => {
          md += `**${idx + 1}. Adım:**\n${step.description || ''}\n`;
          if (step.imageUrl) md += `\n![Adım ${idx + 1} Görseli](${step.imageUrl})\n`;
          md += `\n---\n`;
        });
      }

      if (meta.custom_parameters && meta.custom_parameters.length > 0) {
        md += `## Ek Depolama ve İstifleme Kuralları\n`;
        meta.custom_parameters.forEach(param => {
          if (param.label && param.value) {
            md += `* **${param.label}:** ${param.value}\n`;
          }
        });
        md += `\n`;
      }

      md += `## 7. Kusur Tanımları ve Red Kriterleri\n`;
      md += `* **Lojistik Kaynaklı Kusurlar:** ${meta.rejection_logistics || '-'}\n`;
      md += `* **Kesim/Form Kusurları:** ${meta.rejection_cutting || '-'}\n`;
      md += `* **Soğuk Zincir/Nem Kusurları:** ${meta.rejection_cold_chain || '-'}\n`;
      md += `* **Görsel/Renk Kusurları:** ${meta.rejection_visual || '-'}\n\n`;

      if (meta.compare_caramelization_correct || meta.compare_caramelization_incorrect) {
        md += `### Görsel Karşılaştırma: Karamelizasyon Rehberi\n`;
        if (meta.compare_caramelization_desc) md += `${meta.compare_caramelization_desc}\n\n`;
        if (meta.compare_caramelization_correct) md += `* **DOĞRU:** ![Doğru Karamelizasyon](${meta.compare_caramelization_correct})\n`;
        if (meta.compare_caramelization_incorrect) md += `* **YANLIŞ:** ![Yanlış Karamelizasyon](${meta.compare_caramelization_incorrect})\n`;
        md += `\n`;
      }

      if (meta.compare_cutting_correct || meta.compare_cutting_incorrect) {
        md += `### Görsel Karşılaştırma: Tat - Koku Standardı Rehberi\n`;
        if (meta.compare_cutting_desc) md += `${meta.compare_cutting_desc}\n\n`;
        if (meta.compare_cutting_correct) md += `* **DOĞRU:** ![Doğru Tat - Koku](${meta.compare_cutting_correct})\n`;
        if (meta.compare_cutting_incorrect) md += `* **YANLIŞ:** ![Yanlış Tat - Koku](${meta.compare_cutting_incorrect})\n`;
        md += `\n`;
      }

      const comps = meta.visual_comparisons || [];
      const validComps = comps.filter(c => c.correct_image || c.wrong_image);
      if (validComps.length > 0) {
        md += `## Görsel Karşılaştırma Rehberleri\n\n`;
        validComps.forEach(comp => {
          if (comp.title) md += `### ${comp.title}\n`;
          if (comp.description) md += `${comp.description}\n\n`;
          if (comp.correct_image) md += `* **DOĞRU:** ![Doğru](${comp.correct_image})\n`;
          if (comp.wrong_image) md += `* **YANLIŞ:** ![Yanlış](${comp.wrong_image})\n`;
          md += `\n`;
        });
      }

      finalContent = md;
    }

    try {
      const method = editingPage ? 'PUT' : 'POST'
      const url = editingPage ? buildApiUrl(`/api/manual/pages/${editingPage.id}`) : buildApiUrl('/api/manual/pages')

      // Edit modunda pageForm.category_id'yi kullan, yeni sayfa için activeTab
      const saveCategoryId = editingPage ? (pageForm.category_id || activeTab) : activeTab
      const bodyData = { ...pageForm, category_id: saveCategoryId, content: finalContent }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyData)
      })
      const result = await response.json()

      if (result.error) throw new Error(result.error.message)

      toast(editingPage ? 'Sayfa güncellendi' : 'Sayfa oluşturuldu', 'success')
      handleCancelPageEdit()
      loadData()
    } catch (err) {
      toast('Sayfa kaydedilemedi: ' + err.message, 'error')
    }
  }

  const handleEditPage = async (page) => {
    if (!page) {
      handleCancelPageEdit()
      return
    }
    setEqSearch('')
    setLoading(true)
    try {
      // Fetch details with joined equipments to pre-populate equipment links
      const [res, ctxRes] = await Promise.all([
        fetch(buildApiUrl(`/api/manual/pages/${page.id}`)).then(r => r.json()),
        fetch(buildApiUrl(`/api/manual/pages/${page.id}/context`)).then(r => r.json())
      ])
      if (res.error) throw new Error(res.error.message)
      
      const details = res.data
      setEditingPage(details)
      setRecipeContext(ctxRes.data?.recipe || [])
      setRecipeMeta({
        portionNames: ctxRes.data?.portionNames || { '__standart__': 'Standart' },
        allChannels: ctxRes.data?.allChannels || []
      })
      
      const catName = categories.find(c => c.id === details.category_id)?.name || '';
      const isHammaddeler = catName.toLowerCase().includes('hammad');
      const pageMetadata = details.metadata || {};
      const mergedMetadata = isHammaddeler 
        ? { ...DEFAULT_METADATA_HAMMADDELER, ...pageMetadata }
        : { product_image: '', description: '', steps: [], visual_comparisons: [], ...pageMetadata };

      if (isHammaddeler) {
        if (!mergedMetadata.shelf_lives || mergedMetadata.shelf_lives.length === 0) {
          const legacyLives = [];
          if (mergedMetadata.primary_shelf_life) {
            legacyLives.push({
              id: Date.now(),
              status: 'Kapalı',
              storage_area: mergedMetadata.storage_area || 'Depo',
              duration: mergedMetadata.primary_shelf_life
            });
          }
          if (mergedMetadata.secondary_shelf_life) {
            legacyLives.push({
              id: Date.now() + 1,
              status: 'Açık / Çözünmüş',
              storage_area: '+4°C',
              duration: mergedMetadata.secondary_shelf_life
            });
          }
          mergedMetadata.shelf_lives = legacyLives;
        }
        if (!mergedMetadata.steps || mergedMetadata.steps.length === 0) {
          mergedMetadata.steps = [
            {
              description: 'bu stok malı kullanım için herhangi bir ön hazırlığa gerek yoktur doğrudan kullanılabilir.',
              imageUrl: '__default_check__'
            }
          ];
        }
      }

      setPageForm({
        category_id: details.category_id || '',
        title: details.title || '',
        content: details.content || '',
        last_updated_by_pin: details.last_updated_by_pin || '',
        equipment_ids: (details.equipments || []).map(eq => eq.id),
        linked_item_id: details.linked_item_id || '',
        linked_item_type: details.linked_item_type || '',
        is_draft: details.is_draft || false,
        metadata: mergedMetadata
      })
    } catch (err) {
      toast('Sayfa detayları yüklenemedi: ' + err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleDeletePage = async (id) => {
    if (!window.confirm('Bu sayfayı silmek istediğinize emin misiniz?')) return

    try {
      const response = await fetch(buildApiUrl(`/api/manual/pages/${id}`), {
        method: 'DELETE'
      })
      const result = await response.json()

      if (result.error) throw new Error(result.error.message)

      toast('Sayfa silindi', 'success')
      loadData()
    } catch (err) {
      toast('Sayfa silinemedi: ' + err.message, 'error')
    }
  }

  const handleCancelPageEdit = (targetCatId) => {
    setEditingPage(null)
    setEqSearch('')
    const catId = targetCatId || activeTab
    const catName = categories.find(c => c.id === catId)?.name || ''
    const isHamm = catName.toLowerCase().includes('hammad')

    setPageForm({
      category_id: catId || '',
      title: '',
      content: '',
      last_updated_by_pin: '',
      equipment_ids: [],
      linked_item_id: '',
      linked_item_type: '',
      is_draft: false,
      metadata: isHamm 
        ? { ...DEFAULT_METADATA_HAMMADDELER }
        : { product_image: '', description: '', steps: [], visual_comparisons: [] }
    })
    setRecipeContext([])
    setRecipeMeta({ portionNames: { '__standart__': 'Standart' }, allChannels: [] })
  }

  // Lightweight Regex-based Markdown Parser with Image support
  const renderMarkdown = (text) => {
    if (!text) return ''
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

    // Headers
    html = html.replace(/^# (.*?)$/gm, '<h1 style="font-size: 1.5rem; font-weight: 800; margin: 24px 0 12px; color: var(--text-strong); border-bottom: 1px solid var(--border); padding-bottom: 6px;">$1</h1>')
    html = html.replace(/^## (.*?)$/gm, '<h2 style="font-size: 1.22rem; font-weight: 700; margin: 18px 0 10px; color: var(--text-strong);">$1</h2>')
    html = html.replace(/^### (.*?)$/gm, '<h3 style="font-size: 1.1rem; font-weight: 700; margin: 14px 0 8px; color: var(--text-strong);">$1</h3>')

    // Images
    html = html.replace(/!\[(.*?)\]\((.*?)\)/g, '<img src="$2" alt="$1" style="max-width: 100%; height: auto; border-radius: 8px; margin: 12px 0; border: 1px solid var(--border);" />')

    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong style="color: var(--text-strong);">$1</strong>')
    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>')

    // Code blocks / inline code
    html = html.replace(/`(.*?)`/g, '<code style="font-family: monospace; background: var(--surface-2); padding: 2px 5px; borderRadius: 4px; fontSize: .85rem;">$1</code>')

    // Horizontal rules
    html = html.replace(/^---$/gm, '<hr style="border: 0; border-top: 1px solid var(--border); margin: 20px 0;" />')

    // Bullet Lists (unordered)
    html = html.replace(/^- (.*?)$/gm, '<li style="margin-left: 18px; margin-bottom: 6px; list-style-type: disc;">$1</li>')
    html = html.replace(/^\* (.*?)$/gm, '<li style="margin-left: 18px; margin-bottom: 6px; list-style-type: disc;">$1</li>')

    // Ordered Lists
    html = html.replace(/^\d+\.\s(.*)$/gm, '<li style="margin-left: 18px; margin-bottom: 6px; list-style-type: decimal;">$1</li>')

    // Break lines
    html = html.replace(/\n/g, '<br />')

    return <div dangerouslySetInnerHTML={{ __html: html }} style={{ lineHeight: '1.65', color: 'var(--text-strong)', fontSize: '.92rem' }} />
  }

  const handleEquipmentCheckboxChange = (eqId) => {
    setPageForm(prev => {
      const ids = [...prev.equipment_ids]
      const idx = ids.indexOf(eqId)
      if (idx > -1) {
        ids.splice(idx, 1)
      } else {
        ids.push(eqId)
      }
      return { ...prev, equipment_ids: ids }
    })
  }

  const activeCat = categories.find(c => c.id === (pageForm.category_id || activeTab));
  const activeCatName = activeCat?.name || '';
  const isUrunler = activeCatName.toLowerCase().includes('ürün') || activeCatName.toLowerCase().includes('urun');
  const isHammaddeler = activeCatName.toLowerCase().includes('hammad');

  const currentTabCat = categories.find(c => c.id === activeTab);
  const currentTabCatName = currentTabCat?.name || '';
  const isCurrentTabUrunler = currentTabCatName.toLowerCase().includes('ürün') || currentTabCatName.toLowerCase().includes('urun');
  const isCurrentTabHammaddeler = currentTabCatName.toLowerCase().includes('hammad');

  return (
    <div className="page-enter" style={{ maxWidth: 1200, margin: '0 auto' }}>
      <style>{`
        /* ─── ARTISTIC SPECS BANNER ─── */
        .mr-specs-banner {
          position: relative;
          width: 100%;
          height: 180px;
          margin: 30px 0;
        }
        .mr-specs-banner-strip {
          position: absolute;
          left: 0;
          right: 0;
          top: 80px;
          height: 100px;
          border-top: 2px solid #000;
          border-bottom: 2px solid #000;
          background: #ffffff;
          overflow: hidden;
          z-index: 1;
        }
        [data-theme="dark"] .mr-specs-banner-strip {
          background: #111827;
          border-top-color: #374151;
          border-bottom-color: #374151;
        }
        .mr-specs-banner-bg {
          position: absolute;
          top: -10px; left: -10px; right: -10px; bottom: -10px;
          background-size: cover;
          background-position: center;
          filter: blur(4px) brightness(1.05) contrast(1.05) saturate(1.1);
          opacity: 0.9;
        }
        [data-theme="dark"] .mr-specs-banner-bg {
          opacity: 0.45;
          filter: blur(6px) brightness(0.7) contrast(1.1);
        }
        .mr-specs-banner-grid {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          z-index: 2;
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          justify-content: center;
          align-items: flex-start;
          width: 100%;
          padding: 0 16px;
        }
        .mr-spec-art-card {
          width: 180px;
          background: var(--card-bg-bottom, #ffffff);
          border: 1px solid var(--card-border, rgba(0,0,0,0.08));
          border-radius: 8px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .mr-spec-art-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(0,0,0,0.08);
        }
        .mr-spec-art-top {
          background: var(--card-bg-top, #f8fafc);
          border-bottom: 1px solid var(--card-border, rgba(0,0,0,0.08));
          padding: 10px 8px;
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 4px;
          align-items: center;
          justify-content: center;
          height: 80px;
          box-sizing: border-box;
        }
        .mr-spec-art-label {
          font-size: 0.68rem;
          font-weight: 700;
          color: #475569;
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .mr-spec-art-val {
          font-size: 0.88rem;
          font-weight: 800;
          color: var(--card-val-color, #1e293b);
        }
        .mr-spec-art-bottom {
          background: var(--card-bg-bottom, #ffffff);
          padding: 10px 8px;
          font-size: 0.66rem;
          color: #334155;
          line-height: 1.4;
          text-align: center;
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 80px;
          box-sizing: border-box;
        }
        [data-theme="dark"] .mr-spec-art-card {
          --card-bg-top: rgba(30, 41, 59, 0.8) !important;
          --card-bg-bottom: rgba(15, 23, 42, 0.8) !important;
          --card-border: rgba(255, 255, 255, 0.1) !important;
          --card-val-color: var(--accent-primary) !important;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2) !important;
        }
        [data-theme="dark"] .mr-spec-art-label {
          color: #94a3b8 !important;
        }
        [data-theme="dark"] .mr-spec-art-bottom {
          color: #cbd5e1 !important;
        }
        @media (max-width: 768px) {
          .mr-specs-banner {
            height: auto !important;
            margin: 20px 0 !important;
          }
          .mr-specs-banner-strip {
            display: none !important;
          }
          .mr-specs-banner-grid {
            position: relative !important;
            padding: 0 !important;
            flex-direction: column !important;
            align-items: center !important;
            gap: 16px !important;
          }
          .mr-spec-art-card {
            width: 100% !important;
            max-width: 280px !important;
          }
        }

        /* ─── CHANNEL TOOLTIP (PREVIEW) ─── */
        .mr-channel-tooltip-container {
          position: relative;
          display: inline-block;
        }

        .mr-channel-tooltip-content {
          visibility: hidden;
          opacity: 0;
          position: absolute;
          bottom: 125%;
          right: 0;
          transform: translateY(4px);
          background: #ffffff;
          border: 1px solid #ddd;
          border-radius: 6px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
          padding: 6px 10px;
          min-width: 150px;
          z-index: 100;
          pointer-events: none;
          transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s;
        }

        .mr-channel-tooltip-container:hover .mr-channel-tooltip-content {
          visibility: visible;
          opacity: 1;
          transform: translateY(0);
          pointer-events: auto;
        }

        .mr-channel-tooltip-arrow {
          position: absolute;
          top: 100%;
          right: 15px;
          border-width: 5px;
          border-style: solid;
          border-color: #ffffff transparent transparent transparent;
        }
        
        .mr-channel-tooltip-arrow-border {
          position: absolute;
          top: 100%;
          right: 15px;
          border-width: 6px;
          border-style: solid;
          border-color: #ddd transparent transparent transparent;
          z-index: -1;
        }

        .mr-channel-list {
          margin: 0;
          padding: 0;
          list-style: none;
        }

        .mr-channel-item {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.65rem;
          padding: 2px 0;
          color: #555;
        }
        
        .mr-channel-tooltip-title {
          font-size: 0.62rem;
          font-weight: 700;
          color: #333;
          border-bottom: 1px solid #eee;
          padding-bottom: 4px;
          margin-bottom: 4px;
          text-transform: uppercase;
        }

        /* ─── RECIPE GRID (PREVIEW) ─── */
        .mr-recipe-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 16px;
        }
        @media (max-width: 768px) {
          .mr-recipe-grid {
            grid-template-columns: 1fr;
          }
        }
        .mr-recipe-common {
          font-weight: 600 !important;
          color: #1e293b !important;
        }
        .mr-recipe-specific {
          font-weight: 450 !important;
          color: #1e293b !important;
          opacity: 0.85;
        }

        /* ─── EQUIP TABLE (PREVIEW) ─── */
        .mr-equip-table {
          width: 100%;
          border-collapse: collapse;
          font-size: .72rem;
          margin-top: 6px;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          overflow: hidden;
        }
        .mr-equip-table th {
          background: #f8fafc;
          padding: 6px 10px;
          font-weight: 600;
          color: #64748b;
          border-bottom: 1.5px solid #cbd5e1;
          text-align: left;
        }
        .mr-equip-table td {
          padding: 6px 10px;
          border-bottom: 1px solid #e2e8f0;
          color: #334155;
        }
        .mr-equip-table tr:last-child td {
          border-bottom: none;
        }

        /* ─── STEP BADGE (PREVIEW) ─── */
        .mr-step-badge {
          position: absolute;
          top: -12px;
          left: 12px;
          background: linear-gradient(135deg, #14496b, #0c2d48);
          color: #ffffff;
          font-size: 0.6rem;
          font-weight: 800;
          padding: 3px 10px;
          border-radius: 20px;
          box-shadow: 0 3px 8px rgba(20, 73, 107, 0.25);
          z-index: 10;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          display: flex;
          align-items: center;
          gap: 4px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          animation: mr-badge-glowing-preview 3s infinite ease-in-out;
        }
        @keyframes mr-badge-glowing-preview {
          0% {
            box-shadow: 0 3px 8px rgba(20, 73, 107, 0.25);
            transform: translateY(0);
          }
          50% {
            box-shadow: 0 5px 12px rgba(20, 73, 107, 0.45), 0 0 0 3px rgba(20, 73, 107, 0.12);
            transform: translateY(-1.5px);
          }
        }

        /* ─── PREMIUM COMPARISONS (EDITOR PREVIEW) ─── */
        .mr-comp-premium-card {
          position: relative;
          background: var(--surface);
          margin: 20px 24px;
          padding: 0;
        }
        .mr-comp-premium-grid {
          display: grid;
          gap: 0;
          min-height: 120px;
        }
        .mr-comp-premium-img-box {
          position: relative;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          background: var(--surface-2);
          aspect-ratio: 4 / 3;
          height: 5cm;
          align-self: center;
          flex-shrink: 0;
        }
        .mr-comp-premium-img-box.correct {
          border-radius: 6px 0 0 6px;
          border-left: 3px solid #10b981;
        }
        .mr-comp-premium-img-box.wrong {
          border-radius: 0 6px 6px 0;
          border-right: 3px solid #ef4444;
        }
        .mr-comp-premium-img-box img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .mr-comp-premium-img-box.correct img {
          border-radius: 6px 0 0 6px;
        }
        .mr-comp-premium-img-box.wrong img {
          border-radius: 0 6px 6px 0;
        }
        .mr-comp-premium-content-box {
          padding: 16px 20px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          text-align: center;
        }
        .mr-comp-premium-title {
          margin: 0 0 8px 0;
          font-size: 1rem;
          font-weight: 800;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .mr-comp-premium-desc {
          margin: 0;
          font-size: 0.84rem;
          line-height: 1.6;
          color: var(--text-strong);
        }
        .mr-sketch-line-middle-left {
          position: absolute;
          top: -24px;
          bottom: -24px;
          left: calc(5cm * 4 / 3);
          width: 3px;
          border-radius: 1px;
          z-index: 2;
        }
        .mr-sketch-line-middle-right {
          position: absolute;
          top: -24px;
          bottom: -24px;
          right: calc(5cm * 4 / 3);
          width: 3px;
          border-radius: 1px;
          z-index: 2;
        }
      `}</style>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 className="text-primary" style={{ margin: 0, fontSize: '1.75rem', fontWeight: 900 }}>
            <i className="fa-solid fa-book-open-reader" style={{ marginRight: 10, color: 'var(--accent-primary)' }} />
            El Kitabı Yönetimi
          </h1>
          <p className="text-secondary" style={{ margin: '4px 0 0', fontSize: '.85rem' }}>
            Şubeler için operasyon kılavuzlarını ve kategorileri düzenleyin.
          </p>
        </div>
        <button className="btn-o" onClick={loadData} disabled={loading}>
          <i className={`fa-solid fa-rotate ${loading ? 'fa-spin' : ''}`} /> Yenile
        </button>
      </div>

      {/* Tabs */}
      <div className="hide-scrollbar" style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 10, overflowX: 'auto' }}>
        {categories.map(cat => (
          <button
            key={cat.id}
            className={activeTab === cat.id ? 'btn-p' : 'btn-o'}
            onClick={() => {
              setActiveTab(cat.id);
              handleCancelPageEdit(cat.id);
            }}
            style={{ boxShadow: activeTab === cat.id ? undefined : 'none', whiteSpace: 'nowrap' }}
          >
            <i className="fa-solid fa-folder-open" style={{ marginRight: 6 }} /> {cat.name}
          </button>
        ))}
        <button
          className={activeTab === 'categories' ? 'btn-p' : 'btn-o'}
          onClick={() => setActiveTab('categories')}
          style={{ boxShadow: activeTab === 'categories' ? undefined : 'none', marginLeft: 'auto', whiteSpace: 'nowrap' }}
        >
          <i className="fa-solid fa-tags" style={{ marginRight: 6 }} /> Kategori Yönetimi
        </button>
      </div>

      {activeTab !== 'categories' ? (
        <div style={{ display: 'grid', gridTemplateColumns: (isUrunler || isHammaddeler) && (editingPage || pageForm.title || pageForm.linked_item_id) ? '1fr 1fr' : 'minmax(0, 5fr) minmax(0, 7fr)', gap: 24 }}>
          
          {isUrunler && (editingPage || pageForm.title || pageForm.linked_item_id) ? (
            <div className="card" style={{ padding: 20 }}>
              <h2 className="text-primary" style={{ margin: '0 0 16px', fontSize: '1.2rem', fontWeight: 800 }}>
                <i className="fa-solid fa-eye" style={{ marginRight: 8 }} /> Canlı Önizleme
              </h2>
              {/* A4-like page */}
              <div style={{ background: '#fff', color: '#222', padding: '28px 32px', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>

                {/* ── HEADER ── */}
                <div style={{ borderBottom: '2.5px solid #14496b', paddingBottom: 10, marginBottom: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '.65rem', color: '#aaa', textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: 3 }}>İşletme ve Eğitim El Kitabı</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#14496b' }}>
                      {pageForm.title || (pageForm.linked_item_id ? systemItems.find(i => i.id === pageForm.linked_item_id)?.name : 'Sayfa Başlığı')}
                    </div>
                  </div>
                  <div style={{ width: 38, height: 38, borderRadius: 6, background: '#14496b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.55rem', fontWeight: 700, letterSpacing: '.5px', flexShrink: 0 }}>LOGO</div>
                </div>

                {/* ── HERO ROW: Image + Description side-by-side ── */}
                {(pageForm.metadata?.product_image || pageForm.metadata?.description) && (
                  <div style={{ display: 'flex', gap: 18, marginBottom: 20, alignItems: 'stretch' }}>
                    {/* Product Image */}
                    <div style={{ flex: 1, maxWidth: '280px', borderRadius: 8, overflow: 'hidden', background: '#f5f6f8', border: '1px solid #e8e8e8', aspectRatio: '4/3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      {pageForm.metadata?.product_image ? (
                        <img src={resolveImageUrl(pageForm.metadata.product_image)} alt="Product" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      ) : (
                        <div style={{ textAlign: 'center', color: '#ccc', padding: 16 }}>
                          <i className="fa-solid fa-camera" style={{ fontSize: '1.6rem', display: 'block', marginBottom: 6 }} />
                          <span style={{ fontSize: '.7rem' }}>Ürün görseli</span>
                        </div>
                      )}
                    </div>

                    {/* Ürün Hikayesi/Açıklaması Önizleme */}
                    {pageForm.metadata?.description ? (
                      <div style={{
                        flex: 1.2,
                        padding: '10px 14px',
                        background: '#fcf8f2',
                        borderLeft: '3px solid #f5a623',
                        borderRight: '3px solid #f5a623',
                        borderRadius: 8,
                        fontSize: '.74rem',
                        color: '#666',
                        fontStyle: 'italic',
                        lineHeight: 1.5,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        textAlign: 'center'
                      }}>
                        {renderFormattedDescription(pageForm.metadata.description)}
                      </div>
                    ) : (
                      <div style={{ flex: 1.2 }} />
                    )}
                  </div>
                )}

                {/* Product Details & Shelf Life */}
                    {/* Product Details & Shelf Life */}
                    {(() => {
                      const spec1Label = pageForm.metadata?.spec_1_label !== undefined ? pageForm.metadata.spec_1_label : (pageForm.metadata?.prep_time_label || 'Hazırlanma Süresi');
                      const spec1Val = pageForm.metadata?.spec_1_val !== undefined ? pageForm.metadata.spec_1_val : (pageForm.metadata?.prep_time || '');
                      const spec1Desc = pageForm.metadata?.spec_1_desc || '';

                      const spec2Label = pageForm.metadata?.spec_2_label !== undefined ? pageForm.metadata.spec_2_label : (pageForm.metadata?.thaw_time_label || 'Çözünme Süresi');
                      const spec2Val = pageForm.metadata?.spec_2_val !== undefined ? pageForm.metadata.spec_2_val : (pageForm.metadata?.thaw_time || '');
                      const spec2Desc = pageForm.metadata?.spec_2_desc || '';

                      const spec3Label = pageForm.metadata?.spec_3_label !== undefined ? pageForm.metadata.spec_3_label : (pageForm.metadata?.cooling_time_label || 'Ilınma/Soğuma');
                      const spec3Val = pageForm.metadata?.spec_3_val !== undefined ? pageForm.metadata.spec_3_val : (pageForm.metadata?.cooling_time || '');
                      const spec3Desc = pageForm.metadata?.spec_3_desc || '';

                      const spec4Label = pageForm.metadata?.spec_4_label || 'Özellik 4';
                      const spec4Val = pageForm.metadata?.spec_4_val || '';
                      const spec4Desc = pageForm.metadata?.spec_4_desc || '';

                      const spec5Label = pageForm.metadata?.spec_5_label || 'Özellik 5';
                      const spec5Val = pageForm.metadata?.spec_5_val || '';
                      const spec5Desc = pageForm.metadata?.spec_5_desc || '';

                      const spec6Label = pageForm.metadata?.spec_6_label || 'Özellik 6';
                      const spec6Val = pageForm.metadata?.spec_6_val || '';
                      const spec6Desc = pageForm.metadata?.spec_6_desc || '';

                      const shelf1Label = pageForm.metadata?.shelf_1_label !== undefined ? pageForm.metadata.shelf_1_label : (pageForm.metadata?.primary_shelf_life_label || '1. Raf Ömrü (Kapalı)');
                      const shelf1Val = pageForm.metadata?.shelf_1_val !== undefined ? pageForm.metadata.shelf_1_val : (pageForm.metadata?.primary_shelf_life ? `${pageForm.metadata.primary_shelf_life}${pageForm.metadata.primary_storage_cond ? ` (${pageForm.metadata.primary_storage_cond})` : ''}` : '');
                      const shelf2Label = pageForm.metadata?.shelf_2_label !== undefined ? pageForm.metadata.shelf_2_label : (pageForm.metadata?.secondary_shelf_life_1_label || 'Durum 1');
                      const shelf2Val = pageForm.metadata?.shelf_2_val !== undefined ? pageForm.metadata.shelf_2_val : (pageForm.metadata?.secondary_shelf_life_1 ? `${pageForm.metadata.secondary_shelf_life_1}${pageForm.metadata.secondary_storage_cond_1 ? ` (${pageForm.metadata.secondary_storage_cond_1})` : ''}` : '');
                      const shelf3Label = pageForm.metadata?.shelf_3_label !== undefined ? pageForm.metadata.shelf_3_label : (pageForm.metadata?.secondary_shelf_life_2_label || 'Durum 2');
                      const shelf3Val = pageForm.metadata?.shelf_3_val !== undefined ? pageForm.metadata.shelf_3_val : (pageForm.metadata?.secondary_shelf_life_2 ? `${pageForm.metadata.secondary_shelf_life_2}${pageForm.metadata.secondary_storage_cond_2 ? ` (${pageForm.metadata.secondary_storage_cond_2})` : ''}` : '');
                      const shelf4Label = pageForm.metadata?.shelf_4_label || 'Durum 3';
                      const shelf4Val = pageForm.metadata?.shelf_4_val || '';
                      const shelf5Label = pageForm.metadata?.shelf_5_label || 'Durum 4';
                      const shelf5Val = pageForm.metadata?.shelf_5_val || '';
                      const shelf6Label = pageForm.metadata?.shelf_6_label || 'Durum 5';
                      const shelf6Val = pageForm.metadata?.shelf_6_val || '';

                      const hasSpecs = spec1Val || spec2Val || spec3Val || spec4Val || spec5Val || spec6Val;
                      const hasShelf = shelf1Val || shelf2Val || shelf3Val || shelf4Val || shelf5Val || shelf6Val;

                      if (!hasSpecs && !hasShelf) return null;

                      return (
                        <div style={{ marginTop: 14, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                          {hasSpecs && (
                            <>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                <i className="fa-solid fa-circle-info" style={{ color: '#14496b', fontSize: '.8rem' }} />
                                <span style={{ fontSize: '.68rem', fontWeight: 700, color: '#14496b', textTransform: 'uppercase', letterSpacing: '.4px' }}>Ürün Özellikleri</span>
                              </div>
                              
                              <div className="mr-specs-banner" style={{ margin: '15px 0' }}>
                                <div className="mr-specs-banner-strip">
                                  {pageForm.metadata?.product_image && (
                                    <div className="mr-specs-banner-bg" style={{ backgroundImage: `url(${resolveImageUrl(pageForm.metadata.product_image)})` }} />
                                  )}
                                </div>
                                <div className="mr-specs-banner-grid">
                                  {[
                                    { label: spec1Label, val: spec1Val, desc: spec1Desc },
                                    { label: spec2Label, val: spec2Val, desc: spec2Desc },
                                    { label: spec3Label, val: spec3Val, desc: spec3Desc },
                                    { label: spec4Label, val: spec4Val, desc: spec4Desc },
                                    { label: spec5Label, val: spec5Val, desc: spec5Desc },
                                    { label: spec6Label, val: spec6Val, desc: spec6Desc }
                                  ].map((spec, index) => {
                                    if (!spec.val) return null;
                                    const theme = getSpecTheme(spec.label);
                                    return (
                                      <div key={index} className="mr-spec-art-card" style={{
                                        '--card-border': theme.border,
                                        '--card-bg-top': theme.bgTop,
                                        '--card-bg-bottom': theme.bgBottom,
                                        '--card-val-color': theme.valColor
                                      }}>
                                        <div className="mr-spec-art-top">
                                          <div className="mr-spec-art-label">
                                            <i className={`fa-solid ${theme.icon}`} style={theme.iconStyle} />
                                            {spec.label}
                                          </div>
                                          <div className="mr-spec-art-val">{spec.val}</div>
                                        </div>
                                        <div className="mr-spec-art-bottom">
                                          {spec.desc || <span style={{ color: '#aaa', fontStyle: 'italic' }}>Açıklama girilmedi</span>}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </>
                          )}

                          {hasShelf && (
                            <div style={{ borderTop: hasSpecs ? '1px dashed #cbd5e1' : 'none', paddingTop: hasSpecs ? 8 : 0, marginTop: hasSpecs ? 8 : 0 }}>
                              <div style={{ fontSize: '.65rem', fontWeight: 700, color: '#14496b', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 6 }}>
                                Raf Ömrü Standartları
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                {shelf1Val && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', background: '#fff', padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '.7rem' }}>
                                    <span style={{ color: '#666', fontWeight: 500 }}>{shelf1Label}</span>
                                    <span style={{ fontWeight: 700, color: '#333' }}>{shelf1Val}</span>
                                  </div>
                                )}
                                {shelf2Val && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', background: '#fff', padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '.7rem' }}>
                                    <span style={{ color: '#666', fontWeight: 500 }}>{shelf2Label}</span>
                                    <span style={{ fontWeight: 700, color: '#333' }}>{shelf2Val}</span>
                                  </div>
                                )}
                                {shelf3Val && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', background: '#fff', padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '.7rem' }}>
                                    <span style={{ color: '#666', fontWeight: 500 }}>{shelf3Label}</span>
                                    <span style={{ fontWeight: 700, color: '#333' }}>{shelf3Val}</span>
                                  </div>
                                )}
                                {shelf4Val && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', background: '#fff', padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '.7rem' }}>
                                    <span style={{ color: '#666', fontWeight: 500 }}>{shelf4Label}</span>
                                    <span style={{ fontWeight: 700, color: '#333' }}>{shelf4Val}</span>
                                  </div>
                                )}
                                {shelf5Val && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', background: '#fff', padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '.7rem' }}>
                                    <span style={{ color: '#666', fontWeight: 500 }}>{shelf5Label}</span>
                                    <span style={{ fontWeight: 700, color: '#333' }}>{shelf5Val}</span>
                                  </div>
                                )}
                                {shelf6Val && (
                                  <div style={{ display: 'flex', justifyContent: 'space-between', background: '#fff', padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '.7rem' }}>
                                    <span style={{ color: '#666', fontWeight: 500 }}>{shelf6Label}</span>
                                    <span style={{ fontWeight: 700, color: '#333' }}>{shelf6Val}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}

                  {/* Recipe — Boyuta Göre Gruplandırılmış */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                      <div style={{ width: 3, height: 14, background: '#14496b', borderRadius: 2, flexShrink: 0 }} />
                      <span style={{ fontSize: '.72rem', fontWeight: 700, color: '#14496b', textTransform: 'uppercase', letterSpacing: '.6px' }}>Reçete</span>
                    </div>
                    {recipeContext.length > 0 ? (() => {
                      const portionNames = recipeMeta.portionNames || { '__standart__': 'Standart' }
                      const allCh = recipeMeta.allChannels || []

                      // Boyutlara göre gruplandır: boş portions → Standart, önce Standart sonra diğerleri
                      const portionGroups = {}
                      recipeContext.forEach(r => {
                        const ports = (Array.isArray(r.portions) && r.portions.length > 0) ? r.portions : ['__standart__']
                        ports.forEach(p => {
                          if (!portionGroups[p]) portionGroups[p] = []
                          portionGroups[p].push(r)
                        })
                      })
                      const groupKeys = Object.keys(portionGroups).sort((a, b) => {
                        if (a === '__standart__') return -1
                        if (b === '__standart__') return 1
                        return (portionNames[a] || a).localeCompare(portionNames[b] || b, 'tr')
                      })
                      const hasMultipleGroups = groupKeys.length > 1 || (groupKeys.length === 1 && groupKeys[0] !== '__standart__')

                      // Tüm boyutlarda ortak kullanılan malzemeleri bul: 
                      // Diğer boyutlarda (portions) listelenmeyen, yani override edilmeyen, yalnızca standart olanlar.
                      const commonIngredientNames = new Set()
                      const specificNames = new Set()
                      if (groupKeys.length > 1) {
                        groupKeys.forEach(portKey => {
                          if (portKey !== '__standart__') {
                            const rows = portionGroups[portKey] || []
                            rows.forEach(r => {
                              specificNames.add((r.name || '').toLowerCase().trim())
                            })
                          }
                        })
                        const standartRows = portionGroups['__standart__'] || []
                        standartRows.forEach(r => {
                          const nameLower = (r.name || '').toLowerCase().trim()
                          if (!specificNames.has(nameLower)) {
                            commonIngredientNames.add(nameLower)
                          }
                        })
                      }

                      return (
                        <div className={hasMultipleGroups ? "mr-recipe-grid" : ""} style={{ gap: hasMultipleGroups ? 16 : 0 }}>
                          {groupKeys.map((portKey, gi) => {
                            const groupRows = portionGroups[portKey]
                            const groupLabel = portionNames[portKey] || portKey
                            const isStandart = portKey === '__standart__'
                            return (
                              <div key={portKey} style={{ display: 'flex', flexDirection: 'column', marginBottom: hasMultipleGroups ? 0 : 8 }}>
                                {groupKeys.length > 1 && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                                    <span style={{
                                      fontSize: '.6rem', fontWeight: 800, padding: '1px 7px', borderRadius: 20,
                                      background: isStandart ? '#dbeafe' : '#ede9fe',
                                      color: isStandart ? '#1d4ed8' : '#7c3aed'
                                    }}>{groupLabel}</span>
                                  </div>
                                )}
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.72rem' }}>
                                  <thead>
                                    <tr style={{ borderBottom: '1.5px solid #14496b' }}>
                                      <th style={{ padding: '3px 5px', textAlign: 'left', color: '#666', fontWeight: 600, fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.4px' }}>Malzeme</th>
                                      <th style={{ padding: '3px 5px', textAlign: 'right', color: '#666', fontWeight: 600, fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.4px' }}>Miktar</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {groupRows.map((r, i) => {
                                      const isCommon = groupKeys.length > 1 && commonIngredientNames.has((r.name || '').toLowerCase().trim())
                                      const itemClass = isCommon ? 'mr-recipe-common' : 'mr-recipe-specific'
                                      return (
                                        <tr key={i} style={{ borderBottom: '1px solid #f2f2f2' }}>
                                          <td style={{ padding: '3px 5px' }} className={itemClass}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                              {r.image_url && (
                                                <img
                                                  src={resolveImageUrl(r.image_url)}
                                                  alt={r.name}
                                                  style={{
                                                    height: '2cm',
                                                    maxHeight: '2cm',
                                                    width: 'auto',
                                                    objectFit: 'contain',
                                                    borderRadius: '4px',
                                                    flexShrink: 0
                                                  }}
                                                />
                                              )}
                                              <span>{r.name}</span>
                                            </div>
                                          </td>
                                          <td style={{ padding: '3px 5px', textAlign: 'right', fontWeight: 600 }}>
                                            {renderChannelsTooltipInline(r, allCh)}
                                          </td>
                                        </tr>
                                      )
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })() : (
                      <div style={{ padding: '10px 6px', color: '#ccc', textAlign: 'center', fontStyle: 'italic', fontSize: '.72rem' }}>Ürün seçilince buraya yüklenir</div>
                    )}

                    {/* Ekipmanlar as Table */}
                    {pageForm.equipment_ids.length > 0 && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                          <div style={{ width: 3, height: 14, background: '#14496b', borderRadius: 2, flexShrink: 0 }} />
                          <span style={{ fontSize: '.68rem', fontWeight: 700, color: '#14496b', textTransform: 'uppercase', letterSpacing: '.6px' }}>Ekipmanlar</span>
                        </div>
                        <table className="mr-equip-table" style={{ maxWidth: '400px' }}>
                          <thead>
                            <tr>
                              <th>Ekipman</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pageForm.equipment_ids.map(eqId => {
                              const eq = equipments.find(e => e.id === eqId);
                              if (!eq) return null;
                              return (
                                <tr key={eqId}>
                                  <td>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                      {eq.image_url && (
                                        <img
                                          src={resolveImageUrl(eq.image_url)}
                                          alt={eq.name}
                                          style={{
                                            height: '2cm',
                                            maxHeight: '2cm',
                                            width: 'auto',
                                            objectFit: 'contain',
                                            borderRadius: '4px',
                                            flexShrink: 0
                                          }}
                                        />
                                      )}
                                      <span>{eq.name}</span>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                {/* ── STEPS ── */}
                {pageForm.metadata?.steps?.length > 0 && (() => {
                  const validSteps = pageForm.metadata.steps.filter(s => s.description?.trim() || s.imageUrl);
                  if (validSteps.length === 0) return null;
                  return (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                        <div style={{ width: 3, height: 14, background: '#14496b', borderRadius: 2, flexShrink: 0 }} />
                        <span style={{ fontSize: '.72rem', fontWeight: 700, color: '#14496b', textTransform: 'uppercase', letterSpacing: '.6px' }}>
                          {validSteps.length > 1 ? 'Hazırlık Adımları' : 'Hazırlık Prosedürü'}
                        </span>
                      </div>
                      {pageForm.metadata.steps.map((step, idx) => {
                        const { stepNumber, title, body } = parseStepText(step.description, idx)
                        const isEven = idx % 2 === 0; // even = image left; odd = image right
                        const hasImg = !!step.imageUrl;
                        return (
                          <div key={idx} style={{
                            display: 'flex',
                            flexDirection: isEven ? 'row' : 'row-reverse',
                            marginBottom: 14,
                            borderRadius: 8,
                            overflow: 'visible',
                            border: '1px solid #e8e8e8',
                            background: '#fff',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                            minHeight: 80,
                            position: 'relative'
                          }}>
                            {/* Animated Badge */}
                            <div className="mr-step-badge">
                              <i className="fa-solid fa-fire-burner" />
                              <span>Adım {stepNumber}</span>
                            </div>

                            {/* Image / Number Block */}
                            <div style={{
                              width: hasImg ? 140 : 44,
                              height: hasImg ? '5cm' : 'auto',
                              alignSelf: 'center',
                              flexShrink: 0,
                              background: hasImg ? '#f5f6f8' : '#14496b',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              position: 'relative',
                              overflow: 'hidden',
                              borderRadius: isEven ? '7px 0 0 7px' : '0 7px 7px 0'
                            }}>
                              {hasImg && (
                                <img src={resolveImageUrl(step.imageUrl)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" />
                              )}
                              {!hasImg && (
                                <i className="fa-solid fa-cookie-bite" style={{ fontSize: '1.2rem', color: 'rgba(255,255,255,0.4)' }} />
                              )}
                            </div>
                            {/* Text */}
                            <div style={{
                              flex: 1, padding: '16px 20px',
                              display: 'flex', flexDirection: 'column', justifyContent: 'center',
                              fontSize: '.84rem', color: '#2d2d2d', lineHeight: 1.65,
                              borderLeft: isEven ? '3px solid #14496b' : 'none',
                              borderRight: isEven ? 'none' : '3px solid #14496b',
                            }}>
                              {title && (
                                <div style={{ fontWeight: 800, color: '#14496b', marginBottom: 6, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <i className="fa-solid fa-cookie-bite" style={{ fontSize: '0.75rem', opacity: 0.8 }} />
                                  {title}
                                </div>
                              )}
                              <div>
                                {body ? renderFormattedDescription(body) : <span style={{ color: '#ccc', fontStyle: 'italic' }}>Açıklama girilmedi...</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* Visual Guides */}
                {(() => {
                  const comps = Array.isArray(pageForm.metadata?.visual_comparisons) 
                    ? pageForm.metadata.visual_comparisons.filter(c => c.correct_image || c.wrong_image) 
                    : [];
                  if (comps.length === 0) return null;
                  return (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                        <div style={{ width: 3, height: 14, background: '#14496b', borderRadius: 2, flexShrink: 0 }} />
                        <span style={{ fontSize: '.72rem', fontWeight: 700, color: '#14496b', textTransform: 'uppercase', letterSpacing: '.6px' }}>
                          Görsel Karşılaştırma Rehberleri
                        </span>
                      </div>
                      {comps.map((comp, idx) => (
                        <div key={idx} className="mr-comp-premium-card mr-step-premium-card">
                          {/* Sketch border lines */}
                          <div className="mr-sketch-line mr-sketch-line-top"></div>
                          <div className="mr-sketch-line mr-sketch-line-bottom"></div>
                          <div className="mr-sketch-line mr-sketch-line-left"></div>
                          <div className="mr-sketch-line mr-sketch-line-right"></div>
                          {comp.correct_image && (
                            <div className="mr-sketch-line mr-sketch-line-middle-left"></div>
                          )}
                          {comp.wrong_image && (
                            <div className="mr-sketch-line mr-sketch-line-middle-right"></div>
                          )}
                          
                          <div className="mr-comp-premium-grid" style={{ 
                            display: 'grid',
                            gridTemplateColumns: `${comp.correct_image ? 'calc(5cm * 4 / 3)' : '0px'} 1fr ${comp.wrong_image ? 'calc(5cm * 4 / 3)' : '0px'}`,
                            alignItems: 'stretch'
                          }}>
                            {comp.correct_image ? (
                              <div className="mr-comp-premium-img-box correct">
                                <span style={{ position: 'absolute', top: 8, left: 8, background: '#10b981', color: '#fff', fontSize: '.65rem', fontWeight: 800, padding: '3px 8px', borderRadius: 12, zIndex: 1 }}>✓ DOĞRU</span>
                                <img src={resolveImageUrl(comp.correct_image)} alt="Correct" />
                              </div>
                            ) : <div />}
                            
                            <div className="mr-comp-premium-content-box">
                              {comp.title && (
                                <h3 className="mr-comp-premium-title" style={{ color: '#14496b', justifyContent: 'center' }}>
                                  <i className="fa-solid fa-images" style={{ fontSize: '0.85rem' }} />
                                  {comp.title}
                                </h3>
                              )}
                              {comp.description && (
                                <div className="mr-comp-premium-desc">
                                  {renderFormattedDescription(comp.description)}
                                </div>
                              )}
                            </div>
                            
                            {comp.wrong_image ? (
                              <div className="mr-comp-premium-img-box wrong">
                                <span style={{ position: 'absolute', top: 8, left: 8, background: '#ef4444', color: '#fff', fontSize: '.65rem', fontWeight: 800, padding: '3px 8px', borderRadius: 12, zIndex: 1 }}>✗ YANLIŞ</span>
                                <img src={resolveImageUrl(comp.wrong_image)} alt="Incorrect" />
                              </div>
                            ) : <div />}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* ── FOOTER ── */}
                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 9, marginTop: 24, display: 'flex', justifyContent: 'space-between', color: '#bbb', fontSize: '.65rem' }}>
                  <span>{activeCatName}</span>
                  <span>{pageForm.title || (pageForm.linked_item_id ? systemItems.find(i => i.id === pageForm.linked_item_id)?.name : '')}</span>
                  <span>Sayfa 1</span>
                </div>
                            </div>
            </div>
          ) : isHammaddeler && (editingPage || pageForm.title || pageForm.linked_item_id) ? (
            <div className="card" style={{ padding: 20 }}>
              <h2 className="text-primary" style={{ margin: '0 0 16px', fontSize: '1.2rem', fontWeight: 800 }}>
                <i className="fa-solid fa-eye" style={{ marginRight: 8 }} /> Canlı Önizleme
              </h2>
              {/* Premium spec sheet */}
              <div style={{ background: '#fff', color: '#222', padding: '28px 32px', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
                
                {/* Header */}
                <div style={{ borderBottom: '2.5px solid #1e3a8a', paddingBottom: 10, marginBottom: 22, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '.65rem', color: '#aaa', textTransform: 'uppercase', letterSpacing: '1.2px', marginBottom: 3 }}>İşletme ve Eğitim El Kitabı</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#1e3a8a' }}>
                      {pageForm.title || 'Hammadde Başlığı'}
                    </div>
                  </div>
                  <div style={{ fontSize: '.7rem', fontWeight: 700, padding: '4px 10px', borderRadius: 12, background: 'rgba(30, 58, 138, 0.1)', color: '#1e3a8a' }}>
                    HAMMADDE
                  </div>
                </div>

                {/* 1. Kimlik ve Sistem Bilgileri */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: '.75rem' }}>
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontSize: '.65rem', textTransform: 'uppercase' }}>Sistem/ERP Kodu</span>
                      <strong style={{ color: '#0f172a' }}>{pageForm.metadata?.erp_code || '-'}</strong>
                    </div>
                    <div>
                      <span style={{ color: '#64748b', display: 'block', fontSize: '.65rem', textTransform: 'uppercase' }}>Kategori</span>
                      <strong style={{ color: '#0f172a' }}>{pageForm.metadata?.subcategory || '-'}</strong>
                    </div>
                  </div>
                  <div style={{ marginTop: 8, borderTop: '1px solid #e2e8f0', paddingTop: 8, fontSize: '.75rem' }}>
                    <span style={{ color: '#64748b', display: 'block', fontSize: '.65rem', textTransform: 'uppercase' }}>Onaylı Tedarikçiler</span>
                    <strong style={{ color: '#0f172a' }}>{pageForm.metadata?.approved_suppliers || '-'}</strong>
                  </div>
                </div>

                {/* 2. Fiziksel ve Görsel Spesifikasyonlar */}
                <div style={{ display: 'flex', gap: 18, marginBottom: 20, alignItems: 'stretch' }}>
                  {/* Ideal Photo (4:3) */}
                  <div style={{ flex: 1, maxWidth: '200px', borderRadius: 8, overflow: 'hidden', background: '#f8fafc', border: '1px solid #e2e8f0', aspectRatio: '4/3', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {pageForm.metadata?.ideal_product_photo ? (
                      <img src={resolveImageUrl(pageForm.metadata.ideal_product_photo)} alt="Ideal" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ textAlign: 'center', color: '#cbd5e1', padding: 12 }}>
                        <i className="fa-solid fa-camera" style={{ fontSize: '1.4rem', display: 'block', marginBottom: 4 }} />
                        <span style={{ fontSize: '.65rem' }}>Görsel Girilmedi</span>
                      </div>
                    )}
                  </div>

                  {/* Physical parameters */}
                  <div style={{ flex: 1.2, display: 'flex', flexDirection: 'column', gap: 6, fontSize: '.75rem', justifyContent: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #e2e8f0', paddingBottom: 4 }}>
                      <span style={{ color: '#64748b' }}><i className="fa-solid fa-ruler" style={{ marginRight: 5, color: '#3b82f6' }} /> Çap ve Yükseklik:</span>
                      <strong style={{ color: '#334155' }}>{pageForm.metadata?.dimensions || '-'}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #e2e8f0', paddingBottom: 4 }}>
                      <span style={{ color: '#64748b' }}><i className="fa-solid fa-weight-scale" style={{ marginRight: 5, color: '#eab308' }} /> Gramaj:</span>
                      <strong style={{ color: '#334155' }}>{pageForm.metadata?.weight || '-'}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #e2e8f0', paddingBottom: 4 }}>
                      <span style={{ color: '#64748b' }}><i className="fa-solid fa-utensils" style={{ marginRight: 5, color: '#10b981' }} /> Tat - Koku:</span>
                      <strong style={{ color: '#334155' }}>{pageForm.metadata?.slicing_standard || '-'}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 4 }}>
                      <span style={{ color: '#64748b' }}><i className="fa-solid fa-certificate" style={{ marginRight: 5, color: '#a855f7' }} /> Doku/Görünüm:</span>
                      <strong style={{ color: '#334155' }}>{pageForm.metadata?.texture || '-'}</strong>
                    </div>
                  </div>
                </div>

                {/* 3 & 4. Lojistik ve Depolama */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  {/* Logistics */}
                  <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 10, fontSize: '.75rem' }}>
                    <h4 style={{ margin: '0 0 6px', color: '#1e40af', fontWeight: 700, fontSize: '.72rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <i className="fa-solid fa-truck-ramp-box" /> Lojistik Kabul
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: 12, listStyleType: 'disc', color: '#1e3a8a', display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <li>Sıcaklık: <strong>{pageForm.metadata?.delivery_temp || '-'}</strong></li>
                      <li>Ambalaj: <strong>{pageForm.metadata?.packaging_qty || '-'}</strong></li>
                      <li>Koli: <strong>{pageForm.metadata?.box_condition || '-'}</strong></li>
                    </ul>
                  </div>

                  {/* Storage & Shelf Life */}
                  <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: 10, fontSize: '.75rem' }}>
                    <h4 style={{ margin: '0 0 6px', color: '#92400e', fontWeight: 700, fontSize: '.72rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <i className="fa-solid fa-temperature-arrow-down" /> Depolama & Raf Ömrü
                    </h4>
                    <div style={{ color: '#78350f', display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {/* Dynamic Shelf Lives */}
                      {pageForm.metadata?.shelf_lives && pageForm.metadata.shelf_lives.length > 0 ? (
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: '.68rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid #d97706', color: '#92400e', textAlign: 'left' }}>
                              <th style={{ padding: '2px 4px', fontWeight: 700 }}>Durum</th>
                              <th style={{ padding: '2px 4px', fontWeight: 700 }}>Saklama Alanı</th>
                              <th style={{ padding: '2px 4px', fontWeight: 700 }}>Raf Ömrü</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pageForm.metadata.shelf_lives.map((item, i) => (
                              <tr key={i} style={{ borderBottom: '1px dashed rgba(217, 119, 6, 0.2)' }}>
                                <td style={{ padding: '3px 4px' }}>{item.status || '-'}</td>
                                <td style={{ padding: '3px 4px' }}>{item.storage_area || '-'}</td>
                                <td style={{ padding: '3px 4px', fontWeight: 700 }}>{item.duration || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <ul style={{ margin: 0, paddingLeft: 12, listStyleType: 'disc', display: 'flex', flexDirection: 'column', gap: 3 }}>
                          <li>1. Ömür: <strong>{pageForm.metadata?.primary_shelf_life || '-'}</strong></li>
                          <li>2. Ömür: <strong>{pageForm.metadata?.secondary_shelf_life || '-'}</strong></li>
                        </ul>
                      )}
                    </div>
                  </div>
                </div>

                {/* Dynamic/Flexible parameters grid */}
                {pageForm.metadata?.custom_parameters && pageForm.metadata.custom_parameters.length > 0 && (
                  <div style={{ background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 8, padding: 10, marginBottom: 16, fontSize: '.75rem' }}>
                    <h4 style={{ margin: '0 0 6px', color: '#5b21b6', fontWeight: 700, fontSize: '.72rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <i className="fa-solid fa-circle-exclamation" /> Ek Depolama ve İstifleme Kuralları
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {pageForm.metadata.custom_parameters.map((param, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px dashed #ede9fe', paddingBottom: 2 }}>
                          <span style={{ color: '#7c3aed', fontWeight: 500 }}>{param.label}:</span>
                          <strong style={{ color: '#4c1d95', wordBreak: 'break-all' }}>{param.value}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 6. Kullanıma Hazırlık */}
                {pageForm.metadata?.steps?.length > 0 && (() => {
                  const validSteps = pageForm.metadata.steps.filter(s => s.description?.trim() || s.imageUrl);
                  if (validSteps.length === 0) return null;
                  return (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
                        <div style={{ width: 3, height: 14, background: '#10b981', borderRadius: 2, flexShrink: 0 }} />
                        <span style={{ fontSize: '.72rem', fontWeight: 700, color: '#065f46', textTransform: 'uppercase', letterSpacing: '.6px' }}>
                          Kullanıma Hazırlık
                        </span>
                      </div>
                      {pageForm.metadata.steps.map((step, idx) => {
                        const { stepNumber, title, body } = parseStepText(step.description, idx)
                        const isEven = idx % 2 === 0;
                        const hasImg = !!step.imageUrl;
                        return (
                          <div key={idx} style={{
                            display: 'flex',
                            flexDirection: isEven ? 'row' : 'row-reverse',
                            marginBottom: 14,
                            borderRadius: 8,
                            overflow: 'visible',
                            border: '1px solid #e8e8e8',
                            background: '#fff',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                            minHeight: 80,
                            position: 'relative'
                          }}>
                            {/* Animated Badge */}
                            <div className="mr-step-badge" style={{ background: 'linear-gradient(135deg, #10b981, #047857)' }}>
                              <i className="fa-solid fa-circle-check" />
                              <span>Adım {stepNumber}</span>
                            </div>

                            {/* Image / Number Block */}
                            <div style={{
                              width: hasImg ? 140 : 44,
                              height: hasImg ? '5cm' : 'auto',
                              alignSelf: 'center',
                              flexShrink: 0,
                              background: hasImg ? '#f5f6f8' : '#10b981',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              position: 'relative',
                              overflow: 'hidden',
                              borderRadius: isEven ? '7px 0 0 7px' : '0 7px 7px 0'
                            }}>
                              {hasImg && (
                                step.imageUrl === '__default_check__' ? (
                                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ecfdf5' }}>
                                    <i className="fa-solid fa-circle-check" style={{ fontSize: '2rem', color: '#10b981' }} />
                                  </div>
                                ) : (
                                  <img src={resolveImageUrl(step.imageUrl)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} alt="" />
                                )
                              )}
                              {!hasImg && (
                                <i className="fa-solid fa-circle-check" style={{ fontSize: '1.2rem', color: 'rgba(255,255,255,0.4)' }} />
                              )}
                            </div>
                            {/* Text */}
                            <div style={{
                              flex: 1, padding: '16px 20px',
                              display: 'flex', flexDirection: 'column',
                              justifyContent: 'center',
                              fontSize: '.84rem', color: '#2d2d2d', lineHeight: 1.65,
                              borderLeft: isEven ? '3px solid #10b981' : 'none',
                              borderRight: isEven ? 'none' : '3px solid #10b981',
                            }}>
                              {title && (
                                <div style={{ fontWeight: 800, color: '#047857', marginBottom: 6, fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <i className="fa-solid fa-cookie-bite" style={{ fontSize: '0.75rem', opacity: 0.8 }} />
                                  {title}
                                </div>
                              )}
                              <div>
                                {body ? renderFormattedDescription(body) : <span style={{ color: '#ccc', fontStyle: 'italic' }}>Açıklama girilmedi...</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                {/* 7. Kusurlar ve Red Kriterleri */}
                <div style={{ background: '#fff5f5', border: '1px solid #fed7d7', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: '.75rem' }}>
                  <h4 style={{ margin: '0 0 8px', color: '#c53030', fontWeight: 700, fontSize: '.72rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <i className="fa-solid fa-triangle-exclamation" /> Red Kriterleri & Kusurlar
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {pageForm.metadata?.rejection_logistics && (
                      <div><strong style={{ color: '#9b2c2c' }}>Lojistik:</strong> <span style={{ color: '#742a2a' }}>{pageForm.metadata.rejection_logistics}</span></div>
                    )}
                    {pageForm.metadata?.rejection_cutting && (
                      <div><strong style={{ color: '#9b2c2c' }}>Kesim/Form:</strong> <span style={{ color: '#742a2a' }}>{pageForm.metadata.rejection_cutting}</span></div>
                    )}
                    {pageForm.metadata?.rejection_cold_chain && (
                      <div><strong style={{ color: '#9b2c2c' }}>Soğuk Zincir/Nem:</strong> <span style={{ color: '#742a2a' }}>{pageForm.metadata.rejection_cold_chain}</span></div>
                    )}
                    {pageForm.metadata?.rejection_visual && (
                      <div><strong style={{ color: '#9b2c2c' }}>Görsel/Renk:</strong> <span style={{ color: '#742a2a' }}>{pageForm.metadata.rejection_visual}</span></div>
                    )}
                  </div>
                </div>

                {/* Visual Guides */}
                {(() => {
                  const newComps = Array.isArray(pageForm.metadata?.visual_comparisons) 
                    ? pageForm.metadata.visual_comparisons.filter(c => c.correct_image || c.wrong_image) 
                    : [];
                  const legacyComps = [];
                  if (pageForm.metadata?.compare_caramelization_correct || pageForm.metadata?.compare_caramelization_incorrect) {
                    legacyComps.push({ 
                      title: 'Karamelizasyon Standardı', 
                      description: pageForm.metadata.compare_caramelization_desc || '', 
                      correct_image: pageForm.metadata.compare_caramelization_correct || '', 
                      wrong_image: pageForm.metadata.compare_caramelization_incorrect || '' 
                    });
                  }
                  if (pageForm.metadata?.compare_cutting_correct || pageForm.metadata?.compare_cutting_incorrect) {
                    legacyComps.push({ 
                      title: 'Tat - Koku Standardı', 
                      description: pageForm.metadata.compare_cutting_desc || '', 
                      correct_image: pageForm.metadata.compare_cutting_correct || '', 
                      wrong_image: pageForm.metadata.compare_cutting_incorrect || '' 
                    });
                  }
                  const allComps = [...newComps, ...legacyComps];
                  if (allComps.length === 0) return null;
                  return allComps.map((comp, idx) => (
                    <div key={idx} className="mr-comp-premium-card mr-step-premium-card">
                      {/* Sketch border lines */}
                      <div className="mr-sketch-line mr-sketch-line-top"></div>
                      <div className="mr-sketch-line mr-sketch-line-bottom"></div>
                      <div className="mr-sketch-line mr-sketch-line-left"></div>
                      <div className="mr-sketch-line mr-sketch-line-right"></div>
                      {comp.correct_image && (
                        <div className="mr-sketch-line mr-sketch-line-middle-left"></div>
                      )}
                      {comp.wrong_image && (
                        <div className="mr-sketch-line mr-sketch-line-middle-right"></div>
                      )}
                      
                      <div className="mr-comp-premium-grid" style={{ 
                        display: 'grid',
                        gridTemplateColumns: `${comp.correct_image ? 'calc(5cm * 4 / 3)' : '0px'} 1fr ${comp.wrong_image ? 'calc(5cm * 4 / 3)' : '0px'}`,
                        alignItems: 'stretch'
                      }}>
                        {comp.correct_image ? (
                          <div className="mr-comp-premium-img-box correct">
                            <span style={{ position: 'absolute', top: 8, left: 8, background: '#10b981', color: '#fff', fontSize: '.65rem', fontWeight: 800, padding: '3px 8px', borderRadius: 12, zIndex: 1 }}>✓ DOĞRU</span>
                            <img src={resolveImageUrl(comp.correct_image)} alt="Correct" />
                          </div>
                        ) : <div />}
                        
                        <div className="mr-comp-premium-content-box">
                          {comp.title && (
                            <h3 className="mr-comp-premium-title" style={{ color: '#1e3a8a', justifyContent: 'center' }}>
                              <i className="fa-solid fa-images" style={{ fontSize: '0.85rem' }} />
                              {comp.title}
                            </h3>
                          )}
                          {comp.description && (
                            <div className="mr-comp-premium-desc">
                              {renderFormattedDescription(comp.description)}
                            </div>
                          )}
                        </div>
                        
                        {comp.wrong_image ? (
                          <div className="mr-comp-premium-img-box wrong">
                            <span style={{ position: 'absolute', top: 8, left: 8, background: '#ef4444', color: '#fff', fontSize: '.65rem', fontWeight: 800, padding: '3px 8px', borderRadius: 12, zIndex: 1 }}>✗ YANLIŞ</span>
                            <img src={resolveImageUrl(comp.wrong_image)} alt="Incorrect" />
                          </div>
                        ) : <div />}
                      </div>
                    </div>
                  ));
                })()}

                <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 9, marginTop: 24, display: 'flex', justifyContent: 'space-between', color: '#bbb', fontSize: '.65rem' }}>
                  <span>{activeCatName}</span>
                  <span>{pageForm.title || ''}</span>
                  <span>Sayfa 1</span>
                </div>

              </div>
            </div>
          ) : (
          // Page List Card
          <div className="card" style={{ padding: 20 }}>
            <h2 className="text-primary" style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0 0 16px', display: 'flex', justifyContent: 'space-between' }}>
              <span>Bu Kategorideki Sayfalar</span>
              <button className="btn-o" onClick={() => handleEditPage(null)} style={{ fontSize: '.75rem', padding: '4px 8px' }}>
                <i className="fa-solid fa-plus" /> Yeni Sayfa
              </button>
            </h2>
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Başlık</th>
                    <th>Bağlantı</th>
                    <th style={{ textAlign: 'center' }}>Sürüm</th>
                    <th style={{ textAlign: 'center' }}>PIN</th>
                    <th>Güncelleme</th>
                    <th style={{ textAlign: 'center' }}>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {pages.filter(p => p.category_id === activeTab).length === 0 ? (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)' }}>
                        Bu kategoride henüz bir sayfa oluşturulmamış.
                      </td>
                    </tr>
                  ) : (
                    pages.filter(p => p.category_id === activeTab).map(page => {
                      const linkedItemName = page.linked_item_id 
                        ? systemItems.find(i => i.id === page.linked_item_id)?.name || 'Bilinmiyor'
                        : '-'
                      return (
                        <tr key={page.id}>
                          <td style={{ fontWeight: 600 }}>
                            {page.is_draft && <span style={{ color: 'var(--status-draft)', marginRight: 6 }}>[TASLAK]</span>}
                            {page.title}
                          </td>
                          <td style={{ fontSize: '.8rem', color: 'var(--accent-primary)' }}>{linkedItemName}</td>
                          <td style={{ textAlign: 'center', fontWeight: 'bold' }}>v{page.version}</td>
                          <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{page.last_updated_by_pin || '-'}</td>
                          <td style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>
                            {new Date(page.updated_at).toLocaleDateString('tr-TR')}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                              <button className="ico-btn edit" onClick={() => handleEditPage(page)} title="Düzenle">
                                <i className="fa-solid fa-pen" />
                              </button>
                              <button className="ico-btn del" onClick={() => handleDeletePage(page.id)} title="Sil">
                                <i className="fa-solid fa-trash" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
          )}

          {/* Page Editor Form Card */}
          <div className="card" style={{ padding: 20, height: 'fit-content' }}>
            <h2 className="text-primary" style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{editingPage ? 'Sayfayı Düzenle' : 'Yeni Sayfa Ekle'}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {editingPage && (
                  <button type="button" className="btn-g" onClick={handleCancelPageEdit} style={{ fontSize: '.8rem', padding: '6px 12px' }}>
                    İptal Et
                  </button>
                )}
                <button type="button" className="btn-p" onClick={handleSavePage} style={{ fontSize: '.8rem', padding: '6px 12px' }}>
                  <i className="fa-solid fa-save" /> {editingPage ? 'Güncelle' : 'Kaydet'}
                </button>
              </div>
            </h2>
            <form onSubmit={handleSavePage} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="f-label">Sayfa Başlığı</label>
                <input
                  type="text"
                  className="f-input"
                  placeholder="Örn: Espresso Makinesi Temizlik Talimatı"
                  value={pageForm.title}
                  onChange={e => setPageForm(prev => ({ ...prev, title: e.target.value }))}
                />
              </div>

              <div>
                <label className="f-label">
                  {isUrunler
                    ? 'Ürün Seçiniz'
                    : isHammaddeler
                    ? 'Sistemden Hammadde Bağla (Zorunlu)'
                    : 'Sistemden Ürün/Hammadde Bağla (İsteğe Bağlı)'}
                </label>
                <div className="sel-wrap">
                  <select
                    className="f-input"
                    value={pageForm.linked_item_id ? `${pageForm.linked_item_type}::${pageForm.linked_item_id}` : '::'}
                    onChange={async (e) => {
                      const val = e.target.value;
                      if (!val || val === '::') {
                        setPageForm(prev => ({ ...prev, linked_item_id: '', linked_item_type: '' }));
                        setRecipeContext([]);
                      } else {
                        const [type, id] = val.split('::');
                        
                        // Always copy the name from the selected item into title field
                        const selectedItem = systemItems.find(i => i.id === id);
                        const newTitle = selectedItem ? selectedItem.name : '';

                        setPageForm(prev => ({ 
                          ...prev, 
                          title: newTitle || prev.title,
                          linked_item_id: id, 
                          linked_item_type: type 
                        }));

                        // Fetch recipe dynamically
                        try {
                          const ctxRes = await fetch(buildApiUrl(`/api/manual/context-by-item?linked_item_id=${id}&linked_item_type=${type}`)).then(r => r.json());
                          setRecipeContext(ctxRes.data?.recipe || []);
                          setRecipeMeta({
                            portionNames: ctxRes.data?.portionNames || { '__standart__': 'Standart' },
                            allChannels: ctxRes.data?.allChannels || []
                          });
                        } catch (err) {
                          console.error('Recipe fetch error', err);
                        }

                        // Intelligent Auto-Fill for Hammaddeler
                        if (isHammaddeler) {
                          try {
                            if (type === 'stock_item') {
                              const { data: stockItem, error } = await db.from('stock_items').select('*').eq('id', id).single();
                              if (stockItem && !error) {
                                const erpCode = stockItem.sku || stockItem.acc_code || '';
                                // Ölçü birimi (ml, litre, kg vb.)
                                const measureUnit = stockItem.unit || '';
                                // Sipariş birimi - 'ana' ise ölçü birimini kullan
                                const orderUnitRaw = stockItem.order_unit || 'ana';
                                const orderUnit = orderUnitRaw === 'ana' ? measureUnit : orderUnitRaw;
                                // Min/max sipariş miktarı
                                const minOrderQty = stockItem.min_order ? String(stockItem.min_order) : '';
                                const maxStackQty = stockItem.max_order ? String(stockItem.max_order) : '';
                                // Kritik stok seviyesi
                                const criticalStock = stockItem.min_stock != null ? String(stockItem.min_stock) : '';

                                // Kategori - en derin seviyeyi kullan
                                let subcatName = '';
                                const deepestCatId = stockItem.cat_l5 || stockItem.cat_l4 || stockItem.cat_l3 || stockItem.cat_l2 || stockItem.cat_l1;
                                if (deepestCatId) {
                                  const { data: catData } = await db.from('categories').select('name').eq('id', deepestCatId).single();
                                  if (catData) subcatName = catData.name;
                                }

                                // Tedarikçi isimleri
                                let supplierNames = '';
                                if (stockItem.suppliers_list && stockItem.suppliers_list.length > 0) {
                                  const supplierIds = stockItem.suppliers_list.map(s => s.supp_id || s.id).filter(Boolean);
                                  if (supplierIds.length > 0) {
                                    const { data: sups } = await db.from('suppliers').select('name').in('id', supplierIds);
                                    if (sups && sups.length > 0) {
                                      supplierNames = sups.map(s => s.name).join(', ');
                                    }
                                  }
                                } else if (stockItem.supp_id) {
                                  const { data: sup } = await db.from('suppliers').select('name').eq('id', stockItem.supp_id).single();
                                  if (sup) supplierNames = sup.name;
                                }

                                const photoUrl = stockItem.image_url || '';

                                setPageForm(prev => ({
                                  ...prev,
                                  title: stockItem.name || prev.title,
                                  metadata: {
                                    ...prev.metadata,
                                    erp_code: erpCode,
                                    packaging_qty: '',
                                    order_unit: orderUnit,
                                    min_order_qty: minOrderQty,
                                    max_stack_qty: maxStackQty,
                                    critical_stock_level: criticalStock,
                                    subcategory: subcatName,
                                    approved_suppliers: supplierNames,
                                    ideal_product_photo: photoUrl || prev.metadata.ideal_product_photo || ''
                                  }
                                }));
                                toast('Stok kartı bilgileri otomatik aktarıldı.', 'success');
                              }
                            } else if (type === 'semi_product') {
                              const { data: semiItem, error } = await db.from('semi_items').select('*').eq('id', id).single();
                              if (semiItem && !error) {
                                const erpCode = semiItem.sku || semiItem.acc_code || '';
                                let subcatName = '';
                                if (semiItem.sale_cat_l1) {
                                  const { data: catData } = await db.from('semi_categories').select('name').eq('id', semiItem.sale_cat_l1).single();
                                  if (catData) subcatName = catData.name;
                                }
                                const photoUrl = semiItem.image_url || semiItem.pos_image || semiItem.channel_image || '';

                                setPageForm(prev => ({
                                  ...prev,
                                  title: semiItem.name || prev.title,
                                  metadata: {
                                    ...prev.metadata,
                                    erp_code: erpCode,
                                    subcategory: subcatName,
                                    approved_suppliers: 'İç Üretim / Şube',
                                    ideal_product_photo: photoUrl || prev.metadata.ideal_product_photo || ''
                                  }
                                }));
                                toast('Yarı mamul kartı bilgileri otomatik aktarıldı.', 'success');
                              }
                            }
                          } catch (err) {
                            console.error('Auto-fill query failed:', err);
                          }
                        }
                      }
                    }}
                  >
                    <option value="::">
                      {isUrunler
                        ? '-- Satış Ürünü Seçiniz --'
                        : isHammaddeler
                        ? '-- Lütfen bir Hammadde Seçiniz (Zorunlu) --'
                        : '-- Bağımsız Sayfa (Sistem Bağlantısı Yok) --'}
                    </option>
                    {systemItems
                      .filter(item => {
                        if (isUrunler) return item.type === 'sale_item';
                        if (isHammaddeler) return item.type === 'stock_item';
                        return true;
                      })
                      .map(item => (
                      <option key={`${item.type}::${item.id}`} value={`${item.type}::${item.id}`}>
                        [{item.typeName}] {item.name}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="f-hint">
                  {isHammaddeler
                    ? 'Hammadde bağlanması zorunludur. Seçilen hammaddenin resim, SKU, tedarikçi ve kategori bilgileri otomatik aktarılır.'
                    : 'Ürün bağlanırsa, reçetesi el kitabında otomatik listelenir.'}
                </p>
              </div>

              {!isUrunler && recipeContext.length > 0 && (
                <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 8, border: '1px solid var(--border)' }}>
                  <h4 className="text-primary" style={{ margin: '0 0 8px', fontSize: '.9rem' }}>
                    <i className="fa-solid fa-list-check" style={{ marginRight: 6 }}/>
                    Bu Ürünün Reçetesi (Otomatik Bağlı)
                  </h4>
                  <ul style={{ margin: 0, paddingLeft: 20, fontSize: '.8rem', color: 'var(--text-secondary)' }}>
                    {recipeContext.map((r, i) => (
                      <li key={i}>
                        <span style={{ fontWeight: 600 }}>{r.name}</span> - {r.qty} {r.unit}
                        {r.linked_page_id && <span style={{ marginLeft: 8, color: 'var(--accent-primary)', fontSize: '.7rem' }}><i className="fa-solid fa-link" /> El Kitabı Var</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {isUrunler ? (
                <>
                  <div>
                    <label className="f-label">Ürün Resmi Yükleyin</label>
                    <div style={{ background: 'var(--surface-2)', border: '1.5px dashed var(--border)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {/* Kural bilgisi */}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: '.68rem', color: 'var(--text-muted)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '2px 8px' }}>
                          <i className="fa-solid fa-crop" style={{ fontSize: '.55rem', color: '#f59e0b' }} />
                          En-Boy: <strong style={{ color: 'var(--text-strong)' }}>16:9</strong>
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '2px 8px' }}>
                          <i className="fa-solid fa-compress" style={{ fontSize: '.55rem', color: '#6366f1' }} />
                          Maks: <strong style={{ color: 'var(--text-strong)' }}>1200px</strong>
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '2px 8px' }}>
                          <i className="fa-solid fa-wand-magic-sparkles" style={{ fontSize: '.55rem', color: '#10b981' }} />
                          Akıllı kırpma otomatik uygulanır
                        </span>
                      </div>
                      <label style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, width: 'fit-content' }}>
                        <span className="btn-o" style={{ fontSize: '.8rem', padding: '7px 14px', margin: 0 }}>
                          <i className="fa-solid fa-cloud-arrow-up" style={{ marginRight: 5 }} />
                          Resim Seç
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={async (e) => {
                            const file = e.target.files[0];
                            if (!file) return;
                            try {
                              toast('Resim işleniyor...', 'info');
                              const url = await uploadImage(file, 16 / 9);
                              setPageForm(prev => ({
                                ...prev,
                                metadata: { ...prev.metadata, product_image: url }
                              }));
                              toast('Ürün resmi yüklendi (16:9)', 'success');
                            } catch (err) {
                              toast('Resim yüklenemedi: ' + err.message, 'error');
                            }
                          }}
                        />
                      </label>
                      {pageForm.metadata?.product_image && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          <div style={{ position: 'relative', aspectRatio: '16/9', width: 160, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
                            <img src={resolveImageUrl(pageForm.metadata.product_image)} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                            <div style={{ position: 'absolute', top: 4, left: 4, background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: '.5rem', fontWeight: 700, padding: '1px 5px', borderRadius: 4 }}>16:9</div>
                          </div>
                          <button type="button" className="ico-btn del" style={{ marginTop: 4 }}
                            onClick={() => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, product_image: '' } }))}>
                            <i className="fa-solid fa-trash" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Ürün Hikayesi / Açıklaması */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <label className="f-label" style={{ margin: 0 }}>Ürün Hikayesi / Açıklaması</label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          className="btn-o"
                          style={{ padding: '2px 8px', fontSize: '.68rem', display: 'flex', alignItems: 'center', gap: 4, height: 24 }}
                          onClick={() => handleInsertFormat('editor-page-description', '- ', (val) => {
                            setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, description: val } }));
                          })}
                          title="Madde İşareti Ekle"
                        >
                          <i className="fa-solid fa-list-ul" /> Liste
                        </button>
                        <button
                          type="button"
                          className="btn-o"
                          style={{ padding: '2px 8px', fontSize: '.68rem', display: 'flex', alignItems: 'center', gap: 4, height: 24 }}
                          onClick={() => handleInsertFormat('editor-page-description', '1. ', (val) => {
                            setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, description: val } }));
                          })}
                          title="Numaralı Liste Ekle"
                        >
                          <i className="fa-solid fa-list-ol" /> Numaralandırma
                        </button>
                      </div>
                    </div>
                    <textarea
                      id="editor-page-description"
                      className="f-input"
                      rows={3}
                      style={{ resize: 'vertical', fontSize: '.84rem', lineHeight: '1.5' }}
                      value={pageForm.metadata?.description || ''}
                      onChange={(e) => setPageForm(prev => ({
                        ...prev,
                        metadata: { ...prev.metadata, description: e.target.value }
                      }))}
                      placeholder="Ürünün hikayesini, kökenini veya öne çıkan lezzet sırlarını buraya yazın..."
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <label className="f-label" style={{ margin: 0 }}>Ürün Hazırlığı Adımları</label>
                      <button 
                        type="button" 
                        className="btn-p" 
                        style={{ padding: '4px 10px', fontSize: '.75rem' }}
                        onClick={() => {
                          setPageForm(prev => ({
                            ...prev,
                            metadata: {
                              ...prev.metadata,
                              steps: [...(prev.metadata?.steps || []), { description: '', imageUrl: '' }]
                            }
                          }))
                        }}
                      >
                        <i className="fa-solid fa-plus" /> Adım Ekle
                      </button>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {pageForm.metadata?.steps?.map((step, index) => (
                        <div key={index} style={{ border: '1px solid var(--border)', padding: 12, borderRadius: 8, position: 'relative' }}>
                          <button 
                            type="button"
                            className="ico-btn del"
                            style={{ position: 'absolute', top: 8, right: 8 }}
                            onClick={() => {
                              const newSteps = [...pageForm.metadata.steps];
                              newSteps.splice(index, 1);
                              setPageForm(prev => ({
                                ...prev,
                                metadata: { ...prev.metadata, steps: newSteps }
                              }));
                            }}
                          >
                            <i className="fa-solid fa-xmark" />
                          </button>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <h5 style={{ margin: 0, fontSize: '.85rem' }}>{index + 1}. Adım</h5>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                type="button"
                                className="btn-o"
                                style={{ padding: '2px 8px', fontSize: '.68rem', display: 'flex', alignItems: 'center', gap: 4, height: 24 }}
                                onClick={() => handleInsertFormat(`editor-step-${index}`, '- ', (val) => {
                                  const newSteps = [...pageForm.metadata.steps];
                                  newSteps[index].description = val;
                                  setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, steps: newSteps } }));
                                })}
                                title="Madde İşareti Ekle"
                              >
                                <i className="fa-solid fa-list-ul" /> Liste
                              </button>
                              <button
                                type="button"
                                className="btn-o"
                                style={{ padding: '2px 8px', fontSize: '.68rem', display: 'flex', alignItems: 'center', gap: 4, height: 24 }}
                                onClick={() => handleInsertFormat(`editor-step-${index}`, '1. ', (val) => {
                                  const newSteps = [...pageForm.metadata.steps];
                                  newSteps[index].description = val;
                                  setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, steps: newSteps } }));
                                })}
                                title="Numaralı Liste Ekle"
                              >
                                <i className="fa-solid fa-list-ol" /> Numaralandırma
                              </button>
                            </div>
                          </div>
                          <textarea
                            id={`editor-step-${index}`}
                            className="f-input"
                            rows={2}
                            placeholder="Bu adımda ne yapılması gerektiğini açıklayın..."
                            value={step.description}
                            onChange={(e) => {
                              const newSteps = [...pageForm.metadata.steps];
                              newSteps[index].description = e.target.value;
                              setPageForm(prev => ({
                                ...prev,
                                metadata: { ...prev.metadata, steps: newSteps }
                              }));
                            }}
                            style={{ marginBottom: 8 }}
                          />
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                            <label style={{ cursor: 'pointer' }}>
                              <span className="btn-o" style={{ fontSize: '.72rem', padding: '5px 10px' }}>
                                <i className="fa-solid fa-camera" style={{ marginRight: 4 }} />
                                Adım Resmi (4:3)
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={async (e) => {
                                  const file = e.target.files[0];
                                  if (!file) return;
                                  try {
                                    const url = await uploadImage(file, 4 / 3);
                                    const newSteps = [...pageForm.metadata.steps];
                                    newSteps[index].imageUrl = url;
                                    setPageForm(prev => ({
                                      ...prev,
                                      metadata: { ...prev.metadata, steps: newSteps }
                                    }));
                                    toast('Adım resmi yüklendi (4:3)', 'success');
                                  } catch (err) {
                                    toast('Resim yüklenemedi: ' + err.message, 'error');
                                  }
                                }}
                              />
                            </label>
                            {step.imageUrl && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ position: 'relative', aspectRatio: '4/3', height: 60, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
                                  <img src={resolveImageUrl(step.imageUrl)} alt={`Adım ${index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                  <div style={{ position: 'absolute', top: 2, left: 2, background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: '.45rem', fontWeight: 700, padding: '1px 4px', borderRadius: 3 }}>4:3</div>
                                </div>
                                <button type="button" className="ico-btn del" style={{ padding: '4px 6px' }}
                                  onClick={() => {
                                    const newSteps = [...pageForm.metadata.steps];
                                    newSteps[index].imageUrl = '';
                                    setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, steps: newSteps } }));
                                  }}>
                                  <i className="fa-solid fa-xmark" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Görsel Karşılaştırma Rehberleri - Ürünler */}
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, background: 'var(--surface-2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <h3 style={{ margin: 0, fontSize: '.9rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent-primary)' }}>
                        <i className="fa-solid fa-images" /> Görsel Karşılaştırma Rehberleri
                      </h3>
                      <button type="button" className="btn-p" style={{ padding: '4px 10px', fontSize: '.75rem' }}
                        onClick={() => {
                          const comps = pageForm.metadata?.visual_comparisons || [];
                          setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, visual_comparisons: [...comps, { id: Date.now(), title: '', description: '', correct_image: '', wrong_image: '' }] } }));
                        }}>
                        <i className="fa-solid fa-plus" /> Rehber Ekle
                      </button>
                    </div>
                    {(pageForm.metadata?.visual_comparisons || []).length === 0 && (
                      <p style={{ fontSize: '.72rem', color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>
                        Hazırlık veya servis standardı görsel rehberleri ekleyin. Örn: Porsiyon büyüklüğü, sosun konumu, tabak sunumu...
                      </p>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
                      {(pageForm.metadata?.visual_comparisons || []).map((comp, idx) => (
                        <div key={comp.id || idx} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, position: 'relative', background: 'var(--surface)' }}>
                          <button type="button" className="ico-btn del" style={{ position: 'absolute', top: 8, right: 8, padding: '2px 6px', fontSize: '.65rem' }}
                            onClick={() => {
                              const comps = [...(pageForm.metadata?.visual_comparisons || [])];
                              comps.splice(idx, 1);
                              setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, visual_comparisons: comps } }));
                            }}><i className="fa-solid fa-xmark" /></button>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, paddingRight: 30 }}>
                            <i className="fa-solid fa-grip-vertical" style={{ color: 'var(--text-muted)', fontSize: '.7rem' }} />
                            <input type="text" className="f-input" style={{ flex: 1 }} placeholder="Rehber Başlığı (Örn: Servis Porsiyon Standardı)" value={comp.title}
                              onChange={e => {
                                const comps = [...(pageForm.metadata?.visual_comparisons || [])];
                                comps[idx] = { ...comps[idx], title: e.target.value };
                                setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, visual_comparisons: comps } }));
                              }} />
                          </div>
                          <input type="text" className="f-input" style={{ marginBottom: 10, fontSize: '.8rem' }} placeholder="Açıklama (Örn: Tabak üzerine 3 adet olmalı, ekmek soldaki pozisyonda)" value={comp.description}
                            onChange={e => {
                              const comps = [...(pageForm.metadata?.visual_comparisons || [])];
                              comps[idx] = { ...comps[idx], description: e.target.value };
                              setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, visual_comparisons: comps } }));
                            }} />
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div>
                              <label className="f-label" style={{ color: '#10b981', marginBottom: 6 }}><i className="fa-solid fa-circle-check" style={{ marginRight: 4 }} />DOĞRU / UYGUN</label>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <label style={{ cursor: 'pointer', flexShrink: 0 }}>
                                  <span className="btn-o" style={{ fontSize: '.72rem', padding: '5px 8px', borderColor: '#10b981', color: '#10b981' }}>
                                    <i className="fa-solid fa-cloud-arrow-up" /> Yükle (4:3)
                                  </span>
                                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => {
                                    const file = e.target.files?.[0]; if (!file) return;
                                    try {
                                      toast('İşleniyor...', 'info');
                                      const url = await uploadImage(file, 4 / 3);
                                      const comps = [...(pageForm.metadata?.visual_comparisons || [])];
                                      comps[idx] = { ...comps[idx], correct_image: url };
                                      setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, visual_comparisons: comps } }));
                                      toast('Görsel yüklendi', 'success');
                                    } catch(err) { toast('Hata: ' + err.message, 'error') }
                                  }} />
                                </label>
                                {comp.correct_image && (
                                  <div style={{ position: 'relative', border: '2px solid #10b981', borderRadius: 6, width: 100, height: 75, overflow: 'hidden', flexShrink: 0 }}>
                                    <img src={resolveImageUrl(comp.correct_image)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Correct" />
                                    <div style={{ position: 'absolute', top: 2, left: 2, background: 'rgba(16,185,129,.9)', color: '#fff', fontSize: '.4rem', fontWeight: 700, padding: '1px 3px', borderRadius: 3 }}>DOĞRU</div>
                                    <button type="button" className="ico-btn del" style={{ position: 'absolute', top: 2, right: 2, padding: '1px 3px', fontSize: '.6rem' }}
                                      onClick={() => { const comps=[...(pageForm.metadata?.visual_comparisons||[])]; comps[idx]={...comps[idx],correct_image:''}; setPageForm(prev=>({...prev,metadata:{...prev.metadata,visual_comparisons:comps}})); }}>
                                      <i className="fa-solid fa-xmark" /></button>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div>
                              <label className="f-label" style={{ color: '#ef4444', marginBottom: 6 }}><i className="fa-solid fa-circle-xmark" style={{ marginRight: 4 }} />YANLIŞ / RED</label>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                <label style={{ cursor: 'pointer', flexShrink: 0 }}>
                                  <span className="btn-o" style={{ fontSize: '.72rem', padding: '5px 8px', borderColor: '#ef4444', color: '#ef4444' }}>
                                    <i className="fa-solid fa-cloud-arrow-up" /> Yükle (4:3)
                                  </span>
                                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => {
                                    const file = e.target.files?.[0]; if (!file) return;
                                    try {
                                      toast('İşleniyor...', 'info');
                                      const url = await uploadImage(file, 4 / 3);
                                      const comps = [...(pageForm.metadata?.visual_comparisons || [])];
                                      comps[idx] = { ...comps[idx], wrong_image: url };
                                      setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, visual_comparisons: comps } }));
                                      toast('Görsel yüklendi', 'success');
                                    } catch(err) { toast('Hata: ' + err.message, 'error') }
                                  }} />
                                </label>
                                {comp.wrong_image && (
                                  <div style={{ position: 'relative', border: '2px solid #ef4444', borderRadius: 6, width: 100, height: 75, overflow: 'hidden', flexShrink: 0 }}>
                                    <img src={resolveImageUrl(comp.wrong_image)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Incorrect" />
                                    <div style={{ position: 'absolute', top: 2, left: 2, background: 'rgba(239,68,68,.9)', color: '#fff', fontSize: '.4rem', fontWeight: 700, padding: '1px 3px', borderRadius: 3 }}>YANLIŞ</div>
                                    <button type="button" className="ico-btn del" style={{ position: 'absolute', top: 2, right: 2, padding: '1px 3px', fontSize: '.6rem' }}
                                      onClick={() => { const comps=[...(pageForm.metadata?.visual_comparisons||[])]; comps[idx]={...comps[idx],wrong_image:''}; setPageForm(prev=>({...prev,metadata:{...prev.metadata,visual_comparisons:comps}})); }}>
                                      <i className="fa-solid fa-xmark" /></button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : isHammaddeler ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* 1. Kimlik ve Sistem Bilgileri */}
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, background: 'var(--surface-2)' }}>
                    <h3 style={{ fontSize: '.9rem', fontWeight: 700, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent-primary)' }}>
                      <i className="fa-solid fa-id-card" /> 1. Kimlik ve Sistem Bilgileri
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div>
                        <label className="f-label">Sistem / ERP Kodu</label>
                        <input type="text" className="f-input" value={pageForm.metadata?.erp_code || ''}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, erp_code: e.target.value } }))} placeholder="Örn: ERP-90812" />
                      </div>
                      <div>
                        <label className="f-label">Kategori</label>
                        <input type="text" className="f-input" value={pageForm.metadata?.subcategory || ''}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, subcategory: e.target.value } }))} placeholder="Örn: Unlu Mamuller / Donuk" />
                      </div>
                    </div>
                    <div style={{ marginTop: 12 }}>
                      <label className="f-label">Onaylı Tedarikçi(ler)</label>
                      <input type="text" className="f-input" value={pageForm.metadata?.approved_suppliers || ''}
                        onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, approved_suppliers: e.target.value } }))} placeholder="Örn: Lezita, Keskinoğlu" />
                    </div>
                  </div>

                  {/* 2. Sipariş ve Lojistik Dinamikleri */}
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, background: 'var(--surface-2)' }}>
                    <h3 style={{ fontSize: '.9rem', fontWeight: 700, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent-primary)' }}>
                      <i className="fa-solid fa-cart-flatbed" /> 2. Sipariş ve Lojistik Dinamikleri
                    </h3>
                    <p style={{ fontSize: '.72rem', color: 'var(--text-muted)', margin: '0 0 12px', fontStyle: 'italic' }}>Stok kartındaki bilgiler otomatik aktarılır. Şube bazlı değerler manuel girilebilir.</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
                      <div>
                        <label className="f-label">Sipariş Birimi</label>
                        <input type="text" className="f-input" value={pageForm.metadata?.order_unit || ''}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, order_unit: e.target.value } }))} placeholder="Örn: Koli, Adet, Kg" />
                      </div>
                      <div>
                        <label className="f-label">Minimum Sipariş Miktarı</label>
                        <input type="text" className="f-input" value={pageForm.metadata?.min_order_qty || ''}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, min_order_qty: e.target.value } }))} placeholder="Örn: 1 Koli (8 Adet)" />
                      </div>
                      <div>
                        <label className="f-label">Teslimat / Tedarik Süresi</label>
                        <input type="text" className="f-input" value={pageForm.metadata?.delivery_lead_time || ''}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, delivery_lead_time: e.target.value } }))} placeholder="Örn: 2 iş günü" />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                      <div>
                        <label className="f-label">Kritik Stok Seviyesi</label>
                        <input type="text" className="f-input" value={pageForm.metadata?.critical_stock_level || ''}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, critical_stock_level: e.target.value } }))} placeholder="Örn: 3 Kolinin altına düşme" />
                      </div>
                      <div>
                        <label className="f-label">Maksimum İstifleme</label>
                        <input type="text" className="f-input" value={pageForm.metadata?.max_stack_qty || ''}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, max_stack_qty: e.target.value } }))} placeholder="Örn: En fazla 5 koli" />
                      </div>
                      <div>
                        <label className="f-label">Depolama Lokasyonu</label>
                        <input type="text" className="f-input" value={pageForm.metadata?.storage_location || ''}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, storage_location: e.target.value } }))} placeholder="Örn: Donuk Depo - Raf 3" />
                      </div>
                    </div>
                  </div>

                  {/* 3. Fiziksel ve Görsel Spesifikasyonlar */}
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, background: 'var(--surface-2)' }}>
                    <h3 style={{ fontSize: '.9rem', fontWeight: 700, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent-primary)' }}>
                      <i className="fa-solid fa-ruler-combined" /> 3. Fiziksel ve Görsel Spesifikasyonlar
                    </h3>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                      <div style={{ flex: 1 }}>
                        <label className="f-label">Çap ve Yükseklik</label>
                        <input type="text" className="f-input" value={pageForm.metadata?.dimensions || ''}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, dimensions: e.target.value } }))} placeholder="Örn: Çap 10 cm ± 0.5 cm" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label className="f-label">Gramaj</label>
                        <input type="text" className="f-input" value={pageForm.metadata?.weight || ''}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, weight: e.target.value } }))} placeholder="Örn: 60 gr ± 2 gr" />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                      <div style={{ flex: 1 }}>
                        <label className="f-label">Tat - Koku</label>
                        <input type="text" className="f-input" value={pageForm.metadata?.slicing_standard || ''}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, slicing_standard: e.target.value } }))} placeholder="Örn: Tereyağı kokulu, hafif tuzlu" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label className="f-label">Doku ve Görünüm</label>
                        <input type="text" className="f-input" value={pageForm.metadata?.texture || ''}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, texture: e.target.value } }))} placeholder="Örn: Parlak kabuklu, gözenekli iç" />
                      </div>
                    </div>
                    
                    <div>
                      <label className="f-label">İdeal Ürün Fotoğrafı</label>
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                        <label style={{ cursor: 'pointer' }}>
                          <span className="btn-o" style={{ fontSize: '.78rem', padding: '6px 12px' }}>
                            <i className="fa-solid fa-cloud-arrow-up" style={{ marginRight: 5 }} /> Görsel Yükle (4:3)
                          </span>
                          <input type="file" accept="image/*" style={{ display: 'none' }}
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              try {
                                toast('Resim işleniyor...', 'info');
                                const url = await uploadImage(file, 4 / 3);
                                setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, ideal_product_photo: url } }));
                                toast('İdeal ürün görseli yüklendi', 'success');
                              } catch(err) {
                                toast('Resim yüklenemedi: ' + err.message, 'error');
                              }
                            }}
                          />
                        </label>
                        {pageForm.metadata?.ideal_product_photo && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 80, height: 60, borderRadius: 6, border: '1px solid var(--border)', overflow: 'hidden' }}>
                              <img src={resolveImageUrl(pageForm.metadata.ideal_product_photo)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Ideal" />
                            </div>
                            <button type="button" className="ico-btn del" onClick={() => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, ideal_product_photo: '' } }))}>
                              <i className="fa-solid fa-trash" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 4. Lojistik Kabul Kriterleri */}
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, background: 'var(--surface-2)' }}>
                    <h3 style={{ fontSize: '.9rem', fontWeight: 700, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent-primary)' }}>
                      <i className="fa-solid fa-truck" /> 4. Lojistik Kabul Kriterleri
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                      <div>
                        <label className="f-label">Sevkiyat Sıcaklığı</label>
                        <input type="text" className="f-input" value={pageForm.metadata?.delivery_temp || ''}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, delivery_temp: e.target.value } }))} placeholder="Örn: -18°C veya altı" />
                      </div>
                      <div>
                        <label className="f-label">Ambalajlama Düzeni</label>
                        <input type="text" className="f-input" value={pageForm.metadata?.packaging_qty || ''}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, packaging_qty: e.target.value } }))} placeholder="Örn: 8'li poşet, 6 poşet/koli" />
                      </div>
                      <div>
                        <label className="f-label">Kutu Kondisyonu</label>
                        <input type="text" className="f-input" value={pageForm.metadata?.box_condition || ''}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, box_condition: e.target.value } }))} placeholder="Örn: Ezilmemiş, ıslanmamış koli" />
                      </div>
                    </div>
                  </div>

                  {/* 5. Depolama ve Raf Ömrü */}
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, background: 'var(--surface-2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <h3 style={{ fontSize: '.9rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent-primary)' }}>
                        <i className="fa-solid fa-warehouse" /> 5. Depolama ve Raf Ömrü
                      </h3>
                      <button type="button" className="btn-p" style={{ padding: '4px 12px', fontSize: '.75rem' }}
                        onClick={() => {
                          const list = pageForm.metadata?.shelf_lives || [];
                          setPageForm(prev => ({
                            ...prev,
                            metadata: {
                              ...prev.metadata,
                              shelf_lives: [...list, { id: Date.now(), status: '', storage_area: '', duration: '' }]
                            }
                          }));
                        }}>
                        <i className="fa-solid fa-plus" /> Satır Ekle
                      </button>
                    </div>
                    
                    {(pageForm.metadata?.shelf_lives || []).length === 0 ? (
                      <p style={{ fontSize: '.72rem', color: 'var(--text-muted)', fontStyle: 'italic', margin: '10px 0' }}>
                        Henüz raf ömrü kriteri eklenmedi. Satır Ekle butonunu kullanın.
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {(pageForm.metadata?.shelf_lives || []).map((item, idx) => (
                          <div key={item.id || idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <div style={{ flex: 1.2 }}>
                              {idx === 0 && <label className="f-label" style={{ marginBottom: 4 }}>Durum</label>}
                              <input type="text" className="f-input" style={{ padding: '6px 10px', fontSize: '.78rem' }}
                                value={item.status || ''} placeholder="Durum (Örn: Kapalı)"
                                onChange={e => {
                                  const list = [...(pageForm.metadata?.shelf_lives || [])];
                                  list[idx] = { ...list[idx], status: e.target.value };
                                  setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, shelf_lives: list } }));
                                }} />
                            </div>
                            <div style={{ flex: 1.5 }}>
                              {idx === 0 && <label className="f-label" style={{ marginBottom: 4 }}>Saklama Alanı / Sıcaklığı</label>}
                              <input type="text" className="f-input" style={{ padding: '6px 10px', fontSize: '.78rem' }}
                                value={item.storage_area || ''} placeholder="Saklama Alanı (Örn: +4°C)"
                                onChange={e => {
                                  const list = [...(pageForm.metadata?.shelf_lives || [])];
                                  list[idx] = { ...list[idx], storage_area: e.target.value };
                                  setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, shelf_lives: list } }));
                                }} />
                            </div>
                            <div style={{ flex: 1.2 }}>
                              {idx === 0 && <label className="f-label" style={{ marginBottom: 4 }}>Raf Ömrü</label>}
                              <input type="text" className="f-input" style={{ padding: '6px 10px', fontSize: '.78rem' }}
                                value={item.duration || ''} placeholder="Raf Ömrü (Örn: 12 ay)"
                                onChange={e => {
                                  const list = [...(pageForm.metadata?.shelf_lives || [])];
                                  list[idx] = { ...list[idx], duration: e.target.value };
                                  setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, shelf_lives: list } }));
                                }} />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: idx === 0 ? 54 : 'auto' }}>
                              <button type="button" className="ico-btn del" style={{ padding: '6px 10px', fontSize: '.8rem' }}
                                onClick={() => {
                                  const list = [...(pageForm.metadata?.shelf_lives || [])];
                                  list.splice(idx, 1);
                                  setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, shelf_lives: list } }));
                                }}>
                                <i className="fa-solid fa-trash-can" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 6. Kullanıma Hazırlık */}
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, background: 'var(--surface-2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <h3 style={{ fontSize: '.9rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent-primary)' }}>
                        <i className="fa-solid fa-kitchen-set" /> Kullanıma Hazırlık
                      </h3>
                      <button 
                        type="button" 
                        className="btn-p" 
                        style={{ padding: '4px 10px', fontSize: '.75rem' }}
                        onClick={() => {
                          setPageForm(prev => ({
                            ...prev,
                            metadata: {
                              ...prev.metadata,
                              steps: [...(prev.metadata?.steps || []), { description: '', imageUrl: '' }]
                            }
                          }))
                        }}
                      >
                        <i className="fa-solid fa-plus" /> Adım Ekle
                      </button>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {(pageForm.metadata?.steps || []).map((step, index) => (
                        <div key={index} style={{ border: '1px solid var(--border)', padding: 12, borderRadius: 8, position: 'relative', background: 'var(--surface)' }}>
                          <button 
                            type="button"
                            className="ico-btn del"
                            style={{ position: 'absolute', top: 8, right: 8 }}
                            onClick={() => {
                              const newSteps = [...pageForm.metadata.steps];
                              newSteps.splice(index, 1);
                              setPageForm(prev => ({
                                ...prev,
                                metadata: { ...prev.metadata, steps: newSteps }
                              }));
                            }}
                          >
                            <i className="fa-solid fa-xmark" />
                          </button>

                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <h5 style={{ margin: 0, fontSize: '.85rem' }}>{index + 1}. Adım</h5>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button
                                type="button"
                                className="btn-o"
                                style={{ padding: '2px 8px', fontSize: '.68rem', display: 'flex', alignItems: 'center', gap: 4, height: 24 }}
                                onClick={() => handleInsertFormat(`editor-step-hammad-${index}`, '- ', (val) => {
                                  const newSteps = [...pageForm.metadata.steps];
                                  newSteps[index].description = val;
                                  setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, steps: newSteps } }));
                                })}
                                title="Madde İşareti Ekle"
                              >
                                <i className="fa-solid fa-list-ul" /> Liste
                              </button>
                              <button
                                type="button"
                                className="btn-o"
                                style={{ padding: '2px 8px', fontSize: '.68rem', display: 'flex', alignItems: 'center', gap: 4, height: 24 }}
                                onClick={() => handleInsertFormat(`editor-step-hammad-${index}`, '1. ', (val) => {
                                  const newSteps = [...pageForm.metadata.steps];
                                  newSteps[index].description = val;
                                  setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, steps: newSteps } }));
                                })}
                                title="Numaralı Liste Ekle"
                              >
                                <i className="fa-solid fa-list-ol" /> Numaralandırma
                              </button>
                            </div>
                          </div>
                          <textarea
                            id={`editor-step-hammad-${index}`}
                            className="f-input"
                            rows={2}
                            placeholder="Bu adımda ne yapılması gerektiğini açıklayın..."
                            value={step.description}
                            onChange={(e) => {
                              const newSteps = [...pageForm.metadata.steps];
                              newSteps[index].description = e.target.value;
                              setPageForm(prev => ({
                                ...prev,
                                metadata: { ...prev.metadata, steps: newSteps }
                              }));
                            }}
                            style={{ marginBottom: 8 }}
                          />
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                            <label style={{ cursor: 'pointer' }}>
                              <span className="btn-o" style={{ fontSize: '.72rem', padding: '5px 10px' }}>
                                <i className="fa-solid fa-camera" style={{ marginRight: 4 }} />
                                Adım Resmi (4:3)
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                style={{ display: 'none' }}
                                onChange={async (e) => {
                                  const file = e.target.files[0];
                                  if (!file) return;
                                  try {
                                    const url = await uploadImage(file, 4 / 3);
                                    const newSteps = [...pageForm.metadata.steps];
                                    newSteps[index].imageUrl = url;
                                    setPageForm(prev => ({
                                      ...prev,
                                      metadata: { ...prev.metadata, steps: newSteps }
                                    }));
                                    toast('Adım resmi yüklendi (4:3)', 'success');
                                  } catch (err) {
                                    toast('Resim yüklenemedi: ' + err.message, 'error');
                                  }
                                }}
                              />
                            </label>
                            {step.imageUrl && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ position: 'relative', aspectRatio: '4/3', height: 60, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)' }}>
                                  {step.imageUrl === '__default_check__' ? (
                                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ecfdf5' }}>
                                      <i className="fa-solid fa-circle-check" style={{ fontSize: '1.5rem', color: '#10b981' }} />
                                    </div>
                                  ) : (
                                    <img src={resolveImageUrl(step.imageUrl)} alt={`Adım ${index + 1}`} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                                  )}
                                  <div style={{ position: 'absolute', top: 2, left: 2, background: 'rgba(0,0,0,.55)', color: '#fff', fontSize: '.45rem', fontWeight: 700, padding: '1px 4px', borderRadius: 3 }}>4:3</div>
                                </div>
                                <button type="button" className="ico-btn del" style={{ padding: '4px 6px' }}
                                  onClick={() => {
                                    const newSteps = [...pageForm.metadata.steps];
                                    newSteps[index].imageUrl = '';
                                    setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, steps: newSteps } }));
                                  }}>
                                  <i className="fa-solid fa-xmark" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 6. Ek Depolama ve İstifleme Kuralları (Esnek) */}
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, background: 'var(--surface-2)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <h3 style={{ fontSize: '.9rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--accent-primary)' }}>
                        <i className="fa-solid fa-list-check" /> Ek Depolama ve İstifleme Kuralları (Esnek)
                      </h3>
                      <button 
                        type="button" 
                        className="btn-p" 
                        style={{ padding: '4px 10px', fontSize: '.75rem' }}
                        onClick={() => {
                          const customParams = pageForm.metadata?.custom_parameters || [];
                          setPageForm(prev => ({
                            ...prev,
                            metadata: {
                              ...prev.metadata,
                              custom_parameters: [...customParams, { label: '', value: '' }]
                            }
                          }));
                        }}
                      >
                        <i className="fa-solid fa-plus" /> Ekle
                      </button>
                    </div>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {(pageForm.metadata?.custom_parameters || []).map((param, index) => (
                        <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                          <input
                            type="text"
                            className="f-input"
                            style={{ flex: 1 }}
                            placeholder="Başlık (Örn: İstifleme Limiti)"
                            value={param.label}
                            onChange={(e) => {
                              const newParams = [...pageForm.metadata.custom_parameters];
                              newParams[index].label = e.target.value;
                              setPageForm(prev => ({
                                ...prev,
                                metadata: { ...prev.metadata, custom_parameters: newParams }
                              }));
                            }}
                          />
                          <input
                            type="text"
                            className="f-input"
                            style={{ flex: 1.5 }}
                            placeholder="Değer (Örn: En fazla 5 koli koyulur)"
                            value={param.value}
                            onChange={(e) => {
                              const newParams = [...pageForm.metadata.custom_parameters];
                              newParams[index].value = e.target.value;
                              setPageForm(prev => ({
                                ...prev,
                                metadata: { ...prev.metadata, custom_parameters: newParams }
                              }));
                            }}
                          />
                          <button 
                            type="button"
                            className="ico-btn del"
                            onClick={() => {
                              const newParams = [...pageForm.metadata.custom_parameters];
                              newParams.splice(index, 1);
                              setPageForm(prev => ({
                                ...prev,
                                metadata: { ...prev.metadata, custom_parameters: newParams }
                              }));
                            }}
                          >
                            <i className="fa-solid fa-trash" />
                          </button>
                        </div>
                      ))}
                      {(pageForm.metadata?.custom_parameters || []).length === 0 && (
                        <span style={{ fontSize: '.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Kayıtlı esnek kural bulunmuyor.</span>
                      )}
                    </div>
                  </div>

                  {/* 7. Kusur Tanımları ve Red Kriterleri */}
                  <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 16, background: 'var(--surface-2)' }}>
                    <h3 style={{ fontSize: '.9rem', fontWeight: 700, margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6, color: '#ef4444' }}>
                      <i className="fa-solid fa-triangle-exclamation" /> 7. Kusur Tanımları ve Red Kriterleri
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                      <div>
                        <label className="f-label">Lojistik Kaynaklı Kusurlar (Ezilme, Islanma, Yırtılma)</label>
                        <textarea className="f-input" rows={2} value={pageForm.metadata?.rejection_logistics || ''}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, rejection_logistics: e.target.value } }))} placeholder="Örn: Yırtık veya ıslanmış koliler kesinlikle teslim alınmaz." />
                      </div>
                      <div>
                        <label className="f-label">Kesim ve Form Kusurları (Yamuk kesim, ezik ebat)</label>
                        <textarea className="f-input" rows={2} value={pageForm.metadata?.rejection_cutting || ''}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, rejection_cutting: e.target.value } }))} placeholder="Örn: Kesimi ortalanmamış, alt tabanı kopmuş ekmekler elenir." />
                      </div>
                      <div>
                        <label className="f-label">Soğuk Zincir ve Nem Kusurları (Buzlanma, yapışkanlık)</label>
                        <textarea className="f-input" rows={2} value={pageForm.metadata?.rejection_cold_chain || ''}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, rejection_cold_chain: e.target.value } }))} placeholder="Örn: Üzerinde buz kristalleri oluşmuş donuk ürünler reddedilir." />
                      </div>
                      <div>
                        <label className="f-label">Görsel ve Renk Kusurları (Koyu renk, şekilsizlik)</label>
                        <textarea className="f-input" rows={2} value={pageForm.metadata?.rejection_visual || ''}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, rejection_visual: e.target.value } }))} placeholder="Örn: Üzeri yanmış veya aşırı beyaz kalmış ekmekler elenir." />
                      </div>
                    </div>

                    {/* Görsel Karşılaştırma Rehberleri - Dinamik */}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <h4 style={{ margin: 0, fontSize: '.84rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <i className="fa-solid fa-images" style={{ color: '#6366f1' }} /> Görsel Karşılaştırma Rehberleri
                        </h4>
                        <button type="button" className="btn-p" style={{ padding: '4px 10px', fontSize: '.75rem' }}
                          onClick={() => {
                            const comps = pageForm.metadata?.visual_comparisons || [];
                            setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, visual_comparisons: [...comps, { id: Date.now(), title: '', description: '', correct_image: '', wrong_image: '' }] } }));
                          }}>
                          <i className="fa-solid fa-plus" /> Rehber Ekle
                        </button>
                      </div>
                      {(pageForm.metadata?.visual_comparisons || []).length === 0 && (
                        <p style={{ fontSize: '.72rem', color: 'var(--text-muted)', fontStyle: 'italic', margin: 0 }}>
                          Henüz görsel karşılaştırma eklenmedi. Örn: Karamelizasyon, Tat - koku standardı, Porsiyon kontrolü...
                        </p>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
                        {(pageForm.metadata?.visual_comparisons || []).map((comp, idx) => (
                          <div key={comp.id || idx} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, position: 'relative', background: 'var(--surface)' }}>
                            <button type="button" className="ico-btn del" style={{ position: 'absolute', top: 8, right: 8, padding: '2px 6px', fontSize: '.65rem' }}
                              onClick={() => {
                                const comps = [...(pageForm.metadata?.visual_comparisons || [])];
                                comps.splice(idx, 1);
                                setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, visual_comparisons: comps } }));
                              }}><i className="fa-solid fa-xmark" /></button>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, paddingRight: 30 }}>
                              <i className="fa-solid fa-grip-vertical" style={{ color: 'var(--text-muted)', fontSize: '.7rem' }} />
                              <input type="text" className="f-input" style={{ flex: 1 }} placeholder="Rehber Başlığı (Örn: Karamelizasyon Standardı, Kesim Kontrolü)" value={comp.title}
                                onChange={e => {
                                  const comps = [...(pageForm.metadata?.visual_comparisons || [])];
                                  comps[idx] = { ...comps[idx], title: e.target.value };
                                  setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, visual_comparisons: comps } }));
                                }} />
                            </div>
                            <input type="text" className="f-input" style={{ marginBottom: 10, fontSize: '.8rem' }} placeholder="Açıklama (Örn: Tost makinesi çıkışı renk eşiği)" value={comp.description}
                              onChange={e => {
                                const comps = [...(pageForm.metadata?.visual_comparisons || [])];
                                comps[idx] = { ...comps[idx], description: e.target.value };
                                setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, visual_comparisons: comps } }));
                              }} />
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                              <div>
                                <label className="f-label" style={{ color: '#10b981', marginBottom: 6 }}><i className="fa-solid fa-circle-check" style={{ marginRight: 4 }} />DOĞRU / UYGUN</label>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                  <label style={{ cursor: 'pointer', flexShrink: 0 }}>
                                    <span className="btn-o" style={{ fontSize: '.72rem', padding: '5px 8px', borderColor: '#10b981', color: '#10b981' }}>
                                      <i className="fa-solid fa-cloud-arrow-up" /> Yükle (4:3)
                                    </span>
                                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => {
                                      const file = e.target.files?.[0]; if (!file) return;
                                      try {
                                        toast('İşleniyor...', 'info');
                                        const url = await uploadImage(file, 4 / 3);
                                        const comps = [...(pageForm.metadata?.visual_comparisons || [])];
                                        comps[idx] = { ...comps[idx], correct_image: url };
                                        setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, visual_comparisons: comps } }));
                                        toast('Görsel yüklendi', 'success');
                                      } catch(err) { toast('Hata: ' + err.message, 'error') }
                                    }} />
                                  </label>
                                  {comp.correct_image && (
                                    <div style={{ position: 'relative', border: '2px solid #10b981', borderRadius: 6, width: 100, height: 75, overflow: 'hidden', flexShrink: 0 }}>
                                      <img src={resolveImageUrl(comp.correct_image)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Correct" />
                                      <div style={{ position: 'absolute', top: 2, left: 2, background: 'rgba(16,185,129,.9)', color: '#fff', fontSize: '.4rem', fontWeight: 700, padding: '1px 3px', borderRadius: 3 }}>DOĞRU</div>
                                      <button type="button" className="ico-btn del" style={{ position: 'absolute', top: 2, right: 2, padding: '1px 3px', fontSize: '.6rem' }}
                                        onClick={() => { const comps=[...(pageForm.metadata?.visual_comparisons||[])]; comps[idx]={...comps[idx],correct_image:''}; setPageForm(prev=>({...prev,metadata:{...prev.metadata,visual_comparisons:comps}})); }}>
                                        <i className="fa-solid fa-xmark" /></button>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div>
                                <label className="f-label" style={{ color: '#ef4444', marginBottom: 6 }}><i className="fa-solid fa-circle-xmark" style={{ marginRight: 4 }} />YANLIŞ / RED</label>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                  <label style={{ cursor: 'pointer', flexShrink: 0 }}>
                                    <span className="btn-o" style={{ fontSize: '.72rem', padding: '5px 8px', borderColor: '#ef4444', color: '#ef4444' }}>
                                      <i className="fa-solid fa-cloud-arrow-up" /> Yükle (4:3)
                                    </span>
                                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async (e) => {
                                      const file = e.target.files?.[0]; if (!file) return;
                                      try {
                                        toast('İşleniyor...', 'info');
                                        const url = await uploadImage(file, 4 / 3);
                                        const comps = [...(pageForm.metadata?.visual_comparisons || [])];
                                        comps[idx] = { ...comps[idx], wrong_image: url };
                                        setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, visual_comparisons: comps } }));
                                        toast('Görsel yüklendi', 'success');
                                      } catch(err) { toast('Hata: ' + err.message, 'error') }
                                    }} />
                                  </label>
                                  {comp.wrong_image && (
                                    <div style={{ position: 'relative', border: '2px solid #ef4444', borderRadius: 6, width: 100, height: 75, overflow: 'hidden', flexShrink: 0 }}>
                                      <img src={resolveImageUrl(comp.wrong_image)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Incorrect" />
                                      <div style={{ position: 'absolute', top: 2, left: 2, background: 'rgba(239,68,68,.9)', color: '#fff', fontSize: '.4rem', fontWeight: 700, padding: '1px 3px', borderRadius: 3 }}>YANLIŞ</div>
                                      <button type="button" className="ico-btn del" style={{ position: 'absolute', top: 2, right: 2, padding: '1px 3px', fontSize: '.6rem' }}
                                        onClick={() => { const comps=[...(pageForm.metadata?.visual_comparisons||[])]; comps[idx]={...comps[idx],wrong_image:''}; setPageForm(prev=>({...prev,metadata:{...prev.metadata,visual_comparisons:comps}})); }}>
                                        <i className="fa-solid fa-xmark" /></button>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                </div>
              ) : (
                <div>
                  <label className="f-label">Prosedür İçeriği (Markdown Desteklenir)</label>
                  <textarea
                    className="f-input"
                    rows={8}
                    placeholder="# Başlık&#10;1. Adım 1&#10;2. Adım 2&#10;&#10;**Önemli**: Güvenlik kurallarına uyun."
                    style={{ fontFamily: 'monospace', fontSize: '.8rem', resize: 'vertical' }}
                    value={pageForm.content}
                    onChange={e => setPageForm(prev => ({ ...prev, content: e.target.value }))}
                  />
                </div>
              )}

              {/* Collapsible Operations & Shelf Life Details */}
              <div style={{ border: '1.5px solid #cbd5e1', borderRadius: 10, overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => setShowOpsDetails(!showOpsDetails)}
                  style={{
                    width: '100%',
                    padding: '12px 16px',
                    background: 'var(--surface-2)',
                    border: 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    fontWeight: 700,
                    fontSize: '.85rem',
                    color: 'var(--text-strong)'
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className="fa-solid fa-clock-rotate-left" style={{ color: 'var(--accent-primary)' }} />
                    Mutfak Operasyon Detayları ve Raf Ömrü (İsteğe Bağlı)
                  </span>
                  <i className={`fa-solid fa-chevron-${showOpsDetails ? 'up' : 'down'}`} style={{ opacity: 0.5 }} />
                </button>
                
                {showOpsDetails && (
                  <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16, background: '#fff', borderTop: '1px solid var(--border)' }}>
                    {/* Custom Specs (Operation Details) */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                      {/* SPEC 1 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <input
                          type="text"
                          className="f-input"
                          placeholder="Özellik Başlığı 1"
                          value={pageForm.metadata?.spec_1_label !== undefined ? pageForm.metadata.spec_1_label : (pageForm.metadata?.prep_time_label || 'Hazırlanma Süresi')}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, spec_1_label: e.target.value } }))}
                          style={{ fontSize: '.68rem', fontWeight: 700, padding: '4px 8px', background: 'var(--surface-2)', color: 'var(--accent-primary)', border: '1.5px solid var(--accent-primary)', borderRadius: 7, opacity: .85 }}
                          title="Bu alanın başlığını özelleştir"
                        />
                        <input
                          type="text"
                          className="f-input"
                          placeholder="Örn: 5 dk"
                          value={pageForm.metadata?.spec_1_val !== undefined ? pageForm.metadata.spec_1_val : (pageForm.metadata?.prep_time || '')}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, spec_1_val: e.target.value } }))}
                        />
                        <textarea
                          className="f-input"
                          rows={2}
                          placeholder="Açıklama (Örn: Hazırlanırken oda sıcaklığında...)"
                          value={pageForm.metadata?.spec_1_desc || ''}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, spec_1_desc: e.target.value } }))}
                          style={{ fontSize: '.74rem', padding: '4px 8px', resize: 'vertical' }}
                        />
                      </div>
                      {/* SPEC 2 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <input
                          type="text"
                          className="f-input"
                          placeholder="Özellik Başlığı 2"
                          value={pageForm.metadata?.spec_2_label !== undefined ? pageForm.metadata.spec_2_label : (pageForm.metadata?.thaw_time_label || 'Çözünme Süresi')}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, spec_2_label: e.target.value } }))}
                          style={{ fontSize: '.68rem', fontWeight: 700, padding: '4px 8px', background: 'var(--surface-2)', color: 'var(--accent-primary)', border: '1.5px solid var(--accent-primary)', borderRadius: 7, opacity: .85 }}
                          title="Bu alanın başlığını özelleştir"
                        />
                        <input
                          type="text"
                          className="f-input"
                          placeholder="Örn: 4 saat"
                          value={pageForm.metadata?.spec_2_val !== undefined ? pageForm.metadata.spec_2_val : (pageForm.metadata?.thaw_time || '')}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, spec_2_val: e.target.value } }))}
                        />
                        <textarea
                          className="f-input"
                          rows={2}
                          placeholder="Açıklama (Örn: -18 dereceden çıkınca...)"
                          value={pageForm.metadata?.spec_2_desc || ''}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, spec_2_desc: e.target.value } }))}
                          style={{ fontSize: '.74rem', padding: '4px 8px', resize: 'vertical' }}
                        />
                      </div>
                      {/* SPEC 3 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <input
                          type="text"
                          className="f-input"
                          placeholder="Özellik Başlığı 3"
                          value={pageForm.metadata?.spec_3_label !== undefined ? pageForm.metadata.spec_3_label : (pageForm.metadata?.cooling_time_label || 'Ilınma/Soğuma')}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, spec_3_label: e.target.value } }))}
                          style={{ fontSize: '.68rem', fontWeight: 700, padding: '4px 8px', background: 'var(--surface-2)', color: 'var(--accent-primary)', border: '1.5px solid var(--accent-primary)', borderRadius: 7, opacity: .85 }}
                          title="Bu alanın başlığını özelleştir"
                        />
                        <input
                          type="text"
                          className="f-input"
                          placeholder="Örn: 10 dk"
                          value={pageForm.metadata?.spec_3_val !== undefined ? pageForm.metadata.spec_3_val : (pageForm.metadata?.cooling_time || '')}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, spec_3_val: e.target.value } }))}
                        />
                        <textarea
                          className="f-input"
                          rows={2}
                          placeholder="Açıklama (Örn: Ilınmaya bırakılır...)"
                          value={pageForm.metadata?.spec_3_desc || ''}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, spec_3_desc: e.target.value } }))}
                          style={{ fontSize: '.74rem', padding: '4px 8px', resize: 'vertical' }}
                        />
                      </div>
                      {/* SPEC 4 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <input
                          type="text"
                          className="f-input"
                          placeholder="Özellik Başlığı 4"
                          value={pageForm.metadata?.spec_4_label !== undefined ? pageForm.metadata.spec_4_label : 'Özellik 4'}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, spec_4_label: e.target.value } }))}
                          style={{ fontSize: '.68rem', fontWeight: 700, padding: '4px 8px', background: 'var(--surface-2)', color: 'var(--accent-primary)', border: '1.5px solid var(--accent-primary)', borderRadius: 7, opacity: .85 }}
                          title="Bu alanın başlığını özelleştir"
                        />
                        <input
                          type="text"
                          className="f-input"
                          placeholder="Örn: Değer"
                          value={pageForm.metadata?.spec_4_val || ''}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, spec_4_val: e.target.value } }))}
                        />
                        <textarea
                          className="f-input"
                          rows={2}
                          placeholder="Açıklama detayları..."
                          value={pageForm.metadata?.spec_4_desc || ''}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, spec_4_desc: e.target.value } }))}
                          style={{ fontSize: '.74rem', padding: '4px 8px', resize: 'vertical' }}
                        />
                      </div>
                      {/* SPEC 5 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <input
                          type="text"
                          className="f-input"
                          placeholder="Özellik Başlığı 5"
                          value={pageForm.metadata?.spec_5_label !== undefined ? pageForm.metadata.spec_5_label : 'Özellik 5'}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, spec_5_label: e.target.value } }))}
                          style={{ fontSize: '.68rem', fontWeight: 700, padding: '4px 8px', background: 'var(--surface-2)', color: 'var(--accent-primary)', border: '1.5px solid var(--accent-primary)', borderRadius: 7, opacity: .85 }}
                          title="Bu alanın başlığını özelleştir"
                        />
                        <input
                          type="text"
                          className="f-input"
                          placeholder="Örn: Değer"
                          value={pageForm.metadata?.spec_5_val || ''}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, spec_5_val: e.target.value } }))}
                        />
                        <textarea
                          className="f-input"
                          rows={2}
                          placeholder="Açıklama detayları..."
                          value={pageForm.metadata?.spec_5_desc || ''}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, spec_5_desc: e.target.value } }))}
                          style={{ fontSize: '.74rem', padding: '4px 8px', resize: 'vertical' }}
                        />
                      </div>
                      {/* SPEC 6 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <input
                          type="text"
                          className="f-input"
                          placeholder="Özellik Başlığı 6"
                          value={pageForm.metadata?.spec_6_label !== undefined ? pageForm.metadata.spec_6_label : 'Özellik 6'}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, spec_6_label: e.target.value } }))}
                          style={{ fontSize: '.68rem', fontWeight: 700, padding: '4px 8px', background: 'var(--surface-2)', color: 'var(--accent-primary)', border: '1.5px solid var(--accent-primary)', borderRadius: 7, opacity: .85 }}
                          title="Bu alanın başlığını özelleştir"
                        />
                        <input
                          type="text"
                          className="f-input"
                          placeholder="Örn: Değer"
                          value={pageForm.metadata?.spec_6_val || ''}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, spec_6_val: e.target.value } }))}
                        />
                        <textarea
                          className="f-input"
                          rows={2}
                          placeholder="Açıklama detayları..."
                          value={pageForm.metadata?.spec_6_desc || ''}
                          onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, spec_6_desc: e.target.value } }))}
                          style={{ fontSize: '.74rem', padding: '4px 8px', resize: 'vertical' }}
                        />
                      </div>
                    </div>

                    <div style={{ borderTop: '1px dashed var(--border)', paddingTop: 12 }}>
                      <h4 style={{ margin: '0 0 10px', fontSize: '.8rem', fontWeight: 700, color: 'var(--text-strong)' }}>Raf Ömrü Bilgileri</h4>
                      
                      {/* Shelf Life Details */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                        {/* SHELF 1 */}
                        <div>
                          <input
                            type="text"
                            className="f-input"
                            placeholder="Raf Ömrü Başlığı 1"
                            value={pageForm.metadata?.shelf_1_label !== undefined ? pageForm.metadata.shelf_1_label : (pageForm.metadata?.primary_shelf_life_label || '1. Raf Ömrü (Kapalı)')}
                            onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, shelf_1_label: e.target.value } }))}
                            style={{ fontSize: '.68rem', fontWeight: 700, padding: '4px 8px', marginBottom: 4, background: 'var(--surface-2)', color: '#0ea5e9', border: '1.5px solid #bae6fd', borderRadius: 7 }}
                            title="Bu alanın başlığını özelleştir"
                          />
                          <input
                            type="text"
                            className="f-input"
                            placeholder="Örn: 3 ay (Oda Sıcaklığı)"
                            value={pageForm.metadata?.shelf_1_val !== undefined ? pageForm.metadata.shelf_1_val : (pageForm.metadata?.primary_shelf_life ? `${pageForm.metadata.primary_shelf_life}${pageForm.metadata.primary_storage_cond ? ` (${pageForm.metadata.primary_storage_cond})` : ''}` : '')}
                            onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, shelf_1_val: e.target.value } }))}
                          />
                        </div>
                        {/* SHELF 2 */}
                        <div>
                          <input
                            type="text"
                            className="f-input"
                            placeholder="Raf Ömrü Başlığı 2"
                            value={pageForm.metadata?.shelf_2_label !== undefined ? pageForm.metadata.shelf_2_label : (pageForm.metadata?.secondary_shelf_life_1_label || 'Durum 1')}
                            onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, shelf_2_label: e.target.value } }))}
                            style={{ fontSize: '.68rem', fontWeight: 700, padding: '4px 8px', marginBottom: 4, background: 'var(--surface-2)', color: '#f59e0b', border: '1.5px solid #fde68a', borderRadius: 7 }}
                            title="Bu alanın başlığını özelleştir"
                          />
                          <input
                            type="text"
                            className="f-input"
                            placeholder="Örn: 1 hafta (+4°C Dolap)"
                            value={pageForm.metadata?.shelf_2_val !== undefined ? pageForm.metadata.shelf_2_val : (pageForm.metadata?.secondary_shelf_life_1 ? `${pageForm.metadata.secondary_shelf_life_1}${pageForm.metadata.secondary_storage_cond_1 ? ` (${pageForm.metadata.secondary_storage_cond_1})` : ''}` : '')}
                            onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, shelf_2_val: e.target.value } }))}
                          />
                        </div>
                        {/* SHELF 3 */}
                        <div>
                          <input
                            type="text"
                            className="f-input"
                            placeholder="Raf Ömrü Başlığı 3"
                            value={pageForm.metadata?.shelf_3_label !== undefined ? pageForm.metadata.shelf_3_label : (pageForm.metadata?.secondary_shelf_life_2_label || 'Durum 2')}
                            onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, shelf_3_label: e.target.value } }))}
                            style={{ fontSize: '.68rem', fontWeight: 700, padding: '4px 8px', marginBottom: 4, background: 'var(--surface-2)', color: '#f59e0b', border: '1.5px solid #fde68a', borderRadius: 7 }}
                            title="Bu alanın başlığını özelleştir"
                          />
                          <input
                            type="text"
                            className="f-input"
                            placeholder="Örn: 4 saat (+4°C Dolap)"
                            value={pageForm.metadata?.shelf_3_val !== undefined ? pageForm.metadata.shelf_3_val : (pageForm.metadata?.secondary_shelf_life_2 ? `${pageForm.metadata.secondary_shelf_life_2}${pageForm.metadata.secondary_storage_cond_2 ? ` (${pageForm.metadata.secondary_storage_cond_2})` : ''}` : '')}
                            onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, shelf_3_val: e.target.value } }))}
                          />
                        </div>
                        {/* SHELF 4 */}
                        <div>
                          <input
                            type="text"
                            className="f-input"
                            placeholder="Raf Ömrü Başlığı 4"
                            value={pageForm.metadata?.shelf_4_label !== undefined ? pageForm.metadata.shelf_4_label : 'Durum 3'}
                            onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, shelf_4_label: e.target.value } }))}
                            style={{ fontSize: '.68rem', fontWeight: 700, padding: '4px 8px', marginBottom: 4, background: 'var(--surface-2)', color: '#f59e0b', border: '1.5px solid #fde68a', borderRadius: 7 }}
                            title="Bu alanın başlığını özelleştir"
                          />
                          <input
                            type="text"
                            className="f-input"
                            placeholder="Örn: Durum 3 Raf Ömrü"
                            value={pageForm.metadata?.shelf_4_val || ''}
                            onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, shelf_4_val: e.target.value } }))}
                          />
                        </div>
                        {/* SHELF 5 */}
                        <div>
                          <input
                            type="text"
                            className="f-input"
                            placeholder="Raf Ömrü Başlığı 5"
                            value={pageForm.metadata?.shelf_5_label !== undefined ? pageForm.metadata.shelf_5_label : 'Durum 4'}
                            onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, shelf_5_label: e.target.value } }))}
                            style={{ fontSize: '.68rem', fontWeight: 700, padding: '4px 8px', marginBottom: 4, background: 'var(--surface-2)', color: '#f59e0b', border: '1.5px solid #fde68a', borderRadius: 7 }}
                            title="Bu alanın başlığını özelleştir"
                          />
                          <input
                            type="text"
                            className="f-input"
                            placeholder="Örn: Durum 4 Raf Ömrü"
                            value={pageForm.metadata?.shelf_5_val || ''}
                            onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, shelf_5_val: e.target.value } }))}
                          />
                        </div>
                        {/* SHELF 6 */}
                        <div>
                          <input
                            type="text"
                            className="f-input"
                            placeholder="Raf Ömrü Başlığı 6"
                            value={pageForm.metadata?.shelf_6_label !== undefined ? pageForm.metadata.shelf_6_label : 'Durum 5'}
                            onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, shelf_6_label: e.target.value } }))}
                            style={{ fontSize: '.68rem', fontWeight: 700, padding: '4px 8px', marginBottom: 4, background: 'var(--surface-2)', color: '#f59e0b', border: '1.5px solid #fde68a', borderRadius: 7 }}
                            title="Bu alanın başlığını özelleştir"
                          />
                          <input
                            type="text"
                            className="f-input"
                            placeholder="Örn: Durum 5 Raf Ömrü"
                            value={pageForm.metadata?.shelf_6_val || ''}
                            onChange={e => setPageForm(prev => ({ ...prev, metadata: { ...prev.metadata, shelf_6_val: e.target.value } }))}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Equipment Linking */}
              <div>
                <label className="f-label">Kullanılan Ekipmanları İlişkilendir</label>
                
                {equipments.length > 0 && (
                  <div style={{ marginBottom: 8, display: 'flex', gap: 6 }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input
                        type="text"
                        placeholder="Ekipman veya seri no ara..."
                        className="f-input"
                        style={{ padding: '6px 12px 6px 32px', fontSize: '.8rem' }}
                        value={eqSearch}
                        onChange={e => setEqSearch(e.target.value)}
                      />
                      <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontSize: '.75rem' }} />
                      {eqSearch && (
                        <button
                          type="button"
                          onClick={() => setEqSearch('')}
                          style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '.8rem' }}
                        >
                          <i className="fa-solid fa-xmark" />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div style={{
                  border: '1.5px solid #cbd5e1',
                  borderRadius: 10,
                  padding: '8px 12px',
                  maxHeight: 150,
                  overflowY: 'auto',
                  background: 'var(--surface-2)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8
                }}>
                  {equipments.length === 0 ? (
                    <span style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>Sistemde kayıtlı ekipman bulunmamaktadır.</span>
                  ) : (() => {
                    const filtered = equipments.filter(eq => 
                      !eqSearch || String(eq.name || '').toLowerCase().includes(eqSearch.toLowerCase())
                    )
                    if (filtered.length === 0) {
                      return <span style={{ fontSize: '.78rem', color: 'var(--text-muted)', padding: '4px 0' }}>Eşleşen ekipman bulunamadı.</span>
                    }
                    return filtered.map(eq => (
                      <label key={eq.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.8rem', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={pageForm.equipment_ids.includes(eq.id)}
                          onChange={() => handleEquipmentCheckboxChange(eq.id)}
                        />
                        <span>{eq.name}</span>
                      </label>
                    ))
                  })()}
                </div>
                <p className="f-hint">Sayfada bahsi geçen global ekipman türlerini işaretleyin.</p>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className="f-label">Yönetici/Düzenleyen PIN</label>
                  <input
                    type="password"
                    maxLength={4}
                    placeholder="4 Haneli PIN"
                    className="f-input"
                    value={pageForm.last_updated_by_pin}
                    onChange={e => setPageForm(prev => ({ ...prev, last_updated_by_pin: e.target.value.replace(/\D/g, '') }))}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button type="submit" className="btn-p" style={{ width: '100%', justifyContent: 'center' }}>
                    <i className="fa-solid fa-save" /> {editingPage ? 'Güncelle' : 'Kaydet'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 7fr) minmax(0, 5fr)', gap: 24 }}>
          {/* Category List Card */}
          <div className="card" style={{ padding: 20 }}>
            <h2 className="text-primary" style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0 0 16px' }}>
              El Kitabı Kategorileri
            </h2>
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 80, textAlign: 'center' }}>Sıra No</th>
                    <th>Kategori Adı</th>
                    <th>Açıklama</th>
                    <th style={{ textAlign: 'center' }}>İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map(cat => (
                    <tr key={cat.id}>
                      <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{cat.display_order}</td>
                      <td style={{ fontWeight: 700 }}>{cat.name}</td>
                      <td style={{ fontSize: '.78rem', color: 'var(--text-muted)' }}>{cat.description || '-'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 4 }}>
                          <button className="ico-btn edit" onClick={() => handleEditCategory(cat)} title="Düzenle">
                            <i className="fa-solid fa-pen" />
                          </button>
                          {!SYSTEM_CATEGORY_NAMES.includes(cat.name) && (
                            <button className="ico-btn del" onClick={() => handleDeleteCategory(cat.id, cat.name)} title="Sil">
                              <i className="fa-solid fa-trash" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Category Form Card */}
          <div className="card" style={{ padding: 20, height: 'fit-content' }}>
            <h2 className="text-primary" style={{ fontSize: '1.1rem', fontWeight: 800, margin: '0 0 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{editingCategory ? 'Kategoriyi Düzenle' : 'Yeni Kategori Ekle'}</span>
              {editingCategory && (
                <button className="btn-g" onClick={() => { setEditingCategory(null); setCategoryForm({ name: '', description: '', display_order: 0 }) }} style={{ fontSize: '.75rem', padding: '2px 8px' }}>
                  İptal Et
                </button>
              )}
            </h2>
            <form onSubmit={handleSaveCategory} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="f-label">Kategori Adı</label>
                <input
                  type="text"
                  className="f-input"
                  placeholder="Örn: Hijyen ve Temizlik"
                  value={categoryForm.name}
                  onChange={e => setCategoryForm(prev => ({ ...prev, name: e.target.value }))}
                  disabled={editingCategory && SYSTEM_CATEGORY_NAMES.includes(editingCategory.name)}
                  style={{ opacity: (editingCategory && SYSTEM_CATEGORY_NAMES.includes(editingCategory.name)) ? 0.6 : 1, cursor: (editingCategory && SYSTEM_CATEGORY_NAMES.includes(editingCategory.name)) ? 'not-allowed' : 'text' }}
                />
              </div>

              <div>
                <label className="f-label">Açıklama</label>
                <textarea
                  className="f-input"
                  rows={4}
                  placeholder="Bu kategori altındaki prosedürlerin genel bağlamı..."
                  value={categoryForm.description}
                  onChange={e => setCategoryForm(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <div>
                <label className="f-label">Görünüm Sıralaması (Display Order)</label>
                <input
                  type="number"
                  className="f-input"
                  value={categoryForm.display_order}
                  onChange={e => setCategoryForm(prev => ({ ...prev, display_order: parseInt(e.target.value) || 0 }))}
                  disabled={editingCategory && SYSTEM_CATEGORY_NAMES.includes(editingCategory.name)}
                  style={{ opacity: (editingCategory && SYSTEM_CATEGORY_NAMES.includes(editingCategory.name)) ? 0.6 : 1, cursor: (editingCategory && SYSTEM_CATEGORY_NAMES.includes(editingCategory.name)) ? 'not-allowed' : 'text' }}
                />
              </div>

              <button type="submit" className="btn-p" style={{ width: '100%', justifyContent: 'center' }}>
                <i className="fa-solid fa-save" /> {editingCategory ? 'Kategoriyi Güncelle' : 'Kategoriyi Kaydet'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
