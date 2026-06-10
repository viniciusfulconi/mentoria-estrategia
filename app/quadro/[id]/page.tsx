'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { dbQuery, dbUpdate } from '@/lib/supabase'
import dynamic from 'next/dynamic'
import { ArrowLeft, Check, Loader2, FileDown, ChevronDown } from 'lucide-react'
import { CORES_MATERIA } from '@/lib/cores'

const Excalidraw = dynamic(
  async () => { const mod = await import('@excalidraw/excalidraw'); return mod.Excalidraw },
  { ssr: false, loading: () => <LoadingBoard /> }
)

function LoadingBoard() {
  return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fa', color: '#94a3b8', fontSize: 13 }}>Carregando quadro...</div>
}

const MATERIAS = ['Geral', ...Object.keys(CORES_MATERIA)]
function corMateria(m: string) { return CORES_MATERIA[m] || '#64748b' }

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export default function QuadroEditorPage() {
  const params = useParams()
  const router = useRouter()
  const { perfil, loading: authLoading } = useAuth()
  const id = params?.id as string

  const [titulo, setTitulo] = useState('Sem título')
  const [materia, setMateria] = useState('Geral')
  const [editandoTitulo, setEditandoTitulo] = useState(false)
  const [seletorMateria, setSeletorMateria] = useState(false)
  const [initialData, setInitialData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [mounted, setMounted] = useState(false)
  const [exportando, setExportando] = useState(false)

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingData = useRef<any>(null)
  const tituloRef = useRef<HTMLInputElement>(null)
  const excalidrawAPI = useRef<any>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (authLoading || !id) return
    load()
  }, [authLoading, id])

  useEffect(() => {
    if (editandoTitulo) tituloRef.current?.focus()
  }, [editandoTitulo])

  async function load() {
    const { data, error } = await dbQuery<any>('quadros_aluno', { id: `eq.${id}` }, 'id,titulo,materia,conteudo,aluno_id')
    if (error || !data?.[0]) { router.replace('/quadro'); return }
    const q = data[0]
    if (perfil?.papel === 'aluno' && q.aluno_id !== perfil.aluno_id) { router.replace('/quadro'); return }
    setTitulo(q.titulo || 'Sem título')
    setMateria(q.materia || 'Geral')
    const c = q.conteudo || {}
    setInitialData({ elements: c.elements || [], files: c.files || {}, appState: { viewBackgroundColor: '#ffffff', currentItemFontFamily: 1 } })
    setLoading(false)
  }

  const salvar = useCallback(async (elements: any[], files: any) => {
    setSaveStatus('saving')
    const { error } = await dbUpdate('quadros_aluno', { id: `eq.${id}` }, { conteudo: { elements, files: files || {} }, updated_at: new Date().toISOString() })
    setSaveStatus(error ? 'error' : 'saved')
    setTimeout(() => setSaveStatus('idle'), 2000)
  }, [id])

  function handleChange(elements: readonly any[], _appState: any, files: any) {
    pendingData.current = { elements: [...elements], files }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { if (pendingData.current) salvar(pendingData.current.elements, pendingData.current.files) }, 1500)
  }

  async function salvarTitulo(novoTitulo: string) {
    const t = novoTitulo.trim() || 'Sem título'
    setTitulo(t)
    setEditandoTitulo(false)
    await dbUpdate('quadros_aluno', { id: `eq.${id}` }, { titulo: t, updated_at: new Date().toISOString() })
  }

  async function mudarMateria(m: string) {
    setMateria(m)
    setSeletorMateria(false)
    await dbUpdate('quadros_aluno', { id: `eq.${id}` }, { materia: m, updated_at: new Date().toISOString() })
  }

  async function exportarPDF() {
    if (!excalidrawAPI.current) return
    setExportando(true)
    try {
      const { exportToBlob } = await import('@excalidraw/excalidraw')
      const blob = await exportToBlob({
        elements: excalidrawAPI.current.getSceneElements(),
        appState: { ...excalidrawAPI.current.getAppState(), exportWithDarkMode: false, exportBackground: true },
        files: excalidrawAPI.current.getFiles(),
        mimeType: 'image/png',
        quality: 0.95,
      })
      const url = URL.createObjectURL(blob)
      const cor = corMateria(materia)
      const win = window.open('', '_blank')
      if (!win) { setExportando(false); return }
      win.document.write(`<!DOCTYPE html><html><head>
        <title>${titulo}</title>
        <meta charset="utf-8"/>
        <style>
          *{margin:0;padding:0;box-sizing:border-box}
          body{background:white;font-family:system-ui,sans-serif}
          .bar{padding:14px 20px;border-bottom:2px solid ${cor}30;display:flex;align-items:center;gap:12;print-color-adjust:exact}
          .pill{background:${cor}18;color:${cor};font-size:11px;font-weight:700;padding:3px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:.05em}
          .titulo{font-size:15px;font-weight:700;color:#0f172a}
          .btn{margin-left:auto;padding:8px 18px;background:${cor};color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px}
          img{width:100%;height:auto;display:block}
          @media print{.btn{display:none}}
        </style>
      </head><body>
        <div class="bar">
          <span class="pill">${materia}</span>
          <span class="titulo">${titulo}</span>
          <button class="btn" onclick="window.print()">Imprimir / Salvar PDF</button>
        </div>
        <img src="${url}" onload="URL.revokeObjectURL('${url}')"/>
      </body></html>`)
      win.document.close()
    } finally {
      setExportando(false)
    }
  }

  if (!mounted || loading || authLoading) return <LoadingBoard />

  const cor = corMateria(materia)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' }}>
      {/* Barra superior */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px', height: 50, flexShrink: 0, background: 'white', borderBottom: '1px solid var(--border)', zIndex: 10 }}>

        <button
          onClick={() => router.push('/quadro')}
          style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 13, fontFamily: 'inherit', padding: '5px 8px', borderRadius: 8, flexShrink: 0 }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          <ArrowLeft size={15} strokeWidth={2} />
        </button>

        <div style={{ width: 1, height: 18, background: 'var(--border)', flexShrink: 0 }} />

        {/* Seletor de matéria */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button
            onClick={() => setSeletorMateria(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: 20, border: 'none', cursor: 'pointer',
              background: cor + '18', color: cor,
              fontSize: 11, fontWeight: 700, fontFamily: 'inherit',
              letterSpacing: '0.04em',
            }}
          >
            {materia} <ChevronDown size={11} strokeWidth={2.5} />
          </button>

          {seletorMateria && (
            <>
              <div onClick={() => setSeletorMateria(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }} />
              <div style={{
                position: 'absolute', top: '110%', left: 0, zIndex: 40,
                background: 'white', borderRadius: 12, padding: 8,
                boxShadow: 'var(--shadow-md)', border: '0.5px solid var(--border)',
                display: 'flex', flexDirection: 'column', gap: 2, minWidth: 150,
              }}>
                {MATERIAS.map(m => {
                  const c = corMateria(m)
                  const sel = materia === m
                  return (
                    <button key={m} onClick={() => mudarMateria(m)} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                      background: sel ? c + '18' : 'transparent', color: sel ? c : 'var(--text)',
                      fontSize: 13, fontWeight: sel ? 700 : 400, textAlign: 'left',
                    }}
                    onMouseEnter={e => { if (!sel) e.currentTarget.style.background = 'var(--bg)' }}
                    onMouseLeave={e => { if (!sel) e.currentTarget.style.background = 'transparent' }}
                    >
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: c, flexShrink: 0 }} />
                      {m}
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Título editável */}
        {editandoTitulo ? (
          <input
            ref={tituloRef}
            defaultValue={titulo}
            onBlur={e => salvarTitulo(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') salvarTitulo((e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditandoTitulo(false) }}
            style={{ flex: 1, fontSize: 14, fontWeight: 600, fontFamily: 'inherit', border: 'none', outline: `2px solid ${cor}`, borderRadius: 6, padding: '4px 8px', background: cor + '10', color: 'var(--text)' }}
          />
        ) : (
          <button
            onClick={() => setEditandoTitulo(true)}
            style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'text', fontFamily: 'inherit', fontSize: 14, fontWeight: 600, color: 'var(--text)', padding: '4px 6px', borderRadius: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            {titulo}
          </button>
        )}

        {/* Status de save */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, flexShrink: 0, opacity: saveStatus === 'idle' ? 0 : 1, transition: 'opacity 0.2s' }}>
          {saveStatus === 'saving' && <Loader2 size={11} strokeWidth={2} style={{ animation: 'spin 1s linear infinite' }} />}
          {saveStatus === 'saved' && <Check size={11} strokeWidth={2.5} color="var(--teal)" />}
          <span style={{ color: saveStatus === 'error' ? 'var(--red)' : saveStatus === 'saved' ? 'var(--teal)' : 'var(--text-hint)' }}>
            {saveStatus === 'saving' ? 'Salvando...' : saveStatus === 'saved' ? 'Salvo' : 'Erro'}
          </span>
        </div>

        {/* Botão PDF */}
        <button
          onClick={exportarPDF}
          disabled={exportando}
          title="Exportar PDF"
          style={{
            display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
            padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border-strong)',
            background: 'white', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600,
            cursor: exportando ? 'default' : 'pointer', fontFamily: 'inherit',
            opacity: exportando ? 0.6 : 1,
          }}
          onMouseEnter={e => { if (!exportando) e.currentTarget.style.background = 'var(--bg)' }}
          onMouseLeave={e => e.currentTarget.style.background = 'white'}
        >
          {exportando
            ? <Loader2 size={13} strokeWidth={2} style={{ animation: 'spin 1s linear infinite' }} />
            : <FileDown size={13} strokeWidth={2} />}
          PDF
        </button>
      </div>

      {/* Excalidraw */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Excalidraw
          initialData={initialData}
          onChange={handleChange}
          excalidrawAPI={(api: any) => { excalidrawAPI.current = api }}
          langCode="pt-BR"
          UIOptions={{ canvasActions: { export: false, loadScene: false, saveAsImage: true } }}
        />
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
