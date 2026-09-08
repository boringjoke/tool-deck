import { failure, success, type ToolResult } from './tool-result'

export type SimplifiedTraditionalMode = 'simplified-to-traditional' | 'traditional-to-simplified'

export interface SimplifiedTraditionalOptions {
  mode: SimplifiedTraditionalMode
  value: string
}

type ConverterFunction = (value: string) => string

const converters: Partial<Record<SimplifiedTraditionalMode, Promise<ConverterFunction>>> = {}

/** 按转换方向异步创建 OpenCC 转换器。 */
async function createConverter(mode: SimplifiedTraditionalMode): Promise<ConverterFunction> {
  if (mode === 'simplified-to-traditional') {
    const [{ ConverterBuilder }, locale] = await Promise.all([
      import('opencc-js/core'),
      import('opencc-js/preset/cn2t'),
    ])

    return ConverterBuilder(locale)({ from: 'cn', to: 't' })
  }

  const [{ ConverterBuilder }, locale] = await Promise.all([
    import('opencc-js/core'),
    import('opencc-js/preset/t2cn'),
  ])

  return ConverterBuilder(locale)({ from: 't', to: 'cn' })
}

/** 获取或缓存指定方向的 OpenCC 转换器。 */
function getConverter(mode: SimplifiedTraditionalMode): Promise<ConverterFunction> {
  const existingConverter = converters[mode]

  if (existingConverter) {
    return existingConverter
  }

  const converter = createConverter(mode)
  converters[mode] = converter
  return converter
}

/** 使用本地词库执行简体繁体文本转换。 */
export async function convertSimplifiedTraditional(
  options: SimplifiedTraditionalOptions,
): Promise<ToolResult<string>> {
  if (!options.value.trim()) {
    return failure('empty-input', '请输入需要转换的中文文本。')
  }

  try {
    return success((await getConverter(options.mode))(options.value))
  } catch {
    return failure('operation-failed', '本地转换暂时失败，请重试。')
  }
}
