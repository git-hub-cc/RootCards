// =================================================================================
// 单词本创建模块 (Wordbook Creation Module) - v1.0
// ---------------------------------------------------------------------------------
// 职责:
// 1. 管理“创建单词本”模态框的所有UI交互和状态。
// 2. 使用 compromise.js (nlp) 库从用户输入的文本中提取单词。
// 3. 处理单词本的创建和保存逻辑。
// =================================================================================

import * as State from '../state.js';

// --- 模块内部状态 ---
const state = {
    isExtracting: false // 防止重复点击提取按钮
};

// --- 模块内部DOM元素缓存 ---
const elements = {};

// --- 内部函数 ---

/**
 * 缓存所有与单词本创建相关的DOM元素。
 * @returns {boolean} - 如果所有元素都找到则返回 true，否则返回 false。
 */
function cacheElements() {
    if (elements.modal) return true;

    const modal = document.getElementById('wordbook-modal');
    if (!modal) {
        console.error('单词本模块初始化失败：未找到 #wordbook-modal 元素。');
        return false;
    }

    elements.modal = modal;
    elements.closeBtn = document.getElementById('wordbook-close-btn');
    elements.extractBtn = document.getElementById('wordbook-extract-btn');
    elements.textInput = document.getElementById('wordbook-text-input');
    elements.list = document.getElementById('wordbook-list');
    elements.nameInput = document.getElementById('wordbook-name-input');
    elements.createBtn = document.getElementById('wordbook-create-btn');
    elements.selectAllBtn = document.getElementById('wordbook-select-all-btn');
    elements.deselectAllBtn = document.getElementById('wordbook-deselect-all-btn');
    elements.extractStatus = document.getElementById('wordbook-extract-status');
    elements.wordCount = document.getElementById('wordbook-word-count');

    for (const key in elements) {
        if (!elements[key]) {
            console.error(`单词本模块初始化失败：未找到元素 ${key}`);
            return false;
        }
    }
    return true;
}

/**
 * 更新“创建并学习”按钮的启用/禁用状态。
 */
function updateCreateButtonState() {
    const selectedCount = elements.list.querySelectorAll('input[type="checkbox"]:checked').length;
    const hasName = elements.nameInput.value.trim().length > 0;
    elements.createBtn.disabled = !(selectedCount > 0 && hasName);
}

/**
 * 更新状态文本和提取按钮的UI，以反馈处理进度。
 * @param {string} text - 要显示的状态文本。
 * @param {boolean} isProcessing - 是否正在处理中。
 */
function updateStatusUI(text, isProcessing = false) {
    elements.extractStatus.textContent = text;
    elements.extractBtn.disabled = isProcessing;
    elements.textInput.disabled = isProcessing;

    if (isProcessing) {
        elements.extractBtn.innerHTML = '<svg class="spinner" viewBox="0 0 50 50" style="width:20px;height:20px;stroke:white;"><circle class="path" cx="25" cy="25" r="20" fill="none" stroke-width="5"></circle></svg> 处理中...';
    } else {
        // 恢复按钮的原始图标和文本
        elements.extractBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg> 提取单词';
    }
}

/**
 * 将提取出的单词渲染到列表中。
 * @param {{word: string, isLearned: boolean}[]} wordsData - 单词数据数组。
 */
function renderWordList(wordsData) {
    elements.list.innerHTML = ''; // 清空现有列表

    if (wordsData.length === 0) {
        elements.list.innerHTML = '<p class="wordbook-list-placeholder">未提取到有效单词</p>';
        elements.wordCount.textContent = '共 0 个单词';
        updateCreateButtonState();
        return;
    }

    const fragment = document.createDocumentFragment();
    wordsData.forEach(({ word, isLearned }) => {
        const item = document.createElement('div');
        item.className = 'wordbook-item';
        item.classList.toggle('is-learned', isLearned);

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `wb-word-${word}`;
        checkbox.dataset.word = word;
        checkbox.checked = true; // 默认全选

        const label = document.createElement('label');
        label.setAttribute('for', `wb-word-${word}`);
        label.textContent = word;

        item.appendChild(checkbox);
        item.appendChild(label);
        fragment.appendChild(item);
    });

    elements.list.appendChild(fragment);
    elements.wordCount.textContent = `共 ${wordsData.length} 个单词`;
    updateCreateButtonState();
}

/**
 * 从文本输入框中提取单词。
 */
