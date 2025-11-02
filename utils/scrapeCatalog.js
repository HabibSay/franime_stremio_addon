// utils/scrapeCatalog.js
const puppeteer = require('puppeteer');

async function scrapeAnimeCatalog() {
  console.log('🔍 Scraping du catalogue FrAnime...');

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    await page.goto('https://franime.fr/', { waitUntil: 'networkidle2', timeout: 15000 });
    await page.waitForSelector('a[href*="/anime/"]', { timeout: 10000 });

    const rawAnimes = await page.evaluate(() => {
      const results = [];
      const links = Array.from(document.querySelectorAll('a[href*="/anime/"]'));

      for (const link of links) {
        const href = link.href;
        if (!href.includes('anime_id=')) continue;

        const slugMatch = href.match(/\/anime\/([^?]+)/);
        if (!slugMatch) continue;
        const slug = slugMatch[1].trim();

        // Élimine les slugs non pertinents
        if (!slug || slug.length < 3 || /regarder|watch|voir/i.test(slug)) continue;

        const params = new URL(href).searchParams;
        const anime_id = params.get('anime_id');
        if (!anime_id || isNaN(anime_id)) continue;

        const img = link.querySelector('img[alt]');
        if (!img) continue;

        const name = img.alt.trim();
        if (!name || name.length < 3 || /regarder|watch|voir/i.test(name)) continue;

        results.push({ name, slug, anime_id });
      }

      // Supprime les doublons par slug
      const seen = new Set();
      return results.filter(item => {
        if (seen.has(item.slug)) return false;
        seen.add(item.slug);
        return true;
      });
    });

    await browser.close();
    console.log(`✅ ${rawAnimes.length} animes bruts extraits.`);
    return rawAnimes;
  } catch (err) {
    console.error('❌ Erreur scraping FrAnime:', err.message);
    await browser.close();
    return [];
  } finally {
        try { await browser.close(); } catch (e) {}
    }
}

module.exports = scrapeAnimeCatalog;