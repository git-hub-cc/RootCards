// =================================================================================
// 打字模式模块 (Typing Mode Module) - v1.2 (集成成就系统)
// ---------------------------------------------------------------------------------
// 职责:
// 1. 管理“拼写打字”模态框的所有UI交互和状态。
// 2. 处理题目切换、用户输入验证、提示功能等逻辑。
// 3. (新增) 追踪连续拼写正确的次数，触发成就逻辑。
// =================================================================================

import * as State from '../state.js';
import { playAudioFile, stopAudio } from '../ui.js';
import * as NotificationManager from './notificationManager.js';

// --- 模块内部状态 ---
const state = {
    playlist: [],           // 当前练习的单词索引列表
    currentData: null,      // 当前题目数据
    currentIndex: 0,        // 当前在播放列表中的位置
    hintLevel: 0,           // 当前提示等级 (0-3)
    correctStreak: 0        // 新增：当前会话连续答对次数
};

// --- 模块内部DOM元素缓存 ---
const elements = {};

/**
 * 缓存所有与打字模式相关的DOM元素。
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

function resetInputUI() {
    elements.input.value = '';
    elements.input.disabled = false;
    elements.input.className = 'typing-input';
    elements.input.placeholder = '输入单词...';

    elements.hintBtn.disabled = false;

    elements.resultArea.classList.add('is-hidden');
    elements.submitBtn.classList.remove('is-hidden');
    elements.nextBtn.classList.add('is-hidden');
}

function playCurrentAudio() {
    if (!state.currentData) return;
    const audioPath = `audio/words/${state.currentData.word.toLowerCase()}.mp3`;
    playAudioFile(audioPath);
}

function renderCard() {
    if (!state.currentData) return;

    elements.progressCurrent.textContent = state.currentIndex + 1;
    elements.progressTotal.textContent = state.playlist.length;
    elements.meaning.textContent = state.currentData.translation;

    if (state.currentData.sentences && state.currentData.sentences.length > 0) {
        const randomIdx = Math.floor(Math.random() * state.currentData.sentences.length);
        const sentenceText = state.currentData.sentences[randomIdx].en;
        elements.sentence.innerHTML = State.getMaskedSentence(sentenceText, state.currentData.word);
    } else {
        elements.sentence.innerHTML = '<span class="masked-word">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span> (暂无例句)';
    }

    resetInputUI();
    setTimeout(() => elements.input.focus(), 100);
}

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

    // --- 成就系统逻辑 (新增) ---
    if (isCorrect) {
        // 如果使用了提示，streak 不增加，但不重置（或者重置，取决于难度要求）
        // 这里设定：使用了提示就不算入 streak
        if (state.hintLevel === 0) {
            state.correctStreak++;
            // 实时更新瞬时成就进度 (Bug Hunter ID: 'bug_hunter')
            State.updateTransientAchievement('bug_hunter', state.correctStreak);
        } else {
            // 使用提示不中断连击，但不增加计数 (可选策略)
            // state.correctStreak = 0; // 严格模式取消注释
        }
    } else {
        state.correctStreak = 0; // 答错重置连击
    }
    // -------------------------

    showFeedback(isCorrect);
}

function nextItem() {
    state.currentIndex++;
    if (state.currentIndex >= state.playlist.length) {
        NotificationManager.show({
            type: 'success',
            message: '🎉 恭喜你，本组单词已全部练习完毕！'
        });
        hideModal();
        return;
    }

    state.hintLevel = 0;
    const wordItems = State.currentDataSet.filter(item => item.cardType === 'word');
    const wordIndex = state.playlist[state.currentIndex];
    state.currentData = wordItems[wordIndex];

    if (!state.currentData) {
        console.error("无法获取当前题目数据，跳过。");
        nextItem();
        return;
    }
    renderCard();
    playCurrentAudio();
}

function showHint() {
    if (!state.currentData || state.hintLevel >= 3) return;

    state.hintLevel++;
    const word = state.currentData.word;
    let hintText = '';

    switch (state.hintLevel) {
        case 1:
            hintText = (word.length <= 2) ?
                '_'.repeat(word.length) :
                word[0] + '_'.repeat(word.length - 2) + word.slice(-1);
            break;
        case 2:
            const chars = word.split('');
            const revealed = Array(word.length).fill('_');
            if (word.length > 0) revealed[0] = chars[0];
            if (word.length > 1) revealed[revealed.length - 1] = chars[chars.length - 1];

            const hiddenIndices = Array.from({ length: Math.max(0, word.length - 2) }, (_, i) => i + 1)
                .sort(() => 0.5 - Math.random());
            const revealCount = Math.floor(hiddenIndices.length / 2);

            for (let i = 0; i < revealCount; i++) {
                revealed[hiddenIndices[i]] = chars[hiddenIndices[i]];
            }
            hintText = revealed.join('');
            break;
        case 3:
            hintText = word;
            elements.hintBtn.disabled = true;
            break;
    }
    elements.input.placeholder = hintText;
}

function showModal() {
    elements.modal.classList.remove('is-hidden');
    document.addEventListener('keydown', handleEscKey);
}

function hideModal() {
    elements.modal.classList.add('is-hidden');
    stopAudio();
    document.removeEventListener('keydown', handleEscKey);
    // 退出模式时重置 streak
    state.correctStreak = 0;
}

function handleEscKey(event) {
    if (event.key === 'Escape') {
        hideModal();
    }
}

function startSession() {
    const wordItems = State.currentDataSet.filter(item => item.cardType === 'word');
    if (wordItems.length === 0) {
        NotificationManager.show({
            type: 'info',
            message: '当前列表没有单词可供练习。'
        });
        return;
    }

    state.playlist = [...Array(wordItems.length).keys()].sort(() => Math.random() - 0.5);
    state.currentIndex = -1;
    state.correctStreak = 0; // 开始新会话重置 streak

    showModal();
    nextItem();
}

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

    startBtn.addEventListener('click', startSession);
    elements.closeBtn.addEventListener('click', hideModal);
    elements.modal.addEventListener('click', (event) => {
        if (event.target === elements.modal) hideModal();
    });

    elements.replayAudioBtn.addEventListener('click', playCurrentAudio);
    elements.submitBtn.addEventListener('click', handleSubmit);
    elements.nextBtn.addEventListener('click', nextItem);
    elements.hintBtn.addEventListener('click', showHint);

    elements.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (!elements.submitBtn.classList.contains('is-hidden')) {
                handleSubmit();
            } else if (!elements.nextBtn.classList.contains('is-hidden')) {
                nextItem();
            }
        }
    });
}