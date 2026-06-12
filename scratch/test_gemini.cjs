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

async function test() {
  loadServerEnv();
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    console.log('Sending test request to gemini-2.5-flash...');
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: '5 hamburger alana %20 indirim için kampanya fikri ver.' }]
        }]
      })
    });

    console.log('Response Status:', response.status);
    const data = await response.json();
    console.log('Response Reply:', data.candidates[0].content.parts[0].text);
  } catch (err) {
    console.error(err);
  }
}

test();
