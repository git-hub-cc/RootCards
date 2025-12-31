// =================================================================================
// 全局撤销管理器 (Global Undo Manager) - v1.2 (支持快速连续操作)
// ---------------------------------------------------------------------------------
// 职责:
// 1. 提供一个全局的、单例的“撤销”操作通知UI (Toast)。
// 2. 管理倒计时，并在时间结束后执行确认操作 (Commit)。
// 3. 处理“快速连续操作”场景：当新操作到来时，立即结算上一个操作，避免状态丢失。
// =================================================================================

import * as UI from '../ui.js';

// --- 模块内部状态 ---
const state = {
    timeoutId: null,         // 用于存储 setTimeout 的 ID
    onConfirmCallback: null, // 倒计时自然结束（或被新操作顶掉）时执行的“确认”逻辑
    onUndoCallback: null,    // 用户点击“撤销”按钮时执行的“回滚”逻辑
};

// --- 模块内部DOM元素缓存 ---
const elements = {};

/**
 * 缓存所有相关的DOM元素，增强鲁棒性。
 * @returns {boolean} 成功返回 true，失败返回 false。
 */
function cacheElements() {
    // 防止重复查找
    if (elements.toast) return true;

    elements.toast = document.getElementById('undo-toast');
    elements.message = document.getElementById('undo-message');
    elements.actionBtn = document.getElementById('undo-action-btn');
    elements.progressBar = document.getElementById('undo-progress-bar');

    // 鲁棒性检查：确保所有关键元素都存在于HTML中
    for (const key in elements) {
        if (!elements[key]) {
            console.error(`撤销管理器初始化失败：未找到DOM元素 #${key}`);
            return false;
        }
    }
    return true;
}

/**
 * 隐藏通知栏并重置其状态。
 */
function hide() {
    if (elements.toast) {
        elements.toast.classList.remove('is-visible');
    }
    if (elements.progressBar) {
        // 移除动画类，以便下次可以重新触发动画
        elements.progressBar.classList.remove('is-running');
    }
}

/**
 * 处理用户点击“撤销”按钮的事件。
 */
function handleUndo() {
    // 1. 播放撤销音效
    UI.playUiSound('undo');

    // 2. 清除即将执行的“确认”计时器，防止数据被提交
    if (state.timeoutId) {
        clearTimeout(state.timeoutId);
        state.timeoutId = null;
    }

    // 3. 执行传入的撤销逻辑（例如：恢复UI元素的显示，回滚数据状态）
    if (typeof state.onUndoCallback === 'function') {
        try {
            state.onUndoCallback();
        } catch (e) {
            console.error('执行 onUndoCallback 时出错:', e);
        }
    }

    // 4. 隐藏通知栏
    hide();
}

/**
 * 显示并启动撤销通知。
 *
 * 核心逻辑：
 * 如果当前已经有一个正在倒计时的操作，调用此函数意味着用户进行了新的操作。
 * 此时，我们必须立即“确认（Commit）”上一个操作，然后开始处理这个新操作。
 *
 * @param {object} options - 配置对象
 * @param {string} options.message - 显示在通知中的文本信息。
 * @param {function} options.onConfirm - 确认操作回调（数据持久化、DOM移除等）。
 * @param {function} options.onUndo - 撤销操作回调（恢复DOM、恢复数据状态）。
 */
export function show({ message, onConfirm, onUndo }) {
    if (!elements.toast) {
        // 如果模块未初始化或DOM缺失，直接执行确认操作以保数据安全
        console.warn("撤销管理器未就绪，直接执行操作。");
        if (typeof onConfirm === 'function') onConfirm();
        return;
    }

    // --- [关键] 处理连续操作 ---
    // 如果上一个操作还在等待（timeoutId存在），说明用户手速很快。
    // 我们不能让上一个操作被“吞掉”，必须立即执行它的 confirm 逻辑。
    if (state.timeoutId) {
        clearTimeout(state.timeoutId);
        if (typeof state.onConfirmCallback === 'function') {
            try {
                // 立即结算上一个操作
                state.onConfirmCallback();
            } catch (e) {
                console.error('快速操作结算上一个 confirm 时出错:', e);
            }
        }
    }

    // --- 设置新操作的状态 ---
    state.onConfirmCallback = onConfirm;
    state.onUndoCallback = onUndo;

    // 更新 UI 文本
    elements.message.textContent = message;

    // --- 重置并启动进度条动画 ---
    // 1. 移除动画类
    elements.progressBar.classList.remove('is-running');

    // 2. 强制浏览器重绘 (Reflow)，这是重启 CSS Animation 的关键技巧
    // 读取 offsetWidth 会强制浏览器计算样式
    void elements.progressBar.offsetWidth;

    // 3. 重新添加动画类
    elements.progressBar.classList.add('is-running');

    // 显示通知
    elements.toast.classList.add('is-visible');

    // --- 启动新的倒计时 ---
    // 3秒后如果没有点击撤销，则执行确认操作
    state.timeoutId = setTimeout(() => {
        if (typeof state.onConfirmCallback === 'function') {
            try {
                state.onConfirmCallback();
            } catch (e) {
                console.error('执行 onConfirmCallback 时出错:', e);
            }
        }
        hide();
        state.timeoutId = null; // 清理ID
    }, 3000);
}

/**
 * 初始化模块，绑定永久性的事件监听器。
 */
export function init() {
    if (!cacheElements()) {
        return;
    }
    // 绑定“撤销”按钮的点击事件
    // 使用 onclick 属性或 addEventListener 均可，这里使用 listener 以防覆盖
    elements.actionBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // 防止事件冒泡
        handleUndo();
    });
}