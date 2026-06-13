import { Actor } from 'apify';
import { chromium } from 'playwright';

await Actor.init();

const input = await Actor.getInput();
const { latitude, longitude, land_id } = input;

console.log(`Checking LSD for land_id: ${land_id}, lat: ${latitude}, lon: ${longitude}`);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

let lsd_status = 'unknown';
let lsd_confidence = 0;
let screenshotBase64 = null;

try {
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.goto(
    `https://gisliner.atrbpn.go.id/#map=17/${latitude}/${longitude}`,
    { waitUntil: 'networkidle', timeout: 60000 }
  );

  await page.waitForTimeout(8000);

  const screenshot = await page.screenshot({ type: 'png' });
  screenshotBase64 = screenshot.toString('base64');

  await Actor.setValue('screenshot', screenshot, { contentType: 'image/png' });

  const geminiApiKey = process.env.GEMINI_API_KEY;

  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inline_data: {
                mime_type: 'image/png',
                data: screenshotBase64
              }
            },
            {
              text: `Ini adalah screenshot dari peta GISLINER ATR/BPN Indonesia yang menampilkan status Lahan Sawah Dilindungi (LP2B/LSD). Analisis screenshot ini dan tentukan apakah titik tengah peta berada di area LP2B atau tidak. LP2B biasanya ditandai dengan warna HIJAU atau KUNING pada peta. Area non-LP2B biasanya berwarna PUTIH, ABU-ABU, atau warna lain. Jawab HANYA dalam format JSON: {"lsd_status": "LP2B_DETECTED" atau "CLEAR" atau "UNCLEAR", "confidence": [angka 0.0 sampai 1.0], "reason": "[penjelasan singkat]"}`
            }
          ]
        }]
      })
    }
  );

  const geminiData = await geminiResponse.json();
  const rawText = geminiData.candidates[0].parts[0].text;
  const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(cleaned);

  lsd_status = parsed.lsd_status;
  lsd_confidence = parsed.confidence;

  console.log(`Gemini analysis: ${lsd_status} (confidence: ${lsd_confidence})`);
  console.log(`Reason: ${parsed.reason}`);

} catch (error) {
  console.error('Error:', error.message);
  lsd_status = 'ERROR';
  lsd_confidence = 0;
} finally {
  await browser.close();
}

await Actor.pushData({
  land_id,
  latitude,
  longitude,
  lsd_status,
  lsd_confidence,
  checked_at: new Date().toISOString()
});

await Actor.exit();