export class HttpError extends Error {
  constructor(public statusCode: number, public code: string, public issues?: string[]) { super(code); }
}