async function handleExtract() {
    if (state.isExtracting) return;
    state.isExtracting = true;
    updateStatusUI('正在准备环境...', true);

    const text = elements.textInput.value;
    if (!text.trim()) {
        updateStatusUI('请输入文本内容。', false);
        state.isExtracting = false;
        return;
    }

    // 使用 setTimeout 延迟处理，让UI有机会更新（显示加载状态）
    setTimeout(() => {
        try {
            updateStatusUI('正在提取和词形还原...', true);
            const doc = nlp(text);
            // 提取动词和名词的原形
            const lemmas = doc.verbs().toInfinitive().out('array')
                .concat(doc.nouns().toSingular().out('array'));
            // 提取所有词项
            const allTerms = doc.terms().out('array');

            // 合并、清洗和去重
            const combinedWords = [...lemmas, ...allTerms]
                .map(word => word.toLowerCase().trim())
                .filter(word => /^[a-z]{3,}$/.test(word)); // 只保留3个字母以上的纯英文单词
            const uniqueWords = Array.from(new Set(combinedWords)).sort();

            // 准备渲染数据，标记出已掌握的单词
            const wordsData = uniqueWords.map(word => ({
                word: word,
                isLearned: State.learnedWordsSet.has(word)
            }));

            renderWordList(wordsData);
            updateStatusUI(`提取完成！共找到 ${uniqueWords.length} 个不重复单词。`, false);
        } catch (error) {
            console.error("提取单词时出错:", error);
            updateStatusUI('处理出错，请检查文本或刷新页面重试。', false);
        } finally {
            state.isExtracting = false;
        }
    }, 50);
}

/**
 * 处理创建单词本的逻辑。
 * @param {function} onCreated - 单词本创建成功后的回调函数。
 */
function handleCreate(onCreated) {
    const name = elements.nameInput.value.trim();
    if (!name) {
        alert('请输入单词本名称！');
        return;
    }

    const selectedCheckboxes = elements.list.querySelectorAll('input[type="checkbox"]:checked');
    if (selectedCheckboxes.length === 0) {
        alert('请至少选择一个单词！');
        return;
    }

    const words = Array.from(selectedCheckboxes).map(cb => cb.dataset.word);
    State.addOrUpdateWordbook(name, words);

    hideModal();
    alert(`单词本 "${name}" 创建成功！`);

    if (typeof onCreated === 'function') {
        onCreated(name); // 将新创建的单词本名称传递给回调
    }
}

/**
 * 重置模态框到初始状态。
 */
function resetModal() {
    elements.textInput.value = '';
    elements.nameInput.value = '';
    elements.extractStatus.textContent = '';
    elements.wordCount.textContent = '';
    elements.list.innerHTML = '<p class="wordbook-list-placeholder">提取后，单词将显示在这里</p>';
    updateCreateButtonState();
}

function showModal() {
    elements.modal.classList.remove('is-hidden');
    document.addEventListener('keydown', handleEscKey);
}

function hideModal() {
    elements.modal.classList.add('is-hidden');
    resetModal();
    document.removeEventListener('keydown', handleEscKey);
}

function handleEscKey(event) {
    if (event.key === 'Escape') {
        hideModal();
    }
}

/**
 * 初始化单词本模块。
 * @param {HTMLElement} startBtn - 启动单词本创建模态框的按钮。
 * @param {HTMLElement} optionsMenu - “更多操作”下拉菜单，操作后需关闭。
 * @param {function} onCreated - 单词本创建成功后的回调，用于刷新UI。
 */
export function init(startBtn, optionsMenu, onCreated) {
    // 检查 compromise.js 是否已加载
    if (typeof nlp === 'undefined') {
        console.error('单词本模块初始化失败：compromise.js (nlp) 库未加载。');
        startBtn.disabled = true;
        startBtn.title = "单词本功能加载失败";
        return;
    }

    if (!startBtn || !optionsMenu) {
        console.error('单词本模块初始化失败：未提供启动按钮或菜单元素。');
        return;
    }

    if (!cacheElements()) {
        startBtn.disabled = true;
        startBtn.title = "单词本功能加载失败，请检查页面HTML结构";
        return;
    }

    // --- 绑定事件监听器 ---
    startBtn.addEventListener('click', () => {
        showModal();
        optionsMenu.classList.remove('is-open'); // 关闭“更多操作”菜单
    });

    elements.closeBtn.addEventListener('click', hideModal);
    elements.modal.addEventListener('click', (event) => {
        if (event.target === elements.modal) hideModal();
    });
    elements.extractBtn.addEventListener('click', handleExtract);
    elements.createBtn.addEventListener('click', () => handleCreate(onCreated));

    elements.selectAllBtn.addEventListener('click', () => {
        elements.list.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
        updateCreateButtonState();
    });

    elements.deselectAllBtn.addEventListener('click', () => {
        elements.list.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        updateCreateButtonState();
    });

    // 监听列表和名称输入框的变化，实时更新创建按钮状态
    elements.list.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox') updateCreateButtonState();
    });
    elements.nameInput.addEventListener('input', updateCreateButtonState);
}