'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useSidebar } from '@/components/AppShell'
import { dbQuery, dbUpdate } from '@/lib/supabase'
import {
  LayoutDashboard, Users, Handshake, Calendar,
  GraduationCap, Star, ClipboardList, FileText, KeyRound,
  PlayCircle, LogOut, MoreHorizontal, Menu, X, Bell, UserCircle, Bot,
} from 'lucide-react'

type LucideIcon = React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>

const tabsCoordenadorPrimario = [
  { href: '/',             label: 'Início',       icon: LayoutDashboard },
  { href: '/simulados',    label: 'Alunos',        icon: Users },
  { href: '/atendimentos', label: 'Atendimentos',  icon: Handshake },
  { href: '/horario',      label: 'Horário',       icon: Calendar },
]

const tabsCoordenadorSecundario = [
  { href: '/turma',          label: 'Turma',      icon: GraduationCap },
  { href: '/csat',           label: 'CSAT',       icon: Star },
  { href: '/cronograma',     label: 'Cronograma', icon: ClipboardList },
  { href: '/provas-antigas', label: 'Provas',     icon: FileText },
  { href: '/aulas',          label: 'Aulas',      icon: PlayCircle },
  { href: '/admin',          label: 'Acessos',    icon: KeyRound },
  { href: '/coruja',         label: 'Coruja',     icon: Bot },
]

const tabsMentor = [
  { href: '/mentor',        label: 'Alunos',  icon: Users },
  { href: '/atendimentos',  label: 'Atend.',  icon: Handshake },
  { href: '/horario',       label: 'Horário', icon: Calendar },
  { href: '/aulas',         label: 'Aulas',   icon: PlayCircle },
  { href: '/mentor/perfil', label: 'Perfil',  icon: UserCircle },
]

const tabsAluno = [
  { href: '/meu-perfil',    label: 'Início',     icon: LayoutDashboard },
  { href: '/cronograma/meu', label: 'Cronograma', icon: ClipboardList },
  { href: '/horario',        label: 'Horário',    icon: Calendar },
  { href: '/aulas',          label: 'Aulas',      icon: PlayCircle },
]

const PAPEL_LABEL: Record<string, string> = {
  coordenador: 'Coordenador',
  direcao: 'Direção',
  mentor: 'Mentor',
  aluno: 'Aluno',
}

