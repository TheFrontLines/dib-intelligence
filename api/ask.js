// /api/ask.js - Vercel Node.js serverless function calling Pinecone Assistant.
// Node runtime (instead of Edge) so we get up to 60s timeout for slow Pinecone queries.
//
// Industry filter: the front end may send { question, industry }. When an industry
// is chosen we (1) scope the question to that industry's episodes, (2) drop citations
// from episodes outside it, and (3) if PINECONE_METADATA_FILTER=1, also pass a native
// Pinecone metadata filter (works once files are uploaded with an `industries` list).

import { INDUSTRIES, EPISODES_BY_INDUSTRY } from './_industries.js';

export const config = {
  maxDuration: 60,
};

function lastName(name) {
  const parts = String(name || '')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^A-Za-z\s-]/g, ' ')
    .trim()
    .split(/\s+/);
  return (parts[parts.length - 1] || '').toLowerCase();
}

function scopedQuestion(question, industry, episodes) {
  const list = episodes
    .map((e) => {
      const ep = /^\d+$/.test(e.ep) ? 'Ep ' + e.ep : e.ep;
      return '- ' + e.guest + (e.company ? ' (' + e.company + ')' : '') + ' — ' + ep;
    })
    .join('\n');
  return (
    'Answer this question using ONLY DIB Innovators episodes in the "' +
    industry +
    '" industry. Those guests are:\n' +
    list +
    '\n\nDo not draw on or quote any guest who is not on that list. If none of these ' +
    'guests address the question, say so plainly and suggest a related angle they do cover.' +
    '\n\nQuestion: ' +
    question
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { question, industry } =
      typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Missing question' });
    }

    const assistantName = process.env.PINECONE_ASSISTANT;
    const apiKey = process.env.PINECONE_API_KEY;

    if (!assistantName || !apiKey) {
      return res.status(500).json({ error: 'Missing env vars' });
    }

    const activeIndustry =
      industry && INDUSTRIES.includes(industry) ? industry : null;
    const episodes = activeIndustry ? EPISODES_BY_INDUSTRY[activeIndustry] || [] : [];

    const body = {
      messages: [
        {
          role: 'user',
          content: activeIndustry
            ? scopedQuestion(question, activeIndustry, episodes)
            : question,
        },
      ],
      stream: false,
      include_highlights: true,
    };
    if (activeIndustry && process.env.PINECONE_METADATA_FILTER === '1') {
      body.filter = { industries: { $in: [activeIndustry] } };
    }

    const r = await fetch(
      'https://prod-1-data.ke.pinecone.io/assistant/chat/' + assistantName,
      {
        method: 'POST',
        headers: {
          'Api-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      }
    );

    if (!r.ok) {
      const t = await r.text();
      return res
        .status(r.status)
        .json({ error: 'Pinecone failed', detail: t });
    }

    const data = await r.json();
    let citations = data.citations || [];

    if (activeIndustry) {
      const allowed = new Set(episodes.map((e) => lastName(e.guest)));
      citations = citations.filter((c) => {
        const ref = (c.references && c.references[0]) || {};
        const file = (ref.file && ref.file.name) || '';
        const words = file
          .replace(/\.(docx?|pdf|txt)$/i, '')
          .toLowerCase()
          .split(/[^a-z-]+/);
        return words.some((w) => allowed.has(w));
      });
    }

    return res.status(200).json({
      answer: (data.message && data.message.content) || '',
      citations,
      industry: activeIndustry,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal', detail: String(err) });
  }
}
