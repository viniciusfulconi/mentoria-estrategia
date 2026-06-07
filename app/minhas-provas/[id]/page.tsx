'use client'
import { useEffect, useState } from 'react'
import { dbQuery, dbInsert, supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter, useParams } from 'next/navigation'
import Nav from '@/components/Nav'

const OPCOES_FASE1 = [
  { value: 'acertou',   label: 'Acertei',                  cor: '#16A34A', bg: '#DCFCE7' },
  { value: 'chute',     label: 'Acertei no chute',          cor: '#D97706', bg: '#FEF3C7' },
  { value: 'besteira',  label: 'Errei por besteira',        cor: '#EA580C', bg: '#FFEDD5' },
  { value: 'nao_sabia', label: 'Errei pois não sabia',      cor: '#DC2626', bg: '#FEE2E2' },
  { value: 'tempo',     label: 'Não tentei pelo tempo',     cor: '#6B7280', bg: '#F3F4F6' },
]

type Fase1Respostas = Record<string, string>
type Fase2Notas = Record<string, number>

export default function MinhaProva() {
  const { perfil } = useAuth()
  const router = useRouter()
  const params = useParams()
  const provaAlunoId = params?.id as string

  const [provaAluno, setProvaAluno] = useState<any>(null)
  const [prova, setProva] = useState<any>(null)
  const [questoes, setQuestoes] = useState<any[]>([])
  const [correcao, setCorrecao] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Formulários de correção
  const [respostasFase1, setRespostasFase1] = useState<Fase1Respostas>({})
  const [notasFase2, setNotasFase2] = useState<Fase2Notas>({})
  const [pdfCorrecao, setPdfCorrecao] = useState<File | null>(null)
  const [corrigindo, setCorrigindo] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [erro, setErro] = useState('')

  // Resultados
  const [ranking, setRanking] = useState<any[]>([])
  const [rankingLoaded, setRankingLoaded] = useState(false)

  const targetId = perfil?.papel === 'aluno' ? perfil.aluno_id! : ''

  useEffect(() => { if (provaAlunoId) load() }, [provaAlunoId])

  async function load() {
    const [{ data: pa }, { data: corr }] = await Promise.all([
      dbQuery('provas_aluno', { id: `eq.${provaAlunoId}` }),
      dbQuery('correcoes_prova', { prova_aluno_id: `eq.${provaAlunoId}` }),
    ])
    const paData = pa?.[0]
    if (!paData) { setLoading(false); return }
    setProvaAluno(paData)

    const [{ data: provaData }, { data: qData }] = await Promise.all([
      dbQuery('provas_antigas', { id: `eq.${paData.prova_id}` }),
      dbQuery('questoes_prova_antiga', { prova_id: `eq.${paData.prova_id}`, order: 'numero' }),
    ])
    setProva(provaData?.[0] || null)
    setQuestoes(qData || [])

    const corrData = corr?.[0] || null
    setCorrecao(corrData)
    if (corrData?.confirmed_at) loadRanking(paData.prova_id, corrData)
    setLoading(false)
  }

  async function loadRanking(provaId: string, corrData: any) {
    const { data } = await dbQuery('correcoes_prova', {
      prova_id: `eq.${provaId}`,
      confirmed_at: 'not.is.null',
    }, 'aluno_id,respostas,notas,confirmed_at')
    setRanking(data || [])
    setRankingLoaded(true)
  }

  function calcularPontuacao(corr: any, modelo: string): number {
    if (modelo === 'multipla_escolha') {
      const resps = corr.respostas || {}
      return Object.values(resps).filter((v: any) => v === 'acertou').length
    } else {
      const notas = corr.notas || {}
      return Object.values(notas).reduce((acc: number, v: any) => acc + Number(v || 0), 0)
    }
  }

  function posicaoNoRanking() {
    if (!ranking.length || !prova) return null
    const pontuacoes = ranking.map(c => ({
      aluno_id: c.aluno_id,
      pts: calcularPontuacao(c, prova.modelo),
    })).sort((a, b) => b.pts - a.pts)
    const pos = pontuacoes.findIndex(p => p.aluno_id === targetId) + 1
    return { pos, total: pontuacoes.length }
  }

  function assuntosErrados() {
    if (!correcao || !questoes.length || !prova) return []
    if (prova.modelo === 'multipla_escolha') {
      const resps = correcao.respostas || {}
      return questoes
        .filter(q => resps[String(q.numero)] && resps[String(q.numero)] !== 'acertou')
        .map(q => ({ numero: q.numero, materia: q.materia, tipo: resps[String(q.numero)] }))
    } else {
      const notas = correcao.notas || {}
      return questoes
        .filter(q => Number(notas[String(q.numero)] ?? 1) < 0.7)
        .map(q => ({ numero: q.numero, materia: q.materia, nota: notas[String(q.numero)] }))
    }
  }

  async function confirmarFase1() {
    const nRespondidas = Object.keys(respostasFase1).length
    if (nRespondidas < (prova?.num_questoes || 0)) {
      setErro(`Responda todas as ${prova?.num_questoes} questões. Faltam ${prova.num_questoes - nRespondidas}.`)
      return
    }
    setSaving(true); setErro('')
    const { error } = await dbInsert('correcoes_prova', [{
      prova_aluno_id: provaAlunoId,
      prova_id: provaAluno.prova_id,
      aluno_id: targetId,
      respostas: respostasFase1,
      confirmed_at: new Date().toISOString(),
    }])
    if (error) { setErro(error); setSaving(false); return }
    await load()
    setSaving(false)
    setCorrigindo(false)
  }

  async function confirmarFase2() {
    const nRespondidas = Object.keys(notasFase2).length
    if (nRespondidas < (prova?.num_questoes || 0)) {
      setErro(`Preencha as notas de todas as ${prova?.num_questoes} questões.`)
      return
    }
    setSaving(true); setErro('')

    let pdfUrl = ''
    if (pdfCorrecao) {
      setUploadProgress('Enviando PDF...')
      const path = `correcoes/${targetId}/${provaAlunoId}-${Date.now()}.pdf`
      const { error: upErr } = await supabase.storage.from('provas-antigas').upload(path, pdfCorrecao, { upsert: true })
      if (upErr) { setErro('Erro ao enviar PDF: ' + upErr.message); setSaving(false); return }
      const { data: urlData } = supabase.storage.from('provas-antigas').getPublicUrl(path)
      pdfUrl = urlData.publicUrl
    }

    const { error } = await dbInsert('correcoes_prova', [{
      prova_aluno_id: provaAlunoId,
      prova_id: provaAluno.prova_id,
      aluno_id: targetId,
      notas: notasFase2,
      pdf_correcao_url: pdfUrl || null,
      confirmed_at: new Date().toISOString(),
    }])
    if (error) { setErro(error); setSaving(false); return }
    await load()
    setSaving(false)
    setCorrigindo(false)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Carregando...</div>
  if (!provaAluno || !prova) return <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>Prova não encontrada.</div>

  const jaCorrigida = !!correcao?.confirmed_at
  const errados = jaCorrigida ? assuntosErrados() : []
  const rankingInfo = jaCorrigida && rankingLoaded ? posicaoNoRanking() : null

  // Agrupar erros por matéria
  const errosPorMateria: Record<string, number> = {}
  errados.forEach(e => { errosPorMateria[e.materia] = (errosPorMateria[e.materia] || 0) + 1 })

  return (
    <div style={{ paddingBottom: 80 }}>
      {/* Header */}
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{prova.nome}</div>
          <div style={{ fontSize: 11, color: '#999' }}>
            {prova.tipo.toUpperCase()} · {prova.fase}ª Fase · {prova.num_questoes} questões
          </div>
        </div>
        {jaCorrigida && (
          <span style={{ fontSize: 10, fontWeight: 600, padding: '3px 9px', borderRadius: 10, background: '#DCFCE7', color: '#14532D' }}>
            ✓ Corrigida
          </span>
        )}
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Data */}
        <div style={{ fontSize: 13, color: '#666' }}>
          📅 Aplicada em {new Date(provaAluno.data + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
        </div>

        {/* PDF da prova */}
        {prova.pdf_url && (
          <a href={prova.pdf_url} target="_blank" rel="noreferrer" style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: '#F3F0FF', borderRadius: 12, padding: '12px 16px',
            textDecoration: 'none', color: '#5B21B6', fontWeight: 500, fontSize: 14,
          }}>
            <span style={{ fontSize: 20 }}>📄</span>
            Abrir PDF da prova
          </a>
        )}

        {/* ── JÁ CORRIGIDA: mostrar resultados ── */}
        {jaCorrigida && (
          <>
            {/* Pontuação */}
            <div className="card">
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Resultado</div>
              {prova.modelo === 'multipla_escolha' ? (
                <>
                  {(() => {
                    const resps = correcao.respostas || {}
                    const acertou = Object.values(resps).filter(v => v === 'acertou').length
                    const chute = Object.values(resps).filter(v => v === 'chute').length
                    const besteira = Object.values(resps).filter(v => v === 'besteira').length
                    const naoSabia = Object.values(resps).filter(v => v === 'nao_sabia').length
                    const tempo = Object.values(resps).filter(v => v === 'tempo').length
                    const total = prova.num_questoes
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                          <div style={{ fontSize: 32, fontWeight: 700, color: '#16A34A' }}>{acertou}</div>
                          <div style={{ fontSize: 13, color: '#666' }}>acertos de {total} questões</div>
                        </div>
                        {[
                          { label: 'Acertei', v: acertou, cor: '#16A34A' },
                          { label: 'Acertei no chute', v: chute, cor: '#D97706' },
                          { label: 'Besteira', v: besteira, cor: '#EA580C' },
                          { label: 'Não sabia', v: naoSabia, cor: '#DC2626' },
                          { label: 'Tempo', v: tempo, cor: '#9CA3AF' },
                        ].filter(x => x.v > 0).map(x => (
                          <div key={x.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                            <span style={{ color: '#666' }}>{x.label}</span>
                            <span style={{ fontWeight: 600, color: x.cor }}>{x.v}</span>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </>
              ) : (
                <>
                  {(() => {
                    const notas = correcao.notas || {}
                    const soma = Object.values(notas).reduce((acc: number, v: any) => acc + Number(v || 0), 0)
                    const total = prova.num_questoes
                    return (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                          <div style={{ fontSize: 32, fontWeight: 700, color: '#f97316' }}>{soma.toFixed(1)}</div>
                          <div style={{ fontSize: 13, color: '#666' }}>de {total} pontos</div>
                        </div>
                        {correcao.pdf_correcao_url && (
                          <a href={correcao.pdf_correcao_url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#f97316' }}>
                            📎 Ver PDF enviado
                          </a>
                        )}
                      </div>
                    )
                  })()}
                </>
              )}
            </div>

            {/* Ranking */}
            {rankingLoaded && rankingInfo && (
              <div className="card" style={{ background: '#F3F0FF' }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: '#5B21B6' }}>Ranking entre alunos</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 28, fontWeight: 700, color: '#f97316' }}>{rankingInfo.pos}º</span>
                  <span style={{ fontSize: 13, color: '#6B7280' }}>de {rankingInfo.total} alunos que fizeram esta prova</span>
                </div>
              </div>
            )}

            {/* Assuntos errados */}
            {errados.length > 0 && (
              <div className="card">
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Assuntos para revisar nesta prova</div>
                {Object.entries(errosPorMateria)
                  .sort((a, b) => b[1] - a[1])
                  .map(([mat, qtd]) => (
                    <div key={mat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 13, color: '#333' }}>{mat}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#DC2626', padding: '2px 8px', background: '#FEE2E2', borderRadius: 8 }}>
                        {qtd} erro{qtd > 1 ? 's' : ''}
                      </span>
                    </div>
                  ))}

                <div style={{ marginTop: 10, borderTop: '0.5px solid rgba(0,0,0,0.08)', paddingTop: 10 }}>
                  <div style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>Questões individuais</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {errados.map(e => (
                      <span key={e.numero} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: '#FEE2E2', color: '#DC2626', fontWeight: 500 }}>
                        Q{e.numero} · {e.materia}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── NÃO CORRIGIDA: botão ou formulário ── */}
        {!jaCorrigida && !corrigindo && (
          <button
            className="btn-primary"
            onClick={() => setCorrigindo(true)}
            style={{ background: '#f97316' }}
          >
            ✏️ Corrigir prova
          </button>
        )}

        {/* ── FORMULÁRIO FASE 1 ── */}
        {!jaCorrigida && corrigindo && prova.modelo === 'multipla_escolha' && (
          <div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
              Para cada questão, selecione o que aconteceu:
            </div>
            {Array.from({ length: prova.num_questoes }, (_, i) => i + 1).map(num => {
              const resposta = respostasFase1[String(num)]
              return (
                <div key={num} style={{ marginBottom: 10, padding: 12, borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.1)', background: resposta ? '#FAFAFA' : '#FFFBEB' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 6, background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#5B21B6', flexShrink: 0 }}>
                      {num}
                    </div>
                    {questoes.find(q => q.numero === num)?.materia && (
                      <span style={{ fontSize: 11, color: '#999' }}>
                        {questoes.find(q => q.numero === num)?.materia}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {OPCOES_FASE1.map(op => (
                      <button
                        key={op.value}
                        onClick={() => setRespostasFase1(prev => ({ ...prev, [String(num)]: op.value }))}
                        style={{
                          padding: '8px 12px', borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.1)',
                          background: resposta === op.value ? op.bg : 'white',
                          color: resposta === op.value ? op.cor : '#666',
                          fontWeight: resposta === op.value ? 600 : 400,
                          fontSize: 12, cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                          textAlign: 'left',
                        }}
                      >
                        {op.label}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}

            {erro && <div style={{ color: '#DC2626', fontSize: 13, marginTop: 8 }}>{erro}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              <button className="btn-primary" onClick={confirmarFase1} disabled={saving} style={{ background: '#f97316' }}>
                {saving ? 'Salvando...' : 'Confirmar correção'}
              </button>
              <button className="btn-secondary" onClick={() => setCorrigindo(false)}>Cancelar</button>
            </div>
          </div>
        )}

        {/* ── FORMULÁRIO FASE 2 ── */}
        {!jaCorrigida && corrigindo && prova.modelo === 'discursiva' && (
          <div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
              Envie o PDF da sua correção e informe a nota de cada questão (0 a 1):
            </div>

            <div style={{ marginBottom: 14 }}>
              <label>PDF da sua correção (opcional)</label>
              <input
                type="file"
                accept="application/pdf"
                onChange={e => setPdfCorrecao(e.target.files?.[0] || null)}
                style={{ padding: '8px 0' }}
              />
              {pdfCorrecao && <div style={{ fontSize: 11, color: '#16A34A', marginTop: 4 }}>✓ {pdfCorrecao.name}</div>}
            </div>

            {Array.from({ length: prova.num_questoes }, (_, i) => i + 1).map(num => {
              const nota = notasFase2[String(num)]
              const questao = questoes.find(q => q.numero === num)
              return (
                <div key={num} style={{ marginBottom: 10, padding: 12, borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.1)', background: nota !== undefined ? '#FAFAFA' : '#FFFBEB' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 6, background: '#EDE9FE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#5B21B6', flexShrink: 0 }}>
                      {num}
                    </div>
                    {questao?.materia && <span style={{ fontSize: 11, color: '#999' }}>{questao.materia}</span>}
                    <div style={{ flex: 1 }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: nota !== undefined ? '#f97316' : '#ccc' }}>
                      {nota !== undefined ? nota.toFixed(1) : '—'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {[0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0].map(v => (
                      <button
                        key={v}
                        onClick={() => setNotasFase2(prev => ({ ...prev, [String(num)]: v }))}
                        style={{
                          width: 38, height: 32, borderRadius: 8, border: '0.5px solid rgba(0,0,0,0.12)',
                          background: nota === v ? '#f97316' : 'white',
                          color: nota === v ? 'white' : '#444',
                          fontSize: 11, fontWeight: nota === v ? 700 : 400,
                          cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                        }}
                      >
                        {v.toFixed(1)}
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}

            {erro && <div style={{ color: '#DC2626', fontSize: 13, marginTop: 8 }}>{erro}</div>}
            {uploadProgress && <div style={{ color: '#f97316', fontSize: 13 }}>{uploadProgress}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
              <button className="btn-primary" onClick={confirmarFase2} disabled={saving} style={{ background: '#f97316' }}>
                {saving ? uploadProgress || 'Salvando...' : 'Confirmar correção'}
              </button>
              <button className="btn-secondary" onClick={() => setCorrigindo(false)}>Cancelar</button>
            </div>
          </div>
        )}
      </div>

      <Nav />
    </div>
  )
}
