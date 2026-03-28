/**
 * RichText — enhanced narrative renderer for DM messages.
 *
 * Features:
 *  - Dialogue quotes colored per speaker (NPC-matched, hover shows NPC card)
 *  - Entity links: NPC names, location names, quest titles → hover tooltip
 *  - Markdown: **bold**, *italic*, _italic_
 *  - OOC tags: <ooc>...</ooc> → styled aside
 *  - Plain streaming fallback (no expensive parsing on incomplete text)
 */

import React, { useMemo, useState } from 'react'
import { useGameStore } from '@/store/appStore'

// ── Speaker color palette ─────────────────────────────────────────────────────
// Each NPC gets a consistent color derived from their ID hash.

const SPEAKER_PALETTE = [
  '#f5d48a',  // amber
  '#7dcfc0',  // teal
  '#f4a0a8',  // rose
  '#c4b5fd',  // violet
  '#86efac',  // emerald
  '#93c5fd',  // sky
  '#fda4af',  // pink
  '#a5b4fc',  // indigo
]

function getSpeakerColor(npcId) {
  if (!npcId) return null
  const h = [...npcId].reduce((a, c) => a + c.charCodeAt(0), 0)
  return SPEAKER_PALETTE[h % SPEAKER_PALETTE.length]
}

// ── Speaker identification ────────────────────────────────────────────────────

/** Exact match for [VOICE:Name] tag values → NPC object. */
function findNpcByVoiceTag(name, npcs) {
  if (!name || !npcs) return null
  const lower = name.toLowerCase().trim()
  for (const npc of Object.values(npcs)) {
    if (npc.name.toLowerCase() === lower) return npc
    const first = npc.name.toLowerCase().split(' ')[0]
    if (first.length > 2 && first === lower) return npc
  }
  return null
}

/** Fuzzy match — scans a narration string for any NPC name mention. */
function findSpeakerNpc(context, npcs) {
  if (!context || !npcs) return null
  const lower = context.toLowerCase()
  // Longest-name-first prevents "Mara" matching "Mara Blackwood" partially wrong
  const sorted = Object.values(npcs)
    .filter(n => n.name?.length >= 2)
    .sort((a, b) => b.name.length - a.name.length)
  for (const npc of sorted) {
    const full = npc.name.toLowerCase()
    if (lower.includes(full)) return npc
    const first = full.split(' ')[0]
    if (first.length > 2 && lower.includes(first)) return npc
  }
  return null
}

// ── Entity tooltip ────────────────────────────────────────────────────────────

function EntityLink({ type, data, children }) {
  const [show, setShow] = useState(false)

  let tooltip = null
  if (type === 'npc') {
    tooltip = (
      <span className="block">
        <span className="block font-ui text-xs font-semibold text-parchment-100">{data.name}</span>
        {data.role && <span className="block text-parchment-400 text-xs">{data.role}</span>}
        {data.disposition && (
          <span className={`block text-xs mt-0.5 ${
            data.disposition === 'friendly' || data.disposition === 'devoted' ? 'text-forest-400' :
            data.disposition === 'hostile' ? 'text-crimson-400' :
            data.disposition === 'suspicious' ? 'text-gold-400' :
            'text-parchment-500'
          }`}>{data.disposition}</span>
        )}
        {data.motivation && (
          <span className="block text-parchment-500 text-xs italic mt-1 leading-snug">{data.motivation}</span>
        )}
      </span>
    )
  } else if (type === 'location') {
    tooltip = (
      <span className="block">
        <span className="block font-ui text-xs font-semibold text-parchment-100">{data.name}</span>
        {data.type && <span className="block text-parchment-400 text-xs capitalize">{data.type}</span>}
        {data.description && (
          <span className="block text-parchment-500 text-xs italic mt-1 leading-snug">{data.description}</span>
        )}
      </span>
    )
  } else if (type === 'quest') {
    tooltip = (
      <span className="block">
        <span className="block font-ui text-xs font-semibold text-parchment-100">{data.title}</span>
        {data.type && <span className="block text-parchment-400 text-xs capitalize">{data.type} quest</span>}
        {data.currentObjective && (
          <span className="block text-parchment-500 text-xs italic mt-1 leading-snug">→ {data.currentObjective}</span>
        )}
      </span>
    )
  }

  const linkClass =
    type === 'npc'      ? 'text-gold-300 decoration-gold-500/50' :
    type === 'location' ? 'text-arcane-300 decoration-arcane-500/50' :
                          'text-forest-300 decoration-forest-500/50'

  return (
    <span
      className="relative inline"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span className={`cursor-help underline decoration-dotted underline-offset-2 ${linkClass}`}>
        {children}
      </span>
      {show && tooltip && (
        <span className="absolute bottom-full left-0 z-50 mb-1.5 block min-w-[160px] max-w-[220px] pointer-events-none">
          <span className="block bg-ink-800 border border-ink-600 rounded-lg shadow-panel p-2.5">
            {tooltip}
          </span>
        </span>
      )}
    </span>
  )
}

