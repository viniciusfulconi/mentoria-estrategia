'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Etapa = 'escolha' | 'dados' | 'sucesso'

export default function Cadastro() {
  const router = useRouter()
  const [etapa, setEtapa] = useState<Etapa>('escolha')
  const [tipo, setTipo] = useState<'aluno' | 'mentor'>('aluno')
  const [alunos, setAlunos] = useState<any[]>([])
  const [busca, setBusca] = useState('')
  const [alunoSelecionado, setAlunoSelecionado] = useState<any>(null)
  const [form, setForm] = useState({ email: '', senha: '', confirma: '', dataNasc: '', cidade: '' })
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  // Formulário mentor
  const [mentorForm, setMentorForm] = useState({ nome: '', email: '', senha: '', confirma: '' })

  useEffect(() => {
    // Carrega alunos que ainda não criaram conta
    supabase.from('alunos_dados')
      .select('*')
      .eq('cadastrado', false)
      .order('nome')
      .then(({ data }) => setAlunos(data || []))
  }, [])

  const alunosFiltrados = alunos.filter(a =>
    a.nome.toLowerCase().includes(busca.toLowerCase())
  )

  function selecionarAluno(aluno: any) {
    setAlunoSelecionado(aluno)
    setEtapa('dados')
    setErro('')
  }

  function excelDateToISO(serial: number): string {
    const base = new Date(1899, 11, 30)
    const date = new Date(base.getTime() + serial * 86400000)
    return date.toISOString().split('T')[0]
  }

  async function cadastrarAluno() {
    setErro('')
    if (!form.email || !form.senha || !form.dataNasc) {
      setErro('Preencha todos os campos obrigatórios.'); return
    }
    if (form.senha.length < 6) { setErro('Senha deve ter pelo menos 6 caracteres.'); return }
    if (form.senha !== form.confirma) { setErro('As senhas não coincidem.'); return }

    // Verifica data de nascimento
    const dataPlanilha = alunoSelecionado.data_nascimento
    const dataDigitada = form.dataNasc // formato YYYY-MM-DD
    if (dataPlanilha !== dataDigitada) {
      setErro('Data de nascimento não confere com nossos registros. Verifique e tente novamente.'); return
    }

    setLoading(true)

    // Cria conta no Supabase Auth
    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: form.email,
      password: form.senha,
    })

    if (authErr) {
      setErro(authErr.message === 'User already registered' ? 'Este e-mail já está cadastrado.' : authErr.message)
      setLoading(false); return
    }

    // Cria perfil
    const { error: perfilErr } = await supabase.from('perfis').insert([{
      id: authData.user?.id,
      email: form.email,
      nome: alunoSelecionado.nome,
      papel: 'aluno',
      status: 'aprovado', // aluno é aprovado automaticamente após verificar a data
      aluno_id: alunoSelecionado.id_aluno,
      data_nascimento: form.dataNasc,
      cidade: form.cidade,
    }])

    if (perfilErr) { setErro(perfilErr.message); setLoading(false); return }

    // Marca como cadastrado na tabela alunos_dados
    await supabase.from('alunos_dados').update({ cadastrado: true }).eq('id_aluno', alunoSelecionado.id_aluno)

    setEtapa('sucesso')
    setLoading(false)
  }

  async function cadastrarMentor() {
    setErro('')
    if (!mentorForm.nome || !mentorForm.email || !mentorForm.senha) {
      setErro('Preencha todos os campos.'); return
    }
    if (mentorForm.senha !== mentorForm.confirma) { setErro('Senhas não coincidem.'); return }
    setLoading(true)

    const { data: authData, error: authErr } = await supabase.auth.signUp({
      email: mentorForm.email,
      password: mentorForm.senha,
    })
    if (authErr) { setErro(authErr.message); setLoading(false); return }

    await supabase.from('perfis').insert([{
      id: authData.user?.id,
      email: mentorForm.email,
      nome: mentorForm.nome,
      papel: 'mentor',
      status: 'pendente', // mentor aguarda aprovação do coordenador
      mentor_nome: mentorForm.nome,
    }])

    setEtapa('sucesso')
    setLoading(false)
  }

  // Tela de sucesso
  if (etapa === 'sucesso') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#F7F6F3' }}>
        <div style={{ textAlign: 'center', maxWidth: 320 }}>
          <div style={{ fontSize: 56, marginBottom: 16 }}>🎉</div>
          <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
            {tipo === 'aluno' ? 'Conta criada!' : 'Cadastro enviado!'}
          </div>
          <div style={{ fontSize: 14, color: '#999', lineHeight: 1.6, marginBottom: 24 }}>
            {tipo === 'aluno'
              ? 'Sua conta foi criada com sucesso. Você já pode entrar na plataforma!'
              : 'Seu cadastro foi enviado. Aguarde a aprovação do coordenador.'}
          </div>
          <button className="btn-primary" onClick={() => router.push('/login')} style={{ width: '100%' }}>
            Ir para o login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F7F6F3', padding: 24 }}>
      <div style={{ maxWidth: 400, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28, paddingTop: 24 }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#534AB7' }}>Mentoria</div>
          <div style={{ fontSize: 13, color: '#999', marginTop: 4 }}>Estratégia Concursos — Criar conta</div>
        </div>

        {/* Etapa 1: Escolha tipo */}
        {etapa === 'escolha' && (
          <>
            {/* Toggle aluno/mentor */}
            <div style={{ display: 'flex', background: 'white', border: '0.5px solid rgba(0,0,0,0.08)', borderRadius: 12, padding: 4, marginBottom: 20 }}>
              {(['aluno', 'mentor'] as const).map(t => (
                <button key={t} onClick={() => { setTipo(t); setErro('') }} style={{
                  flex: 1, padding: '9px', borderRadius: 9, border: 'none',
                  background: tipo === t ? '#534AB7' : 'transparent',
                  color: tipo === t ? 'white' : '#999',
                  fontSize: 14, fontWeight: 500, cursor: 'pointer',
                  fontFamily: 'DM Sans, sans-serif',
                }}>
                  {t === 'aluno' ? '◎ Sou aluno' : '◉ Sou mentor'}
                </button>
              ))}
            </div>

            {/* ALUNO: lista para selecionar */}
            {tipo === 'aluno' && (
              <div className="card" style={{ padding: 20 }}>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Encontre seu nome</div>
                <div style={{ fontSize: 12, color: '#999', marginBottom: 14, lineHeight: 1.5 }}>
                  Digite seu nome para localizar seu cadastro na turma.
                </div>
                <input
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Digite seu nome..."
                  style={{ marginBottom: 12 }}
                />
                <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                  {busca.length < 2 ? (
                    <div style={{ textAlign: 'center', color: '#bbb', fontSize: 13, padding: 20 }}>
                      Digite pelo menos 2 letras para buscar
                    </div>
                  ) : alunosFiltrados.length === 0 ? (
                    <div style={{ textAlign: 'center', color: '#bbb', fontSize: 13, padding: 20 }}>
                      Nenhum aluno encontrado.<br />
                      <span style={{ fontSize: 11 }}>Se você já criou conta, vá para o login.</span>
                    </div>
                  ) : alunosFiltrados.map(a => (
                    <button key={a.id_aluno} onClick={() => selecionarAluno(a)} style={{
                      width: '100%', textAlign: 'left', padding: '10px 12px',
                      borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.08)',
                      background: 'white', cursor: 'pointer', marginBottom: 6,
                      fontFamily: 'DM Sans, sans-serif',
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a' }}>{a.nome}</div>
                      <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>Mentor: {a.mentor}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* MENTOR: formulário direto */}
            {tipo === 'mentor' && (
              <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 500, marginBottom: -4 }}>Dados de acesso</div>
                <div><label>Nome completo</label><input value={mentorForm.nome} onChange={e => setMentorForm({ ...mentorForm, nome: e.target.value })} placeholder="Seu nome completo" /></div>
                <div><label>E-mail</label><input type="email" value={mentorForm.email} onChange={e => setMentorForm({ ...mentorForm, email: e.target.value })} placeholder="seu@email.com" /></div>
                <div><label>Senha</label><input type="password" value={mentorForm.senha} onChange={e => setMentorForm({ ...mentorForm, senha: e.target.value })} placeholder="Mínimo 6 caracteres" /></div>
                <div><label>Confirmar senha</label><input type="password" value={mentorForm.confirma} onChange={e => setMentorForm({ ...mentorForm, confirma: e.target.value })} placeholder="Repita a senha" /></div>
                {erro && <div style={{ color: '#E24B4A', fontSize: 13 }}>{erro}</div>}
                <div style={{ fontSize: 11, color: '#999', background: '#F7F6F3', borderRadius: 8, padding: 10 }}>
                  ℹ️ Mentores aguardam aprovação do coordenador antes de acessar a plataforma.
                </div>
                <button className="btn-primary" onClick={cadastrarMentor} disabled={loading}>
                  {loading ? 'Criando conta...' : 'Criar conta'}
                </button>
              </div>
            )}
          </>
        )}

        {/* Etapa 2: Dados do aluno */}
        {etapa === 'dados' && alunoSelecionado && (
          <div className="card" style={{ padding: 20 }}>
            {/* Card do aluno selecionado */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, padding: '12px', background: '#EEEDFE', borderRadius: 12 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#534AB7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, color: 'white', flexShrink: 0 }}>
                {alunoSelecionado.nome.split(' ').map((w: string) => w[0]).slice(0, 2).join('')}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#3C3489' }}>{alunoSelecionado.nome}</div>
                <div style={{ fontSize: 11, color: '#534AB7' }}>Mentor: {alunoSelecionado.mentor}</div>
              </div>
              <button onClick={() => { setEtapa('escolha'); setAlunoSelecionado(null); setBusca('') }} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#534AB7' }}>←</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label>Data de nascimento <span style={{ color: '#E24B4A' }}>*</span></label>
                <input type="date" value={form.dataNasc} onChange={e => setForm({ ...form, dataNasc: e.target.value })} />
                <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>Usamos para confirmar sua identidade</div>
              </div>
              <div><label>E-mail <span style={{ color: '#E24B4A' }}>*</span></label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="seu@email.com" /></div>
              <div><label>Cidade de origem</label><input value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} placeholder="Ex: São Paulo - SP" /></div>
              <div><label>Senha <span style={{ color: '#E24B4A' }}>*</span></label><input type="password" value={form.senha} onChange={e => setForm({ ...form, senha: e.target.value })} placeholder="Mínimo 6 caracteres" /></div>
              <div><label>Confirmar senha <span style={{ color: '#E24B4A' }}>*</span></label><input type="password" value={form.confirma} onChange={e => setForm({ ...form, confirma: e.target.value })} placeholder="Repita a senha" /></div>

              {erro && <div style={{ color: '#E24B4A', fontSize: 13, background: '#FFF0F0', padding: 10, borderRadius: 8 }}>{erro}</div>}

              <button className="btn-primary" onClick={cadastrarAluno} disabled={loading}>
                {loading ? 'Criando conta...' : 'Criar minha conta'}
              </button>
            </div>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: '#999' }}>
          Já tem conta? <Link href="/login" style={{ color: '#534AB7', fontWeight: 500 }}>Entrar</Link>
        </div>
      </div>
    </div>
  )
}
