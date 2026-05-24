'use client'
import { useState } from 'react'
import { dbInsert, dbDelete } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'

// Parser CSV robusto: suporta campos com aspas, quebras de linha e separador `;`
function parseCSV(text: string, sep = ';'): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') { inQuotes = false }
      else { field += c }
    } else {
      if (c === '"') { inQuotes = true }
      else if (c === sep) { row.push(field.trim()); field = '' }
      else if (c === '\n') { row.push(field.trim()); field = ''; if (row.some(v => v)) rows.push(row); row = [] }
      else if (c !== '\r') { field += c }
    }
  }
  if (field.trim() || row.length) { row.push(field.trim()); if (row.some(v => v)) rows.push(row) }
  return rows
}

// Mapeamento dos nomes de coluna do AppSheet para índices
const COL_MAP: Record<string, string[]> = {
  mentor:       ['Quem é o mentor (a)?', 'Mentor'],
  tipo:         ['A mentoria foi individual ou coletiva?', 'Individual / Coletiva'],
  aluno:        ['Qual foi o aluno atendido?', 'Aluno'],
  data:         ['Qual foi a data do atendimento?', 'Data Mentoria'],
  hora_inicio:  ['Qual foi o horário de início do atendimento?', 'Hora Inicio'],
  hora_fim:     ['Qual foi o horário de término do atendimento?', 'Hora Fim'],
  psico:        ['Há a necessidade de encaminhamento para o atendimento psicológico?', 'Encaminhamento Psicologico'],
  solicitacao:  ['O aluno fez alguma solicitação (lista extra, teste de velocidade etc.)?', 'Solicitacao Aluno'],
  descricao:    ['Descreva o atendimento com suas próprias palavras. Este registro será usado para o seu controle e para o da coordenação. Caso não haja necessidade, deixe em branco.', 'Descricao Atendimento'],
  gravacao:     ['Anexe o link da gravação da chamada.', 'Link da gravação da chamada'],
  gemini:       ['Adicione o relatório do Gemini da chamada.', 'Link do Relatório do Gemini'],
  duracao:      ['Duração Real', 'Duração Real'],
  ano:          ['Ano', 'Ano'],
  mes:          ['Mês', 'Mês'],
  id_original:  ['idMentoria', 'idMentoria'],
}

function findColIdx(headers: string[], aliases: string[]): number {
  for (const alias of aliases) {
    // Busca exata primeiro, depois por inclusão parcial
    const exact = headers.findIndex(h => h.toLowerCase().trim() === alias.toLowerCase().trim())
    if (exact !== -1) return exact
    const partial = headers.findIndex(h => h.toLowerCase().includes(alias.toLowerCase().slice(0, 30)))
    if (partial !== -1) return partial
  }
  return -1
}

function parseDuracao(dur: string): number {
  if (!dur) return 0
  const parts = dur.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 60 + parts[1]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return 0
}

function parseData(d: string): string | null {
  if (!d) return null
  // Aceita tanto dd/mm/yyyy quanto dd/mm/yyyy HH:MM:SS (DataHoraEnvio)
  const parteData = d.split(' ')[0]
  const parts = parteData.split('/')
  if (parts.length === 3) return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  return null
}

