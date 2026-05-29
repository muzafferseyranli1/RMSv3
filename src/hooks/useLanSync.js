import { useEffect, useRef } from 'react'
import { getTerminalRole, getSlaveConfig, getTerminalId } from '@/lib/terminalIdentity'

// Yan Kasanın Ana Kasa WS bağlantısını yönetir.
// Governance Kural 6: Reconnect için setInterval değil, setTimeout kullanılır.
export function useLanSync({ onTableUpdated } = {}) {
  const wsRef = useRef(null)
  const reconnectTimerRef = useRef(null)
  const onTableUpdatedRef = useRef(onTableUpdated)
  onTableUpdatedRef.current = onTableUpdated

  useEffect(() => {
    if (getTerminalRole() !== 'slave') return

    function connect() {
      try {
        const { masterIp, masterPort } = getSlaveConfig()
        const wsPort = masterPort + 1  // 4001
        const terminalId = getTerminalId()
        const ws = new WebSocket(`ws://${masterIp}:${wsPort}?terminalId=${terminalId}`)

        ws.onopen = () => {
          clearTimeout(reconnectTimerRef.current)
        }

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data)
            if (msg.type === 'TABLE_UPDATED') {
              onTableUpdatedRef.current?.(msg.table, msg)
            }
          } catch { /* ignore */ }
        }

        ws.onclose = () => {
          // 30 sn sonra yeniden dene
          reconnectTimerRef.current = setTimeout(connect, 30_000)
        }

        ws.onerror = () => {
          ws.close()
        }

        wsRef.current = ws
      } catch {
        reconnectTimerRef.current = setTimeout(connect, 30_000)
      }
    }

    connect()

    return () => {
      clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
    }
  }, [])
}
