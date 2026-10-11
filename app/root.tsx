import type { ReactNode } from 'react'
import { ClerkProvider } from '@clerk/react-router'
import { clerkMiddleware, rootAuthLoader } from '@clerk/react-router/server'
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router'
import type { Route } from './+types/root'
import App from '../src/App.tsx'
import stylesheet from '../src/styles/index.css?url'

export const middleware: Route.MiddlewareFunction[] = [clerkMiddleware()]
export const loader = (args: Route.LoaderArgs) => rootAuthLoader(args)

export const links: Route.LinksFunction = () => [
  { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
  { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
  { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
  { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap' },
  { rel: 'stylesheet', href: stylesheet },
]

export function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#3eb6ef" />
        <title>Relay</title>
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function Root({ loaderData }: Route.ComponentProps) {
  return (
    <ClerkProvider loaderData={loaderData} signInUrl="/sign-in" signUpUrl="/signup" signInFallbackRedirectUrl="/" signUpFallbackRedirectUrl="/">
      <App><Outlet /></App>
    </ClerkProvider>
  )
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const missing = isRouteErrorResponse(error) && error.status === 404
  return (
    <main className="login-page">
      <section className="login-card glass-card glass-card-strong">
        <h1>{missing ? 'Page not found' : 'Relay could not load'}</h1>
        <p>{missing ? 'Check the address and try again.' : 'Please refresh the page and try again.'}</p>
        <a href="/">Return to Relay</a>
      </section>
    </main>
  )
}
