// =================================================================================
// 主应用逻辑 (Main Application Logic) - v9.4 (修复布局变更后的JS错误)
// ---------------------------------------------------------------------------------
// 这个文件是整个应用的控制器，负责协调 state 和 ui 模块。
// 【核心改动】:
// 1. 获取对新的 tool-group 容器的引用。
// 2. 修正 updateCategoryFilters 函数，使其将筛选器按钮插入到 tool-group 之前，
//    而不是 tool-group 内部的某个按钮之前，从而解决 "insertBefore" 错误。
// =================================================================================

import * as State from './state.js';
import * as UI from './ui.js';

document.addEventListener('DOMContentLoaded', () => {

    // --- DOM 元素获取 ---
    const cardGrid = document.getElementById('card-grid');
    const gradeFilterContainer = document.getElementById('grade-filter-container');
    const contentTypeFilterContainer = document.getElementById('content-type-filter-container');
    const filterContainer = document.getElementById('filter-container');
    const shuffleBtn = document.getElementById('shuffle-btn');
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const loadMoreTrigger = document.getElementById('load-more-trigger');
    const skeletonLoader = document.getElementById('skeleton-loader');
    const searchInput = document.getElementById('search-input');

    // 【新增】获取新的工具栏容器，这是修复错误的关键
    const toolGroup = document.getElementById('tool-group');

    // 新功能按钮
    const listeningBtn = document.getElementById('listening-mode-btn');
    const noVisualBtn = document.getElementById('no-visual-btn');
    const typingBtn = document.getElementById('typing-mode-btn');

    // 听力模态框相关
    const listeningModal = document.getElementById('listening-modal');
    const listeningCloseBtn = document.getElementById('listening-close-btn');
    const listeningReplayBtn = document.getElementById('listening-replay-btn');
    const listeningVisualArea = document.querySelector('.listening-visual');
    const listeningRevealBtn = document.getElementById('listening-reveal-btn');
    const listeningNextBtn = document.getElementById('listening-next-btn');
    const audioSourceToggle = document.getElementById('audio-source-toggle');

    // 打字模态框相关
    const typingModal = document.getElementById('typing-modal');
    const typingCloseBtn = document.getElementById('typing-close-btn');
    const typingReplayAudioBtn = document.getElementById('typing-replay-audio-btn');
    const typingInput = document.getElementById('typing-input');
    const typingSubmitBtn = document.getElementById('typing-submit-btn');
    const typingNextBtn = document.getElementById('typing-next-btn');


    // --- 懒加载与渲染状态 ---
    let renderIndex = 0;
    const CARDS_PER_PAGE = 12;
    let observer = null;
    let isShuffling = false;

    // --- 听力/打字模式状态 ---
    let listeningPlaylist = [];
    let currentListeningData = null;
    let currentSentenceIndex = 0;
    let typingPlaylist = [];
    let currentTypingData = null;
    let currentTypingIndex = 0;

    // --- 主题管理常量 ---
    const THEME_KEY = 'etymology-visualizer-theme';

    // --- 鲁棒性检查 ---
    // 【修改】加入对 toolGroup 的检查
    if (!cardGrid || !gradeFilterContainer || !contentTypeFilterContainer || !filterContainer || !shuffleBtn || !themeToggleBtn || !listeningModal || !audioSourceToggle || !typingModal || !searchInput || !toolGroup) {
        console.error('关键的 DOM 元素未找到，应用无法启动。请检查 HTML 文件是否完整。');
        return;
    }
    // 检查 UI 模板是否就绪
    if (!UI.initUI()) {
        document.body.innerHTML = '<h1 style="text-align:center; padding-top: 50px;">UI 模板丢失，请检查 HTML 文件。</h1>';
        return;
    }

    // ============================================================================
    // 1. 主题切换逻辑
    // ============================================================================
    function applyTheme(theme) {
        document.body.classList.toggle('dark-mode', theme === 'dark');
        themeToggleBtn.title = theme === 'dark' ? '切换到浅色主题' : '切换到深色主题';
        try {
            localStorage.setItem(THEME_KEY, theme);
        } catch (error) { console.warn('无法保存主题偏好:', error); }
    }

    function initializeTheme() {
        try {
            const savedTheme = localStorage.getItem(THEME_KEY);
            if (savedTheme) {
                applyTheme(savedTheme);
            } else {
                const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                applyTheme(prefersDark ? 'dark' : 'light');
            }
        } catch (error) {
            console.warn('无法读取或应用系统主题偏好，默认使用浅色主题。');
            applyTheme('light');
        }
    }

    // ============================================================================
    // 2. 核心渲染与UI更新逻辑
    // ============================================================================
    function renderMoreCards() {
        const fragment = document.createDocumentFragment();
        const endIndex = Math.min(renderIndex + CARDS_PER_PAGE, State.currentDataSet.length);
        const handlers = { onMarkLearned: handleMarkAsLearned };

        for (let i = renderIndex; i < endIndex; i++) {
            const item = State.currentDataSet[i];
            fragment.appendChild(UI.createCard(item, handlers));
        }
        cardGrid.insertBefore(fragment, loadMoreTrigger);
        renderIndex = endIndex;

        if (renderIndex < State.currentDataSet.length) {
            loadMoreTrigger.classList.add('is-visible');
        } else {
            loadMoreTrigger.classList.remove('is-visible');
            updateEmptyStateMessage();
        }
    }

    function updateEmptyStateMessage() {
        const cardCount = cardGrid.querySelectorAll('.card').length;
        const existingMessage = cardGrid.querySelector('.loading-state');

        if (cardCount === 0 && !existingMessage) {
            let message = '太棒了，当前条件下没有更多要学习的单词了！';
            if (State.currentSearchQuery) {
                message = `找不到与 "${State.currentSearchQuery}" 相关的单词。`;
            } else if (State.currentFilter === 'learned') {
                message = '还没有标记任何单词为“已掌握”。';
            } else if (State.allVocabularyData.length === 0) {
                message = '正在加载数据...';
            }
            cardGrid.insertAdjacentHTML('afterbegin', `<div class="loading-state">${message}</div>`);
        } else if (cardCount > 0 && existingMessage) {
            existingMessage.remove();
        }
    }

    function startNewRenderFlow() {
        // 清空现有卡片，但保留懒加载触发器
        cardGrid.innerHTML = '';
        cardGrid.appendChild(loadMoreTrigger);
        renderIndex = 0;
        renderMoreCards();
    }

    function updateCategoryFilters() {
        const availableCategories = State.getAvailableCategories();
        // 【核心修正】确保筛选器按钮插入到整个工具组 (toolGroup) 之前
        // 旧代码中使用的 typingBtn 已不再是 filterContainer 的直接子节点，会导致错误
        UI.renderFilterButtons(filterContainer, toolGroup, availableCategories);
    }

    // ============================================================================
    // 3. 事件处理器
    // ============================================================================
    function handleMarkAsLearned(data, cardElement) {
        State.toggleLearnedStatus(data);
        cardElement.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
        cardElement.style.opacity = '0';
        cardElement.style.transform = 'scale(0.95)';
        // 动画结束后移除元素并进行后续操作
        setTimeout(() => {
            cardElement.remove();
            State.filterAndPrepareDataSet();
            const cardsOnScreen = cardGrid.querySelectorAll('.card').length;
            // 如果移除后卡片数量不足一页，且还有数据未渲染，则补充渲染
            if (cardsOnScreen < CARDS_PER_PAGE && renderIndex < State.currentDataSet.length) {
                renderMoreCards();
            }
            updateEmptyStateMessage();
        }, 300);
    }

    function setupIntersectionObserver() {
        if (observer) observer.disconnect();
        const options = { root: null, rootMargin: '0px 0px 300px 0px', threshold: 0 };
        observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && loadMoreTrigger.classList.contains('is-visible')) {
                    renderMoreCards();
                }
            });
        }, options);
        observer.observe(loadMoreTrigger);
    }

    // --- 听力模式处理器 ---
    function startListeningSession() {
        const wordItems = State.currentDataSet.filter(item => item.cardType === 'word');
        if (wordItems.length === 0) {
            alert('当前列表没有单词可供练习。'); return;
        }
        listeningPlaylist = [...Array(wordItems.length).keys()].sort(() => Math.random() - 0.5);
        UI.showListeningModal();
        playNextListeningItem();
    }
    function playNextListeningItem() {
        if (listeningPlaylist.length === 0) {
            currentListeningData = null;
            if (confirm('🎉 本组单词练习完毕！是否重新开始？')) { startListeningSession(); } else { UI.hideListeningModal(); }
            return;
        }
        const wordItems = State.currentDataSet.filter(item => item.cardType === 'word');
        currentListeningData = wordItems[listeningPlaylist.pop()];
        if (!currentListeningData) return;
        currentSentenceIndex = (currentListeningData.sentences?.length) ? Math.floor(Math.random() * currentListeningData.sentences.length) : 0;
        UI.updateListeningCard(currentListeningData, currentSentenceIndex);
        playCurrentListeningAudio();
    }
    function playCurrentListeningAudio() {
        if (!currentListeningData) return;
        const isSentenceMode = UI.isPlaySentenceMode();
        let audioPath = '';
        if (isSentenceMode && currentListeningData.sentences?.[currentSentenceIndex]) {
            const sentenceText = currentListeningData.sentences[currentSentenceIndex].en;
            const sentenceSlug = UI.sanitizeForFilename(sentenceText);
            audioPath = `audio/sentences/${currentListeningData.word.toLowerCase()}_${sentenceSlug}.mp3`;
        } else {
            audioPath = `audio/words/${currentListeningData.word.toLowerCase()}.mp3`;
        }
        UI.setAudioWaveAnimation(true);
        UI.playAudioFile(audioPath, () => UI.setAudioWaveAnimation(false));
    }

    // --- 打字模式处理器 ---
    function startTypingSession() {
        const wordItems = State.currentDataSet.filter(item => item.cardType === 'word');
        if (wordItems.length === 0) {
            alert('当前列表没有单词可供练习。');
            return;
        }
        typingPlaylist = [...Array(wordItems.length).keys()].map((_, i) => i).sort(() => Math.random() - 0.5);
        currentTypingIndex = 0;
        UI.showTypingModal();
        playNextTypingItem();
    }
    function playNextTypingItem() {
        if (currentTypingIndex >= typingPlaylist.length) {
            alert('🎉 恭喜你，本组单词已全部练习完毕！');
            UI.hideTypingModal();
            return;
        }
        const wordItems = State.currentDataSet.filter(item => item.cardType === 'word');
        const wordIndex = typingPlaylist[currentTypingIndex];
        currentTypingData = wordItems[wordIndex];

        if (!currentTypingData) {
            console.error("无法获取当前题目数据，跳过。");
            currentTypingIndex++;
            playNextTypingItem();
            return;
        }

        UI.renderTypingCard(currentTypingData, currentTypingIndex + 1, typingPlaylist.length);
        playCurrentTypingAudio();
    }
    function playCurrentTypingAudio() {
        if (!currentTypingData) return;
        const audioPath = `audio/words/${currentTypingData.word.toLowerCase()}.mp3`;
        UI.playAudioFile(audioPath);
    }
    function handleTypingSubmit() {
        const userInput = typingInput.value.trim();
        if (!userInput || !currentTypingData) return;

        const isCorrect = userInput.toLowerCase() === currentTypingData.word.toLowerCase();
        UI.showTypingFeedback(isCorrect, currentTypingData.word);
    }
    function handleNextTypingItem() {
        currentTypingIndex++;
        playNextTypingItem();
    }

    // ============================================================================
    // 4. 事件绑定
    // ============================================================================
    gradeFilterContainer.addEventListener('click', (e) => {
        const targetButton = e.target.closest('.grade-filter-btn');
        if (targetButton && !targetButton.classList.contains('active')) {
            UI.updateActiveGradeButton(gradeFilterContainer, targetButton);
            State.setCurrentGrade(targetButton.dataset.grade);
            State.setCurrentContentType('all');
            const allContentTypeBtn = contentTypeFilterContainer.querySelector('.content-type-btn[data-type="all"]');
            if(allContentTypeBtn) UI.updateActiveContentTypeButton(contentTypeFilterContainer, allContentTypeBtn);
            State.setCurrentFilter('all');
            updateCategoryFilters();
            State.filterAndPrepareDataSet();
            startNewRenderFlow();
        }
    });

    contentTypeFilterContainer.addEventListener('click', (e) => {
        const targetButton = e.target.closest('.content-type-btn');
        if (targetButton && !targetButton.classList.contains('active')) {
            UI.updateActiveContentTypeButton(contentTypeFilterContainer, targetButton);
            State.setCurrentContentType(targetButton.dataset.type);
            State.setCurrentFilter('all');
            updateCategoryFilters();
            State.filterAndPrepareDataSet();
            startNewRenderFlow();
        }
    });

    filterContainer.addEventListener('click', (e) => {
        const targetButton = e.target.closest('.filter-btn');
        if (targetButton && !targetButton.classList.contains('active')) {
            UI.updateActiveFilterButton(filterContainer, targetButton);
            State.setCurrentFilter(targetButton.dataset.filter);
            State.filterAndPrepareDataSet();
            startNewRenderFlow();
        }
    });

    searchInput.addEventListener('input', () => {
        State.setSearchQuery(searchInput.value);
        State.filterAndPrepareDataSet();
        startNewRenderFlow();
    });

    shuffleBtn.addEventListener('click', () => {
        if (isShuffling || State.currentDataSet.length === 0 || State.currentFilter === 'learned') return;
        isShuffling = true;
        cardGrid.classList.add('is-shuffling');
        setTimeout(() => {
            State.shuffleCurrentDataSet();
            startNewRenderFlow();
            document.querySelector('.app-header').scrollIntoView({ behavior: 'smooth' });
            setTimeout(() => {
                cardGrid.classList.remove('is-shuffling');
                isShuffling = false;
            }, 150);
        }, 300);
    });

    themeToggleBtn.addEventListener('click', () => {
        const isDarkMode = document.body.classList.contains('dark-mode');
        applyTheme(isDarkMode ? 'light' : 'dark');
    });

    noVisualBtn.addEventListener('click', () => UI.toggleNoVisualMode(noVisualBtn));

    // 听力模式事件
    listeningBtn.addEventListener('click', startListeningSession);
    listeningCloseBtn.addEventListener('click', UI.hideListeningModal);
    listeningModal.addEventListener('click', (event) => { if (event.target === listeningModal) UI.hideListeningModal(); });
    listeningRevealBtn.addEventListener('click', UI.revealListeningAnswer);
    listeningNextBtn.addEventListener('click', playNextListeningItem);
    const handleReplay = () => playCurrentListeningAudio();
    listeningReplayBtn.addEventListener('click', handleReplay);
    listeningVisualArea.addEventListener('click', handleReplay);
    audioSourceToggle.addEventListener('change', handleReplay);

    // 打字模式事件
    typingBtn.addEventListener('click', startTypingSession);
    typingCloseBtn.addEventListener('click', UI.hideTypingModal);
    typingModal.addEventListener('click', (event) => { if (event.target === typingModal) UI.hideTypingModal(); });
    typingReplayAudioBtn.addEventListener('click', playCurrentTypingAudio);
    typingSubmitBtn.addEventListener('click', handleTypingSubmit);
    typingNextBtn.addEventListener('click', handleNextTypingItem);
    typingInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (typingSubmitBtn.style.display !== 'none') {
                handleTypingSubmit();
            } else if (typingNextBtn.style.display !== 'none') {
                handleNextTypingItem();
            }
        }
    });

    // ============================================================================
    // 5. 应用初始化
    // ============================================================================
    async function init() {
        initializeTheme();

        try {
            State.loadLearnedWords();
            const { grades } = await State.loadAndProcessData();

            if (skeletonLoader) {
                skeletonLoader.style.opacity = '0';
                setTimeout(() => skeletonLoader.remove(), 300);
            }

            UI.renderGradeButtons(gradeFilterContainer, grades);
            UI.renderContentTypeButtons(contentTypeFilterContainer);

            const defaultGradeBtn = gradeFilterContainer.querySelector(`[data-grade="${State.currentGrade}"]`);
            if (defaultGradeBtn) UI.updateActiveGradeButton(gradeFilterContainer, defaultGradeBtn);

            const defaultContentTypeBtn = contentTypeFilterContainer.querySelector(`[data-type="${State.currentContentType}"]`);
            if (defaultContentTypeBtn) UI.updateActiveContentTypeButton(contentTypeFilterContainer, defaultContentTypeBtn);

            updateCategoryFilters();
            State.filterAndPrepareDataSet();
            startNewRenderFlow();
            setupIntersectionObserver();

        } catch (error) {
            console.error('初始化应用时发生严重错误:', error);
            if (skeletonLoader) skeletonLoader.remove();
            cardGrid.innerHTML = `<div class="loading-state" style="color: #ef4444;">${error.message}</div>`;
            shuffleBtn.style.display = 'none';
        }
    }

    init();
});