'use strict';
// 生成 GitHub Release 的 JSON body，避免 shell heredoc 的反斜杠转义问题
const fs = require('fs');

const body = `## Tomoyo After English Edition（Steam）简体中文补丁 v1.0.0

首个完整汉化版本。

### 包含内容

| 文件 | 说明 |
| --- | --- |
| \`version.dll\` | 汉化补丁主程序，20,791 条译文已内嵌（844 KB） |
| \`g00-chs.zip\` | 中文贴图替换包，984 个 \`.g00\` 文件 |
| \`攻略.html\` | 全成就中文指南（PSP 对照），单文件离线可用 |
| \`使用说明.txt\` | 安装步骤与配置说明 |
| \`patch_mode.cfg\` | 补丁模式配置（默认 0 = 正式版） |

### 安装

1. \`version.dll\` 复制到游戏安装目录
2. \`g00-chs.zip\` 解压后把 \`.g00\` 复制到游戏目录下的 \`g00\` 文件夹，覆盖同名文件（建议先备份）
3. 启动游戏

### 译文来源

- **PSP 版汉化文本**：CK-GAL 中文化小组（澄空学园）PSP 完整汉化补丁 ver1.20（2009-04-11，移植自 PS2 版汉化资源）
- **移植与补译**：DeepSeek-V4.1。移植工作包括逐章对齐 PSP 剧本与 Steam 版脚本、按说话人与长度特征做带状 DP 匹配、回填补丁格式；PSP 版未以文本提供的部分（D&T 小游戏道具与技能说明、结局独白等）由其翻译
- **中文贴图**：Nice Rabbit（PC 18 禁版反河蟹补丁）
- **攻略**：咲夜 · [Steam 指南](https://steamcommunity.com/sharedfiles/filedetails/?id=3488465923)

### 状态

- 文本翻译已全部完成（20,791 / 20,791 条）
- 正在推进一周目实测，检查文本显示与修复 bug
- **已知问题**：个别中文贴图存在错位，将在后续版本修复

### 校验

- DLL 内嵌数据经回读校验：章节 96、条目 20,791、中文字符 222,705、数据零误差
- 实机启动验证：补丁正常加载，无初始化失败提示

### 许可

仅限非商业用途。原始项目：[VLSMB/TomoyoAfterSteamCHSPatch](https://github.com/VLSMB/TomoyoAfterSteamCHSPatch)`;

const payload = {
  tag_name: 'v1.0.0',
  target_commitish: 'master',
  name: 'v1.0.0 — 简体中文汉化补丁',
  body,
  draft: false,
  prerelease: false,
};

const out = process.argv[2] || '/tmp/rel_body.json';
fs.writeFileSync(out, JSON.stringify(payload), 'utf8');
console.log('已写入', out, fs.statSync(out).size, '字节');
