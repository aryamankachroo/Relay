import { SignIn } from '@clerk/react-router'
import { Capacitor } from '@capacitor/core'
import { AuthPage } from '../../src/App.tsx'
import { GoogleSignInButton } from '../../src/auth/googleSignIn.tsx'

export default function SignInPage() {
  const native = Capacitor.isNativePlatform()
  return (
    <AuthPage>
      <div className={native ? 'relay-native-auth' : undefined}>
        <GoogleSignInButton />
        <SignIn routing="hash" signUpUrl="/signup" appearance={{
          variables: { colorPrimary: '#147a4c', fontFamily: '"Nunito", system-ui, sans-serif' },
          elements: { rootBox: 'relay-clerk-root', cardBox: 'relay-clerk-card', card: 'relay-clerk-card-body', header: 'relay-clerk-header' },
        }} />
      </div>
    </AuthPage>
  )
}
