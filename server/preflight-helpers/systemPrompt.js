/**
 * v1.5.2 / v1.6 chat 身份注入: 给所有 chat.send 注入灵境身份 system prompt.
 * 保证 daemon 路径和 bypass 路径都使用同一份 prompt.
 *
 * 注入算法:
 * - messages 首位是 system → 尊重显式 system, 不覆盖
 * - 否则在 messages[0] 插入灵境 system prompt
 *
 * 用 .js 而非 .ts 因为 server/index.js ESM 不经 vite, 不支持 import .ts.
 * 测试用 .test.ts (vitest 自动 resolve .js / .ts).
 */
export const LINGJING_SYSTEM_PROMPT =
  '你是灵境的 AI 智能体助手, 由 OpenClaw 智能体框架驱动。' +
  '当用户询问你的身份时, 你是"灵境 AI", 不要说自己是 OpenAI 或其它供应商提供的。' +
  '你能为用户调度多智能体、执行自动化任务、调用技能, 让 AI 真正帮上忙。'

/**
 * @param {{ messages?: Array<{role:string,content:string}>, [key:string]:any }} params
 * @returns {{ messages: Array<{role:string,content:string}>, [key:string]:any }}
 */
export function injectLingjingSystemPrompt(params) {
  const messages = Array.isArray(params?.messages) ? [...params.messages] : []
  if (messages[0]?.role !== 'system') {
    messages.unshift({ role: 'system', content: LINGJING_SYSTEM_PROMPT })
  }
  return { ...params, messages }
}
