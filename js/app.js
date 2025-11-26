// =================================================================================
// 主应用逻辑 (Main Application Logic) - v6.0 (Modular)
// ---------------------------------------------------------------------------------
// 这个文件是整个应用的控制器，负责协调 state 和 ui 模块。
// 主要职责：
// 1. (初始化) 启动应用，获取DOM元素，加载初始数据。
// 2. (事件绑定) 为筛选器、洗牌按钮等设置事件监听器。
// 3. (逻辑协调) 响应用户交互，调用 state 模块更新数据，然后调用 ui 模块更新视图。
// 4. (懒加载) 设置并管理 Intersection Observer，实现无限滚动效果。
// 5. (鲁棒性) 提供顶层的错误处理和状态显示。
// =================================================================================

import * as State from './state.js';
import * as UI from './ui.js';

document.addEventListener('DOMContentLoaded', () => {

    // --- DOM 元素获取 ---
    const cardGrid = document.getElementById('card-grid');
    const filterContainer = document.getElementById('filter-container');
    const shuffleBtn = document.getElementById('shuffle-btn');
    const loadMoreTrigger = document.getElementById('load-more-trigger');
    const skeletonLoader = document.getElementById('skeleton-loader'); // 获取骨架图容器

    // --- 懒加载与渲染状态 ---
    let renderIndex = 0;           // 当前渲染到的数据索引位置
    const CARDS_PER_PAGE = 12;     // 每次滚动加载的卡片数量
    let observer = null;           // IntersectionObserver 实例
    let isShuffling = false;       // 洗牌状态锁

    // --- 鲁棒性检查：确保关键元素存在 ---
    if (!cardGrid || !filterContainer || !shuffleBtn || !loadMoreTrigger) {
        console.error('关键的 DOM 元素未找到，应用无法启动。');
        document.body.innerHTML = '<h1 style="text-align:center; padding-top: 50px;">页面结构损坏，请检查 HTML 文件。</h1>';
        return;
    }
    if (!UI.initUI()) { // 初始化UI模块，检查模板是否存在
        document.body.innerHTML = '<h1 style="text-align:center; padding-top: 50px;">卡片模板丢失，请检查 HTML 文件。</h1>';
        return;
    }

    /**
     * 核心渲染函数，实现懒加载。
     */
    function renderMoreCards() {
        const fragment = document.createDocumentFragment();
        const endIndex = Math.min(renderIndex + CARDS_PER_PAGE, State.currentDataSet.length);

        const handlers = {
            onMarkLearned: handleMarkAsLearned
        };

        for (let i = renderIndex; i < endIndex; i++) {
            const item = State.currentDataSet[i];
            const cardElement = UI.createCard(item, handlers);
            fragment.appendChild(cardElement);
        }

        cardGrid.insertBefore(fragment, loadMoreTrigger);
        renderIndex = endIndex;

        // 更新懒加载触发器的可见性
        if (renderIndex < State.currentDataSet.length) {
            loadMoreTrigger.classList.add('is-visible');
        } else {
            loadMoreTrigger.classList.remove('is-visible');
            // 如果渲染完毕后网格中仍然没有卡片，则显示提示信息
            if (cardGrid.children.length <= 1) { // 1 是指 loadMoreTrigger 本身
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

    /**
     * 启动一个全新的渲染流程（通常在筛选或洗牌后调用）。
     */
    function startNewRenderFlow() {
        cardGrid.innerHTML = ''; // 清空现有卡片
        renderIndex = 0;
        loadMoreTrigger.remove(); // 暂时移除触发器
        cardGrid.appendChild(loadMoreTrigger); // 重新添加到末尾
        renderMoreCards(); // 渲染第一页
    }

    /**
     * 处理“标记/取消标记为已掌握”的逻辑。
     * @param {object} data - 单词数据
     * @param {HTMLElement} cardElement - 对应的卡片DOM元素
     */
    function handleMarkAsLearned(data, cardElement) {
        State.toggleLearnedStatus(data);

        // 平滑移除卡片的视觉效果
        cardElement.style.transition = 'opacity 0.3s ease-out';
        cardElement.style.opacity = '0';

        setTimeout(() => {
            cardElement.remove();
            // 重新计算当前数据集，以防需要补充卡片
            const oldLength = State.currentDataSet.length;
            State.filterAndPrepareDataSet();

            // 如果因为移除了卡片导致当前页不满，且还有更多数据，则补充渲染
            const cardsOnScreen = cardGrid.querySelectorAll('.card').length;
            if (oldLength > State.currentDataSet.length && cardsOnScreen < CARDS_PER_PAGE && renderIndex < State.currentDataSet.length) {
                renderMoreCards();
            }
        }, 300);
    }

    /**
     * 设置 Intersection Observer 来监听滚动，实现懒加载。
     */
    function setupIntersectionObserver() {
        if (observer) { observer.disconnect(); }

        const options = { root: null, rootMargin: '0px 0px 300px 0px', threshold: 0 };
        observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                // 当触发器进入视口并且可见时，加载更多卡片
                if (entry.isIntersecting && loadMoreTrigger.classList.contains('is-visible')) {
                    renderMoreCards();
                }
            });
        }, options);
        observer.observe(loadMoreTrigger);
    }


    // --- 事件监听器 ---

    // 筛选器事件委托
    filterContainer.addEventListener('click', (e) => {
        const targetButton = e.target.closest('.filter-btn');
        if (targetButton && !targetButton.classList.contains('active')) {
            UI.updateActiveFilterButton(filterContainer, targetButton);
            State.setCurrentFilter(targetButton.dataset.filter);
            State.filterAndPrepareDataSet();
            startNewRenderFlow();
        }
    });

    // 洗牌按钮事件
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
        try {
            // 1. 加载本地存储的学习进度
            State.loadLearnedWords();

            // 2. 加载并处理所有词汇数据
            const rawDataSets = await State.loadAndProcessData();

            // 3. 数据加载成功后，平滑地移除骨架图
            if (skeletonLoader) {
                skeletonLoader.style.opacity = '0';
                setTimeout(() => skeletonLoader.remove(), 300); // 待动画结束后再从DOM中移除
            }

            // 4. 根据加载的数据生成UI组件
            UI.renderFilterButtons(filterContainer, shuffleBtn, rawDataSets);

            // 5. 准备初始数据集并开始渲染真实卡片
            State.filterAndPrepareDataSet();
            startNewRenderFlow();

            // 6. 设置懒加载观察者
            setupIntersectionObserver();

        } catch (error) {
            console.error('初始化应用时发生严重错误:', error);
            // 出错时也要移除骨架图，并显示错误信息
            skeletonLoader?.remove();
            cardGrid.innerHTML = `<div class="loading-state" style="color: #ef4444;">${error.message}</div>`;
            shuffleBtn.style.display = 'none';
        }
    }

    // --- 启动应用 ---
    init();
});