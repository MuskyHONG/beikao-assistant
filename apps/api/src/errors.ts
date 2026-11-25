export class HttpError extends Error {
  constructor(public statusCode: number, public code: string, public issues?: string[], public currentRevision?: number) { super(code); }
}
