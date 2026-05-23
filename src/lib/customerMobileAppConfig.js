import { db } from '@/lib/db'

const DEFAULT_BRANDING = {
  companyName: '',
  logoUrl: '',
  backgroundImageUrl: '',
  primaryColor: '#be185d',
  headerGradient: ['#111827', '#312e81', '#f97316'],
  welcomeText: 'Hoş Geldiniz',
}

const DEFAULT_HOME_BUTTONS = [
  {
    id: 'btn1',
    type: 'order',
    label: 'Sipariş Ver',
    icon: 'fa-utensils',
    config: { deliveryUrl: '', enableTableOrder: true },
  },
  {
    id: 'btn2',
    type: 'app_page',
    label: 'Kampanyalar',
    icon: 'fa-bullhorn',
    config: { pageKey: 'campaigns' },
  },
  {
    id: 'btn3',
    type: 'phone',
    label: 'Bizi Arayın',
    icon: 'fa-phone',
    config: { phoneNumber: '' },
  },
  {
    id: 'btn4',
    type: 'app_page',
    label: 'Geri Bildirim',
    icon: 'fa-comment-dots',
    config: { pageKey: 'account' },
  },
]

function normalizeBranding(raw) {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_BRANDING }
  return {
    companyName: String(raw.companyName ?? DEFAULT_BRANDING.companyName),
    logoUrl: String(raw.logoUrl ?? DEFAULT_BRANDING.logoUrl),
    backgroundImageUrl: String(raw.backgroundImageUrl ?? DEFAULT_BRANDING.backgroundImageUrl),
    primaryColor: String(raw.primaryColor ?? DEFAULT_BRANDING.primaryColor),
    headerGradient: Array.isArray(raw.headerGradient) ? raw.headerGradient : DEFAULT_BRANDING.headerGradient,
    welcomeText: String(raw.welcomeText ?? DEFAULT_BRANDING.welcomeText),
  }
}

function normalizeHomeButtons(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [...DEFAULT_HOME_BUTTONS]
  return raw.slice(0, 4).map((btn, index) => {
    const fallback = DEFAULT_HOME_BUTTONS[index] || DEFAULT_HOME_BUTTONS[0]
    return {
      id: String(btn.id ?? fallback.id),
      type: String(btn.type ?? fallback.type),
      label: String(btn.label ?? fallback.label),
      icon: String(btn.icon ?? fallback.icon),
      config: btn.config && typeof btn.config === 'object' ? btn.config : { ...fallback.config },
    }
  })
}

export function getDefaultAppConfig() {
  return {
    branding: { ...DEFAULT_BRANDING },
    homeButtons: [...DEFAULT_HOME_BUTTONS],
  }
}

export async function loadCustomerAppConfig() {
  try {
    const { data, error } = await db
      .from('customer_app_config')
      .select('id, config_key, branding, home_buttons, active')
      .eq('config_key', 'default')
      .is('deleted_at', null)
      .limit(1)

    if (error) {
      const msg = String(error.message || '')
      if (msg.includes('does not exist') || error.code === 'PGRST204') {
        return getDefaultAppConfig()
      }
      throw error
    }

    const row = data?.[0]
    if (!row) return getDefaultAppConfig()

    return {
      id: row.id,
      branding: normalizeBranding(row.branding),
      homeButtons: normalizeHomeButtons(row.home_buttons),
    }
  } catch (err) {
    console.error('customer_app_config yüklenemedi:', err)
    return getDefaultAppConfig()
  }
}

export async function saveCustomerAppConfig({ branding, homeButtons }) {
  const payload = {
    branding: normalizeBranding(branding),
    home_buttons: normalizeHomeButtons(homeButtons),
    updated_at: new Date().toISOString(),
  }

  const { data: existing } = await db
    .from('customer_app_config')
    .select('id')
    .eq('config_key', 'default')
    .is('deleted_at', null)
    .limit(1)

  if (existing?.[0]?.id) {
    const { error } = await db
      .from('customer_app_config')
      .update(payload)
      .eq('id', existing[0].id)
    if (error) throw error
  } else {
    const { error } = await db
      .from('customer_app_config')
      .insert({ config_key: 'default', ...payload })
    if (error) throw error
  }
}
