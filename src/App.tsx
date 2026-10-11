import { Route, Routes } from 'react-router'
import { AppLayout } from './components/AppLayout.tsx'
import { HandoffsProvider } from './state/handoffs.tsx'
import { InventoryProvider } from './state/inventory.tsx'
import { LoanRequestsProvider } from './state/loanRequests.tsx'
import { ActivityPage } from './pages/ActivityPage.tsx'
import { ChatPage } from './pages/ChatPage.tsx'
import { GardenPage } from './pages/GardenPage.tsx'
import { MyStuffPage } from './pages/MyStuffPage.tsx'
import { NeighborhoodPage } from './pages/NeighborhoodPage.tsx'
import { NotFoundPage } from './pages/NotFoundPage.tsx'

export default function App() {
  return (
    <InventoryProvider>
      <LoanRequestsProvider>
        <HandoffsProvider>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<ChatPage />} />
              <Route path="my-stuff" element={<MyStuffPage />} />
              <Route path="neighborhood" element={<NeighborhoodPage />} />
              <Route path="activity" element={<ActivityPage />} />
              <Route path="garden" element={<GardenPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </HandoffsProvider>
      </LoanRequestsProvider>
    </InventoryProvider>
  )
}
