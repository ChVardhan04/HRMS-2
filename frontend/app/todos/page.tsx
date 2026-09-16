'use client';

import { AppShell } from '@/components/layout/app-shell';
import { TodayTodoList } from '@/components/todos/today-todo-list';

export default function TodosPage() {
  return <AppShell title="To-Dos"><div className="mx-auto w-full max-w-6xl"><TodayTodoList /></div></AppShell>;
}
