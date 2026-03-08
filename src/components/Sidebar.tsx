import { Plus, List as ListIcon, Bot, Download, Upload, Trash2, X, GripVertical, Calendar as CalendarIcon } from 'lucide-react';
import { useAppStore } from '../store';
import React, { useState, useRef } from 'react';
import { Reorder } from 'motion/react';

export function Sidebar({
  activeListId,
  setActiveListId,
  isChatActive,
  setIsChatActive,
  onClose,
}: {
  activeListId: string;
  setActiveListId: (id: string) => void;
  isChatActive: boolean;
  setIsChatActive: (active: boolean) => void;
  onClose?: () => void;
}) {
  const { state, addList, deleteList, reorderLists, exportData, importData } = useAppStore();
  const [newListName, setNewListName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddList = (e: React.FormEvent) => {
    e.preventDefault();
    if (newListName.trim()) {
      addList(newListName.trim());
      setNewListName('');
    }
  };

  const handleExport = () => {
    const data = exportData();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'gtd-backup.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result;
        if (typeof result === 'string') {
          importData(result);
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="w-72 md:w-64 bg-zinc-900 text-zinc-100 flex flex-col h-full border-r border-zinc-800 shadow-xl md:shadow-none">
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">GTD Master</h1>
        {onClose && (
          <button 
            onClick={onClose}
            className="md:hidden p-2 -mr-2 text-zinc-400 hover:text-zinc-100 rounded-lg hover:bg-zinc-800 transition-colors"
          >
            <X size={20} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-2">
        <div className="px-3 space-y-1">
          <button
            onClick={() => {
              setIsChatActive(true);
              if (onClose) onClose();
            }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              isChatActive ? 'bg-indigo-600 text-white' : 'hover:bg-zinc-800 text-zinc-300'
            }`}
          >
            <Bot size={18} />
            <span className="font-medium">AI Assistant</span>
          </button>

          <button
            onClick={() => {
              setIsChatActive(false);
              setActiveListId('__calendar__');
              if (onClose) onClose();
            }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
              !isChatActive && activeListId === '__calendar__' ? 'bg-indigo-600 text-white' : 'hover:bg-zinc-800 text-zinc-300'
            }`}
          >
            <CalendarIcon size={18} />
            <span className="font-medium">Calendar</span>
          </button>
        </div>

        <div className="mt-4 px-4 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
          Lists
        </div>

        <Reorder.Group
          axis="y"
          values={state.lists}
          onReorder={reorderLists}
          className="px-3 space-y-1"
        >
          {state.lists.map((list) => (
            <Reorder.Item
              key={list.id}
              value={list}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveListId(list.id);
                  setIsChatActive(false);
                }
              }}
              onClick={() => {
                setActiveListId(list.id);
                setIsChatActive(false);
              }}
              className={`group w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                !isChatActive && activeListId === list.id
                  ? 'bg-zinc-800 text-white'
                  : 'hover:bg-zinc-800/50 text-zinc-300'
              }`}
            >
              <GripVertical size={14} className="text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing" />
              <ListIcon size={18} className="text-zinc-500" />
              <div className="flex-1 truncate text-left">{list.name}</div>
              {!list.isSystem && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`Delete list "${list.name}"?`)) {
                      deleteList(list.id);
                      if (activeListId === list.id) {
                        setActiveListId('inbox');
                      }
                    }
                  }}
                  className="p-1 opacity-0 group-hover:opacity-100 hover:text-rose-500 transition-all"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </Reorder.Item>
          ))}
        </Reorder.Group>

        <form onSubmit={handleAddList} className="px-4 mt-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="New list..."
              className="w-full bg-zinc-800 text-sm rounded-md px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={!newListName.trim()}
              className="p-1.5 bg-zinc-800 rounded-md hover:bg-zinc-700 disabled:opacity-50"
            >
              <Plus size={16} />
            </button>
          </div>
        </form>
      </div>

      <div className="p-4 border-t border-zinc-800 flex flex-col gap-2">
        <button
          onClick={handleExport}
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          <Download size={16} />
          Export Data
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          <Upload size={16} />
          Import Data
        </button>
        <input
          type="file"
          accept=".json"
          ref={fileInputRef}
          onChange={handleImport}
          className="hidden"
        />
      </div>
    </div>
  );
}
