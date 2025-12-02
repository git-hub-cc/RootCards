// =================================================================================
// UI 渲染模块 (UI Rendering Module) - v9.0 (新增单词本创建UI)
// ---------------------------------------------------------------------------------
// 主要职责：
// 1. (DOM元素创建) 提供创建单词卡片、介绍卡片和各类筛选按钮的函数。
// 2. (渲染逻辑) 将卡片元素批量渲染到指定的容器中。
// 3. (UI交互) 提供通用的JSON文件下载辅助函数。
// 4. (音频播放) 播放本地音频文件。
// 5. (模态框管理) 处理无图模式切换、听力、打字以及新增的“单词本创建”模态框。
// =================================================================================

import * as State from './state.js'; // 引入 State 模块以使用 getMaskedSentence

// --- 模块内变量 ---
let cardTemplate;
let prefixIntroTemplate;
const audioPlayer = new Audio();

// --- 模态框相关 DOM 引用缓存 ---
let listeningModalElements = null;
let typingModalElements = null;
let wordbookModalElements = null; // 【新增】单词本模态框元素缓存

let handleEscKeydown = null;

// 用于追踪双语速播放状态的状态机
let lastClickedWordAudio = {
    element: null, // 存储最后点击的单词发音按钮的 DOM 元素
    isSlow: false  // 标记下一次播放是否应为慢速
};

// =================================================================================
// 文件名处理与下载辅助函数
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
 * 触发一个 JSON 文件的下载。
 * @param {object} dataObject - 需要被序列化并下载的 JavaScript 对象或数组。
 * @param {string} filename - 下载文件的默认名称。
 */
