
// partie3_tool_use_01_calculator_tool.js
// Corrigé — Function calling avec un outil calculatrice
// Le LLM décide quand appeler calculate(), on exécute localement, on renvoie le résultat.

import 'dotenv/config';

// --- Définition de l'outil en JSON Schema ---
// Le modèle lit cette description pour décider quand utiliser l'outil.
// Une description floue = l'outil est ignoré ou mal utilisé.
const tools = [
  {
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
  }
];

// --- Implémentation locale de l'outil ---
// eval() est suffisant en contexte éducatif contrôlé.
// En production : utiliser mathjs (npm install mathjs) pour éviter les injections.
function calculate({ expression }) {
  try {
    // On accepte ** pour les puissances (syntaxe JS ES2016)
    const result = eval(expression);
    return { result };
  } catch (err) {
    return { error: `Expression invalide : ${err.message}` };
  }
}

// --- Registre des fonctions disponibles ---
// On utilise un objet { nom: fonction } pour dispatcher dynamiquement.
const toolFunctions = { calculate };

// --- Appel au LLM avec gestion d'un seul outil ---
// Version simple : on gère un seul aller-retour (pas encore la boucle agentique complète).
async function callWithTools(userMessage) {
  const messages = [{ role: 'user', content: userMessage }];

  // Première requête : le modèle reçoit la question + la liste des outils
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`
    },
    body: JSON.stringify({
      model: 'mistral-small-latest',
      messages,
      tools,
      tool_choice: 'auto' // le modèle décide s'il appelle un outil ou répond directement
    })
  });

  const data = await response.json();
  const choice = data.choices[0];

  // Si finish_reason est 'stop', le modèle a répondu directement sans outil
  if (choice.finish_reason === 'stop') {
    console.log('Réponse directe :', choice.message.content);
    return;
  }

  if (choice.finish_reason === 'tool_calls') {
    // On ajoute le message du modèle (avec tool_calls) à l'historique
    messages.push(choice.message);

    // Le modèle peut demander plusieurs appels en une fois — on les traite tous
    for (const toolCall of choice.message.tool_calls) {
      const fn = toolFunctions[toolCall.function.name];

      // arguments est une chaîne JSON, pas un objet — JSON.parse() obligatoire
      const args = JSON.parse(toolCall.function.arguments);
      const result = fn(args);

      console.log(`Appel outil: ${toolCall.function.name}(${toolCall.function.arguments}) → ${JSON.stringify(result)}`);

      // Le résultat remonte au modèle via un message de rôle 'tool'
      // tool_call_id permet au modèle de matcher résultat et appel
      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result)
      });
    }

    // Deuxième requête : le modèle formule la réponse finale avec les résultats
    const finalResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.MISTRAL_API_KEY}`
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages
        // pas besoin de repasser tools ici, le modèle va répondre en texte
      })
    });

    const finalData = await finalResponse.json();
    console.log('Réponse finale :', finalData.choices[0].message.content);
  }
}

// Test — le modèle va appeler calculate deux fois
await callWithTools('Combien fait 2 à la puissance 32 ? Et 15 fois 24 ?');
 