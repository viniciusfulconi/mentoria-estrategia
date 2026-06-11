'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { useAuth, type Vertical } from '@/contexts/AuthContext'
import { useSidebar } from '@/components/AppShell'
import { dbQuery, dbUpdate } from '@/lib/supabase'
import {
  LayoutDashboard, Users, Handshake, Calendar,
  GraduationCap, Star, ClipboardList, FileText, KeyRound,
  PlayCircle, LogOut, MoreHorizontal, Menu, X, Bell, UserCircle, Bot, Trophy, BookOpen, NotebookPen,
} from 'lucide-react'

type LucideIcon = React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>

const tabsCoordenadorPrimario = [
  { href: '/',             label: 'Início',      icon: LayoutDashboard },
  { href: '/simulados',    label: 'Alunos',      icon: Users },
  { href: '/atendimentos', label: 'Atendimentos', icon: Handshake },
  { href: '/horario',      label: 'Horário',     icon: Calendar },
]
const tabsCoordenadorSecundarioITA = [
  { href: '/turma',          label: 'Turma',      icon: GraduationCap },
  { href: '/csat',           label: 'CSAT',       icon: Star },
  { href: '/cronograma',     label: 'Cronograma', icon: ClipboardList },
  { href: '/provas-antigas', label: 'Provas',     icon: FileText },
  { href: '/aulas',          label: 'Aulas',      icon: PlayCircle },
  { href: '/aprovados-ita',  label: 'ITA',        icon: Trophy },
  { href: '/aprovados-ime',  label: 'IME',        icon: Trophy },
  { href: '/admin',          label: 'Acessos',    icon: KeyRound },
  { href: '/coruja',         label: 'Coruja',     icon: Bot },
]
const tabsCoordenadorSecundarioMed = [
  { href: '/med/simulados', label: 'Simulados', icon: BookOpen },
  { href: '/turmas',        label: 'Turmas',    icon: GraduationCap },
  { href: '/mentores',      label: 'Mentores',  icon: Users },
  { href: '/cronograma',    label: 'Cronograma', icon: ClipboardList },
  { href: '/csat',          label: 'CSAT',      icon: Star },
  { href: '/admin',         label: 'Acessos',   icon: KeyRound },
  { href: '/coruja',        label: 'Coruja',    icon: Bot },
]
const tabsMentor = [
  { href: '/mentor',        label: 'Alunos',  icon: Users },
  { href: '/atendimentos',  label: 'Atend.',  icon: Handshake },
  { href: '/horario',       label: 'Horário', icon: Calendar },
  { href: '/aulas',         label: 'Aulas',   icon: PlayCircle },
  { href: '/mentor/perfil', label: 'Perfil',  icon: UserCircle },
]
const tabsAluno = [
  { href: '/meu-perfil',     label: 'Início',     icon: LayoutDashboard },
  { href: '/cronograma/meu', label: 'Cronograma', icon: ClipboardList },
  { href: '/horario',        label: 'Horário',    icon: Calendar },
  { href: '/aulas',          label: 'Aulas',      icon: PlayCircle },
  { href: '/quadro',         label: 'Quadro',     icon: NotebookPen },
]
const tabsProfessor = [
  { href: '/simulados', label: 'Alunos',  icon: Users },
  { href: '/turma',     label: 'Turma',   icon: GraduationCap },
  { href: '/horario',   label: 'Horário', icon: Calendar },
]
const PAPEL_LABEL: Record<string, string> = {
  coordenador: 'Coordenador', direcao: 'Direção',
  mentor: 'Mentor', aluno: 'Aluno', professor: 'Professor',
}

// ─── NavItem — estilo navy sidebar ───────────────────────────────────────────
function NavItem({ href, icon: Icon, label, active }: {
  href: string; icon: LucideIcon; label: string; active: boolean
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', borderRadius: 10, textDecoration: 'none',
        background: active ? 'rgba(249,115,22,0.18)' : 'transparent',
        color: active ? '#fb923c' : 'rgba(255,255,255,0.6)',
        fontWeight: active ? 700 : 400,
        fontSize: 14,
        transition: 'background 0.15s, color 0.15s',
      }}
      onMouseEnter={e => { if (!active) { e.currentTarget.style.background = 'rgba(255,255,255,0.07)'; e.currentTarget.style.color = 'rgba(255,255,255,0.9)' } }}
      onMouseLeave={e => { if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.6)' } }}
    >
      <Icon size={17} strokeWidth={active ? 2.5 : 2} />
      <span>{label}</span>
    </Link>
  )
}

