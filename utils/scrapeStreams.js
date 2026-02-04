// utils/scrapeStreams.js
const puppeteer = require('puppeteer');

/**
 * Helper function to wait for a specified duration
 * @param {number} ms - Milliseconds to wait
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Available players/sources on FRAnime
 */
const PLAYER_NAMES = {
  sendvid: 'Sendvid',
  sibnet: 'Sibnet',
  vidbm: 'VidBM',
  doodstream: 'DoodStream'
};

/**
 * Scrape available episodes for an anime
 * @param {string} slug - Anime slug
 * @param {string} animeId - Anime ID
 * @param {number} season - Season number (default: 1)
 * @param {string} lang - Language: 'vo' for VOSTFR, 'vf' for VF (default: 'vo')
 * @returns {Promise<Array<{episode: number, lang: string}>>} - List of available episodes
 */
async function scrapeEpisodeList(slug, animeId, season = 1, lang = 'vo') {
  console.log(`🔍 Scraping episode list for ${slug} (Season ${season}, ${lang.toUpperCase()})...`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    const url = `https://franime.fr/anime/${slug}?s=${season}&ep=&lang=${lang}&anime_id=${animeId}`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for episode selector to appear
    await page.waitForSelector('select, [class*="episode"], a[href*="ep="]', { timeout: 10000 }).catch(() => null);

    const episodes = await page.evaluate(() => {
      const results = [];
      
      // Method 1: Look for episode links
      const episodeLinks = document.querySelectorAll('a[href*="ep="]');
      for (const link of episodeLinks) {
        const href = link.href;
        const epMatch = href.match(/ep=(\d+)/);
        if (epMatch) {
          const ep = parseInt(epMatch[1], 10);
          if (ep > 0 && !results.find(e => e.episode === ep)) {
            results.push({ episode: ep });
          }
        }
      }

      // Method 2: Look for episode select dropdown
      const selects = document.querySelectorAll('select');
      for (const select of selects) {
        const options = select.querySelectorAll('option');
        for (const option of options) {
          const value = option.value;
          const epMatch = value.match(/ep=(\d+)/) || value.match(/^(\d+)$/);
          if (epMatch) {
            const ep = parseInt(epMatch[1], 10);
            if (ep > 0 && !results.find(e => e.episode === ep)) {
              results.push({ episode: ep });
            }
          }
        }
      }

      return results.sort((a, b) => a.episode - b.episode);
    });

    console.log(`✅ Found ${episodes.length} episodes for ${slug}`);
    return episodes;

  } catch (err) {
    console.error(`❌ Error scraping episodes for ${slug}:`, err.message);
    return [];
  } finally {
    await browser.close();
  }
}

/**
 * Scrape video stream URL for a specific episode
 * @param {string} slug - Anime slug
 * @param {string} animeId - Anime ID  
 * @param {number} episode - Episode number
 * @param {number} season - Season number (default: 1)
 * @param {string} lang - Language: 'vo' for VOSTFR, 'vf' for VF (default: 'vo')
 * @returns {Promise<Array<{name: string, url: string, quality: string}>>} - List of available streams
 */
async function scrapeVideoStreams(slug, animeId, episode, season = 1, lang = 'vo') {
  console.log(`🎬 Scraping streams for ${slug} - S${season}E${episode} (${lang.toUpperCase()})...`);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const streams = [];

  try {
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    // Enable request interception to catch video URLs
    await page.setRequestInterception(true);
    
    const interceptedUrls = new Set();
    page.on('request', request => {
      const url = request.url();
      // Capture video URLs from requests
      if (url.includes('.mp4') || url.includes('.m3u8') || 
          url.includes('sendvid') || url.includes('sibnet') ||
          url.includes('vidbm') || url.includes('dood')) {
        interceptedUrls.add(url);
      }
      request.continue();
    });

    // Navigate to episode page
    const url = `https://franime.fr/anime/${slug}?s=${season}&ep=${episode}&lang=${lang}&anime_id=${animeId}`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for page to load
    await page.waitForSelector('body', { timeout: 10000 });

    // Look for player selector dropdown
    const hasPlayerSelector = await page.$('select[name*="player"], select[id*="player"], .player-select, select');
    
    // Get available players from dropdown if exists
    const playerOptions = await page.evaluate(() => {
      const selects = document.querySelectorAll('select');
      const players = [];
      
      for (const select of selects) {
        const options = select.querySelectorAll('option');
        for (const option of options) {
          const text = option.textContent.toLowerCase();
          const value = option.value;
          
          // Check if this looks like a player option
          if (text.includes('send') || text.includes('sibnet') || 
              text.includes('vid') || text.includes('dood') ||
              value.includes('player') || value.includes('source')) {
            players.push({
              text: option.textContent.trim(),
              value: value,
              selectIndex: Array.from(document.querySelectorAll('select')).indexOf(select),
              optionIndex: Array.from(options).indexOf(option)
            });
          }
        }
      }
      
      return players;
    });

    // Try each player option and extract stream
    if (playerOptions.length > 0) {
      for (const player of playerOptions) {
        try {
          const stream = await extractStreamFromPlayer(page, player, slug, episode, season, lang);
          if (stream) {
            streams.push(stream);
          }
        } catch (err) {
          console.warn(`⚠️ Could not extract stream from player ${player.text}:`, err.message);
        }
      }
    }

    // If no player options found, try to click "Regarder l'épisode" directly
    if (streams.length === 0) {
      const stream = await extractDirectStream(page);
      if (stream) {
        streams.push(stream);
      }
    }

    // Add any intercepted URLs that weren't captured by DOM scraping
    for (const interceptedUrl of interceptedUrls) {
      if (!streams.find(s => s.url === interceptedUrl)) {
        const sourceName = identifySource(interceptedUrl);
        streams.push({
          name: `${sourceName} (intercepted)`,
          url: interceptedUrl,
          quality: 'HD'
        });
      }
    }

    console.log(`✅ Found ${streams.length} streams for ${slug} S${season}E${episode}`);
    return streams;

  } catch (err) {
    console.error(`❌ Error scraping streams for ${slug}:`, err.message);
    return streams;
  } finally {
    await browser.close();
  }
}

