import { useEffect, useState, type FormEvent } from 'react'
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
  const [onboarded, setOnboarded] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!resident.id) return
    let cancel = false
    api
      .profile(resident.id)
      .then((saved) => {
        if (cancel) return
        setOnboarded(saved.onboarded)
        setReadyId(resident.id)
      })
      .catch((caught: unknown) => {
        if (cancel) return
        setReadyId(null)
        setError(caught instanceof Error ? caught.message : 'Could not load your profile.')
      })
    return () => {
      cancel = true
    }
  }, [attempt, resident.id])

  if (!resident.id || readyId !== resident.id) {
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

  if (!onboarded) {
    return (
      <WelcomeForm
        residentId={resident.id}
        name={resident.name}
        email={resident.email}
        initials={resident.initials}
        street={resident.street}
        onDone={() => setOnboarded(true)}
      />
    )
  }

  return (
    <ShelfResidentProvider residentId={resident.id}>
      <InventoryProvider residentId={resident.id}>
        <ActivityFeedProvider>
          <LoanRequestsProvider>
            <HandoffsProvider><AppLayout /></HandoffsProvider>
          </LoanRequestsProvider>
        </ActivityFeedProvider>
      </InventoryProvider>
    </ShelfResidentProvider>
  )
}

function WelcomeForm({
  residentId,
  name,
  email,
  initials,
  street,
  onDone,
}: {
  residentId: string
  name: string
  email: string
  initials: string
  street: string
  onDone: () => void
}) {
  const [city, setCity] = useState('')
  const [about, setAbout] = useState('')
  const [itemName, setItemName] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!city.trim()) {
      setError('Enter the city you are in.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const saved = await api.saveProfile({
        clerk_user_id: residentId,
        name,
        email,
        initials,
        street,
        city: city.trim(),
        about: about.trim(),
      })
      if (!saved.onboarded) {
        setError('Enter the city you are in.')
        return
      }
      if (itemName.trim()) {
        await api.createInventory(residentId, {
          name: itemName.trim(),
          category: 'Household',
          quantity,
          condition: 'Good',
          notes: about.trim(),
          available_to_lend: true,
        })
      }
      onDone()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save your profile.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="hint" onSubmit={(event) => void submit(event)}>
      <h1>Where should Relay look?</h1>
      <p>Tell us your city and one thing you can lend. Relay only matches you with people in that city.</p>
      <label>
        City
        <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Charlotte" />
      </label>
      <label>
        About you
        <input value={about} onChange={(event) => setAbout(event.target.value)} placeholder="I live near the park and lend tools." />
      </label>
      <label>
        Something you have
        <input value={itemName} onChange={(event) => setItemName(event.target.value)} placeholder="Ladder" />
      </label>
      <label>
        Quantity
        <input
          type="number"
          min={1}
          max={99}
          value={quantity}
          onChange={(event) => setQuantity(Number(event.target.value) || 1)}
        />
      </label>
      {error ? <p>{error}</p> : null}
      <button type="submit" className="loan-lender" disabled={busy}>
        {busy ? 'Saving…' : 'Join your city'}
      </button>
    </form>
  )
}
