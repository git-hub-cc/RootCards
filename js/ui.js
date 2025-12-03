// =================================================================================
// 通用 UI 渲染模块 (Generic UI Rendering Module) - v14.2 (移动端底部5按钮布局优化)
// ---------------------------------------------------------------------------------
// =================================================================================

import * as State from './state.js';
import * as NotificationManager from './modules/notificationManager.js';

let cardTemplate;
let prefixIntroTemplate;

const audioPlayer = new Audio();
let lastClickedWordAudio = { element: null, isSlow: false };
const MAX_FILENAME_SLUG_LENGTH = 60;

const uiSounds = {
    complete: null,
    uncomplete: null,
    undo: null,
    activate: null
};

const UI_SOUND_PATHS = {
    complete: 'audio/ui/Complete.mp3',
    uncomplete: 'audio/ui/UnComplete.mp3',
    undo: 'audio/ui/Undo.mp3',
    activate: 'audio/ui/Activate.mp3'
};

/**
 * 初始化模块
 */
export function init() {
    cardTemplate = document.getElementById('card-template');
    prefixIntroTemplate = document.getElementById('prefix-intro-template');

    if (!cardTemplate || !prefixIntroTemplate) {
        console.error('关键的卡片模板元素未在 HTML 中找到。');
        return false;
    }

    // 预加载 UI 音效
    for (const [key, path] of Object.entries(UI_SOUND_PATHS)) {
        try {
            const audio = new Audio(path);
            audio.preload = 'auto';
            audio.volume = 0.6;
            uiSounds[key] = audio;
        } catch (e) {
            console.warn(`无法加载音效资源: ${path}`, e);
        }
    }

    // --- 【新增】移动端布局初始化 ---
    initMobileLayout();

    return true;
}

/**
 * 【新增】移动端布局适配逻辑
 * 将工具栏按钮从顶部移动到底部固定栏，实现 5 个按钮等宽排列
 */
function initMobileLayout() {
    // 简单的移动端检测 (768px 是我们 CSS 中定义的断点)
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
        const bottomBar = document.getElementById('mobile-bottom-bar');

        // 需要移动的按钮ID列表，按底部从左到右的顺序排列
        // 1. 听力 (Listening)
        // 2. 拼写 (Typing)
        // 3. 随机 (Shuffle)
        // 4. 无图 (No Visual)
        // 5. 更多 (More Options)
        const buttonsToMove = [
            'listening-mode-btn',
            'typing-mode-btn',
            'shuffle-btn',
            'no-visual-btn',
            'more-options-btn'
        ];

        // 移动逻辑：只移动存在的按钮
        buttonsToMove.forEach(id => {
            const btn = document.getElementById(id);
            if (btn && bottomBar) {
                // 将按钮移动到底部导航栏
                // 注意：这里使用的是 appendChild，它会将 DOM 元素从原位置“剪切”并粘贴到新位置

                // 更多菜单的容器特殊处理，因为它包含了下拉菜单
                if (id === 'more-options-btn') {
                    const container = document.querySelector('.options-menu-container');
                    if (container) {
                        bottomBar.appendChild(container);
                        // 在移动端底部栏中，容器也需要参与 Flex 均分
                        container.classList.add('mobile-nav-item');
                    }
                } else {
                    bottomBar.appendChild(btn);
                    // 标记为底部导航项，方便 CSS 统一处理
                    btn.classList.add('mobile-nav-item');
                }
            }
        });

        console.log('Mobile layout initialized: 5 Tool buttons moved to bottom bar.');
    }
}

