// =================================================================================
// UI 渲染模块 (UI Rendering Module) - v4.2 (支持后缀 Badge 显示)
// ---------------------------------------------------------------------------------
// 主要职责：
// 1. (DOM元素创建) 提供创建单词卡片、介绍卡片和筛选器按钮的函数。
// 2. (渲染逻辑) 将卡片元素批量渲染到指定的容器中。
// 3. (UI交互) 封装与UI直接相关的交互，如卡片翻转、SVG显隐。
// 4. (音频播放) 播放预先生成的本地音频文件。
// 5. (动态内容) 能够根据数据动态渲染一个或多个例句。
// =================================================================================

// --- 模块内变量 ---
let cardTemplate;
let prefixIntroTemplate;
const audioPlayer = new Audio();

/**
 * 初始化UI模块，获取模板元素。
 * @returns {boolean} 如果所有模板都找到则返回 true，否则返回 false。
 */
export function initUI() {
    cardTemplate = document.getElementById('card-template');
    prefixIntroTemplate = document.getElementById('prefix-intro-template');

    if (!cardTemplate || !prefixIntroTemplate) {
        console.error('卡片模板未在 HTML 中找到。');
        return false;
    }
    return true;
}

/**
 * 播放本地音频文件。
 * @param {string} filePath - 音频文件的相对路径。
 */
function playAudioFile(filePath) {
    if (!filePath) {
        console.warn('尝试播放一个空的音频文件路径。');
        return;
    }

    try {
        if (!audioPlayer.paused) {
            audioPlayer.pause();
            audioPlayer.currentTime = 0;
        }
        audioPlayer.src = filePath;
        const playPromise = audioPlayer.play();

        if (playPromise !== undefined) {
            playPromise.catch(error => {
                if (error.name !== 'AbortError') {
                    console.error(`播放音频文件 "${filePath}" 失败:`, error);
                }
            });
        }
    } catch (error) {
        console.error(`设置或播放音频时发生意外错误:`, error);
    }
}

/**
 * 根据数据动态生成筛选器按钮。
 * 【核心逻辑】此函数基于意境分组 (meaning groups) 来生成按钮。
 * @param {HTMLElement} filterContainer - 按钮的容器元素。
 * @param {HTMLElement} shuffleBtn - 随机按钮元素，新按钮会插在此之前。
 * @param {Array<object>} meaningGroups - 从 state.js 传入的原始意境分组对象数组。
 */
export function renderFilterButtons(filterContainer, shuffleBtn, meaningGroups) {
    // 1. 渲染“全部”按钮
    const allButton = document.createElement('button');
    allButton.className = 'filter-btn active';
    allButton.dataset.filter = 'all';
    allButton.textContent = '全部 (All)';
    filterContainer.insertBefore(allButton, shuffleBtn);

    // 2. 渲染“已掌握”按钮
    const learnedButton = document.createElement('button');
    learnedButton.className = 'filter-btn';
    learnedButton.dataset.filter = 'learned';
    learnedButton.textContent = '已掌握';
    filterContainer.insertBefore(learnedButton, shuffleBtn);

    // 3. 遍历意境分组来创建按钮
    meaningGroups.forEach(group => {
        // 鲁棒性检查
        if (!group.meaningId || !group.displayName) return;
        const button = document.createElement('button');
        button.className = 'filter-btn';
        button.dataset.filter = group.meaningId; // 使用 meaningId 作为筛选值
        button.textContent = group.displayName;
        if (group.themeColor) {
            button.dataset.themeColor = group.themeColor;
        }
        filterContainer.insertBefore(button, shuffleBtn);
    });
}

/**
 * 更新筛选器按钮的激活状态和样式。
 */
export function updateActiveFilterButton(filterContainer, clickedButton) {
    filterContainer.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.backgroundColor = '';
        btn.style.borderColor = '';
        btn.style.color = '';
    });
    clickedButton.classList.add('active');
    const themeColor = clickedButton.dataset.themeColor;
    if (themeColor) {
        clickedButton.style.backgroundColor = themeColor;
        clickedButton.style.borderColor = themeColor;
        clickedButton.style.color = 'white';
    }
}

/**
 * 创建前缀介绍卡片DOM元素。
 */
function createIntroCard(data) {
    const cardClone = prefixIntroTemplate.content.cloneNode(true).firstElementChild;
    if (data.themeColor) {
        cardClone.style.setProperty('--theme-color', data.themeColor);
    }
    const visualArea = cardClone.querySelector('.visual-area');
    if (data.visual) {
        // 确保 SVG 元素使用了正确的 viewBox 和 stroke 属性
        visualArea.innerHTML = `<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">${data.visual}</svg>`;
    }
    cardClone.querySelector('.intro-title').textContent = data.title;
    // 使用 <br> 替换 \n 以正确显示多行描述
    cardClone.querySelector('.intro-description').innerHTML = data.description.replace(/\n/g, '<br>');
    cardClone.querySelector('.intro-imagery').textContent = data.imagery;
    cardClone.addEventListener('click', () => cardClone.classList.toggle('is-flipped'));
    return cardClone;
}

/**
 * 创建单词卡片DOM元素。
 * @param {object} data - 单个单词的数据对象。
 * @param {object} handlers - 包含事件处理函数的对象, 如 { onMarkLearned }。
 * @returns {HTMLElement} 创建好的单词卡片元素。
 */
