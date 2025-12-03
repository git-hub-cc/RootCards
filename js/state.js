// =================================================================================
// 数据与状态管理模块 (State Management Module) - v8.1 (新增清空已掌握功能)
// ---------------------------------------------------------------------------------
// 主要职责：
// 1. (数据加载) 异步加载所有词汇数据文件。
// 2. (数据处理) 将原始数据处理成应用所需的格式。
// 3. (状态管理) 维护全局数据和当前筛选状态。
// 4. (用户数据) 管理“已掌握”单词和“自定义单词本”的增删改查。
// 5. (持久化) 负责 localStorage 的读写。
// =================================================================================

// --- 模块内常量 ---
const LEARNED_WORDS_KEY = 'etymologyLearnedWords';
const USER_WORDBOOKS_KEY = 'etymologyUserWordbooks';

// --- 导出的状态变量 (供其他模块读取和修改) ---
export let allVocabularyData = [];      // 存储所有已加载和处理过的数据
export let currentDataSet = [];         // 当前经过筛选后，需要被渲染的数据集
export let currentFilter = 'all';       // 当前类别筛选器状态
export let currentGrade = 'grade7';     // 当前年级筛选器状态
export let currentContentType = 'pre';  // 当前内容类型筛选器状态
export let learnedWordsSet = new Set(); // 存储所有已掌握单词的 Set 集合
export let currentSearchQuery = '';     // 当前搜索框中的关键词
export let userWordbooks = [];          // 存储所有用户创建的单词本 [{ name: string, words: string[] }]

/**
 * 从 localStorage 加载已掌握的单词列表。
 */
