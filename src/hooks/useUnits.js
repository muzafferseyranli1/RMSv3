import { useEffect, useState } from 'react'
import { db } from '@/lib/db'

export function useUnits() {
  const [units, setUnits]     = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    db
      .from('units')
      .select('id, name, label, symbol, sort_order, is_system')
      .order('is_system', { ascending: false })
      .order('sort_order')
      .order('label')
      .then(({ data }) => {
        setUnits(data || [])
        setLoading(false)
      })
  }, [])

  return { units, loading }
}
