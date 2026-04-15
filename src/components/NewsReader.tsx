import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { generateNewsArticle } from '../services/newsGenerator';
import { Play, Pause, Loader2, Plus, Trash2, Calendar, RefreshCw, ChevronLeft, Settings2, RotateCcw, Search, Clock } from 'lucide-react';

export function NewsReader({ initialTopicId }: { initialTopicId?: string | null }) {
  const { state, upsertNewsTopic, deleteNewsTopic, upsertGeneratedArticle, geminiApiKey } = useAppStore();
  const { newsTopics, generatedArticles } = state;

  const [newTopicName, setNewTopicName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(initialTopicId || null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (initialTopicId) {
      setSelectedTopicId(initialTopicId);
    }
  }, [initialTopicId]);

  // Audio state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const synthRef = useRef<SpeechSynthesis | null>(null);

  useEffect(() => {
    synthRef.current = window.speechSynthesis;
    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
  }, []);

  useEffect(() => {
    if (!localStorage.getItem('gtd_news_seeded')) {
      upsertNewsTopic({ id: 'epl', name: 'English Premier League', lastGeneratedAt: null });
      upsertNewsTopic({ id: 'boro', name: 'Middlesbrough FC', lastGeneratedAt: null });
      localStorage.setItem('gtd_news_seeded', 'true');
    }
  }, [upsertNewsTopic]);

  const handleAddTopic = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicName.trim()) return;
    upsertNewsTopic({
      id: Date.now().toString(),
      name: newTopicName.trim(),
      lastGeneratedAt: null
    });
    setNewTopicName('');
  };

  const handleGenerate = async () => {
    if (!selectedTopicId) return;
    if (!geminiApiKey) {
      alert("Please set your Gemini API key in the settings first.");
      return;
    }

    const topic = newsTopics.find(t => t.id === selectedTopicId);
    if (!topic) return;

    setIsGenerating(true);

    try {
      const sinceDate = topic.lastGeneratedAt ? new Date(topic.lastGeneratedAt) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const { title, content, nextScheduledDate } = await generateNewsArticle(topic.name, sinceDate, geminiApiKey);

      const now = Date.now();
      await upsertGeneratedArticle({
        id: selectedTopicId,
        topicId: selectedTopicId,
        title,
        content,
        generatedAt: now
      });

      await upsertNewsTopic({
        ...topic,
        lastGeneratedAt: now,
        scheduledDate: new Date(nextScheduledDate).getTime()
      });
    } catch (error) {
      console.error(error);
      alert("Failed to generate article. Check console for details.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleScheduledDateChange = (dateStr: string) => {
    if (!selectedTopicId) return;
    const topic = newsTopics.find(t => t.id === selectedTopicId);
    if (!topic) return;
    const newDate = new Date(dateStr);
    if (!isNaN(newDate.getTime())) {
      upsertNewsTopic({
        ...topic,
        scheduledDate: newDate.getTime()
      });
    }
  };

  const playArticle = (articleId: string) => {
    if (!synthRef.current) return;
    synthRef.current.cancel();

    const article = generatedArticles.find(a => a.id === articleId);
    if (!article) return;

    setIsPlaying(true);
    setIsPaused(false);
    const utterance = new SpeechSynthesisUtterance(`${article.title}. ${article.content}`);
    utterance.rate = playbackRate;

    utterance.onend = () => { setIsPlaying(false); setIsPaused(false); };
    utterance.onerror = () => { setIsPlaying(false); setIsPaused(false); };

    synthRef.current.speak(utterance);
  };

  const togglePlayPause = (articleId: string) => {
    if (!synthRef.current) return;

    if (isPlaying) {
      synthRef.current.pause();
      setIsPlaying(false);
      setIsPaused(true);
    } else if (isPaused) {
      synthRef.current.resume();
      setIsPlaying(true);
      setIsPaused(false);
    } else {
      playArticle(articleId);
    }
  };

  const restartAudio = (articleId: string) => {
    if (!synthRef.current) return;
    synthRef.current.cancel();
    setIsPlaying(false);
    setIsPaused(false);
    setTimeout(() => playArticle(articleId), 50);
  };

  const stopAudio = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
      setIsPlaying(false);
      setIsPaused(false);
    }
  };

  const handleRateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setPlaybackRate(parseFloat(e.target.value));
    if (isPlaying || isPaused) {
      stopAudio();
    }
  };

  if (selectedTopicId) {
    const topic = newsTopics.find(t => t.id === selectedTopicId);
    const article = generatedArticles.find(a => a.topicId === selectedTopicId);

    return (
      <div className="flex flex-col h-full bg-zinc-950 overflow-hidden w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/50">
          <div className="flex items-center gap-4">
            <button
              onClick={() => {
                stopAudio();
                setSelectedTopicId(null);
              }}
              className="flex items-center gap-1 text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              <ChevronLeft size={20} />
              <span>Back</span>
            </button>
            <h2 className="text-xl font-bold text-zinc-100">{topic?.name}</h2>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 border-b border-zinc-800 bg-zinc-900/30">
          <div className="flex items-center gap-3">
            <label className="text-sm text-zinc-400 flex items-center gap-2">
              <Calendar size={16} />
              News Since:
            </label>
            <input
              type="date"
              value={topic?.lastGeneratedAt ? new Date(topic.lastGeneratedAt).toISOString().split('T')[0] : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
              onChange={(e) => {
                const newDate = new Date(e.target.value);
                if (!isNaN(newDate.getTime())) {
                  upsertNewsTopic({ ...topic!, lastGeneratedAt: newDate.getTime() });
                }
              }}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-200 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm text-zinc-400 flex items-center gap-2">
              <Clock size={16} />
              Next Scheduled:
            </label>
            <input
              type="date"
              value={topic?.scheduledDate ? new Date(topic.scheduledDate).toISOString().split('T')[0] : ''}
              onChange={(e) => handleScheduledDateChange(e.target.value)}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-zinc-200 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />}
            Generate News
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 md:p-8">
          {isGenerating ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500">
              <Loader2 size={48} className="animate-spin mb-4 text-indigo-500" />
              <p className="text-lg">Researching and writing in-depth article...</p>
              <p className="text-sm mt-2 opacity-70">This may take a minute.</p>
            </div>
          ) : article ? (
            <div className="max-w-4xl mx-auto">
              <div className="mb-8 pb-8 border-b border-zinc-800">
                <h1 className="text-3xl md:text-4xl font-bold text-zinc-100 mb-6 leading-tight">{article.title}</h1>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <span className="text-sm text-zinc-500">
                    Generated: {new Date(article.generatedAt).toLocaleString()}
                  </span>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-zinc-800/50 rounded-lg px-3 py-1.5 border border-zinc-700">
                      <Settings2 size={16} className="text-zinc-400" />
                      <select
                        value={playbackRate}
                        onChange={handleRateChange}
                        className="bg-transparent text-sm text-zinc-300 focus:outline-none cursor-pointer"
                      >
                        <option value={0.75}>0.75x</option>
                        <option value={1}>1x</option>
                        <option value={1.25}>1.25x</option>
                        <option value={1.5}>1.5x</option>
                        <option value={2}>2x</option>
                      </select>
                    </div>
                    {(isPlaying || isPaused) && (
                      <button
                        onClick={() => restartAudio(article.id)}
                        className="flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-colors bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                      >
                        <RotateCcw size={18} /> Restart
                      </button>
                    )}
                    <button
                      onClick={() => togglePlayPause(article.id)}
                      className={`flex items-center gap-2 px-5 py-2 rounded-full font-medium transition-colors ${
                        isPlaying 
                          ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/50' 
                          : 'bg-indigo-600 text-white hover:bg-indigo-700'
                      }`}
                    >
                      {isPlaying ? <><Pause size={18} /> Pause</> : <><Play size={18} /> {isPaused ? 'Resume' : 'Listen'}</>}
                    </button>
                  </div>
                </div>
              </div>
              <div className="prose prose-invert prose-lg max-w-none">
                {article.content.split('\n\n').map((p, i) => (
                  <p key={i} className="mb-6 text-zinc-300 leading-relaxed">{p}</p>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500">
              <p className="text-lg">No article generated yet.</p>
              <p className="text-sm mt-2">Click "Generate News" to create an in-depth article on this topic.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const filteredTopics = newsTopics.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="flex flex-col h-full bg-zinc-950 p-6 md:p-8 overflow-y-auto w-full">
      <div className="max-w-5xl mx-auto w-full">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-zinc-100">AI News Topics</h1>
            </div>
            <p className="text-zinc-400 mt-2">Select a topic to read or generate in-depth news articles.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search topics..."
                className="w-full sm:w-48 bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-4 py-2.5 text-zinc-100 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <form onSubmit={handleAddTopic} className="flex gap-2">
              <input
                type="text"
                value={newTopicName}
                onChange={e => setNewTopicName(e.target.value)}
                placeholder="Add a new topic..."
                className="flex-1 sm:w-48 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-zinc-100 focus:outline-none focus:border-indigo-500"
              />
              <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl transition-colors font-medium">
                Add
              </button>
            </form>
          </div>
        </div>

        {!geminiApiKey && (
          <div className="bg-amber-500/10 border border-amber-500/50 text-amber-200 p-4 rounded-xl mb-8">
            <p className="font-medium">Gemini API Key Required</p>
            <p className="text-sm opacity-80 mt-1">Please set your Gemini API key in the settings to generate news articles.</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTopics.map(topic => {
            const article = generatedArticles.find(a => a.topicId === topic.id);
            return (
              <div
                key={topic.id}
                onClick={() => setSelectedTopicId(topic.id)}
                className="bg-zinc-900/50 border border-zinc-800 hover:border-indigo-500/50 rounded-2xl p-5 cursor-pointer transition-all hover:bg-zinc-900 group"
              >
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-xl font-semibold text-zinc-100 group-hover:text-indigo-400 transition-colors">{topic.name}</h3>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteNewsTopic(topic.id);
                    }}
                    className="text-zinc-600 hover:text-rose-400 p-1 rounded-lg hover:bg-zinc-800 transition-colors"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center text-sm text-zinc-400">
                    <Calendar size={14} className="mr-2" />
                    Last Generated: {topic.lastGeneratedAt ? new Date(topic.lastGeneratedAt).toLocaleDateString() : 'Never'}
                  </div>
                  {topic.scheduledDate && (
                    <div className="flex items-center text-sm text-indigo-400">
                      <Clock size={14} className="mr-2" />
                      Scheduled: {new Date(topic.scheduledDate).toLocaleDateString()}
                    </div>
                  )}
                  
                  {article ? (
                    <div className="text-sm text-zinc-500 line-clamp-2 mt-2 italic">
                      "{article.title}"
                    </div>
                  ) : (
                    <div className="text-sm text-amber-500/70 mt-2">
                      No article generated yet
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
