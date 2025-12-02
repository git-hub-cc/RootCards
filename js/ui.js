// =================================================================================
// 通用 UI 渲染模块 (Generic UI Rendering Module) - v10.1 (SVG 切换逻辑确认)
// ---------------------------------------------------------------------------------
// 职责 (精简后):
// 1. (DOM元素创建) 提供创建单词卡片、介绍卡片和各类筛选按钮的函数。
// 2. (UI交互) 提供通用的UI状态切换函数（如无图模式）。
// 3. (通用辅助) 提供音频播放、文件名处理等跨模块使用的工具函数。
// 移除的职责:
// - 所有特定于模态框（听力、打字、单词本）的内部UI管理逻辑。
// =================================================================================

// --- 模块内变量 ---
let cardTemplate;
let prefixIntroTemplate;
const audioPlayer = new Audio();
let lastClickedWordAudio = { element: null, isSlow: false };
const MAX_FILENAME_SLUG_LENGTH = 60;

/**
 * 初始化UI模块，获取并缓存HTML模板。
 * @returns {boolean} - 初始化成功返回 true，否则返回 false。
 */
export function init() {
    cardTemplate = document.getElementById('card-template');
    prefixIntroTemplate = document.getElementById('prefix-intro-template');
    if (!cardTemplate || !prefixIntroTemplate) {
        console.error('关键的卡片模板元素未在 HTML 中找到。');
        return false;
    }
    return true;
}

// =================================================================================
// 通用辅助函数 (Exported for modules)
// =================================================================================

/**
 * 将文本转换为对文件名安全的“slug”。
 * @param {string} text - 需要处理的文本。
 * @returns {string} - 处理后的安全文件名片段。
 */
export function sanitizeForFilename(text) {
    if (typeof text !== 'string' || !text) return '';
    let slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (slug.length > MAX_FILENAME_SLUG_LENGTH) {
        slug = slug.slice(0, MAX_FILENAME_SLUG_LENGTH);
    }
    return slug.replace(/^_+|_+$/g, '');
}

/**
 * 播放本地音频文件。
 * @param {string} filePath - 音频文件的路径。
 * @param {function(): void} [onEnded=null] - 音频播放结束后的回调函数。
 */
export function playAudioFile(filePath, onEnded = null) {
    if (!filePath) {
        if (onEnded) onEnded();
        return;
    }
    if (!audioPlayer.paused) {
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
    }
    audioPlayer.src = filePath;
    audioPlayer.onended = onEnded;
    audioPlayer.play().catch(error => {
        if (error.name !== 'AbortError') {
            console.error(`播放音频 "${filePath}" 失败:`, error);
            if (onEnded) onEnded();
        }
    });
}

/**
 * 停止当前正在播放的音频。
 */
export function stopAudio() {
    if (audioPlayer && !audioPlayer.paused) {
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
    }
}

// =================================================================================
// 筛选器 UI 函数
// =================================================================================

export function renderGradeButtons(container, grades) {
    container.innerHTML = '';
    const gradeMap = { 'grade7': 'Grade 7', 'grade8': 'Grade 8', 'grade9': 'Grade 9' };
    ['all', ...grades].forEach(gradeId => {
        const button = document.createElement('button');
        button.className = 'grade-filter-btn';
        button.dataset.grade = gradeId;
        button.textContent = gradeMap[gradeId] || (gradeId === 'all' ? 'All Grades' : gradeId);
        container.appendChild(button);
    });
}

export function updateActiveGradeButton(container, clickedButton) {
    container.querySelectorAll('.grade-filter-btn').forEach(btn => btn.classList.remove('active'));
    clickedButton.classList.add('active');
}

