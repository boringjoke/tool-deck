export type ToolErrorCode =
  | 'empty-input'
  | 'invalid-input'
  | 'unsupported-input'
  | 'out-of-range'
  | 'invalid-state'
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

/** 创建表示成功的工具结果对象。 */
export function success<T>(value: T): ToolResult<T> {
  return { ok: true, value }
}

/** 创建包含错误码和提示信息的失败结果对象。 */
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
