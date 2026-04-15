import { RssArticle } from '../types';
import { GoogleGenAI } from '@google/genai';

const BBC_FEEDS = [
  { id: 'top', title: 'Top Stories', url: 'http://feeds.bbci.co.uk/news/rss.xml' },
  { id: 'world', title: 'World', url: 'http://feeds.bbci.co.uk/news/world/rss.xml' },
  { id: 'uk', title: 'UK', url: 'http://feeds.bbci.co.uk/news/uk/rss.xml' },
  { id: 'business', title: 'Business', url: 'http://feeds.bbci.co.uk/news/business/rss.xml' },
  { id: 'tech', title: 'Technology', url: 'http://feeds.bbci.co.uk/news/technology/rss.xml' },
  { id: 'science', title: 'Science', url: 'http://feeds.bbci.co.uk/news/science_and_environment/rss.xml' },
  { id: 'entertainment', title: 'Entertainment', url: 'http://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml' },
  { id: 'sport', title: 'Sport', url: 'http://feeds.bbci.co.uk/sport/rss.xml' },
  { id: 'football', title: 'Football', url: 'http://feeds.bbci.co.uk/sport/football/rss.xml' },
];

const PROXIES = [
  'https://api.allorigins.win/get?url=',
  'https://api.codetabs.com/v1/proxy?quest=',
];

async function fetchWithProxy(url: string): Promise<string> {
  let lastError;
  for (const proxy of PROXIES) {
    try {
      const response = await fetch(`${proxy}${encodeURIComponent(url)}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      // allorigins returns JSON, codetabs returns raw
      if (proxy.includes('allorigins')) {
        const data = await response.json();
        return data.contents;
      } else {
        return await response.text();
      }
    } catch (e) {
      lastError = e;
      console.warn(`Proxy ${proxy} failed, trying next...`);
    }
  }
  throw lastError;
}

export async function fetchAllFeeds(): Promise<RssArticle[]> {
  const articleMap = new Map<string, RssArticle>();
  
  await Promise.all(BBC_FEEDS.map(async (feed) => {
    try {
      const contents = await fetchWithProxy(feed.url);
      
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(contents, 'text/xml');
      const items = xmlDoc.querySelectorAll('item');
      
      items.forEach(item => {
        const title = item.querySelector('title')?.textContent || '';
        const link = item.querySelector('link')?.textContent || '';
        const description = item.querySelector('description')?.textContent || '';
        const pubDate = item.querySelector('pubDate')?.textContent || '';
        const guid = item.querySelector('guid')?.textContent || link;
        const pubTimestamp = new Date(pubDate).getTime() || 0;
        
        if (articleMap.has(guid)) {
          const existing = articleMap.get(guid)!;
          if (!existing.feedTitles?.includes(feed.title)) {
            existing.feedTitles = [...(existing.feedTitles || []), feed.title];
          }
        } else {
          articleMap.set(guid, {
            id: guid,
            title,
            link,
            description,
            pubDate,
            pubTimestamp,
            feedTitles: [feed.title],
          });
        }
      });
    } catch (error) {
      console.error(`Failed to fetch feed ${feed.title}:`, error);
    }
  }));
  
  // Sort by pubTimestamp descending
  return Array.from(articleMap.values()).sort((a, b) => (b.pubTimestamp || 0) - (a.pubTimestamp || 0));
}

export async function fetchArticleContent(url: string): Promise<string> {
  try {
    const contents = await fetchWithProxy(url);
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(contents, 'text/html');
    
    // BBC articles usually have content in <article> or specific text blocks
    // This is a basic heuristic to extract paragraphs from the main article body
    const article = doc.querySelector('article');
    if (article) {
      const paragraphs = Array.from(article.querySelectorAll('p[data-component="text-block"]'));
      if (paragraphs.length > 0) {
        return paragraphs.map(p => p.textContent).join('\n\n');
      }
      // Fallback for older/different BBC layouts
      const allParagraphs = Array.from(article.querySelectorAll('p'));
      return allParagraphs.map(p => p.textContent).join('\n\n');
    }
    
    // Generic fallback
    const allParagraphs = Array.from(doc.querySelectorAll('p'));
    return allParagraphs.map(p => p.textContent).join('\n\n');
  } catch (error) {
    console.error('Failed to fetch article content:', error);
    return 'Failed to load full article content.';
  }
}

export async function extractTopics(text: string, apiKey: string): Promise<string[]> {
  if (!apiKey) return [];
  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Extract 3 to 5 broad topics or categories from the following text. Return ONLY a comma-separated list of topics, nothing else. Text: ${text}`,
    });
    
    const topicsText = response.text || '';
    return topicsText.split(',').map(t => t.trim()).filter(t => t.length > 0);
  } catch (error) {
    console.error('Failed to extract topics:', error);
    return [];
  }
}

export function scoreArticle(article: RssArticle, followedTopics: string[], likedArticles: string[], dislikedArticles: string[]): number {
  let score = 0;
  
  // Boost if topics match followed topics
  if (article.topics && followedTopics.length > 0) {
    const matchCount = article.topics.filter(t => 
      followedTopics.some(ft => ft.toLowerCase() === t.toLowerCase())
    ).length;
    score += matchCount * 5;
  }
  
  // Penalize if disliked
  if (dislikedArticles.includes(article.id)) {
    score -= 100;
  }
  
  // Boost if liked (though usually we don't need to recommend already liked ones, but maybe keep them high)
  if (likedArticles.includes(article.id)) {
    score += 10;
  }
  
  return score;
}
