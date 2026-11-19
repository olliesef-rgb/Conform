import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

// Anthropic doesn't yet have a public embeddings endpoint —
// we use OpenAI's embedding model for vectors, Claude for generation.
// This is the standard pattern for Claude + RAG.
// If you want Anthropic-only, swap this for voyage-ai (Anthropic's embedding partner).

// Option A: OpenAI embeddings (most common, 1536 dims)
// Option B: Voyage AI (Anthropic's recommended partner for RAG)
// This file is set up for Voyage AI — swap the fetch URL for OpenAI if preferred.

export async function generateEmbedding(text: string): Promise<number[]> {
  // Truncate to ~8000 chars to stay within embedding model limits
  const truncated = text.slice(0, 8000)

  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'voyage-large-2',   // 1536 dims, matches our schema
      input: truncated,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Embedding API error: ${err}`)
  }

  const data = await response.json()
  return data.data[0].embedding
}

export async function generateEmbeddingsBatch(
  texts: string[]
): Promise<number[][]> {
  // Voyage supports batch up to 128 inputs
  const batchSize = 64
  const results: number[][] = []

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize).map(t => t.slice(0, 8000))

    const response = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'voyage-large-2',
        input: batch,
      }),
    })

    if (!response.ok) {
      throw new Error(`Embedding batch error at index ${i}`)
    }

    const data = await response.json()
    results.push(...data.data.map((d: { embedding: number[] }) => d.embedding))

    // Rate limit: ~100ms between batches
    if (i + batchSize < texts.length) {
      await new Promise(r => setTimeout(r, 150))
    }
  }

  return results
}
