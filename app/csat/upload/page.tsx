'use client'
import { useState } from 'react'
import { dbInsert } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Nav from '@/components/Nav'
import * as XLSX from 'xlsx'

const COL_MAP = {
  aluno: 'Qual é seu nome completo?',
  mentor: 'Qual é o seu mentor atual?',
  q1: '1) Qualidade dos atendimentos individuais',
  q2: '2) Ajuda na organização e planejamento',
  q3: '3) Diferencial do produto Mentoria',
  q4: '4) Clareza e objetividade das orientações',
  q5: '5) Acompanhamento e cobrança (na medida certa)',
  q6: '7) Comunicação e relação mentor',
  ajuda: 'O que seu mentor faz que mais te ajuda?',
  melhorar: 'O que poderia melhorar na mentoria?',
  mudaria: 'Se você pudesse mudar uma coisa',
}

export default function UploadCSAT() {
  const router = useRouter()
  const [nomePesquisa, setNomePesquisa] = useState('')
  const [dataPesquisa, setDataPesquisa] = useState(new Date().toISOString().split('T')[0])
  const [preview, setPreview] = useState<any[]>([])
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const [done, setDone] = useState(false)

  function addLog(msg: string) { setLog(prev => [...prev, msg]) }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    const reader = new FileReader()
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { defval: null }) as any[]

      // Encontra as colunas corretas
      const parsed = rows.map(r => {
        const get = (key: string) => {
          const col = Object.keys(r).find(k => k.includes(key))
          return col ? r[col] : null
        }
        return {
          aluno: get('nome completo') || get('Qual é seu nome'),
          mentor: get('mentor atual') || get('seu mentor'),
          q1: Number(get('Qualidade dos atendimentos') || 0),
          q2: Number(get('organização e planejamento') || get('Ajuda na organização') || 0),
          q3: Number(get('Diferencial do produto') || 0),
          q4: Number(get('Clareza e objetividade') || get('clareza') || 0),
          q5: Number(get('Acompanhamento e cobrança') || get('cobrança') || 0),
          q6: Number(get('Comunicação e relação') || get('Comunicação') || 0),
          ajuda: get('mais te ajuda') || get('ajuda'),
          melhorar: get('poderia melhorar') || get('melhorar'),
          mudaria: get('pudesse mudar') || get('mudaria'),
        }
      }).filter(r => r.aluno && r.mentor)

      setPreview(parsed)
    }
    reader.readAsArrayBuffer(f)
  }

  async function salvar() {
    if (!nomePesquisa || !file || !preview.length) {
      addLog('❌ Preencha o nome e selecione a planilha.'); return
    }
    setSaving(true); setLog([])

    // Cria pesquisa
    addLog('📋 Criando pesquisa...')
    const { data: pesquisaArr, error: pErr } = await dbInsert<any>('pesquisas_csat', [{ nome: nomePesquisa, data: dataPesquisa }], true)
    if (pErr) { addLog(`❌ ${pErr.message}`); setSaving(false); return }
    const pesquisa = (pesquisaArr as any)?.[0]

    addLog(`✅ Pesquisa "${nomePesquisa}" criada!`)
    addLog(`📊 Importando ${preview.length} respostas...`)

    const records = preview.map(r => ({
      pesquisa_id: pesquisa.id,
      pesquisa_nome: nomePesquisa,
      aluno: r.aluno,
      mentor: r.mentor,
      qualidade_atendimento: r.q1,
      organizacao_planejamento: r.q2,
      diferencial_mentoria: r.q3,
      clareza_orientacoes: r.q4,
      acompanhamento_cobranca: r.q5,
      comunicacao_relacao: r.q6,
      o_que_ajuda: r.ajuda,
      o_que_melhorar: r.melhorar,
      o_que_mudaria: r.mudaria,
    }))

    const { error: rErr } = await dbInsert('respostas_csat', records)
    if (rErr) { addLog(`❌ ${rErr.message}`); setSaving(false); return }

    addLog(`✅ ${records.length} respostas importadas!`)
    addLog('🎉 Pesquisa importada com sucesso!')
    setDone(true)
    setSaving(false)
  }

  const mentores = [...new Set(preview.map(r => r.mentor))].sort()

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ background: 'white', borderBottom: '0.5px solid rgba(0,0,0,0.08)', padding: '16px', position: 'sticky', top: 0, zIndex: 10, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#999' }}>←</button>
        <div style={{ fontSize: 17, fontWeight: 600 }}>Importar pesquisa CSAT</div>
      </div>

      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Dados da pesquisa</div>
          <div style={{ marginBottom: 12 }}>
            <label>Nome da pesquisa</label>
            <input value={nomePesquisa} onChange={e => setNomePesquisa(e.target.value)} placeholder="Ex: Pesquisa 1 — Março 2026" />
          </div>
          <div>
            <label>Data de aplicação</label>
            <input type="date" value={dataPesquisa} onChange={e => setDataPesquisa(e.target.value)} />
          </div>
        </div>

        <div className="card">
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Planilha de respostas</div>
          <div style={{ fontSize: 12, color: '#999', marginBottom: 12 }}>
            Exporte do Google Forms como .xlsx e faça o upload aqui.
          </div>
          <input type="file" accept=".xlsx,.xls" onChange={handleFile}
            style={{ width: '100%', padding: '10px', borderRadius: 10, border: '0.5px solid rgba(0,0,0,0.12)', background: '#F7F6F3', fontSize: 13 }} />

          {preview.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, color: '#16A34A', marginBottom: 8 }}>
                ✅ {preview.length} respostas · {mentores.length} mentores detectados
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {mentores.map(m => (
                  <span key={m} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 10, background: '#EFF6FF', color: '#1E40AF' }}>{m}</span>
                ))}
              </div>
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
          <button className="btn-primary" onClick={salvar} disabled={saving || !preview.length || !nomePesquisa}>
            {saving ? 'Importando...' : 'Importar pesquisa'}
          </button>
        )}
        <button className="btn-secondary" onClick={() => router.back()}>Cancelar</button>
      </div>
      <Nav />
    </div>
  )
}
