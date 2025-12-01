// =================================================================================
// UI 渲染模块 (UI Rendering Module) - v8.1 (统一类别按钮为英文)
// ---------------------------------------------------------------------------------
// 主要职责：
// 1. (DOM元素创建) 提供创建单词卡片、介绍卡片和各类筛选按钮的函数。
// 2. (渲染逻辑) 将卡片元素批量渲染到指定的容器中。
// 3. (UI交互) 封装与UI直接相关的交互。
// 4. (音频播放) 播放本地音频文件。
// 5. (动态内容) 【改动】类别按钮统一使用 state 模块提供的英文名。
// 6. (模态框管理) 处理无图模式切换和听力模态框。
// =================================================================================

// --- 模块内变量 ---
let cardTemplate;
let prefixIntroTemplate;
const audioPlayer = new Audio();

// --- 听力模式相关 DOM 引用缓存 ---
let listeningModalElements = null;

let handleEscKeydown = null;

// =================================================================================
// 文件名处理函数
// =================================================================================

const MAX_FILENAME_SLUG_LENGTH = 60;

/**
 * 将文本转换为对文件名安全的“slug”。
 */
export function sanitizeForFilename(text) {
    if (typeof text !== 'string' || !text) {
        return '';
    }
    let slug = text.toLowerCase();
    slug = slug.replace(/[^a-z0-9]+/g, '_');
    if (slug.length > MAX_FILENAME_SLUG_LENGTH) {
        slug = slug.slice(0, MAX_FILENAME_SLUG_LENGTH);
    }
    slug = slug.replace(/^_+|_+$/g, '');
    return slug;
}


/**
 * 初始化UI模块，获取模板元素。
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
 */
export function playAudioFile(filePath, onEnded = null) {
    if (!filePath) {
        console.warn('尝试播放一个空的音频文件路径。');
        if (onEnded) onEnded();
        return;
    }

    try {
        if (!audioPlayer.paused) {
            audioPlayer.pause();
            audioPlayer.currentTime = 0;
        }
        audioPlayer.src = filePath;

        if (typeof audioPlayer._handleEnded === 'function') {
            audioPlayer.removeEventListener('ended', audioPlayer._handleEnded);
        }

        const handleEnded = () => {
            if (onEnded) onEnded();
            audioPlayer.removeEventListener('ended', handleEnded);
            delete audioPlayer._handleEnded;
        };

        audioPlayer._handleEnded = handleEnded;
        audioPlayer.addEventListener('ended', handleEnded);

        const playPromise = audioPlayer.play();

        if (playPromise !== undefined) {
            playPromise.catch(error => {
                if (error.name !== 'AbortError') {
                    console.error(`播放音频文件 "${filePath}" 失败 (文件可能不存在或损坏):`, error);
                    if (typeof audioPlayer._handleEnded === 'function') {
                        audioPlayer.removeEventListener('ended', audioPlayer._handleEnded);
                        delete audioPlayer._handleEnded;
                    }
                    if (onEnded) onEnded();
                }
            });
        }
    } catch (error) {
        console.error(`设置或播放音频时发生意外错误:`, error);
    }
}


/**
 * 停止当前正在播放的音频。
 */
export function stopAudio() {
    if (!audioPlayer.paused) {
        audioPlayer.pause();
        audioPlayer.currentTime = 0;
    }
}

// =================================================================================
// 筛选器 UI 函数
// =================================================================================

/**
 * 动态生成年级筛选器按钮。
 */
export function renderGradeButtons(container, grades) {
    container.innerHTML = '';
    const gradeMap = { 'grade7': 'Grade 7', 'grade8': 'Grade 8', 'grade9': 'Grade 9' };

    const allButton = document.createElement('button');
    allButton.className = 'grade-filter-btn';
    allButton.dataset.grade = 'all';
    allButton.textContent = 'All Grades';
    container.appendChild(allButton);

    grades.forEach(gradeId => {
        const button = document.createElement('button');
        button.className = 'grade-filter-btn';
        button.dataset.grade = gradeId;
        button.textContent = gradeMap[gradeId] || gradeId;
        container.appendChild(button);
    });
}

/**
 * 更新年级筛选器按钮的激活状态。
 */
export function updateActiveGradeButton(container, clickedButton) {
    container.querySelectorAll('.grade-filter-btn').forEach(btn => btn.classList.remove('active'));
    clickedButton.classList.add('active');
}

/**
 * 渲染固定的内容类型筛选器按钮。
 */
