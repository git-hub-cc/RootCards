// =================================================================================
// 打字模式模块 (Typing Mode Module) - v1.0
// ---------------------------------------------------------------------------------
// 职责:
// 1. 管理“拼写打字”模态框的所有UI交互和状态。
// 2. 处理题目切换、用户输入验证、提示功能等逻辑。
// 3. 完全封装，仅通过 init 方法暴露启动入口。
// =================================================================================

import * as State from '../state.js';
import { playAudioFile, stopAudio } from '../ui.js';

// --- 模块内部状态 ---
const state = {
    playlist: [],           // 当前练习的单词索引列表
    currentData: null,      // 当前题目数据
    currentIndex: 0,        // 当前在播放列表中的位置
    hintLevel: 0            // 当前提示等级 (0-3)
};

// --- 模块内部DOM元素缓存 ---
const elements = {};

// --- 内部函数 ---

/**
 * 缓存所有与打字模式相关的DOM元素。
 * @returns {boolean} - 如果所有元素都找到则返回 true，否则返回 false。
 */
function cacheElements() {
    if (elements.modal) return true;

    const modal = document.getElementById('typing-modal');
    if (!modal) {
        console.error('打字模式初始化失败：未找到 #typing-modal 元素。');
        return false;
    }

    elements.modal = modal;
    elements.closeBtn = document.getElementById('typing-close-btn');
    elements.replayAudioBtn = document.getElementById('typing-replay-audio-btn');
    elements.input = document.getElementById('typing-input');
    elements.submitBtn = document.getElementById('typing-submit-btn');
    elements.nextBtn = document.getElementById('typing-next-btn');
    elements.hintBtn = document.getElementById('typing-hint-btn');
    elements.progressCurrent = document.getElementById('typing-progress-current');
    elements.progressTotal = document.getElementById('typing-progress-total');
    elements.meaning = document.getElementById('typing-meaning');
    elements.sentence = document.getElementById('typing-sentence');
    elements.resultArea = document.getElementById('typing-result-area');
    elements.correctAnswer = document.getElementById('typing-correct-answer');

    for (const key in elements) {
        if (!elements[key]) {
            console.error(`打字模式初始化失败：未找到元素 ${key}`);
            return false;
        }
    }
    return true;
}

/**
 * 重置输入框和按钮的状态到初始状态。
 */
function resetInputUI() {
    elements.input.value = '';
    elements.input.disabled = false;
    elements.input.className = 'typing-input'; // 移除 success/error 类
    elements.input.placeholder = '输入单词...';

    elements.hintBtn.disabled = false;

    elements.resultArea.classList.add('is-hidden');
    elements.submitBtn.classList.remove('is-hidden');
    elements.nextBtn.classList.add('is-hidden');
}


/**
 * 播放当前单词的音频。
 */
function playCurrentAudio() {
    if (!state.currentData) return;
    const audioPath = `audio/words/${state.currentData.word.toLowerCase()}.mp3`;
    playAudioFile(audioPath);
}

/**
 * 更新模态框UI以显示当前题目。
 */
function renderCard() {
    if (!state.currentData) return;

    elements.progressCurrent.textContent = state.currentIndex + 1;
    elements.progressTotal.textContent = state.playlist.length;
    elements.meaning.textContent = state.currentData.translation;

    if (state.currentData.sentences && state.currentData.sentences.length > 0) {
        const randomIdx = Math.floor(Math.random() * state.currentData.sentences.length);
        const sentenceText = state.currentData.sentences[randomIdx].en;
        // 调用 State 模块的辅助函数来生成带挖空的句子HTML
        elements.sentence.innerHTML = State.getMaskedSentence(sentenceText, state.currentData.word);
    } else {
        elements.sentence.innerHTML = '<span class="masked-word">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span> (暂无例句)';
    }

    resetInputUI();
    // 延迟聚焦以确保模态框动画完成后元素可见
    setTimeout(() => elements.input.focus(), 100);
}

/**
 * 显示用户的答题反馈（正确或错误）。
 * @param {boolean} isCorrect - 用户答案是否正确。
 */
function showFeedback(isCorrect) {
    elements.input.disabled = true;
    elements.input.classList.toggle('success', isCorrect);
    elements.input.classList.toggle('error', !isCorrect);

    if (!isCorrect) {
        elements.correctAnswer.textContent = state.currentData.word;
        elements.resultArea.classList.remove('is-hidden');
    }

    elements.submitBtn.classList.add('is-hidden');
    elements.nextBtn.classList.remove('is-hidden');
    elements.nextBtn.focus();
}

