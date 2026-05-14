'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

const tabsCoordenador = [
  { href: '/', label: 'Início', icon: '⬡' },
  { href: '/simulados', label: 'Alunos', icon: '◎' },
  { href: '/turma', label: 'Turma', icon: '◈' },
  { href: '/atendimentos', label: 'Atend.', icon: '🤝' },
  { href: '/csat', label: 'CSAT', icon: '⭐' },
  { href: '/cronograma', label: 'Crono.', icon: '📋' },
  { href: '/horario', label: 'Horário', icon: '📅' },
  { href: '/admin', label: 'Acessos', icon: '🔑' },
]

const tabsMentor = [
  { href: '/mentor', label: 'Alunos', icon: '◎' },
  { href: '/atendimentos', label: 'Atend.', icon: '🤝' },
  { href: '/horario', label: 'Horário', icon: '📅' },
  { href: '/aulas', label: 'Aulas', icon: '▶' },
]

const tabsAluno = [
  { href: '/meu-perfil', label: 'Início', icon: '◎' },
  { href: '/cronograma/meu', label: 'Cronograma', icon: '📋' },
  { href: '/horario', label: 'Horário', icon: '📅' },
  { href: '/aulas', label: 'Aulas', icon: '▶' },
]

export default function Nav() {
  const path = usePathname()
  const { perfil, signOut, loading } = useAuth()

  if (loading) return <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '0.5px solid rgba(0,0,0,0.08)', height: 56, zIndex: 100 }} />

  const papel = perfil?.papel
  const tabs = papel === 'coordenador' ? tabsCoordenador : papel === 'mentor' ? tabsMentor : tabsAluno

  return (
    <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '0.5px solid rgba(0,0,0,0.08)', display: 'flex', zIndex: 100, paddingBottom: 'env(safe-area-inset-bottom)', overflowX: 'auto' }}>
      {tabs.map(t => {
        const active = t.href === '/' ? path === '/' : path.startsWith(t.href)
        return (
          <Link key={t.href} href={t.href} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 4px 6px', textDecoration: 'none', color: active ? '#534AB7' : '#999', fontSize: 9, fontWeight: active ? 600 : 400, gap: 2, transition: 'color 0.15s', minWidth: 50 }}>
            <span style={{ fontSize: 16 }}>{t.icon}</span>
            {t.label}
          </Link>
        )
      })}
      <button onClick={signOut} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 4px 6px', background: 'none', border: 'none', color: '#999', fontSize: 9, gap: 2, cursor: 'pointer', minWidth: 50 }}>
        <span style={{ fontSize: 16 }}>↩</span>
        Sair
      </button>
    </nav>
  )
}
