<script setup lang="ts">
import { computed, ref } from 'vue'
import { getSecureRandomSource } from '~/adapters/secure-random'
import {
  ACCOUNT_MAX_LENGTH,
  ACCOUNT_MIN_LENGTH,
  CREDENTIAL_MAX_COUNT,
  CREDENTIAL_MIN_COUNT,
  generateCredentials,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  type CredentialPair,
} from '~/core/password'
import type { ToolError } from '~/core/tool-result'
import type { ToolUiStatus } from '~/types/tool'

const count = ref(1)
const passwordLength = ref(16)
const accountLength = ref(12)
const accountPrefix = ref('')
const accountSuffix = ref('')
const includeLowercase = ref(true)
const includeUppercase = ref(true)
const includeDigits = ref(true)
const includeSymbols = ref(true)
const results = ref<CredentialPair[]>([])
const error = ref<ToolError | null>(null)

const status = computed<ToolUiStatus>(() => {
  if (error.value) {
    return 'error'
  }

  return results.value.length ? 'success' : 'idle'
})

const resultText = computed(() => results.value
  .map((item) => `${item.username}\t${item.password}`)
  .join('\n'))

function generate() {
  const source = getSecureRandomSource()

  if (!source) {
    results.value = []
    error.value = {
      code: 'crypto-unavailable',
      message: '当前浏览器没有可用的安全随机源，无法生成账号密码。',
    }
    return
  }

  const result = generateCredentials(
    {
      length: accountLength.value,
      prefix: accountPrefix.value,
      suffix: accountSuffix.value,
    },
    {
      length: passwordLength.value,
      count: count.value,
      includeLowercase: includeLowercase.value,
      includeUppercase: includeUppercase.value,
      includeDigits: includeDigits.value,
      includeSymbols: includeSymbols.value,
    },
    source,
  )

  if (!result.ok) {
    results.value = []
    error.value = result.error
    return
  }

  results.value = result.value
  error.value = null
}

function clearAll() {
  count.value = 1
  passwordLength.value = 16
  accountLength.value = 12
  accountPrefix.value = ''
  accountSuffix.value = ''
  includeLowercase.value = true
  includeUppercase.value = true
  includeDigits.value = true
  includeSymbols.value = true
  results.value = []
  error.value = null
}
</script>

<template>
  <div class="tool-workspace tool-workspace--split password-tool">
    <div class="password-tool__configuration">
      <ToolInputPanel title="账号配置" description="账号总长度包含前缀和后缀，随机主体使用字母和数字生成。">
        <div class="tool-field-grid tool-field-grid--three">
          <label class="tool-field">
            <span class="tool-field__label">账号长度（{{ ACCOUNT_MIN_LENGTH }}–{{ ACCOUNT_MAX_LENGTH }}）</span>
            <input v-model.number="accountLength" class="tool-input" type="number" :min="ACCOUNT_MIN_LENGTH" :max="ACCOUNT_MAX_LENGTH" step="1" aria-label="账号总长度">
          </label>
          <label class="tool-field">
            <span class="tool-field__label">前缀</span>
            <input v-model="accountPrefix" class="tool-input" maxlength="32" placeholder="例如：user_" aria-label="账号前缀">
          </label>
          <label class="tool-field">
            <span class="tool-field__label">后缀</span>
            <input v-model="accountSuffix" class="tool-input" maxlength="32" placeholder="例如：_dev" aria-label="账号后缀">
          </label>
        </div>
      </ToolInputPanel>

      <ToolInputPanel title="密码配置" description="开启多种类型时，每个已选类型至少出现一次；密码不会自动保存。">
        <div class="tool-field-grid tool-field-grid--two">
          <label class="tool-field">
            <span class="tool-field__label">密码长度（{{ PASSWORD_MIN_LENGTH }}–{{ PASSWORD_MAX_LENGTH }}）</span>
            <input v-model.number="passwordLength" class="tool-input" type="number" :min="PASSWORD_MIN_LENGTH" :max="PASSWORD_MAX_LENGTH" step="1" aria-label="密码长度">
          </label>
          <label class="tool-field">
            <span class="tool-field__label">生成数量（{{ CREDENTIAL_MIN_COUNT }}–{{ CREDENTIAL_MAX_COUNT }}）</span>
            <input v-model.number="count" class="tool-input" type="number" :min="CREDENTIAL_MIN_COUNT" :max="CREDENTIAL_MAX_COUNT" step="1" aria-label="账号密码生成数量">
          </label>
        </div>

        <div class="tool-check-grid" aria-label="密码字符类型">
          <label class="tool-check-field"><input v-model="includeLowercase" type="checkbox"><span>小写字母</span></label>
          <label class="tool-check-field"><input v-model="includeUppercase" type="checkbox"><span>大写字母</span></label>
          <label class="tool-check-field"><input v-model="includeDigits" type="checkbox"><span>数字</span></label>
          <label class="tool-check-field"><input v-model="includeSymbols" type="checkbox"><span>符号</span></label>
        </div>

        <div class="tool-panel__actions">
          <button type="button" class="button button--primary" @click="generate">生成账号密码</button>
          <ClearButton :disabled="!results.length && !error" @clear="clearAll" />
        </div>
      </ToolInputPanel>
    </div>

    <ToolResultPanel title="账号密码结果" :status="status" :error="error" empty-text="设置账号和密码规则后，点击“生成账号密码”。">
      <div class="credential-table-wrap">
        <table class="credential-table">
          <thead><tr><th scope="col">账号</th><th scope="col">密码</th></tr></thead>
          <tbody>
            <tr v-for="item in results" :key="`${item.username}-${item.password}`">
              <td><code>{{ item.username }}</code></td>
              <td><code>{{ item.password }}</code></td>
            </tr>
          </tbody>
        </table>
      </div>
      <template #actions>
        <CopyButton :text="resultText" label="复制账号密码" />
      </template>
    </ToolResultPanel>
  </div>
</template>
