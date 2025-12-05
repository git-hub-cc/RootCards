// =================================================================================
// 单词本管理模块 (Wordbook Management Module) - v2.7 (新增移除已掌握功能)
// ---------------------------------------------------------------------------------
// 职责:
// 1. 管理“管理单词本”模态框的所有UI交互和视图切换。
// 2. 实现单词本的 CRUD 逻辑，删除操作支持撤销。
// 3. 使用 compromise.js (nlp) 库提取单词。
// 4. 【新增】支持从当前单词列表中一键移除所有已掌握的单词。
// =================================================================================

import * as State from '../state.js';
import * as UndoManager from './undoManager.js';
import * as NotificationManager from './notificationManager.js';

// --- 模块内部状态 ---
const state = {
    currentView: 'list',       // 当前视图 ('list' 或 'editor')
    editorMode: 'create',      // 编辑器模式 ('create' 或 'edit')
    editingId: null,           // 正在编辑的单词本的名称 (旧名称)
    isExtracting: false,       // 是否正在提取单词的标志位
    wordsList: []              // 编辑器中当前处理的单词列表
};

// --- 模块内部DOM元素缓存 ---
const elements = {};

/**
 * 缓存所有相关的DOM元素，避免重复查询，提高性能和鲁棒性。
 * @returns {boolean} - 如果所有元素都成功找到，则返回 true，否则返回 false。
 */
function cacheElements() {
    // 如果已经缓存过，则直接返回 true
    if (elements.modal) return true;

    const modal = document.getElementById('wordbook-modal');
    if (!modal) {
        console.error("单词本模块初始化失败：未找到 #wordbook-modal 元素。");
        return false;
    }

    // 缓存所有需要的DOM元素引用
    elements.modal = modal;
    elements.viewList = document.getElementById('wordbook-view-list');
    elements.viewEditor = document.getElementById('wordbook-view-editor');
    elements.closeBtn = document.getElementById('wordbook-close-btn');
    elements.newBtn = document.getElementById('wordbook-new-btn');
    elements.listContainer = document.getElementById('wordbook-list-container');
    elements.backBtn = document.getElementById('wordbook-back-btn');
    elements.editorTitle = document.getElementById('wordbook-editor-title');
    elements.nameInput = document.getElementById('wordbook-name-input');
    elements.textInput = document.getElementById('wordbook-text-input');
    elements.extractBtn = document.getElementById('wordbook-extract-btn');
    elements.extractStatus = document.getElementById('wordbook-extract-status');
    elements.wordsListContainer = document.getElementById('wordbook-words-list');
    elements.wordCount = document.getElementById('wordbook-word-count');
    elements.saveBtn = document.getElementById('wordbook-save-btn');
    elements.selectAllBtn = document.getElementById('wordbook-select-all-btn');
    elements.deselectAllBtn = document.getElementById('wordbook-deselect-all-btn');
    // 【新增】缓存“移除已掌握”按钮
    elements.removeLearnedBtn = document.getElementById('wordbook-remove-learned-btn');


    // 鲁棒性检查：确保所有元素都已找到
    for (const key in elements) {
        if (!elements[key]) {
            console.error(`单词本模块初始化失败：未找到元素 ${key}`);
            return false;
        }
    }
    return true;
}

// =================================================================================
// 通用逻辑函数 (Utility Functions)
// =================================================================================

/**
 * 使用 compromise.js 从文本中提取标准化的单词。
 * @param {string} text - 用户输入的英文文本。
 * @returns {string[]} - 提取、去重、过滤并排序后的单词数组。
 */
