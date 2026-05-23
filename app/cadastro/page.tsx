'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function Cadastro() {
  const router = useRouter()
  const [mentores, setMentores] = useState<string[]>([])
  const [alunos, setAlunos] = useState<any[]>([])
  const [form, setForm] = useState({ nome: '', email: '', senha: '', papel: 'aluno', mentor_nome: '', aluno_id: '' })
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    // Busca mentores únicos da planilha
    supabase.from('resultados').select('mentor').eq('fase', 'ranking').then(({ data }) => {
      const ms = [...new Set((data || []).map((r: any) => r.mentor).filter(Boolean))].sort() as string[]
      setMentores(ms)
    })
    // Busca alunos únicos
    supabase.from('resultados').select('id_aluno, nome_aluno').eq('fase', 'ranking').then(({ data }) => {
      const seen = new Set()
      const unique = (data || []).filter((r: any) => {
        if (seen.has(r.id_aluno)) return false
        seen.add(r.id_aluno); return true
      }).sort((a: any, b: any) => a.nome_aluno.localeCompare(b.nome_aluno))
      setAlunos(unique)
    })
  }, [])

  async function cadastrar() {
    if (!form.nome || !form.email || !form.senha) { setErro('Preencha todos os campos.'); return }
    if (form.senha.length < 6) { setErro('Senha deve ter pelo menos 6 caracteres.'); return }
    if (form.papel === 'mentor' && !form.mentor_nome) { setErro('Selecione seu nome de mentor.'); return }
    if (form.papel === 'aluno' && !form.aluno_id) { setErro('Selecione seu nome na lista.'); return }
    setLoading(true); setErro('')

    const { data: authData, error: authErr } = await supabase.auth.signUp({ email: form.email, password: form.senha })
    if (authErr) { setErro(authErr.message); setLoading(false); return }

    const { error: perfilErr } = await supabase.from('perfis').insert([{
      id: authData.user?.id,
      email: form.email,
      nome: form.nome,
      papel: form.papel,
      status: 'pendente',
      mentor_nome: form.papel === 'mentor' ? form.mentor_nome : null,
      aluno_id: form.papel === 'aluno' ? form.aluno_id : null,
    }])

    if (perfilErr) { setErro(perfilErr.message); setLoading(false); return }
    router.push('/aguardando')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#F7F6F3' }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#2563EB' }}>Cadastro</div>
          <div style={{ fontSize: 13, color: '#999', marginTop: 4 }}>Solicite seu acesso</div>
        </div>

        <div className="card" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div><label>Nome completo</label><input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Seu nome" /></div>
          <div><label>E-mail</label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="seu@email.com" /></div>
          <div><label>Senha</label><input type="password" value={form.senha} onChange={e => setForm({ ...form, senha: e.target.value })} placeholder="Mínimo 6 caracteres" /></div>

          <div>
            <label>Você é</label>
            <select value={form.papel} onChange={e => setForm({ ...form, papel: e.target.value, mentor_nome: '', aluno_id: '' })}>
              <option value="aluno">Aluno</option>
              <option value="mentor">Mentor</option>
            </select>
          </div>

          {form.papel === 'mentor' && (
            <div>
              <label>Seu nome como mentor</label>
              <select value={form.mentor_nome} onChange={e => setForm({ ...form, mentor_nome: e.target.value })}>
                <option value="">Selecione seu nome</option>
                {mentores.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          )}

          {form.papel === 'aluno' && (
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
          Já tem conta? <Link href="/login" style={{ color: '#2563EB', fontWeight: 500 }}>Entrar</Link>
        </div>
      </div>
    </div>
  )
}
