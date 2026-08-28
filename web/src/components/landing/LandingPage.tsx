import { useNavigate } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'

import { AppFrame } from '@/components/console/AppFrame'
import { PumpyConsole } from '@/components/console/PumpyConsole'
import { ConsoleControlsProvider } from '@/components/console/controls'
import {
  DEFAULT_THEME,
  findPumpyTheme,
  themeBackdrop,
} from '@/components/console/themes'
import { useReducedMotion } from '@/hooks/useReducedMotion'
import { usePlayerWallet } from '@/lib/dreamdex/usePlayerWallet'
import { haptic } from '@/lib/haptics'

const HERO_SETTLE_MS = 900

export function LandingPage() {
  const reducedMotion = useReducedMotion()
  const navigate = useNavigate()
  const wallet = usePlayerWallet()
  const requestedEntry = useRef(false)
  const [entering, setEntering] = useState(false)
  const [theme, setTheme] = useState(DEFAULT_THEME)

  useEffect(() => {
    setTheme(findPumpyTheme(window.localStorage.getItem('pumpy:theme')))
  }, [])

  useEffect(() => {
    if (!wallet.initialized || wallet.status !== 'connected') return

    if (!requestedEntry.current || reducedMotion) {
      void navigate({ to: '/play', replace: true })
      return
    }

    setEntering(true)
    const timer = window.setTimeout(() => {
      void navigate({ to: '/play', replace: true })
    }, HERO_SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [navigate, reducedMotion, wallet.initialized, wallet.status])

  const enter = useCallback(() => {
    if (entering || wallet.status === 'connecting') return
    requestedEntry.current = true
    haptic('rigid')

    if (wallet.status === 'wrong-network') {
      void wallet.switchNetwork()
      return
    }
    void wallet.connect()
  }, [entering, wallet])

  const busy = entering || wallet.status === 'connecting'
  const unavailable = wallet.status === 'unavailable'
  const buttonLabel = entering
    ? 'POWERING UP…'
    : wallet.status === 'connecting'
      ? 'CONNECTING…'
      : wallet.status === 'wrong-network'
        ? 'SWITCH TO SHANNON'
        : unavailable
          ? 'WALLET NOT FOUND'
          : 'CONNECT & PLAY'
  const supportCopy =
    wallet.status === 'wrong-network'
      ? 'Switch to Somnia Shannon Testnet to enter.'
      : wallet.status === 'error' || unavailable
        ? wallet.error
        : null

  return (
    <AppFrame bg={themeBackdrop(theme)} dimmed>
      <ConsoleControlsProvider>
        <PumpyConsole
          reducedMotion={reducedMotion}
          theme={theme}
          stage={entering ? 'app' : 'hero'}
          instant={false}
        />

        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center overflow-hidden text-text">
          <div
            className="absolute inset-x-0 bottom-0 h-[49%] bg-gradient-to-t from-black via-black/95 to-transparent"
            aria-hidden="true"
          />

          <div className="landing-door-rise mt-[max(24px,calc(env(safe-area-inset-top)+14px))] flex items-center gap-2.5">
            <img
              src="/pumpy-mark.svg"
              width="48"
              height="48"
              alt=""
              draggable={false}
              className="size-12 select-none drop-shadow-[0_10px_28px_rgba(0,0,0,0.65)]"
            />
            <span className="text-xl font-black tracking-[-0.035em]">
              PUMPY
            </span>
          </div>

          <div className="flex-1" />

          <div className="landing-door-rise relative z-10 w-full max-w-sm px-6 pb-[max(24px,calc(env(safe-area-inset-bottom)+18px))] text-center [animation-delay:90ms]">
            <h1 className="text-balance text-[2rem] font-black leading-[1.02] tracking-[-0.045em] sm:text-4xl">
              Built for fun. Powered by markets.
            </h1>
            <p className="mx-auto mt-2 max-w-xs text-[15px] leading-6 text-text-2">
              So fun, you forget it&apos;s trading.
            </p>

            <span className="mt-4 inline-flex min-h-7 items-center gap-2 rounded-full border border-pumpy-accent/30 bg-pumpy-accent/10 px-3 font-mono text-[10px] font-black uppercase tracking-[0.1em] text-pumpy-accent">
              <span
                className="size-1.5 rounded-full bg-pumpy-accent shadow-[0_0_10px_rgba(184,255,74,0.9)]"
                aria-hidden="true"
              />
              Testnet demo · Play money
            </span>

            <div className="pointer-events-auto mt-5">
              <button
                type="button"
                onClick={enter}
                aria-busy={busy}
                disabled={busy || unavailable}
                className="landing-power-key min-h-14 w-full rounded-2xl border border-pumpy-accent/80 bg-pumpy-accent px-6 text-base font-black tracking-[0.04em] text-pumpy-accent-ink shadow-[0_7px_0_#5f8621,0_13px_28px_rgba(0,0,0,0.5)] outline-none transition-[transform,box-shadow,filter] duration-100 ease-out hover:brightness-105 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black active:translate-y-[5px] active:shadow-[0_2px_0_#5f8621,0_6px_16px_rgba(0,0,0,0.5)] disabled:cursor-not-allowed disabled:opacity-55 motion-reduce:transition-none"
              >
                {buttonLabel}
              </button>
            </div>

            <p
              className={`mx-auto mt-3 min-h-5 max-w-xs text-pretty text-xs leading-5 ${supportCopy ? 'text-pumpy-coral' : 'text-text-3'}`}
              aria-live="polite"
            >
              {supportCopy ??
                'Wallet-signed · Somnia Shannon · Live Event Contracts'}
            </p>

            <a
              href="https://www.dreamdex.io/"
              target="_blank"
              rel="noreferrer"
              className="pointer-events-auto mx-auto mt-4 flex min-h-11 w-fit items-center gap-3 rounded-lg px-3 text-text-3 outline-none transition-colors duration-100 hover:text-text focus-visible:ring-2 focus-visible:ring-pumpy-accent motion-reduce:transition-none"
              aria-label="Powered by DreamDEX"
            >
              <span className="font-mono text-[9px] font-bold uppercase tracking-[0.14em]">
                Powered by
              </span>
              <img
                src="/assets/dreamdex-wordmark.svg"
                width="102"
                height="20"
                alt="DreamDEX"
                draggable={false}
                className="h-5 w-auto select-none opacity-90"
              />
            </a>
          </div>
        </div>
      </ConsoleControlsProvider>
    </AppFrame>
  )
}