function NavItem({ href, icon: Icon, label, active }: { href: string; icon: LucideIcon; label: string; active: boolean }) {
  return (
    <Link href={href} style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '9px 12px', borderRadius: 10, textDecoration: 'none',
      background: active ? 'var(--purple-light)' : 'transparent',
      color: active ? 'var(--purple)' : 'var(--text-muted)',
      fontWeight: active ? 600 : 400, fontSize: 14,
      transition: 'background 0.15s, color 0.15s',
    }}
    onMouseEnter={e => { if (!active) e.currentTarget.style.background = '#F1F3F7' }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      <span style={{ width: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={18} strokeWidth={active ? 2.5 : 2} />
      </span>
      {label}
    </Link>
  )
}

export default function Nav() {
  const path = usePathname()
  const { perfil, signOut, loading } = useAuth()
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
    dbQuery(
      'notificacoes',
      { aluno_id: `eq.${perfil.aluno_id}`, order: 'criado_em.desc' },
      'id,tipo,titulo,mensagem,lida,criado_em'
    ).then(({ data }) => {
      const items = data || []
      setNotificacoes(items)
      setNaoLidas(items.filter((n: any) => !n.lida).length)
    })
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
        if (currentY < 60) {
          setNavVisible(true)
        } else if (currentY > lastScrollY.current + 4) {
          setNavVisible(false)
          setDrawerAberto(false)
          setNotifAberto(false)
        } else if (currentY < lastScrollY.current - 4) {
          setNavVisible(true)
        }
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
        position: 'fixed', left: 0, top: 0, bottom: 0, width: 240,
        background: 'white', borderRight: '1px solid var(--border)',
        zIndex: 100,
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
  const alunoHome = perfil?.aluno_id ? `/aluno/${perfil.aluno_id}` : '/meu-perfil'
  const tabsAlunoFinal = tabsAluno.map(t => t.href === '/meu-perfil' ? { ...t, href: alunoHome } : t)
  const tabs = isGestor ? tabsCoordenadorPrimario : papel === 'mentor' ? tabsMentor : tabsAlunoFinal
  const iniciais = perfil?.nome?.split(' ').map(w => w[0]).slice(0, 2).join('') || '?'
  const secundarioAtivo = isGestor && tabsCoordenadorSecundario.some(t => path.startsWith(t.href))

  return (
    <>
      {/* ══════════════════════════════════════
          SIDEBAR — desktop only
      ══════════════════════════════════════ */}
      <aside className="sidebar-desktop" style={{
        position: 'fixed', left: 0, top: 0, bottom: 0, width: 240,
        background: 'white', borderRight: '1px solid var(--border)',
        zIndex: 100, flexDirection: 'column',
        boxShadow: '1px 0 0 var(--border)',
        transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)',
        transition: 'transform 0.25s ease',
      }}>
        {/* Logo + toggle */}
        <div style={{
          padding: '22px 20px 18px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--purple)', letterSpacing: '-0.3px', lineHeight: 1.2 }}>
              Mentoria
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-hint)', marginTop: 3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Estratégia Concursos
            </div>
          </div>
          <button
            onClick={toggleSidebar}
            title="Recolher menu"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-hint)', padding: 6, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={17} strokeWidth={2} />
          </button>
        </div>

        {/* Itens de navegação */}
        <div style={{ flex: 1, padding: '12px 10px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {tabs.map(t => {
            const active = t.href === '/' ? path === '/' : path.startsWith(t.href)
            return <NavItem key={t.href} href={t.href} icon={t.icon} label={t.label} active={active} />
          })}

          {isGestor && (
            <>
              <div style={{
                fontSize: 10, fontWeight: 600, color: 'var(--text-hint)',
                textTransform: 'uppercase', letterSpacing: '0.09em',
                padding: '14px 12px 6px',
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
        <div style={{ padding: '10px 10px 12px', borderTop: '1px solid var(--border)' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', marginBottom: 2,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'var(--purple-light)', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: 700, color: 'var(--purple-dark)',
            }}>
              {iniciais}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13, fontWeight: 600, color: 'var(--text)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {perfil?.nome}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-hint)', marginTop: 1 }}>
                {PAPEL_LABEL[papel || ''] || ''}
              </div>
            </div>
            {papel === 'aluno' && (
              <button
                onClick={() => { setNotifAberto(v => !v); if (naoLidas > 0) marcarTodasLidas() }}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: naoLidas > 0 ? '#EF4444' : 'var(--text-hint)',
                  padding: 4, borderRadius: 6, position: 'relative',
                  display: 'flex', alignItems: 'center',
                }}
                title="Avisos"
              >
                <Bell size={16} strokeWidth={2} />
                {naoLidas > 0 && (
                  <span style={{
                    position: 'absolute', top: -2, right: -2,
                    background: '#EF4444', color: 'white',
                    borderRadius: '50%', width: 12, height: 12,
                    fontSize: 7, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {naoLidas > 9 ? '9+' : naoLidas}
                  </span>
                )}
              </button>
            )}
          </div>

          {/* Painel de notificações (desktop sidebar) */}
          {papel === 'aluno' && notifAberto && (
            <div style={{
              background: '#F8FAFC', borderRadius: 12, padding: 12, marginBottom: 8,
              border: '0.5px solid rgba(0,0,0,0.08)', maxHeight: 240, overflowY: 'auto',
            }}>
              {notificacoes.length === 0 ? (
                <div style={{ fontSize: 12, color: '#999', textAlign: 'center', padding: 12 }}>Nenhum aviso.</div>
              ) : notificacoes.map(n => (
                <div key={n.id} style={{
                  padding: '8px 10px', borderRadius: 10, marginBottom: 6,
                  background: n.lida ? 'white' : '#EFF6FF',
                  border: `0.5px solid ${n.lida ? 'rgba(0,0,0,0.06)' : 'rgba(37,99,235,0.15)'}`,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#1a1a1a' }}>{n.titulo}</div>
                  <div style={{ fontSize: 11, color: '#666', marginTop: 2 }}>{n.mensagem}</div>
                  <div style={{ fontSize: 10, color: '#999', marginTop: 3 }}>
                    {new Date(n.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                  </div>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={signOut}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 12px', borderRadius: 10, border: 'none',
              background: 'transparent', color: 'var(--text-hint)',
              fontSize: 13, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#FFF0F0'; e.currentTarget.style.color = 'var(--red)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-hint)' }}
          >
            <span style={{ width: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <LogOut size={15} strokeWidth={2} />
            </span>
            Sair
          </button>
        </div>
      </aside>

      {/* Botão para reabrir sidebar (desktop, quando fechada) */}
      {!sidebarOpen && (
        <button
          className="sidebar-desktop"
          onClick={toggleSidebar}
          title="Abrir menu"
          style={{
            position: 'fixed', top: 16, left: 16, zIndex: 101,
            background: 'white', border: '1px solid var(--border)',
            borderRadius: 10, padding: '8px 10px',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-sm)',
            color: 'var(--purple)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Menu size={18} strokeWidth={2} />
        </button>
      )}

      {/* ══════════════════════════════════════
          MOBILE — bottom nav + drawer
      ══════════════════════════════════════ */}

      {/* Overlay do drawer */}
      {(drawerAberto || notifAberto) && (
        <div
          className="nav-mobile-only"
          onClick={() => { setDrawerAberto(false); setNotifAberto(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 98 }}
        />
      )}

      {/* Drawer "Mais" (coordenador) */}
      {isGestor && (
        <div className="nav-mobile-only" style={{
          position: 'fixed', bottom: 'var(--nav-h)', left: 0, right: 0, zIndex: 99,
          background: 'white', borderRadius: '20px 20px 0 0',
          borderTop: '1px solid var(--border)',
          padding: '16px 16px 8px',
          transform: drawerAberto && navVisible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.25s ease',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.10)',
        }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#E0E0E0', margin: '0 auto 16px' }} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            {tabsCoordenadorSecundario.map(t => {
              const active = path.startsWith(t.href)
              const Icon = t.icon
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  onClick={() => setDrawerAberto(false)}
                  style={{
                    textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 16px', borderRadius: 14,
                    background: active ? 'var(--purple-light)' : 'var(--bg)',
                    border: `1px solid ${active ? 'var(--purple)' : 'transparent'}`,
                  }}
                >
                  <Icon size={20} strokeWidth={active ? 2.5 : 2} color={active ? 'var(--purple)' : 'var(--text-muted)'} />
                  <span style={{ fontSize: 14, fontWeight: active ? 600 : 400, color: active ? 'var(--purple)' : 'var(--text)' }}>
                    {t.label}
                  </span>
                </Link>
              )
            })}
          </div>
          <button
            onClick={() => { setDrawerAberto(false); signOut() }}
            style={{
              width: '100%', padding: '13px', borderRadius: 12,
              border: '1px solid rgba(0,0,0,0.09)', background: 'white',
              color: 'var(--red)', fontSize: 14, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <LogOut size={15} strokeWidth={2} /> Sair
          </button>
        </div>
      )}

      {/* Drawer de notificações (aluno) */}
      {papel === 'aluno' && (
        <div className="nav-mobile-only" style={{
          position: 'fixed', bottom: 'var(--nav-h)', left: 0, right: 0, zIndex: 99,
          background: 'white', borderRadius: '20px 20px 0 0',
          borderTop: '1px solid var(--border)',
          padding: '16px 16px 8px',
          transform: notifAberto && navVisible ? 'translateY(0)' : 'translateY(100%)',
          transition: 'transform 0.25s ease',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.10)',
          maxHeight: '70vh', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: '#E0E0E0', margin: '0 auto 16px' }} />
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Avisos</div>
          <div style={{ flex: 1, overflowY: 'auto', marginBottom: 10 }}>
            {notificacoes.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#999', padding: 32, fontSize: 13 }}>Nenhum aviso ainda.</div>
            ) : notificacoes.map(n => (
              <div key={n.id} style={{
                padding: '12px', borderRadius: 12, marginBottom: 8,
                background: n.lida ? '#F8FAFC' : '#EFF6FF',
                border: `0.5px solid ${n.lida ? 'rgba(0,0,0,0.06)' : 'rgba(37,99,235,0.15)'}`,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>{n.titulo}</div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{n.mensagem}</div>
                <div style={{ fontSize: 10, color: '#999', marginTop: 4 }}>
                  {new Date(n.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => { setNotifAberto(false); signOut() }}
            style={{
              width: '100%', padding: '13px', borderRadius: 12,
              border: '1px solid rgba(0,0,0,0.09)', background: 'white',
              color: 'var(--red)', fontSize: 14, fontWeight: 500,
              cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <LogOut size={15} strokeWidth={2} /> Sair
          </button>
        </div>
      )}

      {/* Bottom nav */}
      <nav className="nav-mobile-only" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'white', borderTop: '1px solid var(--border)',
        display: 'flex', zIndex: 100,
        paddingBottom: 'env(safe-area-inset-bottom)',
        boxShadow: '0 -1px 10px rgba(0,0,0,0.06)',
        height: 'var(--nav-h)',
        transform: navVisible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.28s ease',
      }}>
        {tabs.map(t => {
          const active = t.href === '/' ? path === '/' : path.startsWith(t.href)
          const Icon = t.icon
          return (
            <Link key={t.href} href={t.href} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '6px 4px',
              textDecoration: 'none',
              color: active ? 'var(--purple)' : 'var(--text-hint)',
              fontSize: 9, fontWeight: active ? 600 : 400,
              gap: 4, transition: 'color 0.15s',
            }}>
              <Icon size={20} strokeWidth={active ? 2.5 : 2} />
              {t.label}
            </Link>
          )
        })}

        {isGestor ? (
          <button
            onClick={() => setDrawerAberto(v => !v)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '6px 4px',
              background: 'none', border: 'none',
              color: drawerAberto || secundarioAtivo ? 'var(--purple)' : 'var(--text-hint)',
              fontSize: 9, fontWeight: drawerAberto || secundarioAtivo ? 600 : 400,
              gap: 4, cursor: 'pointer',
            }}
          >
            <MoreHorizontal size={20} strokeWidth={drawerAberto || secundarioAtivo ? 2.5 : 2} />
            Mais
          </button>
        ) : papel === 'mentor' ? null
        : papel === 'aluno' ? (
          <button
            onClick={() => { setNotifAberto(v => !v); if (naoLidas > 0 && !notifAberto) marcarTodasLidas() }}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '6px 4px',
              background: 'none', border: 'none',
              color: notifAberto ? 'var(--purple)' : naoLidas > 0 ? '#EF4444' : 'var(--text-hint)',
              fontSize: 9, fontWeight: notifAberto ? 600 : 400,
              gap: 4, cursor: 'pointer', position: 'relative',
            }}
          >
            <div style={{ position: 'relative' }}>
              <Bell size={20} strokeWidth={notifAberto ? 2.5 : 2} />
              {naoLidas > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4,
                  background: '#EF4444', color: 'white',
                  borderRadius: '50%', minWidth: 14, height: 14,
                  fontSize: 8, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 2px',
                }}>
                  {naoLidas > 9 ? '9+' : naoLidas}
                </span>
              )}
            </div>
            Avisos
          </button>
        ) : (
          <button
            onClick={signOut}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', padding: '6px 4px',
              background: 'none', border: 'none',
              color: 'var(--text-hint)', fontSize: 9, gap: 4, cursor: 'pointer',
            }}
          >
            <LogOut size={20} strokeWidth={2} />
            Sair
          </button>
        )}
      </nav>
    </>
  )
}
