# =====================================================================
# v1.2.0 Release 上传脚本
#
# 用法：右键此文件 -> 使用 PowerShell 运行
#   或：powershell -ExecutionPolicy Bypass -File 上传v1.2.0.ps1
#
# 作用：在 GitHub 上创建 v1.2.0 Release 并上传 5 个发布文件
# =====================================================================

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$Repo   = "will86863/TomoyoAfterSteamCHSPatch"
$Tag    = "v1.2.0"
$SrcDir = "D:\SteamLibrary\steamapps\common\Tomoyo After ~It's a Wonderful Life~ English Edition\_patch_src\40_产物\发布包\TomoyoAfterSteamCHSPatch-v1.2.0"

# --- 1. 取 token ---
Write-Host "[1/4] 读取 GitHub 凭据..." -ForegroundColor Cyan
$cred  = "protocol=https`nhost=github.com`n`n" | git credential fill 2>$null
$token = ($cred | Select-String '^password=(.+)$').Matches.Groups[1].Value

if (-not $token) {
    Write-Host "  [X] 没取到 token，请先配置 Git 凭据。" -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] token 已取得（长度 $($token.Length)）" -ForegroundColor Green

$Headers = @{
    Authorization          = "token $token"
    Accept                 = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
}

# --- 2. 创建 Release ---
Write-Host "[2/4] 创建 Release $Tag ..." -ForegroundColor Cyan

$lines = @(
    "## 本版更新",
    "",
    "- **patch/ 更新至完整译文**：98 章、20,792 条全部汉化",
    "- **重新编译 version.dll**：去除调试诊断代码，体积 1,001,472 字节",
    "- **仓库精简**：移除 guide/（全成就指南）与 tools/（迁移脚本）目录",
    "- **README 重写**：补充仓库结构、patch 文件格式说明、版本历史",
    "",
    "## 包含内容",
    "",
    "| 文件 | 说明 |",
    "| --- | --- |",
    "| version.dll | 汉化补丁主程序（文本已内嵌） |",
    "| g00-chs.zip | 中文贴图替换包（984 个 .g00） |",
    "| 攻略.html | 全成就中文指南（PSP 对照） |",
    "| patch_mode.cfg | 补丁模式配置（默认 0） |",
    "| 使用说明.txt | 安装说明 |",
    "",
    "## 安装",
    "",
    "1. version.dll 复制到游戏根目录",
    "2. g00-chs.zip 解压后复制到游戏 g00/ 文件夹，覆盖同名文件（建议先备份）",
    "3. 启动游戏",
    "",
    "## 已知问题",
    "",
    "- **全屏逐字叙述不显示中文**：全屏白底逐字弹出的叙述模式（SEEN9900）不经过 consume hook，该模式下显示英文原文",
    "- **部分贴图错位**：中文贴图中有个别存在错位，待修复",
    "",
    "## 译文来源",
    "",
    "- PSP 版汉化文本：CK-GAL 中文化小组（澄空学园）PSP 完整汉化补丁 ver1.20",
    "- 移植与补译：DeepSeek-V4.1",
    "- 中文贴图：Nice Rabbit",
    "- 攻略：咲夜",
    "",
    "仅限非商业用途。"
)
$bodyText = $lines -join "`n"

$releaseBody = @{
    tag_name   = $Tag
    name       = "v1.2.0 - 完整汉化版"
    body       = $bodyText
    draft      = $false
    prerelease = $false
} | ConvertTo-Json -Depth 5

# 若已存在则先删
try {
    $existing = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/tags/$Tag" -Headers $Headers -Method Get
    Write-Host "  Release 已存在，删除旧的..." -ForegroundColor Yellow
    Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/$($existing.id)" -Headers $Headers -Method Delete
} catch {
    # 不存在，忽略
}

$release = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases" `
                             -Headers $Headers -Method Post `
                             -Body $releaseBody -ContentType "application/json"

Write-Host "  [OK] Release 已创建：$($release.html_url)" -ForegroundColor Green

# --- 3. 上传文件 ---
Write-Host "[3/4] 上传发布文件..." -ForegroundColor Cyan

$files = @("version.dll", "g00-chs.zip", "攻略.html", "patch_mode.cfg", "使用说明.txt")
$uploadBase = "https://uploads.github.com/repos/$Repo/releases/$($release.id)/assets"

foreach ($f in $files) {
    $path = Join-Path $SrcDir $f
    if (-not (Test-Path $path)) {
        Write-Host "  [X] 文件不存在：$f" -ForegroundColor Red
        continue
    }
    $sizeMB = [math]::Round((Get-Item $path).Length / 1MB, 2)
    Write-Host "  上传 $f ($sizeMB MB)..." -NoNewline

    $encoded = [uri]::EscapeDataString($f)
    $url = "$uploadBase`?name=$encoded"

    try {
        Invoke-RestMethod -Uri $url -Headers $Headers -Method Post `
                          -InFile $path -ContentType "application/octet-stream" | Out-Null
        Write-Host " OK" -ForegroundColor Green
    } catch {
        Write-Host " 失败: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# --- 4. 完成 ---
Write-Host "[4/4] 完成！" -ForegroundColor Cyan
Write-Host ""
Write-Host "  发布页：$($release.html_url)" -ForegroundColor Green
Write-Host ""
Write-Host "按任意键退出..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
