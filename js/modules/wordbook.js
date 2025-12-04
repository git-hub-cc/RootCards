// =================================================================================
// 单词本管理模块 (Wordbook Management Module) - v2.3 (支持左上角关闭按钮)
// ---------------------------------------------------------------------------------
// 职责:
// 1. 管理“管理单词本”模态框的所有UI交互和视图切换。
// 2. 实现单词本的 CRUD 逻辑，删除操作支持撤销。
// 3. 使用 compromise.js (nlp) 库提取单词。
// =================================================================================

import * as State from '../state.js';
import * as UndoManager from './undoManager.js';
import * as NotificationManager from './notificationManager.js';

// --- 模块内部状态 ---
const state = {
    currentView: 'list',
    editorMode: 'create',
    editingId: null,
    isExtracting: false,
    wordsList: []
};

// --- 模块内部DOM元素缓存 ---
const elements = {};

/**
 * 缓存所有相关的DOM元素。
 * @returns {boolean} - 成功返回 true。
 */
function cacheElements() {
    if (elements.modal) return true;

    const modal = document.getElementById('wordbook-modal');
    if (!modal) return false;

    elements.modal = modal;
    elements.viewList = document.getElementById('wordbook-view-list');
    elements.viewEditor = document.getElementById('wordbook-view-editor');
    // 【修改】新增：左上角的关闭按钮引用
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

    for (const key in elements) {
        if (!elements[key]) {
            console.error(`单词本模块初始化失败：未找到元素 ${key}`);
            return false;
        }
    }
    return true;
}

// =================================================================================
// 通用逻辑函数
// =================================================================================

function extractWordsFromText(text) {
    if (!text.trim() || typeof nlp === 'undefined') return [];
    try {
        const doc = nlp(text);
        const lemmas = doc.verbs().toInfinitive().out('array')
            .concat(doc.nouns().toSingular().out('array'));
        const allTerms = doc.terms().out('array');

        return [...new Set([...lemmas, ...allTerms])]
            .map(w => w.toLowerCase().trim())
            .filter(w => /^[a-z]{3,}$/.test(w))
            .sort();
    } catch (e) {
        console.error("NLP 提取失败:", e);
        return [];
    }
}

function switchView(viewName) {
    state.currentView = viewName;
    if (viewName === 'list') {
        elements.viewList.classList.remove('is-hidden');
        elements.viewEditor.classList.add('is-hidden');
        renderWordbookList();
    } else {
        elements.viewList.classList.add('is-hidden');
        elements.viewEditor.classList.remove('is-hidden');
    }
}

// =================================================================================
// 列表视图 (Dashboard) 逻辑
// =================================================================================

