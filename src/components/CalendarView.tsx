import React from 'react';
import { useAppStore } from '../store';
import { TaskItem } from './TaskItem';
import { Calendar as CalendarIcon } from 'lucide-react';

export function CalendarView() {
  const { state } = useAppStore();

  // Filter tasks that have a due date and sort them
  const calendarTasks = state.tasks
    .filter((t) => t.dueDate)
    .sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0));

  // Group tasks by date for better visualization
  const groupedTasks: { [date: string]: typeof calendarTasks } = {};
  calendarTasks.forEach((task) => {
    const dateStr = new Date(task.dueDate!).toLocaleDateString(undefined, {
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
      <div className="px-4 md:px-8 py-6 border-b border-zinc-800 bg-zinc-900 flex items-center gap-3">
        <CalendarIcon size={24} className="text-indigo-400" />
        <h2 className="text-2xl font-bold text-zinc-100 tracking-tight">Calendar</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-3xl mx-auto space-y-8">
          {calendarTasks.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-4 border border-zinc-800">
                <CalendarIcon size={32} className="text-zinc-700" />
              </div>
              <h3 className="text-zinc-300 font-medium mb-1">No scheduled tasks</h3>
              <p className="text-zinc-500 text-sm">Tasks with due dates will appear here.</p>
            </div>
          ) : (
            Object.entries(groupedTasks).map(([date, tasks]) => (
              <div key={date} className="space-y-4">
                <h3 className="text-sm font-semibold text-indigo-400 uppercase tracking-wider sticky top-0 bg-zinc-950/80 backdrop-blur-sm py-2 z-10">
                  {date}
                </h3>
                <div className="space-y-3">
                  {tasks.map((task) => (
                    <TaskItem key={task.id} task={task} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
