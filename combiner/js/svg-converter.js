// =================================================================================
// SVG 转换引擎 (SVG Conversion Engine)
// ---------------------------------------------------------------------------------
// 核心职责：
// 1. 提供一个公共接口函数 `convertSvgToSinglePath`，接收SVG字符串，返回合并后的SVG字符串。
// 2. 将字符串解析为DOM对象以便安全地遍历。
// 3. 为每种支持的SVG形状（rect, circle, polyline等）提供一个专门的转换函数。
// 4. 将所有形状转换后的路径数据（d属性）合并成一个字符串。
// 5. 这个模块是纯逻辑，不与主页面的DOM直接交互，具有良好的封装性。
// =================================================================================

/**
 * 将 <rect> 元素转换为路径数据。
 * 支持圆角 (rx, ry)。
 * @param {SVGRectElement} el - <rect> DOM 元素。
 * @returns {string} SVG 路径数据字符串。
 */
function _convertRectToPath(el) {
    const x = parseFloat(el.getAttribute('x') || 0);
    const y = parseFloat(el.getAttribute('y') || 0);
    const width = parseFloat(el.getAttribute('width'));
    const height = parseFloat(el.getAttribute('height'));
    let rx = parseFloat(el.getAttribute('rx'));
    let ry = parseFloat(el.getAttribute('ry'));

    // 鲁棒性检查：如果 width 或 height 无效，则无法绘制
    if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
        return '';
    }

    // 处理圆角逻辑
    if (isNaN(rx) && isNaN(ry)) {
        rx = ry = 0;
    } else if (isNaN(rx)) {
        rx = ry;
    } else if (isNaN(ry)) {
        ry = rx;
    }

    // 确保圆角半径不超过矩形尺寸的一半
    rx = Math.min(rx, width / 2);
    ry = Math.min(ry, height / 2);

    // 如果没有圆角，使用更简单的直线路径
    if (rx === 0 && ry === 0) {
        return `M${x},${y} H${x + width} V${y + height} H${x} Z`;
    }

    // 带有圆角的路径数据
    return `M${x + rx},${y} ` +
        `H${x + width - rx} ` +
        `A${rx},${ry} 0 0 1 ${x + width},${y + ry} ` +
        `V${y + height - ry} ` +
        `A${rx},${ry} 0 0 1 ${x + width - rx},${y + height} ` +
        `H${x + rx} ` +
        `A${rx},${ry} 0 0 1 ${x},${y + height - ry} ` +
        `V${y + ry} ` +
        `A${rx},${ry} 0 0 1 ${x + rx},${y}`;
}

/**
 * 将 <circle> 元素转换为路径数据。
 * 使用两个半圆弧（Arc）命令来绘制一个完整的圆。
 * @param {SVGCircleElement} el - <circle> DOM 元素。
 * @returns {string} SVG 路径数据字符串。
 */
function _convertCircleToPath(el) {
    const cx = parseFloat(el.getAttribute('cx'));
    const cy = parseFloat(el.getAttribute('cy'));
    const r = parseFloat(el.getAttribute('r'));

    // 鲁棒性检查：如果半径无效，则无法绘制
    if (isNaN(cx) || isNaN(cy) || isNaN(r) || r <= 0) {
        return '';
    }

    return `M${cx - r},${cy} ` +
        `A${r},${r} 0 1 0 ${cx + r},${cy} ` +
        `A${r},${r} 0 1 0 ${cx - r},${cy} Z`;
}

/**
 * 将 <ellipse> 元素转换为路径数据。
 * @param {SVGEllipseElement} el - <ellipse> DOM 元素。
 * @returns {string} SVG 路径数据字符串。
 */
function _convertEllipseToPath(el) {
    const cx = parseFloat(el.getAttribute('cx'));
    const cy = parseFloat(el.getAttribute('cy'));
    const rx = parseFloat(el.getAttribute('rx'));
    const ry = parseFloat(el.getAttribute('ry'));

    // 鲁棒性检查
    if (isNaN(cx) || isNaN(cy) || isNaN(rx) || isNaN(ry) || rx <= 0 || ry <= 0) {
        return '';
    }

    return `M${cx - rx},${cy} ` +
        `A${rx},${ry} 0 1 0 ${cx + rx},${cy} ` +
        `A${rx},${ry} 0 1 0 ${cx - rx},${cy} Z`;
}

/**
 * 将 <line> 元素转换为路径数据。
 * @param {SVGLineElement} el - <line> DOM 元素。
 * @returns {string} SVG 路径数据字符串。
 */