export function playUiSound(type) {
    const originalAudio = uiSounds[type];
    if (originalAudio) {
        const clone = originalAudio.cloneNode();
        clone.volume = originalAudio.volume;
        clone.play().catch(e => {
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
// 筛选器 UI 函数 (保持不变)
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

    // Intro 卡片也可以应用防误触逻辑
    addCardInteraction(card);

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

    // --- 核心交互逻辑 (防误触优化) ---
    addCardInteraction(card);

    // --- 按钮事件绑定 ---
    card.querySelector('.word-audio').addEventListener('click', e => {
        e.stopPropagation();
        const btn = e.currentTarget;
        lastClickedWordAudio.isSlow = lastClickedWordAudio.element === btn ? !lastClickedWordAudio.isSlow : false;
        lastClickedWordAudio.element = btn;
        const suffix = lastClickedWordAudio.isSlow ? '_slow.mp3' : '.mp3';
        playAudioFile(`audio/words/${data.word.toLowerCase()}${suffix}`);
        btn.title = lastClickedWordAudio.isSlow ? '切换为常速朗读' : '切换为慢速朗读';
    });

    card.querySelector('.toggle-prefix-btn').addEventListener('click', e => { e.stopPropagation(); card.classList.toggle('prefix-hidden'); });

    card.querySelector('.mark-btn').addEventListener('click', e => {
        e.stopPropagation();
        handlers.onMarkLearned(data, card);
    });

    const noteBtn = card.querySelector('.note-btn');
    const noteOverlay = card.querySelector('.card-note-overlay');
    const noteInput = card.querySelector('.note-input');
    const noteSaveBtn = card.querySelector('.btn-save');
    const noteCancelBtn = card.querySelector('.btn-cancel');

    const existingNote = State.getUserNote(data.word);
    if (existingNote) {
        noteBtn.classList.add('has-note');
    }

    noteBtn.addEventListener('click', e => {
        e.stopPropagation();
        noteInput.value = State.getUserNote(data.word);
        noteOverlay.classList.remove('is-hidden');
        setTimeout(() => noteInput.focus(), 100);
    });

    noteSaveBtn.addEventListener('click', e => {
        e.stopPropagation();
        const text = noteInput.value.trim();
        State.saveUserNote(data.word, text);
        if (text) {
            noteBtn.classList.add('has-note');
            NotificationManager.show({ type: 'success', message: '笔记已保存' });
        } else {
            noteBtn.classList.remove('has-note');
            NotificationManager.show({ type: 'info', message: '笔记已清空' });
        }
        noteOverlay.classList.add('is-hidden');
    });

    noteCancelBtn.addEventListener('click', e => {
        e.stopPropagation();
        noteOverlay.classList.add('is-hidden');
    });

    noteInput.addEventListener('click', e => e.stopPropagation());

    return card;
}

/**
 * 【新增】通用的卡片交互处理器
 * 处理点击翻转，并增加对移动端滑动的判断，防止误触
 */
function addCardInteraction(card) {
    let startX = 0;
    let startY = 0;
    let isSwiping = false;

    // 触摸开始：记录坐标
    card.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        isSwiping = false;
    }, { passive: true });

    // 触摸移动：检测是否在滑动
    card.addEventListener('touchmove', (e) => {
        const moveX = e.touches[0].clientX;
        const moveY = e.touches[0].clientY;

        // 计算水平和垂直移动距离
        const diffX = Math.abs(moveX - startX);
        const diffY = Math.abs(moveY - startY);

        // 如果移动超过 10px，视为滑动，不应该触发翻转
        if (diffX > 10 || diffY > 10) {
            isSwiping = true;
        }
    }, { passive: true });

    // 触摸结束：如果没有滑动，且未点击到功能区，则翻转
    card.addEventListener('touchend', (e) => {
        if (!isSwiping) {
            // 检查是否点击了内部的可交互按钮（虽然stopPropagation了，但加一层保险）
            if (!e.target.closest('.audio-btn, .toggle-prefix-btn, .mark-btn, .note-btn, .card-note-overlay')) {
                // 延迟一点点触发，避免与滚动冲突
                setTimeout(() => card.classList.toggle('is-flipped'), 50);
            }
        }
    });

    // PC端点击事件（保留兼容性）
    card.addEventListener('click', e => {
        if (window.matchMedia("(hover: hover)").matches) { // 仅在支持悬停的设备（通常是PC）响应click
            if (!e.target.closest('.audio-btn, .toggle-prefix-btn, .mark-btn, .note-btn, .card-note-overlay')) {
                card.classList.toggle('is-flipped');
            }
        }
    });
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
    if (isEnabled) {
        playUiSound('activate');
    }
}

/**
 * 【新增】切换沉浸模式
 */
export function toggleImmersiveMode(btnElement) {
    const isImmersive = document.body.classList.toggle('mode-immersive');

    // 切换按钮图标
    const iconExpand = btnElement.querySelector('.icon-expand');
    const iconCompress = btnElement.querySelector('.icon-compress');

    if (iconExpand && iconCompress) {
        iconExpand.classList.toggle('is-hidden', isImmersive);
        iconCompress.classList.toggle('is-hidden', !isImmersive);
    }

    // 播放音效
    playUiSound('activate');

    // 显示通知
    if (isImmersive) {
        NotificationManager.show({ type: 'success', message: '🔕 已进入沉浸模式' });
    } else {
        NotificationManager.show({ type: 'info', message: '🔔 已退出沉浸模式' });
    }
}