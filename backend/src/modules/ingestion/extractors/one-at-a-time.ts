let running: Promise<unknown> = Promise.resolve()

/**
 * Runs heavy file reading (EPUB, DOCX, PDF) one file at a time in this
 * process, so two big imports don't need their memory at the same moment.
 */
export function oneAtATime<T>(task: () => Promise<T>): Promise<T> {
  const result = running.then(task)
  running = result.catch(() => undefined)
  return result
}