export function renderContentTypeButtons(container) {
    container.innerHTML = '';
    const types = [
        { type: 'all', text: 'All Types' }, { type: 'pre', text: 'Prefix' },
        { type: 'suf', text: 'Suffix' }, { type: 'root', text: 'Root' },
        { type: 'category', text: 'General' }
    ];
    types.forEach(({ type, text }) => {
        const button = document.createElement('button');
        button.className = 'grade-filter-btn content-type-btn';
        button.dataset.type = type;
        button.textContent = text;
        container.appendChild(button);
    });
}

export function updateActiveContentTypeButton(container, clickedButton) {
    container.querySelectorAll('.content-type-btn').forEach(btn => btn.classList.remove('active'));
    clickedButton.classList.add('active');
}

export function renderFilterButtons(filterContainer, insertBeforeElement, categories) {
    filterContainer.querySelectorAll('.filter-btn').forEach(btn => btn.remove());

    const createBtn = (text, filter, type = 'pre-defined') => {
        const button = document.createElement('button');
        button.className = 'filter-btn';
        button.dataset.filter = filter;
        button.dataset.filterType = type;
        button.textContent = text;
        return button;
    };

    const allButton = createBtn('All', 'all');
    allButton.classList.add('active');
    filterContainer.insertBefore(allButton, insertBeforeElement);
    filterContainer.insertBefore(createBtn('Learned', 'learned'), insertBeforeElement);

    categories.forEach(category => {
        if (!category.meaningId) return;
        let buttonText;
        if (category.filterType === 'user-wordbook') {
            buttonText = `📝 ${category.displayName}`;
        } else if (category.contentType === 'pre') {
            buttonText = `${category.prefix}-`;
        } else if (category.contentType === 'suf') {
            buttonText = `-${category.prefix}`;
        } else if (category.contentType === 'root') {
            buttonText = `-${category.prefix}-`;
        } else {
            buttonText = category.englishDisplayName;
        }
        const button = createBtn(buttonText, category.meaningId, category.filterType);
        if (category.themeColor) button.dataset.themeColor = category.themeColor;
        filterContainer.insertBefore(button, insertBeforeElement);
    });
}

export function updateActiveFilterButton(filterContainer, clickedButton) {
    filterContainer.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.removeProperty('--button-theme-color');
    });
    clickedButton.classList.add('active');
    if (clickedButton.dataset.filterType !== 'user-wordbook' && clickedButton.dataset.themeColor) {
        clickedButton.style.setProperty('--button-theme-color', clickedButton.dataset.themeColor);
    }
}

// =================================================================================
// 卡片创建与核心交互
// =================================================================================

function createIntroCard(data) {
    const card = prefixIntroTemplate.content.cloneNode(true).firstElementChild;
    if (data.themeColor) card.style.setProperty('--theme-color', data.themeColor);
    if (data.visual) {
        card.querySelector('.visual-area').innerHTML = `<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">${data.visual}</svg>`;
    }
    card.querySelector('.intro-title').textContent = data.title;
    card.querySelector('.intro-description').innerHTML = data.description.replace(/\n/g, '<br>');
    card.querySelector('.intro-imagery').textContent = data.imagery;
    card.addEventListener('click', () => card.classList.toggle('is-flipped'));
    return card;
}

