import tailwindcss from '@tailwindcss/vite'
import { reactRouter } from '@react-router/dev/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tailwindcss(), reactRouter()],
  resolve: {
    alias: [
      {
        // Prefer the ESM build so Vite can code-split Mapbox's worker correctly.
        find: /^mapbox-gl$/,
        replacement: 'mapbox-gl/esm',
      },
    ],
  },
  ssr: {
    // Rive ships CJS builds; bundle them for SSR so named/default interop works.
    noExternal: ['@rive-app/react-webgl2', '@rive-app/webgl2'],
  },
  optimizeDeps: {
    include: ['@rive-app/react-webgl2', 'mapbox-gl'],
  },
  server: {
    host: true,
    port: 5173,
  },
})
