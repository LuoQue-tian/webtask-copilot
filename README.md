# WebTask Copilot 网页助手

WebTask Copilot 是一个面向 U 校园教材学习页的中文油猴脚本。打开教材后，你可以在浮动面板里提取当前题组、转写听力或视频中的英文，并结合原文向 DeepSeek 追问。当前版本为 **0.7.4**，主要在 Windows 和 Microsoft Edge 上验证。

## 在 Edge 安装（第一次用油猴也可以）

**第 1 步 · 安装油猴。** 在 Edge 打开 [Tampermonkey 官方下载页](https://www.tampermonkey.net/)，选 Microsoft Edge，跟随链接进入扩展商店，点击「获取」和「添加扩展」。已装油猴可直接做第 2 步。

**第 2 步 · 打开运行权限。** 在 Edge 地址栏输入 `edge://extensions`，找到 Tampermonkey →「详细信息」，打开「允许用户脚本」。旧版 Edge 如果没有这个开关，可以在扩展管理页开启「开发人员模式」。[油猴官方图解](https://www.tampermonkey.net/faq.php?q=Q209)

**第 3 步 · 把助手添加到油猴。** 用同一个 Edge 浏览器点击下面的安装链接。看到油猴显示「WebTask Copilot 网页助手」后，点「安装」。以后更新时也可打开这个链接，确认更新后刷新教材页。

**[点击安装 WebTask 助手（打开 .user.js）](https://raw.githubusercontent.com/LuoQue-tian/webtask-copilot/main/dist/webtask-copilot.user.js)**

想从仓库首页自己找文件？在文件列表依次点 **dist → webtask-copilot.user.js → Raw**（查看原始文件）。安装只需要这一个 JS 文件。

**如果看到满屏代码，或者文件已经下载：**

1. 在原始代码页按 `Ctrl+A`、`Ctrl+C` 复制全部内容。如果手上是下载好的 `webtask-copilot.user.js`，先右键文件 →「打开方式」→「记事本」，再全选复制。
2. 点击 Edge 右上角拼图形状的「扩展」→「Tampermonkey」→「添加新脚本」。也可以进入油猴「管理面板」，点标签栏的 **＋**。
3. 点击代码编辑区，按 `Ctrl+A` 选中默认模板，按 `Ctrl+V` 替换，再按 `Ctrl+S` 保存。在「已安装脚本」里确认 **WebTask Copilot 网页助手** 的开关已开启。

**第 4 步 · 确认装好了。** 回到 U 校园，打开一页有题目的教材，按 `F5` 刷新。点击右下角「WebTask 助手」→「题目」→「提取本组」。面板能显示当前题干，就可以开始使用了。

只提取题目时，装好脚本即可。AI 辅导需要自己的 DeepSeek API Key；离线英文转写需要额外启动下文的本机服务。

## 第一次使用

1. **提取题目。** 把目标 Task 的说明和题目滚动到教材正文中，在助手的「题目」页点「提取本组」。核对题干、选项或空号。切换 Task 后可以直接重新提取，或点「刷新助手」重新识别。支持的形式包括单选、判断、原词填空、下拉选词、勾选听到的句子及分页口语讨论。口语讨论有多页时，逐页提取，收齐后可分析整组。
2. **准备听力材料。** 在「音频与转写」点「转写英文原文」。音频和视频使用同一个入口，完成后可以按段落时间回听。几组题共用同一段材料时，只需转写一次。在后续题组的「DeepSeek 学习辅导」勾选「沿用面板中的英文转写」，在预览里核对原文。也可按需点「保存音频」或「下载视频」，可用性取决于教材播放器提供的媒体。
3. **分析本题或整组。** 在「设置」配置自己的 API Key，测试连接并选择文本模型。回到「题目」，选择题号或整组及相应任务，点「预览发送内容」核对材料，再点「发送给 DeepSeek」。原词填空建议结合时间标记回听，尤其是专名、数字和易混词。
4. **跨组复习。** 新建学习会话，在每组提取完成后点「加入当前会话」。可在追问小窗指定 Task 和题号修订答案，也可生成整次会话的知识点，提出修改要求，再导出 Markdown 笔记。

## 可选配置：离线英文转写

本机转写使用 Python、Vosk 和英文语音模型。下载本仓库源码并解压，在项目根目录打开 PowerShell。以下以小型英文模型为例。

1. 从 [Vosk 模型列表](https://alphacephei.com/vosk/models) 下载并解压 `vosk-model-small-en-us-0.15`，把同名模型目录放到项目根目录。模型目录内应直接包含 `am` 等子目录。
2. 在已安装 Python 的 Windows 上执行：

   ```powershell
   py -m venv .venv
   .\.venv\Scripts\python.exe -m pip install vosk
   .\.venv\Scripts\python.exe scripts\speech.py .\vosk-model-small-en-us-0.15
   ```

3. 保持这个窗口运行，回到教材点击「转写英文原文」。下次使用时只需执行最后一行。服务监听本机 `127.0.0.1:4180`。播放器尚未加载时先播放片刻；如果 Edge 提示选择共享来源，选择教材标签页并勾选共享音频。

## 数据去向

题面提取在浏览器中完成。上述 Vosk 服务在本机处理音频。API Key 和学习会话保存在油猴脚本存储中。测试连接会联系 DeepSeek，发送辅导请求时会提交预览中的题面及所附文本。「上传所选录音给 DeepSeek 复核」是单独的云端操作，会上传所选录音并可能产生 API 费用。

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
