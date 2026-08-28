import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { ConsoleTheme } from '@/components/console/themes'
import { AppFrame } from '@/components/console/AppFrame'
import { PumpyConsole } from '@/components/console/PumpyConsole'
import { ConsoleControlsProvider } from '@/components/console/controls'
import {
  DEFAULT_THEME,
  findPumpyTheme,
  themeBackdrop,
} from '@/components/console/themes'
import { PumpyMenuDrawer } from '@/components/menu/PumpyMenuDrawer'
import { PumpyArcade } from '@/components/pumpy/PumpyArcade'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { usePlayerWallet } from '@/lib/dreamdex/usePlayerWallet'

export const Route = createFileRoute('/_app')({ component: PumpyApp })

function PumpyApp() {
  const reducedMotion = useReducedMotion()
  const wallet = usePlayerWallet()
  const navigate = useNavigate()
  const [homeSignal, setHomeSignal] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [theme, setTheme] = useState<ConsoleTheme>(DEFAULT_THEME)

  useEffect(() => {
    setTheme(findPumpyTheme(window.localStorage.getItem('pumpy:theme')))
  }, [])

  useEffect(() => {
    if (!wallet.initialized || wallet.status === 'connecting') return
    if (wallet.status !== 'connected') {
      void navigate({ to: '/', replace: true })
    }
  }, [navigate, wallet.initialized, wallet.status])

  const chooseTheme = (next: ConsoleTheme) => {
    setTheme(next)
    window.localStorage.setItem('pumpy:theme', next.id)
  }

  return (
    <AppFrame bg={themeBackdrop(theme)}>
      <ConsoleControlsProvider>
        <PumpyConsole
          reducedMotion={reducedMotion}
          theme={theme}
          onMenu={() => setMenuOpen(true)}
          onHome={() => setHomeSignal((value) => value + 1)}
        >
          <PumpyArcade homeSignal={homeSignal} wallet={wallet} />
        </PumpyConsole>
        <PumpyMenuDrawer
          open={menuOpen}
          onClose={() => setMenuOpen(false)}
          theme={theme}
          onTheme={chooseTheme}
          wallet={wallet}
        />
      </ConsoleControlsProvider>
    </AppFrame>
  )
}
