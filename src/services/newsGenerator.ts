import { GoogleGenAI } from '@google/genai';
import { NewsTopic } from '../types';

export async function generateNewsArticle(topic: string, sinceDate: Date, apiKey: string) {
  const ai = new GoogleGenAI({ apiKey });
  const dateStr = sinceDate.toLocaleDateString();
  const prompt = `You are an expert news reporter and analyst.
Write a comprehensive, in-depth news article about the latest developments regarding "${topic}" since ${dateStr}.
Use the Google Search tool to find the most up-to-date and accurate information.
The article should be long and detailed, providing deep insight, analysis, and specific conversation points that the reader can use to discuss the topic with others.

Also, suggest a next date for scheduled generation that should be no earlier than a week from today. The scheduled generation should take into account known future events on that topic. For example, an article generated on Formula 1 would be best scheduled after the next race weekend. Provide a rationale for this scheduled date.

Return ONLY a valid JSON object (without markdown formatting or code blocks) with the following fields:
- "title": The title of the article.
- "content": The body paragraphs of the article, separated by double newlines.
- "nextScheduledDate": The suggested next scheduled generation date in ISO format (YYYY-MM-DD).
- "rationale": The rationale for the suggested next scheduled date.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-pro',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    let text = response.text || '{}';
    
    // Clean up potential markdown code blocks
    text = text.trim();
    if (text.startsWith('\`\`\`json')) {
      text = text.substring(7);
    } else if (text.startsWith('\`\`\`')) {
      text = text.substring(3);
    }
    if (text.endsWith('\`\`\`')) {
      text = text.substring(0, text.length - 3);
    }
    text = text.trim();

    let parsed: any = {};
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      console.error("Failed to parse JSON from AI response:", text);
      // Fallback if JSON parsing completely fails
      // Try to find the first { and last } as a fallback
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        try {
          parsed = JSON.parse(text.substring(firstBrace, lastBrace + 1));
        } catch (e2) {
          parsed = {
            title: "Generated Article",
            content: text, 
            nextScheduledDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
            rationale: "Could not parse rationale from AI response."
          };
        }
      } else {
        parsed = {
          title: "Generated Article",
          content: text, 
          nextScheduledDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          rationale: "Could not parse rationale from AI response."
        };
      }
    }
    
    const title = parsed.title || 'Untitled';
    const content = parsed.content || '';
    const nextScheduledDate = parsed.nextScheduledDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const rationale = parsed.rationale || 'Scheduled for a week from now.';

    // Append rationale to the conclusion of the article
    const finalContent = content + '\n\n**Next Generation Schedule:**\n' + rationale;

    return { title, content: finalContent, nextScheduledDate };
  } catch (error) {
    console.error("Error generating news:", error);
    throw error;
  }
}
