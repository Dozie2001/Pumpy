import { createFileRoute } from '@tanstack/react-router'
import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { AppFrame } from '@/components/console/AppFrame'
import ConsoleCanvas from '@/components/console/ConsoleCanvas'
import {
  ConsoleControlsProvider,
  useConsoleView,
} from '@/components/console/controls'
import { DEFAULT_THEME, themeBackdrop } from '@/components/console/themes'
import { PumpyExperience } from '@/components/pumpy/PumpyExperience'
import { useReducedMotion } from '@/hooks/useReducedMotion'

export const Route = createFileRoute('/_app')({ component: PumpyApp })

function PumpyApp() {
  const reducedMotion = useReducedMotion()

  return (
    <AppFrame bg={themeBackdrop(DEFAULT_THEME)}>
      <ConsoleControlsProvider>
        <PumpyConsole reducedMotion={reducedMotion}>
          <PumpyExperience />
        </PumpyConsole>
      </ConsoleControlsProvider>
    </AppFrame>
  )
}

function PumpyConsole({
  children,
  reducedMotion,
}: {
  children: ReactNode
  reducedMotion: boolean
}) {
  const { view, handlers } = useConsoleView()

  return (
    <ConsoleBoundary
      fallback={
        <PumpyDeviceFallback view={view} handlers={handlers}>
          {children}
        </PumpyDeviceFallback>
      }
    >
      <ConsoleCanvas
        view={view}
        handlers={handlers}
        theme={DEFAULT_THEME}
        reducedMotion={reducedMotion}
        instant
      >
        {children}
      </ConsoleCanvas>
    </ConsoleBoundary>
  )
}

class ConsoleBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.warn('[Pumpy] 3D unavailable; using accessible device fallback.', error, info)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function PumpyDeviceFallback({
  children,
  view,
  handlers,
}: {
  children: ReactNode
  view: ReturnType<typeof useConsoleView>['view']
  handlers: ReturnType<typeof useConsoleView>['handlers']
}) {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-canvas p-3 sm:p-8">
      <div className="pumpy-flat-device flex h-full max-h-[920px] w-full max-w-[470px] flex-col rounded-[42px] border border-white/10 bg-[#171d21] p-3 shadow-2xl">
        <div className="flex h-9 items-center justify-between px-3 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-[#a8b5bd]">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-pumpy-accent" aria-hidden="true" />
            {typeof view.status?.left === 'string' ? view.status.left : 'SHANNON'}
          </span>
          <span>PUMPY</span>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-[30px] border border-white/8 bg-black">
          {children}
        </div>

        <div className="grid grid-cols-[1fr_1fr_88px] gap-2.5 px-1 pb-2 pt-3">
          <FallbackButton
            label={view.action1?.label || 'UP'}
            tone={view.action1?.color}
            onClick={() => handlers.current.action1?.()}
            disabled={!view.action1}
          />
          <FallbackButton
            label={view.action2?.label || 'DOWN'}
            tone={view.action2?.color}
            onClick={() => handlers.current.action2?.()}
            disabled={!view.action2}
          />
          <FallbackButton
            label={view.main?.label || 'PLAY'}
            tone={view.main?.color || 'amber'}
            onClick={() => handlers.current.main?.()}
            disabled={!view.main}
            tall
          />
        </div>
        <div className="flex items-center justify-between px-3 pb-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#8fa0a7]">
          <span>{view.knob?.label || 'RIVAL'}</span>
          <span>
            {view.numberWheel
              ? `${view.numberWheel.format?.(view.numberWheel.value) || view.numberWheel.value} ${view.numberWheel.label || ''}`
              : 'PLAYER VS BOT'}
          </span>
        </div>
      </div>
    </div>
  )
}

function FallbackButton({
  label,
  tone,
  onClick,
  disabled,
  tall = false,
}: {
  label: string
  tone?: 'amber' | 'up' | 'down' | 'neutral'
  onClick: () => void
  disabled: boolean
  tall?: boolean
}) {
  const toneClass =
    tone === 'up'
      ? 'border-up/50 bg-up/15 text-up'
      : tone === 'down'
        ? 'border-down/50 bg-down/15 text-down'
        : tone === 'amber'
          ? 'border-pumpy-accent bg-pumpy-accent text-pumpy-accent-ink'
          : 'border-white/10 bg-[#252f34] text-white'

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-h-12 rounded-[18px] border px-2 text-[11px] font-black uppercase tracking-[0.08em] focus-visible:ring-2 focus-visible:ring-white disabled:opacity-35 ${tall ? 'row-span-2 min-h-[66px]' : ''} ${toneClass}`}
    >
      {label}
    </button>
  )
}
