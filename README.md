# WebTask Copilot 网页助手

在 U 校园教材里，点一下「提取本组」就能把眼前的练习整理到侧边面板。做听力时，还可以把录音或视频里的英文转成文字，对照题目回听。当前版本 **v0.7.4**，以下教程以 **Windows 64 位电脑和 Microsoft Edge 浏览器** 为例。

## 它基于什么技术？

| 你看到的功能 | 背后用的技术 | 在哪里运行 |
| --- | --- | --- |
| 网页上的「WebTask 助手」和题目提取 | 用 TypeScript 编写，通过 Vite 打包成一个 JavaScript 文件，由 Tampermonkey（油猴）加载。脚本读取教材页面中的题干、选项和空号。 | Edge 浏览器 |
| 把听力或视频中的英文变成文字 | Python 运行 Vosk 英文语音识别模型，按段落返回文字和起始时间。Windows 完整版已带齐程序和模型。 | 你的电脑，可离线识别 |
| 讲题、追问、整理知识点 | 用你自己的 API Key 调用 DeepSeek。题目和转写可以先预览，再决定是否发送。 | DeepSeek 云端，需联网 |

## 第一次使用，跟着做一遍

### 1. 先选下载文件

- **要做听力或视频题**：下载 [Windows 64 位完整版 ZIP（约 150 MiB）](https://github.com/LuoQue-tian/webtask-copilot/releases/download/v0.7.4/WebTask-Copilot-v0.7.4-Windows-x64.zip)。在 Edge 按 `Ctrl+J` 找到下载记录，打开所在文件夹，右键 ZIP → **全部提取** → **提取**。打开解压后的文件夹，找到 **webtask-copilot.user.js** 和 **启动英文转写.cmd**。模型已经在里面了。
- **只想提取题目或让 AI 讲题**：只需要一个脚本。先做第 2 步，再点第 3 步的安装链接。
- **想看源码或自己开发**：到[发行页](https://github.com/LuoQue-tian/webtask-copilot/releases/tag/v0.7.4)选择 **Source code (zip)**。页面上的两个 ZIP 用途不同，带有 **Windows-x64** 字样的是上面说的听力完整版。

### 2. 给 Edge 装上油猴

1. 用 Edge 打开 [Tampermonkey 官方下载页](https://www.tampermonkey.net/)，选择 Microsoft Edge，进入扩展商店，点击「获取」→「添加扩展」。已经装过油猴的用户直接检查下一项。
2. 在地址栏输入 `edge://extensions`，按回车。找到 **Tampermonkey**，开启扩展，进入「详细信息」，打开「允许用户脚本」。如果你的版本没有这个开关，可以在扩展管理页开启「开发人员模式」。[官方图解](https://www.tampermonkey.net/faq.php?q=Q209)

### 3. 把 WebTask 助手装进油猴

用刚才的 Edge 点 **[安装 WebTask 助手](https://raw.githubusercontent.com/LuoQue-tian/webtask-copilot/main/dist/webtask-copilot.user.js)**。看到油猴显示「WebTask Copilot 网页助手」，点「安装」。打开油猴「管理面板」→「已安装脚本」，看到助手名称且开关已开启，就装好了。

**如果点开只看到一页代码，或者想用 ZIP 里的脚本手动安装：**

1. 在代码页按 `Ctrl+A` 全选，再按 `Ctrl+C` 复制。如果用的是解压出来的文件，右键 `webtask-copilot.user.js` →「打开方式」→「记事本」，再全选复制。仓库里同一文件在 `dist/webtask-copilot.user.js`。
2. 在 Edge 右上角点拼图图标「扩展」→「Tampermonkey」→「添加新脚本」。也可以从油猴管理面板点标签栏的 **＋**。
3. 点进代码编辑区，按 `Ctrl+A` 选中默认模板，按 `Ctrl+V` 粘贴，再按 `Ctrl+S` 保存。

### 4. 打开一道题，确认助手能用

登录 U 校园，进入教材，把要做的 Task 滚动到正文中央。首次安装后按 `F5` 刷新教材页。点右下角 **WebTask 助手 → 题目 → 提取本组**。面板里出现与正文一致的题干、选项或空号，就表示提取成功。**到这里就能提取题目，无需 API Key。**

### 5. 听力和视频题：启动转写

1. 在第 1 步解压出来的文件夹中双击 **启动英文转写.cmd**。等窗口显示 **已就绪**，保持窗口打开。
2. 回到教材页，在助手里点 **题目 → 音频与转写 → 转写英文原文**。出现带时间标记的英文段落，就转写好了。若播放器还没加载，先播放片刻；若 Edge 弹出共享窗口，选教材所在的标签页并勾选共享音频。
3. 下一组题共用同一段录音或视频时，提取新题组，在「DeepSeek 学习辅导」勾选「沿用面板中的英文转写」。点「预览发送内容」可以核对用的是哪段英文。
4. 用完可关闭转写窗口。下次做听力，双击同一个启动文件即可。

### 6. 想让 AI 讲题时，再连接 DeepSeek

在助手的「设置」里配置自己的 DeepSeek API Key，点击「测试连接」，选择文本模型。回到「题目」，选择某一题或整组 →「预览发送内容」→ 核对题面和转写 →「发送给 DeepSeek」。

要把几组题放在一起复习，可以新建学习会话，每次提取后点「加入当前会话」。在追问小窗里可以指定题号复查答案、总结整次会话的知识点，再把笔记导出为 Markdown。

## 常见问题

**发行页上那串 SHA-256 要填在哪里？** 安装时可以直接跳过。它是根据 ZIP 的全部内容算出来的 64 位十六进制校验值。想确认下载文件完整时，在 ZIP 所在文件夹打开 PowerShell，运行下面的命令，把输出的 Hash 和发行页同一附件旁的 SHA-256 完整对照，大小写都可以。

```powershell
Get-FileHash .\WebTask-Copilot-v0.7.4-Windows-x64.zip -Algorithm SHA256
```

**切换 Task，要刷新整个网页吗？** 切到新 Task 后点「提取本组」或「刷新助手」即可。安装新版脚本后才需要重新加载教材页。

**支持哪些题？** 包括单选、判断、原词填空、下拉选词、勾选听到的句子及分页口语讨论。分页口语题要逐页提取，收齐后可以分析整组。

**哪些内容会发送出去？** 提取题目和便携版英文转写都在本机完成。API Key 和学习会话保存在油猴脚本存储中。测试连接会联系 DeepSeek，发送辅导请求会提交预览中的文本。「上传所选录音给 DeepSeek 复核」会另外上传音频，可能产生 API 费用。

## 从源码手动配置转写（开发者可选）

本机转写使用 Python、Vosk 和英文语音模型。下载本仓库源码并解压，在项目根目录打开 PowerShell。以下以小型英文模型为例。

1. 从 [Vosk 模型列表](https://alphacephei.com/vosk/models) 下载并解压 `vosk-model-small-en-us-0.15`，把同名模型目录放到项目根目录。模型目录内应直接包含 `am` 等子目录。
2. 在已安装 Python 的 Windows 上执行：

   ```powershell
   py -m venv .venv
   .\.venv\Scripts\python.exe -m pip install vosk
   .\.venv\Scripts\python.exe scripts\speech.py .\vosk-model-small-en-us-0.15
   ```

3. 保持这个窗口运行，回到教材点击「转写英文原文」。下次使用时只需执行最后一行。服务监听本机 `127.0.0.1:4180`。播放器尚未加载时先播放片刻；如果 Edge 提示选择共享来源，选择教材标签页并勾选共享音频。

## 本地开发与验收

项目使用 TypeScript、Vite 和 Vitest。使用 Node.js 24，在项目根目录运行：

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
npm.cmd run preview
```

构建产物是 `dist/webtask-copilot.user.js`。保持预览服务运行，打开[本地验收页](http://127.0.0.1:4178/webtask-copilot/)，可安装本地构建、检查面板开关和页面识别，无需教材账号。真实课程需自行登录 U 校园。

若教材能打开但没有悬浮按钮，请确认脚本已启用并刷新教材页。若提示题型暂未支持，可在 Issue 中附上题型说明、助手版本和遮去个人信息的局部截图。
