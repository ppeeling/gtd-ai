import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { generateNewsArticle, generateAudio } from '../services/newsGenerator';
import { Play, Pause, Loader2, Plus, Trash2, Calendar, RefreshCw, ChevronLeft, Settings2, RotateCcw, Search, Clock, ArrowDownUp, Volume2, Edit2, Check } from 'lucide-react';

function createWavBlob(pcmBytes: Uint8Array, sampleRate: number = 24000): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmBytes.length;
  const chunkSize = 36 + dataSize;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  view.setUint32(0, 1380533830, false); // "RIFF"
  view.setUint32(4, chunkSize, true);
  view.setUint32(8, 1463899717, false); // "WAVE"
  view.setUint32(12, 1718449184, false); // "fmt "
  view.setUint32(16, 16, true);          // Subchunk1Size
  view.setUint16(20, 1, true);           // AudioFormat (PCM)
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, sampleRate, true);  // SampleRate
  view.setUint32(28, byteRate, true);    // ByteRate
  view.setUint16(32, blockAlign, true);  // BlockAlign
  view.setUint16(34, bitsPerSample, true); // BitsPerSample
  view.setUint32(36, 1684108385, false); // "data"
  view.setUint32(40, dataSize, true);

  new Uint8Array(buffer, 44).set(pcmBytes);

  return new Blob([view], { type: 'audio/wav' });
}

