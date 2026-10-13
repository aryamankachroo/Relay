import { useEffect, useState } from 'react'
import { Show } from '@clerk/react-router'
import { api } from '../../src/api/client.ts'
import { AppLayout } from '../../src/components/AppLayout.tsx'
import { ActivityFeedProvider } from '../../src/state/activityFeed.tsx'
import { useCurrentResident } from '../../src/state/currentResident.ts'
import { HandoffsProvider } from '../../src/state/handoffs.tsx'
import { InventoryProvider } from '../../src/state/inventory.tsx'
import { LoanRequestsProvider } from '../../src/state/loanRequests.tsx'
import { ShelfResidentProvider } from '../../src/state/shelfResident.tsx'
import SignInPage from './sign-in.tsx'

export default function NeighborhoodLayout() {
  return (
    <>
      <Show when="signed-out"><SignInPage /></Show>
      <Show when="signed-in">
        <SignedInApp />
      </Show>
    </>
  )
}

function SignedInApp() {
  const resident = useCurrentResident()
  const [readyId, setReadyId] = useState<string | null>(null)
  const [shelfId, setShelfId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!resident.id) return
    let cancel = false
    setError('')
    api
      .saveProfile({
        clerk_user_id: resident.id,
        name: resident.name,
        email: resident.email,
        initials: resident.initials,
        street: resident.street,
      })
      .then((saved) => {
        if (!cancel) {
          setShelfId(saved.resident_id)
          setReadyId(resident.id)
        }
      })
      .catch((caught: unknown) => {
        if (cancel) return
        setReadyId(null)
        setError(caught instanceof Error ? caught.message : 'Could not save your profile.')
      })
    return () => {
      cancel = true
    }
  }, [attempt, resident.id, resident.name, resident.email, resident.initials, resident.street])

  if (!resident.id || !shelfId || readyId !== resident.id) {
    return (
      <div className="hint">
        <p>{error || 'Loading your shelf…'}</p>
        {error ? (
          <button type="button" className="loan-lender" onClick={() => setAttempt((value) => value + 1)}>
            Try again
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <ShelfResidentProvider residentId={shelfId}>
      <InventoryProvider residentId={shelfId}>
        <ActivityFeedProvider>
          <LoanRequestsProvider>
            <HandoffsProvider><AppLayout /></HandoffsProvider>
          </LoanRequestsProvider>
        </ActivityFeedProvider>
      </InventoryProvider>
    </ShelfResidentProvider>
  )
}