function createWordCard(data, handlers) {
    const card = cardTemplate.content.cloneNode(true).firstElementChild;
    if (data.themeColor) card.style.setProperty('--theme-color', data.themeColor);
    // 【鲁棒性】确保初始状态正确：如果 data.isLearned 为 true，则添加 .is-learned 类
    if (data.isLearned) card.classList.add('is-learned');

    card.querySelector('.visual-area').innerHTML = `<svg viewBox="0 0 24 24" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><g class="layer-root">${data.rootVisual||''}</g><g class="layer-prefix">${data.prefixVisual||''}</g></svg>`;
    const badge = card.querySelector('.prefix-badge');
    badge.textContent = data.contentType === 'suf' ? `-${data.prefix}` : (data.contentType === 'root' ? `-${data.prefix}-` : `${data.prefix}-`);
    card.querySelector('.word-text').textContent = data.word;
    card.querySelector('.part-prefix').textContent = data.breakdown[0];
    card.querySelector('.part-root').textContent = data.breakdown[1];
    card.querySelector('.cn-translation').textContent = data.translation;
    card.querySelector('.imagery-text').textContent = `“${data.imagery}”`;

    const sentenceSection = card.querySelector('.sentence-section');
    if (data.sentences?.length) {
        data.sentences.forEach((s, i) => {
            const block = document.createElement('div');
            block.className = 'sentence-block';
            block.innerHTML = `<div class="sentence-en">${s.en.replace(new RegExp(`\\b(${data.word.toLowerCase()}(?:s|es|ed|ing)?)`, 'gi'), `<strong style="color: var(--theme-color, black);">$1</strong>`)}</div>
                             <div class="sentence-cn">${s.cn}</div>`;
            const audioBtn = document.createElement('button');
            audioBtn.className = 'audio-btn sentence-audio';
            audioBtn.innerHTML = `<span>🔊 Listen ${data.sentences.length > 1 ? i + 1 : ''}</span>`;
            audioBtn.onclick = (e) => {
                e.stopPropagation();
                playAudioFile(`audio/sentences/${data.word.toLowerCase()}_${sanitizeForFilename(s.en)}.mp3`);
            };
            block.appendChild(audioBtn);
            sentenceSection.appendChild(block);
        });
    }

    card.addEventListener('click', e => !e.target.closest('.audio-btn, .toggle-prefix-btn, .mark-btn') && card.classList.toggle('is-flipped'));

    card.querySelector('.word-audio').addEventListener('click', e => {
        e.stopPropagation();
        const btn = e.currentTarget;
        lastClickedWordAudio.isSlow = lastClickedWordAudio.element === btn ? !lastClickedWordAudio.isSlow : false;
        lastClickedWordAudio.element = btn;
        const suffix = lastClickedWordAudio.isSlow ? '_slow.mp3' : '.mp3';
        playAudioFile(`audio/words/${data.word.toLowerCase()}${suffix}`);
        btn.title = `朗读单词 (${lastClickedWordAudio.isSlow ? '慢速' : '常速'})`;
    });

    // 【核心】切换前缀按钮逻辑：仅切换父级 .card 上的类，CSS负责响应
    card.querySelector('.toggle-prefix-btn').addEventListener('click', e => { e.stopPropagation(); card.classList.toggle('prefix-hidden'); });
    // 【核心】标记按钮逻辑：调用 app.js 传递过来的处理器
    card.querySelector('.mark-btn').addEventListener('click', e => { e.stopPropagation(); handlers.onMarkLearned(data, card); });

    return card;
}

export function createCard(data, handlers) {
    return data.cardType === 'intro' ? createIntroCard(data) : createWordCard(data, handlers);
}

/**
 * 切换“无图自测”模式的全局状态和按钮图标。
 * 【注】: 此函数逻辑已适配新的双SVG结构，通过切换 .is-hidden 类实现。
 * @param {HTMLElement} btnElement - “无图自测”按钮。
 */
export function toggleNoVisualMode(btnElement) {
    const isEnabled = document.body.classList.toggle('mode-no-visual');
    btnElement.classList.toggle('active', isEnabled);
    const eyeOpen = btnElement.querySelector('.icon-eye-open');
    const eyeSlash = btnElement.querySelector('.icon-eye-slash');

    // 【鲁棒性检查】确保两个SVG元素都存在
    if (eyeOpen && eyeSlash) {
        eyeOpen.classList.toggle('is-hidden', isEnabled);
        eyeSlash.classList.toggle('is-hidden', !isEnabled);
    } else {
        console.warn('无法找到“无图模式”按钮的SVG图标，切换功能可能异常。');
    }

    btnElement.title = isEnabled ? "关闭无图模式" : "开启无图自测模式";
}