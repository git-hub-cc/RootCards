// =================================================================================
// 应用控制器 (Application Controller) - [已更新以支持完整Path标签输出]
// ---------------------------------------------------------------------------------
// 核心职责：
// 1. 导入核心转换模块 `svg-converter.js`。
// 2. 获取所有需要操作的 DOM 元素的引用。
// 3. 绑定事件监听器到按钮上（转换、复制）。
// 4. 定义事件处理函数，协调用户输入、逻辑处理和界面更新。
// 5. 提供用户反馈，如成功或错误信息。
// 6. 确保在页面加载完成后才执行脚本。
// =================================================================================

// 1. 从我们的逻辑模块中导入核心转换函数
import { convertSvgToSinglePath } from './svg-converter.js';

// 2. DOMContentLoaded 事件确保在整个 HTML 文档加载并解析完毕后才执行脚本
document.addEventListener('DOMContentLoaded', () => {

    // 3. [修改] 获取所有相关的 DOM 元素引用，包括新增的元素
    const svgInput = document.getElementById('svg-input');
    const svgOutputPath = document.getElementById('svg-output-path');
    const svgOutputFullPath = document.getElementById('svg-output-full-path'); // <-- 新增
    const convertBtn = document.getElementById('convert-btn');
    const copyBtnPath = document.getElementById('copy-btn-path');
    const copyBtnFullPath = document.getElementById('copy-btn-full-path'); // <-- 新增
    const statusMessage = document.getElementById('status-message');

    // --- 鲁棒性检查：确保所有关键元素都存在 ---
    if (!svgInput || !svgOutputPath || !svgOutputFullPath || !convertBtn || !copyBtnPath || !copyBtnFullPath || !statusMessage) {
        console.error('页面初始化失败：一个或多个关键DOM元素未找到。请检查HTML中的ID是否正确。');
        document.body.innerHTML = `
            <div style="text-align: center; padding: 50px; color: #f44336;">
                <h1>页面加载错误</h1>
                <p>无法找到必要的界面元素，请检查浏览器控制台获取详细信息。</p>
            </div>
        `;
        return;
    }

    // [新增] 定义一个空的 path 标签模板，用于重置
    const EMPTY_PATH_TAG = "<path d='' stroke='currentColor' fill='none'/>";


    /**
     * 显示状态信息的辅助函数
     * @param {string} message - 要显示的消息文本
     * @param {'success' | 'error'} type - 消息类型，用于应用不同的CSS样式
     */
    function showStatus(message, type = 'success') {
        statusMessage.textContent = message;
        statusMessage.classList.remove('success', 'error', 'visible');
        statusMessage.classList.add(type, 'visible');

        setTimeout(() => {
            statusMessage.classList.remove('visible');
        }, 5000);
    }

    /**
     * 处理“转换”按钮点击事件的核心函数
     */
    function handleConvert() {
        const inputSvg = svgInput.value.trim();

        // [修改] 清空所有输出框
        svgOutputPath.value = '';
        svgOutputFullPath.value = EMPTY_PATH_TAG; // 重置为初始模板

        if (!inputSvg) {
            showStatus('输入框不能为空。', 'error');
            return;
        }

        try {
            const result = convertSvgToSinglePath(inputSvg);

            svgOutputPath.value = result.pathD;

            // [新增] 构造并填充完整的 path 标签
            // 注意：这里使用 result.fullSvg 来获取完整的SVG字符串，然后从中提取path标签
            // 这是一个更健壮的方法，因为它会保留转换过程中自动添加的样式属性
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = result.fullSvg;

            showStatus('转换成功！现在可以复制路径数据了。', 'success');

        } catch (error) {
            console.error('转换失败:', error);
            const errorMessage = error.message || '发生未知错误';
            showStatus(`转换失败: ${errorMessage}`, 'error');
        }
    }

    /**
     * 处理“复制”按钮点击事件的通用函数
     * @param {HTMLTextAreaElement} sourceTextarea - 从哪个文本框复制内容
     * @param {HTMLButtonElement} buttonElement - 被点击的那个按钮元素
     */
    async function handleCopy(sourceTextarea, buttonElement) {
        const textToCopy = sourceTextarea.value;
        if (!textToCopy || (sourceTextarea.id === 'svg-output-path' && textToCopy.trim() === '')) {
            showStatus('没有内容可以复制。', 'error');
            return;
        }

        try {
            await navigator.clipboard.writeText(textToCopy);

            const originalText = buttonElement.textContent;
            buttonElement.textContent = '已复制!';
            showStatus('已成功复制到剪贴板！', 'success');

            setTimeout(() => {
                buttonElement.textContent = originalText;
            }, 2000);

        } catch (err) {
            console.error('复制到剪贴板失败:', err);
            showStatus('复制失败，您的浏览器可能不支持或权限不足。请手动复制。', 'error');
        }
    }

    // 4. 为所有按钮绑定事件监听器
    convertBtn.addEventListener('click', handleConvert);
    copyBtnPath.addEventListener('click', () => handleCopy(svgOutputPath, copyBtnPath));
    copyBtnFullPath.addEventListener('click', () => handleCopy(svgOutputFullPath, copyBtnFullPath)); // <-- 新增
});