/**
 * 处理用户提交答案的逻辑。
 */
function handleSubmit() {
    const userInput = elements.input.value.trim();
    if (!userInput || !state.currentData) return;

    const isCorrect = userInput.toLowerCase() === state.currentData.word.toLowerCase();
    showFeedback(isCorrect);
}

/**
 * 加载并显示下一个题目。
 */
function nextItem() {
    state.currentIndex++;
    if (state.currentIndex >= state.playlist.length) {
        alert('🎉 恭喜你，本组单词已全部练习完毕！');
        hideModal();
        return;
    }

    state.hintLevel = 0;
    const wordItems = State.currentDataSet.filter(item => item.cardType === 'word');
    const wordIndex = state.playlist[state.currentIndex];
    state.currentData = wordItems[wordIndex];

    if (!state.currentData) {
        console.error("无法获取当前题目数据，跳过。");
        nextItem(); // 尝试加载下一个
        return;
    }
    renderCard();
    playCurrentAudio();
}

/**
 * 根据提示等级，显示不同程度的单词提示。
 */
function showHint() {
    if (!state.currentData || state.hintLevel >= 3) return;

    state.hintLevel++;
    const word = state.currentData.word;
    let hintText = '';

    switch (state.hintLevel) {
        case 1: // 显示首尾字母
            hintText = (word.length <= 2) ?
                '_'.repeat(word.length) :
                word[0] + '_'.repeat(word.length - 2) + word.slice(-1);
            break;
        case 2: // 显示首尾和部分中间字母
            const chars = word.split('');
            const revealed = Array(word.length).fill('_');
            if (word.length > 0) revealed[0] = chars[0];
            if (word.length > 1) revealed[revealed.length - 1] = chars[chars.length - 1];

            const hiddenIndices = Array.from({ length: Math.max(0, word.length - 2) }, (_, i) => i + 1)
                .sort(() => 0.5 - Math.random());
            const revealCount = Math.floor(hiddenIndices.length / 2); // 揭示一半的隐藏字母

            for (let i = 0; i < revealCount; i++) {
                revealed[hiddenIndices[i]] = chars[hiddenIndices[i]];
            }
            hintText = revealed.join('');
            break;
        case 3: // 显示完整单词
            hintText = word;
            elements.hintBtn.disabled = true;
            break;
    }
    elements.input.placeholder = hintText;
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
 * 启动一轮新的打字练习。
 */
function startSession() {
    const wordItems = State.currentDataSet.filter(item => item.cardType === 'word');
    if (wordItems.length === 0) {
        alert('当前列表没有单词可供练习。');
        return;
    }

    state.playlist = [...Array(wordItems.length).keys()].sort(() => Math.random() - 0.5);
    state.currentIndex = -1; // 设置为-1，这样第一次调用nextItem会从0开始

    showModal();
    nextItem();
}

/**
 * 初始化打字模式模块。
 * @param {HTMLElement} startBtn - 启动打字模式的按钮元素。
 */
export function init(startBtn) {
    if (!startBtn) {
        console.error('打字模式初始化失败：未提供启动按钮。');
        return;
    }

    if (!cacheElements()) {
        startBtn.disabled = true;
        startBtn.title = "打字模式加载失败，请检查页面HTML结构";
        return;
    }

    // --- 绑定所有事件监听器 ---
    startBtn.addEventListener('click', startSession);
    elements.closeBtn.addEventListener('click', hideModal);
    elements.modal.addEventListener('click', (event) => {
        if (event.target === elements.modal) hideModal();
    });

    elements.replayAudioBtn.addEventListener('click', playCurrentAudio);
    elements.submitBtn.addEventListener('click', handleSubmit);
    elements.nextBtn.addEventListener('click', nextItem);
    elements.hintBtn.addEventListener('click', showHint);

    // 监听回车键
    elements.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); // 防止触发表单提交等默认行为
            // 根据当前显示的按钮决定回车键的功能
            if (!elements.submitBtn.classList.contains('is-hidden')) {
                handleSubmit();
            } else if (!elements.nextBtn.classList.contains('is-hidden')) {
                nextItem();
            }
        }
    });
}