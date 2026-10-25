import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const rawSiteUrl = (env.VITE_SITE_URL || process.env.VITE_SITE_URL || '').trim().replace(/\/$/, '')
  if (command === 'build' && !rawSiteUrl) {
    throw new Error('VITE_SITE_URL is required for a production build so og:image and twitter:image use a real absolute https URL.')
  }
  const siteUrl = rawSiteUrl || 'http://127.0.0.1:5173'
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'inject-og-site-url',
        transformIndexHtml(html: string) {
          return html.replace(/__UNIQ_SITE_URL__/g, siteUrl)
        },
      },
    ],
    server: {
      host: '127.0.0.1',
      port: 5173,
      allowedHosts: true,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
      hmr: {
        clientPort: 443,
      },
    },
    test: { environment: 'node', include: ['src/**/*.test.ts'] },
  } as any
})
