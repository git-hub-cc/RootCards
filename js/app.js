// =================================================================================
// 应用协调器 (Application Orchestrator) - v12.2 (优化“标记掌握”的即时反馈)
// ---------------------------------------------------------------------------------
// 职责:
// 1. 初始化并协调各个模块。
// 2. 处理全局事件（筛选、搜索）。
// 3. 响应数据变更事件（特别是单词本的增删改），更新UI。
// =================================================================================

import * as State from './state.js';
import * as UI from './ui.js';
import * as ThemeManager from './modules/themeManager.js';
import * as DataManager from './modules/dataManager.js';
import * as ListeningMode from './modules/listeningMode.js';
import * as TypingMode from './modules/typingMode.js';
import * as Wordbook from './modules/wordbook.js';
import * as UndoManager from './modules/undoManager.js';

document.addEventListener('DOMContentLoaded', () => {

    // --- DOM 元素获取 (鲁棒性检查在 UI.init 中进行) ---
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

    // --- 状态变量 ---
    let renderIndex = 0;
    const CARDS_PER_PAGE = 12;
    let observer = null;
    let isShuffling = false;

    // --- 模块初始化检查 ---
    if (!UI.init()) {
        console.error("应用启动失败：UI模块初始化未能成功。");
        return; // 如果核心UI模板缺失，则终止应用执行
    }

    // ============================================================================
    // 核心渲染逻辑
    // ============================================================================

    /**
     * 渲染更多卡片到网格中。
     */
    function renderMoreCards() {
        const fragment = document.createDocumentFragment();
        const endIndex = Math.min(renderIndex + CARDS_PER_PAGE, State.currentDataSet.length);

        // 定义传递给卡片创建函数的回调处理器
        const handlers = { onMarkLearned: handleMarkAsLearned };

        for (let i = renderIndex; i < endIndex; i++) {
            fragment.appendChild(UI.createCard(State.currentDataSet[i], handlers));
        }
        cardGrid.insertBefore(fragment, loadMoreTrigger);
        renderIndex = endIndex;

        // 更新“加载更多”触发器的可见性
        const hasMore = renderIndex < State.currentDataSet.length;
        loadMoreTrigger.classList.toggle('is-visible', hasMore);

        // 如果没有更多卡片，检查是否需要显示空状态消息
        if (!hasMore) {
            updateEmptyStateMessage();
        }
    }

    /**
     * 当卡片网格为空时，显示相应的提示信息。
     */
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
            cardGrid.insertAdjacentHTML('afterbegin', `<div class="loading-state">${message}</div>`);
        } else if (cardCount > 0 && existingMessage) {
            existingMessage.remove();
        }
    }

    /**
     * 清空并重新开始渲染流程，通常在筛选条件变化后调用。
     */
    function startNewRenderFlow() {
        cardGrid.innerHTML = ''; // 清空现有卡片
        cardGrid.appendChild(loadMoreTrigger); // 重新插入加载触发器
        renderIndex = 0;
        renderMoreCards();
    }

    /**
     * 更新顶部的类别筛选器按钮列表。
     */
    function updateCategoryFilters() {
        const availableCategories = State.getAvailableCategories();
        UI.renderFilterButtons(filterContainer, toolGroup, availableCategories);

        const currentBtn = filterContainer.querySelector(`.filter-btn[data-filter="${State.currentFilter}"]`);
        if (currentBtn) {
            UI.updateActiveFilterButton(filterContainer, currentBtn);
        } else {
            // 如果当前筛选器无效（例如单词本被删除），则回退到“全部”
            const allBtn = filterContainer.querySelector('.filter-btn[data-filter="all"]');
            if (allBtn) {
                UI.updateActiveFilterButton(filterContainer, allBtn);
                State.setCurrentFilter('all');
            }
        }
    }

    /**
     * 更新数据加载进度条的显示。
     * @param {number} loaded - 已加载的文件数。
     * @param {number} total - 总文件数。
     */
    function updateLoadingProgress(loaded, total) {
        if (total > 0) {
            loadingProgressBar.max = total;
            loadingProgressBar.value = loaded;
            loadingProgressText.textContent = `正在加载数据文件: ${loaded} / ${total}`;
        }
    }

    // ============================================================================
    // 事件回调处理 (Action Handlers)
    // ============================================================================

    /**
     * 处理单词“标记为掌握”的操作，集成了撤销功能和即时视觉反馈。
     * @param {object} data - 单词数据对象。
     * @param {HTMLElement} cardElement - 对应的卡片DOM元素。
     */
    function handleMarkAsLearned(data, cardElement) {
        // --- 【核心优化】步骤 1: 立即更新UI，提供即时反馈 ---
        // a. 添加 .is-pending-removal 类，触发淡出动画。
        // b. 添加 .is-learned 类，立即将对勾图标变为“已掌握”的实心样式。
        cardElement.classList.add('is-pending-removal');
        cardElement.classList.add('is-learned');

        // --- 步骤 2: 定义“确认”和“撤销”两种最终操作 ---

        // `onConfirm`：当5秒倒计时结束或用户执行新操作时触发。
        const onConfirm = () => {
            // a. 真实地更新数据状态并持久化到 localStorage。
            State.toggleLearnedStatus(data);
            // b. 从DOM中彻底移除卡片元素。
            cardElement.remove();

            // c. 检查是否需要加载新卡片来填补空位，保持页面内容充实。
            State.filterAndPrepareDataSet();
            const cardsOnScreen = cardGrid.querySelectorAll('.card:not(.is-pending-removal)').length;
            if (cardsOnScreen < CARDS_PER_PAGE && renderIndex < State.currentDataSet.length) {
                renderMoreCards();
            }
            updateEmptyStateMessage();
        };

        // `onUndo`：当用户点击“撤销”按钮时触发。
        const onUndo = () => {
            // a. 移除 .is-pending-removal 类，取消淡出效果，使卡片恢复原位。
            // b. 移除 .is-learned 类，将图标恢复为“未掌握”的空心样式。
            cardElement.classList.remove('is-pending-removal');
            cardElement.classList.remove('is-learned');
        };

        // --- 步骤 3: 调用全局撤销管理器，显示通知并开始倒计时 ---
        UndoManager.show({
            message: `单词 "${data.word}" 已标记为掌握。`,
            onConfirm: onConfirm,
            onUndo: onUndo
        });
    }


    /**
     * 处理单词本数据变更后的全局联动。
     * @param {'create'|'update'|'delete'|'study'} type - 变更类型
     * @param {string|null} newName - 新名称 (用于 create, update, study)
     * @param {string|null} oldName - 旧名称 (用于 update, delete)
     */
    function handleWordbookChange(type, newName, oldName) {
        // 无论何种操作，都先刷新顶部的过滤器按钮列表
        updateCategoryFilters();

        // 根据操作类型决定是否需要跳转筛选器或刷新视图
        if (type === 'create' || type === 'study') {
            State.setCurrentFilter(newName);
            const newBtn = filterContainer.querySelector(`.filter-btn[data-filter="${newName}"]`);
            if (newBtn) UI.updateActiveFilterButton(filterContainer, newBtn);
            State.filterAndPrepareDataSet();
            startNewRenderFlow();
        } else if (type === 'update') {
            // 如果更新的是当前正在查看的单词本，则同步更新筛选器状态
            if (State.currentFilter === oldName) {
                State.setCurrentFilter(newName);
                const newBtn = filterContainer.querySelector(`.filter-btn[data-filter="${newName}"]`);
                if (newBtn) UI.updateActiveFilterButton(filterContainer, newBtn);
                State.filterAndPrepareDataSet();
                startNewRenderFlow();
            }
        } else if (type === 'delete') {
            // 如果删除的是当前正在查看的单词本，回退到 'all' 视图
            if (State.currentFilter === oldName) {
                State.setCurrentFilter('all');
                const allBtn = filterContainer.querySelector('.filter-btn[data-filter="all"]');
                if (allBtn) UI.updateActiveFilterButton(filterContainer, allBtn);
                State.filterAndPrepareDataSet();
                startNewRenderFlow();
            }
        }
    }

    /**
     * 设置 IntersectionObserver 以实现无限滚动加载。
     */
    function setupIntersectionObserver() {
        if (observer) observer.disconnect();
        observer = new IntersectionObserver((entries) => {
            // 当触发器进入视口且可见时，加载更多卡片
            if (entries[0].isIntersecting && loadMoreTrigger.classList.contains('is-visible')) {
                renderMoreCards();
            }
        }, { root: null, rootMargin: '0px 0px 300px 0px', threshold: 0 });
        observer.observe(loadMoreTrigger);
    }

    // ============================================================================
    // 全局事件绑定
    // ============================================================================
    gradeFilterContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.grade-filter-btn');
        if (btn && !btn.classList.contains('active')) {
            UI.updateActiveGradeButton(gradeFilterContainer, btn);
            State.setCurrentGrade(btn.dataset.grade);
            State.setCurrentContentType('all'); // 切换年级时重置内容类型
            const allContentTypeBtn = contentTypeFilterContainer.querySelector('.content-type-btn[data-type="all"]');
            if(allContentTypeBtn) UI.updateActiveContentTypeButton(contentTypeFilterContainer, allContentTypeBtn);
            State.setCurrentFilter('all'); // 重置类别筛选
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
            State.setCurrentFilter('all'); // 切换内容类型时重置类别筛选
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
        // 模块初始化顺序：先初始化无依赖或提供基础服务的模块
        ThemeManager.init();
        UndoManager.init(); // 初始化撤销管理器

        // 初始化数据导入/导出模块
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

        // 初始化功能性模态框模块
        ListeningMode.init(document.getElementById('listening-mode-btn'));
        TypingMode.init(document.getElementById('typing-mode-btn'));
        Wordbook.init(
            document.getElementById('manage-wordbook-btn'),
            optionsMenu,
            handleWordbookChange // 传入回调函数，解耦
        );

        // 绑定主题切换按钮
        document.getElementById('theme-toggle-menu-btn').addEventListener('click', () => {
            const isDarkMode = document.body.classList.contains('dark-mode');
            ThemeManager.applyTheme(isDarkMode ? 'light' : 'dark');
            optionsMenu.classList.remove('is-open');
        });

        try {
            // 加载用户本地数据
            State.loadLearnedWords();
            State.loadUserWordbooks();

            // 异步加载所有词汇数据
            const { grades } = await State.loadAndProcessData(updateLoadingProgress);

            // 数据加载成功后，移除加载状态UI
            loadingFeedbackContainer.classList.add('is-fading-out');
            skeletonLoader.classList.add('is-fading-out');
            skeletonLoader.addEventListener('transitionend', () => {
                loadingFeedbackContainer.remove();
                skeletonLoader.remove();
            }, { once: true });

            // 渲染动态UI组件
            UI.renderGradeButtons(gradeFilterContainer, grades);
            UI.renderContentTypeButtons(contentTypeFilterContainer);

            // 设置默认激活的筛选按钮
            const defaultGradeBtn = gradeFilterContainer.querySelector(`[data-grade="${State.currentGrade}"]`);
            if (defaultGradeBtn) UI.updateActiveGradeButton(gradeFilterContainer, defaultGradeBtn);

            // 渲染类别筛选器并准备首次数据展示
            updateCategoryFilters();
            State.filterAndPrepareDataSet();
            startNewRenderFlow();
            setupIntersectionObserver();

        } catch (error) {
            console.error('初始化应用时发生严重错误:', error);
            if (loadingFeedbackContainer) loadingFeedbackContainer.remove();
            if (skeletonLoader) skeletonLoader.remove();
            cardGrid.innerHTML = `<div class="loading-state" style="color: #ef4444; padding: 2rem;">加载应用失败，请检查网络连接或浏览器控制台获取错误信息。<br><br>错误: ${error.message}</div>`;
        }
    }

    // 启动应用
    init();
});