function createWordCard(data, handlers) {
    const cardClone = cardTemplate.content.cloneNode(true).firstElementChild;
    if (data.themeColor) {
        cardClone.style.setProperty('--theme-color', data.themeColor);
    }
    if (data.isLearned) {
        cardClone.classList.add('is-learned');
    }

    const visualArea = cardClone.querySelector('.visual-area');
    // 注入词根和前缀的视觉元素
    visualArea.innerHTML = `<svg viewBox="0 0 24 24" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <g class="layer-root">${data.rootVisual || ''}</g>
                            <g class="layer-prefix">${data.prefixVisual || ''}</g>
                        </svg>`;

    // --- 核心修改 v4.2: 根据 affixType 决定徽章显示格式 ---
    const badgeElement = cardClone.querySelector('.prefix-badge');
    if (data.affixType === 'suffix') {
        badgeElement.textContent = `-${data.prefix}`; // 后缀显示为 "-tion"
    } else {
        badgeElement.textContent = `${data.prefix}-`; // 前缀默认显示为 "pre-"
    }

    // 注入卡片正面的文本内容
    cardClone.querySelector('.word-text').textContent = data.word;

    // 注入卡片背面的解析内容
    cardClone.querySelector('.part-prefix').textContent = data.breakdown[0];
    cardClone.querySelector('.part-root').textContent = data.breakdown[1];

    // 鲁棒性：防止 breakdown 数组长度不足导致报错
    if (data.breakdown.length > 2) {
        // 如果有三部分拆解（例如 前缀+词根+后缀），可以考虑追加显示，
        // 或者保持现在的两段式结构（通常 data.breakdown 已经被设计为主要展示两部分）
        // 目前模板只设计了两个 span，暂不修改模板结构。
    }

    cardClone.querySelector('.cn-translation').textContent = data.translation;
    cardClone.querySelector('.imagery-text').textContent = `“${data.imagery}”`;

    // ========== 改进的单词高亮逻辑 (v4.1) ==========
    const wordLower = data.word.toLowerCase();

    // 1. 标准匹配：词根 + 常见后缀 (s, es, ed, ing, d, r, st)
    const standardVariants = wordLower + '(?:s|es|ed|ing|d|r|st)?';

    // 2. 特殊匹配：处理 y 变 ied/ies (如果单词以 y 结尾且不是特殊情况)
    let specialVariants = '';
    if (wordLower.endsWith('y') && wordLower.length > 2) {
        const baseWord = wordLower.slice(0, -1);
        // 例如：reply -> repl(?:ied|ies)
        specialVariants = `|${baseWord}(?:ied|ies)`;
    }

    // 最终匹配模式：匹配标准变体或 y变i 变体
    const combinedPattern = new RegExp(`\\b(${standardVariants}${specialVariants})\\b`, 'gi');
    // ==========================================

    const sentenceSection = cardClone.querySelector('.sentence-section');
    if (Array.isArray(data.sentences) && data.sentences.length > 0) {
        data.sentences.forEach((sentence, index) => {
            const sentenceBlock = document.createElement('div');
            sentenceBlock.className = 'sentence-block';

            // 英文例句（带高亮）
            const sentenceEn = document.createElement('div');
            sentenceEn.className = 'sentence-en';
            // 使用改进后的 combinedPattern 进行高亮替换
            sentenceEn.innerHTML = sentence.en.replace(combinedPattern, `<strong style="color: var(--theme-color, black);">$1</strong>`);

            // 中文翻译
            const sentenceCn = document.createElement('div');
            sentenceCn.className = 'sentence-cn';
            sentenceCn.textContent = sentence.cn;

            // 音频按钮
            const audioBtn = document.createElement('button');
            audioBtn.className = 'audio-btn sentence-audio';
            audioBtn.title = '朗读例句';
            audioBtn.innerHTML = `<span>🔊 听例句 ${data.sentences.length > 1 ? index + 1 : ''}</span>`;
            audioBtn.addEventListener('click', () => {
                const sentenceAudioPath = `audio/sentences/${data.word.toLowerCase()}_sentence_${index}.mp3`;
                playAudioFile(sentenceAudioPath);
            });

            sentenceBlock.appendChild(sentenceEn);
            sentenceBlock.appendChild(sentenceCn);
            sentenceBlock.appendChild(audioBtn);
            sentenceSection.appendChild(sentenceBlock);
        });
    }

    // --- 事件绑定 ---

    // 翻转卡片（排除按钮点击区域）
    cardClone.addEventListener('click', (e) => {
        if (!e.target.closest('.audio-btn, .toggle-prefix-btn, .mark-btn')) {
            cardClone.classList.toggle('is-flipped');
        }
    });

    // 单词音频播放
    cardClone.querySelector('.word-audio').addEventListener('click', () => {
        const wordAudioPath = `audio/words/${data.word.toLowerCase()}.mp3`;
        playAudioFile(wordAudioPath);
    });

    // 切换前缀视觉元素显示
    const togglePrefixBtn = cardClone.querySelector('.toggle-prefix-btn');
    togglePrefixBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cardClone.classList.toggle('prefix-hidden');
        togglePrefixBtn.classList.toggle('is-toggled');
    });

    // 标记为已掌握
    const markBtn = cardClone.querySelector('.mark-btn');
    markBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (handlers.onMarkLearned) {
            handlers.onMarkLearned(data, cardClone);
        }
    });

    return cardClone;
}

/**
 * 卡片创建的工厂函数。
 */
export function createCard(data, handlers) {
    return data.cardType === 'intro' ? createIntroCard(data) : createWordCard(data, handlers);
}