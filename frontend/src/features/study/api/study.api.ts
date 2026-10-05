import { api } from '@/lib/api/client';

export interface Summary {
  summary: string;
  keyPoints: string[];
}

export interface QuizQuestion {
  question: string;
  options: string[];
  /** Index of the correct option */
  answer: number;
  explanation: string;
}

export interface Quiz {
  questions: QuizQuestion[];
}

type StudyKind = 'summary' | 'quiz';
interface StudyAid<T> {
  kind: StudyKind;
  content: T;
  createdAt: string;
}

// Writing them can take a little while on long documents
const SLOW = { auth: true, timeoutMs: 120_000 } as const;

export const studyApi = {
  summary: (documentId: string) => api.get<StudyAid<Summary>>(`/study/${documentId}/summary`, SLOW).then((r) => r.data.content),
  quiz: (documentId: string) => api.get<StudyAid<Quiz>>(`/study/${documentId}/quiz`, SLOW).then((r) => r.data.content),
  newQuiz: (documentId: string) => api.post<StudyAid<Quiz>>(`/study/${documentId}/quiz/refresh`, {}, SLOW).then((r) => r.data.content),
};
