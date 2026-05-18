import { db } from '@/lib/db'

export async function readSettingValue(settingKey, fallbackValue) {
  const { data, error } = await db
    .from('settings')
    .select('value')
    .eq('key', settingKey)
    .maybeSingle()

  if (error) throw error
  return data?.value ?? fallbackValue
}

export async function writeSettingValue(settingKey, value) {
  const { error } = await db
    .from('settings')
    .upsert({ key: settingKey, value })

  if (error) throw error
}
