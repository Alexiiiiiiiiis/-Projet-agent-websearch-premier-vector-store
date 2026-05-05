import 'dotenv/config';
import { runAgent } from './agent-loop.js';

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
  const response = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`);

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

const tools = [weatherTool];
const toolFunctions = { get_weather };

const questions = [
  "Quelle est la météo à Paris et à Tokyo en ce moment ?",
  "Il fait combien à Lyon ? Est-ce qu'il faut un manteau ?"
];

for (const question of questions) {
  console.log(`\n>>> ${question}`);
  const answer = await runAgent(tools, toolFunctions, question);
  console.log(answer);
}
