// =================================================================================
// 主应用逻辑 (Main Application Logic) - v10.1 (完整版)
// ---------------------------------------------------------------------------------
// 这个文件是整个应用的控制器，负责协调 state 和 ui 模块。
// 它包含了所有功能模块的事件绑定和业务流程控制。
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
    const loadMoreTrigger = document.getElementById('load-more-trigger');
    const searchInput = document.getElementById('search-input');
    const toolGroup = document.getElementById('tool-group');
    const loadingFeedbackContainer = document.getElementById('loading-feedback-container');
    const loadingProgressText = document.getElementById('loading-progress-text');
    const loadingProgressBar = document.getElementById('loading-progress-bar');
    const skeletonLoader = document.getElementById('skeleton-loader');
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
    const typingHintBtn = document.getElementById('typing-hint-btn');

    // “更多操作”菜单相关
    const moreOptionsBtn = document.getElementById('more-options-btn');
    const optionsMenu = document.getElementById('options-menu');
    const themeToggleMenuBtn = document.getElementById('theme-toggle-menu-btn');
    const importLearnedBtn = document.getElementById('import-learned-btn');
    const exportLearnedBtn = document.getElementById('export-learned-btn');
    const exportCurrentBtn = document.getElementById('export-current-btn');
    const importFileInput = document.getElementById('import-file-input');

    // 单词本创建功能相关元素
    const createWordbookBtn = document.getElementById('create-wordbook-btn');
    const wordbookModal = document.getElementById('wordbook-modal');
    const wordbookCloseBtn = document.getElementById('wordbook-close-btn');
    const wordbookExtractBtn = document.getElementById('wordbook-extract-btn');
    const wordbookTextInput = document.getElementById('wordbook-text-input');
    const wordbookList = document.getElementById('wordbook-list');
    const wordbookNameInput = document.getElementById('wordbook-name-input');
    const wordbookCreateBtn = document.getElementById('wordbook-create-btn');
    const wordbookSelectAllBtn = document.getElementById('wordbook-select-all-btn');
    const wordbookDeselectAllBtn = document.getElementById('wordbook-deselect-all-btn');

    // --- 状态变量 ---
    let renderIndex = 0;
    const CARDS_PER_PAGE = 12;
    let observer = null;
    let isShuffling = false;
    let isExtractingWords = false; // 防止重复点击提取

    // 听力/打字模式状态
    let listeningPlaylist = [];
    let currentListeningData = null;
    let currentSentenceIndex = 0;
    let typingPlaylist = [];
    let currentTypingData = null;
    let currentTypingIndex = 0;
    let currentTypingHintLevel = 0;


    // --- 鲁棒性检查 ---
    const essentialElements = [
        cardGrid, gradeFilterContainer, contentTypeFilterContainer, filterContainer,
        shuffleBtn, listeningModal, searchInput, toolGroup, loadingFeedbackContainer,
        skeletonLoader, moreOptionsBtn, optionsMenu, typingHintBtn,
        createWordbookBtn, wordbookModal, wordbookExtractBtn, wordbookCreateBtn
    ];

    if (essentialElements.some(el => !el)) {
        console.error('关键的 DOM 元素未找到，应用无法启动。请检查 HTML 文件是否完整。');
        document.body.innerHTML = '<h1 style="text-align:center; padding-top: 50px;">应用初始化失败，请检查控制台错误。</h1>';
        return;
    }
    if (!UI.initUI() || typeof nlp === 'undefined') { // 检查 compromise 库是否加载
        const message = !UI.initUI() ? 'UI 模板丢失' : 'compromise.js 库未加载';
        document.body.innerHTML = `<h1 style="text-align:center; padding-top: 50px;">${message}，请检查 HTML 文件和网络连接。</h1>`;
        return;
    }

    // ============================================================================
    // 1. 主题切换逻辑
    // ============================================================================
    const THEME_KEY = 'etymology-visualizer-theme';
    function applyTheme(theme) {
        document.body.classList.toggle('dark-mode', theme === 'dark');
        try { localStorage.setItem(THEME_KEY, theme); } catch (e) { console.warn('无法保存主题偏好:', e); }
    }
    function initializeTheme() {
        try {
            const savedTheme = localStorage.getItem(THEME_KEY);
            if (savedTheme) { applyTheme(savedTheme); }
            else { const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches; applyTheme(prefersDark ? 'dark' : 'light'); }
        } catch (e) { console.warn('无法读取主题偏好', e); applyTheme('light'); }
    }

    // ============================================================================
    // 2. 核心渲染与UI更新逻辑
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
        cardGrid.innerHTML = '';
        cardGrid.appendChild(loadMoreTrigger);
        renderIndex = 0;
        renderMoreCards();
    }
    function updateCategoryFilters() {
        const availableCategories = State.getAvailableCategories();
        UI.renderFilterButtons(filterContainer, toolGroup, availableCategories);
    }
    function updateLoadingProgress(loaded, total) {
        if (total > 0) {
            loadingProgressBar.max = total;
            loadingProgressBar.value = loaded;
            loadingProgressText.textContent = `正在加载数据文件: ${loaded} / ${total}`;
        }
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
        currentTypingHintLevel = 0;
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
    function handleTypingHint() {
        if (!currentTypingData || currentTypingHintLevel >= 3) {
            return;
        }
        currentTypingHintLevel++;
        UI.showTypingHint(currentTypingData.word, currentTypingHintLevel);
    }

    // --- 导入/导出处理器 ---
    function handleExport(type) {
        let dataToExport;
        let filename;
        const timestamp = new Date().toISOString().slice(0, 10);
        if (type === 'learned') {
            dataToExport = State.getLearnedWordsArray();
            filename = `rootcards-learned-words-${timestamp}.json`;
            if (dataToExport.length === 0) {
                alert('您还没有标记任何单词为“已掌握”，无需导出。');
                return;
            }
        } else if (type === 'current') {
            dataToExport = State.currentDataSet
                .filter(item => item.cardType === 'word')
                .map(item => item.word);
            filename = `rootcards-current-view-${timestamp}.json`;
            if (dataToExport.length === 0) {
                alert('当前视图中没有单词可供导出。');
                return;
            }
        } else { return; }
        UI.triggerJsonDownload(dataToExport, filename);
    }

    function handleImport(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);
                if (!Array.isArray(importedData) || !importedData.every(item => typeof item === 'string')) {
                    throw new Error('文件格式不正确。请确保导入的是一个仅包含单词字符串的JSON数组。');
                }
                const newCount = State.importLearnedWords(importedData);
                State.filterAndPrepareDataSet();
                startNewRenderFlow();
                alert(`✅ 导入成功！\n新增了 ${newCount} 个“已掌握”的单词。`);
            } catch (error) {
                console.error('导入失败:', error);
                alert(`❌ 导入失败！\n错误信息: ${error.message}`);
            } finally {
                event.target.value = null;
            }
        };
        reader.onerror = () => {
            alert('❌ 读取文件时发生错误，请重试。');
            event.target.value = null;
        };
        reader.readAsText(file);
    }

    // --- 单词本创建处理器 ---
    async function handleExtractWords() {
        if (isExtractingWords) return;
        isExtractingWords = true;
        UI.updateWordbookStatus('正在准备环境...', true);

        const text = wordbookTextInput.value;
        if (!text.trim()) {
            UI.updateWordbookStatus('请输入文本内容。', false);
            isExtractingWords = false;
            return;
        }
        setTimeout(() => {
            try {
                UI.updateWordbookStatus('正在提取和词形还原...', true);
                const doc = nlp(text);
                const lemmas = doc.verbs().toInfinitive().out('array')
                    .concat(doc.nouns().toSingular().out('array'));
                const allTerms = doc.terms().out('array');
                const combinedWords = [...lemmas, ...allTerms]
                    .map(word => word.toLowerCase().trim())
                    .filter(word => /^[a-z]{3,}$/.test(word));
                const uniqueWords = Array.from(new Set(combinedWords)).sort();
                const wordsData = uniqueWords.map(word => ({
                    word: word,
                    isLearned: State.learnedWordsSet.has(word)
                }));
                UI.renderExtractedWords(wordsData);
                UI.updateWordbookStatus(`提取完成！共找到 ${uniqueWords.length} 个不重复单词。`, false);
            } catch (error) {
                console.error("提取单词时出错:", error);
                UI.updateWordbookStatus('处理出错，请检查文本或刷新页面重试。', false);
            } finally {
                isExtractingWords = false;
            }
        }, 50);
    }

    function handleCreateWordbook() {
        const name = wordbookNameInput.value.trim();
        if (!name) {
            alert('请输入单词本名称！');
            return;
        }
        const selectedCheckboxes = wordbookList.querySelectorAll('input[type="checkbox"]:checked');
        if (selectedCheckboxes.length === 0) {
            alert('请至少选择一个单词！');
            return;
        }
        const words = Array.from(selectedCheckboxes).map(cb => cb.dataset.word);
        State.addOrUpdateWordbook(name, words);
        UI.hideWordbookModal();
        alert(`单词本 "${name}" 创建成功！`);
        updateCategoryFilters();
        State.setCurrentFilter(name);
        setTimeout(() => {
            const newButton = filterContainer.querySelector(`.filter-btn[data-filter="${name}"]`);
            if (newButton) { UI.updateActiveFilterButton(filterContainer, newButton); }
            State.filterAndPrepareDataSet();
            startNewRenderFlow();
        }, 100);
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

    noVisualBtn.addEventListener('click', () => UI.toggleNoVisualMode(noVisualBtn));

    // --- “更多操作”菜单事件 ---
    moreOptionsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        optionsMenu.classList.toggle('is-open');
    });
    window.addEventListener('click', (e) => {
        if (optionsMenu.classList.contains('is-open') && !moreOptionsBtn.contains(e.target)) {
            optionsMenu.classList.remove('is-open');
        }
    });
    themeToggleMenuBtn.addEventListener('click', () => {
        const isDarkMode = document.body.classList.contains('dark-mode');
        applyTheme(isDarkMode ? 'light' : 'dark');
        optionsMenu.classList.remove('is-open');
    });
    importLearnedBtn.addEventListener('click', () => {
        importFileInput.click();
        optionsMenu.classList.remove('is-open');
    });
    exportLearnedBtn.addEventListener('click', () => {
        handleExport('learned');
        optionsMenu.classList.remove('is-open');
    });
    exportCurrentBtn.addEventListener('click', () => {
        handleExport('current');
        optionsMenu.classList.remove('is-open');
    });
    importFileInput.addEventListener('change', handleImport);

    // --- 听力模式事件 ---
    listeningBtn.addEventListener('click', startListeningSession);
    listeningCloseBtn.addEventListener('click', UI.hideListeningModal);
    listeningModal.addEventListener('click', (event) => { if (event.target === listeningModal) UI.hideListeningModal(); });
    listeningRevealBtn.addEventListener('click', UI.revealListeningAnswer);
    listeningNextBtn.addEventListener('click', playNextListeningItem);
    const handleReplay = () => playCurrentListeningAudio();
    listeningReplayBtn.addEventListener('click', handleReplay);
    listeningVisualArea.addEventListener('click', handleReplay);
    audioSourceToggle.addEventListener('change', handleReplay);

    // --- 打字模式事件 ---
    typingBtn.addEventListener('click', startTypingSession);
    typingCloseBtn.addEventListener('click', UI.hideTypingModal);
    typingModal.addEventListener('click', (event) => { if (event.target === typingModal) UI.hideTypingModal(); });
    typingReplayAudioBtn.addEventListener('click', playCurrentTypingAudio);
    typingSubmitBtn.addEventListener('click', handleTypingSubmit);
    typingNextBtn.addEventListener('click', handleNextTypingItem);
    typingHintBtn.addEventListener('click', handleTypingHint);
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

    // --- 单词本创建模态框事件 ---
    createWordbookBtn.addEventListener('click', () => {
        UI.showWordbookModal();
        optionsMenu.classList.remove('is-open');
    });
    wordbookCloseBtn.addEventListener('click', UI.hideWordbookModal);
    wordbookModal.addEventListener('click', (event) => { if (event.target === wordbookModal) UI.hideWordbookModal(); });
    wordbookExtractBtn.addEventListener('click', handleExtractWords);
    wordbookSelectAllBtn.addEventListener('click', () => {
        wordbookList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
        UI.updateCreateButtonState();
    });
    wordbookDeselectAllBtn.addEventListener('click', () => {
        wordbookList.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        UI.updateCreateButtonState();
    });
    wordbookList.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox') UI.updateCreateButtonState();
    });
    wordbookNameInput.addEventListener('input', UI.updateCreateButtonState);
    wordbookCreateBtn.addEventListener('click', handleCreateWordbook);


    // ============================================================================
    // 5. 应用初始化
    // ============================================================================
    async function init() {
        initializeTheme();
        try {
            State.loadLearnedWords();
            State.loadUserWordbooks();
            const { grades } = await State.loadAndProcessData(updateLoadingProgress);

            loadingFeedbackContainer.style.opacity = '0';
            skeletonLoader.style.opacity = '0';
            setTimeout(() => {
                loadingFeedbackContainer.remove();
                skeletonLoader.remove();
            }, 300);

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
            shuffleBtn.style.display = 'none';
        }
    }

    init();
});