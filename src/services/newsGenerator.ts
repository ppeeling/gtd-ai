import { GoogleGenAI, Type } from '@google/genai';
import { NewsTopic } from '../types';

export async function generateNewsArticle(topic: string, sinceDate: Date, apiKey: string) {
  const ai = new GoogleGenAI({ apiKey });
  const dateStr = sinceDate.toLocaleDateString();
  const prompt = `You are an expert news reporter and analyst.
Write a comprehensive, in-depth news article about the latest developments regarding "${topic}" since ${dateStr}.
Use the Google Search tool to find the most up-to-date and accurate information.
The article should be long and detailed, providing deep insight, analysis, and specific conversation points that the reader can use to discuss the topic with others.
Format the output as follows:
The first line MUST be the title of the article.
The rest of the output should be the body paragraphs of the article, separated by double newlines.
Do not include markdown formatting like ** or # in the title.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      }
    });

    const text = response.text || '';
    const lines = text.split('\n');
    const title = lines[0].replace(/^#+\s*/, '').trim();
    const content = lines.slice(1).join('\n').trim();

    return { title, content };
  } catch (error) {
    console.error("Error generating news:", error);
    throw error;
  }
}

export async function sortTopicsWithAI(topics: NewsTopic[], apiKey: string): Promise<string[]> {
  if (!topics || topics.length === 0) return [];
  
  const ai = new GoogleGenAI({ apiKey });
  
  const topicData = topics.map(t => ({
    id: t.id,
    name: t.name,
    lastGeneratedAt: t.lastGeneratedAt ? new Date(t.lastGeneratedAt).toISOString() : 'Never'
  }));

  const prompt = `You are an AI assistant that determines the current "hotness" and relevance of news topics.
I have a list of news topics. I want you to order them from most currently relevant/active to least relevant.
Take into account:
1. Current real-world events, seasonality (e.g., sports seasons like F1, Olympics, World Cup), and general global interest right now.
2. The 'lastGeneratedAt' date. Topics that haven't been generated recently might be less relevant, or maybe they are overdue. Primarily focus on global real-world relevance.

Here are the topics:
${JSON.stringify(topicData, null, 2)}

Return a JSON array of the topic IDs in the sorted order, from most relevant to least relevant.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.STRING
          }
        }
      }
    });

    const text = response.text || '[]';
    const sortedIds = JSON.parse(text);
    if (Array.isArray(sortedIds)) {
      return sortedIds;
    }
    return topics.map(t => t.id);
  } catch (error) {
    console.error("Error sorting topics:", error);
    return topics.map(t => t.id);
  }
}
