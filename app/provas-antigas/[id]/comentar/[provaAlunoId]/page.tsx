'use client'
// ─────────────────────────────────────────────────────────────────────────────
// Comentário do mentor sobre a prova de UM mentorado.
//
// Chega-se aqui pelo botão "Comentar" no ranking da prova, que só aparece nas
// linhas dos alunos de quem está logado. A guarda abaixo é conveniência de UI:
// quem realmente impede um mentor de comentar aluno alheio é o RLS da tabela
// (COMENTARIOS_PROVA_MIGRATION.sql) — a policy escopa por alunos_dados.mentor.
//
// Só provas discursivas: é onde existe PDF de resolução para o mentor abrir e
// onde "letra/organização" faz sentido. Na 1ª fase o aluno não envia nada.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { dbQuery, dbUpsert, dbInsert } from '@/lib/supabase'
import { resolverTopicos, questoesFracas, topicosSugeridos, LIMITE_QUESTAO_FRACA, type TopicoDB } from '@/lib/provas'
import { ArrowLeft, FileText } from 'lucide-react'
import Nav from '@/components/Nav'

const TIPO_LABEL: Record<string, string> = { ime: 'IME', ita: 'ITA' }

type Prova    = { id: string; nome: string; tipo: string; fase: number; num_questoes: number; modelo: string; pdf_url?: string | null }
type Questao  = { numero: number; materia: string; topicos?: string[] | null }
type Correcao = { notas?: Record<string, number> | null; pdf_correcao_url?: string | null; confirmed_at?: string | null }
type Aluno    = { id_aluno: string; nome: string; mentor: string | null }

