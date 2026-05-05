# Mini-Perplexity — Agent multi-outils + RAG

Projet du cours **NodeJs : Communication avec IA — Jour 3 : Tool Use et Introduction au RAG**.

Construction progressive d'un agent intelligent capable de :
- Calculer des expressions mathématiques
- Récupérer la météo en temps réel
- Chercher sur le web (Tavily)
- Interroger un corpus privé indexé dans Pinecone (RAG)
- Mémoriser une conversation multi-tours

## Stack

| Service | Usage | Plan |
|---|---|---|
| **Mistral AI** | LLM (`mistral-small-latest`) + embeddings (`mistral-embed`, 1024 dims) | Free tier |
| **Pinecone** | Base vectorielle serverless (cosine, AWS us-east-1) | Free tier (2 GB) |
| **Tavily** | Recherche web optimisée pour agents IA | Free tier (1 000 req/mois) |
| **wttr.in** | Météo | Gratuit, sans clé |
| **Node.js 22+** | Runtime ES Modules | — |

## Installation

```bash
npm install
```

Crée un fichier `.env` à la racine (cf. [example.env](example.env)) :

```env
MISTRAL_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxx
PINECONE_API_KEY=pcsk_xxxxxxxxxxxxxxxxxxxxxxxx
PINECONE_INDEX_NAME=mini-perplexity
PINECONE_INDEX_HOST=
TAVILY_API_KEY=tvly-xxxxxxxxxxxxxxxxxxxxxxxx
```

> `PINECONE_INDEX_HOST` se remplit automatiquement au premier `node pinecone-setup.js`.

### Où récupérer les clés

| Clé | URL |
|---|---|
| Mistral | https://console.mistral.ai/api-keys |
| Pinecone | https://app.pinecone.io → API keys |
| Tavily | https://tavily.com → Sign up → API key (sans CB) |

## Mise en route — ordre d'exécution

```bash
# 1. Crée l'index Pinecone si nécessaire et récupère son host
node pinecone-setup.js

# 2. Découpe le corpus, génère les embeddings et les upsert
node embed-store.js

# 3. Vérifie la pipeline RAG (retrieval + génération)
node rag.js

# 4. Lance l'agent hybride 4 outils
node hybrid-agent.js

# 5. Optionnel : tester la mémoire de conversation
node chat-agent.js
```

## Architecture

```
agent.js              ← Boucle agentique générique (runAgent)
agent-loop.js         ← Re-export

calculatrice.js       ← Phase 1 : appel d'outil unique
weather-agent.js      ← Phase 2 : agent météo en boucle
search-agent.js       ← Phase 3 : agent 3 outils (calcul, météo, web)
chat-agent.js         ← Phase 4 : mémoire de conversation persistante

pinecone-setup.js     ← Phase 5 : création / connexion à l'index Pinecone
embed-store.js        ← Phase 6 : chunking + embedding + upsert
rag.js                ← Phases 7-8 : recherche par similarité + génération
hybrid-agent.js       ← Phase 9 : agent 4 outils (calcul, météo, web, RAG)
```

## Boucle agentique

`runAgent(tools, toolFunctions, userMessageOrHistory)` boucle jusqu'à 10 itérations :

1. Envoie l'historique au LLM avec la liste d'outils disponibles
2. Si `finish_reason === 'stop'` → retourne le contenu final
3. Si `finish_reason === 'tool_calls'` → exécute chaque tool localement, push le résultat dans l'historique avec `role: 'tool'`, et reboucle

Quand on passe un tableau `messages` au lieu d'une string, l'historique est partagé par référence — c'est ce qui permet la mémoire de conversation dans `chat-agent.js`.

## Pipeline RAG

**Indexation** ([embed-store.js](embed-store.js))

```
texte → simpleChunk(40 mots) → mistral-embed → upsert Pinecone (id, values, metadata.text)
```

**Retrieval** ([rag.js](rag.js))

```
question → mistral-embed → query Pinecone (topK=3) → matches[] avec scores cosine
```

**Génération avec contexte**

```
contexte = matches.map(m => m.text).join('\n\n')
LLM avec system prompt strict : "Réponds uniquement à partir du contexte fourni"
```

## Outils de l'agent hybride

| Outil | Fonction | API | Description |
|---|---|---|---|
| `calculate` | Évalue une expression mathématique | `eval()` local | Pour tout calcul arithmétique |
| `get_weather` | Météo d'une ville | wttr.in (JSON gratuit) | Pour les conditions climatiques |
| `web_search` | Recherche web | Tavily | Pour les faits récents / temps réel |
| `rag_search` | Recherche sémantique | Mistral embed + Pinecone | Pour le corpus privé indexé |

Le LLM choisit automatiquement l'outil selon la `description` JSON Schema de chaque tool.

## Pourquoi Tavily plutôt que DuckDuckGo

L'API gratuite **DuckDuckGo Instant Answer** ne retourne quasiment jamais de résultats utiles : elle ne fait pas de recherche web, juste des "instant answers" (Wikipedia / disambiguation). Sur des requêtes type "Coupe du Monde 2022" ou "cours du Bitcoin", elle retourne vide → l'agent s'épuise en 10 tours.

**Tavily** est conçue spécifiquement pour les agents LLM :
- Vraie recherche web avec extraction de contenu
- Renvoie un champ `answer` synthétisé (idéal pour LLM)
- Free tier 1 000 req/mois sans carte bancaire
- Endpoint REST simple : `POST https://api.tavily.com/search`

## Limitations connues

- **`eval()` dans `calculate`** : à n'utiliser qu'en dev/edu — jamais en prod sans sandbox
- **Mistral free tier** : rate limit 429 sur les embeddings → `getEmbedding()` retry avec backoff exponentiel (2s → 32s)
- **Limite agent** : 10 itérations maximum dans la boucle agentique pour éviter les boucles infinies

## Variables d'environnement

| Variable | Description | Source |
|---|---|---|
| `MISTRAL_API_KEY` | Clé Mistral (chat + embed) | console.mistral.ai |
| `PINECONE_API_KEY` | Clé Pinecone | app.pinecone.io |
| `PINECONE_INDEX_NAME` | Nom de l'index | défaut : `mini-perplexity` |
| `PINECONE_INDEX_HOST` | URL de l'index | écrit auto par `pinecone-setup.js` |
| `TAVILY_API_KEY` | Clé Tavily | tavily.com |


