import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { RssArticle } from '../types';
import { fetchAllFeeds, fetchArticleContent, extractTopics, scoreArticle } from '../services/rss';
import { Play, Pause, SkipForward, SkipBack, ThumbsUp, ThumbsDown, ChevronDown, ChevronUp, Loader2, Volume2, Tag, CheckCircle, EyeOff, Eye } from 'lucide-react';

export function RssReader() {
  const { state, updateRssPreferences, upsertRssArticles, geminiApiKey } = useAppStore();
  const { rssPreferences, rssArticles } = state;
  
  // Use a ref to access the latest preferences inside the speech synthesis callbacks
  const prefsRef = useRef(rssPreferences);
  useEffect(() => {
    prefsRef.current = rssPreferences;
  }, [rssPreferences]);
  
  const [fetchingLatest, setFetchingLatest] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [fetchingContent, setFetchingContent] = useState(false);
  const [sortBy, setSortBy] = useState<'date' | 'recommended'>('date');
  const [showHidden, setShowHidden] = useState(false);
  
  // Audio state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentArticleIndex, setCurrentArticleIndex] = useState<number>(-1);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  useEffect(() => {
    synthRef.current = window.speechSynthesis;
    loadFeeds();
    
    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
  }, []);

  const loadFeeds = async () => {
    setFetchingLatest(true);
    const fetched = await fetchAllFeeds();
    await upsertRssArticles(fetched);
    setFetchingLatest(false);
  };

  const handleExpand = async (article: RssArticle) => {
    if (expandedId === article.id) {
      setExpandedId(null);
      return;
    }
    
    setExpandedId(article.id);
    
    // Fetch content and topics if not already fetched
    if (!article.content) {
      setFetchingContent(true);
      const content = await fetchArticleContent(article.link);
      
      let topics = article.topics || [];
      if (geminiApiKey && topics.length === 0) {
        topics = await extractTopics(content || article.description, geminiApiKey);
      }
      
      await upsertRssArticles([{ ...article, content, topics }]);
      setFetchingContent(false);
    }
  };

  const toggleLike = (id: string) => {
    const isLiked = rssPreferences.likedArticles.includes(id);
    const newLiked = isLiked 
      ? rssPreferences.likedArticles.filter(a => a !== id)
      : [...rssPreferences.likedArticles, id];
      
    // Remove from disliked if liking
    const newDisliked = rssPreferences.dislikedArticles.filter(a => a !== id);
    
    updateRssPreferences({ likedArticles: newLiked, dislikedArticles: newDisliked });
  };

  const toggleDislike = (id: string) => {
    const isDisliked = rssPreferences.dislikedArticles.includes(id);
    const newDisliked = isDisliked 
      ? rssPreferences.dislikedArticles.filter(a => a !== id)
      : [...rssPreferences.dislikedArticles, id];
      
    // Remove from liked if disliking
    const newLiked = rssPreferences.likedArticles.filter(a => a !== id);
    
    updateRssPreferences({ likedArticles: newLiked, dislikedArticles: newDisliked });
  };

  const toggleTopic = (topic: string) => {
    const isFollowed = rssPreferences.followedTopics.includes(topic);
    const newTopics = isFollowed
      ? rssPreferences.followedTopics.filter(t => t !== topic)
      : [...rssPreferences.followedTopics, topic];
      
    updateRssPreferences({ followedTopics: newTopics });
  };

  const togglePlayed = (id: string) => {
    const isPlayed = (rssPreferences.playedArticles || []).includes(id);
    const newPlayed = isPlayed
      ? (rssPreferences.playedArticles || []).filter(a => a !== id)
      : [...(rssPreferences.playedArticles || []), id];
      
    updateRssPreferences({ playedArticles: newPlayed });
  };

  const toggleHidden = (id: string) => {
    const isHidden = (rssPreferences.hiddenArticles || []).includes(id);
    const newHidden = isHidden
      ? (rssPreferences.hiddenArticles || []).filter(a => a !== id)
      : [...(rssPreferences.hiddenArticles || []), id];
      
    updateRssPreferences({ hiddenArticles: newHidden });
  };

  // Audio Player Logic
  const playArticle = async (index: number) => {
    if (!synthRef.current) return;
    
    synthRef.current.cancel(); // Stop current speech
    
    let article = sortedArticles[index];
    if (!article) return;
    
    setCurrentArticleIndex(index);
    setIsPlaying(true);

    // On iOS, speech must start synchronously with user interaction
    // We speak the title immediately to unlock audio, then fetch content if needed
    const titleUtterance = new SpeechSynthesisUtterance(article.title);
    synthRef.current.speak(titleUtterance);

    if (!article.content) {
      const content = await fetchArticleContent(article.link);
      await upsertRssArticles([{ ...article, content }]);
      article = { ...article, content };
    }
    
    const textToSpeak = article.content || article.description;
    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    
    utterance.onend = () => {
      // Mark as played automatically
      const currentPlayed = prefsRef.current.playedArticles || [];
      if (!currentPlayed.includes(article.id)) {
        updateRssPreferences({ playedArticles: [...currentPlayed, article.id] });
      }

      // Auto-play next
      if (index + 1 < sortedArticles.length) {
        playArticle(index + 1);
      } else {
        setIsPlaying(false);
      }
    };
    
    utterance.onerror = (e) => {
      console.error('Speech synthesis error', e);
      setIsPlaying(false);
    };
    
    utteranceRef.current = utterance;
    synthRef.current.speak(utterance);
  };

  const togglePlayPause = () => {
    if (!synthRef.current) return;
    
    if (isPlaying) {
      synthRef.current.pause();
      setIsPlaying(false);
    } else {
      if (synthRef.current.paused) {
        synthRef.current.resume();
        setIsPlaying(true);
      } else if (currentArticleIndex >= 0) {
        playArticle(currentArticleIndex);
      } else if (sortedArticles.length > 0) {
        playArticle(0);
      }
    }
  };

  const playNext = () => {
    if (currentArticleIndex + 1 < sortedArticles.length) {
      playArticle(currentArticleIndex + 1);
    }
  };

  const playPrev = () => {
    if (currentArticleIndex - 1 >= 0) {
      playArticle(currentArticleIndex - 1);
    }
  };

  // Sorting
  const sortedArticles = [...rssArticles]
    .filter(a => showHidden || !(rssPreferences.hiddenArticles || []).includes(a.id))
    .sort((a, b) => {
      if (sortBy === 'recommended') {
        const scoreA = scoreArticle(a, rssPreferences.followedTopics, rssPreferences.likedArticles, rssPreferences.dislikedArticles);
        const scoreB = scoreArticle(b, rssPreferences.followedTopics, rssPreferences.likedArticles, rssPreferences.dislikedArticles);
        if (scoreA !== scoreB) return scoreB - scoreA;
      }
      return (b.pubTimestamp || 0) - (a.pubTimestamp || 0);
    });

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950">
      <div className="px-4 md:px-8 py-6 border-b border-zinc-800 bg-zinc-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-zinc-100 tracking-tight flex items-center gap-2">
            BBC News Feed
          </h2>
          <p className="text-zinc-400 text-sm mt-1">
            {rssPreferences.followedTopics.length > 0 
              ? `Following: ${rssPreferences.followedTopics.join(', ')}`
              : 'Follow topics to get recommendations'}
          </p>
          {!geminiApiKey && (
            <p className="text-amber-500 text-xs mt-1">
              Set your Gemini API Key in the AI Assistant tab to enable AI topic extraction.
            </p>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          <select 
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'date' | 'recommended')}
            className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 block p-2"
          >
            <option value="date">Latest First</option>
            <option value="recommended">Recommended</option>
          </select>
          
          <button 
            onClick={() => setShowHidden(!showHidden)}
            className={`p-2 rounded-lg transition-colors flex items-center gap-2 ${showHidden ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-400 hover:text-zinc-100 bg-zinc-800'}`}
            title={showHidden ? "Hide hidden articles" : "Show hidden articles"}
          >
            {showHidden ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
          
          <button 
            onClick={loadFeeds}
            disabled={fetchingLatest}
            className="p-2 text-zinc-400 hover:text-zinc-100 bg-zinc-800 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {fetchingLatest ? <Loader2 size={16} className="animate-spin" /> : null}
            Refresh
          </button>
        </div>
      </div>

      {/* Audio Player Bar */}
      <div className="bg-zinc-900 border-b border-zinc-800 p-3 flex items-center justify-center gap-4 sticky top-0 z-10 shadow-md">
        <Volume2 className="text-indigo-400 hidden sm:block" size={20} />
        <button onClick={playPrev} disabled={currentArticleIndex <= 0} className="p-2 text-zinc-300 hover:text-white disabled:opacity-50">
          <SkipBack size={20} />
        </button>
        <button onClick={togglePlayPause} className="p-3 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 transition-colors shadow-lg">
          {isPlaying ? <Pause size={24} /> : <Play size={24} className="ml-1" />}
        </button>
        <button onClick={playNext} disabled={currentArticleIndex >= sortedArticles.length - 1} className="p-2 text-zinc-300 hover:text-white disabled:opacity-50">
          <SkipForward size={20} />
        </button>
        <div className="text-sm text-zinc-400 ml-4 hidden sm:block truncate max-w-xs">
          {currentArticleIndex >= 0 ? sortedArticles[currentArticleIndex]?.title : 'Ready to play'}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        {fetchingLatest && rssArticles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
            <Loader2 size={48} className="animate-spin mb-4 text-indigo-500" />
            <p>Fetching latest news...</p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto space-y-4">
            {sortedArticles.map((article, index) => {
              const isExpanded = expandedId === article.id;
              const isLiked = rssPreferences.likedArticles.includes(article.id);
              const isDisliked = rssPreferences.dislikedArticles.includes(article.id);
              const isPlayed = (rssPreferences.playedArticles || []).includes(article.id);
              const isHidden = (rssPreferences.hiddenArticles || []).includes(article.id);
              const isPlayingThis = currentArticleIndex === index && isPlaying;
              
              // Hide disliked articles unless we are strictly sorting by date
              if (isDisliked && sortBy === 'recommended') return null;

              return (
                <div 
                  key={article.id} 
                  className={`bg-zinc-900 border ${isPlayingThis ? 'border-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.2)]' : 'border-zinc-800'} rounded-xl overflow-hidden transition-all ${isPlayed && !isPlayingThis ? 'opacity-60' : ''} ${isHidden ? 'opacity-40 grayscale' : ''}`}
                >
                  <div className="p-5">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1 cursor-pointer" onClick={() => handleExpand(article)}>
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          {article.feedTitles?.map(title => (
                            <span key={title} className="text-xs font-semibold px-2 py-1 bg-zinc-800 text-zinc-300 rounded-md">
                              {title}
                            </span>
                          ))}
                          <span className="text-xs text-zinc-500">
                            {new Date(article.pubDate).toLocaleString()}
                          </span>
                        </div>
                        <h3 className={`text-lg font-bold leading-tight mb-2 ${isPlayingThis ? 'text-indigo-400' : 'text-zinc-100'}`}>
                          {article.title}
                        </h3>
                        <p className="text-zinc-400 text-sm line-clamp-2">
                          {article.description}
                        </p>
                      </div>
                      
                      <div className="flex flex-col items-center gap-2">
                        <button 
                          onClick={() => toggleHidden(article.id)}
                          className={`p-2 rounded-full transition-colors ${isHidden ? 'bg-zinc-700 text-zinc-300' : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'}`}
                          title={isHidden ? "Unhide" : "Hide"}
                        >
                          {isHidden ? <Eye size={18} /> : <EyeOff size={18} />}
                        </button>
                        <button 
                          onClick={() => togglePlayed(article.id)}
                          className={`p-2 rounded-full transition-colors ${isPlayed ? 'bg-indigo-500/20 text-indigo-400' : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'}`}
                          title={isPlayed ? "Mark as unplayed" : "Mark as played"}
                        >
                          <CheckCircle size={18} />
                        </button>
                        <button 
                          onClick={() => toggleLike(article.id)}
                          className={`p-2 rounded-full transition-colors ${isLiked ? 'bg-emerald-500/20 text-emerald-400' : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'}`}
                        >
                          <ThumbsUp size={18} />
                        </button>
                        <button 
                          onClick={() => toggleDislike(article.id)}
                          className={`p-2 rounded-full transition-colors ${isDisliked ? 'bg-rose-500/20 text-rose-400' : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'}`}
                        >
                          <ThumbsDown size={18} />
                        </button>
                      </div>
                    </div>
                    
                    <div className="mt-4 flex items-center justify-between">
                      <button 
                        onClick={() => playArticle(index)}
                        className="text-sm flex items-center gap-1 text-indigo-400 hover:text-indigo-300 font-medium"
                      >
                        <Volume2 size={16} /> Play
                      </button>
                      
                      <button 
                        onClick={() => handleExpand(article)}
                        className="text-sm flex items-center gap-1 text-zinc-400 hover:text-zinc-200"
                      >
                        {isExpanded ? (
                          <><ChevronUp size={16} /> Less</>
                        ) : (
                          <><ChevronDown size={16} /> Read More</>
                        )}
                      </button>
                    </div>
                  </div>
                  
                  {isExpanded && (
                    <div className="px-5 pb-5 pt-2 border-t border-zinc-800 bg-zinc-900/50">
                      {fetchingContent ? (
                        <div className="flex items-center justify-center py-8 text-zinc-500">
                          <Loader2 size={24} className="animate-spin mr-2" />
                          <span className="text-sm">Fetching full article & analyzing...</span>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {article.topics && article.topics.length > 0 && (
                            <div className="flex flex-wrap gap-2 mb-4">
                              <Tag size={14} className="text-zinc-500 mt-1" />
                              {article.topics.map(topic => {
                                const isFollowed = rssPreferences.followedTopics.includes(topic);
                                return (
                                  <button
                                    key={topic}
                                    onClick={() => toggleTopic(topic)}
                                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                                      isFollowed 
                                        ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300' 
                                        : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:bg-zinc-700'
                                    }`}
                                  >
                                    {topic} {isFollowed ? '✓' : '+'}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          
                          <div className="prose prose-invert prose-sm max-w-none text-zinc-300">
                            {article.content ? (
                              article.content.split('\n\n').map((p, i) => (
                                <p key={i} className="mb-4 leading-relaxed">{p}</p>
                              ))
                            ) : (
                              <p className="italic text-zinc-500">Full content could not be loaded.</p>
                            )}
                          </div>
                          
                          <a 
                            href={article.link} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-block mt-4 text-sm text-indigo-400 hover:text-indigo-300 font-medium"
                          >
                            Read original on BBC News →
                          </a>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
