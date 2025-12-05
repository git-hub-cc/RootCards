// =================================================================================
// 单词本管理模块 (Wordbook Management Module) - v3.0 (Web Worker 集成)
// ---------------------------------------------------------------------------------
// 职责:
// 1. 管理“管理单词本”模态框的所有UI交互和视图切换。
// 2. 实现单词本的 CRUD 逻辑，删除操作支持撤销。
// 3. 【升级】使用 Web Worker 异步处理 NLP 单词提取，防止 UI 卡顿。
// 4. 支持从当前单词列表中一键移除所有已掌握的单词。
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
    if (elements.modal) return true;

    const modal = document.getElementById('wordbook-modal');
    if (!modal) {
        console.error("单词本模块初始化失败：未找到 #wordbook-modal 元素。");
        return false;
    }

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
    elements.removeLearnedBtn = document.getElementById('wordbook-remove-learned-btn');

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

/**
 * 切换单词本管理的视图（列表视图和编辑视图）。
 * @param {'list' | 'editor'} viewName - 要切换到的视图名称。
 */
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
        elements.listContainer.innerHTML = '<p class="wordbook-empty-hint">暂无单词本，点击左上方“+”开始创建。</p>';
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

    state.wordsList.forEach((item) => {
        const tag = document.createElement('div');
        tag.className = 'wordbook-tag-item';
        if (item.isSelected) tag.classList.add('is-selected');

        tag.innerHTML = `
            <input type="checkbox" ${item.isSelected ? 'checked' : ''} style="display: none;">
            <span>${item.word}</span>
        `;

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
    elements.extractStatus.textContent = '';
    elements.saveBtn.textContent = '创建';
    renderEditorWords();
    switchView('editor');
}

function initEditMode(name) {
    const wb = State.getWordbook(name);
    if (!wb) return;

    state.editorMode = 'edit';
    state.editingId = name;
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
 * 【核心修改】使用 Web Worker 处理文本提取，避免阻塞主线程。
 */
function handleExtract() {
    if (state.isExtracting) return;

    const text = elements.textInput.value;
    if (!text.trim()) {
        elements.extractStatus.textContent = '请先输入或粘贴文本';
        return;
    }

    // 1. 设置 UI 为加载状态
    state.isExtracting = true;
    elements.extractBtn.disabled = true;
    elements.extractBtn.innerHTML = '<span class="spinner" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:5px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:rotate 1s linear infinite;"></span> 处理中...';
    elements.extractStatus.textContent = '正在后台解析...';

    // 2. 实例化 Worker
    let nlpWorker = null;
    try {
        nlpWorker = new Worker('js/workers/nlpWorker.js');
    } catch (e) {
        console.error("Worker 初始化失败:", e);
        finalizeExtraction(false, '浏览器不支持 Web Worker');
        return;
    }

    // 3. 配置 Worker 监听器
    nlpWorker.onmessage = function(e) {
        const { type, words, message } = e.data;

        if (type === 'EXTRACT_RESULT') {
            // 合并新单词，自动去重
            const existingSet = new Set(state.wordsList.map(item => item.word));
            let addedCount = 0;

            words.forEach(w => {
                if (!existingSet.has(w)) {
                    state.wordsList.push({ word: w, isSelected: true });
                    addedCount++;
                }
            });

            // 成功回调
            renderEditorWords();
            finalizeExtraction(true, `成功追加 ${addedCount} 个新单词`);
        } else if (type === 'ERROR') {
            // 错误回调
            finalizeExtraction(false, message);
        }

        // 任务完成，销毁 Worker 释放资源
        nlpWorker.terminate();
    };

    nlpWorker.onerror = function(e) {
        console.error("Worker 内部错误:", e);
        finalizeExtraction(false, '解析服务发生未知错误');
        nlpWorker.terminate();
    };

    // 4. 发送数据
    nlpWorker.postMessage({ type: 'EXTRACT', text: text });
}

/**
 * 提取结束后的清理工作（恢复UI状态）。
 */
function finalizeExtraction(isSuccess, message) {
    state.isExtracting = false;
    elements.extractBtn.disabled = false;
    elements.extractBtn.textContent = '提取并追加';

    elements.extractStatus.textContent = message;
    elements.extractStatus.style.color = isSuccess ? 'var(--text-sub)' : '#ef4444';

    if (isSuccess) {
        elements.textInput.value = ''; // 清空输入框
    } else {
        NotificationManager.show({ type: 'error', message: message });
    }
}

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
        NotificationManager.show({ type: 'error', message: e.message });
    }
}

// =================================================================================
// 交互事件绑定与初始化
// =================================================================================

export function init(startBtn, optionsMenu, onDataChange) {
    // 鲁棒性检查：检查浏览器是否支持 Web Worker
    if (!window.Worker) {
        console.warn('当前浏览器不支持 Web Worker，单词提取功能将不可用。');
        startBtn.disabled = true;
        startBtn.title = "浏览器不支持 Web Worker";
        return;
    }

    if (!cacheElements()) return;

    startBtn.addEventListener('click', () => {
        optionsMenu.classList.remove('is-open');
        switchView('list');
        elements.modal.classList.remove('is-hidden');
    });

    const closeModal = () => elements.modal.classList.add('is-hidden');
    elements.closeBtn.addEventListener('click', closeModal);
    elements.modal.addEventListener('click', (e) => {
        if (e.target === elements.modal) closeModal();
    });

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

            rowElement.classList.add('is-pending-removal');

            const onConfirm = () => {
                State.deleteWordbook(name);
                rowElement.remove();
                if (onDataChange) onDataChange('delete', null, name);
            };
            const onUndo = () => {
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

    elements.removeLearnedBtn.addEventListener('click', () => {
        if (!Array.isArray(state.wordsList)) return;

        const initialCount = state.wordsList.length;
        if (initialCount === 0) {
            NotificationManager.show({ type: 'info', message: '当前列表为空，无需操作。' });
            return;
        }

        state.wordsList = state.wordsList.filter(item =>
            !State.learnedWordsSet.has(item.word.toLowerCase())
        );

        const removedCount = initialCount - state.wordsList.length;

        if (removedCount > 0) {
            NotificationManager.show({
                type: 'success',
                message: `成功移除 ${removedCount} 个已掌握的单词。`
            });
            renderEditorWords();
        } else {
            NotificationManager.show({
                type: 'info',
                message: '列表中没有已掌握的单词可供移除。'
            });
        }
    });
}