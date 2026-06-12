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

try {
  // Buka GISLINER
  await page.goto('https://gisliner.atrbpn.go.id', { 
    waitUntil: 'networkidle',
    timeout: 60000 
  });

  await page.waitForTimeout(3000);

  // Inject koordinat ke URL map
  await page.goto(
    `https://gisliner.atrbpn.go.id/#map=15/${latitude}/${longitude}`,
    { waitUntil: 'networkidle', timeout: 60000 }
  );

  await page.waitForTimeout(5000);

  // Screenshot hasil
  const screenshot = await page.screenshot({ 
    fullPage: false,
    type: 'png'
  });

  // Simpan screenshot sebagai output
  await Actor.setValue('screenshot', screenshot, { contentType: 'image/png' });

  // Analisis warna pixel di area koordinat untuk deteksi LP2B
  // LP2B biasanya ditandai warna hijau/kuning di peta
  const result = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const centerX = Math.floor(canvas.width / 2);
    const centerY = Math.floor(canvas.height / 2);
    const pixel = ctx.getImageData(centerX, centerY, 10, 10).data;
    return {
      r: pixel[0],
      g: pixel[1], 
      b: pixel[2]
    };
  });

  console.log('Pixel color at center:', result);

  // Deteksi warna LP2B (hijau dominan = LP2B)
  if (result) {
    if (result.g > 150 && result.g > result.r * 1.5 && result.g > result.b * 1.5) {
      lsd_status = 'LP2B_DETECTED';
      lsd_confidence = 0.8;
    } else {
      lsd_status = 'CLEAR';
      lsd_confidence = 0.7;
    }
  }

} catch (error) {
  console.error('Error:', error.message);
  lsd_status = 'ERROR';
  lsd_confidence = 0;
} finally {
  await browser.close();
}

// Output hasil
await Actor.pushData({
  land_id,
  latitude,
  longitude,
  lsd_status,
  lsd_confidence,
  checked_at: new Date().toISOString()
});

console.log(`Result: ${lsd_status} (confidence: ${lsd_confidence})`);

await Actor.exit();
