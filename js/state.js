// = a/s/t/a/t/e/./j/s

// =================================================================================
// 数据与状态管理模块 (State Management Module) - v6.6 (优化搜索逻辑)
// ---------------------------------------------------------------------------------
// 主要职责：
// 1. (数据加载) 异步加载所有词汇数据文件。
// 2. (数据处理) 将原始数据处理成应用所需的格式。
// 3. (状态管理) 维护全局数据和当前筛选状态，包括搜索查询状态。
// 4. (数据操作) 在准备类别数据时，解析出纯英文的显示名。
// 5. (状态持久化) 负责从 localStorage 读取和保存用户学习进度。
// 6. (文本处理) 提供用于生成挖空例句的正则处理函数。
// =================================================================================

// --- 模块内常量 ---
const LEARNED_WORDS_KEY = 'etymologyLearnedWords';

// --- 导出的状态变量 (供其他模块读取和修改) ---
export let allVocabularyData = [];      // 存储所有已加载和处理过的数据
export let currentDataSet = [];         // 当前经过筛选后，需要被渲染的数据集
export let currentFilter = 'all';       // 当前类别筛选器状态 (e.g., 'all', 'learned', 're')
export let currentGrade = 'grade7';     // 当前年级筛选器状态
export let currentContentType = 'pre';  // 当前内容类型筛选器状态 (pre, suf, root, etc.)
export let learnedWordsSet = new Set(); // 存储所有已掌握单词的 Set 集合，用于快速查找
export let currentSearchQuery = '';     // 当前搜索框中的关键词

/**
 * 从 localStorage 加载已掌握的单词列表。
 * 具有鲁棒性，能处理存储格式错误或不存在的情况。
 */
export function loadLearnedWords() {
    try {
        const storedWords = localStorage.getItem(LEARNED_WORDS_KEY);
        if (storedWords) {
            const wordsArray = JSON.parse(storedWords);
            // 确保解析出的是一个数组，防止 localStorage 被意外篡改
            if (Array.isArray(wordsArray)) {
                learnedWordsSet = new Set(wordsArray);
            }
        }
    } catch (error) {
        console.error('无法从 localStorage 加载学习进度:', error);
        learnedWordsSet = new Set(); // 出错时重置为空集合
    }
}

/**
 * 将已掌握的单词列表保存到 localStorage。
 */
export function saveLearnedWords() {
    try {
        const wordsArray = Array.from(learnedWordsSet);
        localStorage.setItem(LEARNED_WORDS_KEY, JSON.stringify(wordsArray));
    } catch (error) {
        console.error('无法保存学习进度到 localStorage:', error);
    }
}

/**
 * 切换一个单词的“已掌握”状态，并同步更新 localStorage。
 * @param {object} wordData - 单词卡片的数据对象
 */
export function toggleLearnedStatus(wordData) {
    wordData.isLearned = !wordData.isLearned;
    if (wordData.isLearned) {
        learnedWordsSet.add(wordData.word);
    } else {
        learnedWordsSet.delete(wordData.word);
    }
    saveLearnedWords();
}

/**
 * 从文件路径中解析出年级信息。
 * @param {string} filePath - 数据文件的路径
 * @returns {string} - 年级标识符 (e.g., 'grade7', 'common')
 */
