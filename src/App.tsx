import { useState } from 'react';
import { AppProvider, useAppStore } from './store';
import { Sidebar } from './components/Sidebar';
import { TaskListView } from './components/TaskListView';
import { GeminiChat } from './components/GeminiChat';
import { CalendarView } from './components/CalendarView';
import { NewsReader } from './components/NewsReader';
import { Menu, WifiOff, RotateCcw } from 'lucide-react';

function AppContent() {
  const [activeListId, setActiveListId] = useState('inbox');
  const [isChatActive, setIsChatActive] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { isOffline } = useAppStore();

  const handleRefresh = async () => {
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
        }
      } catch (e) {
        console.error('Error unregistering service workers', e);
      }
    }
    if ('caches' in window) {
      try {
        const keys = await caches.keys();
        for (const key of keys) {
          await caches.delete(key);
        }
      } catch (e) {
        console.error('Error clearing caches', e);
      }
    }
    window.location.reload();
  };

  const renderContent = () => {
    if (isChatActive) return <GeminiChat />;
    if (activeListId === '__calendar__') return <CalendarView onNavigate={setActiveListId} />;
    if (activeListId.startsWith('__rss__')) {
      const topicId = activeListId.split(':')[1] || null;
      return <NewsReader initialTopicId={topicId} />;
    }
    return <TaskListView listId={activeListId} />;
  };

  return (
    <div className="flex h-[100dvh] w-full bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-30 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <Sidebar
          activeListId={activeListId}
          setActiveListId={(id) => {
            setActiveListId(id);
            setIsChatActive(false);
            setIsSidebarOpen(false);
          }}
          isChatActive={isChatActive}
          setIsChatActive={(active) => {
            setIsChatActive(active);
            setIsSidebarOpen(false);
          }}
          onClose={() => setIsSidebarOpen(false)}
          onRefresh={handleRefresh}
        />
      </div>

      <main className="flex-1 flex flex-col min-w-0 h-full relative">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900">
          <div className="flex items-center">
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="p-2 -ml-2 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-800 transition-colors"
            >
              <Menu size={24} />
            </button>
            <h1 className="ml-2 text-lg font-bold tracking-tight">GTD Master</h1>
          </div>
          <div className="flex items-center gap-3">
            {isOffline && (
              <div className="flex items-center text-amber-500 text-xs font-medium">
                <WifiOff size={14} className="mr-1" />
                Offline
              </div>
            )}
            <button
              onClick={handleRefresh}
              className="p-2 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-800 transition-colors"
              aria-label="Refresh app"
            >
              <RotateCcw size={20} />
            </button>
          </div>
        </div>

        {/* Desktop Offline Indicator */}
        {isOffline && (
          <div className="hidden md:flex absolute top-4 right-4 z-10 items-center bg-amber-500/10 text-amber-500 px-3 py-1.5 rounded-full text-xs font-medium border border-amber-500/20">
            <WifiOff size={14} className="mr-2" />
            Working Offline
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
