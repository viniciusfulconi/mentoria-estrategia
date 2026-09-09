'use client'
import type { ReactNode } from 'react'

/**
 * Cabeçalho de página padrão do refresh visual: eyebrow (laranja, maiúsculas),
 * título em Outfit, ações à direita e uma faixa inferior opcional (abas, filtros).
 * Substitui o "fontSize:17 fontWeight:700 + subtítulo cinza" repetido em cada tela.
 */
export default function PageHeader({
  eyebrow, title, actions, back, children,
}: {
  eyebrow?: string
  title: ReactNode
  actions?: ReactNode
  back?: ReactNode
  children?: ReactNode
}) {
  return (
    <div style={{
      background: 'var(--card)', borderBottom: '1px solid var(--border)',
      padding: '18px 20px 14px', position: 'sticky', top: 0, zIndex: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {back}
        <div style={{ flex: 1, minWidth: 0 }}>
          {eyebrow && (
            <div style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: 'var(--primary-dark)', marginBottom: 3,
            }}>{eyebrow}</div>
          )}
          <div style={{
            fontFamily: 'var(--font-display), var(--font-jakarta), sans-serif',
            fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--navy)',
            lineHeight: 1.15,
          }}>{title}</div>
        </div>
        {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>{actions}</div>}
      </div>
      {children}
    </div>
  )
}
