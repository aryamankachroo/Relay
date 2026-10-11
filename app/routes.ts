import { index, layout, route, type RouteConfig } from '@react-router/dev/routes'

export default [
  route('sign-in/*', 'routes/sign-in.tsx'),
  route('signup/*', 'routes/sign-up.tsx'),
  route('sign-up/*', 'routes/sign-up.tsx', { id: 'sign-up-alias' }),
  layout('routes/neighborhood-layout.tsx', [
    index('routes/ChatPage.tsx'),
    route('my-stuff', 'routes/MyStuffPage.tsx'),
    route('neighborhood', 'routes/NeighborhoodPage.tsx'),
    route('activity', 'routes/ActivityPage.tsx'),
    route('*', 'routes/NotFoundPage.tsx'),
  ]),
] satisfies RouteConfig
