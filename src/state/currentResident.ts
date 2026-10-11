import { useUser } from '@clerk/react-router'
import { useMemo } from 'react'
import { demoResident } from '../data/index.ts'

export type CurrentResident = {
  id: string | null
  name: string
  shortName: string
  initials: string
  street: string
  email: string
  imageUrl?: string
}

/** The signed-in Clerk user, shown at the demo resident's address. */
export function useCurrentResident(): CurrentResident {
  const { isLoaded, user } = useUser()

  return useMemo(() => {
    if (!isLoaded) {
      return { id: null, name: '', shortName: '', initials: '', street: demoResident.street, email: '' }
    }
    if (!user) return { ...demoResident, id: null, email: '' }

    const email = user.primaryEmailAddress?.emailAddress
    const name =
      user.fullName?.trim() || user.username || email?.split('@')[0] || demoResident.name
    const words = name.split(/\s+/).filter(Boolean)
    const initials =
      words.length > 1
        ? `${words[0][0]}${words[words.length - 1][0]}`
        : (words[0]?.slice(0, 2) ?? demoResident.initials)

    return {
      id: user.id,
      name,
      shortName: user.firstName?.trim() || words[0] || name,
      initials: initials.toUpperCase(),
      street: demoResident.street,
      email: email ?? '',
      imageUrl: user.hasImage ? user.imageUrl : undefined,
    }
  }, [isLoaded, user])
}
