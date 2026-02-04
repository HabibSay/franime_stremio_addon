// tests/scrapeStreams.test.js
// Tests unitaires pour scrapeStreams

const {
  scrapeEpisodeList,
  scrapeVideoStreams,
  formatStreamsForStremio,
  PLAYER_NAMES
} = require('../utils/scrapeStreams');

// Mock de puppeteer
jest.mock('puppeteer');
const puppeteer = require('puppeteer');

describe('scrapeStreams', () => {
  let mockBrowser;
  let mockPage;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock page object
    mockPage = {
      setUserAgent: jest.fn().mockResolvedValue(undefined),
      setRequestInterception: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      goto: jest.fn().mockResolvedValue(undefined),
      waitForSelector: jest.fn().mockResolvedValue(undefined),
      evaluate: jest.fn(),
      $: jest.fn(),
      $$: jest.fn().mockResolvedValue([]),
      close: jest.fn().mockResolvedValue(undefined)
    };
    
    mockBrowser = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn().mockResolvedValue(undefined)
    };
    
    puppeteer.launch = jest.fn().mockResolvedValue(mockBrowser);
  });

  describe('PLAYER_NAMES', () => {
    test('should have all expected player names', () => {
      expect(PLAYER_NAMES.sendvid).toBe('Sendvid');
      expect(PLAYER_NAMES.sibnet).toBe('Sibnet');
      expect(PLAYER_NAMES.vidbm).toBe('VidBM');
      expect(PLAYER_NAMES.doodstream).toBe('DoodStream');
    });
  });

  describe('scrapeEpisodeList', () => {
    test('should launch browser with correct options', async () => {
      mockPage.evaluate.mockResolvedValue([]);
      mockPage.waitForSelector.mockResolvedValue(null);
      
      await scrapeEpisodeList('test-anime', '12345', 1, 'vo');
      
      expect(puppeteer.launch).toHaveBeenCalledWith({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    });

    test('should set correct user agent', async () => {
      mockPage.evaluate.mockResolvedValue([]);
      mockPage.waitForSelector.mockResolvedValue(null);
      
      await scrapeEpisodeList('test-anime', '12345', 1, 'vo');
      
      expect(mockPage.setUserAgent).toHaveBeenCalledWith(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      );
    });

    test('should navigate to correct URL', async () => {
      mockPage.evaluate.mockResolvedValue([]);
      mockPage.waitForSelector.mockResolvedValue(null);
      
      await scrapeEpisodeList('test-anime', '12345', 1, 'vo');
      
      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://franime.fr/anime/test-anime?s=1&ep=&lang=vo&anime_id=12345',
        { waitUntil: 'networkidle2', timeout: 30000 }
      );
    });

    test('should return episodes from page evaluation', async () => {
      const mockEpisodes = [
        { episode: 1 },
        { episode: 2 },
        { episode: 3 }
      ];
      mockPage.evaluate.mockResolvedValue(mockEpisodes);
      mockPage.waitForSelector.mockResolvedValue(null);
      
      const result = await scrapeEpisodeList('test-anime', '12345', 1, 'vo');
      
      expect(result).toEqual(mockEpisodes);
    });

    test('should close browser after scraping', async () => {
      mockPage.evaluate.mockResolvedValue([]);
      mockPage.waitForSelector.mockResolvedValue(null);
      
      await scrapeEpisodeList('test-anime', '12345', 1, 'vo');
      
      expect(mockBrowser.close).toHaveBeenCalled();
    });

    test('should return empty array on error', async () => {
      mockPage.goto.mockRejectedValue(new Error('Navigation failed'));
      
      const result = await scrapeEpisodeList('test-anime', '12345', 1, 'vo');
      
      expect(result).toEqual([]);
      expect(mockBrowser.close).toHaveBeenCalled();
    });

    test('should handle different seasons', async () => {
      mockPage.evaluate.mockResolvedValue([]);
      mockPage.waitForSelector.mockResolvedValue(null);
      
      await scrapeEpisodeList('test-anime', '12345', 2, 'vo');
      
      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://franime.fr/anime/test-anime?s=2&ep=&lang=vo&anime_id=12345',
        { waitUntil: 'networkidle2', timeout: 30000 }
      );
    });

    test('should handle different languages', async () => {
      mockPage.evaluate.mockResolvedValue([]);
      mockPage.waitForSelector.mockResolvedValue(null);
      
      await scrapeEpisodeList('test-anime', '12345', 1, 'vf');
      
      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://franime.fr/anime/test-anime?s=1&ep=&lang=vf&anime_id=12345',
        { waitUntil: 'networkidle2', timeout: 30000 }
      );
    });
  });

  describe('scrapeVideoStreams', () => {
    test('should launch browser with correct options', async () => {
      mockPage.evaluate.mockResolvedValue([]);
      mockPage.waitForSelector.mockResolvedValue(null);
      
      await scrapeVideoStreams('test-anime', '12345', 1, 1, 'vo');
      
      expect(puppeteer.launch).toHaveBeenCalledWith({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    });

    test('should enable request interception', async () => {
      mockPage.evaluate.mockResolvedValue([]);
      mockPage.waitForSelector.mockResolvedValue(null);
      
      await scrapeVideoStreams('test-anime', '12345', 1, 1, 'vo');
      
      expect(mockPage.setRequestInterception).toHaveBeenCalledWith(true);
    });

    test('should register request listener for video URLs', async () => {
      mockPage.evaluate.mockResolvedValue([]);
      mockPage.waitForSelector.mockResolvedValue(null);
      
      await scrapeVideoStreams('test-anime', '12345', 1, 1, 'vo');
      
      expect(mockPage.on).toHaveBeenCalledWith('request', expect.any(Function));
    });

    test('should navigate to correct episode URL', async () => {
      mockPage.evaluate.mockResolvedValue([]);
      mockPage.waitForSelector.mockResolvedValue(null);
      
      await scrapeVideoStreams('test-anime', '12345', 5, 1, 'vo');
      
      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://franime.fr/anime/test-anime?s=1&ep=5&lang=vo&anime_id=12345',
        { waitUntil: 'networkidle2', timeout: 30000 }
      );
    });

    test('should close browser after scraping', async () => {
      mockPage.evaluate.mockResolvedValue([]);
      mockPage.waitForSelector.mockResolvedValue(null);
      
      await scrapeVideoStreams('test-anime', '12345', 1, 1, 'vo');
      
      expect(mockBrowser.close).toHaveBeenCalled();
    });

    test('should return empty array on error', async () => {
      mockPage.goto.mockRejectedValue(new Error('Navigation failed'));
      
      const result = await scrapeVideoStreams('test-anime', '12345', 1, 1, 'vo');
      
      expect(result).toEqual([]);
      expect(mockBrowser.close).toHaveBeenCalled();
    });
  });

  describe('formatStreamsForStremio', () => {
    test('should format direct video stream correctly', () => {
      const streams = [{
        name: 'Sendvid',
        url: 'https://videos2.sendvid.com/test.mp4',
        quality: 'HD',
        isEmbed: false
      }];
      
      const result = formatStreamsForStremio(streams, 'Test Anime', 1);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        title: '[FRAnime] Test Anime - Episode 1',
        name: 'Sendvid (HD)',
        url: 'https://videos2.sendvid.com/test.mp4'
      });
      expect(result[0].behaviorHints.notWebReady).toBe(false);
      expect(result[0].behaviorHints.proxyHeaders.request['Referer']).toBe('https://franime.fr/');
    });

    test('should format embed stream correctly', () => {
      const streams = [{
        name: 'Sibnet',
        url: 'https://sibnet.com/player/embed/123',
        quality: 'HD',
        isEmbed: true
      }];
      
      const result = formatStreamsForStremio(streams, 'Test Anime', 2);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        title: '[FRAnime] Sibnet - HD',
        name: 'Sibnet',
        url: 'https://sibnet.com/player/embed/123'
      });
      expect(result[0].behaviorHints.notWebReady).toBe(true);
    });

    test('should handle multiple streams', () => {
      const streams = [
        { name: 'Sendvid', url: 'https://sendvid.com/test1.mp4', quality: 'HD', isEmbed: false },
        { name: 'Sibnet', url: 'https://sibnet.com/embed/123', quality: '720p', isEmbed: true },
        { name: 'Direct', url: 'https://example.com/video.mp4', quality: '1080p', isEmbed: false }
      ];
      
      const result = formatStreamsForStremio(streams, 'Test Anime', 3);
      
      expect(result).toHaveLength(3);
    });

    test('should handle empty streams array', () => {
      const result = formatStreamsForStremio([], 'Test Anime', 1);
      
      expect(result).toEqual([]);
    });

    test('should include proper headers for direct streams', () => {
      const streams = [{
        name: 'Sendvid',
        url: 'https://sendvid.com/video.mp4',
        quality: 'HD',
        isEmbed: false
      }];
      
      const result = formatStreamsForStremio(streams, 'Test Anime', 1);
      
      expect(result[0].behaviorHints.proxyHeaders.request).toHaveProperty('User-Agent');
      expect(result[0].behaviorHints.proxyHeaders.request).toHaveProperty('Referer');
    });
  });

  describe('Integration scenarios', () => {
    test('should handle complete scraping flow', async () => {
      // Simulate episode list
      mockPage.evaluate.mockResolvedValueOnce([
        { episode: 1 },
        { episode: 2 }
      ]);
      mockPage.waitForSelector.mockResolvedValue(null);
      
      const episodes = await scrapeEpisodeList('test-anime', '12345', 1, 'vo');
      expect(episodes).toHaveLength(2);
      
      // Simulate video stream scraping
      mockPage.evaluate.mockResolvedValueOnce([]); // Player options
      mockPage.evaluate.mockResolvedValueOnce({
        url: 'https://sendvid.com/video.mp4',
        type: 'video/mp4'
      });
      
      // Note: Second call would require new browser launch
      puppeteer.launch.mockResolvedValue(mockBrowser);
      
      const streams = await scrapeVideoStreams('test-anime', '12345', 1, 1, 'vo');
      expect(Array.isArray(streams)).toBe(true);
    });
  });
});
