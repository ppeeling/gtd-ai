import { GoogleGenAI } from '@google/genai';

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
