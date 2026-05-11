import { describe, it, expect } from 'vitest'
import { injectLingjingSystemPrompt, LINGJING_SYSTEM_PROMPT } from './systemPrompt'

describe('injectLingjingSystemPrompt', () => {
  it('messages 为空 → 加 system prompt 在首位', () => {
    const r = injectLingjingSystemPrompt({ messages: [] })
    expect(r.messages).toHaveLength(1)
    expect(r.messages[0]).toEqual({ role: 'system', content: LINGJING_SYSTEM_PROMPT })
  })

  it('messages 首位是 user → 加 system 在首位', () => {
    const r = injectLingjingSystemPrompt({
      messages: [{ role: 'user', content: '你好' }],
    })
    expect(r.messages).toHaveLength(2)
    expect(r.messages[0].role).toBe('system')
    expect(r.messages[1].content).toBe('你好')
  })

  it('messages 首位已是 system → 保留原 system, 不覆盖', () => {
    const r = injectLingjingSystemPrompt({
      messages: [
        { role: 'system', content: '自定义 prompt' },
        { role: 'user', content: '你好' },
      ],
    })
    expect(r.messages).toHaveLength(2)
    expect(r.messages[0].content).toBe('自定义 prompt')
  })

  it('其他 params 字段保留 + 不变异原对象', () => {
    const original: any = { messages: [], model: 'gpt-5.4', stream: true }
    const r = injectLingjingSystemPrompt(original)
    expect(r.model).toBe('gpt-5.4')
    expect(r.stream).toBe(true)
    expect(original.messages).toHaveLength(0)
  })
})
