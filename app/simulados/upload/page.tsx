// @ts-nocheck
'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'
import * as XLSX from 'xlsx'

type PreviewData = {
  alunosCount: number
  abas: { nome: string; ciclo: string; tipo: string; concurso: string; alunos: number; avisos: string[] }[]
  avisoGeral: string[]
  alunosData: any[]
  registros: any[]
  todosDados: any[]
}

export default function UploadSimulados() {
  const router = useRouter()
  const [log, setLog] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [etapa, setEtapa] = useState<'idle' | 'parsing' | 'preview' | 'saving' | 'done'>('idle')

  function addLog(msg: string) { setLog(prev => [...prev, msg]) }

  function parseSheet(wb: any, name: string): any[] {
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
    const isITA = name.includes('ITA')
    const isIME = name.includes('IME')
    const concurso = isIME ? 'IME' : 'ITA'
    const numMatch = name.match(/Ciclo (\d+)/)
    const num = numMatch ? numMatch[1] : '0'
    const cicloBase = `Ciclo ${num}`

    if (name.includes('1a Fase')) return { ciclo: cicloBase, tipo: '1fase', concurso }
    if (name.includes('Matem')) return { ciclo: cicloBase, tipo: '2fase_mat', concurso }
    if (name.includes('Físic') || name.includes('Fisic')) return { ciclo: cicloBase, tipo: '2fase_fis', concurso }
    if (name.includes('Quím') || name.includes('Quim')) return { ciclo: cicloBase, tipo: '2fase_qui', concurso }
    if (name.includes('Port') || name.includes('Lingu')) return { ciclo: cicloBase, tipo: '2fase_port', concurso }
    if (name.includes('Inglês') || name.includes('Ingles')) return { ciclo: cicloBase, tipo: '2fase_ing', concurso }
    if (name.includes('Processo')) return { ciclo: name, tipo: '1fase', concurso }
    return { ciclo: cicloBase, tipo: 'outro', concurso }
  }

  // Calcula médias finais por ciclo/concurso para cada aluno
  function calcularRankings(todosDados: any[]): any[] {
    // Agrupa por aluno + ciclo
    const grupos: Record<string, any> = {}
    todosDados.forEach(r => {
      const key = `${r.id_aluno}__${r.ciclo_nome}__${r.concurso}`
      if (!grupos[key]) grupos[key] = { ...r, fases: {} }
      grupos[key].fases[r.fase] = r
    })

    const rankings: any[] = []
    Object.values(grupos).forEach((g: any) => {
      const f1 = g.fases['1fase']
      const fmat = g.fases['2fase_mat']
      const ffis = g.fases['2fase_fis']
      const fqui = g.fases['2fase_qui']
      const fport = g.fases['2fase_port']
      const fing = g.fases['2fase_ing']

      const nota1f = f1?.media_1fase ?? null
      const notaMat = fmat?.nota_matematica ?? null
      const notaFis = ffis?.nota_fisica ?? null
      const notaQui = fqui?.nota_quimica ?? null
      const notaPort = fport?.media_linguagens ?? null
      const notaIng = fing?.nota_ingles ?? null

      let mediaFinal = null
      let resultado = null

      if (g.concurso === 'ITA') {
        // Média ITA: 0.20 * cada uma das 5 componentes
        const notas = [nota1f, notaMat, notaFis, notaQui, notaPort].filter(n => n !== null)
        if (notas.length > 0) {
          mediaFinal = notas.reduce((a, b) => a + b, 0) / notas.length
          // Verifica reprovação
          if (notas.length === 5) {
            const reprovado = [notaMat, notaFis, notaQui, notaPort].some(n => n < 4.0)
            resultado = (mediaFinal >= 5.0 && !reprovado) ? 'Aprovado' : 'Reprovado'
          } else {
            resultado = 'Em andamento'
          }
        }
      } else {
        // Média IME: (3*Mat + 2.5*Fis + 2.5*Qui + 1*Port + 1*Ing) / 10
        if (notaMat !== null || notaFis !== null || notaQui !== null || notaPort !== null || notaIng !== null) {
          const notas2f = [notaMat, notaFis, notaQui, notaPort, notaIng]
          const pesos = [3, 2.5, 2.5, 1, 1]
          let soma = 0, pesoTotal = 0
          notas2f.forEach((n, i) => {
            if (n !== null) { soma += n * pesos[i]; pesoTotal += pesos[i] }
          })
          const media2f = pesoTotal > 0 ? soma / pesoTotal : null
          mediaFinal = media2f

          const todasPresentes = notas2f.every(n => n !== null)
          if (todasPresentes) {
            const reprovado = notas2f.some(n => n < 4.0)
            resultado = !reprovado ? 'Aprovado' : 'Reprovado'
          } else {
            resultado = 'Em andamento'
          }
        }
      }

      rankings.push({
        ciclo_nome: g.ciclo_nome,
        concurso: g.concurso,
        id_aluno: g.id_aluno,
        nome_aluno: g.nome_aluno,
        mentor: g.mentor,
        fase: 'ranking',
        media_1fase: nota1f,
        nota_matematica: notaMat,
        nota_fisica: notaFis,
        nota_quimica: notaQui,
        media_linguagens: notaPort,
        nota_ingles: notaIng,
        media_2fase: mediaFinal,
        resultado_ciclo: resultado,
      })
    })

    return rankings
  }

  function parsearPlanilha(wb: any): PreviewData {
    const ignorar = ['Ids Alunos', 'Processo Seletivo']
    const idsRows = parseSheet(wb, 'Ids Alunos')

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

    const abasNotas = wb.SheetNames.filter(n =>
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
      const rows = parseSheet(wb, sheetName)
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
          rec.media_linguagens = r['Media Linguagens'] !== undefined ? Number(r['Media Linguagens'])
            : r['Nota'] !== undefined ? Number(r['Nota']) : null
          rec.nota_redacao = r['Nota Redacao'] !== undefined ? Number(r['Nota Redacao']) : null
          rec.nota_portugues = r['Nota'] !== undefined ? Number(r['Nota']) : null
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
    const wb = XLSX.read(buf, { type: 'array' })
    const dados = parsearPlanilha(wb)
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
        const { data: jasCadastrados, error: selErr } = await supabase.from('alunos_dados').select('id_aluno, cadastrado')
        if (selErr) throw new Error(`Erro ao ler alunos: ${selErr.message}`)
        const cadastradoMap: Record<string, boolean> = {}
        ;(jasCadastrados || []).forEach((a: any) => { cadastradoMap[a.id_aluno] = a.cadastrado })
        preview.alunosData.forEach(a => { a.cadastrado = cadastradoMap[a.id_aluno] || false })

        const { error: delErr } = await supabase.from('alunos_dados').delete().neq('id_aluno', 'x')
        if (delErr) throw new Error(`Erro ao limpar alunos: ${delErr.message}`)
        for (let i = 0; i < preview.alunosData.length; i += 100) {
          const { error: insErr } = await supabase.from('alunos_dados').insert(preview.alunosData.slice(i, i + 100))
          if (insErr) throw new Error(`Erro ao inserir alunos (lote ${i}): ${insErr.message}`)
        }
        addLog(`✅ ${preview.alunosData.length} alunos importados`)
      }

      // 2. Limpa e reinsere resultados
      addLog(`🗑 Limpando resultados anteriores...`)
      const { error: delResErr } = await supabase.from('resultados').delete().neq('id', '00000000-0000-0000-0000-000000000000')
      if (delResErr) throw new Error(`Erro ao limpar resultados: ${delResErr.message}`)

      addLog(`📊 Importando ${preview.registros.length} registros...`)
      for (let i = 0; i < preview.registros.length; i += 100) {
        const { error: insErr } = await supabase.from('resultados').insert(preview.registros.slice(i, i + 100))
        if (insErr) throw new Error(`Erro ao inserir resultados (lote ${i}): ${insErr.message}`)
        addLog(`   ↳ ${Math.min(i + 100, preview.registros.length)}/${preview.registros.length} registros`)
      }

      // 3. Rankings
      addLog(`🏆 Calculando rankings...`)
      const rankings = calcularRankings(preview.todosDados)
      const porCiclo: Record<string, any[]> = {}
      rankings.forEach(r => {
        const k = `${r.ciclo_nome}__${r.concurso}`
        if (!porCiclo[k]) porCiclo[k] = []
        porCiclo[k].push(r)
      })
      let totalRankings = 0
      for (const [key, grupo] of Object.entries(porCiclo)) {
        grupo.sort((a, b) => (b.media_2fase ?? 0) - (a.media_2fase ?? 0))
        grupo.forEach((r, i) => { r.classificacao = i + 1 })
        for (let i = 0; i < grupo.length; i += 100) {
          const { error: insErr } = await supabase.from('resultados').insert(grupo.slice(i, i + 100))
          if (insErr) throw new Error(`Erro ao inserir ranking ${key}: ${insErr.message}`)
        }
        totalRankings += grupo.length
        addLog(`  ✅ ${key.split('__')[0]}: ${grupo.length} alunos`)
      }

      addLog(`\n🎉 Importação concluída!`)
      addLog(`   📊 ${preview.registros.length} notas + ${totalRankings} rankings`)
      setEtapa('done'); setDone(true)
    } catch (e: any) {
      addLog(`\n❌ Erro: ${e.message}`)
      addLog(`Tente novamente. Se persistir, verifique o banco de dados.`)
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
              <div style={{ textAlign: 'center', color: '#2563EB', padding: '16px 0 4px', fontSize: 13, fontWeight: 500 }}>
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
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#2563EB' }}>{preview.alunosCount}</div>
                  <div style={{ fontSize: 11, color: '#999' }}>alunos na planilha</div>
                </div>
                <div style={{ background: '#F8FAFC', borderRadius: 10, padding: '10px 14px' }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: '#2563EB' }}>{preview.registros.length}</div>
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
                    background: aba.concurso === 'ITA' ? '#EFF6FF' : '#DCFCE7',
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

            <div className="card" style={{ background: '#FEF2F2', borderLeft: '4px solid #DC2626' }}>
              <div style={{ fontSize: 12, color: '#991B1B', fontWeight: 600, marginBottom: 4 }}>Atenção — esta ação é irreversível</div>
              <div style={{ fontSize: 12, color: '#991B1B' }}>Todos os resultados anteriores serão apagados e substituídos pelos dados desta planilha.</div>
            </div>

            <button className="btn-primary" onClick={confirmarImportacao}>
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
                    : l.startsWith('🏆') || l.startsWith('📊') ? '#2563EB'
                    : '#666'
                }}>{l}</div>
              ))}
            </div>
          </div>
        )}

        {etapa === 'saving' && (
          <div style={{ textAlign: 'center', color: '#2563EB', padding: 20, fontWeight: 500 }}>Importando... aguarde</div>
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