export function renderContentTypeButtons(container) {
    container.innerHTML = '';
    const types = [
        { type: 'all', text: 'All Types' },
        { type: 'pre', text: 'Prefix' },
        { type: 'suf', text: 'Suffix' },
        { type: 'root', text: 'Root' },
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

/**
 * 更新内容类型筛选器按钮的激活状态。
 */
export function updateActiveContentTypeButton(container, clickedButton) {
    container.querySelectorAll('.content-type-btn').forEach(btn => btn.classList.remove('active'));
    clickedButton.classList.add('active');
}

/**
 * 【核心改动】动态生成类别筛选器按钮，统一使用英文名。
 */
export function renderFilterButtons(filterContainer, insertBeforeElement, categories) {
    filterContainer.querySelectorAll('.filter-btn').forEach(btn => btn.remove());

    const allButton = document.createElement('button');
    allButton.className = 'filter-btn active';
    allButton.dataset.filter = 'all';
    allButton.textContent = 'All';
    filterContainer.insertBefore(allButton, insertBeforeElement);

    const learnedButton = document.createElement('button');
    learnedButton.className = 'filter-btn';
    learnedButton.dataset.filter = 'learned';
    learnedButton.textContent = 'Learned';
    filterContainer.insertBefore(learnedButton, insertBeforeElement);

    categories.forEach(category => {
        if (!category.meaningId) return;

        const button = document.createElement('button');
        button.className = 'filter-btn';
        button.dataset.filter = category.meaningId;

        // 【智能文本】根据内容类型决定按钮文本
        let buttonText;
        if (category.contentType === 'pre') {
            buttonText = `${category.prefix}-`;
        } else if (category.contentType === 'suf') {
            buttonText = `-${category.prefix}`;
        } else if (category.contentType === 'root') {
            buttonText = `-${category.prefix}-`;
        } else {
            // 对于普通类别，使用 state 层处理好的纯英文名
            buttonText = category.englishDisplayName;
        }
        button.textContent = buttonText;

        if (category.themeColor) {
            button.dataset.themeColor = category.themeColor;
        }
        filterContainer.insertBefore(button, insertBeforeElement);
    });
}


/**
 * 更新类别筛选器按钮的激活状态和样式。
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

// =================================================================================
// 卡片创建与交互函数
// =================================================================================

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

function createWordCard(data, handlers) {
    const cardClone = cardTemplate.content.cloneNode(true).firstElementChild;
    if (data.themeColor) {
        cardClone.style.setProperty('--theme-color', data.themeColor);
    }
    if (data.isLearned) {
        cardClone.classList.add('is-learned');
    }

    const visualArea = cardClone.querySelector('.visual-area');
    visualArea.innerHTML = `<svg viewBox="0 0 24 24" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <g class="layer-root">${data.rootVisual || ''}</g>
                            <g class="layer-prefix">${data.prefixVisual || ''}</g>
                        </svg>`;

    const badgeElement = cardClone.querySelector('.prefix-badge');
    if (data.contentType === 'suf') {
        badgeElement.textContent = `-${data.prefix}`;
    } else if (data.contentType === 'root') {
        badgeElement.textContent = `-${data.prefix}-`;
    } else {
        badgeElement.textContent = `${data.prefix}-`;
    }

    cardClone.querySelector('.word-text').textContent = data.word;
    cardClone.querySelector('.part-prefix').textContent = data.breakdown[0];
    cardClone.querySelector('.part-root').textContent = data.breakdown[1];
    cardClone.querySelector('.cn-translation').textContent = data.translation;
    cardClone.querySelector('.imagery-text').textContent = `“${data.imagery}”`;

    const wordLower = data.word.toLowerCase();
    const standardVariants = wordLower + '(?:s|es|ed|ing|d|r|st)?';
    let specialVariants = '';
    if (wordLower.endsWith('y') && wordLower.length > 2) {
        const baseWord = wordLower.slice(0, -1);
        specialVariants = `|${baseWord}(?:ied|ies)`;
    }
    const combinedPattern = new RegExp(`\\b(${standardVariants}${specialVariants})\\b`, 'gi');

    const sentenceSection = cardClone.querySelector('.sentence-section');
    if (Array.isArray(data.sentences) && data.sentences.length > 0) {
        data.sentences.forEach((sentence, index) => {
            const sentenceBlock = document.createElement('div');
            sentenceBlock.className = 'sentence-block';
            const sentenceEn = document.createElement('div');
            sentenceEn.className = 'sentence-en';
            sentenceEn.innerHTML = sentence.en.replace(combinedPattern, `<strong style="color: var(--theme-color, black);">$1</strong>`);
            const sentenceCn = document.createElement('div');
            sentenceCn.className = 'sentence-cn';
            sentenceCn.textContent = sentence.cn;
            const audioBtn = document.createElement('button');
            audioBtn.className = 'audio-btn sentence-audio';
            audioBtn.title = '朗读例句';
            audioBtn.innerHTML = `<span>🔊 Listen ${data.sentences.length > 1 ? index + 1 : ''}</span>`;
            audioBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sentenceSlug = sanitizeForFilename(sentence.en);
                const sentenceAudioPath = `audio/sentences/${data.word.toLowerCase()}_${sentenceSlug}.mp3`;
                playAudioFile(sentenceAudioPath);
            });
            sentenceBlock.appendChild(sentenceEn);
            sentenceBlock.appendChild(sentenceCn);
            sentenceBlock.appendChild(audioBtn);
            sentenceSection.appendChild(sentenceBlock);
        });
    }

    cardClone.addEventListener('click', (e) => {
        if (!e.target.closest('.audio-btn, .toggle-prefix-btn, .mark-btn')) {
            cardClone.classList.toggle('is-flipped');
        }
    });

    cardClone.querySelector('.word-audio').addEventListener('click', (e) => {
        e.stopPropagation();
        const wordAudioPath = `audio/words/${data.word.toLowerCase()}.mp3`;
        playAudioFile(wordAudioPath);
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
        if (handlers.onMarkLearned) {
            handlers.onMarkLearned(data, cardClone);
        }
    });

    return cardClone;
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
        eyeOpen.style.display = isEnabled ? 'none' : 'block';
        eyeSlash.style.display = isEnabled ? 'block' : 'none';
    }
    btnElement.title = isEnabled ? "Hide Visuals" : "Show Visuals";
}

// =================================================================================
// 听力模式模态框函数
// =================================================================================

export function showListeningModal() {
    const modal = document.getElementById('listening-modal');
    if (modal) {
        modal.style.display = 'flex';
        if (!listeningModalElements) {
            listeningModalElements = {
                modal: modal, word: modal.querySelector('.listening-word'), meaning: modal.querySelector('.listening-meaning'), sentenceEn: modal.querySelector('.listening-sentence-en'), sentenceCn: modal.querySelector('.listening-sentence-cn'), placeholder: modal.querySelector('.listening-hidden-placeholder'), revealedContent: modal.querySelector('.listening-revealed-content'), waves: document.getElementById('audio-waves'), sourceToggle: document.getElementById('audio-source-toggle')
            };
        }
        handleEscKeydown = (event) => { if (event.key === 'Escape') hideListeningModal(); };
        document.addEventListener('keydown', handleEscKeydown);
    }
}

export function hideListeningModal() {
    const modal = document.getElementById('listening-modal');
    if (modal && modal.style.display !== 'none') {
        modal.style.display = 'none';
        stopAudio();
        if (handleEscKeydown) {
            document.removeEventListener('keydown', handleEscKeydown);
            handleEscKeydown = null;
        }
    }
}

export function updateListeningCard(data, sentenceIndex) {
    if (!listeningModalElements) return;
    const els = listeningModalElements;
    els.placeholder.style.display = 'block';
    els.revealedContent.style.display = 'none';
    els.word.textContent = data.word;
    els.meaning.textContent = data.translation;
    if (data.sentences && data.sentences[sentenceIndex]) {
        els.sentenceEn.innerHTML = data.sentences[sentenceIndex].en;
        els.sentenceCn.textContent = data.sentences[sentenceIndex].cn;
    } else {
        els.sentenceEn.textContent = "（No example sentence）";
        els.sentenceCn.textContent = "";
    }
}

export function revealListeningAnswer() {
    if (!listeningModalElements) return;
    listeningModalElements.placeholder.style.display = 'none';
    listeningModalElements.revealedContent.style.display = 'block';
}

export function isPlaySentenceMode() {
    if (!listeningModalElements) return true;
    return listeningModalElements.sourceToggle.checked;
}

export function setAudioWaveAnimation(isPlaying) {
    if (!listeningModalElements || !listeningModalElements.waves) return;
    if (isPlaying) {
        listeningModalElements.waves.classList.add('is-playing');
    } else {
        listeningModalElements.waves.classList.remove('is-playing');
    }
}