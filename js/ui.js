// =================================================================================
// 通用 UI 渲染模块 (Generic UI Rendering Module) - v14.3 (新增例句焦点模式)
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

    initMobileLayout();

    return true;
}

/**
 * 移动端布局适配逻辑
 * 将工具栏按钮从顶部移动到底部固定栏
 */
function initMobileLayout() {
    const isMobile = window.innerWidth <= 768;

    if (isMobile) {
        const bottomBar = document.getElementById('mobile-bottom-bar');
        const buttonsToMove = [
            'listening-mode-btn', 'typing-mode-btn', 'shuffle-btn',
            'no-visual-btn', 'more-options-btn'
        ];

        buttonsToMove.forEach(id => {
            const btn = document.getElementById(id);
            if (btn && bottomBar) {
                if (id === 'more-options-btn') {
                    const container = document.querySelector('.options-menu-container');
                    if (container) {
                        bottomBar.appendChild(container);
                        container.classList.add('mobile-nav-item');
                    }
                } else {
                    bottomBar.appendChild(btn);
                    btn.classList.add('mobile-nav-item');
                }
            }
        });
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
// 筛选器 UI 函数
// =================================================================================

export function renderGradeButtons(container, grades) {
    container.innerHTML = '';
    // 【核心修改】更新 gradeMap 以包含对 'grade7' (初中) 的中文显示
    const gradeMap = {
        'grade7': '初中',
        'high': '高中'
    };
    ['all', ...grades].forEach(gradeId => {
        const button = document.createElement('button');
        button.className = 'grade-filter-btn';
        button.dataset.grade = gradeId;
        // 使用 gradeMap 查找显示文本，如果找不到则使用 gradeId 作为备用
        button.textContent = gradeMap[gradeId] || (gradeId === 'all' ? '全部阶段' : gradeId);
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

    // --- 【新增】例句焦点模式交互逻辑 ---
    // 1. 动态创建并预置关闭按钮，默认隐藏
    const closeFocusBtn = document.createElement('button');
    closeFocusBtn.className = 'close-focus-btn';
    closeFocusBtn.innerHTML = '&times;'; // 使用 HTML 实体叉号
    closeFocusBtn.title = '关闭焦点模式';
    sentenceSection.prepend(closeFocusBtn); // 将按钮添加到容器顶部

    // 2. 使用 requestAnimationFrame 确保在下一帧检查尺寸，此时 DOM 已完全渲染
    requestAnimationFrame(() => {
        const isScrollable = sentenceSection.scrollHeight > sentenceSection.clientHeight;

        // 3. 只有当内容确实溢出时，才启用焦点模式功能
        if (isScrollable) {
            let isExpanded = false; // 为每个卡片实例创建独立的状态变量

            // 动态添加滚动提示，增强可发现性
            const hint = document.createElement('div');
            hint.className = 'scroll-hint';
            sentenceSection.appendChild(hint);

            // 封装进入和退出逻辑，提高代码可读性
            const enterFocusMode = () => {
                if (isExpanded) return;
                isExpanded = true;
                card.classList.add('sentence-focus-active');
                sentenceSection.classList.add('is-expanded');
                // 自动将滚动条置顶，方便从头阅读
                sentenceSection.scrollTop = 0;
                hint.style.display = 'none'; // 展开后隐藏滚动提示
            };

            const exitFocusMode = () => {
                if (!isExpanded) return;
                isExpanded = false;
                card.classList.remove('sentence-focus-active');
                sentenceSection.classList.remove('is-expanded');
                hint.style.display = 'flex'; // 恢复滚动提示
            };

            // 4. 监听滚动事件以触发焦点模式
            sentenceSection.addEventListener('scroll', () => {
                // 当用户向下滚动超过一个微小阈值 (10px) 时，自动进入焦点模式
                if (!isExpanded && sentenceSection.scrollTop > 10) {
                    enterFocusMode();
                }
            }, { passive: true }); // 使用 passive 提升滚动性能

            // 5. 为关闭按钮绑定点击事件以退出焦点模式
            closeFocusBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // 关键：防止事件冒泡到卡片上导致翻转
                exitFocusMode();
            });
        }
    });
    // --- 【新增】例句焦点模式逻辑结束 ---


    addCardInteraction(card);

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

    if (State.getUserNote(data.word)) {
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
        noteBtn.classList.toggle('has-note', !!text);
        NotificationManager.show({ type: text ? 'success' : 'info', message: text ? '笔记已保存' : '笔记已清空' });
        noteOverlay.classList.add('is-hidden');
    });

    noteCancelBtn.addEventListener('click', e => {
        e.stopPropagation();
        noteOverlay.classList.add('is-hidden');
    });

    noteInput.addEventListener('click', e => e.stopPropagation());

    return card;
}


function addCardInteraction(card) {
    let startX = 0, startY = 0, isSwiping = false;

    card.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        isSwiping = false;
    }, { passive: true });

    card.addEventListener('touchmove', (e) => {
        const diffX = Math.abs(e.touches[0].clientX - startX);
        const diffY = Math.abs(e.touches[0].clientY - startY);
        if (diffX > 10 || diffY > 10) isSwiping = true;
    }, { passive: true });

    card.addEventListener('touchend', (e) => {
        if (!isSwiping && !e.target.closest('.audio-btn, .toggle-prefix-btn, .mark-btn, .note-btn, .card-note-overlay, .close-focus-btn')) {
            setTimeout(() => card.classList.toggle('is-flipped'), 50);
        }
    });

    card.addEventListener('click', e => {
        if (window.matchMedia("(hover: hover)").matches) {
            if (!e.target.closest('.audio-btn, .toggle-prefix-btn, .mark-btn, .note-btn, .card-note-overlay, .close-focus-btn')) {
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
    if (isEnabled) playUiSound('activate');
}

export function toggleImmersiveMode(btnElement) {
    const isImmersive = document.body.classList.toggle('mode-immersive');
    const iconExpand = btnElement.querySelector('.icon-expand');
    const iconCompress = btnElement.querySelector('.icon-compress');

    if (iconExpand && iconCompress) {
        iconExpand.classList.toggle('is-hidden', isImmersive);
        iconCompress.classList.toggle('is-hidden', !isImmersive);
    }

    playUiSound('activate');
    NotificationManager.show({
        type: isImmersive ? 'success' : 'info',
        message: isImmersive ? '🔕 已进入沉浸模式' : '🔔 已退出沉浸模式'
    });
}