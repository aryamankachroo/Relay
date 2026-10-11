import { useUser } from '@clerk/react-router'

export function useAccountIdentity() {
  const { user } = useUser()
  const fullName = user?.fullName?.trim()
  const firstName = user?.firstName?.trim()
  const username = user?.username?.trim()
  const email = user?.primaryEmailAddress?.emailAddress
  const name = fullName || firstName || username || email || 'Your account'
  const shortName = firstName || username || name
  const initials = (fullName || firstName || username || email || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => Array.from(part)[0])
    .join('')
    .toLocaleUpperCase() || '?'

  return { name, shortName, initials }
}
