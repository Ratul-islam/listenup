import { z } from 'zod'

export const STUDY_KINDS = ['summary', 'quiz'] as const

export const studyParamsSchema = z.object({ documentId: z.uuid(), kind: z.enum(STUDY_KINDS) })

export type StudyKind = (typeof STUDY_KINDS)[number]
export type StudyParams = z.infer<typeof studyParamsSchema>

export interface Summary {
  summary: string
  keyPoints: string[]
}

export interface QuizQuestion {
  question: string
  options: string[]
  /** Index into options */
  answer: number
  explanation: string
}

export interface Quiz {
  questions: QuizQuestion[]
}