export function NewsReader({ initialTopicId }: { initialTopicId?: string | null }) {
  const { state, upsertNewsTopic, deleteNewsTopic, upsertGeneratedArticle, geminiApiKey } = useAppStore();
  const { newsTopics, generatedArticles } = state;

  const [newTopicName, setNewTopicName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<string>(() => localStorage.getItem('gtd_news_sort') || 'name_asc');
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(initialTopicId || null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (initialTopicId) {
      setSelectedTopicId(initialTopicId);
    }
  }, [initialTopicId]);

  useEffect(() => {
    localStorage.setItem('gtd_news_sort', sortBy);
  }, [sortBy]);

  // Audio state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [ttsEngine, setTtsEngine] = useState<'browser' | 'gemini'>(() => (localStorage.getItem('gtd_news_tts_engine') as any) || 'browser');
  const [isPreparingAudio, setIsPreparingAudio] = useState(false);

  const [isEditingName, setIsEditingName] = useState(false);
  const [editingNameValue, setEditingNameValue] = useState('');

  const synthRef = useRef<SpeechSynthesis | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    localStorage.setItem('gtd_news_tts_engine', ttsEngine);
    if (isPlaying || isPaused) {
      stopAudio(); // Stop if user switches engine while playing
    }
  }, [ttsEngine]);

  useEffect(() => {
    synthRef.current = window.speechSynthesis;
    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
      if (audioElRef.current) {
        audioElRef.current.pause();
      }
      Object.values(audioUrlsRef.current).forEach(url => URL.revokeObjectURL(url));
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
      const { title, content, nextScheduledDate, sources } = await generateNewsArticle(topic.name, sinceDate, geminiApiKey, topic.dislikedSources || []);

      const now = Date.now();
      await upsertGeneratedArticle({
        id: selectedTopicId,
        topicId: selectedTopicId,
        title,
        content,
        generatedAt: now,
        sources
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

  const handleSaveName = () => {
    if (!selectedTopicId) return;
    const topic = newsTopics.find(t => t.id === selectedTopicId);
    if (!topic) return;

    if (editingNameValue.trim() && editingNameValue.trim() !== topic.name) {
      upsertNewsTopic({ ...topic, name: editingNameValue.trim() });
    }
    setIsEditingName(false);
  };

  const playBrowserTTS = (articleId: string) => {
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

  const playGeminiTTS = async (articleId: string) => {
    const article = generatedArticles.find(a => a.id === articleId);
    if (!article || !geminiApiKey) {
      if (!geminiApiKey) alert("Gemini API key is required for High Quality TTS");
      return;
    }

    setIsPreparingAudio(true);

    try {
      let audioUrl = audioUrlsRef.current[articleId];

      if (!audioUrl) {
        // Clean markdown out of the text before TTS
        const textToRead = `${article.title}. ${article.content.replace(/[*#]/g, '')}`; 
        const base64Audio = await generateAudio(textToRead, geminiApiKey);
        if (!base64Audio) throw new Error("Failed to generate audio via Gemini");
        
        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        const blob = createWavBlob(bytes, 24000);
        audioUrl = URL.createObjectURL(blob);
        audioUrlsRef.current[articleId] = audioUrl;
      }

      if (audioElRef.current) {
        audioElRef.current.pause();
      }

      const audio = new Audio(audioUrl);
      audio.playbackRate = playbackRate;
      audio.preservesPitch = true;
      
      audio.onended = () => {
        setIsPlaying(false);
        setIsPaused(false);
      };
      
      audio.play().catch(e => console.error("Audio playback failed", e));
      audioElRef.current = audio;
      
      setIsPlaying(true);
      setIsPaused(false);

    } catch (error) {
      console.error(error);
      alert("Error playing high-fidelity TTS audio. Falling back to browser TTS.");
      setTtsEngine('browser');
      playBrowserTTS(articleId);
    } finally {
      setIsPreparingAudio(false);
    }
  };

  const playArticle = (articleId: string) => {
    if (ttsEngine === 'gemini') {
      playGeminiTTS(articleId);
    } else {
      playBrowserTTS(articleId);
    }
  };

  const togglePlayPause = (articleId: string) => {
    if (isPlaying) {
      if (ttsEngine === 'browser' && synthRef.current) synthRef.current.pause();
      else if (ttsEngine === 'gemini' && audioElRef.current) audioElRef.current.pause();
      setIsPlaying(false);
      setIsPaused(true);
    } else if (isPaused) {
      if (ttsEngine === 'browser' && synthRef.current) synthRef.current.resume();
      else if (ttsEngine === 'gemini' && audioElRef.current) audioElRef.current.play();
      setIsPlaying(true);
      setIsPaused(false);
    } else {
      playArticle(articleId);
    }
  };

  const restartAudio = (articleId: string) => {
    stopAudio();
    setTimeout(() => playArticle(articleId), 50);
  };

  const stopAudio = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
    }
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.currentTime = 0;
    }
    setIsPlaying(false);
    setIsPaused(false);
  };

  const handleRateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const rate = parseFloat(e.target.value);
    setPlaybackRate(rate);

    if (ttsEngine === 'gemini' && audioElRef.current) {
      audioElRef.current.playbackRate = rate;
    } else if (ttsEngine === 'browser') {
      if (isPlaying || isPaused) {
        stopAudio();
      }
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
                setIsEditingName(false);
              }}
              className="flex items-center gap-1 text-zinc-400 hover:text-zinc-100 transition-colors"
            >
              <ChevronLeft size={20} />
              <span>Back</span>
            </button>
            {isEditingName ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  type="text"
                  value={editingNameValue}
                  onChange={e => setEditingNameValue(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSaveName();
                    if (e.key === 'Escape') setIsEditingName(false);
                  }}
                  className="bg-zinc-800 border-zinc-700 text-zinc-100 rounded px-2 py-1 focus:outline-none"
                />
                <button onClick={handleSaveName} className="text-indigo-400 hover:text-indigo-300">
                  <Check size={20} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 group">
                <h2 className="text-xl font-bold text-zinc-100">{topic?.name}</h2>
                <button 
                  onClick={() => { setEditingNameValue(topic?.name || ''); setIsEditingName(true); }}
                  className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-zinc-300 transition-opacity"
                >
                  <Edit2 size={16} />
                </button>
              </div>
            )}
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
                      <Volume2 size={16} className="text-zinc-400" />
                      <select
                        value={ttsEngine}
                        onChange={(e) => setTtsEngine(e.target.value as 'browser' | 'gemini')}
                        className="bg-transparent text-sm text-zinc-300 focus:outline-none cursor-pointer"
                      >
                        <option value="browser" className="bg-zinc-800">Browser Voice</option>
                        <option value="gemini" className="bg-zinc-800">Gemini High Quality</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2 bg-zinc-800/50 rounded-lg px-3 py-1.5 border border-zinc-700">
                      <Settings2 size={16} className="text-zinc-400" />
                      <select
                        value={playbackRate}
                        onChange={handleRateChange}
                        className="bg-transparent text-sm text-zinc-300 focus:outline-none cursor-pointer"
                      >
                        <option value={0.75} className="bg-zinc-800">0.75x</option>
                        <option value={1} className="bg-zinc-800">1x</option>
                        <option value={1.25} className="bg-zinc-800">1.25x</option>
                        <option value={1.5} className="bg-zinc-800">1.5x</option>
                        <option value={2} className="bg-zinc-800">2x</option>
                      </select>
                    </div>
                    {(isPlaying || isPaused) && (
                      <button
                        onClick={() => restartAudio(article.id)}
                        className="flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-colors bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                        disabled={isPreparingAudio}
                      >
                        <RotateCcw size={18} /> Restart
                      </button>
                    )}
                    <button
                      onClick={() => togglePlayPause(article.id)}
                      disabled={isPreparingAudio}
                      className={`flex items-center gap-2 px-5 py-2 rounded-full font-medium transition-colors ${
                        isPlaying 
                          ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 border border-amber-500/50' 
                          : 'bg-indigo-600 text-white hover:bg-indigo-700'
                      } disabled:opacity-50`}
                    >
                      {isPreparingAudio ? (
                        <><Loader2 size={18} className="animate-spin" /> Preparing...</>
                      ) : isPlaying ? (
                        <><Pause size={18} /> Pause</>
                      ) : (
                        <><Play size={18} /> {isPaused ? 'Resume' : 'Listen'}</>
                      )}
                    </button>
                  </div>
                </div>
              </div>
              <div className="prose prose-invert prose-lg max-w-none">
                {article.content.split('\n\n').map((p, i) => (
                  <p key={i} className="mb-6 text-zinc-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: p.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">$1</a>') }} />
                ))}
              </div>
              
              {article.sources && article.sources.length > 0 && (
                <div className="mt-12 pt-8 border-t border-zinc-800">
                  <h3 className="text-xl font-bold text-zinc-100 mb-4">Sources Used</h3>
                  <ul className="space-y-3">
                    {article.sources.map((source, i) => (
                      <li key={i} className="flex flex-wrap items-center gap-3 text-sm">
                        <a 
                          href={source.url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
                        >
                          {source.name}
                        </a>
                        <span className="text-zinc-600">({source.domain})</span>
                        {!topic.dislikedSources?.includes(source.domain) && (
                          <button
                            onClick={() => {
                              const currentDisliked = topic.dislikedSources || [];
                              if (!currentDisliked.includes(source.domain)) {
                                upsertNewsTopic({
                                  ...topic,
                                  dislikedSources: [...currentDisliked, source.domain]
                                });
                              }
                            }}
                            className="bg-zinc-800 text-xs text-zinc-400 hover:text-rose-400 hover:bg-zinc-700 px-2 py-1 rounded transition-colors"
                          >
                            Dislike Source ({source.domain})
                          </button>
                        )}
                        {topic.dislikedSources?.includes(source.domain) && (
                          <span className="text-rose-400/80 text-xs italic bg-rose-500/10 px-2 py-1 rounded border border-rose-500/20">Source now disliked</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500">
              <p className="text-lg">No article generated yet.</p>
              <p className="text-sm mt-2">Click "Generate News" to create an in-depth article on this topic.</p>
            </div>
          )}

          {/* Settings Section */}
          <div className="max-w-4xl mx-auto mt-12 pt-8 border-t border-zinc-800/50">
            <div className="flex items-center gap-2 mb-4 text-zinc-400">
              <Settings2 size={18} />
              <h3 className="text-lg font-semibold text-zinc-200">Topic Settings</h3>
            </div>
            
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
              <h4 className="text-sm font-medium text-zinc-300 mb-3">Disliked Sources for "{topic?.name}"</h4>
              {(!topic?.dislikedSources || topic.dislikedSources.length === 0) ? (
                <p className="text-sm text-zinc-500 italic">No sources have been disliked yet. Disliking a source will prevent it from being used in future articles.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {topic.dislikedSources.map((domain) => (
                    <div key={domain} className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm px-3 py-1.5 rounded-lg">
                      <span>{domain}</span>
                      <button
                        onClick={() => {
                          upsertNewsTopic({
                            ...topic!,
                            dislikedSources: topic.dislikedSources?.filter(d => d !== domain)
                          });
                        }}
                        className="text-rose-400 hover:text-rose-200 hover:bg-rose-500/20 rounded-full p-0.5 transition-colors"
                        title="Re-allow this source"
                      >
                        <RotateCcw size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const filteredTopics = newsTopics.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const sortedTopics = [...filteredTopics].sort((a, b) => {
    const aGen = a.lastGeneratedAt || 0;
    const bGen = b.lastGeneratedAt || 0;
    const aSched = a.scheduledDate || 0;
    const bSched = b.scheduledDate || 0;

    switch (sortBy) {
      case 'name_asc': return a.name.localeCompare(b.name);
      case 'name_desc': return b.name.localeCompare(a.name);
      case 'generated_desc': return bGen - aGen;
      case 'generated_asc': return aGen - bGen;
      case 'scheduled_asc': return (a.scheduledDate || Number.MAX_SAFE_INTEGER) - (b.scheduledDate || Number.MAX_SAFE_INTEGER);
      case 'scheduled_desc': return bSched - aSched;
      default: return 0;
    }
  });

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
          <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
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
            <div className="relative flex items-center bg-zinc-900 border border-zinc-800 rounded-xl pl-3 pr-2 py-2.5 text-zinc-100 focus-within:border-indigo-500">
              <ArrowDownUp size={16} className="text-zinc-500 shrink-0 mr-2" />
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="bg-transparent text-sm focus:outline-none w-full appearance-none cursor-pointer pr-4"
              >
                <option value="name_asc" className="bg-zinc-900">Name (A-Z)</option>
                <option value="name_desc" className="bg-zinc-900">Name (Z-A)</option>
                <option value="generated_desc" className="bg-zinc-900">Generated (Newest)</option>
                <option value="generated_asc" className="bg-zinc-900">Generated (Oldest)</option>
                <option value="scheduled_asc" className="bg-zinc-900">Scheduled (Soonest)</option>
                <option value="scheduled_desc" className="bg-zinc-900">Scheduled (Latest)</option>
              </select>
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
          {sortedTopics.map(topic => {
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