function _convertLineToPath(el) {
    const x1 = el.getAttribute('x1');
    const y1 = el.getAttribute('y1');
    const x2 = el.getAttribute('x2');
    const y2 = el.getAttribute('y2');

    // 鲁棒性检查
    if (x1 === null || y1 === null || x2 === null || y2 === null) {
        return '';
    }

    return `M${x1},${y1} L${x2},${y2}`;
}

/**
 * 将 <polyline> 元素转换为路径数据。
 * @param {SVGPolylineElement} el - <polyline> DOM 元素。
 * @returns {string} SVG 路径数据字符串。
 */
function _convertPolylineToPath(el) {
    const points = el.getAttribute('points').trim().split(/\s*,\s*|\s+/);
    if (points.length < 2) {
        return '';
    }
    // 将点数组转换为 "M x,y L x,y L x,y..." 的格式
    return 'M' + points.slice(0, 2).join(',') + ' L' + points.slice(2).join(',');
}

/**
 * 将 <polygon> 元素转换为路径数据。
 * 与 polyline 类似，但在末尾添加 'Z' 来闭合路径。
 * @param {SVGPolygonElement} el - <polygon> DOM 元素。
 * @returns {string} SVG 路径数据字符串。
 */
function _convertPolygonToPath(el) {
    const pathData = _convertPolylineToPath(el);
    return pathData ? pathData + ' Z' : '';
}

/**
 * 主转换函数，作为模块的公共接口导出。
 * @param {string} svgString - 用户输入的原始SVG代码字符串。
 * @returns {string} 包含单一 <path> 的新SVG代码字符串。
 * @throws {Error} 如果输入的字符串无法被解析为有效的XML/SVG。
 */
export function convertSvgToSinglePath(svgString) {
    // --- [核心修改] ---
    // 1. 预处理输入字符串，确保它是一个完整的 SVG 文档
    let processedString = svgString.trim();
    if (!processedString.toLowerCase().startsWith('<svg')) {
        // 如果输入的是代码片段（不以 <svg 开头），则用 <svg> 标签包裹起来
        // 添加 xmlns 属性是良好实践，可确保命名空间正确
        processedString = `<svg xmlns="http://www.w3.org/2000/svg">${processedString}</svg>`;
    }
    // --- [修改结束] ---

    // 2. 使用 DOMParser 安全地将【处理后】的字符串解析成 SVG 文档对象
    const parser = new DOMParser();
    const doc = parser.parseFromString(processedString, 'image/svg+xml');

    const parserError = doc.querySelector('parsererror');
    if (parserError) {
        throw new Error('SVG 代码解析失败: ' + parserError.textContent);
    }

    const svgElement = doc.documentElement;
    if (!svgElement || svgElement.tagName.toLowerCase() !== 'svg') {
        throw new Error('未找到有效的 <svg> 根元素。');
    }

    // 3. 收集所有子元素的路径数据
    const allPathData = [];
    const elements = Array.from(svgElement.children);

    elements.forEach(el => {
        let pathData = '';
        const tagName = el.tagName.toLowerCase();

        switch (tagName) {
            case 'path':
                pathData = el.getAttribute('d');
                break;
            case 'rect':
                pathData = _convertRectToPath(el);
                break;
            case 'circle':
                pathData = _convertCircleToPath(el);
                break;
            case 'ellipse':
                pathData = _convertEllipseToPath(el);
                break;
            case 'line':
                pathData = _convertLineToPath(el);
                break;
            case 'polyline':
                pathData = _convertPolylineToPath(el);
                break;
            case 'polygon':
                pathData = _convertPolygonToPath(el);
                break;
            default:
                break;
        }

        if (pathData) {
            allPathData.push(pathData);
        }
    });

    // 4. 创建一个新的、干净的 SVG 结构
    const newSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

    ['viewBox', 'width', 'height', 'xmlns'].forEach(attr => {
        if (svgElement.hasAttribute(attr)) {
            newSvg.setAttribute(attr, svgElement.getAttribute(attr));
        }
    });

    // 5. 创建单一的 <path> 元素并合并所有路径数据
    const combinedPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    combinedPath.setAttribute('d', allPathData.join(' '));

    const firstStyledElement = elements.find(el => el.hasAttribute('fill') || el.hasAttribute('stroke'));
    if (firstStyledElement) {
        ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'fill-rule', 'stroke-dasharray', 'stroke-dashoffset'].forEach(attr => {
            if (firstStyledElement.hasAttribute(attr)) {
                combinedPath.setAttribute(attr, firstStyledElement.getAttribute(attr));
            }
        });
    } else {
        combinedPath.setAttribute('fill', 'none');
        combinedPath.setAttribute('stroke', 'currentColor');
    }

    // 6. 组装并返回最终的SVG字符串
    newSvg.appendChild(combinedPath);

    const serializer = new XMLSerializer();
    return serializer.serializeToString(newSvg);
}