/**
 * Extract stream URL from a specific player option
 */
async function extractStreamFromPlayer(page, player, slug, episode, season, lang) {
  // Select the player option
  const selects = await page.$$('select');
  if (selects[player.selectIndex]) {
    await selects[player.selectIndex].select(player.value);
    await delay(500); // Wait for selection to register
  }

  // Click "Regarder l'épisode" button
  const watchButton = await page.$('button:has-text("Regarder"), a:has-text("Regarder"), [class*="watch"], [class*="play"]');
  if (watchButton) {
    await watchButton.click();
    await delay(2000); // Wait for player to load
  }

  return await extractDirectStream(page, player.text);
}

/**
 * Extract stream URL directly from the page DOM
 */
async function extractDirectStream(page, sourceName = 'Unknown') {
  // Try to click "Regarder l'épisode" button if present
  try {
    const buttons = await page.$$('button, a');
    for (const button of buttons) {
      const text = await page.evaluate(el => el.textContent || '', button);
      if (text.toLowerCase().includes('regarder')) {
        await button.click();
        await delay(2000);
        break;
      }
    }
  } catch (e) {
    // Button click failed, continue anyway
  }

  // Wait for video player to appear
  await page.waitForSelector('video, iframe, .video-js, #video-js-video, source', { timeout: 10000 }).catch(() => null);

  // Extract video source URL from DOM
  const streamData = await page.evaluate(() => {
    // Method 1: Look for <source> element with src attribute
    const source = document.querySelector('source[src*=".mp4"], source[src*=".m3u8"]');
    if (source) {
      return {
        url: source.src,
        type: source.type || 'video/mp4'
      };
    }

    // Method 2: Look for video element with src
    const video = document.querySelector('video[src]');
    if (video && video.src && (video.src.includes('.mp4') || video.src.includes('.m3u8'))) {
      return {
        url: video.src,
        type: 'video/mp4'
      };
    }

    // Method 3: Check video-js structure (as shown in user's example)
    const videoJs = document.querySelector('#video-js-video_html5_api, .vjs-tech');
    if (videoJs) {
      const src = videoJs.src || videoJs.getAttribute('src');
      if (src) {
        return { url: src, type: 'video/mp4' };
      }
      const sourceEl = videoJs.querySelector('source');
      if (sourceEl) {
        return { url: sourceEl.src, type: sourceEl.type || 'video/mp4' };
      }
    }

    // Method 4: Check for iframe embed (some players use iframes)
    const iframe = document.querySelector('iframe[src*="sendvid"], iframe[src*="sibnet"], iframe[src*="player"]');
    if (iframe) {
      return {
        url: iframe.src,
        type: 'embed',
        isEmbed: true
      };
    }

    // Method 5: Search in any data attributes
    const elements = document.querySelectorAll('[data-src], [data-video], [data-url]');
    for (const el of elements) {
      const dataSrc = el.dataset.src || el.dataset.video || el.dataset.url;
      if (dataSrc && (dataSrc.includes('.mp4') || dataSrc.includes('.m3u8'))) {
        return { url: dataSrc, type: 'video/mp4' };
      }
    }

    return null;
  });

  if (streamData && streamData.url) {
    const source = identifySource(streamData.url);
    return {
      name: sourceName !== 'Unknown' ? sourceName : source,
      url: streamData.url,
      quality: 'HD',
      type: streamData.type,
      isEmbed: streamData.isEmbed || false
    };
  }

  return null;
}

/**
 * Identify the source/provider from a URL
 */
function identifySource(url) {
  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('sendvid')) return PLAYER_NAMES.sendvid;
  if (lowerUrl.includes('sibnet')) return PLAYER_NAMES.sibnet;
  if (lowerUrl.includes('vidbm')) return PLAYER_NAMES.vidbm;
  if (lowerUrl.includes('dood')) return PLAYER_NAMES.doodstream;
  return 'Direct';
}

/**
 * Format streams for Stremio addon response
 * @param {Array} streams - Raw stream data
 * @param {string} animeName - Name of the anime
 * @param {number} episode - Episode number
 * @returns {Array} - Stremio-formatted streams
 */
function formatStreamsForStremio(streams, animeName, episode) {
  return streams.map(stream => {
    const title = `${stream.name} - ${stream.quality}`;
    
    if (stream.isEmbed) {
      // For embed URLs, we return as external URL
      return {
        title: `[FRAnime] ${title}`,
        name: stream.name,
        url: stream.url,
        behaviorHints: {
          notWebReady: true,
          proxyHeaders: {
            request: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          }
        }
      };
    }

    // For direct video URLs
    return {
      title: `[FRAnime] ${animeName} - Episode ${episode}`,
      name: `${stream.name} (${stream.quality})`,
      url: stream.url,
      behaviorHints: {
        notWebReady: false,
        proxyHeaders: {
          request: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://franime.fr/'
          }
        }
      }
    };
  });
}

module.exports = {
  scrapeEpisodeList,
  scrapeVideoStreams,
  formatStreamsForStremio,
  PLAYER_NAMES
};
