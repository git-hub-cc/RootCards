// =================================================================================
// 主应用逻辑 (Main Application Logic) - v9.1 (调整默认选中项)
// ---------------------------------------------------------------------------------
// 这个文件是整个应用的控制器，负责协调 state 和 ui 模块。
// 【核心改动】:
// 1. 修改 `init` 函数，使其在启动时直接应用新的默认状态（内容类型为“前缀”）。
// 2. 初始化流程不再依赖模拟点击，改为更明确的状态设置和UI更新调用。
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

    // 新功能按钮
    const listeningBtn = document.getElementById('listening-mode-btn');
    const noVisualBtn = document.getElementById('no-visual-btn');

    // 听力模态框相关
    const listeningModal = document.getElementById('listening-modal');
    const listeningCloseBtn = document.getElementById('listening-close-btn');
    const listeningReplayBtn = document.getElementById('listening-replay-btn');
    const listeningVisualArea = document.querySelector('.listening-visual');
    const listeningRevealBtn = document.getElementById('listening-reveal-btn');
    const listeningNextBtn = document.getElementById('listening-next-btn');
    const audioSourceToggle = document.getElementById('audio-source-toggle');

    // --- 懒加载与渲染状态 ---
    let renderIndex = 0;
    const CARDS_PER_PAGE = 12;
    let observer = null;
    let isShuffling = false;

    // --- 听力模式状态 ---
    let listeningPlaylist = [];
    let currentListeningData = null;
    let currentSentenceIndex = 0;

    // --- 主题管理常量 ---
    const THEME_KEY = 'etymology-visualizer-theme';

    // --- 鲁棒性检查 ---
    if (!cardGrid || !gradeFilterContainer || !contentTypeFilterContainer || !filterContainer || !shuffleBtn || !themeToggleBtn || !listeningModal || !audioSourceToggle) {
        console.error('关键的 DOM 元素未找到，应用无法启动。');
        return;
    }
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
        if (cardCount === 0) {
            let message = '太棒了，当前筛选条件下没有更多要学习的单词了！';
            if (State.currentFilter === 'learned') {
                message = '还没有标记任何单词为“已掌握”。';
            } else if (State.allVocabularyData.length === 0) {
                message = '正在加载数据...';
            }
            if (!cardGrid.querySelector('.loading-state')) {
                cardGrid.insertAdjacentHTML('afterbegin', `<div class="loading-state">${message}</div>`);
            }
        } else {
            const emptyState = cardGrid.querySelector('.loading-state');
            if (emptyState) emptyState.remove();
        }
    }

    function startNewRenderFlow() {
        cardGrid.innerHTML = '';
        renderIndex = 0;
        cardGrid.appendChild(loadMoreTrigger);
        renderMoreCards();
    }

    function updateCategoryFilters() {
        const availableCategories = State.getAvailableCategories();
        UI.renderFilterButtons(filterContainer, listeningBtn, availableCategories);
    }

    // ============================================================================
    // 3. 事件处理器
    // ============================================================================

    function handleMarkAsLearned(data, cardElement) {
        State.toggleLearnedStatus(data);
        cardElement.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
        cardElement.style.opacity = '0';
        cardElement.style.transform = 'scale(0.95)';
        setTimeout(() => {
            cardElement.remove();
            State.filterAndPrepareDataSet();
            const cardsOnScreen = cardGrid.querySelectorAll('.card').length;
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
        playCurrentAudio();
    }
    function playCurrentAudio() {
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
    listeningBtn.addEventListener('click', startListeningSession);
    listeningCloseBtn.addEventListener('click', UI.hideListeningModal);
    listeningModal.addEventListener('click', (event) => { if (event.target === listeningModal) UI.hideListeningModal(); });
    listeningRevealBtn.addEventListener('click', UI.revealListeningAnswer);
    listeningNextBtn.addEventListener('click', playNextListeningItem);
    const handleReplay = () => playCurrentAudio();
    listeningReplayBtn.addEventListener('click', handleReplay);
    listeningVisualArea.addEventListener('click', handleReplay);
    audioSourceToggle.addEventListener('change', handleReplay);

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

            // 1. 渲染筛选器
            UI.renderGradeButtons(gradeFilterContainer, grades);
            UI.renderContentTypeButtons(contentTypeFilterContainer);

            // 2. 【核心改动】显式设置并更新UI到默认状态
            // 更新年级UI
            const defaultGradeBtn = gradeFilterContainer.querySelector(`[data-grade="${State.currentGrade}"]`);
            if (defaultGradeBtn) {
                UI.updateActiveGradeButton(gradeFilterContainer, defaultGradeBtn);
            }
            // 更新内容类型UI (新的默认项是'pre')
            const defaultContentTypeBtn = contentTypeFilterContainer.querySelector(`[data-type="${State.currentContentType}"]`);
            if (defaultContentTypeBtn) {
                UI.updateActiveContentTypeButton(contentTypeFilterContainer, defaultContentTypeBtn);
            }

            // 3. 根据默认状态，动态渲染类别筛选器
            updateCategoryFilters();

            // 4. 根据默认状态，筛选数据并渲染第一批卡片
            State.filterAndPrepareDataSet();
            startNewRenderFlow();

            // 5. 启动懒加载监听
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