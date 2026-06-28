export type Category = 'text' | 'link' | 'image' | 'code' | 'email' | 'file_path';

export interface ClipboardEntry {
  id: number;
  category: Category;
  content_type: string;
  content: string;
  preview: string;
  hash: string;
  pinned: boolean;
  created_at: string;
  original_content: string | null;
  updated_at: string | null;
  archived_at: string | null;
}

export interface QueryFilter {
  category?: Category;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface Stats {
  total: number;
  text: number;
  link: number;
  image: number;
  code: number;
  email: number;
  file_path: number;
  dbSize: number;
  archive: number;
}

export interface Memo {
  id: number;
  title: string;
  body: string;
  tags: string;
  pinned: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
  archived_at?: string | null;
}

export interface MemoFilter {
  search?: string;
  limit?: number;
  offset?: number;
}

export type FilterTab = 'memo' | 'all' | 'archive' | Category;
export type ThemeMode = 'system' | 'light' | 'dark';
