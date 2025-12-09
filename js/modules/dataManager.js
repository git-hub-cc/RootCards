// =================================================================================
// 数据管理模块 (Data Management Module) - v1.2 (新增单词本导出功能)
// ---------------------------------------------------------------------------------
// 职责:
// 1. 封装数据的导入和导出功能（已掌握、当前视图、单个单词本）。
// 2. 提供一个统一的初始化入口来绑定相关UI事件。
// 3. 使用非阻塞的Toast通知提供操作反馈。
// =================================================================================

import * as State from '../state.js';
import * as NotificationManager from './notificationManager.js';

// --- 内部变量 ---
// 缓存DOM元素引用，避免在事件处理中重复查询
let elements = {};

/**
 * 触发一个 JSON 文件的下载。
 * @param {object} dataObject - 需要被序列化并下载的 JavaScript 对象或数组。
 * @param {string} filename - 下载文件的默认名称。
 */
function triggerJsonDownload(dataObject, filename) {
    try {
        // 使用 null, 2 参数美化输出的 JSON 格式，方便用户阅读
        const jsonString = JSON.stringify(dataObject, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click(); // 模拟点击以下载文件

        // 清理：从文档中移除临时元素并释放对象 URL
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('创建下载文件时出错:', error);
        NotificationManager.show({
            type: 'error',
            message: '创建下载文件时发生错误，请检查控制台。'
        });
    }
}

/**
 * 处理数据导出请求。
 * @param {'learned' | 'current'} type - 导出的数据类型。
 */
function handleExport(type) {
    let dataToExport;
    let filename;
    const timestamp = new Date().toISOString().slice(0, 10); // e.g., "2024-05-22"

    if (type === 'learned') {
        dataToExport = State.getLearnedWordsArray();
        filename = `rootcards-learned-words-${timestamp}.json`;
        if (dataToExport.length === 0) {
            NotificationManager.show({
                type: 'info',
                message: '您还没有标记任何单词为“已掌握”，无需导出。'
            });
            return;
        }
    } else if (type === 'current') {
        dataToExport = State.currentDataSet
            .filter(item => item.cardType === 'word')
            .map(item => item.word);
        filename = `rootcards-current-view-${timestamp}.json`;
        if (dataToExport.length === 0) {
            NotificationManager.show({
                type: 'info',
                message: '当前视图中没有单词可供导出。'
            });
            return;
        }
    } else {
        // 如果传入未知的类型，则静默失败
        return;
    }

    triggerJsonDownload(dataToExport, filename);
    elements.optionsMenu.classList.remove('is-open'); // 操作后关闭菜单
}

/**
 * 【新增】导出指定的单个单词本。
 * @param {string} wordbookName - 要导出的单词本的名称。
 */
export function exportWordbook(wordbookName) {
    if (!wordbookName) return;

    const wordbook = State.getWordbook(wordbookName);

    if (!wordbook || !wordbook.words || wordbook.words.length === 0) {
        NotificationManager.show({
            type: 'info',
            message: `单词本 "${wordbookName}" 为空或不存在，无法导出。`
        });
        return;
    }

    const timestamp = new Date().toISOString().slice(0, 10);
    // 移除文件名中的特殊字符，增强兼容性
    const safeName = wordbookName.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '_');
    const filename = `rootcards-wordbook-${safeName}-${timestamp}.json`;

    triggerJsonDownload(wordbook.words, filename);

    NotificationManager.show({
        type: 'success',
        message: `单词本 "${wordbookName}" 已开始导出。`
    });
}


/**
 * 处理文件导入事件。
 * @param {Event} event - input[type=file] 的 change 事件对象。
 * @param {function} onImported - 导入成功后的回调函数，用于刷新UI。
 */
function handleImport(event, onImported) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const importedData = JSON.parse(e.target.result);
            // 鲁棒性检查：确保导入的是一个字符串数组
            if (!Array.isArray(importedData) || !importedData.every(item => typeof item === 'string')) {
                throw new Error('文件格式不正确。请确保导入的是一个仅包含单词字符串的JSON数组。');
            }
            const newCount = State.importLearnedWords(importedData);

            // 调用回调函数通知 app.js 刷新卡片视图
            if (typeof onImported === 'function') {
                onImported();
            }

            NotificationManager.show({
                type: 'success',
                message: `导入成功！新增了 ${newCount} 个“已掌握”的单词。`
            });

        } catch (error) {
            console.error('导入失败:', error);
            NotificationManager.show({
                type: 'error',
                message: `导入失败！${error.message}`
            });
        } finally {
            // 无论成功与否，都重置 input 的值，以便用户可以再次选择同一个文件
            event.target.value = null;
        }
    };
    reader.onerror = () => {
        NotificationManager.show({
            type: 'error',
            message: '读取文件时发生错误，请重试。'
        });
        event.target.value = null;
    };
    reader.readAsText(file);
    elements.optionsMenu.classList.remove('is-open'); // 操作后关闭菜单
}

/**
 * 初始化数据管理模块。
 * @param {object} domElements - 包含所需 DOM 元素的对像。
 * @param {HTMLElement} domElements.importLearnedBtn - “导入已掌握”按钮。
 * @param {HTMLElement} domElements.exportLearnedBtn - “导出已掌握”按钮。
 * @param {HTMLElement} domElements.exportCurrentBtn - “导出当前视图”按钮。
 * @param {HTMLElement} domElements.importFileInput - 隐藏的文件输入框。
 * @param {HTMLElement} domElements.optionsMenu - “更多操作”下拉菜单。
 * @param {function} onImported - 导入成功后用于刷新UI的回调函数。
 */
export function init({
                         importLearnedBtn,
                         exportLearnedBtn,
                         exportCurrentBtn,
                         importFileInput,
                         optionsMenu
                     }, onImported) {
    // 鲁棒性检查
    if (!importLearnedBtn || !exportLearnedBtn || !exportCurrentBtn || !importFileInput || !optionsMenu) {
        console.error('DataManager 初始化失败: 缺少必要的DOM元素。');
        return;
    }
    // 缓存元素
    elements = { importFileInput, optionsMenu };

    // 绑定事件监听器
    importLearnedBtn.addEventListener('click', () => importFileInput.click());
    exportLearnedBtn.addEventListener('click', () => handleExport('learned'));
    exportCurrentBtn.addEventListener('click', () => handleExport('current'));
    importFileInput.addEventListener('change', (event) => handleImport(event, onImported));
}