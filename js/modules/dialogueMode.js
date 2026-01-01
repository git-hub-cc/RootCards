// =================================================================================
// 对话练习模块 (Dialogue Mode Module) - v3.3 (移动端键盘适配修复)
// ---------------------------------------------------------------------------------
// 职责:
// 1. 管理对话练习模态框的UI和交互。
// 2. 构造并发送请求到云端 LLM API，处理流式响应。
// 3. 集成 Web Speech API 实现 TTS 语音播放。
// 4. 提供“放弃/显示答案”和“下一个单词”的无缝切换体验。
// 5. 【核心修复】引入JavaScript逻辑动态处理移动端键盘弹出/收起时的高度变化，
//    确保对话内容区域在任何视口尺寸下都始终可见且布局正确。
// =================================================================================

import * as NotificationManager from './notificationManager.js';
import * as State from '../state.js';
import { playUiSound } from '../ui.js';
import { API_CONFIG, DIALOGUE_CONFIG, TRANSLATE_CONFIG } from '../config.js';

// --- 模块内部状态 ---
const state = {
    playlist: [],           // 当前练习的单词索引列表
    currentIndex: 0,        // 当前在播放列表中的位置
    currentData: null,      // 当前题目数据
    conversationHistory: [],// 对话历史记录 (OpenAI 格式)
    isLoading: false,       // AI是否正在响应
    isSessionActive: false, // 对话会话是否正在进行
    isRoundFinished: false, // 当前单词的回合是否结束
    abortController: null,  // 用于中止fetch请求的控制器
    skeletonBubble: null,   // 当前显示的骨架加载气泡引用

    // 语音和翻译状态
    speakingUtterance: null, // 当前正在播放的语音实例
    activeAudioBtn: null,    // 当前播放状态的按钮DOM
    translationCache: new Map(), // 消息ID -> 翻译文本的缓存

    // 【新增】移动端视口管理
    isMobile: false,             // 是否为移动设备
    initialViewportHeight: 0,    // 初始视口高度
};

// --- 模块内部DOM元素缓存 ---
const elements = {};

/**
 * 缓存所有相关的DOM元素。
 */
function cacheElements() {
    if (elements.modal) return true;

    const modal = document.getElementById('dialogue-modal');
    if (!modal) {
        console.error('对话模式初始化失败：未找到 #dialogue-modal 元素。');
        return false;
    }

    elements.modal = modal;
    // 【新增】获取对话框内容区容器
    elements.dialogueContent = document.querySelector('.dialogue-content');
    elements.closeBtn = document.getElementById('dialogue-close-btn');
    elements.history = document.getElementById('dialogue-history');
    elements.input = document.getElementById('dialogue-input');
    elements.sendBtn = document.getElementById('dialogue-send-btn');
    elements.actionBtn = document.getElementById('dialogue-give-up-btn');

    for (const key in elements) {
        if (!elements[key]) {
            console.error(`对话模式初始化失败：未找到元素 ${key}`);
            return false;
        }
    }
    return true;
}

// =================================================================================
// 【新增】移动端视口与键盘适配逻辑
// =================================================================================
/**
 * 处理窗口大小变化事件，主要用于移动端键盘适配。
 */
function handleViewportResize() {
    if (state.isMobile && state.isSessionActive) {
        const newHeight = window.innerHeight;
        // 只有当高度变化显著时才调整，避免不必要的重绘
        if (Math.abs(newHeight - parseFloat(elements.dialogueContent.style.height)) > 50) {
            elements.dialogueContent.style.height = `${newHeight}px`;
            // 确保在布局调整后，聊天记录能滚动到底部，看到最新消息
            setTimeout(scrollToBottom, 100);
        }
    }
}

/**
 * 启用移动端键盘适配监听。
 */
function enableMobileViewportManager() {
    if (state.isMobile) {
        state.initialViewportHeight = window.innerHeight;
        elements.dialogueContent.style.height = `${state.initialViewportHeight}px`;
        window.addEventListener('resize', handleViewportResize);
    }
}

