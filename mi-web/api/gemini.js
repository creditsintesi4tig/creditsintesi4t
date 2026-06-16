// Cola global para serializar peticiones y evitar ráfagas simultáneas
let queuePromise = Promise.resolve();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGeminiWithRetry(googleUrl, body, maxRetries = 4) {
  let delay = 2000; // espera inicial: 2s

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const response = await fetch(googleUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (response.status !== 429) {
      return response;
    }

    if (attempt === maxRetries) {
      return response;
    }

    await sleep(delay);
    delay *= 2;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const { model, body, useWebSearch } = req.body;
  if (!model || !body) {
    return res.status(400).json({ error: 'Missing model or body' });
  }

  const googleUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Si useWebSearch és true, afegim l'eina de cerca web de Google
  const finalBody = useWebSearch
    ? { ...body, tools: [{ google_search: {} }] }
    : body;

  const result = await new Promise((resolve, reject) => {
    queuePromise = queuePromise
      .then(() => callGeminiWithRetry(googleUrl, finalBody))
      .then(resolve)
      .catch(reject);
  });

  const data = await result.json();

  if (result.status === 429) {
    return res.status(429).json({
      error: 'rate_limit',
      message: 'Hi ha molta demanda en aquest moment. Espera uns segons i torna-ho a intentar.',
    });
  }

  return res.status(result.status).json(data);
}
