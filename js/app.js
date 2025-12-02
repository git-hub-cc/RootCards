// =================================================================================
// 应用协调器 (Application Orchestrator) - v11.1 (优化标记反馈)
// ---------------------------------------------------------------------------------
// 职责:
// 1. 作为应用的唯一入口点，在 DOMContentLoaded 后启动。
// 2. 导入所有功能模块和核心模块 (State, UI)。
// 3. 协调应用的初始化流程：加载数据 -> 初始化UI -> 初始化各功能模块。
// 4. 管理主界面的全局事件监听（筛选、搜索、洗牌等）。
// 5. 将特定功能的实现委托给相应的模块。
// =================================================================================

import * as State from './state.js';
import * as UI from './ui.js';
import * as ThemeManager from './modules/themeManager.js';
import * as DataManager from './modules/dataManager.js';
import * as ListeningMode from './modules/listeningMode.js';
import * as TypingMode from './modules/typingMode.js';
import * as Wordbook from './modules/wordbook.js';

document.addEventListener('DOMContentLoaded', () => {

    // --- DOM 元素获取 (仅限 app.js 直接控制的元素) ---
    const cardGrid = document.getElementById('card-grid');
    const gradeFilterContainer = document.getElementById('grade-filter-container');
    const contentTypeFilterContainer = document.getElementById('content-type-filter-container');
    const filterContainer = document.getElementById('filter-container');
    const shuffleBtn = document.getElementById('shuffle-btn');
    const loadMoreTrigger = document.getElementById('load-more-trigger');
    const searchInput = document.getElementById('search-input');
    const toolGroup = document.getElementById('tool-group');
    const loadingFeedbackContainer = document.getElementById('loading-feedback-container');
    const skeletonLoader = document.getElementById('skeleton-loader');
    const loadingProgressText = document.getElementById('loading-progress-text');
    const loadingProgressBar = document.getElementById('loading-progress-bar');
    const noVisualBtn = document.getElementById('no-visual-btn');
    const moreOptionsBtn = document.getElementById('more-options-btn');
    const optionsMenu = document.getElementById('options-menu');

    // --- 状态变量 (仅限 app.js 自身的状态) ---
    let renderIndex = 0;
    const CARDS_PER_PAGE = 12;
    let observer = null;
    let isShuffling = false;

    // --- 【鲁棒性检查】确保所有关键DOM元素都存在 ---
    const essentialElements = {
        cardGrid, gradeFilterContainer, contentTypeFilterContainer, filterContainer,
        shuffleBtn, searchInput, toolGroup, loadingFeedbackContainer, skeletonLoader,
        moreOptionsBtn, optionsMenu, loadMoreTrigger, loadingProgressText, loadingProgressBar
    };
    const missingElementName = Object.keys(essentialElements).find(key => !essentialElements[key]);
    if (missingElementName) {
        console.error(`关键 DOM 元素 #${missingElementName} 未找到，应用无法启动。`);
        document.body.innerHTML = '<h1 style="text-align:center; padding-top: 50px;">应用初始化失败，请检查控制台错误。</h1>';
        return;
    }
    if (!UI.init()) {
        document.body.innerHTML = '<h1 style="text-align:center; padding-top: 50px;">UI 模板丢失，请检查 HTML 文件。</h1>';
        return;
    }


    // ============================================================================
    // 核心渲染与UI更新逻辑
    // ============================================================================
    function renderMoreCards() {
        const fragment = document.createDocumentFragment();
        const endIndex = Math.min(renderIndex + CARDS_PER_PAGE, State.currentDataSet.length);
        const handlers = { onMarkLearned: handleMarkAsLearned };
        for (let i = renderIndex; i < endIndex; i++) {
            fragment.appendChild(UI.createCard(State.currentDataSet[i], handlers));
        }
        cardGrid.insertBefore(fragment, loadMoreTrigger);
        renderIndex = endIndex;
        const hasMore = renderIndex < State.currentDataSet.length;
        loadMoreTrigger.classList.toggle('is-visible', hasMore);
        if (!hasMore) {
            updateEmptyStateMessage();
        }
    }

    function updateEmptyStateMessage() {
        const cardCount = cardGrid.querySelectorAll('.card').length;
        const existingMessage = cardGrid.querySelector('.loading-state');
        if (cardCount === 0 && !existingMessage) {
            let message = '太棒了，当前条件下没有更多要学习的单词了！';
            if (State.currentSearchQuery) message = `找不到与 "${State.currentSearchQuery}" 相关的单词。`;
            else if (State.currentFilter === 'learned') message = '还没有标记任何单词为“已掌握”。';
            cardGrid.insertAdjacentHTML('afterbegin', `<div class="loading-state">${message}</div>`);
        } else if (cardCount > 0 && existingMessage) {
            existingMessage.remove();
        }
    }

    function startNewRenderFlow() {
        cardGrid.innerHTML = '';
        cardGrid.appendChild(loadMoreTrigger);
        renderIndex = 0;
        renderMoreCards();
    }

    function updateCategoryFilters() {
        const availableCategories = State.getAvailableCategories();
        UI.renderFilterButtons(filterContainer, toolGroup, availableCategories);
        // 确保 'all' 按钮是激活的
        const allButton = filterContainer.querySelector('.filter-btn[data-filter="all"]');
        if (allButton) UI.updateActiveFilterButton(filterContainer, allButton);
    }

    function updateLoadingProgress(loaded, total) {
        if (total > 0) {
            loadingProgressBar.max = total;
            loadingProgressBar.value = loaded;
            loadingProgressText.textContent = `正在加载数据文件: ${loaded} / ${total}`;
        }
    }

    // ============================================================================
    // 事件处理器
    // ============================================================================
    /**
     * 【核心修改】处理“标记为已掌握”的点击事件。
     * 优化了交互，让用户能看到图标状态变化，然后卡片再消失。
     * @param {object} data - 单词数据对象
     * @param {HTMLElement} cardElement - 被点击的卡片DOM元素
     */
    function handleMarkAsLearned(data, cardElement) {
        // 1. 更新数据状态
        State.toggleLearnedStatus(data);

        // 2. 更新UI状态（切换.is-learned类，CSS将自动处理图标变化）
        cardElement.classList.toggle('is-learned', data.isLearned);

        // 3. 延迟一小段时间后，添加移除动画类
        //    这样用户就能看到图标“填充”的瞬间视觉反馈
        setTimeout(() => {
            cardElement.classList.add('is-removing');

            // 4. 在动画结束后，从DOM中移除卡片并处理后续逻辑
            cardElement.addEventListener('transitionend', () => {
                cardElement.remove();
                State.filterAndPrepareDataSet();
                const cardsOnScreen = cardGrid.querySelectorAll('.card').length;
                if (cardsOnScreen < CARDS_PER_PAGE && renderIndex < State.currentDataSet.length) {
                    renderMoreCards();
                }
                updateEmptyStateMessage();
            }, { once: true }); // 'once' 确保事件只被触发一次
        }, 300); // 300毫秒延迟，足够用户感知到变化
    }

    function setupIntersectionObserver() {
        if (observer) observer.disconnect();
        observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && loadMoreTrigger.classList.contains('is-visible')) {
                renderMoreCards();
            }
        }, { root: null, rootMargin: '0px 0px 300px 0px', threshold: 0 });
        observer.observe(loadMoreTrigger);
    }

    function handleWordbookCreated(newBookName) {
        State.setCurrentFilter(newBookName);
        updateCategoryFilters(); // 更新筛选器以显示新单词本
        // 延迟切换，确保UI渲染完成
        setTimeout(() => {
            const newButton = filterContainer.querySelector(`.filter-btn[data-filter="${newBookName}"]`);
            if (newButton) UI.updateActiveFilterButton(filterContainer, newButton);
            State.filterAndPrepareDataSet();
            startNewRenderFlow();
        }, 100);
    }

    // ============================================================================
    // 事件绑定
    // ============================================================================
    gradeFilterContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.grade-filter-btn');
        if (btn && !btn.classList.contains('active')) {
            UI.updateActiveGradeButton(gradeFilterContainer, btn);
            State.setCurrentGrade(btn.dataset.grade);
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
        const btn = e.target.closest('.content-type-btn');
        if (btn && !btn.classList.contains('active')) {
            UI.updateActiveContentTypeButton(contentTypeFilterContainer, btn);
            State.setCurrentContentType(btn.dataset.type);
            State.setCurrentFilter('all');
            updateCategoryFilters();
            State.filterAndPrepareDataSet();
            startNewRenderFlow();
        }
    });

    filterContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.filter-btn');
        if (btn && !btn.classList.contains('active')) {
            UI.updateActiveFilterButton(filterContainer, btn);
            State.setCurrentFilter(btn.dataset.filter);
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
        if (isShuffling || State.currentDataSet.length === 0) return;
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

    noVisualBtn.addEventListener('click', () => UI.toggleNoVisualMode(noVisualBtn));

    moreOptionsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        optionsMenu.classList.toggle('is-open');
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

        // --- 初始化功能模块 ---
        // 将 DOM 元素和回调函数传递给各自的模块
        const dataManagerDeps = {
            importLearnedBtn: document.getElementById('import-learned-btn'),
            exportLearnedBtn: document.getElementById('export-learned-btn'),
            exportCurrentBtn: document.getElementById('export-current-btn'),
            importFileInput: document.getElementById('import-file-input'),
            optionsMenu
        };
        DataManager.init(dataManagerDeps, () => {
            State.filterAndPrepareDataSet();
            startNewRenderFlow();
        });

        ListeningMode.init(document.getElementById('listening-mode-btn'));
        TypingMode.init(document.getElementById('typing-mode-btn'));
        Wordbook.init(
            document.getElementById('create-wordbook-btn'),
            optionsMenu,
            handleWordbookCreated
        );

        document.getElementById('theme-toggle-menu-btn').addEventListener('click', () => {
            const isDarkMode = document.body.classList.contains('dark-mode');
            ThemeManager.applyTheme(isDarkMode ? 'light' : 'dark');
            optionsMenu.classList.remove('is-open');
        });

        // --- 加载核心数据并渲染UI ---
        try {
            State.loadLearnedWords();
            State.loadUserWordbooks();
            const { grades } = await State.loadAndProcessData(updateLoadingProgress);

            loadingFeedbackContainer.classList.add('is-fading-out');
            skeletonLoader.classList.add('is-fading-out');
            skeletonLoader.addEventListener('transitionend', () => {
                loadingFeedbackContainer.remove();
                skeletonLoader.remove();
            }, { once: true });

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
            if (loadingFeedbackContainer) loadingFeedbackContainer.remove();
            if (skeletonLoader) skeletonLoader.remove();
            cardGrid.innerHTML = `<div class="loading-state" style="color: #ef4444;">${error.message}</div>`;
        }
    }

    init();
});