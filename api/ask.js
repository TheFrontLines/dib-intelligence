// /api/ask.js - Vercel Node.js serverless function calling Pinecone Assistant.
// Node runtime (instead of Edge) so we get up to 60s timeout for slow Pinecone queries.

export const config = {
  maxDuration: 60,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { question } =
      typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Missing question' });
    }

    const assistantName = process.env.PINECONE_ASSISTANT;
    const apiKey = process.env.PINECONE_API_KEY;

    if (!assistantName || !apiKey) {
      return res.status(500).json({ error: 'Missing env vars' });
    }

    const r = await fetch(
      'https://prod-1-data.ke.pinecone.io/assistant/chat/' + assistantName,
      {
        method: 'POST',
        headers: {
          'Api-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: question }],
          stream: false,
          include_highlights: true,
        }),
      }
    );

    if (!r.ok) {
      const t = await r.text();
      return res
        .status(r.status)
        .json({ error: 'Pinecone failed', detail: t });
    }

    const data = await r.json();
    return res.status(200).json({
      answer: (data.message && data.message.content) || '',
      citations: data.citations || [],
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal', detail: String(err) });
  }
}
