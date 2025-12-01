// =================================================================================
// UI 渲染模块 (UI Rendering Module) - v5.1 (优化模态框交互)
// ---------------------------------------------------------------------------------
// 主要职责：
// 1. (DOM元素创建) 提供创建单词卡片、介绍卡片和筛选器按钮的函数。
// 2. (渲染逻辑) 将卡片元素批量渲染到指定的容器中。
// 3. (UI交互) 封装与UI直接相关的交互，如卡片翻转、SVG显隐。
// 4. (音频播放) 播放预先生成的本地音频文件。
// 5. (动态内容) 能够根据数据动态渲染一个或多个例句。
// 6. (模态框管理) 处理无图模式切换和听力模态框的显示、隐藏及相关事件绑定。
// =================================================================================

// --- 模块内变量 ---
let cardTemplate;
let prefixIntroTemplate;
const audioPlayer = new Audio(); // 全局共用一个 Audio 对象

// --- 听力模式相关 DOM 引用缓存 ---
let listeningModalElements = null;

// 【新增】用于处理 Esc 键退出的函数引用，方便添加和移除事件监听
let handleEscKeydown = null;


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
 * @param {function} onEnded - 播放结束后的回调函数（可选）。
 */
export function playAudioFile(filePath, onEnded = null) {
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

        // 移除旧的监听器，防止重复绑定
        if (typeof audioPlayer._handleEnded === 'function') {
            audioPlayer.removeEventListener('ended', audioPlayer._handleEnded);
        }

        // 创建新的处理函数
        const handleEnded = () => {
            if (onEnded) onEnded();
            // 任务完成后自我移除
            audioPlayer.removeEventListener('ended', handleEnded);
            delete audioPlayer._handleEnded;
        };

        // 存储引用以便移除
        audioPlayer._handleEnded = handleEnded;
        audioPlayer.addEventListener('ended', handleEnded);

        const playPromise = audioPlayer.play();

        if (playPromise !== undefined) {
            playPromise.catch(error => {
                // 用户中止播放是正常行为，不应报错
                if (error.name !== 'AbortError') {
                    console.error(`播放音频文件 "${filePath}" 失败:`, error);
                    // 即使失败也调用回调并移除监听器
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

/**
 * 根据数据动态生成筛选器按钮。
 * @param {HTMLElement} filterContainer - 按钮的容器元素。
 * @param {HTMLElement} insertBeforeElement - 新按钮会插在此元素之前。
 * @param {Array<object>} meaningGroups - 从 state.js 传入的原始意境分组对象数组。
 */
export function renderFilterButtons(filterContainer, insertBeforeElement, meaningGroups) {
    // 渲染“全部”按钮
    const allButton = document.createElement('button');
    allButton.className = 'filter-btn active';
    allButton.dataset.filter = 'all';
    allButton.textContent = '全部 (All)';
    filterContainer.insertBefore(allButton, insertBeforeElement);

    // 渲染“已掌握”按钮
    const learnedButton = document.createElement('button');
    learnedButton.className = 'filter-btn';
    learnedButton.dataset.filter = 'learned';
    learnedButton.textContent = '已掌握';
    filterContainer.insertBefore(learnedButton, insertBeforeElement);

    // 遍历意境分组来创建按钮
    meaningGroups.forEach(group => {
        if (!group.meaningId || !group.displayName) return;
        const button = document.createElement('button');
        button.className = 'filter-btn';
        button.dataset.filter = group.meaningId;
        button.textContent = group.displayName;
        if (group.themeColor) {
            button.dataset.themeColor = group.themeColor;
        }
        filterContainer.insertBefore(button, insertBeforeElement);
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
    visualArea.innerHTML = `<svg viewBox="0 0 24 24" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                            <g class="layer-root">${data.rootVisual || ''}</g>
                            <g class="layer-prefix">${data.prefixVisual || ''}</g>
                        </svg>`;

    const badgeElement = cardClone.querySelector('.prefix-badge');
    if (data.affixType === 'suffix') {
        badgeElement.textContent = `-${data.prefix}`;
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
            audioBtn.innerHTML = `<span>🔊 听例句 ${data.sentences.length > 1 ? index + 1 : ''}</span>`;
            audioBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const sentenceAudioPath = `audio/sentences/${data.word.toLowerCase()}_sentence_${index}.mp3`;
                playAudioFile(sentenceAudioPath);
            });

            sentenceBlock.appendChild(sentenceEn);
            sentenceBlock.appendChild(sentenceCn);
            sentenceBlock.appendChild(audioBtn);
            sentenceSection.appendChild(sentenceBlock);
        });
    }

    // 事件绑定
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


// =================================================================================
// 【功能 UI 逻辑】
// =================================================================================

/**
 * 切换无图自测模式 (Toggle No-Visual Mode)
 * @param {HTMLElement} btnElement - 触发该操作的按钮元素
 */
export function toggleNoVisualMode(btnElement) {
    const isEnabled = document.body.classList.toggle('mode-no-visual');
    btnElement.classList.toggle('active', isEnabled);

    const eyeOpen = btnElement.querySelector('.icon-eye-open');
    const eyeSlash = btnElement.querySelector('.icon-eye-slash');
    if (eyeOpen && eyeSlash) {
        eyeOpen.style.display = isEnabled ? 'none' : 'block';
        eyeSlash.style.display = isEnabled ? 'block' : 'none';
    }
    btnElement.title = isEnabled ? "关闭无图自测模式" : "开启无图自测模式";
}

/**
 * 显示听力模式模态框
 */
export function showListeningModal() {
    const modal = document.getElementById('listening-modal');
    if (modal) {
        modal.style.display = 'flex';
        // 缓存 DOM 引用，提高性能
        if (!listeningModalElements) {
            listeningModalElements = {
                modal: modal,
                word: modal.querySelector('.listening-word'),
                meaning: modal.querySelector('.listening-meaning'),
                sentenceEn: modal.querySelector('.listening-sentence-en'),
                sentenceCn: modal.querySelector('.listening-sentence-cn'),
                placeholder: modal.querySelector('.listening-hidden-placeholder'),
                revealedContent: modal.querySelector('.listening-revealed-content'),
                waves: document.getElementById('audio-waves'),
                sourceToggle: document.getElementById('audio-source-toggle')
            };
        }

        // 【新增】为 Esc 键退出创建并绑定事件
        // 定义事件处理函数
        handleEscKeydown = (event) => {
            if (event.key === 'Escape') {
                hideListeningModal();
            }
        };
        // 绑定到 document
        document.addEventListener('keydown', handleEscKeydown);
    }
}

/**
 * 隐藏听力模式模态框并重置状态
 */
export function hideListeningModal() {
    const modal = document.getElementById('listening-modal');
    if (modal && modal.style.display !== 'none') {
        modal.style.display = 'none';
        stopAudio(); // 停止可能正在播放的音频

        // 【新增】移除 Esc 键事件监听器，避免内存泄漏
        if (handleEscKeydown) {
            document.removeEventListener('keydown', handleEscKeydown);
            handleEscKeydown = null; // 清理引用
        }
    }
}

/**
 * 更新听力模态框的内容
 * @param {object} data - 单词数据对象
 * @param {number} sentenceIndex - 要使用的例句索引
 */
export function updateListeningCard(data, sentenceIndex) {
    if (!listeningModalElements) return;

    const els = listeningModalElements;

    // 重置为隐藏状态
    els.placeholder.style.display = 'block';
    els.revealedContent.style.display = 'none';

    // 填充内容
    els.word.textContent = data.word;
    els.meaning.textContent = data.translation;

    if (data.sentences && data.sentences[sentenceIndex]) {
        els.sentenceEn.innerHTML = data.sentences[sentenceIndex].en;
        els.sentenceCn.textContent = data.sentences[sentenceIndex].cn;
    } else {
        els.sentenceEn.textContent = "（暂无例句）";
        els.sentenceCn.textContent = "";
    }
}

/**
 * 揭晓听力答案
 */
export function revealListeningAnswer() {
    if (!listeningModalElements) return;
    listeningModalElements.placeholder.style.display = 'none';
    listeningModalElements.revealedContent.style.display = 'block';
}

/**
 * 获取当前听力模式是播放单词还是例句
 * @returns {boolean} true 表示播放例句, false 表示播放单词
 */
export function isPlaySentenceMode() {
    if (!listeningModalElements) return true; // 默认例句
    return listeningModalElements.sourceToggle.checked;
}

/**
 * 设置声波动画状态
 * @param {boolean} isPlaying
 */
export function setAudioWaveAnimation(isPlaying) {
    if (!listeningModalElements || !listeningModalElements.waves) return;
    if (isPlaying) {
        listeningModalElements.waves.classList.add('is-playing');
    } else {
        listeningModalElements.waves.classList.remove('is-playing');
    }
}