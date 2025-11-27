// =================================================================================
// 主应用逻辑 (Main Application Logic) - v6.1 (Theme Toggle)
// ---------------------------------------------------------------------------------
// 这个文件是整个应用的控制器，负责协调 state 和 ui 模块。
// 主要职责：
// 1. (初始化) 启动应用，获取DOM元素，加载初始数据。
// 2. (事件绑定) 为筛选器、洗牌按钮、主题切换等设置事件监听器。
// 3. (逻辑协调) 响应用户交互，调用 state 模块更新数据，然后调用 ui 模块更新视图。
// 4. (懒加载) 设置并管理 Intersection Observer，实现无限滚动效果。
// 5. (主题管理) 处理深色/浅色主题的切换、持久化和初始化。
// =================================================================================

import * as State from './state.js';
import * as UI from './ui.js';

document.addEventListener('DOMContentLoaded', () => {

    // --- DOM 元素获取 ---
    const cardGrid = document.getElementById('card-grid');
    const filterContainer = document.getElementById('filter-container');
    const shuffleBtn = document.getElementById('shuffle-btn');
    const themeToggleBtn = document.getElementById('theme-toggle-btn'); // 【新增】主题切换按钮
    const loadMoreTrigger = document.getElementById('load-more-trigger');
    const skeletonLoader = document.getElementById('skeleton-loader');

    // --- 懒加载与渲染状态 ---
    let renderIndex = 0;
    const CARDS_PER_PAGE = 12;
    let observer = null;
    let isShuffling = false;

    // --- 【新增】主题管理常量 ---
    const THEME_KEY = 'etymology-visualizer-theme';

    // --- 鲁棒性检查：确保关键元素存在 ---
    if (!cardGrid || !filterContainer || !shuffleBtn || !loadMoreTrigger || !themeToggleBtn) { // <-- 添加了 themeToggleBtn
        console.error('关键的 DOM 元素未找到，应用无法启动。');
        document.body.innerHTML = '<h1 style="text-align:center; padding-top: 50px;">页面结构损坏，请检查 HTML 文件。</h1>';
        return;
    }
    if (!UI.initUI()) {
        document.body.innerHTML = '<h1 style="text-align:center; padding-top: 50px;">卡片模板丢失，请检查 HTML 文件。</h1>';
        return;
    }

    // ============================================================================
    // 【新增】主题切换核心逻辑
    // ============================================================================

    /**
     * 应用指定的主题（'light' 或 'dark'）。
     * @param {string} theme - 要应用的主题名称。
     */
    function applyTheme(theme) {
        document.body.classList.toggle('dark-mode', theme === 'dark');
        themeToggleBtn.title = theme === 'dark' ? '切换到浅色主题' : '切换到深色主题';
        try {
            localStorage.setItem(THEME_KEY, theme);
        } catch (error) {
            console.warn('无法将主题偏好保存到 localStorage:', error);
        }
    }

    /**
     * 初始化主题：优先从localStorage读取，其次尊重系统偏好。
     */
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
            console.warn('无法读取主题偏好，将使用默认主题:', error);
            applyTheme('light'); // 出错时回退到浅色主题
        }
    }

    // (为简洁起见，我将未修改的函数折叠起来，您的实际文件中应保留其完整内容)
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
            if (cardGrid.children.length <= 1) {
                let message = '太棒了，当前分类下没有更多要学习的单词了！';
                if (State.currentFilter === 'learned' && State.allVocabularyData.some(d => d.cardType === 'word')) {
                    message = '还没有标记任何单词为“已掌握”。';
                } else if (State.allVocabularyData.length === 0) {
                    message = '正在加载数据...';
                }
                cardGrid.innerHTML = `<div class="loading-state">${message}</div>`;
            }
        }
    }
    function startNewRenderFlow() {
        cardGrid.innerHTML = '';
        renderIndex = 0;
        loadMoreTrigger.remove();
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
            const oldLength = State.currentDataSet.length;
            State.filterAndPrepareDataSet();
            const cardsOnScreen = cardGrid.querySelectorAll('.card').length;
            if (oldLength > State.currentDataSet.length && cardsOnScreen < CARDS_PER_PAGE && renderIndex < State.currentDataSet.length) {
                renderMoreCards();
            }
        }, 300);
    }
    function setupIntersectionObserver() {
        if (observer) { observer.disconnect(); }
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


    // --- 事件监听器 ---

    filterContainer.addEventListener('click', (e) => { /* ... 此函数内容无变化 ... */ });
    shuffleBtn.addEventListener('click', () => { /* ... 此函数内容无变化 ... */ });

    // 【新增】主题切换按钮事件
    themeToggleBtn.addEventListener('click', () => {
        const isDarkMode = document.body.classList.contains('dark-mode');
        applyTheme(isDarkMode ? 'light' : 'dark');
    });

    // (折叠的事件监听器)
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


    // --- 应用初始化 ---
    async function init() {
        // 【重要】在任何内容渲染之前，首先应用主题，防止闪烁
        initializeTheme();

        try {
            State.loadLearnedWords();
            const rawDataSets = await State.loadAndProcessData();
            if (skeletonLoader) {
                skeletonLoader.style.opacity = '0';
                setTimeout(() => skeletonLoader.remove(), 300);
            }
            UI.renderFilterButtons(filterContainer, themeToggleBtn, rawDataSets); // <-- 将按钮插入到主题按钮之前
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

    // --- 启动应用 ---
    init();
});