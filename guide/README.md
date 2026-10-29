# guide

《Tomoyo After》全成就中文指南（PSP 对照）的生成脚本与成品。

## 成品

`Tomoyo After 全成就中文指南（PSP对照）.html` —— 单文件离线 HTML，27 个成就、35 行流程表、124 条 PSP 译文对照，图片全部 base64 内嵌，无外部依赖，双击即可打开。

## 重新生成

```bash
node build.js
```

依赖同目录下的 `raw.html`（原始指南页的抓取快照）与 `assets/`（27 张成就图标、封面、介绍图）。

## 其余脚本

| 文件 | 用途 |
| --- | --- |
| `pairs.js` | 从 `../patch/` 抽出英文原文与中文译文的配对 |
| `split.js` / `titles.js` / `table.js` / `opt.js` / `map.js` | 解析原始指南页的四个 section、章节标题、流程表与选项 |
| `pspopts.js` / `ctx.js` / `hexprobe.js` | 在 PSP 版 `.scr` 中定位选项原文 |

`ctx.js` 和 `hexprobe.js` 需要 PSP 版 `.scr`：请放到本目录下新建的 `scr/` 里再运行。该文件属于游戏本体资源，不随本仓库分发。

## 译文来源

指南里的中文对照取自 PSP 版游戏脚本的原始字符串，不是自行翻译。因此人名按 PSP 版走：`Tomo` = 小智、`Takafumi` = 鹰文、`Kanako` = 河南子、`Tomoyo` = 智代。原指南中的已知瑕疵（如 `Build a schhool` 拼写错误）保留原文，只在中文侧补充说明。