// ── Dialogue span ─────────────────────────────────────────────────────────────

function DialogueSpan({ text, npc }) {
  const [show, setShow] = useState(false)
  const color = getSpeakerColor(npc?.id)
  return (
    <span
      className="relative inline"
      onMouseEnter={() => npc && setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span style={color ? { color } : undefined}>
        {'\u201C'}{text}{'\u201D'}
      </span>
      {show && npc && (
        <span className="absolute bottom-full left-0 z-50 mb-1.5 block min-w-[120px] pointer-events-none">
          <span className="block bg-ink-800 border border-ink-600 rounded-lg shadow-panel px-2.5 py-1.5">
            <span className="block font-ui text-xs font-semibold" style={{ color }}>{npc.name}</span>
            {npc.role && <span className="block text-parchment-400 text-xs">{npc.role}</span>}
          </span>
        </span>
      )}
    </span>
  )
}

// ── Narration tokenizer ───────────────────────────────────────────────────────
// Scans a narration string for OOC tags, bold, italic, and entity names.
// Returns a flat array of typed tokens in document order.

function tokenizeNarration(text, entities) {
  if (!text) return []

  const hits = []

  // OOC: <ooc>...</ooc>  (already injected by parseDmResponse)
  for (const m of [...text.matchAll(/<ooc>([^<]*)<\/ooc>/gi)]) {
    hits.push({ s: m.index, e: m.index + m[0].length, type: 'ooc', text: m[1] })
  }
  // Bold: **...**
  for (const m of [...text.matchAll(/\*\*([^*\n]{1,200})\*\*/g)]) {
    hits.push({ s: m.index, e: m.index + m[0].length, type: 'bold', text: m[1] })
  }
  // Italic: *...* (not double-asterisk, not crossing newlines)
  for (const m of [...text.matchAll(/(?<!\*)\*([^*\n]{1,200})\*(?!\*)/g)]) {
    hits.push({ s: m.index, e: m.index + m[0].length, type: 'italic', text: m[1] })
  }
  // Italic: _..._
  for (const m of [...text.matchAll(/(?<!_)_([^_\n]{1,200})_(?!_)/g)]) {
    hits.push({ s: m.index, e: m.index + m[0].length, type: 'italic', text: m[1] })
  }

  // Entity names (longest first to avoid partial shadowing)
  for (const entity of entities) {
    try {
      const esc = entity.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      // Non-word boundary on both sides handles names near punctuation
      const re = new RegExp(`(?<![\\w-])${esc}(?![\\w-])`, 'gi')
      for (const m of [...text.matchAll(re)]) {
        hits.push({ s: m.index, e: m.index + m[0].length, type: entity.type, text: m[0], data: entity.data })
      }
    } catch { /* skip names with problematic chars */ }
  }

  // Sort by start pos; on tie, longer match wins
  hits.sort((a, b) => a.s - b.s || (b.e - b.s) - (a.e - a.s))

  // Build token list, filling gaps with plain text
  const tokens = []
  let cur = 0
  for (const h of hits) {
    if (h.s < cur) continue   // overlapped by earlier (longer) match
    if (h.s > cur) tokens.push({ type: 'text', text: text.slice(cur, h.s) })
    tokens.push(h)
    cur = h.e
  }
  if (cur < text.length) tokens.push({ type: 'text', text: text.slice(cur) })
  return tokens
}

function NarrationTokens({ tokens }) {
  return tokens.map((tok, i) => {
    switch (tok.type) {
      case 'ooc':
        return (
          <span key={i} className="text-parchment-400 italic text-sm font-ui">
            [{tok.text}]
          </span>
        )
      case 'bold':
        return <strong key={i} className="font-semibold text-parchment-50">{tok.text}</strong>
      case 'italic':
        return <em key={i} className="italic">{tok.text}</em>
      case 'npc':
      case 'location':
      case 'quest':
        return (
          <EntityLink key={i} type={tok.type} data={tok.data}>
            {tok.text}
          </EntityLink>
        )
      default:
        return <React.Fragment key={i}>{tok.text}</React.Fragment>
    }
  })
}

// ── Paragraph renderer ────────────────────────────────────────────────────────

function RichParagraph({ text, npcs, entities }) {
  const normalized = text
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")

  // Scan for [VOICE:Name]"dialogue" patterns and bare "dialogue" quotes.
  // [VOICE:Name] provides explicit attribution; bare quotes fall back to
  // adjacent narration heuristics.
  const tokenRe = /(?:\[VOICE:([^\]]*)\]\s*)?("(?:[^"\\]|\\.)*")/g
  const parts = []
  let lastIndex = 0
  let match

  while ((match = tokenRe.exec(normalized)) !== null) {
    // Narration before this token — strip any orphaned [VOICE:] tags from display
    const narrationText = normalized.slice(lastIndex, match.index)
      .replace(/\[VOICE:[^\]]*\]/g, '')
    if (narrationText) parts.push({ type: 'narration', text: narrationText })

    const voiceName = match[1]?.trim() || null
    const dialogueText = match[2].slice(1, -1)

    // [VOICE:Name] is authoritative; narration fallback for untagged quotes
    let npc = voiceName ? findNpcByVoiceTag(voiceName, npcs) : null
    if (!npc) npc = findSpeakerNpc(narrationText, npcs)

    parts.push({ type: 'dialogue', text: dialogueText, npc })
    lastIndex = match.index + match[0].length
  }

  // Remaining narration
  const remaining = normalized.slice(lastIndex).replace(/\[VOICE:[^\]]*\]/g, '')
  if (remaining) parts.push({ type: 'narration', text: remaining })

  // For still-unidentified dialogue: check adjacent narration segments (up to 2 away)
  for (let i = 0; i < parts.length; i++) {
    if (parts[i].type !== 'dialogue' || parts[i].npc) continue
    for (let j = i - 1; j >= Math.max(0, i - 2); j--) {
      if (parts[j]?.type === 'narration') {
        const npc = findSpeakerNpc(parts[j].text, npcs)
        if (npc) { parts[i].npc = npc; break }
      }
    }
    if (!parts[i].npc) {
      for (let j = i + 1; j <= Math.min(parts.length - 1, i + 2); j++) {
        if (parts[j]?.type === 'narration') {
          const npc = findSpeakerNpc(parts[j].text, npcs)
          if (npc) { parts[i].npc = npc; break }
        }
      }
    }
  }

  // Single-NPC paragraph fallback
  const unidentified = parts.filter(p => p.type === 'dialogue' && !p.npc)
  if (unidentified.length > 0) {
    const allNarration = parts.filter(p => p.type === 'narration').map(p => p.text).join(' ')
    const mentioned = Object.values(npcs).filter(npc => {
      const lower = allNarration.toLowerCase()
      const full = npc.name.toLowerCase()
      if (lower.includes(full)) return true
      const first = full.split(' ')[0]
      return first.length > 2 && lower.includes(first)
    })
    if (mentioned.length === 1) {
      for (const p of unidentified) p.npc = mentioned[0]
    }
  }

  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'dialogue') {
          return <DialogueSpan key={i} text={part.text} npc={part.npc} />
        }
        const tokens = tokenizeNarration(part.text, entities)
        return <NarrationTokens key={i} tokens={tokens} />
      })}
    </>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export function RichNarrativeText({ text, streaming }) {
  const world = useGameStore(s => s.world)
  const story = useGameStore(s => s.story)
  const npcs = world?.npcs || {}

  // Entity list memoized — only changes when world/quests change (rare mid-session)
  const entities = useMemo(() => [
    ...Object.values(world?.npcs || {})
      .filter(n => n.name?.length >= 3)
      .map(n => ({ name: n.name, type: 'npc', data: n })),
    ...Object.values(world?.locations || {})
      .filter(l => l.name?.length >= 3 && l.name !== 'Starting Location')
      .map(l => ({ name: l.name, type: 'location', data: l })),
    ...(story?.activeQuests || [])
      .filter(q => q.title?.length >= 3)
      .map(q => ({ name: q.title, type: 'quest', data: q })),
  ].sort((a, b) => b.name.length - a.name.length),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [world?.npcs, world?.locations, story?.activeQuests])

  if (!text) return null

  const paragraphs = text.split('\n\n').filter(Boolean)

  // During streaming: plain text only (avoids expensive parsing on partial text)
  if (streaming) {
    return (
      <div className="space-y-3">
        {paragraphs.map((para, i) => (
          <p key={i} className="narrative text-parchment-100 leading-relaxed">
            {para.replace(/\[VOICE:[^\]]*\]\s*/g, '')}
            {i === paragraphs.length - 1 && (
              <span className="inline-block w-1.5 h-4 bg-gold-400 animate-pulse ml-0.5 align-middle" />
            )}
          </p>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {paragraphs.map((para, i) => (
        <p key={i} className="narrative text-parchment-100 leading-relaxed">
          <RichParagraph text={para} npcs={npcs} entities={entities} />
        </p>
      ))}
    </div>
  )
}
