'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const tabs = [
  { href: '/', label: 'Início', icon: '⬡' },
  { href: '/turmas', label: 'Turmas', icon: '◈' },
  { href: '/mentores', label: 'Mentores', icon: '◉' },
  { href: '/alunos', label: 'Alunos', icon: '◎' },
  { href: '/aulas', label: 'Aulas', icon: '▶' },
]

export default function Nav() {
  const path = usePathname()
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: 'white',
      borderTop: '0.5px solid rgba(0,0,0,0.08)',
      display: 'flex',
      zIndex: 100,
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {tabs.map(t => {
        const active = t.href === '/' ? path === '/' : path.startsWith(t.href)
        return (
          <Link key={t.href} href={t.href} style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '10px 4px 8px',
            textDecoration: 'none',
            color: active ? '#534AB7' : '#999',
            fontSize: 10,
            fontWeight: active ? 600 : 400,
            gap: 3,
            transition: 'color 0.15s',
          }}>
            <span style={{ fontSize: 18 }}>{t.icon}</span>
            {t.label}
          </Link>
        )
      })}
    </nav>
  )
}
