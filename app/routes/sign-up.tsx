import { SignUp } from '@clerk/react-router'
import { AuthPage } from '../../src/App.tsx'

export default function SignUpPage() {
  return (
    <AuthPage signUp>
      <SignUp routing="hash" signInUrl="/sign-in" appearance={{
        variables: { colorPrimary: '#147a4c', fontFamily: '"Nunito", system-ui, sans-serif' },
        elements: { rootBox: 'relay-clerk-root', cardBox: 'relay-clerk-card', card: 'relay-clerk-card-body', header: 'relay-clerk-header' },
      }} />
    </AuthPage>
  )
}