export default function ComentarProvaPage() {
  const { perfil, loading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const provaId       = params.id as string
  const provaAlunoId  = params.provaAlunoId as string

  const [prova,     setProva]     = useState<Prova | null>(null)
  const [aluno,     setAluno]     = useState<Aluno | null>(null)
  const [questoes,  setQuestoes]  = useState<Questao[]>([])
  const [correcao,  setCorrecao]  = useState<Correcao | null>(null)
  const [topicosDB, setTopicosDB] = useState<TopicoDB[]>([])
  const [jaExistia, setJaExistia] = useState(false)
  const [fetching,  setFetching]  = useState(true)

  // Formulário
  const [letra,      setLetra]      = useState('')
  const [resolucao,  setResolucao]  = useState('')
  const [conteudo,   setConteudo]   = useState('')
  const [topicosSel, setTopicosSel] = useState<string[]>([])
  const [mostrarArvore, setMostrarArvore] = useState(false)
  const [saving, setSaving] = useState(false)
  const [erro,   setErro]   = useState('')
  const [salvo,  setSalvo]  = useState(false)

  async function load() {
    setFetching(true)
    const [{ data: pa }, { data: com }] = await Promise.all([
      dbQuery('provas_aluno',      { id: `eq.${provaAlunoId}` }),
      dbQuery('comentarios_prova', { prova_aluno_id: `eq.${provaAlunoId}` }),
    ])
    const paData = pa?.[0]
    if (!paData) { setFetching(false); return }

    const [{ data: provaData }, { data: qData }, { data: corr }, { data: alunoData }, { data: tops }] = await Promise.all([
      dbQuery('provas_antigas',        { id: `eq.${paData.prova_id}` }),
      dbQuery('questoes_prova_antiga', { prova_id: `eq.${paData.prova_id}`, order: 'numero' }),
      dbQuery('correcoes_prova',       { prova_aluno_id: `eq.${provaAlunoId}` }),
      dbQuery('alunos_dados',          { id_aluno: `eq.${paData.aluno_id}` }, 'id_aluno,nome,mentor'),
      dbQuery('topicos',               {}, 'id,materia,topico'),
    ])

    const a = alunoData?.[0]
    // O aluno tem que ser mentorado de quem está logado. provas_aluno.mentor NÃO
    // serve para isso: fica vazio quando o coordenador atribui a prova em lote.
    if (!a || a.mentor !== perfil?.mentor_nome) {
      router.replace(`/provas-antigas/${provaId}`)
      return
    }

    setProva(provaData?.[0] || null)
    setAluno(a)
    setQuestoes(qData || [])
    setCorrecao(corr?.[0] || null)
    setTopicosDB(tops || [])

    const c = com?.[0]
    if (c) {
      setJaExistia(true)
      setLetra(c.letra || '')
      setResolucao(c.resolucao || '')
      setConteudo(c.conteudo || '')
      setTopicosSel(c.topicos || [])
    } else {
      // Pré-seleção: tópicos das questões em que o aluno ficou abaixo do limite.
      setTopicosSel(topicosSugeridos(corr?.[0]?.notas, qData || []))
    }
    setFetching(false)
  }

  async function salvar() {
    if (!aluno || !prova) return
    setErro(''); setSaving(true)
    const agora = new Date().toISOString()

    const { error } = await dbUpsert('comentarios_prova', {
      prova_aluno_id: provaAlunoId,
      prova_id: prova.id,
      aluno_id: aluno.id_aluno,
      mentor: perfil?.mentor_nome || '',
      letra: letra.trim() || null,
      resolucao: resolucao.trim() || null,
      conteudo: conteudo.trim() || null,
      topicos: topicosSel,
      updated_at: agora,
    }, 'prova_aluno_id')

    if (error) { setErro(error); setSaving(false); return }

    // Avisa o aluno só na primeira vez — edição não renotifica.
    if (!jaExistia) {
      await dbInsert('notificacoes', [{
        aluno_id: aluno.id_aluno,
        tipo: 'comentario_prova',
        titulo: 'Seu mentor comentou sua prova',
        mensagem: `${prova.nome} · abra a prova para ler os comentários`,
      }])
      setJaExistia(true)
    }

    setSaving(false)
    setSalvo(true)
    setTimeout(() => setSalvo(false), 2500)
  }

  useEffect(() => {
    if (!loading && !perfil) router.replace('/login')
  }, [loading, perfil, router])

  useEffect(() => {
    if (!perfil || !provaAlunoId) return
    // Mesmo recorte de acesso da tela de ranking: mentor ITA/IME apenas.
    if (perfil.papel !== 'mentor' || perfil.vertical === 'Medicina') {
      router.replace(`/provas-antigas/${provaId}`)
      return
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [perfil, provaAlunoId])

  if (loading || !perfil) return null

  const notas: Record<string, number> = correcao?.notas || {}
  const fracas = questoesFracas(notas, questoes, topicosDB)
  const soma = Object.values(notas).reduce((acc, v) => acc + Number(v || 0), 0)
  const vazio = !letra.trim() && !resolucao.trim() && !conteudo.trim()

  // Tópicos oferecidos: os das questões fracas primeiro (pré-marcados), e a lista
  // completa por matéria só quando o mentor pedir — são centenas de linhas.
  const idsSugeridos = topicosSugeridos(notas, questoes)
  const porMateria: Record<string, TopicoDB[]> = {}
  topicosDB.forEach(t => {
    const m = t.materia || 'Outros'
    ;(porMateria[m] = porMateria[m] || []).push(t)
  })

  function toggleTopico(id: string) {
    setTopicosSel(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  return (
    <div style={{ paddingBottom: 100 }}>
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, background: '#F7F6F3', zIndex: 10,
        padding: '16px 16px 14px', borderBottom: '1px solid #e2e8f0',
      }}>
        <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href={`/provas-antigas/${provaId}`} style={{ color: '#64748b', display: 'flex' }}>
            <ArrowLeft size={20} strokeWidth={2} />
          </Link>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {aluno?.nome || 'Carregando…'}
            </div>
            {prova && (
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                {prova.nome} · {TIPO_LABEL[prova.tipo] || prova.tipo} · {prova.fase}ª Fase
              </div>
            )}
          </div>
        </div>
      </div>

      {fetching ? (
        <div style={{ padding: '60px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Carregando…</div>
      ) : !prova || !aluno ? (
        <div style={{ padding: '60px 16px', textAlign: 'center', color: '#64748b', fontSize: 14 }}>Prova não encontrada.</div>
      ) : (
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '20px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── Nota e PDFs ──────────────────────────────────────────────────── */}
          <div style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: '#f97316' }}>{soma.toFixed(1)}</span>
              <span style={{ fontSize: 13, color: '#64748b' }}>de {prova.num_questoes} pontos</span>
              {correcao?.confirmed_at && (
                <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>
                  corrigida em {new Date(correcao.confirmed_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              )}
            </div>

            <div style={{ height: 1, background: '#f1f5f9' }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <FileText size={16} strokeWidth={2} color="#f97316" />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>Resolução do aluno</span>
              </div>
              {correcao?.pdf_correcao_url ? (
                <a href={correcao.pdf_correcao_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#f97316', textDecoration: 'none', padding: '5px 12px', border: '1.5px solid #f97316', borderRadius: 8, fontWeight: 600 }}>
                  Abrir PDF
                </a>
              ) : (
                <span style={{ fontSize: 11, color: '#94a3b8' }}>
                  {correcao ? 'o aluno não anexou PDF' : 'aluno ainda não corrigiu'}
                </span>
              )}
            </div>

            {prova.pdf_url && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <FileText size={16} strokeWidth={2} color="#5B21B6" />
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>PDF da prova</span>
                </div>
                <a href={prova.pdf_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#5B21B6', textDecoration: 'none', padding: '5px 12px', border: '1.5px solid #5B21B6', borderRadius: 8, fontWeight: 600 }}>
                  Abrir
                </a>
              </div>
            )}
          </div>

          {/* ── Notas por questão ────────────────────────────────────────────── */}
          {questoes.length > 0 && (
            <div style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Nota por questão</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {questoes.map(q => {
                  const n = notas[String(q.numero)]
                  const fraca = Number(n ?? 1) < LIMITE_QUESTAO_FRACA
                  return (
                    <div key={q.numero} title={q.materia} style={{
                      minWidth: 54, padding: '6px 8px', borderRadius: 8, textAlign: 'center',
                      border: `1.5px solid ${fraca ? '#fecaca' : '#e2e8f0'}`,
                      background: fraca ? '#fef2f2' : '#f8fafc',
                    }}>
                      <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600 }}>Q{q.numero}</div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: fraca ? '#dc2626' : '#16a34a' }}>
                        {n === undefined ? '—' : Number(n).toFixed(1)}
                      </div>
                    </div>
                  )
                })}
              </div>
              {fracas.length > 0 && (
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 10 }}>
                  {fracas.length} questão(ões) abaixo de {LIMITE_QUESTAO_FRACA.toFixed(1)} — os tópicos delas já vêm marcados abaixo.
                </div>
              )}
            </div>
          )}

          {/* ── Comentários ──────────────────────────────────────────────────── */}
          {([
            ['letra',     '✍️ Letra e organização', 'Como está a caligrafia, a disposição na folha, a numeração das questões…', letra, setLetra],
            ['resolucao', '🧩 Sobre a resolução',    'O que o desenvolvimento mostra: raciocínio, passagens puladas, erros de conta…', resolucao, setResolucao],
            ['conteudo',  '📚 O que estudar',        'Conteúdos e formas de revisar antes da próxima prova…', conteudo, setConteudo],
          ] as [string, string, string, string, (v: string) => void][]).map(([key, titulo, placeholder, valor, set]) => (
            <div key={key} style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{titulo}</div>
              <textarea
                value={valor}
                onChange={e => set(e.target.value)}
                placeholder={placeholder}
                rows={4}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 8, resize: 'vertical',
                  border: '1.5px solid #e2e8f0', fontFamily: 'inherit', fontSize: 13,
                  lineHeight: 1.5, color: '#1a1a1a', background: '#fdfdfd',
                }}
              />
            </div>
          ))}

          {/* ── Tópicos ──────────────────────────────────────────────────────── */}
          <div style={{ background: 'white', border: '1.5px solid #e2e8f0', borderRadius: 12, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Tópicos recomendados</div>
              <button onClick={() => setMostrarArvore(v => !v)} style={{
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                fontSize: 12, fontWeight: 600, color: '#5B21B6',
              }}>
                {mostrarArvore ? 'ocultar lista completa' : 'ver todos os tópicos'}
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10 }}>Opcional. Os tópicos das questões fracas já vêm marcados.</div>

            {idsSugeridos.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: mostrarArvore ? 14 : 0 }}>
                {idsSugeridos.map(id => {
                  const nome = resolverTopicos([id], topicosDB)[0]
                  if (!nome) return null
                  const on = topicosSel.includes(id)
                  return (
                    <button key={id} onClick={() => toggleTopico(id)} style={{
                      fontSize: 11, padding: '4px 11px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit',
                      border: `1px solid ${on ? '#5B21B6' : '#e2e8f0'}`,
                      background: on ? '#F3F0FF' : 'white',
                      color: on ? '#5B21B6' : '#64748b',
                      fontWeight: on ? 600 : 400,
                    }}>
                      {on ? '✓ ' : ''}{nome}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Tópicos escolhidos fora da sugestão continuam visíveis com a lista fechada */}
            {topicosSel.filter(id => !idsSugeridos.includes(id)).length > 0 && !mostrarArvore && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
                {topicosSel.filter(id => !idsSugeridos.includes(id)).map(id => {
                  const nome = resolverTopicos([id], topicosDB)[0]
                  if (!nome) return null
                  return (
                    <button key={id} onClick={() => toggleTopico(id)} style={{
                      fontSize: 11, padding: '4px 11px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit',
                      border: '1px solid #5B21B6', background: '#F3F0FF', color: '#5B21B6', fontWeight: 600,
                    }}>
                      ✓ {nome}
                    </button>
                  )
                })}
              </div>
            )}

            {mostrarArvore && (
              <div style={{ maxHeight: 320, overflowY: 'auto', borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
                {Object.entries(porMateria).sort((a, b) => a[0].localeCompare(b[0])).map(([materia, lista]) => (
                  <div key={materia} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', marginBottom: 6 }}>{materia}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {lista.map(t => {
                        const on = topicosSel.includes(t.id)
                        return (
                          <button key={t.id} onClick={() => toggleTopico(t.id)} style={{
                            fontSize: 11, padding: '4px 11px', borderRadius: 20, cursor: 'pointer', fontFamily: 'inherit',
                            border: `1px solid ${on ? '#5B21B6' : '#e2e8f0'}`,
                            background: on ? '#F3F0FF' : 'white',
                            color: on ? '#5B21B6' : '#64748b',
                            fontWeight: on ? 600 : 400,
                          }}>
                            {on ? '✓ ' : ''}{t.topico}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Salvar ───────────────────────────────────────────────────────── */}
          {erro && <div style={{ fontSize: 13, color: '#DC2626' }}>{erro}</div>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={salvar}
              disabled={saving || vazio}
              style={{
                padding: '11px 22px', borderRadius: 10, border: 'none',
                background: vazio ? '#e2e8f0' : '#f97316',
                color: vazio ? '#94a3b8' : 'white',
                fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
                cursor: saving || vazio ? 'default' : 'pointer',
              }}
            >
              {saving ? 'Salvando…' : jaExistia ? 'Salvar alterações' : 'Enviar ao aluno'}
            </button>
            {vazio && <span style={{ fontSize: 12, color: '#94a3b8' }}>Escreva ao menos um dos comentários.</span>}
            {salvo && <span style={{ fontSize: 13, color: '#16a34a', fontWeight: 600 }}>✓ O aluno já consegue ler.</span>}
          </div>
        </div>
      )}

      <Nav />
    </div>
  )
}
