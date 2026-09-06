export type ToolErrorCode =
  | 'empty-input'
  | 'invalid-input'
  | 'unsupported-input'
  | 'out-of-range'
  | 'crypto-unavailable'
  | 'operation-failed'

export interface ToolError {
  code: ToolErrorCode
  message: string
  details?: string
}

export type ToolResult<T> =
  | {
      ok: true
      value: T
    }
  | {
      ok: false
      error: ToolError
    }

export function success<T>(value: T): ToolResult<T> {
  return { ok: true, value }
}

export function failure<T = never>(
  code: ToolErrorCode,
  message: string,
  details?: string,
): ToolResult<T> {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  }
}
