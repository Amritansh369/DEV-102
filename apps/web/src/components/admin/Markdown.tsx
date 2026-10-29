import { Fragment, type ReactNode } from 'react'
import { cx } from '@/lib/adminHooks'

/** Tiny safe renderer: paragraphs, lists, fenced code, `code`, **bold**, *italic*. No raw HTML is ever injected. */
function inline(text: string): ReactNode[] {
  const re = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\*[^*\s][^*\n]*\*)/g
  const out: ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0
    if (at > last) out.push(text.slice(last, at))
    const tok = m[0]
    if (m[1]) out.push(<code key={at} className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[0.9em] text-slate-800">{tok.slice(1, -1)}</code>)
    else if (m[2]) out.push(<strong key={at} className="font-semibold text-text">{tok.slice(2, -2)}</strong>)
    else out.push(<em key={at}>{tok.slice(1, -1)}</em>)
    last = at + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const LIST = /^\s*(?:[-*]|\d+\.)\s+/

export function Markdown({ source, className }: { source: string; className?: string }) {
  const lines = source.replace(/\r/g, '').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim() === '') { i++; continue }
    if (line.trim().startsWith('```')) {
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++])
      i++
      blocks.push(
        <pre key={blocks.length} className="overflow-x-auto rounded-xl bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-100"><code>{code.join('\n')}</code></pre>,
      )
      continue
    }
    if (LIST.test(line)) {
      const ordered = /^\s*\d+\./.test(line)
      const items: string[] = []
      while (i < lines.length && LIST.test(lines[i])) items.push(lines[i++].replace(LIST, ''))
      const Tag = ordered ? 'ol' : 'ul'
      blocks.push(
        <Tag key={blocks.length} className={cx('ml-5 space-y-1', ordered ? 'list-decimal' : 'list-disc')}>
          {items.map((t, n) => <li key={n}>{inline(t)}</li>)}
        </Tag>,
      )
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() !== '' && !lines[i].trim().startsWith('```') && !LIST.test(lines[i])) para.push(lines[i++])
    blocks.push(<p key={blocks.length}>{para.map((t, n) => <Fragment key={n}>{n > 0 && <br />}{inline(t)}</Fragment>)}</p>)
  }
  return <div className={cx('space-y-2 text-sm leading-relaxed text-slate-800', className)}>{blocks}</div>
}
