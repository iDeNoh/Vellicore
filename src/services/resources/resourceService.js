/**
 * Resource Service
 *
 * Handles chunking and ChromaDB indexing of user-uploaded reference documents.
 * Resources are stored in SQLite (metadata + content) and ChromaDB (embedded chunks).
 */

import { storeResourceChunks, deleteResourceChunks } from '@/services/rag/ragService'

/**
 * Split text into overlapping chunks of ~800 chars each.
 * Splits on paragraph boundaries where possible.
 */
export function chunkText(text, maxChars = 800) {
  const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(p => p.length >= 20)
  const chunks = []
  let current = ''

  for (const para of paragraphs) {
    if (current.length + para.length + 2 > maxChars && current) {
      chunks.push(current.trim())
      // Keep last paragraph as overlap for context continuity
      current = para
    } else {
      current = current ? current + '\n\n' + para : para
    }
  }
  if (current.trim().length >= 20) chunks.push(current.trim())
  return chunks
}

/**
 * Index a resource: chunk the content and embed into ChromaDB.
 * Returns the number of chunks stored.
 */
export async function indexResource({ campaignId, resourceId, resourceName, content }) {
  const chunks = chunkText(content)
  if (chunks.length === 0) return 0
  await storeResourceChunks(campaignId, resourceId, resourceName, chunks)
  return chunks.length
}

/**
 * Remove all chunks for a resource from ChromaDB.
 */
export async function removeResourceChunks({ campaignId, resourceId, chunkCount }) {
  await deleteResourceChunks(campaignId, resourceId, chunkCount)
}
