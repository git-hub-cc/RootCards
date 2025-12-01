// =================================================================================
// 主应用逻辑 (Main Application Logic) - v6.4 (修复听力模式音频路径)
// ---------------------------------------------------------------------------------
// 这个文件是整个应用的控制器，负责协调 state 和 ui 模块。
// 主要职责：
// 1. (初始化) 启动应用，获取DOM元素，加载初始数据。
// 2. (事件绑定) 为筛选器、洗牌按钮、主题切换、以及听力/无图按钮设置事件监听器。
// 3. (逻辑协调) 响应用户交互，调用 state 模块更新数据，然后调用 ui 模块更新视图。
// 4. (懒加载) 设置并管理 Intersection Observer，实现无限滚动效果。
// 5. (主题管理) 处理深色/浅色主题的切换、持久化和初始化。
// 6. (听力模式) 实现听力练习模式的随机播放、即时切换和多种退出方式。
// =================================================================================

import * as State from './state.js';
// 【核心修改】从 ui.js 中导入 sanitizeForFilename 函数
import * as UI from './ui.js';

document.addEventListener('DOMContentLoaded', () => {

    // --- DOM 元素获取 ---
    const cardGrid = document.getElementById('card-grid');
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
    if (!cardGrid || !filterContainer || !shuffleBtn || !themeToggleBtn || !listeningModal || !audioSourceToggle) {
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
    // 2. 核心渲染逻辑 (懒加载)
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
        // -1 是因为 loadMoreTrigger 元素还在 cardGrid 中
        if (cardGrid.children.length <= 1) {
            let message = '太棒了，当前分类下没有更多要学习的单词了！';
            if (State.currentFilter === 'learned' && State.allVocabularyData.some(d => d.cardType === 'word')) {
                message = '还没有标记任何单词为“已掌握”。';
            } else if (State.allVocabularyData.length === 0) {
                message = '正在加载数据...';
            }
            // 清空 cardGrid 并插入消息，避免保留 loadMoreTrigger
            cardGrid.innerHTML = `<div class="loading-state">${message}</div>`;
        }
    }

    function startNewRenderFlow() {
        cardGrid.innerHTML = ''; // 彻底清空
        renderIndex = 0;
        // 把 trigger 重新加回去，为渲染做准备
        cardGrid.appendChild(loadMoreTrigger);
        renderMoreCards();
    }

    function handleMarkAsLearned(data, cardElement) {
        State.toggleLearnedStatus(data);
        cardElement.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
        cardElement.style.opacity = '0';
        cardElement.style.transform = 'scale(0.95)';
        setTimeout(() => {
            cardElement.remove();
            State.filterAndPrepareDataSet(); // 重新过滤数据
            const cardsOnScreen = cardGrid.querySelectorAll('.card').length;
            if (cardsOnScreen < CARDS_PER_PAGE && renderIndex < State.currentDataSet.length) {
                renderMoreCards(); // 补充卡片
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

    // ============================================================================
    // 3. 听力模式逻辑
    // ============================================================================

    function startListeningSession() {
        const wordItems = State.currentDataSet.filter(item => item.cardType === 'word');
        if (wordItems.length === 0) {
            alert('当前列表没有单词可供练习。');
            return;
        }

        listeningPlaylist = Array.from({ length: wordItems.length }, (_, i) => i);
        for (let i = listeningPlaylist.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [listeningPlaylist[i], listeningPlaylist[j]] = [listeningPlaylist[j], listeningPlaylist[i]];
        }

        UI.showListeningModal();
        playNextListeningItem();
    }

    function playNextListeningItem() {
        if (listeningPlaylist.length === 0) {
            currentListeningData = null;
            if (confirm('🎉 本组单词练习完毕！是否重新开始？')) {
                startListeningSession();
            } else {
                UI.hideListeningModal();
            }
            return;
        }

        const localIndex = listeningPlaylist.pop();
        const wordItems = State.currentDataSet.filter(item => item.cardType === 'word');
        const data = wordItems[localIndex];

        if (!data) return;

        currentListeningData = data;
        currentSentenceIndex = 0;
        if (data.sentences && data.sentences.length > 0) {
            currentSentenceIndex = Math.floor(Math.random() * data.sentences.length);
        }

        UI.updateListeningCard(data, currentSentenceIndex);
        playCurrentAudio();
    }

    function playCurrentAudio() {
        if (!currentListeningData) return;

        const isSentenceMode = UI.isPlaySentenceMode();
        let audioPath = '';

        // 检查是否选择了例句模式，并且当前单词确实有例句
        if (isSentenceMode && currentListeningData.sentences && currentListeningData.sentences.length > 0) {
            // 获取当前例句的文本
            const sentenceText = currentListeningData.sentences[currentSentenceIndex].en;

            // --- 【核心修改】调用从 ui.js 导入的函数来生成正确的文件名 ---
            const sentenceSlug = UI.sanitizeForFilename(sentenceText);
            audioPath = `audio/sentences/${currentListeningData.word.toLowerCase()}_${sentenceSlug}.mp3`;
            // -------------------------------------------------------------

        } else {
            // 如果不满足上述条件（例如选了单词模式，或该词无例句），则播放单词音频
            audioPath = `audio/words/${currentListeningData.word.toLowerCase()}.mp3`;
        }

        UI.setAudioWaveAnimation(true);
        UI.playAudioFile(audioPath, () => {
            UI.setAudioWaveAnimation(false);
        });
    }

    // ============================================================================
    // 4. 事件绑定
    // ============================================================================

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

    noVisualBtn.addEventListener('click', () => {
        UI.toggleNoVisualMode(noVisualBtn);
    });

    listeningBtn.addEventListener('click', startListeningSession);

    listeningCloseBtn.addEventListener('click', UI.hideListeningModal);

    listeningModal.addEventListener('click', (event) => {
        if (event.target === listeningModal) {
            UI.hideListeningModal();
        }
    });

    listeningRevealBtn.addEventListener('click', UI.revealListeningAnswer);

    listeningNextBtn.addEventListener('click', playNextListeningItem);

    const handleReplay = () => {
        playCurrentAudio();
    };
    listeningReplayBtn.addEventListener('click', handleReplay);
    listeningVisualArea.addEventListener('click', handleReplay);

    audioSourceToggle.addEventListener('change', () => {
        handleReplay();
    });

    // ============================================================================
    // 5. 应用初始化
    // ============================================================================

    async function init() {
        initializeTheme();

        try {
            State.loadLearnedWords();
            const rawDataSets = await State.loadAndProcessData();

            if (skeletonLoader) {
                skeletonLoader.style.opacity = '0';
                setTimeout(() => skeletonLoader.remove(), 300);
            }

            UI.renderFilterButtons(filterContainer, listeningBtn, rawDataSets);
            State.filterAndPrepareDataSet();
            startNewRenderFlow();
            setupIntersectionObserver();

        } catch (error) {
            console.error('初始化应用时发生严重错误:', error);
            skeletonLoader?.remove();
            cardGrid.innerHTML = `<div class="loading-state" style="color: #ef4444;">${error.message}</div>`;
            shuffleBtn.style.display = 'none';
        }
    }

    init();
});