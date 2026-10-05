import { createHash } from 'node:crypto'
import { env } from '../../config/env.js'
import { chatCompletion } from '../../lib/openrouter.js'
import { AppError } from '../../utils/AppError.js'
import type { SentenceSpan } from '../ingestion/text/chunker.js'
import { planAtLeast } from '../plans/plan-catalog.js'
import type { StudyRepository } from './study.repository.js'
import type { Quiz, StudyKind, Summary } from './study.schema.js'

// The cheap text model reads long input fine; this keeps cost and wait predictable
const MAX_INPUT_CHARS = 120_000
const QUIZ_QUESTIONS = 10

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  bn: 'Bangla (Bengali)',
  hi: 'Hindi',
  es: 'Spanish',
  pt: 'Brazilian Portuguese',
  fr: 'French',
}

/** The document's text with paragraph breaks, and a fingerprint that changes with it */
function documentText(chunks: { text: string; sentences: unknown }[]) {
  let text = ''
  for (const chunk of chunks) {
    for (const s of chunk.sentences as SentenceSpan[]) {
      const sentence = chunk.text.slice(s.start, s.end).trim()
      if (!sentence) continue
      text += text ? (s.paragraphStart ? '\n\n' : ' ') + sentence : sentence
    }
  }
  return { text: text.slice(0, MAX_INPUT_CHARS), sourceKey: createHash('sha256').update(text).digest('hex').slice(0, 16) }
}

function parseJson(reply: string) {
  try {
    return JSON.parse(reply) as unknown
  } catch {
    return null
  }
}

const isSummary = (v: unknown): v is Summary =>
  !!v && typeof (v as Summary).summary === 'string' && Array.isArray((v as Summary).keyPoints) && (v as Summary).keyPoints.every((p) => typeof p === 'string')

const isQuiz = (v: unknown): v is Quiz =>
  !!v &&
  Array.isArray((v as Quiz).questions) &&
  (v as Quiz).questions.length > 0 &&
  (v as Quiz).questions.every(
    (q) =>
      typeof q.question === 'string' &&
      Array.isArray(q.options) &&
      q.options.length === 4 &&
      q.options.every((o) => typeof o === 'string') &&
      Number.isInteger(q.answer) &&
      q.answer >= 0 &&
      q.answer < 4 &&
      typeof q.explanation === 'string',
  )

/**
 * Summaries and quizzes for a document (Plus and up), written by a cheap text
 * model in the document's language and kept until its text changes. A quiz can
 * be asked for again to get new questions.
 */
export class StudyService {
  constructor(private readonly studyRepository: StudyRepository) {}

  private async source(userId: string, documentId: string) {
    if (!planAtLeast((await this.studyRepository.findUserPlan(userId))?.plan, 'plus')) {
      throw new AppError('Summaries and quizzes are part of Plus and Pro.', 403, 'PREMIUM_REQUIRED')
    }
    const doc = await this.studyRepository.findOwnedDocument(userId, documentId)
    if (!doc) throw new AppError('Document not found', 404, 'DOCUMENT_NOT_FOUND')
    if (doc.status !== 'READY') throw new AppError('This document is still being prepared', 409, 'DOCUMENT_NOT_READY')
    const { text, sourceKey } = documentText(await this.studyRepository.listChunks(documentId))
    const language = LANGUAGE_NAMES[doc.language ?? ''] ?? "the document's main language"
    return { doc, text, sourceKey, language }
  }

  /** The saved summary or quiz, made now if there's none for the current text (or `fresh` is asked) */
  async get(userId: string, documentId: string, kind: StudyKind, { fresh = false } = {}) {
    const { doc, text, sourceKey, language } = await this.source(userId, documentId)
    const saved = await this.studyRepository.find(documentId, kind)
    if (saved && saved.sourceKey === sourceKey && !fresh) return { kind, content: saved.content, createdAt: saved.createdAt }

    const content = kind === 'summary' ? await this.summarise(doc.title, text, language) : await this.quiz(doc.title, text, language)
    const row = await this.studyRepository.save(documentId, kind, sourceKey, content as object)
    return { kind, content: row.content, createdAt: row.updatedAt }
  }

  private async ask(system: string, title: string, text: string) {
    return chatCompletion(
      {
        model: env.OPENROUTER_TEXT_MODEL,
        system,
        content: [{ type: 'text', text: `Title: ${title}\n\n${text}` }],
        json: true,
        purpose: 'study',
      },
      90_000,
    )
  }

  private async summarise(title: string, text: string, language: string): Promise<Summary> {
    const system =
      `You help people learn from what they read. Write in ${language}. ` +
      'Reply as JSON: {"summary": a clear 120–200 word overview, "keyPoints": 5 to 8 short key points, one idea each}. ' +
      'Use only what the document says; do not add outside facts.'
    for (let attempt = 0; attempt < 2; attempt++) {
      const parsed = parseJson(await this.ask(system, title, text))
      if (isSummary(parsed)) return { summary: parsed.summary.trim(), keyPoints: parsed.keyPoints.map((p) => p.trim()).filter(Boolean) }
    }
    throw new AppError("Couldn't summarise this document. Try again.", 502, 'PROVIDER_ERROR')
  }

  private async quiz(title: string, text: string, language: string): Promise<Quiz> {
    const system =
      `You write multiple-choice quizzes that test understanding of a document, in ${language}, ` +
      `in the style of school and job exams. Make ${QUIZ_QUESTIONS} questions that each have exactly 4 options and one correct answer, ` +
      'mixing easy and harder ones, covering the whole document, and answerable from the document alone. Vary which option is correct. ' +
      'Reply as JSON: {"questions": [{"question": string, "options": [4 strings], "answer": index of the correct option (0-3), "explanation": one sentence}]}.'
    for (let attempt = 0; attempt < 2; attempt++) {
      const parsed = parseJson(await this.ask(system, title, text))
      if (isQuiz(parsed)) return { questions: parsed.questions.slice(0, QUIZ_QUESTIONS) }
    }
    throw new AppError("Couldn't make a quiz for this document. Try again.", 502, 'PROVIDER_ERROR')
  }
}