/**
 * 禁用移动端键盘适配监听。
 */
function disableMobileViewportManager() {
    if (state.isMobile) {
        window.removeEventListener('resize', handleViewportResize);
        // 恢复默认样式，以便下次打开时重新计算
        elements.dialogueContent.style.height = '';
    }
}


// --- 辅助功能：TTS 语音合成 ---

/**
 * 停止当前正在播放的语音。
 */
function stopSpeech() {
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
    if (state.activeAudioBtn) {
        state.activeAudioBtn.classList.remove('is-playing');
        state.activeAudioBtn = null;
    }
    state.speakingUtterance = null;
}

/**
 * 播放或停止指定文本的语音。
 * @param {string} text - 要朗读的文本。
 * @param {HTMLElement} btnElement - 触发播放的按钮元素（用于更新图标状态）。
 */
function toggleSpeech(text, btnElement) {
    if (!window.speechSynthesis) {
        NotificationManager.show({ type: 'error', message: '您的浏览器不支持语音播放。' });
        return;
    }

    // 如果点击的是当前正在播放的按钮，则停止
    if (state.activeAudioBtn === btnElement) {
        stopSpeech();
        return;
    }

    // 停止之前的播放
    stopSpeech();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US'; // 设置为美式英语
    utterance.rate = 0.9;     // 语速稍慢，适合学习

    // iOS Safari 兼容性处理：尝试寻找高质量的英文语音
    const voices = window.speechSynthesis.getVoices();
    const enVoice = voices.find(v => v.lang === 'en-US' && v.name.includes('Google')) ||
        voices.find(v => v.lang === 'en-US');
    if (enVoice) utterance.voice = enVoice;

    utterance.onstart = () => {
        btnElement.classList.add('is-playing');
        state.activeAudioBtn = btnElement;
    };

    utterance.onend = () => {
        btnElement.classList.remove('is-playing');
        if (state.activeAudioBtn === btnElement) {
            state.activeAudioBtn = null;
        }
        state.speakingUtterance = null;
    };

    utterance.onerror = (e) => {
        console.error('TTS Error:', e);
        btnElement.classList.remove('is-playing');
        state.activeAudioBtn = null;
    };

    state.speakingUtterance = utterance;
    window.speechSynthesis.speak(utterance);
}

// --- 辅助功能：AI 翻译 ---

/**
 * 触发翻译功能。
 * @param {string} text - 原文。
 * @param {HTMLElement} resultContainer - 显示结果的容器 DOM。
 * @param {string} messageId - 消息的唯一标识（用于缓存）。
 */
async function toggleTranslation(text, resultContainer, messageId) {
    // 1. 切换显示/隐藏
    if (resultContainer.classList.contains('is-visible')) {
        resultContainer.classList.remove('is-visible');
        return;
    }

    resultContainer.classList.add('is-visible');

    // 2. 检查缓存
    if (state.translationCache.has(messageId)) {
        resultContainer.textContent = state.translationCache.get(messageId);
        return;
    }

    // 3. 显示加载状态
    resultContainer.innerHTML = '<span class="translation-loading">正在翻译...</span>';

    // 4. 发起独立翻译请求
    try {
        const translation = await fetchTranslation(text);
        state.translationCache.set(messageId, translation);
        resultContainer.textContent = translation;
    } catch (error) {
        resultContainer.innerHTML = '<span style="color:red">翻译失败，请重试。</span>';
        console.error(error);
    }
}

/**
 * 调用 API 进行翻译 (修复版)。
 */
