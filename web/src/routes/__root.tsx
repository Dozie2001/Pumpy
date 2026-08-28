import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { Toaster } from 'react-hot-toast'
import { ErrorPage, NotFoundPage } from '../components/FaultScreen'
import appCss from '../styles.css?url'
import type { QueryClient } from '@tanstack/react-query'
import { SITE_URL } from '@/config'
import { PlayerWalletProvider } from '@/lib/dreamdex/usePlayerWallet'

interface MyRouterContext {
  queryClient: QueryClient
}

// Social crawlers (Telegram especially) need absolute image URLs, so og:image/twitter:image point at
// the canonical domain from config, never a relative path.
const OG_IMAGE = `${SITE_URL}/pumpy-og.svg`
const OG_TITLE = 'Pumpy · Markets, made playable'
const OG_DESC =
  'A mobile prediction arcade built on live DreamDEX Event Contracts.'
const OG_IMAGE_ALT = 'Pumpy prediction arcade on DreamDEX'

export const Route = createRootRouteWithContext<MyRouterContext>()({
  notFoundComponent: () => <NotFoundPage />,
  // The router's boundary IS the root ErrorBoundary: it already renders the product's error screen rather
  // than a white page, so capture here and keep that screen. Reporting is fire-and-forget and deduped per
  // session, so a render loop cannot flood the endpoint.
  errorComponent: ({ error, reset }) => {
    console.error('[Pumpy] route error', error)
    return <ErrorPage error={error} reset={reset} />
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      { title: OG_TITLE },
      { name: 'description', content: OG_DESC },
      // Pumpy owns its dark palette. Extension-level recoloring can force the live Canvas/WebGL
      // game surfaces through an expensive full-page filter on every frame.
      { name: 'darkreader-lock', content: '' },
      { name: 'theme-color', content: '#07090f' },

      // Standalone / "Add to Home Screen": full-screen launch, no browser chrome. black-translucent
      // goes edge-to-edge under the status bar (the app already pads with env(safe-area-inset-*)), so the
      // strip behind the bar is our own backdrop colour. The device box drops below it via .console-stage;
      // never pay for the inset by growing the shell's forehead, that reads as a fat bezel.
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'mobile-web-app-capable', content: 'yes' },
      {
        name: 'apple-mobile-web-app-status-bar-style',
        content: 'black-translucent',
      },
      { name: 'apple-mobile-web-app-title', content: 'Pumpy' },

      // Open Graph (Telegram, iMessage, Discord, Facebook, Slack)
      { property: 'og:site_name', content: 'Pumpy' },
      { property: 'og:title', content: OG_TITLE },
      { property: 'og:description', content: OG_DESC },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: SITE_URL },
      { property: 'og:locale', content: 'en_US' },
      { property: 'og:image', content: OG_IMAGE },
      { property: 'og:image:secure_url', content: OG_IMAGE },
      { property: 'og:image:type', content: 'image/svg+xml' },
      { property: 'og:image:width', content: '1200' },
      { property: 'og:image:height', content: '630' },
      { property: 'og:image:alt', content: OG_IMAGE_ALT },

      // Twitter / X (large image card)
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: OG_TITLE },
      { name: 'twitter:description', content: OG_DESC },
      { name: 'twitter:image', content: OG_IMAGE },
      { name: 'twitter:image:alt', content: OG_IMAGE_ALT },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'canonical', href: SITE_URL },
      { rel: 'icon', type: 'image/svg+xml', href: '/pumpy-mark.svg' },
      { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
      {
        rel: 'apple-touch-icon',
        sizes: '180x180',
        href: '/apple-touch-icon.png',
      },
      { rel: 'manifest', href: '/manifest.json' },
    ],
  }),

  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* Tint the iOS status-bar strip to the saved skin before first paint, so it never flashes black.
            _app caches the color, "/" clears it. Runs in <head> since body isn't parsed yet (that part lands in _app's effect). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var c=localStorage.getItem('pumpy_console_backdrop');if(c){document.documentElement.style.background=c;var m=document.querySelector('meta[name="theme-color"]');if(m)m.content=c;}}catch(e){}`,
          }}
        />
      </head>
      <body className="bg-canvas text-text antialiased">
        <Toaster
          position="top-center"
          // Fixed to the viewport top, so on iOS it lands under the clock without the notch inset.
          containerStyle={{
            top: 'max(16px, calc(env(safe-area-inset-top) + 8px))',
          }}
          toastOptions={{
            style: {
              background: 'var(--color-surface)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-line-strong)',
              borderRadius: '14px',
              fontSize: '14px',
              fontWeight: 600,
              fontFamily: '"Gabarito Variable", ui-sans-serif, sans-serif',
            },
            // secondary is the icon-internal cutout color (no semantic token); primary tracks the brand/down tokens.
            success: {
              iconTheme: {
                primary: 'var(--color-brand-500)',
                secondary: '#1a1200',
              },
            },
            error: {
              iconTheme: { primary: 'var(--color-down)', secondary: 'white' },
            },
          }}
        />
        <PlayerWalletProvider>{children}</PlayerWalletProvider>
        <Scripts />
      </body>
    </html>
  )
}
