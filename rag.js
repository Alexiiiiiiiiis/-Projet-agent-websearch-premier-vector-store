import 'dotenv/config';
import { fileURLToPath } from 'url';
import { getEmbedding } from './embed-store.js';

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX_HOST = process.env.PINECONE_INDEX_HOST;

// --- Phase 7 : Recherche par similarité dans Pinecone ---
async function searchSimilar(question, topK = 3) {
  const vector = await getEmbedding(question);

  const response = await fetch(`${PINECONE_INDEX_HOST}/query`, {
    method: 'POST',
    headers: {
      'Api-Key': PINECONE_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ vector, topK, includeMetadata: true })
  });

  const data = await response.json();
  return data.matches.map(m => ({ score: m.score, metadata: { text: m.metadata.text } }));
}

// --- Phase 8 : RAG complet — retrieval + génération ---
async function ragQuery(question) {
  console.log(`\nQuestion : ${question}`);

  const results = await searchSimilar(question);

  console.log('Contexte récupéré :');
  results.forEach(r => console.log(`  [${r.score.toFixed(2)}] ${r.metadata.text}`));

  const context = results.map(r => r.metadata.text).join('\n\n');

  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MISTRAL_API_KEY}`
    },
    body: JSON.stringify({
      model: 'mistral-small-latest',
      messages: [
        {
          role: 'system',
          content: "Réponds uniquement à partir du contexte fourni. Si l'information n'est pas dans le contexte, dis-le explicitement. Ne pas inventer."
        },
        {
          role: 'user',
          content: `Contexte :\n${context}\n\nQuestion : ${question}`
        }
      ]
    })
  });

  const data = await response.json();
  const answer = data.choices[0].message.content;
  console.log('\nRéponse :', answer);
  return answer;
}

export { searchSimilar, ragQuery };

// --- Test (uniquement si lancé directement) ---
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await ragQuery('Qui a créé Node.js et quand ?');
  await ragQuery('Comment Node.js gère-t-il de nombreuses connexions simultanées ?');
  await ragQuery('Quelle est la recette de la tarte aux pommes ?');
}