async function fetchTranslation(text) {
    if (!API_CONFIG.API_KEY) throw new Error("API Key missing");

    const response = await fetch(API_CONFIG.ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_CONFIG.API_KEY}`,
            'Accept': 'text/event-stream'
        },
        body: JSON.stringify({
            model: API_CONFIG.MODEL_NAME,
            messages: [
                { role: 'system', content: TRANSLATE_CONFIG.SYSTEM_PROMPT },
                { role: 'user', content: text }
            ],
            stream: true,
            max_tokens: 500
        })
    });

    if (!response.ok) throw new Error("Translation API failed: " + response.statusText);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine.startsWith('data:')) {
                const jsonStr = trimmedLine.substring(5).trim();
                if (jsonStr === '[DONE]') continue;
                try {
                    const json = JSON.parse(jsonStr);
                    const delta = json.choices[0]?.delta?.content || '';
                    fullText += delta;
                } catch (e) {}
            }
        }
    }

    return fullText || "翻译结果为空";
}

// --- UI 渲染相关 ---

function scrollToBottom() {
    if (elements.history) {
        // 使用 smooth 滚动，体验更佳
        elements.history.scrollTo({ top: elements.history.scrollHeight, behavior: 'smooth' });
    }
}

function showSkeletonBubble() {
    if (state.skeletonBubble) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'dialogue-message-wrapper message-from-assistant';
    wrapper.innerHTML = `
        <div class="skeleton-bubble">
            <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
        </div>`;
    elements.history.appendChild(wrapper);
    state.skeletonBubble = wrapper;
    scrollToBottom();
}

function removeSkeletonBubble() {
    if (state.skeletonBubble) {
        state.skeletonBubble.remove();
        state.skeletonBubble = null;
    }
}

/**
 * 核心：向界面添加一条消息气泡。
 * @param {string} role - 'user' | 'assistant' | 'system'
 * @param {string} content - 消息内容
 * @returns {HTMLElement} - 返回气泡的内容容器，方便后续更新文本
 */
function addMessageToUI(role, content) {
    const wrapper = document.createElement('div');
    wrapper.className = `dialogue-message-wrapper message-from-${role}`;

    const bubble = document.createElement('div');
    bubble.className = 'dialogue-message-bubble';

    const textSpan = document.createElement('div');
    textSpan.innerHTML = content
        .replace(/__+/g, '_')
        .replace(/\n/g, '<br>');
    bubble.appendChild(textSpan);

    if (role === 'assistant' && content) {
        appendActionButtons(bubble, content);
    }

    wrapper.appendChild(bubble);
    elements.history.appendChild(wrapper);
    scrollToBottom();

    return textSpan;
}

/**
 * 为气泡追加操作按钮（朗读、翻译）。
 * @param {HTMLElement} bubbleElement - 气泡 DOM 元素
 * @param {string} textContent - 该气泡的文本内容
 */
function appendActionButtons(bubbleElement, textContent) {
    if (bubbleElement.querySelector('.bubble-actions-bar')) return;

    const actionBar = document.createElement('div');
    actionBar.className = 'bubble-actions-bar';

    const ttsBtn = document.createElement('button');
    ttsBtn.className = 'bubble-action-btn';
    ttsBtn.title = "朗读 (Read Aloud)";
    ttsBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
        </svg>
        <span>Play</span>
    `;
    ttsBtn.onclick = () => toggleSpeech(textContent, ttsBtn);

    const transBtn = document.createElement('button');
    transBtn.className = 'bubble-action-btn';
    transBtn.title = "翻译 (Translate)";
    transBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 3v4a1 1 0 0 0 1 1h4"></path>
                <path d="M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2z"></path>
                <path d="M9 17h6"></path>
                <path d="M9 13h6"></path>
                <path d="M10 9l1 -2l1 2"></path>
            </svg>
        <span>译 / A</span>
    `;

    const transResult = document.createElement('div');
    transResult.className = 'translation-result';

    const msgId = 'msg-' + Date.now() + Math.random().toString(36).substr(2, 9);
    transBtn.onclick = () => toggleTranslation(textContent, transResult, msgId);

    actionBar.appendChild(ttsBtn);
    actionBar.appendChild(transBtn);

    bubbleElement.appendChild(actionBar);
    bubbleElement.appendChild(transResult);
}

function setLoadingState(isLoading) {
    state.isLoading = isLoading;
    if (isLoading) showSkeletonBubble();
    else removeSkeletonBubble();
    if (elements.input) elements.input.disabled = isLoading;
    if (elements.sendBtn) elements.sendBtn.disabled = isLoading;
}

function updateActionButtonState() {
    const btn = elements.actionBtn;
    if (state.isRoundFinished) {
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline></svg>`;
        btn.title = "下一个单词 (Next Word)";
        btn.classList.add('active');
    } else {
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path><line x1="4" y1="22" x2="4" y2="15"></line></svg>`;
        btn.title = "放弃 / 显示答案 (Give Up)";
        btn.classList.remove('active');
    }
}

// --- 核心逻辑 ---

/**
 * 准备下一轮对话。
 */
function prepareNextRound() {
    stopSpeech();
    state.currentIndex++;

    if (state.currentIndex >= state.playlist.length) {
        NotificationManager.show({ type: 'success', message: '🎉 本组单词练习完毕！' });
        hideModal();
        return;
    }

    const wordIndex = state.playlist[state.currentIndex];
    const wordItems = State.currentDataSet.filter(item => item.cardType === 'word');
    state.currentData = wordItems[wordIndex];

    if (!state.currentData) {
        console.error("无法获取单词数据，跳过。");
        prepareNextRound();
        return;
    }

    state.conversationHistory = [];
    state.translationCache.clear();
    state.isRoundFinished = false;
    elements.history.innerHTML = '';
    elements.input.value = '';
    elements.input.style.height = 'auto';
    elements.input.disabled = false;
    elements.sendBtn.disabled = false;

    updateActionButtonState();

    const systemPrompt = buildSystemPrompt(state.currentData);
    state.conversationHistory.push({ role: DIALOGUE_CONFIG.SYSTEM_ROLE_NAME, content: systemPrompt });

    callLLM();
}

/**
 * 构建 Prompt
 */
function buildSystemPrompt(wordData) {
    const word = wordData.word;
    const learnedWords = State.getLearnedWordsArray();
    const contextWords = learnedWords
        .sort(() => 0.5 - Math.random())
        .slice(0, DIALOGUE_CONFIG.MAX_LEARNED_WORDS_CONTEXT)
        .join(', ');

    return `You are a friendly and encouraging English tutor. Your goal is to guide the user to say the target word: "${word}".

**User's Vocabulary Level:**
The user knows: [${contextWords}]. Use simple English.

**Target Word Info:**
- Word: "${word}"
- Meaning: "${wordData.translation}"
- Breakdown: ${wordData.breakdown ? wordData.breakdown.join(' + ') : 'N/A'}

**Strict Rules:**
1.  **NEVER** say the target word "${word}" or its forms.
2.  Start by creating a simple scenario or fill-in-the-blank sentence.
3.  Keep responses short (under 50 words).
4.  When the user gets it right, say "Correct!" or "You got it!".
5.  Conversation ends when user gets it right.`;
}

/**
 * 调用 LLM API (主对话)。
 */
async function callLLM() {
    if (!API_CONFIG.API_KEY || !API_CONFIG.ENDPOINT) {
        NotificationManager.show({ type: 'error', message: 'API 配置缺失。' });
        return;
    }

    setLoadingState(true);
    state.abortController = new AbortController();

    try {
        const response = await fetch(API_CONFIG.ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_CONFIG.API_KEY}`,
                'Accept': 'text/event-stream'
            },
            body: JSON.stringify({
                model: API_CONFIG.MODEL_NAME,
                messages: state.conversationHistory,
                stream: API_CONFIG.STREAM,
                max_tokens: API_CONFIG.MAX_TOKENS,
            }),
            signal: state.abortController.signal,
        });

        if (!response.ok) throw new Error(response.statusText);

        removeSkeletonBubble();

        const aiTextSpan = addMessageToUI('assistant', '');
        const bubbleContainer = aiTextSpan.parentElement;

        let fullText = '';

        if (API_CONFIG.STREAM) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data:')) {
                        try {
                            const json = JSON.parse(line.substring(5));
                            const delta = json.choices[0]?.delta?.content || '';
                            fullText += delta;
                            aiTextSpan.innerHTML = fullText.replace(/\n/g, '<br>');
                            scrollToBottom();
                        } catch (e) {}
                    }
                }
            }
        } else {
            const data = await response.json();
            fullText = data.choices[0]?.message?.content || '';
            aiTextSpan.innerHTML = fullText.replace(/\n/g, '<br>');
        }

        appendActionButtons(bubbleContainer, fullText);
        state.conversationHistory.push({ role: 'assistant', content: fullText });

        if (fullText.toLowerCase().includes("correct") || fullText.toLowerCase().includes("you got it")) {
            finishRound(true);
        }

    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error(error);
            removeSkeletonBubble();
            addMessageToUI('system', '连接中断，请重试。');
        }
    } finally {
        setLoadingState(false);
        state.abortController = null;
        if (!state.isRoundFinished) elements.input.focus();
    }
}

