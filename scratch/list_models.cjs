const fs = require('fs');
const path = require('path');

function loadServerEnv() {
  const envPath = path.join(__dirname, '../server/.env')
  if (!fs.existsSync(envPath)) return

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/)
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) continue

    const key = line.slice(0, separatorIndex).trim()
    if (!key || Object.prototype.hasOwnProperty.call(process.env, key)) continue

    let value = line.slice(separatorIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

async function list() {
  loadServerEnv();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();
    const geminiModels = data.models
      .filter(m => m.name.includes('gemini-') && m.supportedGenerationMethods.includes('generateContent'))
      .map(m => m.name);
    console.log('Available Gemini models with generateContent:');
    console.log(geminiModels);
  } catch (err) {
    console.error(err);
  }
}

list();
