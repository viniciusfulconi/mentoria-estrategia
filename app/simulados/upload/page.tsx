'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'
import { dbQueryAll, dbInsert as dbInsertLib, dbDelete as dbDeleteLib, getToken } from '@/lib/supabase'
import { calcularRankings, ordenarEClassificar } from '@/lib/rankings'
import { stripAcentos } from '@/lib/format'

// Wrappers finos sobre os helpers de lib/supabase (com paginação e checagem de erro),
// preservando o contrato throw-on-error do fluxo de importação.
async function dbSelectAll(table: string, cols = '*'): Promise<any[]> {
  const { data, error } = await dbQueryAll(table, {}, cols)
  if (error) throw new Error(`Erro ao ler ${table}: ${error}`)
  return data || []
}

async function dbDelete(table: string, filter: Record<string, string>): Promise<void> {
  const { error } = await dbDeleteLib(table, filter)
  if (error) throw new Error(`Erro ao apagar ${table}: ${error}`)
}

async function dbInsert(table: string, rows: any[]): Promise<void> {
  if (!rows.length) return
  const { error } = await dbInsertLib(table, rows)
  if (error) throw new Error(`Erro ao inserir em ${table}: ${error}`)
}

type PreviewData = {
  alunosCount: number
  abas: { nome: string; ciclo: string; tipo: string; concurso: string; alunos: number; avisos: string[] }[]
  avisoGeral: string[]
  alunosData: any[]
  registros: any[]
  todosDados: any[]
}

// Normaliza cada registro para ter todas as colunas — PGRST102 exige chaves idênticas em batch inserts
function normResultado(r: any) {
  return {
    id_aluno: r.id_aluno ?? null,
    nome_aluno: r.nome_aluno ?? null,
    mentor: r.mentor ?? null,
    ciclo_nome: r.ciclo_nome ?? null,
    concurso: r.concurso ?? null,
    fase: r.fase ?? null,
    media_1fase: r.media_1fase ?? null,
    acertos_mat_1f: r.acertos_mat_1f ?? null,
    acertos_fis_1f: r.acertos_fis_1f ?? null,
    acertos_qui_1f: r.acertos_qui_1f ?? null,
    acertos_ing_1f: r.acertos_ing_1f ?? null,
    nota_matematica: r.nota_matematica ?? null,
    nota_fisica: r.nota_fisica ?? null,
    nota_quimica: r.nota_quimica ?? null,
    media_linguagens: r.media_linguagens ?? null,
    nota_redacao: r.nota_redacao ?? null,
    nota_portugues: r.nota_portugues ?? null,
    nota_ingles: r.nota_ingles ?? null,
    media_2fase: r.media_2fase ?? null,
    pontos_inteiros: r.pontos_inteiros ?? null,
    resultado: r.resultado ?? null,
    resultado_ciclo: r.resultado_ciclo ?? null,
    motivo_reprovacao: r.motivo_reprovacao ?? null,
    classificacao: r.classificacao ?? null,
    notas_questoes: r.notas_questoes ?? null,
  }
}