export function triggerJsonDownload(dataObject, filename) {
    try {
        const jsonString = JSON.stringify(dataObject, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('创建下载文件时出错:', error);
        alert('抱歉，创建下载文件时发生错误，请检查控制台。');
    }
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
 * 动态生成类别筛选器按钮，现在支持用户自定义单词本。
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
        button.dataset.filterType = category.filterType;

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

    if (clickedButton.dataset.filterType !== 'user-wordbook' && clickedButton.dataset.themeColor) {
        const themeColor = clickedButton.dataset.themeColor;
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
        const currentButton = e.currentTarget;
        const wordLower = data.word.toLowerCase();
        if (lastClickedWordAudio.element !== currentButton) {
            if (lastClickedWordAudio.element) {
                lastClickedWordAudio.element.classList.remove('slow-playback-mode');
                lastClickedWordAudio.element.title = '朗读单词';
            }
            lastClickedWordAudio.element = currentButton;
            lastClickedWordAudio.isSlow = false;
        } else {
            lastClickedWordAudio.isSlow = !lastClickedWordAudio.isSlow;
        }
        const audioSuffix = lastClickedWordAudio.isSlow ? '_slow.mp3' : '.mp3';
        const audioPath = `audio/words/${wordLower}${audioSuffix}`;
        if (lastClickedWordAudio.isSlow) {
            currentButton.classList.add('slow-playback-mode');
            currentButton.title = '朗读单词 (慢速) - 再点恢复常速';
        } else {
            currentButton.classList.remove('slow-playback-mode');
            currentButton.title = '朗读单词 (常速) - 再点可慢放';
        }
        playAudioFile(audioPath);
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


// =================================================================================
// 打字拼写模式模态框函数
// =================================================================================

export function showTypingModal() {
    const modal = document.getElementById('typing-modal');
    if (modal) {
        modal.style.display = 'flex';
        if (!typingModalElements) {
            typingModalElements = {
                modal: modal,
                progressCurrent: document.getElementById('typing-progress-current'),
                progressTotal: document.getElementById('typing-progress-total'),
                meaning: document.getElementById('typing-meaning'),
                sentence: document.getElementById('typing-sentence'),
                input: document.getElementById('typing-input'),
                feedbackIcon: document.getElementById('typing-feedback-icon'),
                resultArea: document.getElementById('typing-result-area'),
                correctAnswer: document.getElementById('typing-correct-answer'),
                submitBtn: document.getElementById('typing-submit-btn'),
                nextBtn: document.getElementById('typing-next-btn'),
                hintBtn: document.getElementById('typing-hint-btn')
            };
        }
        handleEscKeydown = (event) => { if (event.key === 'Escape') hideTypingModal(); };
        document.addEventListener('keydown', handleEscKeydown);
    }
}

export function hideTypingModal() {
    const modal = document.getElementById('typing-modal');
    if (modal && modal.style.display !== 'none') {
        modal.style.display = 'none';
        stopAudio();
        if (handleEscKeydown) {
            document.removeEventListener('keydown', handleEscKeydown);
            handleEscKeydown = null;
        }
    }
}

export function renderTypingCard(data, current, total) {
    if (!typingModalElements) return;
    const els = typingModalElements;

    els.progressCurrent.textContent = current;
    els.progressTotal.textContent = total;

    els.meaning.textContent = data.translation;

    if (data.sentences && data.sentences.length > 0) {
        const randomIdx = Math.floor(Math.random() * data.sentences.length);
        const sentenceText = data.sentences[randomIdx].en;
        els.sentence.innerHTML = State.getMaskedSentence(sentenceText, data.word);
    } else {
        els.sentence.innerHTML = '<span class="masked-word">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span> (No example sentence available)';
    }

    resetTypingInput();

    setTimeout(() => els.input.focus(), 100);
}

export function resetTypingInput() {
    if (!typingModalElements) return;
    const els = typingModalElements;

    els.input.value = '';
    els.input.disabled = false;
    els.input.className = 'typing-input';
    els.input.placeholder = '输入单词...';
    els.hintBtn.disabled = false;

    els.resultArea.style.display = 'none';
    els.submitBtn.style.display = 'block';
    els.nextBtn.style.display = 'none';
}

export function showTypingFeedback(isCorrect, correctWord) {
    if (!typingModalElements) return;
    const els = typingModalElements;

    els.input.disabled = true;

    if (isCorrect) {
        els.input.classList.add('success');
    } else {
        els.input.classList.add('error');
        els.correctAnswer.textContent = correctWord;
        els.resultArea.style.display = 'block';
    }

    els.submitBtn.style.display = 'none';
    els.nextBtn.style.display = 'block';
    els.nextBtn.focus();
}

export function showTypingHint(word, level) {
    if (!typingModalElements || !word || word.length === 0 || level < 1 || level > 3) {
        return;
    }
    const els = typingModalElements;
    let hintText = '';

    switch (level) {
        case 1:
            if (word.length <= 2) {
                hintText = '_'.repeat(word.length);
            } else {
                hintText = word[0] + '_'.repeat(word.length - 2) + word[word.length - 1];
            }
            break;

        case 2:
            const chars = word.split('');
            let revealed = Array(word.length).fill('_');
            if (word.length > 0) revealed[0] = chars[0];
            if (word.length > 1) revealed[revealed.length - 1] = chars[chars.length - 1];
            const hiddenIndices = [];
            for (let i = 1; i < word.length - 1; i++) {
                hiddenIndices.push(i);
            }
            const revealCount = Math.max(0, Math.floor(word.length / 2) - 2);
            for (let i = hiddenIndices.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [hiddenIndices[i], hiddenIndices[j]] = [hiddenIndices[j], hiddenIndices[i]];
            }
            for (let i = 0; i < revealCount && i < hiddenIndices.length; i++) {
                const indexToShow = hiddenIndices[i];
                revealed[indexToShow] = chars[indexToShow];
            }
            hintText = revealed.join('');
            break;

        case 3:
            hintText = word;
            els.hintBtn.disabled = true;
            break;
    }

    els.input.placeholder = hintText;
}

// =================================================================================
// 创建单词本模态框 UI 函数
// =================================================================================

/**
 * 缓存单词本模态框的所有 DOM 元素引用，提高性能。
 */
function cacheWordbookModalElements() {
    if (wordbookModalElements) return true;
    const modal = document.getElementById('wordbook-modal');
    if (!modal) return false;

    wordbookModalElements = {
        modal,
        closeBtn: document.getElementById('wordbook-close-btn'),
        textInput: document.getElementById('wordbook-text-input'),
        extractBtn: document.getElementById('wordbook-extract-btn'),
        extractStatus: document.getElementById('wordbook-extract-status'),
        wordCount: document.getElementById('wordbook-word-count'),
        selectAllBtn: document.getElementById('wordbook-select-all-btn'),
        deselectAllBtn: document.getElementById('wordbook-deselect-all-btn'),
        wordList: document.getElementById('wordbook-list'),
        nameInput: document.getElementById('wordbook-name-input'),
        createBtn: document.getElementById('wordbook-create-btn'),
    };
    return true;
}

/**
 * 显示创建单词本模态框。
 */
export function showWordbookModal() {
    if (!cacheWordbookModalElements()) return;
    const { modal } = wordbookModalElements;
    modal.style.display = 'flex';
    handleEscKeydown = (event) => { if (event.key === 'Escape') hideWordbookModal(); };
    document.addEventListener('keydown', handleEscKeydown);
}

/**
 * 隐藏创建单词本模态框，并重置其状态。
 */
export function hideWordbookModal() {
    if (!cacheWordbookModalElements()) return;
    const { modal } = wordbookModalElements;
    if (modal.style.display !== 'none') {
        modal.style.display = 'none';
        resetWordbookModal(); // 关闭时重置
        if (handleEscKeydown) {
            document.removeEventListener('keydown', handleEscKeydown);
            handleEscKeydown = null;
        }
    }
}

/**
 * 重置单词本模态框到初始状态。
 */
export function resetWordbookModal() {
    if (!cacheWordbookModalElements()) return;
    const {
        textInput, extractStatus, wordCount, wordList, nameInput, createBtn, extractBtn
    } = wordbookModalElements;

    textInput.value = '';
    nameInput.value = '';
    extractStatus.textContent = '';
    wordCount.textContent = '';
    wordList.innerHTML = '<p class="wordbook-list-placeholder">提取后，单词将显示在这里</p>';
    createBtn.disabled = true;
    extractBtn.disabled = false;
    textInput.disabled = false;
}

/**
 * 更新单词提取过程中的状态文本。
 * @param {string} text - 要显示的状态信息。
 * @param {boolean} isProcessing - 是否正在处理中。
 */
export function updateWordbookStatus(text, isProcessing = false) {
    if (!cacheWordbookModalElements()) return;
    const { extractStatus, extractBtn, textInput } = wordbookModalElements;
    extractStatus.textContent = text;
    extractBtn.disabled = isProcessing;
    textInput.disabled = isProcessing;
    if (isProcessing) {
        extractBtn.innerHTML = '<svg class="spinner" viewBox="0 0 50 50" style="width:20px;height:20px;stroke:white;"><circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle></svg> 处理中...';
    } else {
        extractBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg> 提取单词';
    }
}

/**
 * 将提取并处理后的单词列表渲染到模态框中。
 * @param {Array<Object>} wordsData - 包含单词信息的对象数组，格式: [{word: string, isLearned: boolean}]
 */
export function renderExtractedWords(wordsData) {
    if (!cacheWordbookModalElements()) return;
    const { wordList, wordCount, createBtn } = wordbookModalElements;
    wordList.innerHTML = ''; // 清空旧内容

    if (wordsData.length === 0) {
        wordList.innerHTML = '<p class="wordbook-list-placeholder">未提取到有效单词</p>';
        wordCount.textContent = '共 0 个单词';
        createBtn.disabled = true;
        return;
    }

    const fragment = document.createDocumentFragment();
    wordsData.forEach(({ word, isLearned }) => {
        const item = document.createElement('div');
        item.className = 'wordbook-item';
        if (isLearned) {
            item.classList.add('is-learned');
        }

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `wb-word-${word}`;
        checkbox.dataset.word = word;
        checkbox.checked = true; // 默认全部选中

        const label = document.createElement('label');
        label.setAttribute('for', `wb-word-${word}`);
        label.textContent = word;

        item.appendChild(checkbox);
        item.appendChild(label);
        fragment.appendChild(item);
    });
    wordList.appendChild(fragment);

    wordCount.textContent = `共 ${wordsData.length} 个单词`;
    updateCreateButtonState();
}

/**
 * 根据当前选择状态，更新“创建”按钮的可用性。
 */
export function updateCreateButtonState() {
    if (!cacheWordbookModalElements()) return;
    const { nameInput, createBtn, wordList } = wordbookModalElements;
    const selectedCount = wordList.querySelectorAll('input[type="checkbox"]:checked').length;
    const hasName = nameInput.value.trim().length > 0;
    createBtn.disabled = !(selectedCount > 0 && hasName);
}