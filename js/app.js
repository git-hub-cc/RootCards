// =================================================================================
// 应用协调器 (Application Orchestrator) - v18.1 (优化单词计数UI更新)
// ---------------------------------------------------------------------------------
// 主要变更:
// - 修改了 `updateDataAndUI` 函数，使其调用新的计数函数来更新UI。
// - 调整了 `handleMarkAsLearned` 函数，确保在标记/取消掌握单词时，计数器能正确地更新。
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

    // --- 状态变量 ---
    let renderIndex = 0;
    const CARDS_PER_PAGE = 12;
    let observer = null;
    let isShuffling = false;

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
        const handlers = { onMarkLearned: handleMarkAsLearned };

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
        State.filterAndPrepareDataSet();
        // 【核心修改】计算当前视图中非词根卡片的数量，并调用新的函数获取已掌握单词数
        const currentWordCount = State.currentDataSet.filter(item => item.contentType !== 'root' && item.cardType === 'word').length;
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
            } else if (State.currentFilter === 'learned') {
                message = '还没有标记任何单词为“已掌握”。';
            } else if (State.getWordbook(State.currentFilter)) {
                message = `单词本 "${State.currentFilter}" 为空或其中单词未在数据库中找到。`;
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
        const availableCategories = State.getAvailableSubCategories();
        UI.renderFilterButtons(filterContainer, toolGroup, availableCategories);

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
    // 事件回调处理
    // ============================================================================

    function handleMarkAsLearned(data, cardElement) {
        const isCurrentlyLearned = cardElement.classList.contains('is-learned');
        UI.playUiSound(isCurrentlyLearned ? 'uncomplete' : 'complete');

        cardElement.classList.toggle('is-learned');
        cardElement.classList.add('is-pending-removal');

        if (window.innerWidth <= 768) {
            const nextCard = cardElement.nextElementSibling;
            if (nextCard && nextCard.classList.contains('card')) {
                setTimeout(() => {
                    nextCard.scrollIntoView({ behavior: 'smooth', inline: 'center' });
                }, 350);
            }
        }

        const onConfirm = () => {
            State.toggleLearnedStatus(data);

            if (!isCurrentlyLearned) {
                State.logLearningActivity(new Date(), 1);
            }

            cardElement.remove();

            // 【核心修改】重新计算并更新单词数
            const currentWordCount = State.currentDataSet.filter(item => item.contentType !== 'root' && item.cardType === 'word').length;
            const learnedWordCount = State.getLearnedWordCount();
            UI.updateWordCounts(currentWordCount, learnedWordCount);


            const cardsOnScreen = cardGrid.querySelectorAll('.card:not(.is-pending-removal)').length;
            if (cardsOnScreen < CARDS_PER_PAGE && renderIndex < State.currentDataSet.length) {
                renderMoreCards();
            }
            updateEmptyStateMessage();
        };

        const onUndo = () => {
            cardElement.classList.toggle('is-learned');
            cardElement.classList.remove('is-pending-removal');
            if (window.innerWidth <= 768) {
                cardElement.scrollIntoView({ behavior: 'smooth', inline: 'center' });
            }
        };

        const toastMessage = isCurrentlyLearned
            ? `单词 "${data.word}" 已取消掌握。`
            : `单词 "${data.word}" 已标记掌握。`;

        UndoManager.show({
            message: toastMessage,
            onConfirm: onConfirm,
            onUndo: onUndo
        });
    }

    function handleWordbookChange(type, newName, oldName) {
        updateSubCategoryFilters();
        if (type === 'create' || type === 'study') {
            State.setCurrentFilter(newName);
            const newBtn = filterContainer.querySelector(`.filter-btn[data-filter="${newName}"]`);
            if (newBtn) UI.updateActiveFilterButton(filterContainer, newBtn);
            updateDataAndUI();
        } else if (type === 'update' && State.currentFilter === oldName) {
            State.setCurrentFilter(newName);
            const newBtn = filterContainer.querySelector(`.filter-btn[data-filter="${newName}"]`);
            if (newBtn) UI.updateActiveFilterButton(filterContainer, newBtn);
            updateDataAndUI();
        } else if (type === 'delete' && State.currentFilter === oldName) {
            State.setCurrentFilter('all');
            const allBtn = filterContainer.querySelector('.filter-btn[data-filter="all"]');
            if (allBtn) UI.updateActiveFilterButton(filterContainer, allBtn);
            updateDataAndUI();
        }
    }

    function setupIntersectionObserver() {
        if (window.innerWidth <= 768) return;
        if (observer) observer.disconnect();
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

    categoryFilterContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.category-filter-btn');
        if (btn && !btn.classList.contains('active')) {
            UI.updateActiveCategoryButton(categoryFilterContainer, btn);
            State.setCurrentCategory(btn.dataset.category); // 使用 setCurrentCategory
            State.setCurrentContentType('all'); // 重置内容类型筛选
            const allContentTypeBtn = contentTypeFilterContainer.querySelector('.content-type-btn[data-type="all"]');
            if (allContentTypeBtn) UI.updateActiveContentTypeButton(contentTypeFilterContainer, allContentTypeBtn);
            State.setCurrentFilter('all'); // 重置子类别筛选
            updateSubCategoryFilters();
            updateDataAndUI();
        }
    });

    contentTypeFilterContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.content-type-btn');
        if (btn && !btn.classList.contains('active')) {
            UI.updateActiveContentTypeButton(contentTypeFilterContainer, btn);
            State.setCurrentContentType(btn.dataset.type);
            State.setCurrentFilter('all');
            updateSubCategoryFilters();
            updateDataAndUI();
        }
    });

    filterContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-btn');
        if (btn && !btn.classList.contains('active')) {
            UI.updateActiveFilterButton(filterContainer, btn);
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

            const { categories } = await State.loadAndProcessData(updateLoadingProgress);

            hideSplashScreen();

            UI.renderCategoryButtons(categoryFilterContainer, categories);
            UI.renderContentTypeButtons(contentTypeFilterContainer);

            const defaultCategoryBtn = categoryFilterContainer.querySelector(`[data-category="${State.currentCategory}"]`);
            if (defaultCategoryBtn) UI.updateActiveCategoryButton(categoryFilterContainer, defaultCategoryBtn);

            const defaultContentTypeBtn = contentTypeFilterContainer.querySelector(`[data-type="${State.currentContentType}"]`);
            if (defaultContentTypeBtn) UI.updateActiveContentTypeButton(contentTypeFilterContainer, defaultContentTypeBtn);

            updateSubCategoryFilters();
            updateDataAndUI();

            UI.renderHeatmap(heatmapContainer, State.getLearningActivity());

            if (window.innerWidth <= 768) {
                setupMobileIntersectionObserver();
            } else {
                setupIntersectionObserver();
            }

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