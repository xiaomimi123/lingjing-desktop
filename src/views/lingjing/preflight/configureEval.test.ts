import { describe, it, expect } from 'vitest'
import { evaluateConfigureStep } from './configureEval'

describe('evaluateConfigureStep', () => {
  it('bypass=ok openclaw=ok → ok=true, no warning', () => {
    const r = evaluateConfigureStep({ bypass: 'ok', openclaw: 'ok' })
    expect(r.ok).toBe(true)
    expect(r.message).toBe('')
  })

  it('bypass=ok openclaw=error → ok=true, with warning', () => {
    const r = evaluateConfigureStep({
      bypass: 'ok',
      openclaw: 'error',
      openclawMessage: 'daemon down',
    })
    expect(r.ok).toBe(true)
    expect(r.message).toContain('OpenClaw fallback')
  })

  it('bypass=error openclaw=ok → ok=false, message names bypass', () => {
    const r = evaluateConfigureStep({
      bypass: 'error: HTTP 500',
      openclaw: 'ok',
    })
    expect(r.ok).toBe(false)
    expect(r.message).toContain('bypass 失败')
  })

  it('cfg null → ok=false', () => {
    const r = evaluateConfigureStep(null)
    expect(r.ok).toBe(false)
    expect(r.message).toContain('bypass 失败')
  })
})
