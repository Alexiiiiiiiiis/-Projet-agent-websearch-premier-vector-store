import 'dotenv/config';
import { runAgent } from './agent-loop.js';
import { getEmbedding } from './embed-store.js';

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_INDEX_HOST = process.env.PINECONE_INDEX_HOST;

// --- Outil 1 : calculatrice ---
const calculateTool = {
  type: 'function',
  function: {
    name: 'calculate',
    description: 'Évalue une expression mathématique et retourne le résultat numérique. À utiliser pour tout calcul arithmétique : additions, multiplications, puissances, conversions.',
    parameters: {
      type: 'object',
      properties: {
        expression: {
          type: 'string',
          description: "L'expression mathématique à évaluer, ex: '2 ** 32' ou '(15 * 4) / 3'"
        }
      },
      required: ['expression']
    }
  }
};

function calculate({ expression }) {
  try {
    const result = eval(expression);
    return { result };
  } catch (err) {
    return { error: `Expression invalide : ${err.message}` };
  }
}

// --- Outil 2 : météo ---
const weatherTool = {
  type: 'function',
  function: {
    name: 'get_weather',
    description: "Récupère la météo actuelle pour une ville donnée. Utiliser quand on parle de météo, température, conditions climatiques.",
    parameters: {
      type: 'object',
      properties: {
        city: {
          type: 'string',
          description: "Le nom de la ville, en anglais de préférence (ex: 'Paris', 'London', 'Tokyo')"
        }
      },
      required: ['city']
    }
  }
};

async function get_weather({ city }) {
  try {
    const response = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, {
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return { error: `Météo indisponible pour ${city}` };
    const data = await response.json();
    const current = data.current_condition[0];
    return {
      city,
      temperature_c: current.temp_C,
      feels_like_c: current.FeelsLikeC,
      description: current.weatherDesc[0].value,
      humidity: current.humidity + '%',
      wind_kmph: current.windspeedKmph
    };
  } catch {
    return { error: `Service météo inaccessible pour ${city}` };
  }
}

// --- Outil 3 : recherche web ---
const searchTool = {
  type: 'function',
  function: {
    name: 'web_search',
    description: "Recherche des informations récentes sur le web. Utiliser pour des faits actuels, des événements récents, des prix, des données en temps réel, ou quand on n'est pas certain d'une information.",
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'La requête de recherche, en anglais pour de meilleurs résultats'
        }
      },
      required: ['query']
    }
  }
};

async function web_search({ query }) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (educational project)' },
      signal: AbortSignal.timeout(8000)
    });
    const data = await response.json();

    if (data.Answer) return [{ text: data.Answer, url: '' }];
    if (data.AbstractText) return [{ text: data.AbstractText, url: data.AbstractURL }];

    const topics = (data.RelatedTopics ?? [])
      .filter(t => t.Text)
      .slice(0, 5)
      .map(t => ({ text: t.Text, url: t.FirstURL }));

    return topics.length > 0 ? topics : { message: 'Aucun résultat trouvé.' };
  } catch {
    return { message: 'Service de recherche inaccessible.' };
  }
}

// --- Outil 4 : RAG sur corpus privé Pinecone ---
const ragTool = {
  type: 'function',
  function: {
    name: 'rag_search',
    description: "Cherche des informations dans la base de documents internes indexée (corpus privé). Utiliser pour des questions sur la documentation interne, Node.js, les technologies du cours, ou quand web_search ne retourne pas de résultats pertinents.",
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'La requête de recherche sémantique dans le corpus privé'
        }
      },
      required: ['query']
    }
  }
};

async function rag_search({ query }) {
  const vector = await getEmbedding(query);

  const response = await fetch(`${PINECONE_INDEX_HOST}/query`, {
    method: 'POST',
    headers: {
      'Api-Key': PINECONE_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ vector, topK: 3, includeMetadata: true })
  });

  const data = await response.json();
  return data.matches.map(m => ({ score: m.score, text: m.metadata.text }));
}

// --- Agent hybride à 4 outils ---
const tools = [calculateTool, weatherTool, searchTool, ragTool];
const toolFunctions = { calculate, get_weather, web_search, rag_search };

async function askAgent(question) {
  console.log(`\n>>> ${question}`);
  const answer = await runAgent(tools, toolFunctions, question);
  console.log(answer);
}

// --- Tests Phase 9 ---
await askAgent('Quel temps fait-il à Paris ?');
await askAgent('Combien fait 2 puissance 32 ?');
await askAgent('Qui a gagné la Coupe du Monde 2022 ?');
await askAgent('Qui a créé Node.js et comment gère-t-il les connexions simultanées ?');
await askAgent('Raconte-moi une blague');
