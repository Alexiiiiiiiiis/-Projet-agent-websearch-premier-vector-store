# Mini-Perplexity — Agent multi-outils + RAG

Projet du cours **NodeJs : Communication avec IA — Jour 3 : Tool Use et Introduction au RAG**.

Construction progressive d'un agent intelligent capable de :
- Calculer des expressions mathématiques
- Récupérer la météo en temps réel
- Chercher sur le web
- Interroger un corpus privé indexé dans Pinecone (RAG)
- Mémoriser une conversation multi-tours

## Stack

- **Node.js** 22+ avec ES Modules
- **Mistral AI** — `mistral-small-latest` (LLM) + `mistral-embed` (embeddings 1024 dims)
- **Pinecone** — base vectorielle serverless (cosine, AWS us-east-1)
- **wttr.in** — API météo gratuite
- **DuckDuckGo Instant Answer API** — recherche web

## Installation

```bash
npm install
```

Crée un fichier `.env` à la racine :

```env
MISTRAL_API_KEY=xxxxxxxxxxxxxxxxxxxxxxxx
PINECONE_API_KEY=pcsk_xxxxxxxxxxxxxxxxxxxxxxxx
PINECONE_INDEX_NAME=mini-perplexity
PINECONE_INDEX_HOST=
```

> `PINECONE_INDEX_HOST` sera rempli automatiquement par `pinecone-setup.js`.

## Mise en route

```bash
# 1. Crée l'index Pinecone si nécessaire et récupère son host
node pinecone-setup.js

# 2. Découpe le corpus, génère les embeddings et les upsert dans Pinecone
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
agent-loop.js         ← Re-export de runAgent

calculatrice.js       ← Phase 1 : appel d'outil unique
weather-agent.js      ← Phase 2 : agent météo en boucle
search-agent.js       ← Phase 3 : agent 3 outils (calcul, météo, web)
chat-agent.js         ← Phase 4 : mémoire de conversation persistante

pinecone-setup.js     ← Phase 5 : création / connexion à l'index Pinecone
embed-store.js        ← Phase 6 : chunking + embedding + upsert
rag.js                ← Phases 7-8 : recherche par similarité + génération avec contexte
hybrid-agent.js       ← Phase 9 : agent 4 outils (calcul, météo, web, RAG)
```

## Boucle agentique

`runAgent(tools, toolFunctions, userMessageOrHistory)` boucle jusqu'à 10 itérations :

1. Envoie l'historique au LLM avec la liste d'outils disponibles
2. Si `finish_reason === 'stop'` → retourne le contenu final
3. Si `finish_reason === 'tool_calls'` → exécute chaque tool localement, push le résultat dans l'historique avec `role: 'tool'`, et reboucle

Si on passe un tableau `messages` à la place d'une string, l'historique est partagé par référence — c'est ce qui permet la mémoire de conversation dans `chat-agent.js`.

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

| Outil | Fonction | API |
|---|---|---|
| `calculate` | Évalue une expression mathématique | `eval()` (sandbox local) |
| `get_weather` | Météo d'une ville | wttr.in (JSON) |
| `web_search` | Recherche web | DuckDuckGo Instant Answer |
| `rag_search` | Recherche sémantique dans le corpus privé | Mistral embed + Pinecone query |

Le LLM choisit l'outil selon la `description` JSON Schema de chaque tool.

## Limitations connues

- **DuckDuckGo Instant Answer** retourne souvent vide pour les requêtes actualités/sport (ex: "Coupe du Monde 2022"). L'agent s'arrête alors à 10 tours.
- **Mistral free tier** : rate limit 429 sur les embeddings. `getEmbedding()` retry avec backoff exponentiel (2s → 32s).
- **`eval()` dans `calculate`** : à n'utiliser qu'en dev/edu — jamais en prod sans sandbox.

## Structure du `.env`

| Variable | Description |
|---|---|
| `MISTRAL_API_KEY` | Clé API Mistral (chat + embed) |
| `PINECONE_API_KEY` | Clé API Pinecone |
| `PINECONE_INDEX_NAME` | Nom de l'index (défaut : `mini-perplexity`) |
| `PINECONE_INDEX_HOST` | URL complète de l'index, écrite automatiquement par `pinecone-setup.js` |
