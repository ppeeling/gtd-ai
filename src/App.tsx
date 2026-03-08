import { useState } from 'react';
import { AppProvider } from './store';
import { Sidebar } from './components/Sidebar';
import { TaskListView } from './components/TaskListView';
import { GeminiChat } from './components/GeminiChat';
import { CalendarView } from './components/CalendarView';
import { Menu } from 'lucide-react';

function AppContent() {
  const [activeListId, setActiveListId] = useState('inbox');
  const [isChatActive, setIsChatActive] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const renderContent = () => {
    if (isChatActive) return <GeminiChat />;
    if (activeListId === '__calendar__') return <CalendarView />;
    return <TaskListView listId={activeListId} />;
  };

  return (
    <div className="flex h-screen w-full bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
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
        />
      </div>

      <main className="flex-1 flex flex-col min-w-0 h-full relative">
        {/* Mobile Header */}
        <div className="md:hidden flex items-center p-4 border-b border-zinc-800 bg-zinc-900">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 -ml-2 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <Menu size={24} />
          </button>
          <h1 className="ml-2 text-lg font-bold tracking-tight">GTD Master</h1>
        </div>

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