export default function UploadSimulados() {
  const router = useRouter()
  const [log, setLog] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [etapa, setEtapa] = useState<'idle' | 'parsing' | 'preview' | 'saving' | 'done'>('idle')
  const [erro, setErro] = useState('')

  // ── Importação direta da planilha do Google (via /api/sync-simulados) ──
  const [gEtapa, setGEtapa] = useState<'idle' | 'loading' | 'preview' | 'done'>('idle')
  const [gRep, setGRep] = useState<any>(null)
  const [gErro, setGErro] = useState('')
  const [gLoadingMsg, setGLoadingMsg] = useState('Carregando...')
  // Ciclos existentes no banco (para os checkboxes de "forçar sobrescrita") e a
  // seleção atual. A escolha é feita ANTES de analisar, para uma leitura só.
  const [gCiclosDisponiveis, setGCiclosDisponiveis] = useState<string[]>([])
  const [gForcar, setGForcar] = useState<string[]>([])

  // Lista os ciclos existentes a partir das linhas de ranking — mesmo padrão de
  // /simulados. Não lê a planilha do Google (barato, só banco).
  useEffect(() => {
    dbQueryAll('resultados', { fase: 'eq.ranking' }, 'ciclo_nome').then(({ data }) => {
      const ciclos = Array.from(new Set((data || []).map((r: any) => r.ciclo_nome).filter(Boolean)))
        .sort((a, b) => parseInt(a.match(/\d+/)?.[0] || '0') - parseInt(b.match(/\d+/)?.[0] || '0'))
      setGCiclosDisponiveis(ciclos)
    }).catch(() => {})
  }, [])

  function toggleForcar(ciclo: string) {
    setGForcar(prev => prev.includes(ciclo) ? prev.filter(c => c !== ciclo) : [...prev, ciclo])
  }

  async function chamarSync(payload: any) {
    const resp = await fetch('/api/sync-simulados', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify(payload),
    })
    const json = await resp.json()
    if (!resp.ok) throw new Error(json?.erro || json?.error || `Erro ${resp.status}`)
    return json
  }

  async function gPreview() {
    setGEtapa('loading'); setGLoadingMsg('Lendo a planilha...'); setGErro('')
    try { setGRep(await chamarSync({ acao: 'preview', forcarCiclos: gForcar })); setGEtapa('preview') }
    catch (e: any) { setGErro(e.message); setGEtapa('idle') }
  }
  async function gSincronizar() {
    setGEtapa('loading'); setGLoadingMsg('Sincronizando dados... pode levar 1–2 minutos. Não feche a página.'); setGErro('')
    try { setGRep(await chamarSync({ acao: 'sincronizar', forcarCiclos: gForcar })); setGEtapa('done') }
    catch (e: any) { setGErro(e.message); setGEtapa('preview') }
  }
  async function gImportarCiclo(ciclo: string) {
    setGEtapa('loading'); setGLoadingMsg('Importando ciclo... pode levar 1–2 minutos. Não feche a página.'); setGErro('')
    try { setGRep(await chamarSync({ acao: 'importar-ciclo', ciclo })); setGEtapa('done') }
    catch (e: any) { setGErro(e.message); setGEtapa('preview') }
  }

  function addLog(msg: string) { setLog(prev => [...prev, msg]) }

  function parseSheet(XLSX: any, wb: any, name: string): any[] {
    const ws = wb.Sheets[name]
    if (!ws) return []
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null })
    return rows as any[]
  }

  function excelDateToISO(val: any): string | null {
    if (!val) return null
    if (typeof val === 'string' && val.includes('-')) return val
    if (typeof val === 'number') {
      const d = new Date(Math.round((val - 25569) * 86400 * 1000))
      return d.toISOString().split('T')[0]
    }
    return null
  }

  function detectTipo(name: string): { ciclo: string, tipo: string, concurso: string } {
    // strip remove acentos → 'Física' vira 'fisica'
    const n = stripAcentos(name).toLowerCase()
    const isIME = n.includes('ime')
    const concurso = isIME ? 'IME' : 'ITA'
    const numMatch = name.match(/Ciclo\s*(\d+)/i)
    const num = numMatch ? String(parseInt(numMatch[1], 10)) : '0'
    const cicloBase = `Ciclo ${num}`

    if (n.includes('1a fase') || n.includes('1ª fase') || n.includes('primeira fase')) return { ciclo: cicloBase, tipo: '1fase', concurso }
    if (n.includes('matem')) return { ciclo: cicloBase, tipo: '2fase_mat', concurso }
    if (n.includes('fisic')) return { ciclo: cicloBase, tipo: '2fase_fis', concurso }
    if (n.includes('quim')) return { ciclo: cicloBase, tipo: '2fase_qui', concurso }
    if (n.includes('port') || n.includes('lingu') || n.includes('redac')) return { ciclo: cicloBase, tipo: '2fase_port', concurso }
    if (n.includes('ingl')) return { ciclo: cicloBase, tipo: '2fase_ing', concurso }
    if (n.includes('processo')) return { ciclo: name, tipo: '1fase', concurso }
    return { ciclo: cicloBase, tipo: 'outro', concurso }
  }

  // Calcula médias finais por ciclo/concurso para cada aluno
  // calcularRankings foi movida para lib/rankings.ts (reutilizada por /gestao/notas).

  function parsearPlanilha(XLSX: any, wb: any): PreviewData {
    const ignorar = ['Ids Alunos', 'Processo Seletivo']
    const idsRows = parseSheet(XLSX, wb, 'Ids Alunos')

    const nomeParaId: Record<string, string> = {}
    idsRows.forEach((r: any) => {
      const id = String(r['IdAluno'] || '').trim()
      const nome = String(r['Aluno'] || '').trim().toLowerCase()
      if (id && nome) nomeParaId[nome] = id
    })

    const alunosData = idsRows.map(r => {
      const idAluno = String(r['IdAluno'] || '')
      return {
        id_aluno: idAluno,
        nome: String(r['Aluno'] || ''),
        mentor: r['Mentor do Aluno'] || null,
        data_nascimento: excelDateToISO(r['Data nascimento do Aluno']),
        ingresso: r['Ingresso na Turma'] || null,
        cadastrado: false,
      }
    }).filter(a => a.id_aluno && a.nome)

    const abasNotas = wb.SheetNames.filter((n: string) =>
      !ignorar.includes(n) &&
      !n.includes('Ranking') &&
      !n.includes('Simulado Zero') &&
      !n.includes('Ciclo 0') &&
      !n.includes('Diagnóstico')
    )

    const todosDados: any[] = []
    const registros: any[] = []
    const avisoGeral: string[] = []
    const abasResumo: PreviewData['abas'] = []

    for (const sheetName of abasNotas) {
      const rows = parseSheet(XLSX, wb, sheetName)
      if (!rows.length) continue

      const { ciclo, tipo, concurso } = detectTipo(sheetName)
      const avisos: string[] = []
      let semId = 0

      const recs = rows.map(r => {
        let idAluno = String(r['IdAluno'] ?? '').trim()
        if (!idAluno || idAluno === 'null' || idAluno === 'undefined') {
          const nomeAluno = String(r['Aluno'] || '').trim().toLowerCase()
          idAluno = nomeParaId[nomeAluno] || ''
        }
        if (!idAluno) { semId++; return null }

        const notasQuestoes: Record<string, number> = {}
        Object.keys(r).forEach(k => {
          if (k.match(/^Q\d+$/) && typeof r[k] === 'number') notasQuestoes[k] = r[k]
        })

        const rec: any = {
          ciclo_nome: ciclo, concurso, id_aluno: idAluno,
          nome_aluno: String(r['Aluno'] || ''), mentor: r['Mentor do Aluno'] || null,
          fase: tipo, notas_questoes: Object.keys(notasQuestoes).length ? notasQuestoes : null,
          resultado: r['Resultado'] || null,
          motivo_reprovacao: r['Motivo Eliminação'] || r['Motivo Reprovação'] || null,
          classificacao: r['CL'] ? Number(r['CL']) : null,
        }
        if (tipo === '1fase') {
          rec.media_1fase = r['Nota'] !== undefined ? Number(r['Nota']) : null
          rec.acertos_mat_1f = r['Acertos Matemática'] ? Number(r['Acertos Matemática']) : null
          rec.acertos_fis_1f = r['Acertos Física'] ? Number(r['Acertos Física']) : null
          rec.acertos_qui_1f = r['Acertos Química'] ? Number(r['Acertos Química']) : null
          rec.acertos_ing_1f = r['Acertos Inglês'] ? Number(r['Acertos Inglês']) : null
        } else if (tipo === '2fase_mat') {
          rec.nota_matematica = r['Nota'] !== undefined ? Number(r['Nota']) : null
          rec.pontos_inteiros = r['Pontos Inteiros'] ? Number(r['Pontos Inteiros']) : null
        } else if (tipo === '2fase_fis') {
          rec.nota_fisica = r['Nota'] !== undefined ? Number(r['Nota']) : null
          rec.pontos_inteiros = r['Pontos Inteiros'] ? Number(r['Pontos Inteiros']) : null
        } else if (tipo === '2fase_qui') {
          rec.nota_quimica = r['Nota'] !== undefined ? Number(r['Nota']) : null
          rec.pontos_inteiros = r['Pontos Inteiros'] ? Number(r['Pontos Inteiros']) : null
        } else if (tipo === '2fase_port') {
          const notaPort = r['Nota'] !== undefined ? Number(r['Nota']) : null
          const notaRed  = r['Nota Redacao'] !== undefined ? Number(r['Nota Redacao']) : null
          rec.nota_portugues = notaPort
          rec.nota_redacao   = notaRed
          // Média de linguagens = (port + redação) / 2 quando ambos existem.
          // Se a planilha trouxer "Media Linguagens" pré-calculada, conferimos:
          //   - usa a planilha apenas se bate com (port+red)/2 ou se um dos dois faltar.
          //   - se divergir, log de aviso e prevalece o cálculo correto.
          const mediaPlanilha = r['Media Linguagens'] !== undefined ? Number(r['Media Linguagens']) : null
          const mediaCalc = notaPort !== null && notaRed !== null
            ? (notaPort + notaRed) / 2
            : notaPort
          rec.media_linguagens = mediaPlanilha !== null && (mediaCalc === null || Math.abs(mediaPlanilha - mediaCalc) < 0.05)
            ? mediaPlanilha
            : mediaCalc
        } else if (tipo === '2fase_ing') {
          rec.nota_ingles = r['Nota'] !== undefined ? Number(r['Nota']) : null
        }
        todosDados.push(rec)
        registros.push(rec)
        return rec
      }).filter(Boolean)

      if (semId > 0) avisos.push(`${semId} aluno${semId > 1 ? 's' : ''} sem ID — serão ignorados`)
      abasResumo.push({ nome: sheetName, ciclo, tipo, concurso, alunos: recs.length, avisos })
    }

    if (!alunosData.length) avisoGeral.push('Aba "Ids Alunos" não encontrada ou vazia')

    return { alunosCount: alunosData.length, abas: abasResumo, avisoGeral, alunosData, registros, todosDados }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setEtapa('parsing'); setLog([]); setDone(false); setPreview(null)

    const buf = await file.arrayBuffer()
    const XLSX = await import('xlsx')
    const wb = XLSX.read(buf, { type: 'array' })
    const dados = parsearPlanilha(XLSX, wb)
    setPreview(dados)
    setEtapa('preview')
  }

  async function confirmarImportacao() {
    if (!preview) return
    setEtapa('saving'); setLog([])
    const addLog = (msg: string) => setLog(prev => [...prev, msg])

    try {
      addLog(`📂 Iniciando importação...`)

      // 1. Atualiza alunos
      if (preview.alunosData.length) {
        addLog(`👥 Atualizando ${preview.alunosData.length} alunos...`)
        const jasCadastrados = await dbSelectAll('alunos_dados', 'id_aluno,cadastrado')
        const cadastradoMap: Record<string, boolean> = {}
        jasCadastrados.forEach((a: any) => { cadastradoMap[a.id_aluno] = a.cadastrado })
        preview.alunosData.forEach(a => { a.cadastrado = cadastradoMap[a.id_aluno] || false })

        await dbDelete('alunos_dados', { id_aluno: 'neq.xxxx' })
        for (let i = 0; i < preview.alunosData.length; i += 100) {
          await dbInsert('alunos_dados', preview.alunosData.slice(i, i + 100))
        }
        addLog(`✅ ${preview.alunosData.length} alunos importados`)
      }

      // 2. Limpa e reinsere resultados apenas para os ciclos importados
      const ciclosNovos = [...new Set(preview.todosDados.map(r => r.ciclo_nome))]
      addLog(`🗑 Limpando ${ciclosNovos.length} ciclo(s) importado(s)...`)
      await dbDelete('resultados', { ciclo_nome: `in.(${ciclosNovos.join(',')})` })

      addLog(`📊 Importando ${preview.registros.length} registros...`)
      const registrosNorm = preview.registros.map(normResultado)
      for (let i = 0; i < registrosNorm.length; i += 100) {
        await dbInsert('resultados', registrosNorm.slice(i, i + 100))
        addLog(`   ↳ ${Math.min(i + 100, registrosNorm.length)}/${registrosNorm.length} registros`)
      }

      // 3. Rankings
      addLog(`🏆 Calculando rankings...`)
      // ordenarEClassificar aplica o desempate estável por id_aluno — mesma regra
      // do recálculo em /gestao/notas, garantindo classificação idêntica nos 2 fluxos.
      const rankings = ordenarEClassificar(calcularRankings(preview.todosDados))
      const porCiclo: Record<string, any[]> = {}
      rankings.forEach(r => {
        const k = `${r.ciclo_nome}__${r.concurso}`
        if (!porCiclo[k]) porCiclo[k] = []
        porCiclo[k].push(r)
      })
      let totalRankings = 0
      for (const [key, grupo] of Object.entries(porCiclo)) {
        for (let i = 0; i < grupo.length; i += 100) {
          await dbInsert('resultados', grupo.slice(i, i + 100).map(normResultado))
        }
        totalRankings += grupo.length
        addLog(`  ✅ ${key.split('__')[0]}: ${grupo.length} alunos`)
      }

      addLog(`\n🎉 Importação concluída!`)
      addLog(`   📊 ${preview.registros.length} notas + ${totalRankings} rankings`)
      setEtapa('done'); setDone(true)
    } catch (e: any) {
      setErro(e.message || 'Erro desconhecido')
      setEtapa('preview')
    }
  }

  const TIPO_LABEL: Record<string, string> = {
    '1fase': '1ª Fase', '2fase_mat': 'Mat.', '2fase_fis': 'Fís.',
    '2fase_qui': 'Quí.', '2fase_port': 'Port.', '2fase_ing': 'Ing.', outro: '?',
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>←</button>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Upload de resultados</div>
        {etapa === 'preview' && (
          <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 20, background: '#FFFBEB', color: '#78350F', fontWeight: 600 }}>
            Aguardando confirmação
          </span>
        )}
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Importar direto da planilha do Google (sincronização) */}
        {(etapa === 'idle' || etapa === 'parsing') && (
          <div className="card" style={{ borderLeft: '4px solid #16A34A' }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Importar da planilha do Google</div>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 12, lineHeight: 1.6 }}>
              Lê a planilha oficial ao vivo (sem arquivo). Preenche lacunas e atualiza o ciclo ativo; não apaga nada.
            </div>

            {gErro && (
              <div style={{ fontSize: 12, color: '#991B1B', background: '#FEF2F2', borderRadius: 8, padding: '8px 10px', marginBottom: 10, whiteSpace: 'pre-wrap' }}>❌ {gErro}</div>
            )}

            {gEtapa === 'idle' && (
              <>
                {gCiclosDisponiveis.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6 }}>
                      Sobrescrever completamente também (além do ciclo ativo):
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {gCiclosDisponiveis.map(ciclo => {
                        const marcado = gForcar.includes(ciclo)
                        return (
                          <button key={ciclo} type="button" onClick={() => toggleForcar(ciclo)} style={{
                            padding: '5px 12px', borderRadius: 16, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
                            border: `1.5px solid ${marcado ? '#16A34A' : 'rgba(0,0,0,0.12)'}`,
                            background: marcado ? '#16A34A' : 'white',
                            color: marcado ? 'white' : '#555', fontWeight: marcado ? 600 : 400,
                          }}>
                            {marcado ? '✓ ' : ''}{ciclo.replace('Ciclo ', 'Ciclo ')}
                          </button>
                        )
                      })}
                    </div>
                    {gForcar.length > 0 && (
                      <div style={{ fontSize: 11, color: '#D97706', marginTop: 8 }}>
                        ⚠ Sobrescrever um ciclo substitui edições manuais feitas nele (em Notas). O ciclo ativo é sempre sobrescrito.
                      </div>
                    )}
                  </div>
                )}
                <button className="btn-primary" onClick={gPreview}>Analisar planilha →</button>
              </>
            )}
            {gEtapa === 'loading' && (
              <div style={{ textAlign: 'center', color: '#16A34A', padding: '14px 0', fontSize: 13, fontWeight: 500, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 22, height: 22, border: '2.5px solid rgba(22,163,74,0.25)', borderTopColor: '#16A34A', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
                <span>{gLoadingMsg}</span>
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
              </div>
            )}

            {gEtapa === 'preview' && gRep && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#16A34A' }}>{gRep.inseridos}</div>
                    <div style={{ fontSize: 11, color: '#999' }}>linhas a inserir</div>
                  </div>
                  <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '10px 14px' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: '#16A34A' }}>{gRep.atualizados}</div>
                    <div style={{ fontSize: 11, color: '#999' }}>linhas a atualizar</div>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                  Sobrescrito por completo: <b>{[gRep.cicloAtivo, ...gForcar.filter((c: string) => c !== gRep.cicloAtivo)].filter(Boolean).join(', ') || '—'}</b>
                  <span style={{ color: '#999' }}> · demais ciclos: só lacunas</span>
                </div>
                {gRep.gate && !gRep.gate.ok && (
                  <div style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 12, color: '#991B1B' }}>⚠ Cross-check ITA falhou ({gRep.gate.divergencias.length}) — revise antes de gravar.</div>
                    {/* A lista já vem no payload; sem ela o diagnóstico exigia abrir o DevTools. */}
                    <div style={{ fontSize: 11, color: '#991B1B', fontFamily: 'monospace', marginTop: 4, paddingLeft: 14, lineHeight: 1.6 }}>
                      {gRep.gate.divergencias.slice(0, 8).map((d: string, i: number) => (
                        <div key={i}>{d}</div>
                      ))}
                      {gRep.gate.divergencias.length > 8 && (
                        <div style={{ color: '#B45309' }}>… e mais {gRep.gate.divergencias.length - 8}</div>
                      )}
                    </div>
                  </div>
                )}
                {gRep.avisos?.map((a: string, i: number) => (
                  <div key={i} style={{ fontSize: 11, color: '#D97706', marginTop: 2 }}>⚠ {a}</div>
                ))}
                {gRep.ciclosNovos?.length > 0 && (
                  <div style={{ marginTop: 10, padding: '10px 12px', background: '#FFFBEB', borderRadius: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#78350F', marginBottom: 6 }}>Ciclo(s) novo(s) detectado(s)</div>
                    {gRep.ciclosNovos.map((c: string, i: number) => {
                      const nome = c.replace(/\s*\(.*\)$/, '')
                      return (
                        <button key={i} className="btn-secondary" style={{ marginBottom: 6 }} onClick={() => gImportarCiclo(nome)}>
                          Importar {c} por completo →
                        </button>
                      )
                    })}
                  </div>
                )}
                <button className="btn-primary" style={{ marginTop: 12 }} onClick={gSincronizar} disabled={gRep.gate && !gRep.gate.ok}>
                  Sincronizar agora →
                </button>
                <button className="btn-secondary" style={{ marginTop: 8 }} onClick={() => { setGEtapa('idle'); setGRep(null) }}>Cancelar</button>
              </>
            )}

            {gEtapa === 'done' && gRep && (
              <div style={{ background: '#F0FDF4', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 14, color: '#16A34A', fontWeight: 700, marginBottom: 4 }}>✅ Sincronização concluída</div>
                <div style={{ fontSize: 13, color: '#166534', marginBottom: 4 }}>
                  {gRep.inseridos} linha(s) inserida(s) · {gRep.atualizados} atualizada(s)
                </div>
                {gRep.ciclosTocados?.length > 0 && (
                  <div style={{ fontSize: 12, color: '#4D7C57', marginBottom: 10 }}>Ciclos: {gRep.ciclosTocados.join(', ')}</div>
                )}
                <button className="btn-primary" style={{ marginTop: 6 }} onClick={() => router.push('/simulados')}>Ver alunos →</button>
              </div>
            )}
          </div>
        )}

        {/* Seleção de arquivo */}
        {(etapa === 'idle' || etapa === 'parsing') && (
          <div className="card">
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Planilha de gabaritos (.xlsx)</div>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 12, lineHeight: 1.6 }}>
              Selecione a planilha atualizada. Os dados serão analisados antes de qualquer alteração.
            </div>
            <input type="file" accept=".xlsx,.xls" onChange={handleFile} disabled={etapa === 'parsing'}
              style={{ width: '100%', padding: '10px', borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.12)', background: '#F8FAFC', fontSize: 13 }} />
            {etapa === 'parsing' && (
              <div style={{ textAlign: 'center', color: '#f97316', padding: '16px 0 4px', fontSize: 13, fontWeight: 500 }}>
                Lendo planilha...
              </div>
            )}
          </div>
        )}

        {/* Preview */}
        {etapa === 'preview' && preview && (
          <>
            {/* Avisos gerais */}
            {preview.avisoGeral.length > 0 && (
              <div className="card" style={{ borderLeft: '4px solid #DC2626', background: '#FEF2F2' }}>
                {preview.avisoGeral.map((a, i) => (
                  <div key={i} style={{ fontSize: 12, color: '#991B1B', fontWeight: 600 }}>⚠ {a}</div>
                ))}
              </div>
            )}

            {/* Resumo */}
            <div className="card">
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>O que será importado</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#f97316' }}>{preview.alunosCount}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>alunos na planilha</div>
                </div>
                <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#f97316' }}>{preview.registros.length}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>registros de notas</div>
                </div>
              </div>

              <div style={{ fontSize: 11, fontWeight: 600, color: '#999', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                Abas encontradas ({preview.abas.length})
              </div>
              {preview.abas.map((aba, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0',
                  borderBottom: i < preview.abas.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 8, flexShrink: 0,
                    background: aba.concurso === 'ITA' ? '#fff7ed' : '#DCFCE7',
                    color: aba.concurso === 'ITA' ? '#1E40AF' : '#14532D',
                  }}>{aba.concurso}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: '#1a1a1a', fontWeight: 500 }}>
                      {aba.ciclo} — {TIPO_LABEL[aba.tipo] || aba.tipo}
                    </div>
                    <div style={{ fontSize: 11, color: '#999' }}>{aba.alunos} alunos</div>
                    {aba.avisos.map((av, j) => (
                      <div key={j} style={{ fontSize: 11, color: '#D97706', marginTop: 2 }}>⚠ {av}</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {erro && (
              <div className="card" style={{ background: '#FEF2F2', borderLeft: '4px solid #DC2626' }}>
                <div style={{ fontSize: 12, color: '#991B1B', fontWeight: 600, marginBottom: 4 }}>❌ Erro na importação</div>
                <div style={{ fontSize: 12, color: '#991B1B', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{erro}</div>
              </div>
            )}

            <div className="card" style={{ background: '#FEF2F2', borderLeft: '4px solid #DC2626' }}>
              <div style={{ fontSize: 12, color: '#991B1B', fontWeight: 600, marginBottom: 4 }}>Atenção — esta ação é irreversível</div>
              <div style={{ fontSize: 12, color: '#991B1B' }}>Todos os resultados anteriores serão apagados e substituídos pelos dados desta planilha.</div>
            </div>

            <button className="btn-primary" onClick={() => { setErro(''); confirmarImportacao() }}>
              Confirmar importação →
            </button>
            <button className="btn-secondary" onClick={() => { setEtapa('idle'); setPreview(null) }}>
              Cancelar — escolher outro arquivo
            </button>
          </>
        )}

        {/* Log de execução */}
        {(etapa === 'saving' || etapa === 'done') && log.length > 0 && (
          <div className="card">
            <div style={{ fontFamily: 'monospace', fontSize: 11, lineHeight: 1.9, maxHeight: 400, overflowY: 'auto' }}>
              {log.map((l, i) => (
                <div key={i} style={{
                  color: l.startsWith('❌') ? '#DC2626'
                    : l.startsWith('✅') || l.startsWith('🎉') ? '#16A34A'
                    : l.startsWith('🏆') || l.startsWith('📊') ? '#f97316'
                    : '#666'
                }}>{l}</div>
              ))}
            </div>
          </div>
        )}

        {etapa === 'saving' && (
          <div style={{ textAlign: 'center', color: '#f97316', padding: 20, fontWeight: 500 }}>Importando... aguarde</div>
        )}

        {etapa === 'done' && (
          <button className="btn-primary" onClick={() => router.push('/simulados')}>Ver alunos →</button>
        )}
        {etapa === 'idle' && (
          <button className="btn-secondary" onClick={() => router.back()}>Cancelar</button>
        )}
      </div>
      <Nav />
    </div>
  )
}