function finishRound(isSuccess) {
    state.isRoundFinished = true;
    updateActionButtonState();
    if (isSuccess) playUiSound('complete');
    elements.input.disabled = true;
    elements.sendBtn.disabled = true;
    elements.actionBtn.classList.add('active');
}

function startSession() {
    const wordItems = State.currentDataSet.filter(item => item.cardType === 'word');
    if (wordItems.length === 0) {
        NotificationManager.show({ type: 'info', message: '当前列表没有单词可供练习。' });
        return;
    }
    state.playlist = [...Array(wordItems.length).keys()].sort(() => Math.random() - 0.5);
    state.currentIndex = -1;
    state.isSessionActive = true;
    elements.modal.classList.remove('is-hidden');
    // 【新增】启用移动端视口管理器
    enableMobileViewportManager();
    prepareNextRound();
}

function handleSendMessage() {
    const text = elements.input.value.trim();
    if (!text || state.isLoading) return;

    playUiSound('activate');
    stopSpeech();

    addMessageToUI('user', text);
    state.conversationHistory.push({ role: 'user', content: text });
    elements.input.value = '';
    elements.input.style.height = 'auto';

    callLLM();
}

function handleActionBtn() {
    if (state.isRoundFinished) {
        playUiSound('activate');
        prepareNextRound();
    } else {
        if (state.isLoading) return;
        playUiSound('undo');
        const answerHtml = `
            <div style="text-align: center; margin-top: 5px;">
                <div style="font-size: 1.2rem; font-weight: 800; color: var(--theme-color);">${state.currentData.word}</div>
                <div style="font-size: 0.9rem; color: var(--text-sub);">${state.currentData.translation}</div>
            </div>`;
        addMessageToUI('system', answerHtml);
        finishRound(false);
    }
}

function hideModal() {
    stopSpeech();
    if (state.abortController) state.abortController.abort();
    elements.modal.classList.add('is-hidden');
    state.isSessionActive = false;
    // 【新增】禁用移动端视口管理器，清理事件监听
    disableMobileViewportManager();
}

/**
 * 初始化模块。
 */
export function init(startBtn) {
    if (!startBtn) return;
    if (!cacheElements()) {
        startBtn.disabled = true;
        return;
    }

    // 【新增】判断是否为移动设备
    state.isMobile = window.innerWidth <= 768;

    startBtn.addEventListener('click', startSession);
    elements.closeBtn.addEventListener('click', hideModal);
    elements.modal.addEventListener('click', (e) => {
        if (e.target === elements.modal) hideModal();
    });

    elements.sendBtn.addEventListener('click', handleSendMessage);
    elements.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });
    elements.input.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    elements.actionBtn.addEventListener('click', handleActionBtn);
}