# NoteTranslate 课堂笔记

边听课边记笔记的 Web 应用，参考了 Notability（录音与笔记同步）和 NotebookLM（基于资料的 AI 总结、问答、测验）：

- **收音 + 实时转写**：录下教授讲课，同时把讲话实时转成文字；可选**实时翻译**（比如英文授课 → 中文）。
- **同步记笔记**：每条笔记自动记录写下时的课堂时间。点时间戳就能回听那一刻的录音；回放时笔记会随录音进度逐条出现（Notability 式回放）。可以「⭐ 标记重点」，也可以把转写原句一键加入笔记。
- **实时要点**：录音时大约每 90 秒自动提炼一张要点卡片，走神回来能快速跟上。
- **课堂总结**：下课（结束录音）后自动生成结构化总结：概览、核心要点、分主题详细笔记、术语表、老师强调的考点、待复习问题，全部带可点击回听的时间戳，支持公式渲染。
- **课后测验**：按题量和难度生成选择题，答题后显示解析，并能「回听讲解」跳回老师讲这个知识点的位置；可以重做或再出一套新题。
- **问答**：像 NotebookLM 一样针对这节课提问，回答会引用课堂时间点。
- **导出**：导出 Markdown（总结 + 笔记 + 要点 + 完整转写），下载录音。

所有数据（录音、转写、笔记、测验）都保存在浏览器本地（IndexedDB），服务器只负责转发 AI 请求。

## 快速开始

需要 Node.js 20 或更高版本，以及一个 [Anthropic API Key](https://console.anthropic.com/)。

```bash
npm install
cp .env.example .env.local   # 然后在 .env.local 里填 ANTHROPIC_API_KEY
npm run dev
```

打开 http://localhost:3000 。第一次可以先点 **「体验演示」**：它会播放一段模拟的英文讲课（不需要麦克风），可以完整体验转写、翻译、要点、总结、测验和问答。

## 在 iPad / 手机上使用

- 浏览器只允许在 **HTTPS 或 localhost** 下使用麦克风。在其他设备上使用，需要把应用部署到有 HTTPS 的地址（例如 Vercel），或用 HTTPS 隧道访问开发服务器。
- 在 Safari 里「添加到主屏幕」可以像 App 一样全屏使用。
- 录音时应用会请求保持屏幕常亮。iPadOS / iOS 切到其他 App 或锁屏后，Safari 可能会暂停录音；回来后点「继续录音」即可，新录音会作为下一段接在后面，回放时自动连成一条时间线。

## 浏览器支持

实时转写使用浏览器自带的语音识别（Web Speech API）：

| 浏览器 | 录音 | 实时转写 | 说明 |
|---|---|---|---|
| Chrome（桌面 / Android） | ✅ | ✅ | 识别由 Google 服务完成，需要能访问 Google；在无法访问 Google 的网络下转写不可用 |
| Edge | ✅ | ✅ | 识别由微软服务完成 |
| Safari（macOS / iPadOS / iOS） | ✅ | ✅ | |
| Firefox | ✅ | ❌ | 只能录音和记笔记 |

浏览器不支持语音识别或识别出错时，录音会继续，界面顶部会提示原因。

注意：使用浏览器语音识别时，音频会发送给浏览器厂商的识别服务（Chrome 是 Google、Edge 是微软、Safari 是 Apple）。转写文字和笔记会发送到本应用的服务器和 Anthropic API 用于生成 AI 内容；录音文件本身不会上传。

## 配置

在 `.env.local` 中设置：

| 变量 | 说明 |
|---|---|
| `ANTHROPIC_API_KEY` | 必填。只在服务器端使用，不会发给浏览器 |
| `CLAUDE_MODEL` | 可选，默认 `claude-opus-5-5` |
| `CLAUDE_FALLBACKS` | 可选，默认 `default`：模型的安全分类器拒答时，由 API 自动换用推荐的备用模型重试；设为 `off` 关闭（换成不支持该功能的模型时需要关闭） |

各项 AI 功能对模型的调用：

| 功能 | 何时调用 | 推理强度 (effort) |
|---|---|---|
| 实时要点 | 录音时约每 90 秒一次 | low |
| 实时翻译 | 每凑够几句话一次（最多等约 4 秒） | low |
| 课堂总结 | 下课时自动一次，之后手动 | medium |
| 问答 | 每次提问 | medium |
| 测验 | 每次出题 | high（答案必须准确） |

课堂材料（转写 + 笔记）作为可缓存的提示前缀发送，同一节课连续问答时能命中提示缓存，降低费用。

## 部署

可以直接部署到 Vercel 等支持 Next.js 的平台，记得在平台上配置 `ANTHROPIC_API_KEY`。

⚠️ 应用本身没有登录功能：任何拿到网址的人都能通过你的服务器调用 Claude，消耗你的 API 额度。公开部署时请加上访问保护（例如 Vercel 的 Password Protection，或放在只有自己能访问的网络里）。

## 开发

```bash
npm run dev        # 开发服务器
npm test           # 单元测试（vitest）
npm run typecheck  # 类型检查
npm run build      # 生产构建
```

项目结构：

```
app/
  page.tsx                  笔记库首页
  lecture/[id]/page.tsx     上课页面（转写 | 笔记 | AI 助手）
  api/                      服务端路由：digest 要点、translate 翻译、summary 总结、chat 问答、quiz 测验、status
components/                 界面组件（NotesEditor、TranscriptPanel、ai/ 下的四个标签页等）
lib/
  client/                   浏览器端：录音（MediaRecorder）、语音识别、课堂时钟、回放、实时 AI 调度
  server/                   服务端：Claude 调用（流式输出、结构化输出）、提示词
  db.ts                     IndexedDB 数据结构（Dexie）
tests/                      单元测试
```

## 之后可以做的

- 手写笔记（Apple Pencil），并让 AI 读懂手写内容
- 上传课件 PDF / 幻灯片，作为总结、问答和出题的参考资料
- 接入云端语音识别（更高的识别准确率，并且不依赖浏览器）
- 多设备同步、闪卡复习
