/**
 * v1.5.x 修复: PreflightPage 第 4 步 configure 检查的真相是 cfg.bypass 而非 cfg.openclaw。
 * - bypass='ok' 意味着 lingjingApiToken 已注入到 server 内存(chat.send 走的真实路径)
 * - openclaw 是 OpenClaw daemon 配置 status, v1.5 是 fallback
 *
 * 抽成 pure function 便于单元测试。
 */
export interface ConfigureCfg {
  bypass?: string
  bypassMessage?: string
  openclaw?: string
  openclawMessage?: string
  message?: string
  [key: string]: any
}

export interface EvalResult {
  ok: boolean
  message: string
}

export function evaluateConfigureStep(cfg: ConfigureCfg | null | undefined): EvalResult {
  const bypassOk = cfg?.bypass === 'ok'
  const openclawOk = cfg?.openclaw === 'ok'

  if (bypassOk) {
    return {
      ok: true,
      message: openclawOk ? '' : 'OpenClaw fallback 失配,但 chat 走 bypass 仍可用',
    }
  }

  const reason =
    cfg?.bypassMessage ||
    cfg?.message ||
    cfg?.openclawMessage ||
    cfg?.bypass ||
    '未知'
  return {
    ok: false,
    message: `bypass 失败: ${reason}`,
  }
}