function renderWordbookList() {
    elements.listContainer.innerHTML = '';
    const wordbooks = State.userWordbooks;

    if (wordbooks.length === 0) {
        elements.listContainer.innerHTML = '<p class="wordbook-empty-hint">暂无单词本，点击右上方“新建”开始创建。</p>';
        return;
    }

    const fragment = document.createDocumentFragment();
    wordbooks.forEach(wb => {
        const row = document.createElement('div');
        row.className = 'wordbook-item-row';
        row.dataset.wordbookName = wb.name;

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
function renderEditorWords() {
    elements.wordsListContainer.innerHTML = '';
    const fragment = document.createDocumentFragment();

    state.wordsList.forEach((item, index) => {
        const tag = document.createElement('div');
        tag.className = 'wordbook-tag-item';
        if (item.isSelected) tag.classList.add('is-selected');

        tag.innerHTML = `
            <input type="checkbox" ${item.isSelected ? 'checked' : ''}>
            <span>${item.word}</span>
        `;
        tag.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT') {
                item.isSelected = !item.isSelected;
                tag.classList.toggle('is-selected', item.isSelected);
                tag.querySelector('input').checked = item.isSelected;
                updateSaveButtonState();
            }
        });
        tag.querySelector('input').addEventListener('change', (e) => {
            item.isSelected = e.target.checked;
            tag.classList.toggle('is-selected', item.isSelected);
            updateSaveButtonState();
        });
        fragment.appendChild(tag);
    });

    elements.wordsListContainer.appendChild(fragment);
    elements.wordCount.textContent = state.wordsList.length;
    updateSaveButtonState();
}
function updateSaveButtonState() {
    const hasName = elements.nameInput.value.trim().length > 0;
    const hasSelection = state.wordsList.some(item => item.isSelected);
    elements.saveBtn.disabled = !(hasName && hasSelection);
}
function initCreateMode() {
    state.editorMode = 'create';
    state.editingId = null;
    state.wordsList = [];
    elements.editorTitle.textContent = '新建单词本';
    elements.nameInput.value = '';
    elements.textInput.value = '';
    elements.saveBtn.textContent = '创建';
    renderEditorWords();
    switchView('editor');
}
function initEditMode(name) {
    const wb = State.getWordbook(name);
    if (!wb) return;
    state.editorMode = 'edit';
    state.editingId = name;
    state.wordsList = wb.words.map(w => ({
        word: w,
        isLearned: State.learnedWordsSet.has(w),
        isSelected: true
    }));
    elements.editorTitle.textContent = '编辑单词本';
    elements.nameInput.value = wb.name;
    elements.textInput.value = '';
    elements.saveBtn.textContent = '保存修改';
    renderEditorWords();
    switchView('editor');
}
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
    setTimeout(() => {
        const newWords = extractWordsFromText(text);
        const existingSet = new Set(state.wordsList.map(item => item.word));
        let addedCount = 0;
        newWords.forEach(w => {
            if (!existingSet.has(w)) {
                state.wordsList.push({
                    word: w,
                    isLearned: State.learnedWordsSet.has(w),
                    isSelected: true
                });
                addedCount++;
            }
        });
        renderEditorWords();
        elements.extractStatus.textContent = `成功追加 ${addedCount} 个新单词`;
        elements.textInput.value = '';
        elements.extractBtn.disabled = false;
        elements.extractBtn.textContent = '提取并追加';
        state.isExtracting = false;
    }, 50);
}
/**
 * 处理保存操作。
 * @param {function} onDataChange - 数据变更后的回调函数。
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
        } else {
            State.addOrUpdateWordbook(state.editingId, newName, finalWords);
            if (onDataChange) onDataChange('update', newName, state.editingId);
        }
        switchView('list');
    } catch (e) {
        NotificationManager.show({ type: 'error', message: e.message });
    }
}

// =================================================================================
// 交互事件绑定与初始化
// =================================================================================
export function init(startBtn, optionsMenu, onDataChange) {
    if (typeof nlp === 'undefined') {
        console.error('Wordbook Init Failed: compromise.js missing.');
        startBtn.disabled = true;
        return;
    }
    if (!cacheElements()) return;

    startBtn.addEventListener('click', () => {
        optionsMenu.classList.remove('is-open');
        switchView('list');
        elements.modal.classList.remove('is-hidden');
    });

    const closeModal = () => elements.modal.classList.add('is-hidden');
    elements.modal.addEventListener('click', (e) => {
        if (e.target === elements.modal) closeModal();
    });

    // 【修改】绑定左上角关闭按钮的点击事件
    elements.closeBtn.addEventListener('click', closeModal);

    elements.newBtn.addEventListener('click', initCreateMode);

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

            // 【核心优化】乐观 UI：立即隐藏列表项
            rowElement.classList.add('is-pending-removal');

            const onConfirm = () => {
                // 5秒后执行“真实删除”
                State.deleteWordbook(name);
                rowElement.remove(); // 从 DOM 中彻底移除
                if (onDataChange) onDataChange('delete', null, name);
            };

            const onUndo = () => {
                // 撤销操作：恢复 UI
                rowElement.classList.remove('is-pending-removal');
            };

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
}