export function loadLearnedWords() {
    try {
        const storedWords = localStorage.getItem(LEARNED_WORDS_KEY);
        if (storedWords) {
            const wordsArray = JSON.parse(storedWords);
            if (Array.isArray(wordsArray)) {
                learnedWordsSet = new Set(wordsArray);
            }
        }
    } catch (error) {
        console.error('无法从 localStorage 加载学习进度:', error);
        learnedWordsSet = new Set();
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
 * 【CRUD】获取单个单词本的数据。
 * @param {string} name - 单词本名称
 * @returns {object|null} - 返回单词本对象或 null
 */
export function getWordbook(name) {
    return userWordbooks.find(wb => wb.name === name) || null;
}

/**
 * 【CRUD】删除指定的单词本。
 * @param {string} name - 要删除的单词本名称。
 * @returns {boolean} - 删除成功返回 true，未找到返回 false。
 */
export function deleteWordbook(name) {
    const initialLength = userWordbooks.length;
    userWordbooks = userWordbooks.filter(wb => wb.name !== name);
    if (userWordbooks.length !== initialLength) {
        saveUserWordbooks();
        return true;
    }
    return false;
}

/**
 * 【CRUD】添加或更新一个单词本。
 * @param {string|null} oldName - 旧名称。如果是新建，传 null。
 * @param {string} newName - 新名称。
 * @param {string[]} words - 最新的单词列表。
 * @returns {boolean} - 操作成功返回 true。
 */
export function addOrUpdateWordbook(oldName, newName, words) {
    if (!newName || !words || !Array.isArray(words)) return false;

    // 检查名称冲突（除了自己）
    const isDuplicate = userWordbooks.some(wb => wb.name === newName && wb.name !== oldName);
    if (isDuplicate) {
        throw new Error(`单词本名称 "${newName}" 已存在，请使用其他名称。`);
    }

    if (oldName) {
        // --- 更新模式 ---
        const index = userWordbooks.findIndex(wb => wb.name === oldName);
        if (index > -1) {
            userWordbooks[index].name = newName;
            userWordbooks[index].words = words;
        } else {
            // 如果找不到旧的（理论上不应发生），则作为新建处理
            userWordbooks.push({ name: newName, words });
        }
    } else {
        // --- 新建模式 ---
        userWordbooks.push({ name: newName, words });
    }

    saveUserWordbooks();
    return true;
}

/**
 * 切换一个单词的“已掌握”状态，并同步更新 localStorage。
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
 */
export function getLearnedWordsArray() {
    return Array.from(learnedWordsSet).sort();
}

/**
 * 从一个数组导入“已掌握”的单词。
 */
export function importLearnedWords(wordsArray) {
    if (!Array.isArray(wordsArray)) {
        console.error('导入数据格式错误，需要一个数组。');
        return 0;
    }
    const originalSize = learnedWordsSet.size;
    wordsArray.forEach(word => {
        if (typeof word === 'string' && word.trim()) {
            learnedWordsSet.add(word.trim().toLowerCase());
        }
    });

    allVocabularyData.forEach(item => {
        if (item.cardType === 'word' && learnedWordsSet.has(item.word.toLowerCase())) {
            item.isLearned = true;
        }
    });

    saveLearnedWords();
    return learnedWordsSet.size - originalSize;
}

/**
 * 【新增】清空所有“已掌握”的单词记录。
 * 这是一个破坏性操作，会重置用户的学习进度。
 */
export function clearLearnedWords() {
    // 1. 清空内存中的 Set 集合
    learnedWordsSet.clear();

    // 2. 遍历所有数据，将每个单词的 isLearned 状态重置为 false
    //    这是确保 UI 能够正确、即时地反映变化的关键步骤。
    allVocabularyData.forEach(item => {
        if (item.cardType === 'word') {
            item.isLearned = false;
        }
    });

    // 3. 将空的 Set 保存到 localStorage，完成持久化清空
    saveLearnedWords();
}


// ... (辅助函数 getGradeFromFilePath, getContentTypeFromFilePath 保持不变，此处省略以节省篇幅) ...
function getGradeFromFilePath(filePath) {
    const gradeMatch = filePath.match(/\/grade(\d+)\//);
    if (gradeMatch && gradeMatch[1]) return `grade${gradeMatch[1]}`;
    if (filePath.includes('/pre/') || filePath.includes('/suf/') || filePath.includes('/root/')) return 'common';
    return 'unknown';
}

function getContentTypeFromFilePath(filePath) {
    if (filePath.includes('/pre/')) return 'pre';
    if (filePath.includes('/suf/')) return 'suf';
    if (filePath.includes('/root/')) return 'root';
    if (filePath.includes('/category/')) return 'category';
    return 'category';
}

/**
 * 异步加载并处理所有数据文件。
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
            if (grade.startsWith('grade')) grades.add(grade);
            const contentType = getContentTypeFromFilePath(file);
            const affixType = dataFile.affixType || 'prefix';

            const processedItems = [];

            for (const meaningGroup of dataFile.meanings) {
                const processItem = (item, cardType) => ({
                    ...item,
                    cardType,
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

    // 阶段 1: 基础筛选
    if (currentGrade === 'all') {
        filteredData = allVocabularyData;
    } else {
        filteredData = allVocabularyData.filter(item => item.grade === currentGrade || item.grade === 'common');
    }

    if (currentContentType !== 'all') {
        filteredData = filteredData.filter(item => item.contentType === currentContentType);
    }

    // 阶段 2: 类别筛选
    const userWordbook = userWordbooks.find(wb => wb.name === currentFilter);

    if (currentFilter === 'learned') {
        filteredData = filteredData.filter(item => item.cardType === 'word' && item.isLearned);
    } else if (userWordbook) {
        // 自定义单词本逻辑
        const wordbookSet = new Set(userWordbook.words.map(w => w.toLowerCase()));
        filteredData = filteredData.filter(item =>
            item.cardType === 'word' && wordbookSet.has(item.word.toLowerCase())
        );
    } else if (currentFilter === 'all') {
        filteredData = filteredData.filter(item => item.cardType === 'intro' || !item.isLearned);
    } else {
        filteredData = filteredData.filter(item =>
            item.type === currentFilter && (item.cardType === 'intro' || !item.isLearned)
        );
    }

    // 阶段 3: 搜索查询
    if (currentSearchQuery) {
        const matchingWordCards = filteredData.filter(item =>
            item.cardType === 'word' && item.word && item.word.toLowerCase().includes(currentSearchQuery)
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

function shuffleArray(array) {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
}

export function shuffleCurrentDataSet() {
    const introCard = currentDataSet.find(item => item.cardType === 'intro');
    const wordCards = currentDataSet.filter(item => item.cardType === 'word');
    const shuffledWords = shuffleArray(wordCards);
    currentDataSet = introCard ? [introCard, ...shuffledWords] : shuffledWords;
}

export function setCurrentFilter(newFilter) { currentFilter = newFilter; }
export function setCurrentGrade(newGrade) { currentGrade = newGrade; }
export function setCurrentContentType(newType) { currentContentType = newType; }
export function setSearchQuery(query) { currentSearchQuery = query.trim().toLowerCase(); }

export function getAvailableCategories() {
    let gradeFilteredData;
    if (currentGrade === 'all') {
        gradeFilteredData = allVocabularyData;
    } else {
        gradeFilteredData = allVocabularyData.filter(item => item.grade === currentGrade || item.grade === 'common');
    }

    let finalFilteredData;
    if (currentContentType !== 'all') {
        finalFilteredData = gradeFilteredData.filter(item => item.contentType === currentContentType);
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

    // 注入用户单词本
    const userWordbookCategories = userWordbooks.map(wb => ({
        filterType: 'user-wordbook',
        meaningId: wb.name,
        displayName: wb.name,
        englishDisplayName: wb.name,
    }));

    return [...Array.from(categoryMap.values()), ...userWordbookCategories];
}

export function getMaskedSentence(sentence, targetWord) {
    if (!sentence || !targetWord) return '';
    const regex = new RegExp(`\\b${targetWord}[a-z]*\\b`, 'gi');
    return sentence.replace(regex, '<span class="masked-word">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span>');
}