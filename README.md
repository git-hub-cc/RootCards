# RootCards - 词源意境记忆卡 🃏

[![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)](https://developer.mozilla.org/zh-CN/docs/Web/Guide/HTML/HTML5)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)](https://developer.mozilla.org/zh-CN/docs/Web/CSS)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript)
[![Python](https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://www.python.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

一个基于**词源学**的可视化英语单词记忆工具，让背单词像看图一样简单、高效。

---

## 🌟 项目简介

**RootCards** 是一个交互式的 Web 应用，旨在改变传统枯燥的单词记忆方式。它通过“词源意境”的方法，将每个单词分解为其核心的**前缀 (prefix)** 和**词根 (root)**，并利用 SVG 动画将抽象的词源含义可视化，帮助学习者建立图像化、逻辑化的记忆联想，从而更深刻地理解和记住单词。

本项目完全使用原生 HTML, CSS, 和 JavaScript (ES6 Modules) 构建，无任何外部框架依赖，展示了现代前端开发的模块化和可维护性。

## ✨ 核心功能

*   **🃏 交互式3D翻转卡片**: 点击卡片可在“视觉意境”和“逻辑解析”之间流畅翻转。
*   **🎨 动态SVG可视化**: 每个单词的前缀和词根都配有专属SVG图形，生动展示其核心含义。
*   **🔊 高品质发音**: 支持单词和例句的离线语音朗读，提供清晰一致的发音体验。
*   **🧠 学习进度跟踪**: 可将单词标记为“已掌握”，应用会自动将其隐藏并通过 LocalStorage 持久化保存进度。
*   **🔍 智能筛选与排序**:
    *   按**前缀**筛选，进行专项学习。
    *   查看所有**已掌握**的单词。
    *   **随机排序**卡片，打破固定顺序，强化记忆效果。
*   **🚀 懒加载技术**: 采用 `Intersection Observer API` 实现卡片无限滚动加载，优化了初始加载性能和用户体验。
*   **💀 骨架屏加载**: 在数据加载期间显示优雅的骨架屏，提升了应用的专业感。
*   **📱 响应式设计**: 完美适配桌面和移动设备。
*   **🧩 高度可扩展**: 只需添加新的 JSON 数据文件，即可轻松扩展词汇库，应用会自动生成对应的筛选按钮。

## 🛠️ 技术栈

*   **前端**: `HTML5`, `CSS3`, `JavaScript (ES6+)`
*   **音频生成**: `Python 3`, `edge-tts` (脚本)
*   **核心技术**:
    *   **CSS 变量**: 用于主题色管理和动态样式。
    *   **CSS Flexbox & Grid**: 用于现代化响应式布局。
    *   **JavaScript 模块化 (ESM)**: 将代码逻辑清晰地分离到 `app.js`, `state.js`, `ui.js` 中。
    *   **Fetch API**: 异步加载词汇数据。
    *   **HTML5 Audio**: 播放预先生成的本地音频文件。
    *   **LocalStorage**: 持久化存储用户学习进度。
    *   **Intersection Observer API**: 实现高效的懒加载。

## 🔊 音频文件生成

为了保证发音的质量和跨浏览器的一致性，本项目使用预先生成的 MP3 文件，而不是依赖浏览器的语音合成 API。我们提供了一个Python脚本来自动完成这个过程。

1.  **脚本位置**: 假设脚本位于 `generate_audio.py`。
2.  **安装依赖**: 脚本依赖 `edge-tts` 库来生成高质量的语音。
    ```bash
    # 推荐在虚拟环境中安装
    pip install gtts mutagen
    ```
3.  **运行脚本**: 在项目根目录下运行脚本。它会自动读取 `data` 目录下的所有 JSON 文件，并为每个单词和例句生成对应的音频文件。
    ```bash
    python generate_audio.py
    ```
4.  **输出**: 音频文件将被保存在 `audio/words/` 和 `audio/sentences/` 目录下，前端代码会从这些位置加载它们。

> **注意**: 每当您通过 `js/data-manifest.js` 添加了新的词汇JSON文件后，都需要重新运行此脚本来生成对应的音频。

### 本地运行

1.  克隆本仓库到本地:
    ```bash
    git clone https://github.com/git-hub-cc/RootCards.git
    ```
2.  进入项目目录:
    ```bash
    cd RootCards
    ```
3.  **[重要]** 首次运行或更新词汇后，请先生成音频文件（详见上一节）：
    ```bash
    # 安装依赖 (仅首次需要)
    pip install gtts mutagen
    # 运行脚本生成音频
    python generate_audio.py
    ```
4.  由于项目使用了 ES Modules，需要通过一个本地服务器来运行，以避免 CORS 策略问题。
    *   如果你安装了 VS Code，可以使用 [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) 插件。
    *   或者使用 Node.js 的 `http-server`:
      ```bash
      # 安装 http-server
      npm install -g http-server
      # 在项目根目录运行
      http-server
      ```
5.  在浏览器中打开 `/index.html` 即可。

### 扩展新词汇

扩展词汇库非常简单：

1.  在 `data` (或其他子目录) 中，创建一个新的 JSON 文件，例如 `pro.json`。
2.  遵循现有 JSON 文件 (如 `re.json`) 的数据结构，填写前缀信息、主题色、单词列表等。
3.  打开 `js/data-manifest.js` 文件。
4.  将新文件的路径添加到 `DATA_FILES` 数组中：
    ```javascript
    const DATA_FILES = [
        'data/pre/re.json',
        'data/pre/dis.json',
        'data/pre/ex.json',
        'data/pre/pro.json' // 新增这一行
    ];
    ```
5.  **重新运行音频生成脚本**以创建新单词的音频文件。
6.  完成！刷新页面，新的词汇组和筛选按钮就会自动出现。

## 📅 未来计划

- [ ] 新增更多词根与词缀数据。
- [ ] 添加单词搜索功能。
- [ ] 开发测试模式（例如，看图猜词）。
- [ ] 提供主题切换功能（如暗黑模式）。

## 🙏 致谢

*   学习资料来源：韩宇极简英语。
*   部分内容由 AI 辅助生成。

## 📜 许可证

该项目采用 [MIT](./LICENSE) 许可证。