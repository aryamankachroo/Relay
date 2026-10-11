import { useEffect } from 'react'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useSignIn } from '@clerk/react-router'

export const googleReturnUrl = 'relay://sso-callback'

/** Brings a finished Google sign-in from Safari back into the app. */
export function GoogleReturn() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    let remove = () => {}
    void App.addListener('appUrlOpen', ({ url }) => {
      if (!url.startsWith(googleReturnUrl)) return
      const incoming = new URL(url)
      window.location.replace(`/sso-callback${incoming.search}${incoming.hash}`)
    }).then((handle) => {
      remove = () => {
        void handle.remove()
      }
    })
    return () => remove()
  }, [])

  return null
}

type ClerkHost = Window & {
  Clerk?: { __internal_windowNavigate?: (url: string) => void }
  webkit?: { messageHandlers?: { relayOAuth?: { postMessage: (body: string) => void } } }
}

export function GoogleSignInButton() {
  const { signIn } = useSignIn()

  if (!Capacitor.isNativePlatform()) return null

  return (
    <button
      type="button"
      className="relay-google"
      onClick={() => {
        const host = window as ClerkHost
        const clerk = host.Clerk
        const original = clerk?.__internal_windowNavigate
        if (clerk && original) {
          clerk.__internal_windowNavigate = (url: string) => {
            clerk.__internal_windowNavigate = original
            const native = host.webkit?.messageHandlers?.relayOAuth
            if (native) native.postMessage(url)
            else window.location.assign(url)
          }
        }
        void signIn.sso({
          strategy: 'oauth_google',
          redirectUrl: googleReturnUrl,
          redirectCallbackUrl: googleReturnUrl,
        }).catch(() => {
          if (clerk && original) clerk.__internal_windowNavigate = original
        })
      }}
    >
      Continue with Google
    </button>
  )
}
