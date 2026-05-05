import 'dotenv/config';
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(__dirname, '.env');

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'mini-perplexity';

const PINECONE_HEADERS = {
  'Api-Key': PINECONE_API_KEY,
  'Content-Type': 'application/json'
};

async function getIndexInfo() {
  const response = await fetch(`https://api.pinecone.io/indexes/${INDEX_NAME}`, {
    headers: PINECONE_HEADERS
  });
  if (!response.ok) return null;
  const data = await response.json();
  return {
    name: data.name,
    dimension: data.dimension,
    metric: data.metric,
    status: data.status,
    host: data.host
  };
}

async function createIndex() {
  const response = await fetch('https://api.pinecone.io/indexes', {
    method: 'POST',
    headers: PINECONE_HEADERS,
    body: JSON.stringify({
      name: INDEX_NAME,
      dimension: 1024,
      metric: 'cosine',
      spec: {
        serverless: {
          cloud: 'aws',
          region: 'us-east-1'
        }
      }
    })
  });

  if (response.status === 409) {
    console.log(`Index "${INDEX_NAME}" existe déjà.`);
    return true;
  }

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`Erreur création index : ${JSON.stringify(err)}`);
  }

  console.log(`Index "${INDEX_NAME}" créé.`);
  return true;
}

async function waitForReady(maxAttempts = 30) {
  console.log('En attente que l\'index soit prêt...');
  for (let i = 0; i < maxAttempts; i++) {
    const info = await getIndexInfo();
    if (info?.status?.ready) {
      return info;
    }
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('Timeout : l\'index n\'est pas prêt après 60 secondes.');
}

function writeHostToEnv(host) {
  const url = host.startsWith('http') ? host : `https://${host}`;
  let content = readFileSync(ENV_PATH, 'utf8');
  if (content.includes('PINECONE_INDEX_HOST=')) {
    content = content.replace(/PINECONE_INDEX_HOST=.*/, `PINECONE_INDEX_HOST=${url}`);
  } else {
    content += `\nPINECONE_INDEX_HOST=${url}`;
  }
  writeFileSync(ENV_PATH, content, 'utf8');
  console.log(`\nPINECONE_INDEX_HOST=${url} écrit dans .env`);
}

// --- Main ---
let info = await getIndexInfo();

if (!info) {
  await createIndex();
  info = await waitForReady();
} else {
  console.log(`Index "${INDEX_NAME}" trouvé.`);
  if (!info.status?.ready) {
    info = await waitForReady();
  }
}

console.log('\nIndex connecté :', info);

if (info.host) {
  writeHostToEnv(info.host);
}

export { getIndexInfo };
