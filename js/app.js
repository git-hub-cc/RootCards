// =================================================================================
// 应用协调器 (Application Orchestrator) - v20.5 (优化连续操作体验)
// ---------------------------------------------------------------------------------
// 职责:
// 1. 协调 UI、数据状态和各个功能模块的初始化与交互。
// 2. 负责核心的卡片渲染循环。
// 3. 优化 handleMarkAsLearned 中的确认逻辑，避免在连续操作时重绘整个网格。
// =================================================================================

import * as State from './state.js';
import * as UI from './ui.js';
import * as ThemeManager from './modules/themeManager.js';
import * as DataManager from './modules/dataManager.js';
import * as ListeningMode from './modules/listeningMode.js';
import * as TypingMode from './modules/typingMode.js';
import * as Wordbook from './modules/wordbook.js';
import * as UndoManager from './modules/undoManager.js';
import * as NotificationManager from './modules/notificationManager.js';
import * as DialogueMode from './modules/dialogueMode.js';

document.addEventListener('DOMContentLoaded', () => {

    // --- DOM 元素获取 ---
    const cardGrid = document.getElementById('card-grid');
    const categoryFilterContainer = document.getElementById('category-filter-container');
    const contentTypeFilterContainer = document.getElementById('content-type-filter-container');
    const filterContainer = document.getElementById('filter-container');
    const shuffleBtn = document.getElementById('shuffle-btn');
    const loadMoreTrigger = document.getElementById('load-more-trigger');
    const searchInput = document.getElementById('search-input');
    const toolGroup = document.getElementById('tool-group');
    const skeletonLoader = document.getElementById('skeleton-loader');
    const heatmapContainer = document.getElementById('heatmap-container');

    const splashScreen = document.getElementById('app-splash-screen');
    const splashProgressText = document.getElementById('loading-progress-text');
    const splashProgressBar = document.getElementById('loading-progress-bar');

    const noVisualBtn = document.getElementById('no-visual-btn');
    const moreOptionsBtn = document.getElementById('more-options-btn');
    const optionsMenu = document.getElementById('options-menu');
    const clearLearnedBtn = document.getElementById('clear-learned-btn');
    const immersiveModeBtn = document.getElementById('immersive-mode-btn');

    const showAchievementsBtn = document.getElementById('show-achievements-btn');
    const achievementsModal = document.getElementById('achievements-modal');
    const achievementsCloseBtn = document.getElementById('achievements-close-btn');
    const achievementsListContainer = document.getElementById('achievements-list-container');

    const showHeatmapBtn = document.getElementById('show-heatmap-btn');
    const heatmapModal = document.getElementById('heatmap-modal');
    const heatmapCloseBtn = document.getElementById('heatmap-close-btn');

    const typingModeBtn = document.getElementById('typing-mode-btn');
    const listeningModeBtn = document.getElementById('listening-mode-btn');
    const dialogueModeBtn = document.getElementById('dialogue-mode-btn');

    // --- 状态变量 ---
    let renderIndex = 0;
    const CARDS_PER_PAGE = 12;
    let observer = null;
    let isShuffling = false;
    let currentLayoutMode = '';

    if (!UI.init()) {
        console.error("应用启动失败：UI模块初始化未能成功。");
        return;
    }

    // ============================================================================
    // 核心渲染与状态更新逻辑
    // ============================================================================

    function renderMoreCards() {
        const fragment = document.createDocumentFragment();
        const endIndex = Math.min(renderIndex + CARDS_PER_PAGE, State.currentDataSet.length);
        const handlers = {
            onMarkLearned: handleMarkAsLearned
        };

        for (let i = renderIndex; i < endIndex; i++) {
            const card = UI.createCard(State.currentDataSet[i], handlers);
            fragment.appendChild(card);
            if (i === endIndex - 2) card.classList.add('mobile-scroll-trigger');
        }

        cardGrid.insertBefore(fragment, loadMoreTrigger);
        renderIndex = endIndex;

        const hasMore = renderIndex < State.currentDataSet.length;
        loadMoreTrigger.classList.toggle('is-visible', hasMore);

        if (window.innerWidth <= 768) setupMobileIntersectionObserver();
        if (!hasMore) updateEmptyStateMessage();
    }

    function updateDataAndUI() {
        // 1. 重新计算并渲染主类别
        const availableCategories = State.getAvailableMainCategories();
        UI.renderCategoryButtons(categoryFilterContainer, availableCategories);

        const isCurrentCategoryValid = State.currentCategory === 'all' || availableCategories.includes(State.currentCategory);
        if (!isCurrentCategoryValid) {
            State.setCurrentCategory('all');
        }

        const activeCategoryBtn = categoryFilterContainer.querySelector(`[data-category="${State.currentCategory}"]`);
        if (activeCategoryBtn) UI.updateActiveCategoryButton(categoryFilterContainer, activeCategoryBtn);

        // 2. 渲染内容类型按钮（包括已掌握和单词本）
        UI.renderContentTypeButtons(contentTypeFilterContainer, State.userWordbooks);

        const activeContentTypeBtn = contentTypeFilterContainer.querySelector(`[data-type="${State.currentContentType}"]`);
        if (activeContentTypeBtn) {
            UI.updateActiveContentTypeButton(contentTypeFilterContainer, activeContentTypeBtn);
        } else {
            State.setCurrentContentType('all');
            const defaultBtn = contentTypeFilterContainer.querySelector('[data-type="all"]');
            if (defaultBtn) UI.updateActiveContentTypeButton(contentTypeFilterContainer, defaultBtn);
        }

        // 3. 重新计算并渲染子类别
        updateSubCategoryFilters();

        // 4. 准备数据并渲染
        State.filterAndPrepareDataSet();

        // 计算当前视图单词数量 (确保词根类单词被正确统计)
        const currentWordCount = State.currentDataSet.filter(item => item.cardType === 'word').length;
        const learnedWordCount = State.getLearnedWordCount();
        UI.updateWordCounts(currentWordCount, learnedWordCount);

        startNewRenderFlow();
    }

    function updateEmptyStateMessage() {
        const cardCount = cardGrid.querySelectorAll('.card:not(.is-pending-removal)').length;
        const existingMessage = cardGrid.querySelector('.loading-state');

        if (cardCount === 0 && !existingMessage) {
            let message = '太棒了，当前条件下没有更多要学习的单词了！';
            if (State.currentSearchQuery) {
                message = `找不到与 "${State.currentSearchQuery}" 相关的单词。`;
            } else if (State.currentContentType === 'special_learned') {
                message = '还没有标记任何单词为“已掌握”。';
            } else if (State.currentContentType.startsWith('wb_')) {
                const wbName = State.currentContentType.substring(3);
                message = `单词本 "${wbName}" 为空，或其中没有未掌握的单词。`;
            }
            cardGrid.insertAdjacentHTML('afterbegin', `<div class="loading-state" style="margin: auto;">${message}</div>`);
        } else if (cardCount > 0 && existingMessage) {
            existingMessage.remove();
        }
    }

    function startNewRenderFlow() {
        cardGrid.innerHTML = '';
        cardGrid.appendChild(loadMoreTrigger);
        renderIndex = 0;
        renderMoreCards();
        cardGrid.scrollTo({ left: 0, top: 0 });
    }

    function updateSubCategoryFilters() {
        const availableSubCategories = State.getAvailableSubCategories();
        UI.renderFilterButtons(filterContainer, toolGroup, availableSubCategories);

        let isCurrentFilterValid = State.currentFilter === 'all';
        if (!isCurrentFilterValid) {
            isCurrentFilterValid = availableSubCategories.some(cat => cat.meaningId === State.currentFilter);
        }

        if (!isCurrentFilterValid) {
            State.setCurrentFilter('all');
        }

        const currentBtn = filterContainer.querySelector(`.filter-btn[data-filter="${State.currentFilter}"]`);
        if (currentBtn) {
            UI.updateActiveFilterButton(filterContainer, currentBtn);
            if (window.innerWidth <= 768) {
                currentBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
        } else {
            const allBtn = filterContainer.querySelector('.filter-btn[data-filter="all"]');
            if (allBtn) {
                UI.updateActiveFilterButton(filterContainer, allBtn);
                State.setCurrentFilter('all');
            }
        }
    }

    function updateLoadingProgress(loaded, total) {
        if (total > 0 && splashProgressBar) {
            const percentage = Math.round((loaded / total) * 100);
            splashProgressBar.style.width = `${percentage}%`;
            splashProgressText.textContent = `正在解析数据文件 (${loaded}/${total})...`;
        }
    }

    function hideSplashScreen() {
        if (splashScreen) {
            if (splashProgressBar) splashProgressBar.style.width = '100%';
            if (splashProgressText) splashProgressText.textContent = '准备就绪，开始学习！';

            setTimeout(() => {
                splashScreen.classList.add('is-hidden');
                setTimeout(() => splashScreen.remove(), 600);
            }, 500);
        }
        if (skeletonLoader) skeletonLoader.remove();
    }

    // ============================================================================
    // 事件回调处理 (Events)
    // ============================================================================

    /**
     * 处理“标记为已掌握/未掌握”的点击事件。
     * 关键优化：支持连续操作，不通过全量刷新来更新UI。
     */
    function handleMarkAsLearned(data, cardElement) {
        const isCurrentlyLearned = cardElement.classList.contains('is-learned');

        // 1. 播放音效
        UI.playUiSound(isCurrentlyLearned ? 'uncomplete' : 'complete');

        // 2. 切换视觉状态（立即响应）
        cardElement.classList.toggle('is-learned');

        // 判断在当前模式下，是否应该移除卡片
        // 规则：如果是“所有类型(All Types)”模式，我们保留卡片，只改变状态。
        // 如果是具体的学习模式（Prefix/Suffix/Wordbook等），默认只显示未掌握，所以要移除。
        // 如果是“已掌握(Learned)”模式，取消掌握也要移除。
        const shouldRemoveCard = State.currentContentType !== 'all';

        if (shouldRemoveCard) {
            cardElement.classList.add('is-pending-removal');
        }

        // 移动端体验优化：自动滚动到下一张卡片
        if (shouldRemoveCard && window.innerWidth <= 768) {
            const nextCard = cardElement.nextElementSibling;
            if (nextCard && nextCard.classList.contains('card')) {
                setTimeout(() => {
                    nextCard.scrollIntoView({ behavior: 'smooth', inline: 'center' });
                }, 350);
            }
        }

        // --- 定义撤销操作的回调 ---
        // 核心逻辑：确认时不调用 updateDataAndUI()，而是手动轻量更新 DOM 和计数
        const onConfirm = () => {
            // 1. 更新底层数据状态
            State.toggleLearnedStatus(data);

            // 记录学习活动 (仅当是从 未掌握 -> 已掌握 时)
            if (!isCurrentlyLearned) {
                State.logLearningActivity(new Date(), 1);
            }

            // 2. 根据模式决定是否从 DOM 中移除卡片
            if (shouldRemoveCard) {
                cardElement.remove();
            }

            // 3. 手动更新顶部计数器，避免全量重绘
            const currentWordCountEl = document.getElementById('word-count-current');
            const learnedWordCountEl = document.getElementById('word-count-learned');

            if (currentWordCountEl && learnedWordCountEl) {
                let currentVal = parseInt(currentWordCountEl.textContent) || 0;
                let learnedVal = parseInt(learnedWordCountEl.textContent) || 0;

                // 如果卡片被移除了，当前视图计数 -1
                if (shouldRemoveCard) {
                    currentWordCountEl.textContent = Math.max(0, currentVal - 1);
                }

                // 更新已掌握总数
                learnedWordCountEl.textContent = isCurrentlyLearned
                    ? Math.max(0, learnedVal - 1) // 取消掌握
                    : learnedVal + 1;             // 标记掌握
            }

            // 4. 如果卡片被移除，检查当前视图是否为空，如果是则显示空状态或加载更多
            if (shouldRemoveCard) {
                const remainingCards = cardGrid.querySelectorAll('.card:not(.is-pending-removal)').length;
                // 如果剩余卡片很少，尝试加载更多（模拟无限滚动）
                if (remainingCards < 5) {
                    renderMoreCards();
                    // 如果加载后还是 0，则显示空状态
                    updateEmptyStateMessage();
                }
            }
        };

        const onUndo = () => {
            // 恢复视觉状态
            cardElement.classList.toggle('is-learned');
            if (shouldRemoveCard) {
                cardElement.classList.remove('is-pending-removal');
            }

            // 移动端：滚回该卡片
            if (window.innerWidth <= 768) {
                cardElement.scrollIntoView({ behavior: 'smooth', inline: 'center' });
            }
        };

        const toastMessage = isCurrentlyLearned
            ? `单词 "${data.word}" 已取消掌握。`
            : `单词 "${data.word}" 已标记掌握。`;

        // 调用撤销管理器
        UndoManager.show({
            message: toastMessage,
            onConfirm: onConfirm,
            onUndo: onUndo
        });
    }

    function handleWordbookChange(type, newName, oldName) {
        if (type === 'create' || type === 'study') {
            State.setCurrentContentType(`wb_${newName}`);
            State.setCurrentFilter('all');
            updateDataAndUI();
        } else if (type === 'delete' && State.currentContentType === `wb_${oldName}`) {
            State.setCurrentContentType('all');
            State.setCurrentFilter('all');
            updateDataAndUI();
        } else {
            updateDataAndUI();
        }
    }

    function setupIntersectionObserver() {
        if (observer) observer.disconnect();

        if (currentLayoutMode === 'mobile') {
            return;
        }

        observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && loadMoreTrigger.classList.contains('is-visible')) {
                renderMoreCards();
            }
        }, { root: null, rootMargin: '0px 0px 300px 0px', threshold: 0 });
        observer.observe(loadMoreTrigger);
    }

    function setupMobileIntersectionObserver() {
        if (observer) observer.disconnect();
        const triggers = cardGrid.querySelectorAll('.mobile-scroll-trigger');
        if (triggers.length === 0) return;
        const lastTrigger = triggers[triggers.length - 1];
        observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                lastTrigger.classList.remove('mobile-scroll-trigger');
                renderMoreCards();
            }
        }, {
            root: cardGrid,
            rootMargin: '0px 200px 0px 0px',
            threshold: 0.1
        });
        observer.observe(lastTrigger);
    }

    // ============================================================================
    // 全局事件绑定
    // ============================================================================

    function debounce(func, wait) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }

    function handleResize() {
        const newMode = window.innerWidth <= 768 ? 'mobile' : 'desktop';

        if (newMode === currentLayoutMode) {
            return;
        }
        currentLayoutMode = newMode;

        UI.updateResponsiveLayout();
        setupIntersectionObserver();

        if (heatmapModal && !heatmapModal.classList.contains('is-hidden')) {
            UI.renderHeatmap(heatmapContainer, State.getLearningActivity());
        }
    }

    categoryFilterContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.category-filter-btn');
        if (btn && !btn.classList.contains('active')) {
            State.setCurrentCategory(btn.dataset.category);
            State.setCurrentFilter('all');
            updateDataAndUI();
        }
    });

    contentTypeFilterContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.content-type-btn');
        if (btn && !btn.classList.contains('active')) {
            State.setCurrentContentType(btn.dataset.type);
            State.setCurrentFilter('all');
            updateDataAndUI();
        }
    });

    filterContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-btn');
        if (btn && !btn.classList.contains('active')) {
            State.setCurrentFilter(btn.dataset.filter);
            updateDataAndUI();
        }
    });

    searchInput.addEventListener('input', debounce(() => {
        State.setSearchQuery(searchInput.value);
        updateDataAndUI();
    }, 300));

    shuffleBtn.addEventListener('click', () => {
        if (isShuffling || State.currentDataSet.length === 0) return;
        UI.playUiSound('activate');
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            State.shuffleCurrentDataSet();
            startNewRenderFlow();
            NotificationManager.show({ type: 'success', message: '🔀 卡片已随机打乱' });
        } else {
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
        }
    });

    noVisualBtn.addEventListener('click', () => UI.toggleNoVisualMode(noVisualBtn));

    if (immersiveModeBtn) {
        immersiveModeBtn.addEventListener('click', () => UI.toggleImmersiveMode(immersiveModeBtn));
    }

    moreOptionsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        optionsMenu.classList.toggle('is-open');
    });

    showAchievementsBtn.addEventListener('click', () => {
        UI.renderAchievementsList(achievementsListContainer);
        achievementsModal.classList.remove('is-hidden');
        optionsMenu.classList.remove('is-open');
    });

    const closeAchievements = () => achievementsModal.classList.add('is-hidden');
    achievementsCloseBtn.addEventListener('click', closeAchievements);
    achievementsModal.addEventListener('click', (e) => {
        if (e.target === achievementsModal) closeAchievements();
    });

    if (showHeatmapBtn && heatmapModal && heatmapCloseBtn) {
        showHeatmapBtn.addEventListener('click', () => {
            UI.renderHeatmap(heatmapContainer, State.getLearningActivity());
            heatmapModal.classList.remove('is-hidden');
            optionsMenu.classList.remove('is-open');
        });

        const closeHeatmap = () => heatmapModal.classList.add('is-hidden');
        heatmapCloseBtn.addEventListener('click', closeHeatmap);
        heatmapModal.addEventListener('click', (e) => {
            if (e.target === heatmapModal) {
                closeHeatmap();
            }
        });
    }

    clearLearnedBtn.addEventListener('click', () => {
        const onConfirm = () => {
            State.clearLearnedWords();
            updateDataAndUI();
            NotificationManager.show({ type: 'success', message: '所有已掌握记录已成功清空。' });
        };
        const onUndo = () => {
            NotificationManager.show({ type: 'info', message: '清空操作已取消。' });
        };
        UndoManager.show({ message: '即将清空所有已掌握记录...', onConfirm: onConfirm, onUndo: onUndo });
        optionsMenu.classList.remove('is-open');
    });

    window.addEventListener('click', (e) => {
        if (optionsMenu.classList.contains('is-open') && !moreOptionsBtn.contains(e.target)) {
            optionsMenu.classList.remove('is-open');
        }
    });

    // ============================================================================
    // 应用初始化
    // ============================================================================
    async function init() {
        ThemeManager.init();
        UndoManager.init();
        NotificationManager.init();
        DialogueMode.init(dialogueModeBtn);

        window.addEventListener('resize', debounce(handleResize, 250));

        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./service-worker.js')
                    .then(registration => console.log('✅ ServiceWorker 注册成功:', registration.scope))
                    .catch(err => console.error('❌ ServiceWorker 注册失败:', err));
            });
        }

        const dataManagerDeps = {
            importLearnedBtn: document.getElementById('import-learned-btn'),
            exportLearnedBtn: document.getElementById('export-learned-btn'),
            exportCurrentBtn: document.getElementById('export-current-btn'),
            importFileInput: document.getElementById('import-file-input'),
            optionsMenu
        };
        DataManager.init(dataManagerDeps, () => {
            updateDataAndUI();
        });

        ListeningMode.init(listeningModeBtn);
        TypingMode.init(typingModeBtn);
        Wordbook.init(document.getElementById('manage-wordbook-btn'), optionsMenu, handleWordbookChange);

        document.getElementById('theme-toggle-menu-btn').addEventListener('click', () => {
            const isDarkMode = document.body.classList.contains('dark-mode');
            ThemeManager.applyTheme(isDarkMode ? 'light' : 'dark');
            optionsMenu.classList.remove('is-open');
        });

        try {
            State.loadLearnedWords();
            State.loadUserWordbooks();
            State.loadUserNotes();

            await State.loadAndProcessData(updateLoadingProgress);

            hideSplashScreen();
            handleResize();

            // 初始化时调用 updateDataAndUI 以渲染所有按钮
            updateDataAndUI();

            UI.renderHeatmap(heatmapContainer, State.getLearningActivity());

        } catch (error) {
            console.error('初始化应用时发生严重错误:', error);
            if (splashScreen) {
                splashProgressText.textContent = '❌ 加载失败，请刷新重试';
                splashProgressText.style.color = '#ef4444';
            }
            if (skeletonLoader) skeletonLoader.remove();
            cardGrid.innerHTML = `<div class="loading-state" style="color: #ef4444; padding: 2rem;">应用启动失败，请检查网络或控制台日志。<br><br>错误: ${error.message}</div>`;
        }
    }

    init();
});