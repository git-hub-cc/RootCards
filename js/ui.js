// =================================================================================
// 通用 UI 渲染模块 (Generic UI Rendering Module) - v12.0 (集成笔记功能)
// ---------------------------------------------------------------------------------
// =================================================================================

import * as State from './state.js'; // 【新增】引入 State 以访问笔记数据
import * as NotificationManager from './modules/notificationManager.js'; // 【新增】引入通知管理器

let cardTemplate;
let prefixIntroTemplate;

// --- 音频播放器实例 ---
// audioPlayer 用于播放单词和例句的长音频
const audioPlayer = new Audio();
let lastClickedWordAudio = { element: null, isSlow: false };
const MAX_FILENAME_SLUG_LENGTH = 60;

// --- UI 音效管理器配置 ---
// 用于存储短促的 UI 提示音效
const uiSounds = {
    complete: null,   // 掌握单词
    uncomplete: null, // 取消掌握
    undo: null,       // 撤销操作
    activate: null    // 模式激活/切换
};

// 音效文件路径映射
const UI_SOUND_PATHS = {
    complete: 'audio/ui/Complete.mp3',
    uncomplete: 'audio/ui/UnComplete.mp3',
    undo: 'audio/ui/Undo.mp3',
    activate: 'audio/ui/Activate.mp3'
};

/**
 * 初始化模块
 * 获取模板元素并预加载音效资源
 */
export function init() {
    cardTemplate = document.getElementById('card-template');
    prefixIntroTemplate = document.getElementById('prefix-intro-template');

    if (!cardTemplate || !prefixIntroTemplate) {
        console.error('关键的卡片模板元素未在 HTML 中找到。');
        return false;
    }

    // --- 预加载 UI 音效 ---
    // 提前加载音频对象，确保点击时能零延迟播放
    for (const [key, path] of Object.entries(UI_SOUND_PATHS)) {
        try {
            const audio = new Audio(path);
            audio.preload = 'auto'; // 自动预加载
            audio.volume = 0.6;     // 设置音效音量，避免过于刺耳 (0.0 - 1.0)
            uiSounds[key] = audio;
        } catch (e) {
            console.warn(`无法加载音效资源: ${path}`, e);
        }
    }

    return true;
}

/**
 * 播放指定的 UI 音效
 * 支持并发播放（每次通过 cloneNode 创建新实例），防止快速点击时音效被截断
 * @param {'complete'|'uncomplete'|'undo'|'activate'} type - 音效类型
 */
export function playUiSound(type) {
    const originalAudio = uiSounds[type];
    if (originalAudio) {
        // 使用 cloneNode() 可以让同一个音效叠加播放，
        // 例如快速标记多个单词时，不会因为上一个没播完而被切断。
        const clone = originalAudio.cloneNode();
        clone.volume = originalAudio.volume;
        clone.play().catch(e => {
            // 忽略因用户未交互导致的自动播放限制错误
            if (e.name !== 'NotAllowedError') {
                console.warn(`播放 UI 音效 (${type}) 失败`, e);
            }
        });
    }
}

export function sanitizeForFilename(text) {
    if (typeof text !== 'string' || !text) return '';
    let slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (slug.length > MAX_FILENAME_SLUG_LENGTH) {
        slug = slug.slice(0, MAX_FILENAME_SLUG_LENGTH);
    }
    return slug.replace(/^_+|_+$/g, '');
}

