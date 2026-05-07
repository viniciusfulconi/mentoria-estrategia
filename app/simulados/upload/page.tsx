'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import Nav from '@/components/Nav'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'

type Row = Record<string, any>

function parseSheet(wb: XLSX.WorkBook, sheetName: string): Row[] {
  const ws = wb.Sheets[sheetName]
  if (!ws) return []
  return XLSX.utils.sheet_to_json(ws, { defval: null })
}

function detectFase(sheetName: string): string {
  if (sheetName.includes('Ranking')) return 'ranking'
  if (sheetName.includes('1a Fase') || sheetName.includes('Simulado Zero') || sheetName.includes('Diagnóstico') || sheetName.includes('Processo')) return '1fase'
  if (sheetName.includes('Matem')) return '2fase_mat'
  if (sheetName.includes('Físic') || sheetName.includes('Fisic')) return '2fase_fis'
  if (sheetName.includes('Quím') || sheetName.includes('Quim')) return '2fase_qui'
  if (sheetName.includes('Portu') || sheetName.includes('Lingu')) return '2fase_port'
  return 'outro'
}

function detectTipo(sheetName: string): string {
  if (sheetName.includes('IME')) return 'IME'
  return 'ITA'
}

export default function UploadSimulados() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [done, setDone] = useState(false)

  function addLog(msg: string) {
    setLog(prev => [...prev, msg])
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLoading(true)
    setLog([])
    setDone(false)

    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheets = wb.SheetNames.filter(n =>
        !n.includes('Ids Alunos') && n !== 'Sheet1'
      )

      addLog(`📋 Planilha lida: ${sheets.length} abas encontradas`)

      // Limpar dados antigos
      addLog('🗑 Limpando dados anteriores...')
      await supabase.from('resultados').delete().neq('id', '00000000-0000-0000-0000-000000000000')

      let total = 0

      for (const sheetName of sheets) {
        const rows = parseSheet(wb, sheetName)
        if (!rows.length) continue

        const fase = detectFase(sheetName)
        const tipo = detectTipo(sheetName)
        addLog(`📊 Processando: ${sheetName} (${rows.length} alunos)`)

        const records = rows.map((r: Row) => {
          // Respostas 1ª fase (Q1..Q48 como letras)
          const respostas: Record<string, string> = {}
          const notasQuestoes: Record<string, number> = {}

          for (let i = 1; i <= 48; i++) {
            const key = `Q${i}`
            if (r[key] !== null && r[key] !== undefined) {
              if (fase === '1fase') respostas[key] = String(r[key])
              else notasQuestoes[key] = Number(r[key])
            }
          }

          // Calcular acertos para 1ª fase ITA (48 questões em blocos de 12)
          // Mat: Q1-12, Fis: Q13-24, Qui: Q25-36, Ing: Q37-48
          // Nota: para 1ª fase, não temos o gabarito na planilha, mas temos acertos nas abas de ranking
          // Usamos os campos diretos quando existem
          const acertosMat = r['Acertos Matemática'] ?? r['Acertos Mat'] ?? null
          const acertosFis = r['Acertos Física'] ?? r['Acertos Fis'] ?? null
          const acertosQui = r['Acertos Química'] ?? r['Acertos Qui'] ?? null
          const acertosIng = r['Acertos Inglês'] ?? r['Acertos Ing'] ?? null

          return {
            ciclo_nome: r['Simulado'] ?? sheetName,
            id_aluno: String(r['IdAluno'] ?? ''),
            nome_aluno: String(r['Aluno'] ?? ''),
            mentor: r['Mentor do Aluno'] ?? null,
            fase,
            classificacao: r['CL'] ? Number(r['CL']) : null,
            nota_final: r['Nota Final'] ?? r['Nota'] ?? null,
            acertos_mat: acertosMat,
            acertos_fis: acertosFis,
            acertos_qui: acertosQui,
            acertos_ing: acertosIng,
            acertos_total: r['Total'] ?? null,
            respostas: Object.keys(respostas).length ? respostas : null,
            notas_questoes: Object.keys(notasQuestoes).length ? notasQuestoes : null,
            pontos_inteiros: r['Pontos Inteiros'] ?? null,
            resultado: r['Resultado'] ?? r['Resultado Ciclo'] ?? null,
            motivo_reprovacao: r['Motivo Reprovação'] ?? r['Motivo Reprovação Ciclo'] ?? r['Motivo Eliminação'] ?? null,
            // ranking
            media_1fase: r['Média 1a Fase'] ?? r['Media 1a Fase'] ?? null,
            media_2fase: r['Média 2a Fase'] ?? r['Media 2a Fase'] ?? null,
            nota_matematica: r['Matemática'] ?? r['Matematica'] ?? null,
            nota_fisica: r['Física'] ?? r['Fisica'] ?? null,
            nota_quimica: r['Química'] ?? r['Quimica'] ?? null,
            nota_portugues: r['Português'] ?? r['Portugues'] ?? null,
            nota_redacao: r['Nota Redacao'] ?? null,
            media_linguagens: r['Media Linguagens'] ?? r['Média Linguagens'] ?? null,
            resultado_ciclo: r['Resultado Ciclo'] ?? null,
          }
        }).filter(r => r.id_aluno && r.id_aluno !== 'null')

        if (records.length) {
          const { error } = await supabase.from('resultados').insert(records)
          if (error) {
            addLog(`❌ Erro em ${sheetName}: ${error.message}`)
          } else {
            total += records.length
            addLog(`✅ ${sheetName}: ${records.length} registros importados`)
          }
        }
      }

      addLog(`\n🎉 Importação concluída! ${total} registros no total.`)
      setDone(true)
    } catch (err: any) {
      addLog(`❌ Erro geral: ${err.message}`)
    }

    setLoading(false)
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>←</button>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Importar planilha</div>
      </div>

      <div style={{ padding: 16 }}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>📁 Selecione a planilha Excel</div>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 14, lineHeight: 1.6 }}>
            Faça upload do arquivo <strong>Gabaritos_ITA_IME_2026.xlsx</strong> (ou versão atualizada). 
            Os dados anteriores serão substituídos automaticamente.
          </div>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFile}
            disabled={loading}
            style={{ width: '100%', padding: '10px', borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.12)', background: '#F7F6F3', fontSize: 13, cursor: 'pointer' }}
          />
        </div>

        {loading && (
          <div className="card" style={{ marginBottom: 16, textAlign: 'center', padding: 24 }}>
            <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
            <div style={{ fontSize: 13, color: '#999' }}>Processando planilha...</div>
          </div>
        )}

        {log.length > 0 && (
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Log de importação</div>
            <div style={{ fontFamily: 'monospace', fontSize: 11, lineHeight: 2, maxHeight: 300, overflowY: 'auto' }}>
              {log.map((l, i) => (
                <div key={i} style={{ color: l.startsWith('❌') ? '#E24B4A' : l.startsWith('✅') ? '#1D9E75' : l.startsWith('🎉') ? '#534AB7' : '#666' }}>{l}</div>
              ))}
            </div>
          </div>
        )}

        {done && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button className="btn-primary" onClick={() => router.push('/turma')}>
              Ver turma completa →
            </button>
            <button className="btn-secondary" onClick={() => router.push('/simulados')}>
              Ver por aluno →
            </button>
          </div>
        )}
      </div>
      <Nav />
    </div>
  )
}
