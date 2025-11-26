// =================================================================================
// UI 渲染模块 (UI Rendering Module) - v2.0 (本地音频播放版)
// ---------------------------------------------------------------------------------
// 主要职责：
// 1. (DOM元素创建) 提供创建单词卡片、介绍卡片和筛选器按钮的函数。
// 2. (渲染逻辑) 将卡片元素批量渲染到指定的容器中。
// 3. (UI交互) 封装与UI直接相关的交互，如卡片翻转、SVG显隐。
// 4. (音频播放) [核心修改] 播放预先生成的本地音频文件，替换了原有的浏览器语音合成API。
// 5. (UI状态更新) 控制加载提示、空状态消息的显示与隐藏。
// =================================================================================

// --- 模块内变量 ---
let cardTemplate;
let prefixIntroTemplate;

// [核心修改] 移除了所有与 window.speechSynthesis 相关的变量 (synth, voices)。
// 新增一个全局的 Audio 实例用于播放音频，可以复用此对象，避免创建多个播放器，提高性能。
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

    // [核心修改] 移除了 populateVoiceList() 的调用，因为不再需要浏览器语音引擎。
    return true;
}

/**
 * [新增函数] 播放本地音频文件。
 * 这是一个健壮的实现，用于替代原有的 speak() 函数。
 * @param {string} filePath - 音频文件的相对路径 (例如 'audio/words/discover.mp3')。
 */
function playAudioFile(filePath) {
    if (!filePath) {
        console.warn('尝试播放一个空的音频文件路径。');
        return;
    }

    try {
        // 如果当前有音频正在播放，先暂停并重置，以避免声音重叠。
        if (!audioPlayer.paused) {
            audioPlayer.pause();
            audioPlayer.currentTime = 0;
        }

        // 设置新的音频源并播放。
        audioPlayer.src = filePath;
        const playPromise = audioPlayer.play();

        // 现代浏览器中，play() 返回一个Promise。处理可能的播放错误。
        if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.error(`播放音频文件 "${filePath}" 失败:`, error);
                // 可以在这里向用户显示一个友好的提示，例如一个小的toast通知。
            });
        }
    } catch (error) {
        console.error(`设置或播放音频时发生意外错误:`, error);
    }
}


/**
 * 根据数据动态生成筛选器按钮。
 * (此函数无任何修改)
 * @param {HTMLElement} filterContainer - 用于容纳按钮的容器元素。
 * @param {HTMLElement} shuffleBtn - 洗牌按钮，新按钮会插在它前面。
 * @param {Array<Object>} prefixGroups - 从JSON文件解析出的数据集数组。
 */
export function renderFilterButtons(filterContainer, shuffleBtn, prefixGroups) {
    // 创建并插入 “全部” 按钮
    const allButton = document.createElement('button');
    allButton.className = 'filter-btn active';
    allButton.dataset.filter = 'all';
    allButton.textContent = '全部 (All)';
    filterContainer.insertBefore(allButton, shuffleBtn);

    // 创建并插入 “已掌握” 按钮
    const learnedButton = document.createElement('button');
    learnedButton.className = 'filter-btn';
    learnedButton.dataset.filter = 'learned';
    learnedButton.textContent = '已掌握';
    filterContainer.insertBefore(learnedButton, shuffleBtn);

    // 创建并插入各个前缀按钮
    prefixGroups.forEach(group => {
        if (!group.prefix || !group.displayName) return;
        const button = document.createElement('button');
        button.className = 'filter-btn';
        button.dataset.filter = group.prefix;
        button.textContent = group.displayName;
        if (group.themeColor) {
            button.dataset.themeColor = group.themeColor;
        }
        filterContainer.insertBefore(button, shuffleBtn);
    });
}

/**
 * 更新筛选器按钮的激活状态和样式。
 * (此函数无任何修改)
 * @param {HTMLElement} filterContainer - 按钮容器。
 * @param {HTMLElement} clickedButton - 被点击的按钮元素。
 */
