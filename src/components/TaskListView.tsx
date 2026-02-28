import React, { useState } from 'react';
import { useAppStore } from '../store';
import { TaskItem } from './TaskItem';
import { Plus, Eye, EyeOff } from 'lucide-react';

export function TaskListView({ listId }: { listId: string }) {
  const { state, addTask } = useAppStore();
  const [newTaskName, setNewTaskName] = useState('');
  const [showCompleted, setShowCompleted] = useState(true);

  const list = state.lists.find((l) => l.id === listId);
  const tasks = state.tasks.filter((t) => t.listId === listId);
  const activeTasks = tasks.filter((t) => !t.completed);
  const completedTasks = tasks.filter((t) => t.completed);

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTaskName.trim()) {
      addTask({ name: newTaskName.trim(), listId });
      setNewTaskName('');
    }
  };

  if (!list) return <div className="flex-1 p-8 text-zinc-500">List not found</div>;

  return (
    <div className="flex-1 flex flex-col h-full bg-zinc-950">
      <div className="px-4 md:px-8 py-6 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-zinc-100 tracking-tight">{list.name}</h2>
        <button
          onClick={() => setShowCompleted(!showCompleted)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-zinc-400 bg-zinc-800 rounded-lg hover:bg-zinc-700 transition-colors"
        >
          {showCompleted ? <EyeOff size={16} /> : <Eye size={16} />}
          <span className="hidden sm:inline">{showCompleted ? 'Hide Completed' : 'Show Completed'}</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <form onSubmit={handleAddTask} className="relative">
            <input
              type="text"
              value={newTaskName}
              onChange={(e) => setNewTaskName(e.target.value)}
              placeholder="Add a new task..."
              className="w-full pl-4 pr-12 py-3 bg-zinc-900 border border-zinc-800 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-zinc-100 placeholder-zinc-500"
            />
            <button
              type="submit"
              disabled={!newTaskName.trim()}
              className="absolute right-2 top-2 bottom-2 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus size={20} />
            </button>
          </form>

          <div className="space-y-3">
            {activeTasks.length === 0 && completedTasks.length === 0 && (
              <div className="text-center py-12 text-zinc-500">
                <p className="text-lg font-medium text-zinc-400">No tasks yet</p>
                <p className="text-sm mt-1">Add a task above to get started.</p>
              </div>
            )}

            {activeTasks.map((task, index) => (
              <TaskItem key={`active-${task.id}-${index}`} task={task} />
            ))}

            {showCompleted && completedTasks.length > 0 && (
              <div className="pt-6">
                <h3 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3">
                  Completed
                </h3>
                <div className="space-y-3">
                  {completedTasks.map((task, index) => (
                    <TaskItem key={`completed-${task.id}-${index}`} task={task} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
