import { useState, useRef, useEffect } from 'react';
import { useAppStore } from '../store';
import { GoogleGenAI } from '@google/genai';
import { Send, Save, Trash2, Bot, User, Loader2, Key } from 'lucide-react';

export function GeminiChat() {
  const { state, savePrompt, deletePrompt, geminiApiKey, setGeminiApiKey } = useAppStore();
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'model'; text: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [promptName, setPromptName] = useState('');
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [showSettings, setShowSettings] = useState(!geminiApiKey);
  const [tempApiKey, setTempApiKey] = useState(geminiApiKey);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const chatRef = useRef<any>(null);

  const handleSend = async (text: string) => {
    if (!text.trim()) return;

    const userMessage = { role: 'user' as const, text: text.trim() };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const systemInstruction = `You are a helpful GTD (Getting Things Done) assistant.
Here is the user's current GTD state in JSON format:
${JSON.stringify({ lists: state.lists, tasks: state.tasks }, null, 2)}

Answer the user's questions based on this state. Be concise, helpful, and format your response clearly.`;

      if (!chatRef.current) {
        chatRef.current = ai.chats.create({
          model: 'gemini-3-flash-preview',
          config: {
            systemInstruction,
          },
        });
      }

      const response = await chatRef.current.sendMessage({ message: text });

      setMessages((prev) => [
        ...prev,
        { role: 'model', text: response.text || 'Sorry, I could not generate a response.' },
      ]);
    } catch (error) {
      console.error('Gemini API Error:', error);
      setMessages((prev) => [
        ...prev,
        { role: 'model', text: 'An error occurred while communicating with the AI. Please try again.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSavePrompt = () => {
    if (promptName.trim() && input.trim()) {
      savePrompt(promptName.trim(), input.trim());
      setPromptName('');
      setShowSavePrompt(false);
    }
  };

  const handleSaveSettings = () => {
    setGeminiApiKey(tempApiKey.trim());
    setShowSettings(false);
  };

  if (showSettings) {
    return (
      <div className="flex-1 flex flex-col h-full bg-zinc-950 items-center justify-center p-8">
        <div className="max-w-md w-full bg-zinc-900 p-8 rounded-2xl shadow-sm border border-zinc-800">
          <div className="w-12 h-12 bg-indigo-500/20 text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <Key size={24} />
          </div>
          <h2 className="text-2xl font-bold text-zinc-100 mb-2 text-center">API Configuration</h2>
          <p className="text-zinc-400 mb-6 text-sm text-center">
            Enter your Gemini API key to use the AI Assistant. Your key is stored locally in your browser and never sent to our servers.
          </p>
          <div className="mb-6">
            <label className="block text-sm font-medium text-zinc-300 mb-2">Gemini API Key</label>
            <input
              type="password"
              value={tempApiKey}
              onChange={(e) => setTempApiKey(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full px-4 py-3 bg-zinc-950 border border-zinc-800 text-zinc-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex gap-3">
            {geminiApiKey && (
              <button
                onClick={() => setShowSettings(false)}
                className="flex-1 py-3 bg-zinc-800 text-zinc-300 rounded-xl font-medium hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              onClick={handleSaveSettings}
              disabled={!tempApiKey.trim()}
              className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              Save Key
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950">
      <div className="px-4 md:px-8 py-6 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-zinc-100 tracking-tight flex items-center gap-2">
          <Bot className="text-indigo-600" /> AI Assistant
        </h2>
        <button
          onClick={() => setShowSettings(true)}
          className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors flex items-center gap-1"
        >
          <Key size={16} />
          API Key
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-4">
        {messages.length === 0 && (
          <div className="text-center py-12 text-zinc-500">
            <Bot size={48} className="mx-auto text-zinc-700 mb-4" />
            <p className="text-lg font-medium text-zinc-300">How can I help you with your tasks?</p>
            <p className="text-sm mt-1">Ask me about your open tasks, upcoming deadlines, or project status.</p>
          </div>
        )}

        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex gap-4 max-w-3xl ${
              msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                msg.role === 'user' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
            </div>
            <div
              className={`px-4 py-3 rounded-2xl ${
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white rounded-tr-none'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-tl-none shadow-sm'
              }`}
            >
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.text}</div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-4 max-w-3xl mr-auto">
            <div className="w-8 h-8 rounded-full bg-zinc-800 text-zinc-400 flex items-center justify-center flex-shrink-0">
              <Bot size={16} />
            </div>
            <div className="px-4 py-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-zinc-300 rounded-tl-none shadow-sm flex items-center gap-2">
              <Loader2 size={16} className="animate-spin text-zinc-500" />
              <span className="text-sm text-zinc-500">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 bg-zinc-900 border-t border-zinc-800">
        <div className="max-w-4xl mx-auto">
          {state.savedPrompts.length > 0 && (
            <div className="mb-3 flex gap-2 overflow-x-auto pb-2">
              {state.savedPrompts.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-1 bg-zinc-800 px-3 py-1.5 rounded-full text-xs font-medium text-zinc-300 whitespace-nowrap border border-zinc-700"
                >
                  <button
                    onClick={() => setInput(p.prompt)}
                    className="hover:text-indigo-400 transition-colors"
                  >
                    {p.name}
                  </button>
                  <button
                    onClick={() => deletePrompt(p.id)}
                    className="text-zinc-500 hover:text-rose-400 ml-1"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {showSavePrompt && (
            <div className="mb-3 flex items-center gap-2 bg-zinc-800 p-3 rounded-lg border border-zinc-700">
              <input
                type="text"
                value={promptName}
                onChange={(e) => setPromptName(e.target.value)}
                placeholder="Name this prompt..."
                className="flex-1 px-3 py-1.5 text-sm bg-zinc-900 border border-zinc-700 text-zinc-100 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleSavePrompt}
                disabled={!promptName.trim() || !input.trim()}
                className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => setShowSavePrompt(false)}
                className="px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-700 rounded"
              >
                Cancel
              </button>
            </div>
          )}

          <div className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend(input);
                }
              }}
              placeholder="Ask about your tasks..."
              className="w-full pl-4 pr-24 py-3 bg-zinc-800 border border-zinc-700 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-zinc-100 placeholder-zinc-500"
            />
            <div className="absolute right-2 flex items-center gap-1">
              <button
                onClick={() => setShowSavePrompt(!showSavePrompt)}
                disabled={!input.trim()}
                className="p-2 text-zinc-500 hover:text-indigo-400 disabled:opacity-50 transition-colors"
                title="Save Prompt"
              >
                <Save size={18} />
              </button>
              <button
                onClick={() => handleSend(input)}
                disabled={!input.trim() || isLoading}
                className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
