import { useEffect, useState } from 'react'
import PinLoginScreen from '@/components/pos/PinLoginScreen'
import {
  findCachedPersonnelForBranchPin,
  findPersonnelForBranchPin,
  normalizePinInput,
  readPosStaffSession,
  writePosStaffSession,
} from '@/lib/posStaffAuth'
import { isDesktopMode } from '@/lib/terminalIdentity'

export default function StaffPinGate({
  storageKey,
  branchId,
  branchName,
  title,
  subtitle,
  embeddedPin = false,
  children,
}) {
  const [activeStaff, setActiveStaff] = useState(() => readPosStaffSession(storageKey))
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState('')
  const [staffLoading, setStaffLoading] = useState(false)

  useEffect(() => {
    writePosStaffSession(storageKey, activeStaff)
  }, [storageKey, activeStaff])

  useEffect(() => {
    setActiveStaff(readPosStaffSession(storageKey))
  }, [storageKey])

  useEffect(() => {
    setPinInput('')
    setPinError('')
    setActiveStaff(null)
    writePosStaffSession(storageKey, null)
  }, [storageKey, branchId])

  // Desktop terminal modunda (pair edilmis cihaz) PIN sorulmaz
  const desktopMode = isDesktopMode()
  const showPinPrompt = !desktopMode && Boolean(branchId) && !activeStaff

  const handleSubmit = async () => {
    const normalizedPin = normalizePinInput(pinInput)
    if (normalizedPin.length < 4) {
      setPinError('PIN en az 4 haneli olmali.')
      return
    }

    setStaffLoading(true)
    setPinError('')

    try {
      const cachedMatch = findCachedPersonnelForBranchPin(branchId, normalizedPin, { allowExpired: true })
      const matchedPersonnel = cachedMatch || await findPersonnelForBranchPin(branchId, normalizedPin, { preferCache: false })

      if (!matchedPersonnel) {
        setPinError('Bu sube icin gecersiz PIN.')
        return
      }

      setActiveStaff({
        ...matchedPersonnel,
        authenticatedAt: new Date().toISOString(),
      })
      setPinInput('')
    } finally {
      setStaffLoading(false)
    }
  }

  const handleLogout = () => {
    setPinInput('')
    setPinError('')
    setActiveStaff(null)
    writePosStaffSession(storageKey, null)
  }

  if (showPinPrompt) {
    return (
      <PinLoginScreen
        title={title}
        subtitle={subtitle}
        branchName={branchName}
        pin={pinInput}
        error={pinError}
        loading={staffLoading}
        embedded={embeddedPin}
        onPinChange={value => {
          setPinError('')
          setPinInput(normalizePinInput(value))
        }}
        onSubmit={handleSubmit}
      />
    )
  }

  return typeof children === 'function'
    ? children(activeStaff, { logout: handleLogout })
    : children
}
