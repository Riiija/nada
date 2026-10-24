import type { ReactNode } from 'react'
import { Logo } from '@/components/icons/Logo'
import { PreviewNotice } from '@/components/layout/PreviewNotice'

type Props = { title: string; description?: string; children: ReactNode; footer?: ReactNode; avatar?: ReactNode }

/** Page de connexion : le seul écran centré avec les états vides. */
export function AuthShell({ title, description, children, footer, avatar }: Props) {
  return (
    <div className="min-h-dvh bg-bg">
      <PreviewNotice />
      <div className="grid min-h-[calc(100dvh-1px)] place-items-center p-4">
      <main className="w-full max-w-[420px]">
        <div className="mb-6 flex items-center gap-3">
          <Logo />
          <span className="text-[15px] font-semibold">Courrier et archives</span>
        </div>
        <div className="rounded-card border border-border bg-surface p-6 shadow-card">
          {avatar ? <div className="mb-4">{avatar}</div> : null}
          <h1 className="text-xl font-bold tracking-[-0.015em]">{title}</h1>
          {description ? <p className="mt-1 mb-5 text-[13px] text-text-muted">{description}</p> : <div className="mb-5" />}
          {children}
        </div>
        {footer ? <div className="mt-4 text-[13px] text-text-muted">{footer}</div> : null}
      </main>
      </div>
    </div>
  )
}