export default function UploadAtendimentos() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [done, setDone] = useState(false)
  const [preview, setPreview] = useState<any[]>([])

  function addLog(msg: string) { setLog(prev => [...prev, msg]) }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setLog([])
    setPreview([])
    setDone(false)

    const text = await file.text()
    const allRows = parseCSV(text, ';')
    if (!allRows.length) { addLog('❌ Arquivo vazio ou formato inválido.'); return }

    // Encontra a linha de header (contém "Mentor" ou "DataHoraEnvio")
    const headerIdx = allRows.findIndex(r =>
      r.some(c => c.includes('Mentor') || c.includes('DataHoraEnvio') || c.includes('mentor'))
    )
    if (headerIdx === -1) { addLog('❌ Cabeçalho não encontrado. Verifique se o arquivo é do AppSheet.'); return }

    const headers = allRows[headerIdx]
    addLog(`📋 ${headers.length} colunas detectadas`)

    // Mapeia colunas
    const cols: Record<string, number> = {}
    for (const [key, aliases] of Object.entries(COL_MAP)) {
      cols[key] = findColIdx(headers, aliases)
    }

    const get = (row: string[], key: string) => cols[key] >= 0 ? (row[cols[key]] || '') : ''

    const dataRows = allRows.slice(headerIdx + 1)
    const rows = dataRows
      .filter(row => {
        const mentor = get(row, 'mentor')
        const data = get(row, 'data')
        return mentor && mentor !== '#N/A' && data
      })

    setPreview(rows)
    addLog(`✅ ${rows.length} registros detectados`)

    const mentores = [...new Set(rows.map(r => get(r, 'mentor')))].sort()
    addLog(`👥 Mentores: ${mentores.join(', ')}`)
    const psico = rows.filter(r => get(r, 'psico').toLowerCase().includes('sim')).length
    addLog(`🧠 Encaminhamentos psicológicos: ${psico}`)

    // Guarda mapeamento para uso no importar
    ;(window as any).__atendimentosCols = cols
    ;(window as any).__atendimentosHeaders = headers
  }

  async function importar() {
    if (!preview.length) return
    setLoading(true)
    addLog('\n🗑 Limpando dados anteriores...')
    await dbDelete('atendimentos_mentoria', { id: 'neq.00000000-0000-0000-0000-000000000000' })

    const cols: Record<string, number> = (window as any).__atendimentosCols || {}
    const get = (row: string[], key: string) => cols[key] >= 0 ? (row[cols[key]] || '') : ''

    const records = preview.map(r => {
      const min = parseDuracao(get(r, 'duracao'))
      const valor = Math.round((min / 60) * 200 * 100) / 100
      return {
        id_original: Number(get(r, 'id_original')) || null,
        mentor: get(r, 'mentor'),
        tipo: get(r, 'tipo') || 'Individual',
        aluno: get(r, 'aluno') || null,
        data_atendimento: parseData(get(r, 'data')),
        hora_inicio: get(r, 'hora_inicio') || null,
        hora_fim: get(r, 'hora_fim') || null,
        duracao_minutos: min,
        encaminhamento_psico: get(r, 'psico').toLowerCase().includes('sim'),
        solicitacao_aluno: get(r, 'solicitacao') || null,
        descricao: get(r, 'descricao') || null,
        link_gravacao: get(r, 'gravacao') || null,
        link_gemini: get(r, 'gemini') || null,
        mes: get(r, 'mes') || null,
        ano: Number(get(r, 'ano')) || null,
        valor_pago: valor,
      }
    }).filter(r => r.data_atendimento)

    addLog(`📊 Importando ${records.length} atendimentos...`)

    for (let i = 0; i < records.length; i += 100) {
      const lote = records.slice(i, i + 100)
      const { error } = await dbInsert('atendimentos_mentoria', lote)
      if (error) { addLog(`❌ Erro no lote ${Math.floor(i / 100) + 1}: ${error}`); break }
      addLog(`  ✅ Lote ${Math.floor(i / 100) + 1}/${Math.ceil(records.length / 100)} importado`)
    }

    const valorTotal = records.reduce((a, r) => a + r.valor_pago, 0)
    addLog(`\n💰 Valor total: R$ ${valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`)
    addLog('🎉 Importação concluída!')
    setDone(true)
    setLoading(false)
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>←</button>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Importar atendimentos</div>
      </div>
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Planilha de atendimentos (.csv)</div>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 12, lineHeight: 1.6 }}>
            Exporte a planilha do AppSheet como CSV e faça o upload. Os dados anteriores serão substituídos.
          </div>
          <input type="file" accept=".csv" onChange={handleFile}
            style={{ width: '100%', padding: '10px', borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.12)', background: '#F7F6F3', fontSize: 13 }} />
        </div>

        {log.length > 0 && (
          <div className="card">
            <div style={{ fontFamily: 'monospace', fontSize: 11, lineHeight: 1.9, maxHeight: 300, overflowY: 'auto' }}>
              {log.map((l, i) => (
                <div key={i} style={{ color: l.startsWith('❌') ? '#DC2626' : l.startsWith('✅') || l.startsWith('🎉') ? '#16A34A' : l.startsWith('💰') ? '#2563EB' : '#666' }}>{l}</div>
              ))}
            </div>
          </div>
        )}

        {preview.length > 0 && !done && (
          <button className="btn-primary" onClick={importar} disabled={loading}>
            {loading ? 'Importando...' : `Importar ${preview.length} atendimentos`}
          </button>
        )}
        {done && (
          <button className="btn-primary" onClick={() => router.push('/atendimentos')}>Ver atendimentos →</button>
        )}
        <button className="btn-secondary" onClick={() => router.back()}>Cancelar</button>
      </div>
      <Nav />
    </div>
  )
}
