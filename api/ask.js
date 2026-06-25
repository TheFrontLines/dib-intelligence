// /api/ask.js - Vercel edge function calling Pinecone Assistant
export default async function handler(req) {
    if (req.method !== 'POST') return new Response(JSON.stringify({error:'Method not allowed'}), {status:405, headers:{'Content-Type':'application/json'}});
    try {
          const { question } = await req.json();
          if (!question) return new Response(JSON.stringify({error:'Missing question'}), {status:400, headers:{'Content-Type':'application/json'}});
          const assistantName = process.env.PINECONE_ASSISTANT;
          const apiKey = process.env.PINECONE_API_KEY;
          if (!assistantName || !apiKey) return new Response(JSON.stringify({error:'Missing env vars'}), {status:500, headers:{'Content-Type':'application/json'}});
          const r = await fetch('https://prod-1-data.ke.pinecone.io/assistant/chat/' + assistantName, {method:'POST', headers:{'Api-Key':apiKey,'Content-Type':'application/json'}, body: JSON.stringify({messages:[{role:'user',content:question}], stream:false, include_highlights:true})});
          if (!r.ok) { const t = await r.text(); return new Response(JSON.stringify({error:'Pinecone failed',detail:t}), {status:r.status, headers:{'Content-Type':'application/json'}}); }
          const data = await r.json();
          return new Response(JSON.stringify({answer: data.message?.content || '', citations: data.citations || []}), {status:200, headers:{'Content-Type':'application/json'}});
    } catch (err) {
          return new Response(JSON.stringify({error:'Internal',detail:String(err)}), {status:500, headers:{'Content-Type':'application/json'}});
    }
}
export const config = { runtime: 'edge' };
