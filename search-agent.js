import 'dotenv/config';
import { runAgent } from './agent-loop.js';

// --- Outil 1 : calculatrice (repris de calculatrice.js) ---
const calculateTool = {
  type: 'function',
  function: {
    name: 'calculate',
    description: 'Évalue une expression mathématique et retourne le résultat numérique. À utiliser pour tout calcul arithmétique : additions, multiplications, puissances, etc.',
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

// --- Outil 2 : météo (repris de weather-agent.js) ---
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
  let response;
  try {
    response = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, {
      signal: AbortSignal.timeout(8000)
    });
  } catch {
    return { error: `Service météo inaccessible pour ${city} (timeout ou réseau).` };
  }

  if (!response.ok) {
    return { error: `Impossible de récupérer la météo pour ${city}` };
  }

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
}

// --- Outil 3 : recherche web via Tavily ---
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
  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        search_depth: 'basic',
        max_results: 5,
        include_answer: true
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      return { error: `Tavily API error ${response.status}` };
    }

    const data = await response.json();
    const results = (data.results ?? []).slice(0, 5).map(r => ({
      title: r.title,
      url: r.url,
      content: r.content
    }));

    return data.answer
      ? { answer: data.answer, sources: results }
      : results.length > 0
        ? results
        : { message: 'Aucun résultat trouvé pour cette requête.' };
  } catch {
    return { message: 'Service de recherche inaccessible.' };
  }
}

// --- Agent avec les 3 outils ---
const tools = [calculateTool, weatherTool, searchTool];
const toolFunctions = { calculate, get_weather, web_search };

const questions = [
  "Qui a gagné la dernière Coupe du monde de football ?",
  "Quelle est la météo à Paris et quel est le cours du Bitcoin aujourd'hui ?"
];

for (const question of questions) {
  console.log(`\n>>> ${question}`);
  const answer = await runAgent(tools, toolFunctions, question);
  console.log(answer);
}
