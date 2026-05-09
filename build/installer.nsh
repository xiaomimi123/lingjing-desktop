; ============================================================================
; 灵境 v1.2.3+ NSIS 自定义卸载脚本
;
; 解决问题: 旧版本 (v1.0.x / v1.2.0-1.2.2) 卸载时不清理 OpenClaw daemon 和
; 配置文件,导致重装后协议错位,chat.send 卡死。本脚本:
;   1. 杀占 18789-18795 的残留 daemon 进程
;   2. 删 OpenClaw 相关 Scheduled Tasks
;   3. 删 ~/.openclaw  +  ~/.openclaw-lingjing 配置目录
;   4. 询问用户是否同时删 %APPDATA%\灵境 数据目录(默认保留)
;
; electron-builder 的 nsis.include 配置加载本文件,卸载流程会自动调
; customUnInstall 宏(无需手动钩子)。
; ============================================================================

!macro customUnInstall
  DetailPrint "正在清理 OpenClaw 残留进程和任务..."

  ; 用 PowerShell 一次性杀进程 + 删 task,失败不阻塞卸载。
  ; NSIS 用 $ 当变量前缀,PowerShell 也用 $;所以 PS 的 $xxx 在这里要写成 $$xxx 才会
  ; 在生成的 NSIS 脚本里输出为字面量 $xxx 给 PowerShell。
  nsExec::ExecToLog 'powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -Command "$$ErrorActionPreference=\"SilentlyContinue\"; foreach ($$p in 18789..18795) { $$c = Get-NetTCPConnection -LocalPort $$p -State Listen -ErrorAction SilentlyContinue; if ($$c) { Stop-Process -Id $$c.OwningProcess -Force -ErrorAction SilentlyContinue } }; foreach ($$n in @(\"OpenClaw Gateway\",\"OpenClaw Gateway (lingjing)\",\"openclaw-gateway\",\"openclaw-gateway-lingjing\",\"OpenClaw_Gateway\",\"openclaw\")) { schtasks /End /TN $$n 2>$$null | Out-Null; schtasks /Delete /TN $$n /F 2>$$null | Out-Null }"'

  DetailPrint "正在删除 OpenClaw 配置目录..."
  RMDir /r "$PROFILE\.openclaw"
  RMDir /r "$PROFILE\.openclaw-lingjing"

  ; 询问用户是否清理灵境的应用数据(数据库 / 聊天历史 / 备份)
  ; 默认 NO(保留),用户主动选 YES 才彻底清理
  MessageBox MB_YESNO|MB_ICONQUESTION|MB_DEFBUTTON2 "是否同时删除灵境的应用数据?$\n$\n包含: 聊天历史、账户配置、本地数据库、备份文件$\n位置: %APPDATA%\灵境\$\n$\n选「是」彻底清理(下次安装相当于全新)$\n选「否」保留(下次安装可继续使用历史数据)" IDNO skip_appdata_cleanup
  DetailPrint "正在删除灵境应用数据目录..."
  RMDir /r "$APPDATA\灵境"
  Goto cleanup_done
  skip_appdata_cleanup:
    DetailPrint "已保留灵境应用数据目录 $APPDATA\灵境"
  cleanup_done:
!macroend
