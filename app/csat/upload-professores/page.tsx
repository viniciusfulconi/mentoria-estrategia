'use client'
import { useState } from 'react'
import { dbInsert } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'

const MATERIAS = [
  'Matemática',
  'Física ITA',
  'Física IME',
  'Química ITA',
  'Química IME',
  'Português',
  'Redação',
]

const ESCALA_QUALIDADE: Record<string, number> = {
  'Muito Ruim': 1, 'Ruim': 2, 'Regular': 3, 'Bom': 4, 'Muito Bom': 5,
}
const ESCALA_RITMO: Record<string, number> = {
  'Muito Lento': 1, 'Lento': 2, 'Normal': 3, 'Rápido': 4, 'Muito Rápido': 5,
}

// Each professor block has exactly 11 columns in this order
const BLOCK_FIELDS: { field: string; ritmo: boolean; isText?: boolean }[] = [
  { field: 'dominio_conteudo',          ritmo: false },
  { field: 'clareza_explicacao',        ritmo: false },
  { field: 'ritmo_aula',                ritmo: true  },
  { field: 'teoria_exercicios',         ritmo: false },
  { field: 'organizacao_quadro',        ritmo: false },
  { field: 'respeito_alunos',           ritmo: false },
  { field: 'acessibilidade_duvidas',    ritmo: false },
  { field: 'cumprimento_horarios',      ritmo: false },
  { field: 'contribuicao_aprendizado',  ritmo: false },
  { field: 'adequacao_listas',          ritmo: false },
  { field: 'comentario',                ritmo: false, isText: true },
]

function converterNota(val: any, isRitmo: boolean): number | null {
  if (!val) return null
  const s = String(val).trim()
  if (isRitmo) return ESCALA_RITMO[s] ?? ESCALA_QUALIDADE[s] ?? null
  return ESCALA_QUALIDADE[s] ?? null
}

export default function UploadProfessores() {
  const router = useRouter()
  const [nomeAvaliacao, setNomeAvaliacao] = useState('')
  const [data, setData] = useState(new Date().toISOString().split('T')[0])
  const [materia, setMateria] = useState(MATERIAS[0])
  const [numBlocos, setNumBlocos] = useState(0)
  const [nomesProfessores, setNomesProfessores] = useState<string[]>([])
  const [rows, setRows] = useState<any[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [done, setDone] = useState(false)

  function addLog(msg: string) { setLog(prev => [...prev, msg]) }

  function setNomeProf(i: number, v: string) {
    setNomesProfessores(prev => { const a = [...prev]; a[i] = v; return a })
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    const XLSX = await import('xlsx')
    const reader = new FileReader()
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const parsed = XLSX.utils.sheet_to_json(ws, { defval: null }) as any[]
      if (!parsed.length) return
      const hdrs = Object.keys(parsed[0])
      // Col 0 = timestamp; then 11 cols per professor
      const nBlocos = Math.floor((hdrs.length - 1) / 11)
      setHeaders(hdrs)
      setRows(parsed)
      setNumBlocos(nBlocos)
      setNomesProfessores(Array(nBlocos).fill(''))
    }
    reader.readAsArrayBuffer(f)
  }

  async function salvar() {
    if (!nomeAvaliacao.trim()) { addLog('❌ Informe o nome da avaliação.'); return }
    if (!rows.length) { addLog('❌ Selecione a planilha.'); return }
    if (nomesProfessores.some(n => !n.trim())) { addLog('❌ Preencha o nome de todos os professores.'); return }

    setSaving(true); setLog([])

    addLog('📋 Criando avaliação...')
    const { data: avalArr, error: aErr } = await dbInsert<any>(
      'avaliacoes_professores',
      [{ nome: nomeAvaliacao.trim(), materia, data }],
      true
    )
    if (aErr) { addLog(`❌ ${aErr}`); setSaving(false); return }
    const avaliacaoId = (avalArr as any)?.[0]?.id
    addLog(`✅ Avaliação "${nomeAvaliacao}" criada!`)

    const respostas: Record<string, any>[] = []
    for (let blocoIdx = 0; blocoIdx < numBlocos; blocoIdx++) {
      const professor = nomesProfessores[blocoIdx].trim()
      for (const row of rows) {
        const r: Record<string, any> = { avaliacao_id: avaliacaoId, professor, materia }
        BLOCK_FIELDS.forEach((f, offset) => {
          const colIdx = 1 + blocoIdx * 11 + offset
          const val = row[headers[colIdx]]
          if (f.isText) {
            r[f.field] = val ? String(val).trim() : null
          } else {
            r[f.field] = converterNota(val, f.ritmo)
          }
        })
        respostas.push(r)
      }
    }

    addLog(`📊 Importando ${respostas.length} respostas (${rows.length} por professor)...`)
    const { error: rErr } = await dbInsert('respostas_professor', respostas)
    if (rErr) { addLog(`❌ ${rErr}`); setSaving(false); return }

    addLog(`✅ ${respostas.length} respostas importadas!`)
    addLog('🎉 Avaliação importada com sucesso!')
    setDone(true)
    setSaving(false)
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>←</button>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Importar avaliação de professores</div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Dados da avaliação</div>
          <div style={{ marginBottom: 12 }}>
            <label>Nome da avaliação</label>
            <input value={nomeAvaliacao} onChange={e => setNomeAvaliacao(e.target.value)} placeholder="Ex: 1ª Avaliação — Maio 2026" />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label>Data de aplicação</label>
            <input type="date" value={data} onChange={e => setData(e.target.value)} />
          </div>
          <div>
            <label>Matéria</label>
            <select
              value={materia}
              onChange={e => setMateria(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.12)', background: '#F7F6F3', fontSize: 13, fontFamily: 'DM Sans, sans-serif' }}
            >
              {MATERIAS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Planilha de respostas</div>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>
            Exporte do Google Forms como .xlsx. Cada bloco de 11 colunas representa um professor (10 notas + comentário geral).
          </div>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFile}
            style={{ width: '100%', padding: '10px', borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.12)', background: '#F7F6F3', fontSize: 13 }}
          />

          {numBlocos > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: '#16A34A', marginBottom: 12 }}>
                ✅ {rows.length} respostas · {numBlocos} professor(es) detectado(s)
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 10, color: '#333' }}>
                Nomes dos professores (na ordem da planilha):
              </div>
              {nomesProfessores.map((n, i) => (
                <div key={i} style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 11, color: '#666', marginBottom: 4, display: 'block' }}>
                    Professor {i + 1}
                  </label>
                  <input
                    value={n}
                    onChange={e => setNomeProf(i, e.target.value)}
                    placeholder={`Nome do professor ${i + 1}`}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {log.length > 0 && (
          <div className="card">
            <div style={{ fontFamily: 'monospace', fontSize: 11, lineHeight: 2 }}>
              {log.map((l, i) => (
                <div key={i} style={{ color: l.startsWith('❌') ? '#DC2626' : l.startsWith('✅') || l.startsWith('🎉') ? '#16A34A' : '#666' }}>{l}</div>
              ))}
            </div>
          </div>
        )}

        {done ? (
          <button className="btn-primary" onClick={() => router.push('/csat')}>Ver painel CSAT →</button>
        ) : (
          <button
            className="btn-primary"
            onClick={salvar}
            disabled={saving || !rows.length || !nomeAvaliacao.trim() || numBlocos === 0}
          >
            {saving ? 'Importando...' : 'Importar avaliação'}
          </button>
        )}
        <button className="btn-secondary" onClick={() => router.back()}>Cancelar</button>
      </div>
      <Nav />
    </div>
  )
}