// ─── Main Nav ────────────────────────────────────────────────────────────────
export default function Nav() {
  const path = usePathname()
  const { perfil, signOut, loading, verticalAtiva, setVerticalAtiva } = useAuth()
  const { open: sidebarOpen, toggle: toggleSidebar } = useSidebar()
  const [drawerAberto, setDrawerAberto] = useState(false)
  const [notifAberto, setNotifAberto] = useState(false)
  const [navVisible, setNavVisible] = useState(true)
  const [notificacoes, setNotificacoes] = useState<any[]>([])
  const [naoLidas, setNaoLidas] = useState(0)
  const lastScrollY = useRef(0)
  const ticking = useRef(false)

  useEffect(() => {
    if (!perfil?.aluno_id) return
    dbQuery('notificacoes', { aluno_id: `eq.${perfil.aluno_id}`, order: 'criado_em.desc' }, 'id,tipo,titulo,mensagem,lida,criado_em')
      .then(({ data }) => {
        const items = data || []
        setNotificacoes(items)
        setNaoLidas(items.filter((n: any) => !n.lida).length)
      }).catch(() => {})
  }, [perfil])

  async function marcarTodasLidas() {
    if (!perfil?.aluno_id) return
    await dbUpdate('notificacoes', { aluno_id: `eq.${perfil.aluno_id}`, lida: 'eq.false' }, { lida: true })
    setNotificacoes(prev => prev.map(n => ({ ...n, lida: true })))
    setNaoLidas(0)
  }

  useEffect(() => {
    function handleScroll() {
      if (ticking.current) return
      ticking.current = true
      requestAnimationFrame(() => {
        const currentY = window.scrollY
        if (currentY < 60) setNavVisible(true)
        else if (currentY > lastScrollY.current + 4) { setNavVisible(false); setDrawerAberto(false); setNotifAberto(false) }
        else if (currentY < lastScrollY.current - 4) setNavVisible(true)
        lastScrollY.current = currentY
        ticking.current = false
      })
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  if (loading) return (
    <>
      <aside className="sidebar-desktop" style={{
        position: 'fixed', left: 0, top: 0, bottom: 0, width: 230,
        background: '#0f2554', zIndex: 100,
      }} />
      <nav className="nav-mobile-only" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'white', borderTop: '1px solid var(--border)',
        height: 'var(--nav-h)', zIndex: 100,
      }} />
    </>
  )

  const papel = perfil?.papel
  const isGestor = papel === 'coordenador' || papel === 'direcao'

  const alunoHome = perfil?.vertical === 'Medicina'
    ? '/med/aluno'
    : perfil?.aluno_id ? `/aluno/${perfil.aluno_id}` : '/meu-perfil'

  const tabsAlunoFinal = tabsAluno.map(t => t.href === '/meu-perfil' ? { ...t, href: alunoHome } : t)

  const tabsPrimarioFinal = isGestor && verticalAtiva === 'Medicina'
    ? tabsCoordenadorPrimario.map(t => {
        if (t.href === '/simulados') return { ...t, href: '/med/alunos' }
        return t
      })
    : tabsCoordenadorPrimario

  const tabsMentorFinal = papel === 'mentor' && perfil?.vertical === 'Medicina'
    ? tabsMentor.map(t => t.href === '/mentor' ? { ...t, href: '/med/mentor' } : t)
    : tabsMentor

  const tabs = isGestor ? tabsPrimarioFinal
    : papel === 'mentor' ? tabsMentorFinal
    : papel === 'professor' ? tabsProfessor
    : tabsAlunoFinal

  const iniciais = perfil?.nome?.split(' ').map(w => w[0]).slice(0, 2).join('') || '?'
  const tabsCoordenadorSecundario = verticalAtiva === 'Medicina'
    ? tabsCoordenadorSecundarioMed : tabsCoordenadorSecundarioITA
  const secundarioAtivo = isGestor && tabsCoordenadorSecundario.some(t => path.startsWith(t.href))

  // ─── Sidebar desktop (navy) ─────────────────────────────────────────────
  return (
    <>
      <aside className="sidebar-desktop" style={{
        position: 'fixed', left: 0, top: 0, bottom: 0, width: 230,
        background: 'linear-gradient(180deg, #0f2554 0%, #0a1a3a 100%)',
        zIndex: 100, flexDirection: 'column',
        boxShadow: '4px 0 24px rgba(9, 30, 66, 0.25)',
        transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s ease',
      }}>
        {/* Logo */}
        <div style={{
          padding: '24px 20px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'white', letterSpacing: '-0.3px', lineHeight: 1.2 }}>
              Mentoria
            </div>
            <div style={{
              fontSize: 10, color: 'rgba(255,255,255,0.4)',
              marginTop: 2, letterSpacing: '0.12em', textTransform: 'uppercase',
            }}>
              Estratégia
            </div>
          </div>
          <button onClick={toggleSidebar} style={{
            background: 'rgba(255,255,255,0.08)', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.5)', padding: 7, borderRadius: 8,
            display: 'flex', alignItems: 'center',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.14)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
          >
            <X size={15} strokeWidth={2.5} />
          </button>
        </div>

        {/* Switcher ITA / Medicina */}
        {isGestor && (
          <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{
              display: 'flex', background: 'rgba(255,255,255,0.07)',
              borderRadius: 8, padding: 3, gap: 2,
            }}>
              {(['ITA', 'Medicina'] as Vertical[]).map(v => (
                <button key={v} onClick={() => setVerticalAtiva(v)} style={{
                  flex: 1, padding: '6px 0', borderRadius: 6, border: 'none',
                  cursor: 'pointer', fontSize: 12, fontWeight: 700, fontFamily: 'inherit',
                  background: verticalAtiva === v ? '#f97316' : 'transparent',
                  color: verticalAtiva === v ? 'white' : 'rgba(255,255,255,0.45)',
                  boxShadow: verticalAtiva === v ? '0 2px 8px rgba(249,115,22,0.4)' : 'none',
                  transition: 'all 0.15s',
                }}>
                  {v === 'ITA' ? '🎯 ITA' : '🏥 Med'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Itens de navegação */}
        <div style={{ flex: 1, padding: '10px 10px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {tabs.map(t => {
            const active = t.href === '/' ? path === '/' : path.startsWith(t.href)
            return <NavItem key={t.href} href={t.href} icon={t.icon} label={t.label} active={active} />
          })}

          {isGestor && (
            <>
              <div style={{
                fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.3)',
                textTransform: 'uppercase', letterSpacing: '0.12em',
                padding: '16px 14px 6px',
              }}>
                Mais
              </div>
              {tabsCoordenadorSecundario.map(t => {
                const active = path.startsWith(t.href)
                return <NavItem key={t.href} href={t.href} icon={t.icon} label={t.label} active={active} />
              })}
            </>
          )}
        </div>

        {/* Usuário + Sair */}
        <div style={{ padding: '10px 10px 14px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', marginBottom: 4 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              background: 'linear-gradient(135deg, #f97316, #ea580c)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 800, color: 'white',
            }}>
              {iniciais}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {perfil?.nome}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                {PAPEL_LABEL[papel || ''] || ''}
              </div>
            </div>
            {papel === 'aluno' && (
              <button onClick={() => { setNotifAberto(v => !v); if (naoLidas > 0) marcarTodasLidas() }} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: naoLidas > 0 ? '#fb923c' : 'rgba(255,255,255,0.4)',
                padding: 4, borderRadius: 6, position: 'relative', display: 'flex',
              }}>
                <Bell size={16} strokeWidth={2} />
                {naoLidas > 0 && (
                  <span style={{
                    position: 'absolute', top: -2, right: -2,
                    background: '#f97316', color: 'white',
                    borderRadius: '50%', width: 13, height: 13,
                    fontSize: 7, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{naoLidas > 9 ? '9+' : naoLidas}</span>
                )}
              </button>
            )}
          </div>

          {/* Notificações inline (desktop) */}
          {papel === 'aluno' && notifAberto && (
            <div style={{
              background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: 10, marginBottom: 6,
              border: '1px solid rgba(255,255,255,0.1)', maxHeight: 200, overflowY: 'auto',
            }}>
              {notificacoes.length === 0 ? (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', padding: 12 }}>Nenhum aviso.</div>
              ) : notificacoes.map(n => (
                <div key={n.id} style={{
                  padding: '8px 10px', borderRadius: 8, marginBottom: 4,
                  background: n.lida ? 'rgba(255,255,255,0.04)' : 'rgba(249,115,22,0.12)',
                  border: `1px solid ${n.lida ? 'rgba(255,255,255,0.06)' : 'rgba(249,115,22,0.25)'}`,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>{n.titulo}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{n.mensagem}</div>
                </div>
              ))}
            </div>
          )}

          <button onClick={signOut} style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 14px', borderRadius: 8, border: 'none',
            background: 'transparent', color: 'rgba(255,255,255,0.35)',
            fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.color = '#fca5a5' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.35)' }}
          >
            <LogOut size={15} strokeWidth={2} />
            Sair
          </button>
        </div>
      </aside>

      {/* Botão reabrir sidebar */}
      {!sidebarOpen && (
        <button className="sidebar-desktop" onClick={toggleSidebar} style={{
          position: 'fixed', top: 16, left: 16, zIndex: 101,
          background: '#0f2554', border: 'none',
          borderRadius: 10, padding: '8px 10px', cursor: 'pointer',
          color: 'white', display: 'flex', alignItems: 'center',
          boxShadow: '0 2px 12px rgba(9,30,66,0.3)',
        }}>
          <Menu size={18} strokeWidth={2} />
        </button>
      )}

      {/* ── MOBILE ──────────────────────────────────────────────────────── */}

      {(drawerAberto || notifAberto) && (
        <div className="nav-mobile-only"
          onClick={() => { setDrawerAberto(false); setNotifAberto(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(9,30,66,0.5)', zIndex: 98 }}
        />
      )}

      {/* Drawer "Mais" (coordenador) */}
      {isGestor && (
        <div className="nav-mobile-only" style={{
          position: 'fixed', bottom: 'var(--nav-h)', left: 0, right: 0, zIndex: 99,
          background: 'white', borderRadius: '16px 16px 0 0',
          borderTop: '1px solid var(--border)',
          padding: '16px 16px 8px',
          transform: drawerAberto && navVisible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.25s ease',
          boxShadow: '0 -4px 24px rgba(9,30,66,0.12)',
        }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#e2e8f0', margin: '0 auto 16px' }} />

          {/* Switcher mobile */}
          <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 10, padding: 3, gap: 2, marginBottom: 14 }}>
            {(['ITA', 'Medicina'] as Vertical[]).map(v => (
              <button key={v} onClick={() => setVerticalAtiva(v)} style={{
                flex: 1, padding: '8px 0', borderRadius: 8, border: 'none',
                cursor: 'pointer', fontSize: 13, fontWeight: 700, fontFamily: 'inherit',
                background: verticalAtiva === v ? '#0f2554' : 'transparent',
                color: verticalAtiva === v ? 'white' : 'var(--text-hint)',
                transition: 'all 0.15s',
              }}>
                {v === 'ITA' ? '🎯 ITA' : '🏥 Medicina'}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
            {tabsCoordenadorSecundario.map(t => {
              const active = path.startsWith(t.href)
              const Icon = t.icon
              return (
                <Link key={t.href} href={t.href} onClick={() => setDrawerAberto(false)} style={{
                  textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 14px', borderRadius: 12,
                  background: active ? '#fff7ed' : '#f8fafc',
                  border: `1.5px solid ${active ? 'rgba(249,115,22,0.3)' : 'transparent'}`,
                }}>
                  <Icon size={18} strokeWidth={active ? 2.5 : 2} color={active ? '#f97316' : 'var(--text-muted)'} />
                  <span style={{ fontSize: 13, fontWeight: active ? 700 : 400, color: active ? '#f97316' : 'var(--text)' }}>
                    {t.label}
                  </span>
                </Link>
              )
            })}
          </div>

          <button onClick={() => { setDrawerAberto(false); signOut() }} style={{
            width: '100%', padding: '12px', borderRadius: 12,
            border: '1.5px solid #fee2e2', background: 'white',
            color: '#ef4444', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <LogOut size={15} strokeWidth={2} /> Sair
          </button>
        </div>
      )}

      {/* Drawer notificações (aluno) */}
      {papel === 'aluno' && (
        <div className="nav-mobile-only" style={{
          position: 'fixed', bottom: 'var(--nav-h)', left: 0, right: 0, zIndex: 99,
          background: 'white', borderRadius: '16px 16px 0 0',
          borderTop: '1px solid var(--border)',
          padding: '16px 16px 8px',
          transform: notifAberto && navVisible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.25s ease',
          maxHeight: '70vh', display: 'flex', flexDirection: 'column',
          boxShadow: '0 -4px 24px rgba(9,30,66,0.12)',
        }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#e2e8f0', margin: '0 auto 16px' }} />
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Avisos</div>
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: 10 }}>
            {notificacoes.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-hint)', padding: 32, fontSize: 13 }}>Nenhum aviso ainda.</div>
            ) : notificacoes.map(n => (
              <div key={n.id} style={{
                padding: '10px 12px', borderRadius: 10, marginBottom: 6,
                background: n.lida ? '#f8fafc' : '#fff7ed',
                border: `1px solid ${n.lida ? 'var(--border)' : 'rgba(249,115,22,0.2)'}`,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{n.titulo}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{n.mensagem}</div>
              </div>
            ))}
          </div>
          <button onClick={() => { setNotifAberto(false); signOut() }} style={{
            width: '100%', padding: '12px', borderRadius: 12,
            border: '1.5px solid #fee2e2', background: 'white',
            color: '#ef4444', fontSize: 14, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <LogOut size={15} strokeWidth={2} /> Sair
          </button>
        </div>
      )}

      {/* Bottom nav (mobile) */}
      <nav className="nav-mobile-only" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'white',
        borderTop: '1px solid var(--border)',
        display: 'flex', zIndex: 100,
        paddingBottom: 'env(safe-area-inset-bottom)',
        height: 'var(--nav-h)',
        transform: navVisible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.28s ease',
        boxShadow: '0 -2px 12px rgba(9,30,66,0.08)',
      }}>
        {tabs.map(t => {
          const active = t.href === '/' ? path === '/' : path.startsWith(t.href)
          const Icon = t.icon
          return (
            <Link key={t.href} href={t.href} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '6px 4px',
              textDecoration: 'none',
              color: active ? '#f97316' : 'var(--text-hint)',
              fontSize: 9, fontWeight: active ? 700 : 400,
              gap: 3, transition: 'color 0.12s',
              borderTop: active ? '2px solid #f97316' : '2px solid transparent',
            }}>
              <Icon size={20} strokeWidth={active ? 2.5 : 2} />
              {t.label}
            </Link>
          )
        })}

        {isGestor ? (
          <button onClick={() => setDrawerAberto(v => !v)} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '6px 4px',
            background: 'none', border: 'none',
            color: drawerAberto || secundarioAtivo ? '#f97316' : 'var(--text-hint)',
            fontSize: 9, fontWeight: drawerAberto || secundarioAtivo ? 700 : 400,
            gap: 3, cursor: 'pointer',
            borderTop: drawerAberto || secundarioAtivo ? '2px solid #f97316' : '2px solid transparent',
          }}>
            <MoreHorizontal size={20} strokeWidth={drawerAberto || secundarioAtivo ? 2.5 : 2} />
            Mais
          </button>
        ) : papel === 'mentor' ? null
        : papel === 'aluno' ? (
          <button onClick={() => { setNotifAberto(v => !v); if (naoLidas > 0 && !notifAberto) marcarTodasLidas() }} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '6px 4px',
            background: 'none', border: 'none',
            color: notifAberto ? '#f97316' : naoLidas > 0 ? '#f97316' : 'var(--text-hint)',
            fontSize: 9, fontWeight: notifAberto ? 700 : 400,
            gap: 3, cursor: 'pointer', position: 'relative',
            borderTop: notifAberto ? '2px solid #f97316' : '2px solid transparent',
          }}>
            <div style={{ position: 'relative' }}>
              <Bell size={20} strokeWidth={notifAberto ? 2.5 : 2} />
              {naoLidas > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4,
                  background: '#f97316', color: 'white',
                  borderRadius: '50%', minWidth: 14, height: 14,
                  fontSize: 8, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 2px',
                }}>{naoLidas > 9 ? '9+' : naoLidas}</span>
              )}
            </div>
            Avisos
          </button>
        ) : (
          <button onClick={signOut} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '6px 4px',
            background: 'none', border: 'none',
            color: 'var(--text-hint)', fontSize: 9, gap: 3, cursor: 'pointer',
            borderTop: '2px solid transparent',
          }}>
            <LogOut size={20} strokeWidth={2} />
            Sair
          </button>
        )}
      </nav>
    </>
  )
}
