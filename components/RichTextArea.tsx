'use client'
import { useState } from 'react'
import LatexRenderer from './LatexRenderer'
import { Eye, Edit2 } from 'lucide-react'

interface Props {
  value: string
  onChange: (val: string) => void
  label?: string
  optional?: boolean
  placeholder?: string
  rows?: number
  compact?: boolean
}

export default function RichTextArea({
  value, onChange, label, optional, placeholder, rows = 5, compact = false,
}: Props) {
  const [preview, setPreview] = useState(false)

  const toolbar = (
    <button
      type="button"
      onClick={() => setPreview(v => !v)}
      style={{
        display: 'flex', alignItems: 'center', gap: 5,
        background: preview ? 'rgba(249,115,22,0.12)' : 'rgba(0,0,0,0.04)',
        color: preview ? '#f97316' : '#64748b',
        border: 'none', borderRadius: 8,
        padding: compact ? '4px 8px' : '5px 10px',
        fontSize: compact ? 11 : 12, cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {preview ? <Edit2 size={compact ? 12 : 13} /> : <Eye size={compact ? 12 : 13} />}
      {compact ? '' : (preview ? 'Editar' : 'Preview')}
    </button>
  )

  return (
    <div>
      {label ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>
            {label}
            {optional && <span style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8', marginLeft: 6 }}>(opcional)</span>}
          </div>
          {toolbar}
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
          {toolbar}
        </div>
      )}

      {preview ? (
        <div style={{
          background: '#f8fafc', border: '1.5px solid #e2e8f0', borderRadius: 10,
          minHeight: compact ? 48 : 80, padding: compact ? '8px 12px' : 16,
          fontSize: 14, lineHeight: 1.8,
        }}>
          <LatexRenderer text={value || `_${placeholder || 'Vazio'}_`} />
        </div>
      ) : (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={compact ? 2 : rows}
          style={{
            width: '100%', resize: 'vertical',
            fontFamily: 'monospace', fontSize: compact ? 12 : 13,
            padding: '10px 14px', borderRadius: 10,
            border: '1.5px solid #e2e8f0', outline: 'none',
            background: 'white', lineHeight: 1.6,
            boxSizing: 'border-box',
          }}
        />
      )}

      {!compact && (
        <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>
          LaTeX: <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>$...$</code> inline,{' '}
          <code style={{ background: '#f1f5f9', padding: '1px 5px', borderRadius: 3 }}>$$...$$</code> bloco
        </div>
      )}
    </div>
  )
}