function extractWordsFromText(text) {
    // 鲁棒性检查：如果文本为空或 nlp 库未加载，则返回空数组
    if (!text.trim() || typeof nlp === 'undefined') {
        return [];
    }

    try {
        // 去除非单词字符
        const cleanedText = text.replace(/[^A-Za-z0-9\s.,!?'"():;\-]/g, ' ');

        // 使用清洗后的文本进行NLP分析
        const doc = nlp(cleanedText);

        // 1. 获取包含所有标准化单词的、由空格连接的字符串。
        const normalizedString = doc.terms().out('normal');

        // 2. 将这个字符串按空格分割，得到一个真正的单词数组。
        const wordsArray = normalizedString.split(' ');

        // 3. 使用 Set 数据结构对单词数组进行去重。
        // 4. 应用过滤器，只保留长度大于等于3个字母的纯小写单词。
        // 5. 对最终结果进行字母排序。
        return [...new Set(wordsArray)]
            .filter(w => w && /^[a-z]{3,}$/.test(w)) // 增加 w 存在性检查，更具鲁棒性
            .sort();

    } catch (e) {
        console.error("NLP 提取单词时发生错误:", e);
        NotificationManager.show({ type: 'error', message: '提取单词失败，请检查控制台。' });
        return [];
    }
}

/**
 * 切换单词本管理的视图（列表视图和编辑视图）。
 * @param {'list' | 'editor'} viewName - 要切换到的视图名称。
 */
function switchView(viewName) {
    state.currentView = viewName;
    if (viewName === 'list') {
        elements.viewList.classList.remove('is-hidden');
        elements.viewEditor.classList.add('is-hidden');
        renderWordbookList(); // 每次返回列表时重新渲染，确保数据最新
    } else {
        elements.viewList.classList.add('is-hidden');
        elements.viewEditor.classList.remove('is-hidden');
    }
}

// =================================================================================
// 列表视图 (Dashboard) 逻辑
// =================================================================================

/**
 * 渲染单词本列表。
 */
function renderWordbookList() {
    elements.listContainer.innerHTML = '';
    const wordbooks = State.userWordbooks;

    // 如果没有单词本，则显示提示信息
    if (wordbooks.length === 0) {
        elements.listContainer.innerHTML = '<p class="wordbook-empty-hint">暂无单词本，点击左上方“+”开始创建。</p>';
        return;
    }

    const fragment = document.createDocumentFragment();
    wordbooks.forEach(wb => {
        const row = document.createElement('div');
        row.className = 'wordbook-item-row';
        row.dataset.wordbookName = wb.name;

        // 如果当前正在学习这个单词本，则高亮显示
        if (State.currentFilter === wb.name) {
            row.classList.add('active-studying');
        }

        row.innerHTML = `
            <div class="wb-info">
                <span class="wb-name">${wb.name}</span>
                <span class="wb-count">${wb.words.length} words</span>
            </div>
            <div class="wb-actions">
                <button class="wb-icon-btn btn-play" title="开始学习" data-action="study" data-name="${wb.name}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                </button>
                <button class="wb-icon-btn" title="编辑" data-action="edit" data-name="${wb.name}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="wb-icon-btn btn-delete" title="删除" data-action="delete" data-name="${wb.name}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        `;
        fragment.appendChild(row);
    });
    elements.listContainer.appendChild(fragment);
}

// =================================================================================
// 编辑器视图 (Editor) 逻辑
// =================================================================================

/**
 * 渲染编辑器中的单词标签列表。
 */
function renderEditorWords() {
    elements.wordsListContainer.innerHTML = '';
    const fragment = document.createDocumentFragment();

    state.wordsList.forEach((item) => {
        const tag = document.createElement('div');
        tag.className = 'wordbook-tag-item';
        if (item.isSelected) tag.classList.add('is-selected');

        tag.innerHTML = `
            <input type="checkbox" ${item.isSelected ? 'checked' : ''} style="display: none;">
            <span>${item.word}</span>
        `;

        // 为整个标签添加点击事件，以切换选中状态
        tag.addEventListener('click', () => {
            item.isSelected = !item.isSelected;
            tag.classList.toggle('is-selected', item.isSelected);
            updateSaveButtonState();
        });
        fragment.appendChild(tag);
    });

    elements.wordsListContainer.appendChild(fragment);
    elements.wordCount.textContent = state.wordsList.length;
    updateSaveButtonState();
}

/**
 * 根据当前状态（名称是否为空、是否有单词被选中）更新保存按钮的可用性。
 */
function updateSaveButtonState() {
    const hasName = elements.nameInput.value.trim().length > 0;
    const hasSelection = state.wordsList.some(item => item.isSelected);
    elements.saveBtn.disabled = !(hasName && hasSelection);
}

/**
 * 初始化编辑器以进入“创建新单词本”模式。
 */
function initCreateMode() {
    state.editorMode = 'create';
    state.editingId = null;
    state.wordsList = [];
    elements.editorTitle.textContent = '新建单词本';
    elements.nameInput.value = '';
    elements.textInput.value = '';
    elements.extractStatus.textContent = '';
    elements.saveBtn.textContent = '创建';
    renderEditorWords();
    switchView('editor');
}

/**
 * 初始化编辑器以进入“编辑现有单词本”模式。
 * @param {string} name - 要编辑的单词本的名称。
 */
function initEditMode(name) {
    const wb = State.getWordbook(name);
    if (!wb) return; // 鲁棒性检查

    state.editorMode = 'edit';
    state.editingId = name;
    // 将单词列表转换为编辑器所需的对象格式
    state.wordsList = wb.words.map(w => ({ word: w, isSelected: true }));
    elements.editorTitle.textContent = '编辑单词本';
    elements.nameInput.value = wb.name;
    elements.textInput.value = '';
    elements.extractStatus.textContent = '';
    elements.saveBtn.textContent = '保存修改';
    renderEditorWords();
    switchView('editor');
}

/**
 * 处理“提取并追加”按钮的点击事件。
 */
function handleExtract() {
    if (state.isExtracting) return;
    const text = elements.textInput.value;
    if (!text.trim()) {
        elements.extractStatus.textContent = '请先输入或粘贴文本';
        return;
    }
    state.isExtracting = true;
    elements.extractBtn.disabled = true;
    elements.extractBtn.textContent = '处理中...';

    // 使用 setTimeout 异步处理，避免UI阻塞
    setTimeout(() => {
        const newWords = extractWordsFromText(text);
        const existingSet = new Set(state.wordsList.map(item => item.word));
        let addedCount = 0;
        newWords.forEach(w => {
            if (!existingSet.has(w)) {
                state.wordsList.push({ word: w, isSelected: true });
                addedCount++;
            }
        });
        renderEditorWords();
        elements.extractStatus.textContent = `成功追加 ${addedCount} 个新单词`;
        elements.textInput.value = '';
        elements.extractBtn.disabled = false;
        elements.extractBtn.textContent = '提取并追加';
        state.isExtracting = false;
    }, 50); // 短延迟足以让UI更新
}

/**
 * 处理保存（创建或更新）操作。
 * @param {function} onDataChange - 数据变更后需要执行的回调函数 (在 app.js 中定义)。
 */
function handleSave(onDataChange) {
    const newName = elements.nameInput.value.trim();
    const finalWords = state.wordsList
        .filter(item => item.isSelected)
        .map(item => item.word);

    try {
        if (state.editorMode === 'create') {
            State.addOrUpdateWordbook(null, newName, finalWords);
            if (onDataChange) onDataChange('create', newName);
            NotificationManager.show({ type: 'success', message: `单词本 "${newName}" 已创建。` });
        } else {
            State.addOrUpdateWordbook(state.editingId, newName, finalWords);
            if (onDataChange) onDataChange('update', newName, state.editingId);
            NotificationManager.show({ type: 'success', message: `单词本 "${newName}" 已更新。` });
        }
        switchView('list');
    } catch (e) {
        // 如果 addOrUpdateWordbook 抛出错误（例如名称重复），则显示通知
        NotificationManager.show({ type: 'error', message: e.message });
    }
}

// =================================================================================
// 交互事件绑定与初始化
// =================================================================================

/**
 * 初始化单词本管理模块。
 * @param {HTMLElement} startBtn - 启动此模块的按钮。
 * @param {HTMLElement} optionsMenu - “更多操作”的下拉菜单元素，用于在启动时关闭。
 * @param {function} onDataChange - 当单词本数据发生变化时，通知 app.js 的回调函数。
 */
export function init(startBtn, optionsMenu, onDataChange) {
    // 鲁棒性检查：如果 compromise.js 未加载，则禁用此功能
    if (typeof nlp === 'undefined') {
        console.error('单词本模块初始化失败: compromise.js (nlp) 库缺失。');
        startBtn.disabled = true;
        startBtn.title = "单词提取功能加载失败";
        return;
    }
    if (!cacheElements()) return;

    // "管理单词本" 按钮点击事件
    startBtn.addEventListener('click', () => {
        optionsMenu.classList.remove('is-open'); // 关闭“更多”菜单
        switchView('list');
        elements.modal.classList.remove('is-hidden');
    });

    // 关闭模态框的逻辑
    const closeModal = () => elements.modal.classList.add('is-hidden');
    elements.closeBtn.addEventListener('click', closeModal);
    elements.modal.addEventListener('click', (e) => {
        if (e.target === elements.modal) closeModal(); // 点击遮罩层关闭
    });

    // “新建单词本” 按钮
    elements.newBtn.addEventListener('click', initCreateMode);

    // 列表容器的事件委托，处理“学习”、“编辑”、“删除”
    elements.listContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const action = btn.dataset.action;
        const name = btn.dataset.name;

        if (action === 'edit') {
            initEditMode(name);
        } else if (action === 'delete') {
            const rowElement = elements.listContainer.querySelector(`.wordbook-item-row[data-wordbook-name="${name}"]`);
            if (!rowElement) return;

            // 乐观UI：立即在界面上隐藏该项
            rowElement.classList.add('is-pending-removal');

            const onConfirm = () => {
                // 5秒后执行真实删除
                State.deleteWordbook(name);
                rowElement.remove();
                if (onDataChange) onDataChange('delete', null, name);
            };
            const onUndo = () => {
                // 撤销操作：恢复UI
                rowElement.classList.remove('is-pending-removal');
            };

            // 显示撤销通知
            UndoManager.show({
                message: `单词本 "${name}" 已删除。`,
                onConfirm: onConfirm,
                onUndo: onUndo,
            });

        } else if (action === 'study') {
            if (onDataChange) onDataChange('study', name);
            closeModal();
        }
    });

    // 编辑器内部事件绑定
    elements.backBtn.addEventListener('click', () => switchView('list'));
    elements.extractBtn.addEventListener('click', handleExtract);
    elements.saveBtn.addEventListener('click', () => handleSave(onDataChange));
    elements.nameInput.addEventListener('input', updateSaveButtonState);
    elements.selectAllBtn.addEventListener('click', () => {
        state.wordsList.forEach(i => i.isSelected = true);
        renderEditorWords();
    });
    elements.deselectAllBtn.addEventListener('click', () => {
        state.wordsList.forEach(i => i.isSelected = false);
        renderEditorWords();
    });

    // 【新增】为“移除已掌握”按钮绑定事件
    elements.removeLearnedBtn.addEventListener('click', () => {
        // 鲁棒性检查，确保 state.wordsList 是一个数组
        if (!Array.isArray(state.wordsList)) return;

        const initialCount = state.wordsList.length;
        if (initialCount === 0) {
            NotificationManager.show({ type: 'info', message: '当前列表为空，无需操作。' });
            return;
        }

        // 核心过滤逻辑：只保留那些不在 "learnedWordsSet" 中的单词
        state.wordsList = state.wordsList.filter(item =>
            !State.learnedWordsSet.has(item.word.toLowerCase())
        );

        const removedCount = initialCount - state.wordsList.length;

        // 根据操作结果提供反馈
        if (removedCount > 0) {
            NotificationManager.show({
                type: 'success',
                message: `成功移除 ${removedCount} 个已掌握的单词。`
            });
            // 只有在确实移除了单词时才需要重新渲染UI
            renderEditorWords();
        } else {
            NotificationManager.show({
                type: 'info',
                message: '列表中没有已掌握的单词可供移除。'
            });
        }
    });
}