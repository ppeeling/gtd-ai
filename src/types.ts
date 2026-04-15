export type ListId = string;
export type TaskId = string;

export interface List {
  id: ListId;
  name: string;
  isSystem?: boolean;
  order?: number;
}

export interface TaskTimer {
  isRunning: boolean;
  startTime?: number; // timestamp when started
  elapsedTime: number; // accumulated time in ms
}

export interface Task {
  id: TaskId;
  listId: ListId;
  name: string;
  completed: boolean;
  dueDate?: number; // timestamp
  reminderDate?: number; // timestamp
  timer: TaskTimer;
  createdAt: number;
  order?: number;
}

export interface SavedPrompt {
  id: string;
  name: string;
  prompt: string;
}

export interface NewsTopic {
  id: string;
  name: string;
  lastGeneratedAt: number | null;
}

export interface GeneratedArticle {
  id: string;
  topicId: string;
  title: string;
  content: string;
  generatedAt: number;
}

export interface AppState {
  lists: List[];
  tasks: Task[];
  savedPrompts: SavedPrompt[];
  newsTopics: NewsTopic[];
  generatedArticles: GeneratedArticle[];
}
