import { index, route, type RouteConfig } from '@react-router/dev/routes'

export default [
  index('routes/sign-in.tsx', { id: 'login-home' }),
  route('signup/*', 'routes/sign-up.tsx'),
  route('sign-up/*', 'routes/sign-up.tsx', { id: 'sign-up-alias' }),
  route('*', 'routes/sign-in.tsx'),
] satisfies RouteConfig
