// =================================================================================
// SVG 转换引擎 (SVG Conversion Engine)
// ---------------------------------------------------------------------------------
// 核心职责：
// 1. 提供一个公共接口函数 `convertSvgToSinglePath`，接收SVG字符串，返回一个包含
//    完整SVG代码和Path 'd'属性的对象。
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

    if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
        return '';
    }

    if (isNaN(rx) && isNaN(ry)) {
        rx = ry = 0;
    } else if (isNaN(rx)) {
        rx = ry;
    } else if (isNaN(ry)) {
        ry = rx;
    }

    rx = Math.min(rx, width / 2);
    ry = Math.min(ry, height / 2);

    if (rx === 0 && ry === 0) {
        return `M${x},${y} H${x + width} V${y + height} H${x} Z`;
    }

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
 * @param {SVGCircleElement} el - <circle> DOM 元素。
 * @returns {string} SVG 路径数据字符串。
 */
function _convertCircleToPath(el) {
    const cx = parseFloat(el.getAttribute('cx'));
    const cy = parseFloat(el.getAttribute('cy'));
    const r = parseFloat(el.getAttribute('r'));

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
    return 'M' + points.slice(0, 2).join(',') + ' L' + points.slice(2).join(',');
}

/**
 * 将 <polygon> 元素转换为路径数据。
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
 * @returns {{fullSvg: string, pathD: string}} 一个包含完整SVG代码和'd'属性值的对象。
 * @throws {Error} 如果输入的字符串无法被解析为有效的XML/SVG。
 */
export function convertSvgToSinglePath(svgString) {
    let processedString = svgString.trim();
    if (!processedString.toLowerCase().startsWith('<svg')) {
        processedString = `<svg xmlns="http://www.w.org/2000/svg">${processedString}</svg>`;
    }

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

    const allPathData = [];
    const elements = Array.from(svgElement.children);

    elements.forEach(el => {
        let pathData = '';
        const tagName = el.tagName.toLowerCase();
        switch (tagName) {
            case 'path': pathData = el.getAttribute('d'); break;
            case 'rect': pathData = _convertRectToPath(el); break;
            case 'circle': pathData = _convertCircleToPath(el); break;
            case 'ellipse': pathData = _convertEllipseToPath(el); break;
            case 'line': pathData = _convertLineToPath(el); break;
            case 'polyline': pathData = _convertPolylineToPath(el); break;
            case 'polygon': pathData = _convertPolygonToPath(el); break;
            default: break;
        }
        if (pathData) {
            allPathData.push(pathData);
        }
    });

    // 【修改】将合并后的 'd' 属性值存储在一个变量中
    const combinedD = allPathData.join(' ').trim();

    const newSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ['viewBox', 'width', 'height', 'xmlns'].forEach(attr => {
        if (svgElement.hasAttribute(attr)) {
            newSvg.setAttribute(attr, svgElement.getAttribute(attr));
        }
    });

    const combinedPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    combinedPath.setAttribute('d', combinedD); // 使用存储的变量

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

    newSvg.appendChild(combinedPath);

    const serializer = new XMLSerializer();
    const serializedString = serializer.serializeToString(newSvg);
    const finalSvgString = serializedString.replace(/"/g, "'");

    // 【修改】返回一个包含两部分数据的对象，而不是单一字符串
    return {
        fullSvg: finalSvgString,
        pathD: combinedD
    };
}