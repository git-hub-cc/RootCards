// =================================================================================
// 数据与状态管理模块 (State Management Module) - v7.0 (新增自定义单词本)
// ---------------------------------------------------------------------------------
// 主要职责：
// 1. (数据加载) 异步加载所有词汇数据文件，加载时提供进度回调。
// 2. (数据处理) 将原始数据处理成应用所需的格式。
// 3. (状态管理) 维护全局数据和当前筛选状态，包括搜索查询状态。
// 4. (数据操作) 提供导入/导出“已掌握”单词列表的功能。
// 5. (状态持久化) 负责从 localStorage 读取和保存用户学习进度及自定义单词本。
// 6. (文本处理) 提供用于生成挖空例句的正则处理函数。
// 【注】: 此文件在本次重构中几乎没有逻辑变化，保持其核心职责。
// =================================================================================

// --- 模块内常量 ---
const LEARNED_WORDS_KEY = 'etymologyLearnedWords';
const USER_WORDBOOKS_KEY = 'etymologyUserWordbooks';

// --- 导出的状态变量 (供其他模块读取和修改) ---
export let allVocabularyData = [];      // 存储所有已加载和处理过的数据
export let currentDataSet = [];         // 当前经过筛选后，需要被渲染的数据集
export let currentFilter = 'all';       // 当前类别筛选器状态 (e.g., 'all', 'learned', 're', 或自定义单词本名称)
export let currentGrade = 'grade7';     // 当前年级筛选器状态
export let currentContentType = 'pre';  // 当前内容类型筛选器状态 (pre, suf, root, etc.)
export let learnedWordsSet = new Set(); // 存储所有已掌握单词的 Set 集合，用于快速查找
export let currentSearchQuery = '';     // 当前搜索框中的关键词
export let userWordbooks = [];          // 存储所有用户创建的单词本，结构为 [{ name: string, words: string[] }]

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
function saveLearnedWords() {
    try {
        const wordsArray = Array.from(learnedWordsSet);
        localStorage.setItem(LEARNED_WORDS_KEY, JSON.stringify(wordsArray));
    } catch (error) {
        console.error('无法保存学习进度到 localStorage:', error);
    }
}

/**
 * 从 localStorage 加载用户创建的单词本。
 */
export function loadUserWordbooks() {
    try {
        const storedWordbooks = localStorage.getItem(USER_WORDBOOKS_KEY);
        if (storedWordbooks) {
            const parsedData = JSON.parse(storedWordbooks);
            // 验证数据结构是否正确
            if (Array.isArray(parsedData) && parsedData.every(wb => typeof wb.name === 'string' && Array.isArray(wb.words))) {
                userWordbooks = parsedData;
            } else {
                console.warn('localStorage 中的单词本数据格式不正确，已忽略。');
                userWordbooks = [];
            }
        }
    } catch (error) {
        console.error('无法从 localStorage 加载用户单词本:', error);
        userWordbooks = [];
    }
}

/**
 * 保存用户创建的所有单词本到 localStorage。
 */
function saveUserWordbooks() {
    try {
        localStorage.setItem(USER_WORDBOOKS_KEY, JSON.stringify(userWordbooks));
    } catch (error) {
        console.error('无法保存用户单词本到 localStorage:', error);
    }
}

/**
 * 添加或更新一个单词本，并保存。
 * @param {string} name - 单词本的名称。
 * @param {string[]} words - 单词本包含的单词列表。
 * @returns {boolean} - 如果是新创建的单词本返回 true，如果是更新返回 false。
 */
export function addOrUpdateWordbook(name, words) {
    const existingIndex = userWordbooks.findIndex(wb => wb.name === name);
    if (existingIndex > -1) {
        // 更新现有的单词本
        userWordbooks[existingIndex].words = words;
        saveUserWordbooks();
        return false;
    } else {
        // 添加新的单词本
        userWordbooks.push({ name, words });
        saveUserWordbooks();
        return true;
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
 * 获取“已掌握”单词的数组形式，用于导出。
 * @returns {string[]} 一个包含所有已掌握单词的数组。
 */
export function getLearnedWordsArray() {
    return Array.from(learnedWordsSet).sort(); // 排序后导出，更规范
}

/**
 * 从一个数组导入“已掌握”的单词。
 * @param {string[]} wordsArray - 从文件中读取的单词数组。
 * @returns {number} 本次操作实际新增的单词数量。
 */
export function importLearnedWords(wordsArray) {
    if (!Array.isArray(wordsArray)) {
        console.error('导入数据格式错误，需要一个数组。');
        return 0;
    }
    const originalSize = learnedWordsSet.size;
    wordsArray.forEach(word => {
        if (typeof word === 'string' && word.trim()) {
            learnedWordsSet.add(word.trim().toLowerCase()); // 统一转换为小写
        }
    });

    // 将 isLearned 状态同步到 allVocabularyData 中
    allVocabularyData.forEach(item => {
        if (item.cardType === 'word' && learnedWordsSet.has(item.word.toLowerCase())) {
            item.isLearned = true;
        }
    });

    saveLearnedWords();
    return learnedWordsSet.size - originalSize; // 返回新增单词的数量
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
 * @param {function(number, number): void} [onProgress] - 一个可选的回调函数，用于报告加载进度。
 */
export async function loadAndProcessData(onProgress) {
    if (typeof DATA_FILES === 'undefined' || !Array.isArray(DATA_FILES) || DATA_FILES.length === 0) {
        throw new Error("数据清单 'data/manifest.js' 未找到、格式错误或为空。");
    }

    const grades = new Set();
    allVocabularyData = [];

    const totalFiles = DATA_FILES.length;
    let loadedFiles = 0;

    if (typeof onProgress === 'function') {
        onProgress(loadedFiles, totalFiles);
    }

    const promises = DATA_FILES.map(async (file) => {
        try {
            const response = await fetch(file);
            if (!response.ok) throw new Error(`网络错误 (状态 ${response.status})，无法加载文件: ${file}`);
            const dataFile = await response.json();

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
                    isLearned: cardType === 'word' ? learnedWordsSet.has(item.word.toLowerCase()) : false,
                    ...(cardType === 'intro' && { visual: meaningGroup.prefixVisual }),
                    ...(cardType === 'word' && { prefixVisual: meaningGroup.prefixVisual || '' })
                });

                if (meaningGroup.prefixIntro) {
                    processedItems.push(processItem(meaningGroup.prefixIntro, 'intro'));
                }
                if (Array.isArray(meaningGroup.words)) {
                    const wordsData = meaningGroup.words.map(word => processItem(word, 'word'));
                    processedItems.push(...wordsData);
                }
            }
            return processedItems;

        } catch (fileError) {
            console.error(`加载或处理文件 ${file} 时出错:`, fileError);
            return null;
        } finally {
            loadedFiles++;
            if (typeof onProgress === 'function') {
                onProgress(loadedFiles, totalFiles);
            }
        }
    });

    const results = await Promise.allSettled(promises);
    results.forEach(result => {
        if (result.status === 'fulfilled' && result.value) {
            allVocabularyData.push(...result.value);
        }
    });

    return { grades: Array.from(grades).sort() };
}

