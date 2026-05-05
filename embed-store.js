import 'dotenv/config';
import { fileURLToPath } from 'url';

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX_HOST = process.env.PINECONE_INDEX_HOST;

// --- Embedding via Mistral ---
async function getEmbedding(text, maxRetries = 5) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch('https://api.mistral.ai/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MISTRAL_API_KEY}`
      },
      body: JSON.stringify({
        model: 'mistral-embed',
        input: text
      })
    });
    const data = await response.json();
    if (data.data) return data.data[0].embedding;
    if (response.status === 429 || data.code === '3505') {
      const wait = 2000 * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    throw new Error(`Mistral API error: ${JSON.stringify(data)}`);
  }
  throw new Error('Mistral API: rate limit dépassé après plusieurs tentatives');
}

// --- Découpage en chunks par mots ---
function simpleChunk(text, maxWords = 50) {
  const words = text.trim().split(/\s+/);
  const chunks = [];
  for (let i = 0; i < words.length; i += maxWords) {
    chunks.push(words.slice(i, i + maxWords).join(' '));
  }
  return chunks;
}

// --- Upsert des chunks dans Pinecone ---
async function upsertChunks(chunks) {
  const vectors = [];
  for (let i = 0; i < chunks.length; i++) {
    const text = chunks[i];
    const values = await getEmbedding(text);
    vectors.push({ id: `chunk-${Date.now()}-${i}`, values, metadata: { text } });
    if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 1500));
  }

  const response = await fetch(`${PINECONE_INDEX_HOST}/vectors/upsert`, {
    method: 'POST',
    headers: {
      'Api-Key': PINECONE_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ vectors })
  });

  const data = await response.json();
  return { upsertedCount: data.upsertedCount };
}

// --- Corpus de test sur Node.js (utilisé pour les demos RAG) ---
const corpus = `
Node.js est un environnement d'exécution JavaScript côté serveur, créé par Ryan Dahl en 2009.
Il utilise le moteur V8 de Google Chrome pour exécuter du JavaScript hors du navigateur.
Node.js est particulièrement performant pour les applications I/O-intensives grâce à son architecture événementielle non-bloquante.
Le gestionnaire de paquets npm (Node Package Manager) est inclus avec Node.js et permet d'accéder à des millions de bibliothèques open source.
Node.js utilise un modèle de programmation asynchrone basé sur des callbacks, des Promesses et l'API async/await.
Express.js est le framework web le plus populaire pour Node.js, utilisé pour créer des API REST et des serveurs web.
Node.js supporte les modules ES (import/export) depuis la version 12 via le champ "type": "module" dans package.json.
Les streams Node.js permettent de traiter des données volumineuses en flux continu sans les charger entièrement en mémoire.
Node.js est largement utilisé pour construire des serveurs d'API, des outils en ligne de commande et des applications temps réel.
La boucle événementielle (event loop) de Node.js est ce qui lui permet de gérer des milliers de connexions simultanées avec un seul thread.
`.trim();

export { getEmbedding, simpleChunk, upsertChunks };

// --- Main : découper, embédder, stocker (uniquement si lancé directement) ---
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('Découpage du corpus en chunks...');
  const chunks = simpleChunk(corpus, 40);
  console.log(`${chunks.length} chunks générés.`);

  console.log('Génération des embeddings et upsert dans Pinecone...');
  const result = await upsertChunks(chunks);
  console.log('Upsert terminé :', result);

  console.log('\nTest embedding simple :');
  const embedding = await getEmbedding('Le chat est sur le tapis');
  console.log('Dimensions :', embedding.length);
  console.log('Premiers nombres :', embedding.slice(0, 5));
}
