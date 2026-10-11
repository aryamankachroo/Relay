import { HandleSSOCallback } from '@clerk/react-router'
import { useNavigate } from 'react-router'

export default function SsoCallback() {
  const navigate = useNavigate()

  return (
    <HandleSSOCallback
      navigateToApp={() => navigate('/')}
      navigateToSignIn={() => navigate('/sign-in')}
      navigateToSignUp={() => navigate('/signup')}
    />
  )
}
