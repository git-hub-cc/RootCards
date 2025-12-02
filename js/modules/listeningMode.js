// =================================================================================
// 听力模式模块 (Listening Mode Module) - v1.0
// ---------------------------------------------------------------------------------
// 职责:
// 1. 管理“听力磨耳朵”模态框的所有UI交互和状态。
// 2. 处理播放列表的生成和音频播放逻辑。
// 3. 完全封装，仅通过 init 方法暴露启动入口。
// =================================================================================

import * as State from '../state.js';
import { playAudioFile, stopAudio, sanitizeForFilename } from '../ui.js';

// --- 模块内部状态 ---
const state = {
    playlist: [],           // 当前播放列表（单词索引数组）
    currentData: null,      // 当前正在练习的单词数据
    currentSentenceIndex: 0 // 当前例句的索引
};

// --- 模块内部DOM元素缓存 ---
const elements = {};

// --- 内部函数 ---

/**
 * 缓存所有与听力模式相关的DOM元素，提高性能并增强鲁棒性。
 * @returns {boolean} - 如果所有元素都找到则返回 true，否则返回 false。
 */
function cacheElements() {
    // 如果已缓存，则直接返回
    if (elements.modal) return true;

    const modal = document.getElementById('listening-modal');
    if (!modal) {
        console.error('听力模式初始化失败：未找到 #listening-modal 元素。');
        return false;
    }

    elements.modal = modal;
    elements.closeBtn = document.getElementById('listening-close-btn');
    elements.replayBtn = document.getElementById('listening-replay-btn');
    elements.visualArea = modal.querySelector('.listening-visual');
    elements.revealBtn = document.getElementById('listening-reveal-btn');
    elements.nextBtn = document.getElementById('listening-next-btn');
    elements.audioSourceToggle = document.getElementById('audio-source-toggle');
    elements.word = modal.querySelector('.listening-word');
    elements.meaning = modal.querySelector('.listening-meaning');
    elements.sentenceEn = modal.querySelector('.listening-sentence-en');
    elements.sentenceCn = modal.querySelector('.listening-sentence-cn');
    elements.placeholder = modal.querySelector('.listening-hidden-placeholder');
    elements.revealedContent = modal.querySelector('.listening-revealed-content');
    elements.waves = document.getElementById('audio-waves');

    // 再次检查关键子元素是否存在
    for (const key in elements) {
        if (!elements[key]) {
            console.error(`听力模式初始化失败：未找到元素 ${key}`);
            return false;
        }
    }
    return true;
}

/**
 * 播放当前题目对应的音频（单词或例句）。
 */
function playCurrentAudio() {
    if (!state.currentData) return;

    const isSentenceMode = elements.audioSourceToggle.checked;
    let audioPath = '';

    if (isSentenceMode && state.currentData.sentences?.[state.currentSentenceIndex]) {
        const sentenceText = state.currentData.sentences[state.currentSentenceIndex].en;
        const sentenceSlug = sanitizeForFilename(sentenceText);
        audioPath = `audio/sentences/${state.currentData.word.toLowerCase()}_${sentenceSlug}.mp3`;
    } else {
        audioPath = `audio/words/${state.currentData.word.toLowerCase()}.mp3`;
    }

    elements.waves.classList.add('is-playing');
    playAudioFile(audioPath, () => {
        elements.waves.classList.remove('is-playing');
    });
}

/**
 * 更新模态框内的UI，显示题目内容（但答案默认隐藏）。
 */
function updateCardUI() {
    if (!state.currentData) return;

    elements.placeholder.classList.remove('is-hidden');
    elements.revealedContent.classList.add('is-hidden');

    elements.word.textContent = state.currentData.word;
    elements.meaning.textContent = state.currentData.translation;

    if (state.currentData.sentences && state.currentData.sentences[state.currentSentenceIndex]) {
        elements.sentenceEn.innerHTML = state.currentData.sentences[state.currentSentenceIndex].en;
        elements.sentenceCn.textContent = state.currentData.sentences[state.currentSentenceIndex].cn;
    } else {
        elements.sentenceEn.textContent = "（暂无例句）";
        elements.sentenceCn.textContent = "";
    }
}

/**
 * 播放列表中的下一个项目。
 */
function playNextItem() {
    if (state.playlist.length === 0) {
        state.currentData = null;
        if (confirm('🎉 本组单词练习完毕！是否重新开始？')) {
            startSession();
        } else {
            hideModal();
        }
        return;
    }

    const wordItems = State.currentDataSet.filter(item => item.cardType === 'word');
    const wordIndex = state.playlist.pop();
    state.currentData = wordItems[wordIndex];

    if (!state.currentData) return;

    // 随机选择一个例句
    state.currentSentenceIndex = (state.currentData.sentences?.length) ?
        Math.floor(Math.random() * state.currentData.sentences.length) : 0;

    updateCardUI();
    playCurrentAudio();
}

/**
 * 显示答案。
 */
function revealAnswer() {
    elements.placeholder.classList.add('is-hidden');
    elements.revealedContent.classList.remove('is-hidden');
}

/**
 * 显示模态框并添加 ESC 关闭事件。
 */
function showModal() {
    elements.modal.classList.remove('is-hidden');
    document.addEventListener('keydown', handleEscKey);
}

/**
 * 隐藏模态框，停止音频并移除事件监听。
 */
function hideModal() {
    elements.modal.classList.add('is-hidden');
    stopAudio();
    document.removeEventListener('keydown', handleEscKey);
}

/**
 * 处理 Escape 键按下的事件。
 * @param {KeyboardEvent} event
 */
function handleEscKey(event) {
    if (event.key === 'Escape') {
        hideModal();
    }
}

/**
 * 启动一轮新的听力练习。
 */
function startSession() {
    const wordItems = State.currentDataSet.filter(item => item.cardType === 'word');
    if (wordItems.length === 0) {
        alert('当前列表没有单词可供练习。');
        return;
    }
    // 生成一个被打乱的索引数组作为播放列表
    state.playlist = [...Array(wordItems.length).keys()].sort(() => Math.random() - 0.5);
    showModal();
    playNextItem();
}

/**
 * 初始化听力模式模块。
 * @param {HTMLElement} startBtn - 启动听力模式的按钮元素。
 */
export function init(startBtn) {
    if (!startBtn) {
        console.error('听力模式初始化失败：未提供启动按钮。');
        return;
    }

    if (!cacheElements()) {
        // 如果无法找到必要的DOM元素，则禁用启动按钮
        startBtn.disabled = true;
        startBtn.title = "听力模式加载失败，请检查页面HTML结构";
        return;
    }

    // --- 绑定所有事件监听器 ---
    startBtn.addEventListener('click', startSession);
    elements.closeBtn.addEventListener('click', hideModal);
    elements.modal.addEventListener('click', (event) => {
        if (event.target === elements.modal) {
            hideModal();
        }
    });
    elements.revealBtn.addEventListener('click', revealAnswer);
    elements.nextBtn.addEventListener('click', playNextItem);
    elements.replayBtn.addEventListener('click', playCurrentAudio);
    elements.visualArea.addEventListener('click', playCurrentAudio);
    elements.audioSourceToggle.addEventListener('change', playCurrentAudio);
}