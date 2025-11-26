// =================================================================================
// 应用控制器 (Application Controller)
// ---------------------------------------------------------------------------------
// 核心职责：
// 1. 导入核心转换模块 `svg-converter.js`。
// 2. 获取所有需要操作的 DOM 元素的引用。
// 3. 绑定事件监听器到按钮上（转换、复制）。
// 4. 定义事件处理函数，协调用户输入、逻辑处理和界面更新。
// 5. 提供用户反馈，如成功/错误信息和实时预览。
// 6. 确保在页面加载完成后才执行脚本。
// =================================================================================

// 1. 从我们的逻辑模块中导入核心转换函数
import { convertSvgToSinglePath } from './svg-converter.js';

// 2. DOMContentLoaded 事件确保在整个 HTML 文档加载并解析完毕后才执行脚本
document.addEventListener('DOMContentLoaded', () => {

    // 3. 获取所有需要交互的 DOM 元素的引用
    const svgInput = document.getElementById('svg-input');
    const svgOutput = document.getElementById('svg-output');
    const convertBtn = document.getElementById('convert-btn');
    const copyBtn = document.getElementById('copy-btn');
    const statusMessage = document.getElementById('status-message');
    const previewBefore = document.getElementById('preview-before');
    const previewAfter = document.getElementById('preview-after');

    // --- 鲁棒性检查：确保所有关键元素都存在 ---
    if (!svgInput || !svgOutput || !convertBtn || !copyBtn || !statusMessage || !previewBefore || !previewAfter) {
        console.error('页面初始化失败：一个或多个关键DOM元素未找到。');
        // 在界面上给用户一个明确的提示
        document.body.innerHTML = '<h1 style="color: red; text-align: center; padding-top: 50px;">页面加载错误，请检查HTML结构是否完整。</h1>';
        return;
    }

    /**
     * 显示状态信息的辅助函数
     * @param {string} message - 要显示的消息文本
     * @param {'success' | 'error'} type - 消息类型，用于应用不同的CSS样式
     */
    function showStatus(message, type = 'success') {
        statusMessage.textContent = message;
        statusMessage.className = type; // 移除旧样式并应用新样式

        // 5秒后自动清除消息，避免信息残留
        setTimeout(() => {
            statusMessage.textContent = '';
            statusMessage.className = '';
        }, 5000);
    }

    /**
     * 更新预览区域的函数
     * @param {HTMLElement} container - 要更新的预览容器 (previewBefore 或 previewAfter)
     * @param {string} svgString - 要渲染的 SVG 代码字符串
     */
    function updatePreview(container, svgString) {
        // 先清空之前的内容
        container.innerHTML = '';
        if (svgString) {
            // 直接将SVG字符串设置为innerHTML，浏览器会自动解析和渲染
            container.innerHTML = svgString;
        }
    }


    /**
     * 处理“转换”按钮点击事件的核心函数
     */
    function handleConvert() {
        const inputSvg = svgInput.value.trim();

        // 清空上一次的结果
        svgOutput.value = '';
        updatePreview(previewBefore, '');
        updatePreview(previewAfter, '');

        if (!inputSvg) {
            showStatus('输入框不能为空。', 'error');
            return;
        }

        // 更新转换前预览
        updatePreview(previewBefore, inputSvg);

        try {
            // 调用核心转换逻辑
            const resultSvg = convertSvgToSinglePath(inputSvg);

            // 将结果显示在输出框和预览区
            svgOutput.value = resultSvg;
            updatePreview(previewAfter, resultSvg);

            showStatus('转换成功！', 'success');

        } catch (error) {
            // 如果转换过程中发生错误，捕获并显示给用户
            console.error('转换失败:', error);
            showStatus(`转换失败: ${error.message}`, 'error');
            // 即使失败，也要清空输出预览
            updatePreview(previewAfter, '');
        }
    }

    /**
     * 处理“复制”按钮点击事件的函数
     */
    async function handleCopy() {
        const outputSvg = svgOutput.value;
        if (!outputSvg) {
            showStatus('没有内容可以复制。', 'error');
            return;
        }

        try {
            // 使用现代的、安全的 Clipboard API
            await navigator.clipboard.writeText(outputSvg);

            // 提供视觉反馈
            const originalText = copyBtn.textContent;
            copyBtn.textContent = '已复制!';
            showStatus('已成功复制到剪贴板！', 'success');

            // 2秒后恢复按钮文本
            setTimeout(() => {
                copyBtn.textContent = originalText;
            }, 2000);

        } catch (error) {
            console.error('复制失败:', error);
            showStatus('复制失败，请手动复制。', 'error');
        }
    }


    // 4. 为按钮绑定事件监听器
    convertBtn.addEventListener('click', handleConvert);
    copyBtn.addEventListener('click', handleCopy);

});