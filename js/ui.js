/**
 * =================================================================================
 * 通用 UI 渲染模块 (Generic UI Rendering Module) - v20.3 (Content Type 扩展)
 * ---------------------------------------------------------------------------------
 * 主要变更:
 * - renderContentTypeButtons: 扩展以接受用户单词本列表，并将“已掌握”和“单词本”
 *   作为一级内容类型按钮渲染，与 Prefix/Suffix 等平级。
 * - renderFilterButtons: 移除底部筛选栏中不再需要的“已掌握”和“单词本”按钮生成逻辑。
 * =================================================================================
 */

import * as State from './state.js';
import * as NotificationManager from './modules/notificationManager.js';
import { ICONS } from './icons.js';

let cardTemplate;
let prefixIntroTemplate;

const audioPlayer = new Audio();
let lastClickedWordAudio = { element: null, isSlow: false };
const MAX_FILENAME_SLUG_LENGTH = 60;

const uiSounds = {
    complete: null, uncomplete: null, undo: null, activate: null
};

const UI_SOUND_PATHS = {
    complete: 'audio/ui/Complete.mp3',
    uncomplete: 'audio/ui/UnComplete.mp3',
    undo: 'audio/ui/Undo.mp3',
    activate: 'audio/ui/Activate.mp3'
};

let desktopElementsToMove = {};
const elementsToMoveConfig = {
    'listening-mode-btn': { type: 'id' },
    'dialogue-mode-btn': { type: 'id' },
    'typing-mode-btn': { type: 'id' },
    'shuffle-btn': { type: 'id' },
    'no-visual-btn': { type: 'id' },
    'options-menu-container': { type: 'class' }
};
let searchContainerRef = null;


function renderIcons(scope = document) {
    if (!ICONS || Object.keys(ICONS).length === 0) {
        console.error("图标库未加载或为空，无法渲染图标。");
        return;
    }
    const placeholders = scope.querySelectorAll('[data-icon]');
    placeholders.forEach(placeholder => {
        const iconName = placeholder.dataset.icon;
        if (ICONS[iconName]) {
            placeholder.innerHTML = ICONS[iconName];
            placeholder.removeAttribute('data-icon');
        } else {
            console.warn(`未在图标库中找到名为 "${iconName}" 的图标。`);
        }
    });
}

export function init() {
    cardTemplate = document.getElementById('card-template');
    prefixIntroTemplate = document.getElementById('prefix-intro-template');

    if (!cardTemplate || !prefixIntroTemplate) {
        console.error('关键的卡片模板元素未在 HTML 中找到。');
        return false;
    }

    renderIcons();

    Object.entries(UI_SOUND_PATHS).forEach(([key, path]) => {
        try {
            const audio = new Audio(path);
            audio.preload = 'auto';
            audio.volume = 0.6;
            uiSounds[key] = audio;
        } catch (e) {
            console.warn(`无法加载音效资源: ${path}`, e);
        }
    });

    Object.keys(elementsToMoveConfig).forEach(key => {
        const config = elementsToMoveConfig[key];
        const element = config.type === 'id' ? document.getElementById(key) : document.querySelector(`.${key}`);
        if (element && element.parentNode) {
            desktopElementsToMove[key] = { element, parent: element.parentNode };
        }
    });
    searchContainerRef = document.getElementById('search-container');

    return true;
}

export function updateResponsiveLayout() {
    const isMobile = window.innerWidth <= 768;
    const bottomBar = document.getElementById('mobile-bottom-bar');
    if (!bottomBar) return;

    Object.values(desktopElementsToMove).forEach(({ element, parent }) => {
        if (!element) return;

        if (isMobile) {
            if (element.parentNode !== bottomBar) {
                bottomBar.appendChild(element);
            }
        } else {
            if (element.parentNode === bottomBar && parent) {
                if (searchContainerRef) {
                    parent.insertBefore(element, searchContainerRef);
                } else {
                    parent.appendChild(element);
                }
            }
        }
    });
}


export function playUiSound(type) {
    const originalAudio = uiSounds[type];
    if (originalAudio) {
        const clone = originalAudio.cloneNode();
        clone.volume = originalAudio.volume;
        clone.play().catch(e => {
            if (e.name !== 'NotAllowedError') console.warn(`播放 UI 音效 (${type}) 失败`, e);
        });
    }
}

