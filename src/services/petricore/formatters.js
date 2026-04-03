/**
 * formatters.js — output format writers for Petricore dataset export.
 *
 * Supported formats:
 *   sharegpt  — JSON array of {conversations:[{from,value}]}
 *   jsonl     — One JSON object per line (ShareGPT schema)
 *   chatml    — Text file with <|im_start|>role\ncontent<|im_end|>
 *   alpaca    — {instruction, input, output} JSON array
 *   unsloth   — ShareGPT JSONL with Unsloth field naming
 */

const ROLE_MAP = { system: 'system', player: 'user', dm: 'assistant' }

export function formatExample(example, format) {
  const convs = example.conversations || []

  switch (format) {
    case 'sharegpt':
      return { conversations: convs }

    case 'jsonl':
      return { conversations: convs }

    case 'unsloth':
      return {
        conversations: convs.map(c => ({
          role: ROLE_MAP[c.from] || c.from,
          content: c.value,
        }))
      }

    case 'chatml': {
      return convs.map(c =>
        `<|im_start|>${ROLE_MAP[c.from] || c.from}\n${c.value}<|im_end|>`
      ).join('\n')
    }

    case 'alpaca': {
      const sys   = convs.find(c => c.from === 'system')?.value || ''
      const turns = convs.filter(c => c.from !== 'system')
      const lastPlayer = [...turns].reverse().find(c => c.from === 'player')?.value || ''
      const lastDm     = [...turns].reverse().find(c => c.from === 'dm')?.value || ''
      return { instruction: sys, input: lastPlayer, output: lastDm }
    }

    default:
      return { conversations: convs }
  }
}

export function serializeDataset(examples, format) {
  switch (format) {
    case 'sharegpt':
      return JSON.stringify(examples.map(e => formatExample(e, 'sharegpt')), null, 2)

    case 'jsonl':
      return examples.map(e => JSON.stringify(formatExample(e, 'jsonl'))).join('\n')

    case 'unsloth':
      return examples.map(e => JSON.stringify(formatExample(e, 'unsloth'))).join('\n')

    case 'chatml':
      return examples.map(e => formatExample(e, 'chatml')).join('\n\n')

    case 'alpaca':
      return JSON.stringify(examples.map(e => formatExample(e, 'alpaca')), null, 2)

    default:
      return JSON.stringify(examples.map(e => formatExample(e, 'sharegpt')), null, 2)
  }
}

export function defaultFilename(format, timestamp = Date.now()) {
  const ts = new Date(timestamp).toISOString().slice(0, 10)
  switch (format) {
    case 'chatml':   return `vellicore_dataset_${ts}.txt`
    case 'jsonl':    return `vellicore_dataset_${ts}.jsonl`
    case 'unsloth':  return `vellicore_dataset_unsloth_${ts}.jsonl`
    case 'alpaca':   return `vellicore_dataset_alpaca_${ts}.json`
    default:         return `vellicore_dataset_${ts}.json`
  }
}

export const FORMAT_LABELS = {
  sharegpt: 'ShareGPT JSON',
  jsonl:    'ShareGPT JSONL',
  chatml:   'ChatML Text',
  alpaca:   'Alpaca JSON',
  unsloth:  'Unsloth JSONL',
}
