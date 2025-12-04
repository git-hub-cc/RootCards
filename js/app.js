// =================================================================================
// 应用协调器 (Application Orchestrator) - v14.2 (Splash Screen & 启动优化)
// ---------------------------------------------------------------------------------
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
    const gradeFilterContainer = document.getElementById('grade-filter-container');
    const contentTypeFilterContainer = document.getElementById('content-type-filter-container');
    const filterContainer = document.getElementById('filter-container');
    const shuffleBtn = document.getElementById('shuffle-btn');
    const loadMoreTrigger = document.getElementById('load-more-trigger');
    const searchInput = document.getElementById('search-input');
    const toolGroup = document.getElementById('tool-group');
    const skeletonLoader = document.getElementById('skeleton-loader');

    // 【新增】启动页相关元素
    const splashScreen = document.getElementById('app-splash-screen');
    const splashProgressText = document.getElementById('loading-progress-text'); // 复用了ID
    const splashProgressBar = document.getElementById('loading-progress-bar');   // 复用了ID

    const noVisualBtn = document.getElementById('no-visual-btn');
    const moreOptionsBtn = document.getElementById('more-options-btn');
    const optionsMenu = document.getElementById('options-menu');
    const clearLearnedBtn = document.getElementById('clear-learned-btn');
    const immersiveModeBtn = document.getElementById('immersive-mode-btn');

    // 模式启动按钮
    const typingModeBtn = document.getElementById('typing-mode-btn');
    const listeningModeBtn = document.getElementById('listening-mode-btn');

    // --- 状态变量 ---
    let renderIndex = 0;
    const CARDS_PER_PAGE = 12;
    let observer = null;
    let isShuffling = false;

    // --- 模块初始化检查 ---
    if (!UI.init()) {
        console.error("应用启动失败：UI模块初始化未能成功。");
        return;
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

        const handlers = { onMarkLearned: handleMarkAsLearned };

        for (let i = renderIndex; i < endIndex; i++) {
            const card = UI.createCard(State.currentDataSet[i], handlers);
            fragment.appendChild(card);

            // 【新增】移动端 Scroll Snap 懒加载埋点
            // 给每批次的倒数第二张卡片添加特定类，用于水平滚动的观察
            if (i === endIndex - 2) {
                card.classList.add('mobile-scroll-trigger');
            }
        }

        // 将新卡片插入到加载触发器之前
        cardGrid.insertBefore(fragment, loadMoreTrigger);
        renderIndex = endIndex;

        // 更新“加载更多”触发器的可见性
        const hasMore = renderIndex < State.currentDataSet.length;
        loadMoreTrigger.classList.toggle('is-visible', hasMore);

        // 如果是移动端，需要重新绑定水平滚动的 Observer
        if (window.innerWidth <= 768) {
            setupMobileIntersectionObserver();
        }

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
            // 在 Flex 容器中，确保消息占据 100% 宽度并居中
            cardGrid.insertAdjacentHTML('afterbegin', `<div class="loading-state" style="margin: auto;">${message}</div>`);
        } else if (cardCount > 0 && existingMessage) {
            existingMessage.remove();
        }
    }

    /**
     * 清空并重新开始渲染流程。
     */
    function startNewRenderFlow() {
        cardGrid.innerHTML = '';
        cardGrid.appendChild(loadMoreTrigger);
        renderIndex = 0;
        renderMoreCards();

        // 渲染重置后，滚动到最左侧/最顶部
        cardGrid.scrollTo({ left: 0, top: 0 });
    }

    /**
     * 更新顶部的类别筛选器按钮列表。
     */
    function updateCategoryFilters() {
        const availableCategories = State.getAvailableCategories();
        // 注意：UI.renderFilterButtons 内部会处理移动端的样式类
        UI.renderFilterButtons(filterContainer, toolGroup, availableCategories);

        const currentBtn = filterContainer.querySelector(`.filter-btn[data-filter="${State.currentFilter}"]`);
        if (currentBtn) {
            UI.updateActiveFilterButton(filterContainer, currentBtn);
            // 移动端：自动滚动使选中按钮可见
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

    /**
     * 更新数据加载进度条的显示。
     */
    function updateLoadingProgress(loaded, total) {
        if (total > 0 && splashProgressBar) {
            const percentage = Math.round((loaded / total) * 100);
            splashProgressBar.style.width = `${percentage}%`;
            splashProgressText.textContent = `正在解析数据文件 (${loaded}/${total})...`;
        }
    }

    /**
     * 隐藏启动页并显示主界面
     */
    function hideSplashScreen() {
        if (splashScreen) {
            // 确保进度条跑满
            if (splashProgressBar) splashProgressBar.style.width = '100%';
            if (splashProgressText) splashProgressText.textContent = '准备就绪，开始学习！';

            // 稍微延迟一点，让用户看到100%的状态
            setTimeout(() => {
                splashScreen.classList.add('is-hidden');
                // 启动页淡出后，可以将其从 DOM 中移除以节省内存（可选）
                setTimeout(() => splashScreen.remove(), 600);
            }, 500);
        }
        // 移除骨架屏
        if (skeletonLoader) skeletonLoader.remove();
    }

    // ============================================================================
    // 事件回调处理 (Action Handlers)
    // ============================================================================

    /**
     * 【核心优化】处理标记/取消标记为“已掌握”的逻辑。
     * 采用“乐观 UI”模式：立即隐藏卡片，延迟处理数据。
     * @param {object} data - 单词数据对象
     * @param {HTMLElement} cardElement - 卡片的 DOM 元素
     */
    function handleMarkAsLearned(data, cardElement) {
        // 1. 播放 UI 音效
        const isCurrentlyLearned = cardElement.classList.contains('is-learned');
        UI.playUiSound(isCurrentlyLearned ? 'uncomplete' : 'complete');

        // 2. 【乐观 UI】立即在界面上隐藏卡片
        // is-learned 状态立即切换，以防撤销时状态不一致
        cardElement.classList.toggle('is-learned');
        cardElement.classList.add('is-pending-removal'); // 这个类现在会触发隐藏动画

        // 3. 在移动端单页视图下，自动滑向下一张卡片
        if (window.innerWidth <= 768) {
            const nextCard = cardElement.nextElementSibling;
            if (nextCard && nextCard.classList.contains('card')) {
                // 延迟一点让隐藏动画先播放
                setTimeout(() => {
                    nextCard.scrollIntoView({ behavior: 'smooth', inline: 'center' });
                }, 350); // 动画时间是 350ms
            }
        }

        // 4. 定义“确认”和“撤销”操作
        const onConfirm = () => {
            // 这是 5 秒后执行的“真实操作”
            State.toggleLearnedStatus(data); // 此时才更新数据状态和 localStorage
            cardElement.remove(); // 从 DOM 中彻底移除元素

            // 检查是否需要补充卡片
            const cardsOnScreen = cardGrid.querySelectorAll('.card:not(.is-pending-removal)').length;
            if (cardsOnScreen < CARDS_PER_PAGE && renderIndex < State.currentDataSet.length) {
                renderMoreCards();
            }
            updateEmptyStateMessage();
        };

        const onUndo = () => {
            // 撤销操作非常简单：只需恢复 UI 状态
            cardElement.classList.toggle('is-learned');
            cardElement.classList.remove('is-pending-removal');
            // 在移动端，如果撤销，需要将卡片滚回视图
            if (window.innerWidth <= 768) {
                cardElement.scrollIntoView({ behavior: 'smooth', inline: 'center' });
            }
        };

        // 5. 显示撤销通知
        UndoManager.show({
            message: `单词 "${data.word}" 已标记。`,
            onConfirm: onConfirm,
            onUndo: onUndo
        });
    }


    function handleWordbookChange(type, newName, oldName) {
        updateCategoryFilters();

        if (type === 'create' || type === 'study') {
            State.setCurrentFilter(newName);
            const newBtn = filterContainer.querySelector(`.filter-btn[data-filter="${newName}"]`);
            if (newBtn) UI.updateActiveFilterButton(filterContainer, newBtn);
            State.filterAndPrepareDataSet();
            startNewRenderFlow();
        } else if (type === 'update' && State.currentFilter === oldName) {
            State.setCurrentFilter(newName);
            const newBtn = filterContainer.querySelector(`.filter-btn[data-filter="${newName}"]`);
            if (newBtn) UI.updateActiveFilterButton(filterContainer, newBtn);
            State.filterAndPrepareDataSet();
            startNewRenderFlow();
        } else if (type === 'delete' && State.currentFilter === oldName) {
            State.setCurrentFilter('all');
            const allBtn = filterContainer.querySelector('.filter-btn[data-filter="all"]');
            if (allBtn) UI.updateActiveFilterButton(filterContainer, allBtn);
            State.filterAndPrepareDataSet();
            startNewRenderFlow();
        }
    }

    /**
     * 设置 IntersectionObserver (PC端垂直滚动)
     */
    function setupIntersectionObserver() {
        // 如果是移动端，不使用这个逻辑
        if (window.innerWidth <= 768) return;

        if (observer) observer.disconnect();
        observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && loadMoreTrigger.classList.contains('is-visible')) {
                renderMoreCards();
            }
        }, { root: null, rootMargin: '0px 0px 300px 0px', threshold: 0 });
        observer.observe(loadMoreTrigger);
    }

    /**
     * 【新增】设置移动端水平滚动的 Observer
     * 监听倒数第2张卡片滑入视口时触发加载
     */
    function setupMobileIntersectionObserver() {
        // 先断开旧的
        if (observer) observer.disconnect();

        // 找到所有的触发点
        const triggers = cardGrid.querySelectorAll('.mobile-scroll-trigger');
        if (triggers.length === 0) return;

        // 只监听最后一个（最新一批的触发点）
        const lastTrigger = triggers[triggers.length - 1];

        observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                // 移除触发类，防止重复触发
                lastTrigger.classList.remove('mobile-scroll-trigger');
                // 加载更多
                renderMoreCards();
            }
        }, {
            root: cardGrid, // 以水平滚动的容器为视窗
            rootMargin: '0px 200px 0px 0px', // 提前 200px 加载
            threshold: 0.1
        });

        observer.observe(lastTrigger);
    }

    // ============================================================================
    // 全局事件绑定
    // ============================================================================

    gradeFilterContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.grade-filter-btn');
        if (btn && !btn.classList.contains('active')) {
            UI.updateActiveGradeButton(gradeFilterContainer, btn);
            State.setCurrentGrade(btn.dataset.grade);
            State.setCurrentContentType('all');
            const allContentTypeBtn = contentTypeFilterContainer.querySelector('.content-type-btn[data-type="all"]');
            if (allContentTypeBtn) UI.updateActiveContentTypeButton(contentTypeFilterContainer, allContentTypeBtn);
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
        UI.playUiSound('activate');

        // 移动端单页视图下，无需播放复杂的缩放动画，直接刷新体验更好
        const isMobile = window.innerWidth <= 768;

        if (isMobile) {
            State.shuffleCurrentDataSet();
            startNewRenderFlow();
            // 在移动端用简单的 Toast 提示
            NotificationManager.show({ type: 'success', message: '🔀 卡片已随机打乱' });
        } else {
            // PC端保留动画
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

    // 【新增】沉浸模式按钮事件绑定
    if (immersiveModeBtn) {
        immersiveModeBtn.addEventListener('click', () => UI.toggleImmersiveMode(immersiveModeBtn));
    }

    moreOptionsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        optionsMenu.classList.toggle('is-open');
    });

    clearLearnedBtn.addEventListener('click', () => {
        const onConfirm = () => {
            State.clearLearnedWords();
            State.filterAndPrepareDataSet();
            startNewRenderFlow();
            NotificationManager.show({
                type: 'success',
                message: '所有已掌握记录已成功清空。'
            });
        };
        const onUndo = () => {
            NotificationManager.show({
                type: 'info',
                message: '清空操作已取消。'
            });
        };
        UndoManager.show({
            message: '即将清空所有已掌握记录...',
            onConfirm: onConfirm,
            onUndo: onUndo
        });
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

        ListeningMode.init(listeningModeBtn);
        TypingMode.init(typingModeBtn);
        Wordbook.init(
            document.getElementById('manage-wordbook-btn'),
            optionsMenu,
            handleWordbookChange
        );

        document.getElementById('theme-toggle-menu-btn').addEventListener('click', () => {
            const isDarkMode = document.body.classList.contains('dark-mode');
            ThemeManager.applyTheme(isDarkMode ? 'light' : 'dark');
            optionsMenu.classList.remove('is-open');
        });

        try {
            State.loadLearnedWords();
            State.loadUserWordbooks();
            State.loadUserNotes();

            // 加载数据，并通过 updateLoadingProgress 回调更新启动页进度条
            const { grades } = await State.loadAndProcessData(updateLoadingProgress);

            // 【修改】数据加载完毕，调用平滑过渡函数隐藏 Splash Screen
            hideSplashScreen();

            UI.renderGradeButtons(gradeFilterContainer, grades);
            UI.renderContentTypeButtons(contentTypeFilterContainer);

            const defaultGradeBtn = gradeFilterContainer.querySelector(`[data-grade="${State.currentGrade}"]`);
            if (defaultGradeBtn) UI.updateActiveGradeButton(gradeFilterContainer, defaultGradeBtn);

            const defaultContentTypeBtn = contentTypeFilterContainer.querySelector(`[data-type="${State.currentContentType}"]`);
            if (defaultContentTypeBtn) UI.updateActiveContentTypeButton(contentTypeFilterContainer, defaultContentTypeBtn);

            updateCategoryFilters();
            State.filterAndPrepareDataSet();
            startNewRenderFlow();

            // 根据设备类型绑定不同的加载监听器
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