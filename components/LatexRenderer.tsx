'use client'
import { useEffect, useRef } from 'react'

interface Props {
  text: string
  className?: string
}

const SPLIT_RE = /(!\[[^\]]*\]\([^)]+\)|\$\$[\s\S]*?\$\$|\$(?!\$)[^$\n]*?\$)/g

export default function LatexRenderer({ text, className }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current || !text) return

    import('katex').then(({ default: katex }) => {
      if (!ref.current) return

      const parts = text.split(SPLIT_RE)
      const html: string[] = []

      for (const part of parts) {
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
    })
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
