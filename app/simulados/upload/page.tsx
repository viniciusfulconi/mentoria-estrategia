// @ts-nocheck
'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'
import * as XLSX from 'xlsx'

export default function UploadSimulados() {
  const router = useRouter()
  const [log, setLog] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

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

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true); setLog([]); setDone(false)

    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    addLog(`📂 ${wb.SheetNames.length} abas encontradas`)

    // 1. Importa alunos
    const idsRows = parseSheet(wb, 'Ids Alunos')
    if (idsRows.length) {
      addLog(`\n👤 Importando ${idsRows.length} alunos...`)
      const { data: jasCadastrados } = await supabase.from('alunos_dados').select('id_aluno, cadastrado')
      const cadastradoMap: Record<string, boolean> = {}
      ;(jasCadastrados || []).forEach((a: any) => { cadastradoMap[a.id_aluno] = a.cadastrado })

      const alunosData = idsRows.map(r => {
        const idAluno = String(r['IdAluno'] || '')
        return {
          id_aluno: idAluno,
          nome: String(r['Aluno'] || ''),
          mentor: r['Mentor do Aluno'] || null,
          data_nascimento: excelDateToISO(r['Data nascimento do Aluno']),
          ingresso: r['Ingresso na Turma'] || null,
          cadastrado: cadastradoMap[idAluno] || false,
        }
      }).filter(a => a.id_aluno && a.nome)

      await supabase.from('alunos_dados').delete().neq('id_aluno', 'x')
      for (let i = 0; i < alunosData.length; i += 100) {
        await supabase.from('alunos_dados').insert(alunosData.slice(i, i + 100))
      }
      addLog(`✅ ${alunosData.length} alunos importados`)
    }

    // Monta mapa nome -> id para fallback
    const idsRows2 = parseSheet(wb, 'Ids Alunos')
    const nomeParaId: Record<string, string> = {}
    idsRows2.forEach((r: any) => {
      const id = String(r['IdAluno'] || '').trim()
      const nome = String(r['Aluno'] || '').trim().toLowerCase()
      if (id && nome) nomeParaId[nome] = id
    })

    // 2. Limpa resultados antigos
    addLog(`\n🗑 Limpando resultados anteriores...`)
    await supabase.from('resultados').delete().neq('id', '00000000-0000-0000-0000-000000000000')

    // 3. Processa cada aba de notas
    const ignorar = ['Ids Alunos', 'Processo Seletivo']
    const abasNotas = wb.SheetNames.filter(n => 
      !ignorar.includes(n) && 
      !n.includes('Ranking') && 
      !n.includes('Simulado Zero') &&
      !n.includes('Ciclo 0') &&
      !n.includes('Diagnóstico')
    )
    addLog(`\n📊 Processando ${abasNotas.length} abas de notas...`)

    const todosDados: any[] = []
    let totalRecs = 0

    for (const sheetName of abasNotas) {
      const rows = parseSheet(wb, sheetName)
      if (!rows.length) continue

      const { ciclo, tipo, concurso } = detectTipo(sheetName)
      addLog(`  → ${sheetName} (${rows.length} alunos)`)

      const records = rows.map(r => {
        let idAluno = String(r['IdAluno'] ?? '').trim()
        // Fallback: busca ID pelo nome quando IdAluno está vazio
        if (!idAluno || idAluno === 'null' || idAluno === 'undefined') {
          const nomeAluno = String(r['Aluno'] || '').trim().toLowerCase()
          idAluno = nomeParaId[nomeAluno] || ''
        }
        if (!idAluno) return null

        // Notas por questão para assertividade
        const notasQuestoes: Record<string, number> = {}
        Object.keys(r).forEach(k => {
          if (k.match(/^Q\d+$/) && typeof r[k] === 'number') notasQuestoes[k] = r[k]
        })

        const rec: any = {
          ciclo_nome: ciclo,
          concurso,
          id_aluno: idAluno,
          nome_aluno: String(r['Aluno'] || ''),
          mentor: r['Mentor do Aluno'] || null,
          fase: tipo,
          notas_questoes: Object.keys(notasQuestoes).length ? notasQuestoes : null,
          resultado: r['Resultado'] || null,
          motivo_reprovacao: r['Motivo Eliminação'] || r['Motivo Reprovação'] || null,
          classificacao: r['CL'] ? Number(r['CL']) : null,
        }

        // Notas específicas por tipo
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
          // ITA: Media Linguagens = (obj + redação) / 2
          // IME: Nota agregada de Port + Ing
          rec.media_linguagens = r['Media Linguagens'] !== undefined ? Number(r['Media Linguagens'])
            : r['Nota'] !== undefined ? Number(r['Nota']) : null
          rec.nota_redacao = r['Nota Redacao'] !== undefined ? Number(r['Nota Redacao']) : null
          rec.nota_portugues = r['Nota'] !== undefined ? Number(r['Nota']) : null
        } else if (tipo === '2fase_ing') {
          rec.nota_ingles = r['Nota'] !== undefined ? Number(r['Nota']) : null
        }

        todosDados.push(rec)
        return rec
      }).filter(Boolean)

      totalRecs += records.length
      for (let i = 0; i < records.length; i += 100) {
        await supabase.from('resultados').insert(records.slice(i, i + 100))
      }
    }

    addLog(`✅ ${totalRecs} registros de notas importados`)

    // 4. Calcula e insere rankings sintéticos
    addLog(`\n🏆 Calculando rankings...`)
    const rankings = calcularRankings(todosDados)
    
    // Agrupa por ciclo
    const porCiclo: Record<string, any[]> = {}
    rankings.forEach(r => {
      const k = `${r.ciclo_nome}__${r.concurso}`
      if (!porCiclo[k]) porCiclo[k] = []
      porCiclo[k].push(r)
    })

    // Ordena por média e atribui classificação
    let totalRankings = 0
    for (const [key, grupo] of Object.entries(porCiclo)) {
      grupo.sort((a, b) => (b.media_2fase ?? 0) - (a.media_2fase ?? 0))
      grupo.forEach((r, i) => { r.classificacao = i + 1 })
      for (let i = 0; i < grupo.length; i += 100) {
        await supabase.from('resultados').insert(grupo.slice(i, i + 100))
      }
      totalRankings += grupo.length
      const [cicloKey] = key.split('__')
      addLog(`  ✅ ${cicloKey}: ${grupo.length} alunos`)
    }

    addLog(`\n🎉 Importação concluída!`)
    addLog(`   📊 ${totalRecs} notas + ${totalRankings} rankings`)
    setDone(true)
    setLoading(false)
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>←</button>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Upload de resultados</div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Planilha de gabaritos (.xlsx)</div>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 12, lineHeight: 1.6 }}>
            Selecione a planilha atualizada. Os dados anteriores serão substituídos.<br/>
            Ciclos parciais (sem todas as fases) são importados normalmente.
          </div>
          <input type="file" accept=".xlsx,.xls" onChange={handleFile} disabled={loading}
            style={{ width: '100%', padding: '10px', borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.12)', background: '#F7F6F3', fontSize: 13 }} />
        </div>

        {log.length > 0 && (
          <div className="card">
            <div style={{ fontFamily: 'monospace', fontSize: 11, lineHeight: 1.9, maxHeight: 400, overflowY: 'auto' }}>
              {log.map((l, i) => (
                <div key={i} style={{
                  color: l.startsWith('❌') ? '#E24B4A'
                    : l.startsWith('✅') || l.startsWith('🎉') ? '#1D9E75'
                    : l.startsWith('🏆') || l.startsWith('📊') ? '#534AB7'
                    : '#666'
                }}>{l}</div>
              ))}
            </div>
          </div>
        )}

        {loading && <div style={{ textAlign: 'center', color: '#534AB7', padding: 20, fontWeight: 500 }}>Importando... aguarde</div>}

        {done && (
          <button className="btn-primary" onClick={() => router.push('/simulados')}>Ver alunos →</button>
        )}
        {!loading && !done && <button className="btn-secondary" onClick={() => router.back()}>Cancelar</button>}
      </div>
      <Nav />
    </div>
  )
}
