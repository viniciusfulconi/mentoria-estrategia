'use client'
import { useState, useEffect } from 'react'
import { supabase, dbQuery, dbInsert } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Vertical = 'ITA' | 'Medicina'

export default function Cadastro() {
  const router = useRouter()
  const [vertical, setVertical] = useState<Vertical>('ITA')
  const [mentoresITA, setMentoresITA] = useState<string[]>([])
  const [mentoresMed, setMentoresMed] = useState<{ id: string; nome: string }[]>([])
  const [alunos, setAlunos] = useState<any[]>([])
  const [form, setForm] = useState({ nome: '', email: '', senha: '', papel: 'aluno', mentor_nome: '', aluno_id: '' })
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    // Opções dos dropdowns vêm da API (service role no servidor) — a página é
    // pública e as tabelas resultados/mentores não têm mais leitura anônima.
    fetch('/api/cadastro/opcoes')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data?.mentoresITA)) setMentoresITA(data.mentoresITA)
        if (Array.isArray(data?.mentoresMed)) setMentoresMed(data.mentoresMed)
        if (Array.isArray(data?.alunosITA)) setAlunos(data.alunosITA)
      })
      .catch(() => {})
  }, [])

  // Reseta seleção ao mudar vertical ou papel
  function setPapel(p: string) { setForm(f => ({ ...f, papel: p, mentor_nome: '', aluno_id: '' })) }
  function setVert(v: Vertical) { setVertical(v); setForm(f => ({ ...f, mentor_nome: '', aluno_id: '' })) }

  async function cadastrar() {
    if (!form.nome || !form.email || !form.senha) { setErro('Preencha todos os campos.'); return }
    if (form.senha.length < 6) { setErro('Senha deve ter pelo menos 6 caracteres.'); return }
    if (form.papel === 'mentor' && !form.mentor_nome) { setErro('Selecione seu nome na lista.'); return }
    if (form.papel === 'aluno' && vertical === 'ITA' && !form.aluno_id) { setErro('Selecione seu nome na lista.'); return }
    setLoading(true); setErro('')

    const { data: authData, error: authErr } = await supabase.auth.signUp({ email: form.email, password: form.senha })
    if (authErr) { setErro(authErr.message); setLoading(false); return }

    const { error: perfilErr } = await dbInsert('perfis', [{
      id: authData.user?.id,
      email: form.email,
      nome: form.nome,
      papel: form.papel,
      status: 'pendente',
      vertical,
      mentor_nome: form.papel === 'mentor' ? form.mentor_nome : null,
      aluno_id: form.papel === 'aluno' && vertical === 'ITA' ? form.aluno_id : null,
    }])

    if (perfilErr) {
      // Índice único uniq_perfis_aluno_id: este aluno já foi reivindicado por outro cadastro.
      const msg = /uniq_perfis_aluno_id|duplicate key/i.test(perfilErr)
        ? 'Este aluno já possui um cadastro vinculado. Fale com a coordenação.'
        : perfilErr
      setErro(msg); setLoading(false); return
    }
    router.push('/aguardando')
  }

  const mentoresExibir = vertical === 'Medicina' ? mentoresMed.map(m => m.nome) : mentoresITA

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#F7F6F3' }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#f97316' }}>Cadastro</div>
          <div style={{ fontSize: 13, color: '#999', marginTop: 4 }}>Solicite seu acesso</div>
        </div>

        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Seletor de vertical */}
          <div>
            <label>Programa</label>
            <div style={{ display: 'flex', background: '#F1F5F9', borderRadius: 10, padding: 3, gap: 2 }}>
              {(['ITA', 'Medicina'] as Vertical[]).map(v => (
                <button key={v} type="button" onClick={() => setVert(v)} style={{
                  flex: 1, padding: '7px 0', borderRadius: 8, border: 'none',
                  cursor: 'pointer', fontSize: 13, fontWeight: 600,
                  fontFamily: 'DM Sans, sans-serif',
                  background: vertical === v ? 'white' : 'transparent',
                  color: vertical === v ? '#f97316' : '#888',
                  boxShadow: vertical === v ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
                  transition: 'all 0.15s',
                }}>
                  {v === 'ITA' ? '🎯 ITA' : '🏥 Medicina'}
                </button>
              ))}
            </div>
          </div>

          <div><label>Nome completo</label><input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Seu nome" /></div>
          <div><label>E-mail</label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="seu@email.com" /></div>
          <div><label>Senha</label><input type="password" value={form.senha} onChange={e => setForm({ ...form, senha: e.target.value })} placeholder="Mínimo 6 caracteres" /></div>

          <div>
            <label>Você é</label>
            <select value={form.papel} onChange={e => setPapel(e.target.value)}>
              <option value="aluno">Aluno</option>
              <option value="mentor">Mentor</option>
              {vertical === 'ITA' && <option value="professor">Professor</option>}
              <option value="direcao">Direção</option>
            </select>
          </div>

          {form.papel === 'mentor' && (
            <div>
              <label>Seu nome como mentor</label>
              <select value={form.mentor_nome} onChange={e => setForm({ ...form, mentor_nome: e.target.value })}>
                <option value="">Selecione seu nome</option>
                {mentoresExibir.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              {mentoresExibir.length === 0 && (
                <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                  Nenhum mentor cadastrado para este programa ainda.
                </div>
              )}
            </div>
          )}

          {form.papel === 'aluno' && vertical === 'ITA' && (
            <div>
              <label>Seu nome na turma</label>
              <select value={form.aluno_id} onChange={e => setForm({ ...form, aluno_id: e.target.value })}>
                <option value="">Selecione seu nome</option>
                {alunos.map((a: any) => <option key={a.id_aluno} value={a.id_aluno}>{a.nome_aluno}</option>)}
              </select>
            </div>
          )}

          {erro && <div style={{ color: '#DC2626', fontSize: 13 }}>{erro}</div>}
          <button className="btn-primary" onClick={cadastrar} disabled={loading}>
            {loading ? 'Cadastrando...' : 'Solicitar acesso'}
          </button>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: '#999' }}>
          Já tem conta? <Link href="/login" style={{ color: '#f97316', fontWeight: 500 }}>Entrar</Link>
        </div>
      </div>
    </div>
  )
}
