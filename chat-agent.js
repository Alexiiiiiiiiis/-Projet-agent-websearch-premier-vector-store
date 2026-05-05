import 'dotenv/config';
import { runAgent } from './agent-loop.js';

// --- Outils disponibles ---
const calculateTool = {
  type: 'function',
  function: {
    name: 'calculate',
    description: 'Évalue une expression mathématique et retourne le résultat numérique. À utiliser pour tout calcul arithmétique.',
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

const tools = [calculateTool, weatherTool];
const toolFunctions = { calculate, get_weather };

// --- Mémoire de conversation partagée ---
const conversationHistory = [
  { role: 'system', content: "Tu es un assistant intelligent avec accès à des outils. Réponds en français de façon concise et précise." }
];

async function chatWithAgent(userMessage) {
  conversationHistory.push({ role: 'user', content: userMessage });
  const answer = await runAgent(tools, toolFunctions, conversationHistory);
  return answer;
}

// --- Test Phase 4 : mémoire de conversation ---
console.log('\n>>> Quelle est la météo à Paris ?');
console.log(await chatWithAgent('Quelle est la météo à Paris ?'));

console.log('\n>>> Et à Lyon ?');
console.log(await chatWithAgent('Et à Lyon ?'));

console.log('\n>>> Compare les deux températures.');
console.log(await chatWithAgent('Compare les deux températures.'));
