import { useParams } from 'react-router-dom'
import CustomerLoyaltyMobileApp from '@/components/mobile/CustomerLoyaltyMobileApp'

export default function CustomerMobileAppPage({ linkChannel = '' }) {
  const { token = '' } = useParams()
  const linkSession = linkChannel && token
    ? { channel: linkChannel, token }
    : null

  return (
    <CustomerLoyaltyMobileApp
      mode="standalone"
      linkSession={linkSession}
    />
  )
}
