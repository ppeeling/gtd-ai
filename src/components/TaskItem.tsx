import React, { useState, useEffect, useRef } from 'react';
import { Task, List } from '../types';
import { useAppStore } from '../store';
import { Play, Square, RotateCcw, Calendar, Clock, MoreVertical, CheckCircle2, Circle } from 'lucide-react';

export const TaskItem: React.FC<{ task: Task }> = ({ task }) => {
  const { updateTask, deleteTask, state } = useAppStore();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(task.name);
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Timer logic
  const [elapsed, setElapsed] = useState(task.timer.elapsedTime);

  useEffect(() => {
    let interval: number;
    if (task.timer.isRunning && task.timer.startTime) {
      interval = window.setInterval(() => {
        setElapsed(task.timer.elapsedTime + (Date.now() - task.timer.startTime!));
      }, 1000);
    } else {
      setElapsed(task.timer.elapsedTime);
    }
    return () => clearInterval(interval);
  }, [task.timer]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatTime = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const toggleTimer = () => {
    if (task.timer.isRunning) {
      updateTask(task.id, {
        timer: {
          isRunning: false,
          elapsedTime: task.timer.elapsedTime + (Date.now() - task.timer.startTime!),
          startTime: undefined,
        },
      });
    } else {
      updateTask(task.id, {
        timer: {
          isRunning: true,
          elapsedTime: task.timer.elapsedTime,
          startTime: Date.now(),
        },
      });
    }
  };

  const resetTimer = () => {
    updateTask(task.id, {
      timer: { isRunning: false, elapsedTime: 0, startTime: undefined },
    });
  };

  const handleSaveEdit = () => {
    if (editName.trim() && editName !== task.name) {
      updateTask(task.id, { name: editName.trim() });
    } else {
      setEditName(task.name);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditName(task.name);
    setIsEditing(false);
  };

  const handleMove = (listId: string) => {
    updateTask(task.id, { listId });
    setShowMenu(false);
  };

  return (
    <div className={`group flex flex-col gap-2 p-4 bg-zinc-900 border border-zinc-800 rounded-xl shadow-sm transition-all ${task.completed ? 'opacity-60 bg-zinc-950' : 'hover:shadow-md hover:border-zinc-700'}`}>
      <div className="flex items-start gap-3">
        <button
          onClick={() => updateTask(task.id, { completed: !task.completed })}
          className="mt-1 text-zinc-500 hover:text-indigo-500 transition-colors"
        >
          {task.completed ? <CheckCircle2 className="text-emerald-500" /> : <Circle />}
        </button>

        <div className="flex-1 min-w-0">
          {isEditing ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveEdit();
                  if (e.key === 'Escape') handleCancelEdit();
                }}
                onBlur={handleCancelEdit}
                className="w-full px-2 py-1 text-sm bg-zinc-800 border border-indigo-500 text-zinc-100 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          ) : (
            <h3 
              onClick={() => setIsEditing(true)}
              className={`text-base font-medium text-zinc-100 break-words cursor-text hover:text-indigo-400 transition-colors ${task.completed ? 'line-through text-zinc-500 hover:text-zinc-400' : ''}`}
            >
              {task.name}
            </h3>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors"
            >
              <MoreVertical size={16} />
            </button>

            {showMenu && (
              <div className="absolute right-0 mt-1 w-48 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 py-1">
                <div className="px-4 py-1 text-xs font-semibold text-zinc-500 uppercase tracking-wider">Move to...</div>
                {state.lists.map((list) => (
                  <button
                    key={list.id}
                    onClick={() => handleMove(list.id)}
                    disabled={list.id === task.listId}
                    className="w-full text-left px-4 py-1.5 text-sm text-zinc-300 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed truncate"
                  >
                    {list.name}
                  </button>
                ))}
                <div className="border-t border-zinc-700 my-1"></div>
                <button
                  onClick={() => deleteTask(task.id)}
                  className="w-full text-left px-4 py-2 text-sm text-rose-400 hover:bg-zinc-700"
                >
                  Delete Task
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 ml-9 mt-1">
        <div className="flex items-center gap-4 text-xs text-zinc-500">
          <div className="flex items-center gap-1.5 min-w-[100px]">
            <Calendar size={14} />
            <input
              type="date"
              value={task.dueDate ? new Date(task.dueDate - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0] : ''}
              onChange={(e) => {
                const date = e.target.value ? new Date(e.target.value).getTime() : undefined;
                updateTask(task.id, { dueDate: date });
              }}
              onClick={(e) => (e.target as any).showPicker?.()}
              className="bg-transparent border-none p-0 focus:ring-0 cursor-pointer hover:text-zinc-300 [color-scheme:dark] w-full min-h-[24px]"
            />
          </div>
          <div className="flex items-center gap-1.5 min-w-[140px]">
            <Clock size={14} />
            <input
              type="datetime-local"
              value={task.reminderDate ? new Date(task.reminderDate - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''}
              onChange={(e) => {
                const date = e.target.value ? new Date(e.target.value).getTime() : undefined;
                updateTask(task.id, { reminderDate: date });
              }}
              onClick={(e) => (e.target as any).showPicker?.()}
              className="bg-transparent border-none p-0 focus:ring-0 cursor-pointer hover:text-zinc-300 [color-scheme:dark] w-full min-h-[24px]"
            />
          </div>
        </div>

        <div className="flex items-center gap-1 bg-zinc-800/50 px-2 py-1 rounded-md">
          <span className="font-mono text-xs font-medium text-zinc-300 w-16 text-center">
            {formatTime(elapsed)}
          </span>
          <button
            onClick={toggleTimer}
            className={`p-1 rounded hover:bg-zinc-700 transition-colors ${task.timer.isRunning ? 'text-rose-400' : 'text-emerald-400'}`}
          >
            {task.timer.isRunning ? <Square size={14} /> : <Play size={14} />}
          </button>
          <button onClick={resetTimer} className="p-1 rounded hover:bg-zinc-700 text-zinc-400 transition-colors">
            <RotateCcw size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
