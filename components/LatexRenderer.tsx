'use client'
import { useEffect, useRef } from 'react'
import katex from 'katex'
import 'katex/contrib/mhchem' // habilita \ce{...} para fórmulas e reações químicas

interface Props {
  text: string
  className?: string
}

// Tokens reconhecidos: imagem ![](...), molécula {smiles:...} ou [smiles:...],
// LaTeX $$...$$ e $...$. A forma {smiles:...} aceita colchetes no SMILES
// (ex.: cargas [CH2+], [O-]); a forma [smiles:...] é mantida por compatibilidade.
const SPLIT_RE = /(!\[[^\]]*\]\([^)]+\)|\{smiles:[^}]*\}|\[smiles:[^\]]*\]|\$\$[\s\S]*?\$\$|\$(?!\$)[^$\n]*?\$)/g

export default function LatexRenderer({ text, className }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current || !text) return

    const parts = text.split(SPLIT_RE)
    const html: string[] = []
    let hasSmiles = false

    for (const part of parts) {
      if (!part) continue

      const imgMatch = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
      if (imgMatch) {
        const alt = escapeHtml(imgMatch[1])
        const src = escapeHtml(imgMatch[2])
        html.push(
          `<div style="text-align:center;margin:12px 0;">` +
          `<img src="${src}" alt="${alt}" style="max-width:100%;max-height:400px;border-radius:8px;" />` +
          `</div>`
        )
        continue
      }

      const smiMatch = part.match(/^\{smiles:([^}]*)\}$/) || part.match(/^\[smiles:([^\]]*)\]$/)
      if (smiMatch) {
        hasSmiles = true
        html.push(
          `<svg class="smiles-mol" data-smiles="${escapeAttr(smiMatch[1])}" ` +
          `style="display:inline-block;vertical-align:middle;height:auto;max-height:150px;max-width:100%;margin:2px 6px;"></svg>`
        )
        continue
      }

      if (part.startsWith('$$') && part.endsWith('$$') && part.length > 4) {
        try {
          html.push(katex.renderToString(part.slice(2, -2), { throwOnError: false, displayMode: true }))
        } catch {
          html.push(escapeHtml(part))
        }
        continue
      }

      if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
        try {
          html.push(katex.renderToString(part.slice(1, -1), { throwOnError: false, displayMode: false }))
        } catch {
          html.push(escapeHtml(part))
        }
        continue
      }

      html.push(escapeHtml(part).replace(/\n/g, '<br/>'))
    }

    ref.current.innerHTML = html.join('')

    // Desenha as moléculas a partir do SMILES (carregamento sob demanda)
    if (hasSmiles) {
      const host = ref.current
      import('smiles-drawer')
        .then((mod) => {
          const SD: any = (mod as any).default ?? mod
          const drawer = new SD.SvgDrawer({ padding: 8.0, compactDrawing: false, terminalCarbons: true })
          host.querySelectorAll('svg.smiles-mol').forEach((el) => {
            const smi = el.getAttribute('data-smiles') || ''
            SD.parse(
              smi,
              (tree: any) => { try { drawer.draw(tree, el, 'light') } catch { /* ignore */ } },
              () => { el.replaceWith(document.createTextNode('[' + smi + ']')) },
            )
          })
        })
        .catch(() => { /* lib indisponível: mantém o placeholder */ })
    }
  }, [text])

  return (
    <div ref={ref} className={className ?? ''} style={{ lineHeight: 1.8 }}>
      {text}
    </div>
  )
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(s: string) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
