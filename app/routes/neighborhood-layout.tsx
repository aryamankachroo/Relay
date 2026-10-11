import { Show } from '@clerk/react-router'
import { AppLayout } from '../../src/components/AppLayout.tsx'
import { ActivityFeedProvider } from '../../src/state/activityFeed.tsx'
import { HandoffsProvider } from '../../src/state/handoffs.tsx'
import { InventoryProvider } from '../../src/state/inventory.tsx'
import { LoanRequestsProvider } from '../../src/state/loanRequests.tsx'
import SignInPage from './sign-in.tsx'

export default function NeighborhoodLayout() {
  return (
    <>
      <Show when="signed-out"><SignInPage /></Show>
      <Show when="signed-in">
        <InventoryProvider>
          <ActivityFeedProvider>
            <LoanRequestsProvider>
              <HandoffsProvider><AppLayout /></HandoffsProvider>
            </LoanRequestsProvider>
          </ActivityFeedProvider>
        </InventoryProvider>
      </Show>
    </>
  )
}