export function sanitizeForFilename(text) {
    if (typeof text !== 'string' || !text) return '';
    return text.toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .slice(0, MAX_FILENAME_SLUG_LENGTH)
        .replace(/^_+|_+$/g, '');
}

export function playAudioFile(filePath, onEnded = null) {
    if (!filePath) {
        onEnded?.();
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
            onEnded?.();
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
// 筛选器与计数器 UI 函数
// =================================================================================

export function updateWordCounts(currentCount, learnedCount) {
    const currentCountEl = document.getElementById('word-count-current');
    const learnedCountEl = document.getElementById('word-count-learned');
    if (currentCountEl) currentCountEl.textContent = currentCount;
    if (learnedCountEl) learnedCountEl.textContent = learnedCount;
}

export function renderCategoryButtons(container, categories) {
    container.innerHTML = '';
    const allCategories = ['all', ...categories];

    allCategories.forEach(categoryId => {
        const button = document.createElement('button');
        button.className = 'category-filter-btn';
        button.dataset.category = categoryId;
        button.textContent = (categoryId === 'all') ? 'All Stages' : categoryId;
        container.appendChild(button);
    });
}

export function updateActiveCategoryButton(container, clickedButton) {
    container.querySelectorAll('.category-filter-btn').forEach(btn => btn.classList.remove('active'));
    clickedButton.classList.add('active');
}

/**
 * 【核心修改】渲染内容类型按钮（Content Type Buttons）。
 * 现在包括：All, Prefix, Suffix, Root, General, Learned, 以及所有用户单词本。
 * @param {HTMLElement} container
 * @param {Array} wordbooks - 用户单词本列表
 */
export function renderContentTypeButtons(container, wordbooks = []) {
    container.innerHTML = '';

    // 1. 标准固定类型
    const standardTypes = [
        { type: 'all', text: 'All Types' },
        { type: 'pre', text: 'Prefix' },
        { type: 'suf', text: 'Suffix' },
        { type: 'root', text: 'Root' },
        { type: 'category', text: 'General' }
    ];

    // 2. 特殊类型：已掌握
    // 使用 'special_learned' 作为内部ID，避免与 'learned' 子分类（如果有）冲突
    const specialTypes = [
        { type: 'special_learned', text: 'Learned', className: 'btn-learned-type' }
    ];

    // 3. 动态类型：用户单词本
    // 使用 'wb_' 前缀来区分单词本ID
    const wordbookTypes = wordbooks.map(wb => ({
        type: `wb_${wb.name}`,
        text: `📘 ${wb.name}`,
        className: 'btn-wordbook-type'
    }));

    const allButtons = [...standardTypes, ...specialTypes, ...wordbookTypes];

    allButtons.forEach(({ type, text, className }) => {
        const button = document.createElement('button');
        button.className = 'category-filter-btn content-type-btn';
        if (className) button.classList.add(className);
        button.dataset.type = type;
        button.textContent = text;
        container.appendChild(button);
    });
}

export function updateActiveContentTypeButton(container, clickedButton) {
    container.querySelectorAll('.content-type-btn').forEach(btn => btn.classList.remove('active'));
    clickedButton.classList.add('active');
}

/**
 * 【核心修改】渲染子分类筛选按钮（Filter Buttons）。
 * 移除了不再需要的 "Learned" 和 "Wordbook" 按钮，因为它们现在位于 Content Type 层级。
 */
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

    // 【修改】这里不再添加 "Learned" 按钮

    categories.forEach(category => {
        if (!category.meaningId) return;

        // 【修改】这里不再处理 'user-wordbook' 类型的 category，因为 getAvailableSubCategories 不再返回它们

        let buttonText;
        if (category.contentType === 'pre') {
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
    if (clickedButton.dataset.themeColor) {
        clickedButton.style.setProperty('--button-theme-color', clickedButton.dataset.themeColor);
    }
}

// =================================================================================
// 热力图与成就渲染
// =================================================================================

export function renderHeatmap(container, activityData) {
    if (!container) return;
    container.innerHTML = '';

    const isMobile = window.innerWidth <= 768;
    const DAYS_TO_SHOW = isMobile ? 120 : 365;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - DAYS_TO_SHOW);
    const startDayOfWeek = startDate.getDay();

    const fragment = document.createDocumentFragment();

    let tooltip = document.getElementById('heatmap-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'heatmap-tooltip';
        tooltip.className = 'heatmap-tooltip';
        document.body.appendChild(tooltip);
    }

    for (let i = 0; i < startDayOfWeek; i++) {
        const spacer = document.createElement('div');
        spacer.className = 'heatmap-day is-spacer';
        fragment.appendChild(spacer);
    }

    for (let i = 0; i <= DAYS_TO_SHOW; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        const count = activityData[dateStr] || 0;

        const dayEl = document.createElement('div');
        dayEl.className = 'heatmap-day';
        dayEl.dataset.date = dateStr;
        dayEl.dataset.count = count;

        let level = 0;
        if (count > 0) level = 1;
        if (count >= 5) level = 2;
        if (count >= 10) level = 3;
        if (count >= 20) level = 4;
        dayEl.dataset.level = level;

        dayEl.addEventListener('mouseenter', (e) => {
            const target = e.currentTarget;
            const rect = target.getBoundingClientRect();
            const date = target.dataset.date;
            const count = target.dataset.count;

            tooltip.innerHTML = `
                <span class="heatmap-tooltip-date">${date}</span>
                <span style="font-weight:bold; font-size:1.1em;">${count}</span> 
                <span class="heatmap-tooltip-label">词已掌握</span>
            `;
            tooltip.style.top = `${rect.top - 10}px`;
            tooltip.style.left = `${rect.left + rect.width / 2}px`;
            tooltip.classList.add('is-visible');
        });

        dayEl.addEventListener('mouseleave', () => tooltip.classList.remove('is-visible'));
        fragment.appendChild(dayEl);
    }
    container.appendChild(fragment);
}


export function renderAchievementsList(listContainer) {
    if (!listContainer) return;
    listContainer.innerHTML = '';
    const defs = State.ACHIEVEMENT_DEFINITIONS;
    const userProgress = State.userAchievements;
    const fragment = document.createDocumentFragment();

    defs.forEach(def => {
        const progressData = userProgress[def.id] || { unlocked: false, progress: 0 };
        const isUnlocked = progressData.unlocked;
        const progressPercent = isUnlocked ? 100 : (def.target > 0 ? Math.min(100, (progressData.progress / def.target) * 100) : 0);
        const item = document.createElement('div');
        item.className = `achievement-item ${isUnlocked ? 'is-unlocked' : ''}`;
        item.innerHTML = `
            <div class="achievement-icon">${def.icon}</div>
            <div class="achievement-info">
                <div class="achievement-header">
                    <span class="achievement-name">${def.name}</span>
                    ${isUnlocked ? '<span class="achievement-badge">已解锁</span>' : ''}
                </div>
                <p class="achievement-desc">${def.description}</p>
                <div class="achievement-progress-track">
                    <div class="achievement-progress-bar" style="width: ${progressPercent}%"></div>
                </div>
                <div class="achievement-progress-text">${progressData.progress} / ${def.target}</div>
            </div>`;
        fragment.appendChild(item);
    });
    listContainer.appendChild(fragment);
}

// =================================================================================
// 卡片创建与核心交互
// =================================================================================

function createIntroCard(data) {
    const card = prefixIntroTemplate.content.cloneNode(true).firstElementChild;
    if (data.themeColor) card.style.setProperty('--theme-color', data.themeColor);
    if (data.visual) card.querySelector('.visual-area').innerHTML = `<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round">${data.visual}</svg>`;
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

    renderIcons(card);

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

    const closeFocusBtn = document.createElement('button');
    closeFocusBtn.className = 'close-focus-btn';
    closeFocusBtn.innerHTML = '&times;';
    closeFocusBtn.title = '关闭焦点模式';
    sentenceSection.prepend(closeFocusBtn);

    requestAnimationFrame(() => {
        if (sentenceSection.scrollHeight <= sentenceSection.clientHeight) return;
        let isExpanded = false;
        const hint = document.createElement('div');
        hint.className = 'scroll-hint';
        sentenceSection.appendChild(hint);
        const enterFocus = () => { if (!isExpanded) { isExpanded = true; card.classList.add('sentence-focus-active'); sentenceSection.classList.add('is-expanded'); sentenceSection.scrollTop = 0; hint.style.display = 'none'; } };
        const exitFocus = () => { if (isExpanded) { isExpanded = false; card.classList.remove('sentence-focus-active'); sentenceSection.classList.remove('is-expanded'); hint.style.display = 'flex'; } };
        sentenceSection.addEventListener('scroll', () => { if (!isExpanded && sentenceSection.scrollTop > 10) enterFocus(); }, { passive: true });
        closeFocusBtn.addEventListener('click', (e) => { e.stopPropagation(); exitFocus(); });
    });

    addCardInteraction(card);

    card.querySelector('.word-audio').addEventListener('click', e => {
        e.stopPropagation();
        const btn = e.currentTarget;
        lastClickedWordAudio.isSlow = (lastClickedWordAudio.element === btn) ? !lastClickedWordAudio.isSlow : false;
        lastClickedWordAudio.element = btn;
        playAudioFile(`audio/words/${data.word.toLowerCase()}${lastClickedWordAudio.isSlow ? '_slow.mp3' : '.mp3'}`);
        btn.title = lastClickedWordAudio.isSlow ? '切换为常速朗读' : '切换为慢速朗读';
    });

    card.querySelector('.toggle-prefix-btn').addEventListener('click', e => { e.stopPropagation(); card.classList.toggle('prefix-hidden'); });

    const markBtn = card.querySelector('.mark-btn');
    if (markBtn) markBtn.title = State.currentFilter === 'learned' ? '标记为未掌握' : '标记为已掌握';
    markBtn.addEventListener('click', e => { e.stopPropagation(); handlers.onMarkLearned(data, card); });

    const noteBtn = card.querySelector('.note-btn');
    const noteOverlay = card.querySelector('.card-note-overlay');
    const noteInput = card.querySelector('.note-input');
    if (State.getUserNote(data.word)) noteBtn.classList.add('has-note');

    noteBtn.addEventListener('click', e => {
        e.stopPropagation();
        noteInput.value = State.getUserNote(data.word);
        noteOverlay.classList.remove('is-hidden');
        setTimeout(() => noteInput.focus(), 100);
    });

    card.querySelector('.btn-save').addEventListener('click', e => {
        e.stopPropagation();
        const text = noteInput.value.trim();
        State.saveUserNote(data.word, text);
        noteBtn.classList.toggle('has-note', !!text);
        NotificationManager.show({ type: text ? 'success' : 'info', message: text ? '笔记已保存' : '笔记已清空' });
        noteOverlay.classList.add('is-hidden');
    });

    card.querySelector('.btn-cancel').addEventListener('click', e => { e.stopPropagation(); noteOverlay.classList.add('is-hidden'); });
    noteInput.addEventListener('click', e => e.stopPropagation());

    return card;
}

function addCardInteraction(card) {
    let startX = 0, startY = 0, isSwiping = false;
    const isDesktop = window.matchMedia("(hover: hover)").matches;
    const flipHandler = (e) => {
        if (!e.target.closest('.audio-btn, .toggle-prefix-btn, .mark-btn, .note-btn, .card-note-overlay, .close-focus-btn')) {
            card.classList.toggle('is-flipped');
        }
    };
    if (isDesktop) {
        card.addEventListener('click', flipHandler);
    } else {
        card.addEventListener('touchstart', e => { startX = e.touches[0].clientX; startY = e.touches[0].clientY; isSwiping = false; }, { passive: true });
        card.addEventListener('touchmove', e => { if (Math.abs(e.touches[0].clientX - startX) > 10 || Math.abs(e.touches[0].clientY - startY) > 10) isSwiping = true; }, { passive: true });
        card.addEventListener('touchend', e => { if (!isSwiping) setTimeout(() => flipHandler(e), 50); });
    }
}

export function createCard(data, handlers) {
    return data.cardType === 'intro' ? createIntroCard(data) : createWordCard(data, handlers);
}

export function toggleNoVisualMode(btnElement) {
    const isEnabled = document.body.classList.toggle('mode-no-visual');
    btnElement.classList.toggle('active', isEnabled);
    btnElement.title = isEnabled ? "关闭无图模式" : "开启无图自测模式";
    if (isEnabled) playUiSound('activate');
}

export function toggleImmersiveMode(btnElement) {
    const isImmersive = document.body.classList.toggle('mode-immersive');
    playUiSound('activate');
    NotificationManager.show({ type: isImmersive ? 'success' : 'info', message: isImmersive ? '🔕 已进入沉浸模式' : '🔔 已退出沉浸模式' });
}