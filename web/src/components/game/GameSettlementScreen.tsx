import { CheckCircle2, CircleX, LoaderCircle, Trophy } from 'lucide-react'
import type { ReactNode } from 'react'

import { cnm } from '@/utils/style'

export type SettlementTone = 'neutral' | 'win' | 'loss' | 'claimed' | 'even'

export function GameSettlementScreen({
  tone,
  kicker,
  title,
  value,
  body,
  children,
}: {
  tone: SettlementTone
  kicker: string
  title: string
  value?: string
  body: string
  children?: ReactNode
}) {
  const Icon =
    tone === 'neutral'
      ? LoaderCircle
      : tone === 'loss'
        ? CircleX
        : tone === 'claimed' || tone === 'even'
          ? CheckCircle2
          : Trophy
  const color =
    tone === 'neutral'
      ? 'text-brand-500'
      : tone === 'loss'
        ? 'text-down'
        : tone === 'even'
          ? 'text-text-2'
          : 'text-up'

  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden px-[var(--screen-rim,24px)] text-center">
      {tone !== 'neutral' && (
        <div
          className={cnm(
            'pointer-events-none absolute inset-0',
            tone === 'loss'
              ? 'bg-[radial-gradient(circle_at_50%_48%,rgba(255,90,77,.16),transparent_44%)]'
              : tone === 'even'
                ? 'bg-[radial-gradient(circle_at_50%_48%,rgba(148,163,184,.1),transparent_44%)]'
                : 'bg-[radial-gradient(circle_at_50%_48%,rgba(52,211,153,.15),transparent_44%)]',
          )}
        />
      )}
      <div className={cnm('relative', tone === 'neutral' ? '' : 'welcome-pop')}>
        <Icon
          className={cnm(
            'mx-auto h-9 w-9',
            color,
            tone === 'neutral' && 'animate-spin',
          )}
        />
        <div
          className={cnm(
            'mt-4 font-mono text-[10px] font-black uppercase tracking-[0.2em]',
            color,
          )}
        >
          {kicker}
        </div>
        <div
          className={cnm(
            'mt-1 text-[44px] font-black uppercase leading-none',
            color,
          )}
        >
          {title}
        </div>
        {value && (
          <div
            className={cnm(
              'mt-2 text-[34px] font-black leading-none tabular-nums',
              tone === 'neutral' ? 'text-text' : color,
            )}
          >
            {value}
          </div>
        )}
        <p className="mx-auto mt-4 max-w-[34ch] text-[12px] font-semibold leading-[1.45] text-text-2">
          {body}
        </p>
        {children}
      </div>
    </div>
  )
}