/**
 * 【核心函数】根据当前所有筛选条件和搜索查询，更新 currentDataSet。
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

    // --- 阶段 2: 类别筛选 (All, Learned, 特定词根/前缀, 或用户自定义单词本) ---
    const userWordbook = userWordbooks.find(wb => wb.name === currentFilter);

    if (currentFilter === 'learned') {
        filteredData = filteredData.filter(item => item.cardType === 'word' && item.isLearned);
    } else if (userWordbook) {
        const wordbookSet = new Set(userWordbook.words.map(w => w.toLowerCase()));
        filteredData = filteredData.filter(item =>
            item.cardType === 'word' && wordbookSet.has(item.word.toLowerCase())
        );
    } else if (currentFilter === 'all') {
        filteredData = filteredData.filter(item => item.cardType === 'intro' || !item.isLearned);
    } else {
        // 默认的按词根/前缀筛选
        filteredData = filteredData.filter(item =>
            item.type === currentFilter && (item.cardType === 'intro' || !item.isLearned)
        );
    }

    // --- 阶段 3: 搜索查询过滤 ---
    if (currentSearchQuery) {
        const matchingWordCards = filteredData.filter(item =>
            item.cardType === 'word' &&
            item.word &&
            item.word.toLowerCase().includes(currentSearchQuery)
        );

        const relevantCategoryIds = new Set(matchingWordCards.map(item => item.type));

        if (relevantCategoryIds.size > 0) {
            const relevantIntroCards = filteredData.filter(item =>
                item.cardType === 'intro' && relevantCategoryIds.has(item.type)
            );
            currentDataSet = [...relevantIntroCards, ...matchingWordCards];
        } else {
            currentDataSet = [];
        }
    } else {
        currentDataSet = filteredData;
    }
}

/**
 * Fisher-Yates 洗牌算法的高效实现。
 */
function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}

/**
 * 对当前数据集进行洗牌。
 */
export function shuffleCurrentDataSet() {
    const introCard = currentDataSet.find(item => item.cardType === 'intro');
    const wordCards = currentDataSet.filter(item => item.cardType === 'word');

    const shuffledWords = shuffleArray(wordCards);

    currentDataSet = introCard ? [introCard, ...shuffledWords] : shuffledWords;
}

// --- 状态更新函数 (setter functions) ---
export function setCurrentFilter(newFilter) { currentFilter = newFilter; }
export function setCurrentGrade(newGrade) { currentGrade = newGrade; }
export function setCurrentContentType(newType) { currentContentType = newType; }
export function setSearchQuery(query) { currentSearchQuery = query.trim().toLowerCase(); }

/**
 * 获取可用的筛选类别，包括预设类别和用户自定义单词本。
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
            if (item.contentType === 'category') {
                const match = originalDisplayName.match(/\(([^)]+)\)/);
                if (match && match[1]) englishDisplayName = match[1];
            }
            categoryMap.set(item.type, {
                filterType: 'pre-defined',
                meaningId: item.type,
                displayName: originalDisplayName,
                englishDisplayName: englishDisplayName,
                prefix: item.prefix,
                themeColor: item.themeColor,
                contentType: item.contentType
            });
        }
    });

    const userWordbookCategories = userWordbooks.map(wb => ({
        filterType: 'user-wordbook',
        meaningId: wb.name,
        displayName: wb.name,
        englishDisplayName: wb.name,
    }));

    return [...Array.from(categoryMap.values()), ...userWordbookCategories];
}

/**
 * 为打字模式生成带有挖空占位符的例句HTML。
 */
export function getMaskedSentence(sentence, targetWord) {
    if (!sentence || !targetWord) return '';
    const regex = new RegExp(`\\b${targetWord}[a-z]*\\b`, 'gi');
    return sentence.replace(regex, '<span class="masked-word">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>');
}