export function updateActiveFilterButton(filterContainer, clickedButton) {
    // 移除所有按钮的激活状态和自定义样式
    filterContainer.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.backgroundColor = '';
        btn.style.borderColor = '';
        btn.style.color = '';
    });

    // 激活被点击的按钮
    clickedButton.classList.add('active');

    // 如果是带主题色的按钮，则应用颜色
    const themeColor = clickedButton.dataset.themeColor;
    if (themeColor) {
        clickedButton.style.backgroundColor = themeColor;
        clickedButton.style.borderColor = themeColor;
        clickedButton.style.color = 'white';
    }
}


/**
 * 创建前缀介绍卡片DOM元素。
 * (此函数无任何修改)
 * @param {object} data - 介绍卡片的数据。
 * @returns {HTMLElement} 创建好的卡片元素。
 */
function createIntroCard(data) {
    const cardClone = prefixIntroTemplate.content.cloneNode(true).firstElementChild;
    if (data.themeColor) {
        cardClone.style.setProperty('--theme-color', data.themeColor);
    }

    const visualArea = cardClone.querySelector('.visual-area');
    if (data.visual) {
        visualArea.innerHTML = `<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">${data.visual}</svg>`;
    }
    cardClone.querySelector('.intro-title').textContent = data.title;
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

    // 填充内容 (无修改)
    const visualArea = cardClone.querySelector('.visual-area');
    visualArea.innerHTML = `<svg viewBox="0 0 24 24" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <g class="layer-root">${data.rootVisual || ''}</g>
                            <g class="layer-prefix">${data.prefixVisual || ''}</g>
                        </svg>`;
    cardClone.querySelector('.prefix-badge').textContent = `${data.type}-`;
    cardClone.querySelector('.word-text').textContent = data.word;
    cardClone.querySelector('.part-prefix').textContent = data.breakdown[0];
    cardClone.querySelector('.part-root').textContent = data.breakdown[1];
    cardClone.querySelector('.cn-translation').textContent = data.translation;
    cardClone.querySelector('.imagery-text').textContent = `“${data.imagery}”`;
    cardClone.querySelector('.sentence-en').innerHTML = data.sentence.replace(new RegExp(`\\b(${data.word})\\b`, 'gi'), `<strong style="color: var(--theme-color, black);">$1</strong>`);
    cardClone.querySelector('.sentence-cn').textContent = data.sentenceTrans;

    // 绑定事件 (核心修改区域)
    cardClone.addEventListener('click', (e) => {
        if (!e.target.closest('.audio-btn, .toggle-prefix-btn, .mark-btn')) {
            cardClone.classList.toggle('is-flipped');
        }
    });

    // [核心修改] 更新音频按钮的点击事件，使其调用新的 playAudioFile 函数。
    // 文件名约定：单词 -> word.mp3, 例句 -> word_sentence.mp3，全部小写。
    // 您的Python脚本在生成文件时需要遵循这个命名约定。
    cardClone.querySelector('.word-audio').addEventListener('click', () => {
        const wordAudioPath = `audio/words/${data.word.toLowerCase()}.mp3`;
        playAudioFile(wordAudioPath);
    });

    cardClone.querySelector('.sentence-audio').addEventListener('click', () => {
        // 假设例句音频的文件名与对应单词相关联，以简化查找。
        const sentenceAudioPath = `audio/sentences/${data.word.toLowerCase()}_sentence.mp3`;
        playAudioFile(sentenceAudioPath);
    });

    const togglePrefixBtn = cardClone.querySelector('.toggle-prefix-btn');
    togglePrefixBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        cardClone.classList.toggle('prefix-hidden');
        togglePrefixBtn.classList.toggle('is-toggled');
    });

    const markBtn = cardClone.querySelector('.mark-btn');
    markBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // 调用从 app.js 传入的回调函数
        if (handlers.onMarkLearned) {
            handlers.onMarkLearned(data, cardClone);
        }
    });

    return cardClone;
}

/**
 * 卡片创建的工厂函数。
 * (此函数无任何修改)
 * @param {object} data - 卡片数据。
 * @param {object} handlers - 事件处理回调函数集合。
 * @returns {HTMLElement} 创建好的卡片元素。
 */
export function createCard(data, handlers) {
    return data.cardType === 'intro' ? createIntroCard(data) : createWordCard(data, handlers);
}