function getGradeFromFilePath(filePath) {
    const gradeMatch = filePath.match(/\/grade(\d+)\//);
    if (gradeMatch && gradeMatch[1]) {
        return `grade${gradeMatch[1]}`;
    }
    // 词根、前后缀等通用内容被归为 'common'
    if (filePath.includes('/pre/') || filePath.includes('/suf/') || filePath.includes('/root/')) {
        return 'common';
    }
    return 'unknown';
}

/**
 * 从文件路径中解析出内容类型信息。
 * @param {string} filePath - 数据文件的路径
 * @returns {string} - 内容类型标识符 (e.g., 'pre', 'suf', 'root')
 */
function getContentTypeFromFilePath(filePath) {
    if (filePath.includes('/pre/')) return 'pre';
    if (filePath.includes('/suf/')) return 'suf';
    if (filePath.includes('/root/')) return 'root';
    if (filePath.includes('/category/')) return 'category';
    // 兼容旧的文件命名方式
    if (filePath.includes('/root-') || filePath.includes('/prefix-') || filePath.includes('/suffix-')) {
        if (filePath.includes('/root-')) return 'root';
        if (filePath.includes('/prefix-')) return 'pre';
        if (filePath.includes('/suffix-')) return 'suf';
    }
    return 'category';
}

/**
 * 异步加载并处理所有数据文件。
 * 这是应用初始化的核心数据入口。
 */
export async function loadAndProcessData() {
    // 鲁棒性检查：确保全局变量 DATA_FILES 存在且格式正确
    if (typeof DATA_FILES === 'undefined' || !Array.isArray(DATA_FILES) || DATA_FILES.length === 0) {
        throw new Error("数据清单 'data/manifest.js' 未找到、格式错误或为空。");
    }

    const grades = new Set();
    allVocabularyData = [];

    // 使用 Promise.allSettled 并行加载所有 JSON 文件，提高启动速度
    const promises = DATA_FILES.map(async (file) => {
        try {
            const response = await fetch(file);
            if (!response.ok) throw new Error(`网络错误 (状态 ${response.status})，无法加载文件: ${file}`);
            const dataFile = await response.json();

            // 格式校验，确保文件包含必要字段
            if (!dataFile.prefix || !Array.isArray(dataFile.meanings)) {
                console.warn(`文件 ${file} 格式不正确，已跳过。`);
                return null;
            }

            const grade = getGradeFromFilePath(file);
            if (grade.startsWith('grade')) {
                grades.add(grade);
            }
            const contentType = getContentTypeFromFilePath(file);
            const affixType = dataFile.affixType || 'prefix';

            const processedItems = [];

            for (const meaningGroup of dataFile.meanings) {
                // 这是一个通用的处理函数，用于将公共属性附加到每个卡片数据上
                const processItem = (item, cardType) => ({
                    ...item,
                    cardType, // 'intro' 或 'word'
                    type: meaningGroup.meaningId,
                    displayName: meaningGroup.displayName,
                    prefix: dataFile.prefix,
                    affixType: affixType,
                    themeColor: meaningGroup.themeColor,
                    grade: grade,
                    contentType: contentType,
                    isLearned: cardType === 'word' ? learnedWordsSet.has(item.word) : false,
                    ...(cardType === 'intro' && { visual: meaningGroup.prefixVisual }),
                    ...(cardType === 'word' && { prefixVisual: meaningGroup.prefixVisual || '' })
                });

                // 处理介绍卡片
                if (meaningGroup.prefixIntro) {
                    processedItems.push(processItem(meaningGroup.prefixIntro, 'intro'));
                }

                // 处理单词卡片
                if (Array.isArray(meaningGroup.words)) {
                    const wordsData = meaningGroup.words.map(word => processItem(word, 'word'));
                    processedItems.push(...wordsData);
                }
            }
            return processedItems;

        } catch (fileError) {
            console.error(`加载或处理文件 ${file} 时出错:`, fileError);
            return null; // 返回 null 表示此文件处理失败，Promise.allSettled 会记录下来
        }
    });

    const results = await Promise.allSettled(promises);
    results.forEach(result => {
        // 只将成功加载并处理好的数据添加到总数据集中
        if (result.status === 'fulfilled' && result.value) {
            allVocabularyData.push(...result.value);
        }
    });

    return { grades: Array.from(grades).sort() };
}

/**
 * 【核心函数】根据当前所有筛选条件和搜索查询，更新 currentDataSet。
 * 这是所有筛选逻辑的汇集点。
 */
export function filterAndPrepareDataSet() {
    let filteredData;

    // --- 阶段 1: 基础筛选 (年级、内容类型) ---
    if (currentGrade === 'all') {
        filteredData = allVocabularyData;
    } else {
        filteredData = allVocabularyData.filter(
            item => item.grade === currentGrade || item.grade === 'common'
        );
    }

    if (currentContentType !== 'all') {
        filteredData = filteredData.filter(
            item => item.contentType === currentContentType
        );
    }

    // --- 阶段 2: 类别筛选 (All, Learned, 或特定词根/前缀) ---
    if (currentFilter === 'learned') {
        filteredData = filteredData.filter(item => item.cardType === 'word' && item.isLearned);
    } else if (currentFilter === 'all') {
        // 'All' 类别下，显示所有介绍卡片和未掌握的单词卡片
        filteredData = filteredData.filter(item => item.cardType === 'intro' || !item.isLearned);
    } else {
        // 特定类别下，显示该类别的介绍卡片和该类别下未掌握的单词卡片
        filteredData = filteredData.filter(item =>
            item.type === currentFilter && (item.cardType === 'intro' || !item.isLearned)
        );
    }

    // --- 阶段 3: 搜索查询过滤 (最关键的改动) ---
    if (currentSearchQuery) {
        // 步骤 1: 从当前已筛选的结果中，只找出能匹配搜索词的【单词卡片】
        const matchingWordCards = filteredData.filter(item =>
            item.cardType === 'word' &&
            item.word &&
            item.word.toLowerCase().includes(currentSearchQuery)
        );

        // 步骤 2: 从这些匹配到的单词中，提取它们所属的所有唯一类别 ID
        // 使用 Set 集合可以自动去重，并且后续查找效率高
        const relevantCategoryIds = new Set(matchingWordCards.map(item => item.type));

        // 步骤 3: 如果有匹配的单词，则找出与这些单词相关的【介绍卡片】
        if (relevantCategoryIds.size > 0) {
            const relevantIntroCards = filteredData.filter(item =>
                item.cardType === 'intro' && relevantCategoryIds.has(item.type)
            );
            // 步骤 4: 合并相关的介绍卡片和匹配的单词卡片，作为最终的搜索结果
            currentDataSet = [...relevantIntroCards, ...matchingWordCards];
        } else {
            // 如果没有匹配到任何单词，则搜索结果为空
            currentDataSet = [];
        }
    } else {
        // 如果没有搜索查询，则直接使用前几个阶段的筛选结果
        currentDataSet = filteredData;
    }
}

/**
 * Fisher-Yates 洗牌算法的高效实现。
 * @param {Array} array - 需要被洗牌的数组
 * @returns {Array} - 一个新的、被打乱顺序的数组
 */
function shuffleArray(array) {
    const newArray = [...array]; // 创建副本，避免修改原数组
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}

/**
 * 对当前数据集进行洗牌。
 * 会智能地将介绍卡片（如果有）固定在顶部，只洗牌单词卡片。
 */
export function shuffleCurrentDataSet() {
    const introCard = currentDataSet.find(item => item.cardType === 'intro');
    const wordCards = currentDataSet.filter(item => item.cardType === 'word');

    const shuffledWords = shuffleArray(wordCards);

    // 如果存在介绍卡片，则将其放在打乱后的单词列表前面
    currentDataSet = introCard ? [introCard, ...shuffledWords] : shuffledWords;
}

// --- 状态更新函数 (setter functions) ---

export function setCurrentFilter(newFilter) {
    currentFilter = newFilter;
}
export function setCurrentGrade(newGrade) {
    currentGrade = newGrade;
}
export function setCurrentContentType(newType) {
    currentContentType = newType;
}

/**
 * 更新搜索查询状态。
 * @param {string} query - 来自搜索输入框的原始查询字符串
 */
export function setSearchQuery(query) {
    // 标准化输入：去除首尾空格并转为小写，以便进行不区分大小写的匹配
    currentSearchQuery = query.trim().toLowerCase();
}

/**
 * 根据当前筛选动态获取可用的类别列表，并为每个类别生成纯英文的显示名。
 * 用于动态生成筛选器按钮。
 */
export function getAvailableCategories() {
    let gradeFilteredData;
    if (currentGrade === 'all') {
        gradeFilteredData = allVocabularyData;
    } else {
        gradeFilteredData = allVocabularyData.filter(
            item => item.grade === currentGrade || item.grade === 'common'
        );
    }

    let finalFilteredData;
    if (currentContentType !== 'all') {
        finalFilteredData = gradeFilteredData.filter(
            item => item.contentType === currentContentType
        );
    } else {
        finalFilteredData = gradeFilteredData;
    }

    const categoryMap = new Map();
    finalFilteredData.forEach(item => {
        if (!categoryMap.has(item.type)) {
            const originalDisplayName = item.displayName;
            let englishDisplayName = originalDisplayName;

            // 尝试从显示名中提取括号内的英文部分作为按钮文本
            if (item.contentType === 'category') {
                const match = originalDisplayName.match(/\(([^)]+)\)/);
                if (match && match[1]) {
                    englishDisplayName = match[1];
                }
            }

            categoryMap.set(item.type, {
                meaningId: item.type,
                displayName: originalDisplayName,
                englishDisplayName: englishDisplayName,
                prefix: item.prefix,
                themeColor: item.themeColor,
                contentType: item.contentType
            });
        }
    });

    return Array.from(categoryMap.values());
}

/**
 * 处理例句，将目标单词及其变体替换为挖空占位符。
 * @param {string} sentence - 原始例句 (英文)
 * @param {string} targetWord - 需要挖空的目标单词
 * @returns {string} - 处理后的 HTML 字符串
 */
export function getMaskedSentence(sentence, targetWord) {
    if (!sentence || !targetWord) return '';

    // 构造正则表达式，用于匹配目标单词及其简单变体 (如 -s, -ed, -ing 等)
    // \b 表示单词边界，确保不会匹配到单词的一部分 (e.g., 'he' 不会匹配 'the')
    const regex = new RegExp(`\\b${targetWord}[a-z]*\\b`, 'gi');

    return sentence.replace(regex, '<span class="masked-word">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>');
}