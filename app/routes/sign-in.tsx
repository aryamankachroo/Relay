import { SignIn } from '@clerk/react-router'
import { AuthPage } from '../../src/App.tsx'

export default function SignInPage() {
  return (
    <AuthPage>
      <SignIn routing="hash" signUpUrl="/signup" appearance={{
        variables: { colorPrimary: '#147a4c', fontFamily: '"Nunito", system-ui, sans-serif' },
        elements: { rootBox: 'relay-clerk-root', cardBox: 'relay-clerk-card', card: 'relay-clerk-card-body', header: 'relay-clerk-header' },
      }} />
    </AuthPage>
  )
}
