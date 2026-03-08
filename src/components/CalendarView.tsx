import React, { useState } from 'react';
import { useAppStore } from '../store';
import { TaskItem } from './TaskItem';
import { Calendar as CalendarIcon, Search, Eye, EyeOff, XCircle } from 'lucide-react';

export function CalendarView() {
  const { state } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [showCompleted, setShowCompleted] = useState(true);

  // Filter tasks that have a due date or reminder date
  let calendarTasks = state.tasks.filter((t) => t.dueDate || t.reminderDate);

  if (!showCompleted) {
    calendarTasks = calendarTasks.filter((t) => !t.completed);
  }

  if (searchQuery.trim()) {
    calendarTasks = calendarTasks.filter((t) => 
      t.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }

  // Sort them
  calendarTasks.sort((a, b) => {
    const dateA = a.dueDate || a.reminderDate || 0;
    const dateB = b.dueDate || b.reminderDate || 0;
    return dateA - dateB;
  });

  // Group tasks by date for better visualization
  const groupedTasks: { [date: string]: typeof calendarTasks } = {};
  calendarTasks.forEach((task) => {
    const taskDate = task.dueDate || task.reminderDate!;
    const dateStr = new Date(taskDate).toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    if (!groupedTasks[dateStr]) {
      groupedTasks[dateStr] = [];
    }
    groupedTasks[dateStr].push(task);
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950">
      <div className="px-4 md:px-8 py-6 border-b border-zinc-800 bg-zinc-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <CalendarIcon size={24} className="text-indigo-400" />
          <h2 className="text-2xl font-bold text-zinc-100 tracking-tight">Calendar</h2>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search scheduled tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-10 py-1.5 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-full sm:w-64"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                aria-label="Clear search"
              >
                <XCircle size={16} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-zinc-400 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors shrink-0"
          >
            {showCompleted ? <EyeOff size={16} /> : <Eye size={16} />}
            <span className="hidden sm:inline">{showCompleted ? 'Hide Completed' : 'Show Completed'}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-3xl mx-auto space-y-8">
          {calendarTasks.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-4 border border-zinc-800">
                <CalendarIcon size={32} className="text-zinc-700" />
              </div>
              <h3 className="text-zinc-300 font-medium mb-1">No scheduled tasks</h3>
              <p className="text-zinc-500 text-sm">Tasks with due dates or reminders will appear here.</p>
            </div>
          ) : (
            Object.entries(groupedTasks).map(([date, tasks]) => (
              <div key={date} className="space-y-4">
                <h3 className="text-sm font-semibold text-indigo-400 uppercase tracking-wider sticky top-0 bg-zinc-950/80 backdrop-blur-sm py-2 z-10">
                  {date}
                </h3>
                <div className="space-y-3">
                  {tasks.map((task) => {
                    const taskList = state.lists.find(l => l.id === task.listId);
                    return (
                      <div key={task.id} className="group relative">
                        {taskList && (
                          <div className="absolute -top-2 left-9 px-1.5 py-0.5 bg-zinc-800 text-[10px] font-bold text-zinc-500 uppercase tracking-wider rounded border border-zinc-700 z-10">
                            {taskList.name}
                          </div>
                        )}
                        <TaskItem task={task} />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
