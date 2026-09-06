<script setup lang="ts">
import { defineAsyncComponent, onMounted } from 'vue'
import { useToolPreferences } from '~/composables/useToolPreferences'
import { findPublicToolBySlug } from '~/registry'
import { getToolComponentLoader } from '~/tools'

const route = useRoute()
const tool = findPublicToolBySlug(String(route.params.slug))

if (!tool) {
  throw createError({
    statusCode: 404,
    message: '工具不存在或尚未公开',
  })
}

const { isFavorite, recordRecent, toggleFavorite } = useToolPreferences()
const toolComponentLoader = getToolComponentLoader(tool.slug)

if (!toolComponentLoader) {
  throw createError({
    statusCode: 500,
    message: '工具模块尚未接入',
  })
}

const ToolComponent = defineAsyncComponent(toolComponentLoader)

const characterCountInfo = {
  usage: [
    '在输入框中输入或粘贴需要统计的文本。',
    '实时查看字符、词数、句子、段落和行数等结果。',
    '需要时复制统计结果，或清空输入重新开始。',
  ],
  notes: [
    '字符按用户可见的 Unicode 字素统计；不含空格会排除 Unicode 空白字符。',
    '词数和句子使用浏览器标准分词能力，段落按空行分隔，行数按换行符统计。',
    '所有处理在当前浏览器本地完成，输入不会上传至服务器。',
  ],
}

const urlToolInfo = {
  usage: [
    '选择解析与参数编辑、URL 编码或 URL 解码模式。',
    '解析模式输入包含协议的完整绝对 URL，查看 Origin、Path 和查询参数。',
    '编辑、增加或删除参数后，可重建完整 URL，或生成 SQL WHERE IN 条件。',
    '编码或解码模式选择 URL 组件或完整 URL 语义，再执行对应操作。',
  ],
  notes: [
    '解析模式要求完整绝对 URL；重建 URL 时会使用标准组件编码，原始编码形式可能被规范化。',
    '重复参数、空值和参数顺序会被保留；SQL 会按参数名分组并转义标识符和字符串。',
    '解析不会发起网络请求，也不会检测 URL 是否可访问。',
    '所有输入和结果仅在当前浏览器页面内处理，不会上传或写入持久化存储。',
  ],
}

const timestampInfo = {
  usage: [
    '选择时间戳转日期时间，或日期时间转时间戳。',
    '时间戳模式选择秒/毫秒后输入整数；日期模式默认使用日期时间选择器。',
    '需要时切换到 ISO 8601 文本，选择本地时间或 UTC，再点击“开始转换”。',
    '也可以使用“使用当前时间”快捷填入当前值，并复制转换结果。',
  ],
  notes: [
    '日期时间选择器输入不带时区，按上方的本地时间/UTC选项解释。',
    'ISO 8601 文本支持无时区、Z、显式偏移和毫秒；带时区的输入按自身时区语义解析。',
    '本地时间使用当前浏览器时区；夏令时边界可能存在本地时间歧义。',
    '所有转换在浏览器本地完成，不读取网络时间，也不会保存或上传输入。',
  ],
}

const uuidInfo = {
  usage: [
    '设置生成数量，并选择是否使用大写字母。',
    '点击“生成 UUID”创建新的标准 UUID v4 结果。',
    '需要时复制全部结果，或导出为每行一个 UUID 的 TXT 文件。',
  ],
  notes: [
    '生成数量和 UUID v4 输出格式遵循批次 1A 已确认规则。',
    '每次生成都会重新使用浏览器安全随机源，不使用 Math.random()。',
    '结果仅保留在当前页面内存中，不会写入 URL、收藏、最近使用或其他持久化存储。',
    '所有生成过程在浏览器本地完成，不会上传 UUID 或请求外部服务。',
  ],
}

const passwordInfo = {
  usage: [
    '设置账号总长度、前缀和后缀，再设置密码长度、生成数量和字符类型。',
    '点击“生成账号密码”创建成对结果；需要时复制全部结果或清空当前页面状态。',
    '修改配置后可以重复生成，账号和密码的生成数量保持一致。',
  ],
  notes: [
    '密码长度为 4–32，生成数量为 1–100；账号总长度为 4–32，前缀和后缀计入总长度。',
    '启用多种密码字符类型时，每个已选类型至少出现一次；前缀和后缀只允许字母、数字、点、下划线和短横线。',
    '生成使用浏览器 Web Crypto 安全随机源，不使用 Math.random()；没有安全随机源时不会展示部分结果。',
    '账号和密码只保留在当前页面内存中，不提供账号管理、密码保存、密码历史或云端生成，也不会上传服务器。',
  ],
}

const baseInfo = {
  usage: [
    '设置源进制和目标进制，支持 2–36 的自定义进制。',
    '输入整数文本后点击“开始转换”，查看目标进制结果。',
    '需要时开启输出大写字母或 2/8/16 进制前缀，再复制结果或清空当前状态。',
  ],
  notes: [
    '支持正负号、与源进制匹配的 0b、0o、0x 前缀和最多 1024 个字符的整数文本。',
    '转换使用 BigInt 处理大整数；不支持小数、科学计数法或近似转换，非法字符会提示位置和源进制。',
    '输出前缀仅适用于二进制、八进制和十六进制；大小写选项只影响进制字母和对应前缀。',
    '所有输入和结果仅在当前浏览器页面内处理，不会上传或写入持久化存储。',
  ],
}

const jsonWorkbenchInfo = {
  usage: [
    '输入或粘贴标准 JSON，选择 2 个空格、4 个空格或 Tab 缩进。',
    '点击“开始格式化”生成可阅读的多行 JSON；输入变化不会自动执行格式化。',
    '格式化成功后可以复制结果；点击“清空”会清除输入、结果和错误状态。',
  ],
  notes: [
    '只接受标准 JSON 语法，不支持注释、单引号、尾逗号、undefined、NaN 或 Infinity。',
    '对象重复键遵循浏览器标准解析行为，后出现的同名键会覆盖先出现的值；超出 JavaScript 安全整数精度的数字可能发生精度变化。',
    '格式化失败时会保留上一次成功结果，并明确标记它不是当前输入的成功结果；当前工具不设置输入硬上限。',
    '所有输入、结果和错误都只在当前浏览器页面内处理，不会上传 JSON、写入 URL 或持久化存储，也不提供文件下载。',
  ],
}

onMounted(() => {
  recordRecent(tool.slug)
})

usePublicSeo({
  title: `${tool.title} · Tool Deck`,
  description: tool.description,
  pathname: `/tools/${tool.slug}`,
})
</script>

<template>
  <ToolPageShell
    :tool="tool"
    :info="
      tool.slug === 'character-count'
        ? characterCountInfo
        : tool.slug === 'url-tool'
          ? urlToolInfo
          : tool.slug === 'timestamp'
            ? timestampInfo
            : tool.slug === 'uuid-generator'
              ? uuidInfo
              : tool.slug === 'password-generator'
                ? passwordInfo
                : tool.slug === 'json-workbench'
                  ? jsonWorkbenchInfo
                : tool.slug === 'base-converter'
                  ? baseInfo
                  : undefined
    "
    :is-favorite="isFavorite(tool.slug)"
    @toggle-favorite="toggleFavorite(tool.slug)"
  >
    <component :is="ToolComponent" />
  </ToolPageShell>
</template>