export function playAudioFile(filePath, onEnded = null) {
    if (!filePath) {
        if (onEnded) onEnded();
        return;
    }
    // 播放新的长音频（单词/例句）时，打断旧的
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
        // 使用 emoji 区别自定义单词本
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
    if (data.isLearned) card.classList.add('is-learned');

    card.querySelector('.visual-area').innerHTML = `<svg viewBox="0 0 24 24" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><g class="layer-root">${data.rootVisual||''}</g><g class="layer-prefix">${data.prefixVisual||''}</g></svg>`;
    const badge = card.querySelector('.prefix-badge');
    badge.textContent = data.contentType === 'suf' ? `-${data.prefix}` : (data.contentType === 'root' ? `-${data.prefix}-` : `${data.prefix}-`);
    card.querySelector('.word-text').textContent = data.word;
    card.querySelector('.part-prefix').textContent = data.breakdown[0];
    card.querySelector('.part-root').textContent = data.breakdown[1];
    card.querySelector('.cn-translation').textContent = data.translation;
    card.querySelector('.imagery-text').textContent = `“${data.imagery}”`;

    // --- 渲染例句 ---
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

    // --- 核心交互逻辑 ---
    // 只有点击非交互区域才翻转
    // 【修改】添加 .note-btn 到阻断列表，防止点击笔记按钮时翻转
    // 【修改】添加 .card-note-overlay, .note-input, .note-action-btn 到阻断列表，防止操作笔记时翻转
    card.addEventListener('click', e => {
        if (!e.target.closest('.audio-btn, .toggle-prefix-btn, .mark-btn, .note-btn, .card-note-overlay')) {
            card.classList.toggle('is-flipped');
        }
    });

    // --- 单词发音 ---
    card.querySelector('.word-audio').addEventListener('click', e => {
        e.stopPropagation();
        const btn = e.currentTarget;
        lastClickedWordAudio.isSlow = lastClickedWordAudio.element === btn ? !lastClickedWordAudio.isSlow : false;
        lastClickedWordAudio.element = btn;
        const suffix = lastClickedWordAudio.isSlow ? '_slow.mp3' : '.mp3';
        playAudioFile(`audio/words/${data.word.toLowerCase()}${suffix}`);
        btn.title = lastClickedWordAudio.isSlow ? '切换为常速朗读' : '切换为慢速朗读';
    });

    // --- 切换前缀显隐 ---
    card.querySelector('.toggle-prefix-btn').addEventListener('click', e => { e.stopPropagation(); card.classList.toggle('prefix-hidden'); });

    // --- 标记为已掌握 ---
    card.querySelector('.mark-btn').addEventListener('click', e => {
        e.stopPropagation();
        handlers.onMarkLearned(data, card);
    });

    // --- 【新增】笔记功能交互 ---
    const noteBtn = card.querySelector('.note-btn');
    const noteOverlay = card.querySelector('.card-note-overlay');
    const noteInput = card.querySelector('.note-input');
    const noteSaveBtn = card.querySelector('.btn-save');
    const noteCancelBtn = card.querySelector('.btn-cancel');

    // 1. 初始化笔记按钮状态
    const existingNote = State.getUserNote(data.word);
    if (existingNote) {
        noteBtn.classList.add('has-note');
    }

    // 2. 点击笔记按钮：显示浮层并填充内容
    noteBtn.addEventListener('click', e => {
        e.stopPropagation(); // 阻止翻转

        // 获取最新的笔记内容 (State 中是最权威的)
        noteInput.value = State.getUserNote(data.word);
        noteOverlay.classList.remove('is-hidden');

        // 自动聚焦
        setTimeout(() => noteInput.focus(), 100);
    });

    // 3. 点击保存按钮
    noteSaveBtn.addEventListener('click', e => {
        e.stopPropagation(); // 阻止翻转

        const text = noteInput.value.trim();
        State.saveUserNote(data.word, text);

        // 更新按钮 UI 状态
        if (text) {
            noteBtn.classList.add('has-note');
            NotificationManager.show({ type: 'success', message: '笔记已保存' });
        } else {
            noteBtn.classList.remove('has-note');
            NotificationManager.show({ type: 'info', message: '笔记已清空' });
        }

        noteOverlay.classList.add('is-hidden');
    });

    // 4. 点击取消按钮
    noteCancelBtn.addEventListener('click', e => {
        e.stopPropagation(); // 阻止翻转
        noteOverlay.classList.add('is-hidden');
    });

    // 5. 点击输入框本身：阻止冒泡，防止点击文字输入区域触发卡片翻转
    // (虽然上面的 card click listener 已经排除了 .card-note-overlay，但加上这个更保险)
    noteInput.addEventListener('click', e => e.stopPropagation());

    return card;
}

export function createCard(data, handlers) {
    return data.cardType === 'intro' ? createIntroCard(data) : createWordCard(data, handlers);
}

export function toggleNoVisualMode(btnElement) {
    const isEnabled = document.body.classList.toggle('mode-no-visual');
    btnElement.classList.toggle('active', isEnabled);
    const eyeOpen = btnElement.querySelector('.icon-eye-open');
    const eyeSlash = btnElement.querySelector('.icon-eye-slash');
    if (eyeOpen && eyeSlash) {
        eyeOpen.classList.toggle('is-hidden', isEnabled);
        eyeSlash.classList.toggle('is-hidden', !isEnabled);
    }
    btnElement.title = isEnabled ? "关闭无图模式" : "开启无图自测模式";

    // 如果启用了无图模式，播放激活音效
    if (isEnabled) {
        playUiSound('activate');
    }
}