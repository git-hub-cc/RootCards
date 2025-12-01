// =================================================================================
// 数据与状态管理模块 (State Management Module) - v6.3 (解析英文类别名)
// ---------------------------------------------------------------------------------
// 主要职责：
// 1. (数据加载) 异步加载所有词汇数据文件。
// 2. (数据处理) 将原始数据处理成应用所需的格式。
// 3. (状态管理) 维护全局数据和当前筛选状态。
// 4. (数据操作) 【改动】在准备类别数据时，解析出纯英文的显示名，简化UI层逻辑。
// 5. (状态持久化) 负责从 localStorage 读取和保存用户学习进度。
// =================================================================================

// --- 模块内状态变量 ---
const LEARNED_WORDS_KEY = 'etymologyLearnedWords';

// --- 导出的状态变量 (其他模块可以读取和修改) ---
export let allVocabularyData = [];
export let currentDataSet = [];
export let currentFilter = 'all';
export let currentGrade = 'grade7';
export let currentContentType = 'pre';
export let learnedWordsSet = new Set();

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
export function saveLearnedWords() {
    try {
        const wordsArray = Array.from(learnedWordsSet);
        localStorage.setItem(LEARNED_WORDS_KEY, JSON.stringify(wordsArray));
    } catch (error) {
        console.error('无法保存学习进度到 localStorage:', error);
    }
}

/**
 * 切换一个单词的“已掌握”状态。
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
 * 从文件路径中解析年级信息。
 */
function getGradeFromFilePath(filePath) {
    const gradeMatch = filePath.match(/\/grade(\d+)\//);
    if (gradeMatch && gradeMatch[1]) {
        return `grade${gradeMatch[1]}`;
    }
    if (filePath.includes('/pre/') || filePath.includes('/suf/') || filePath.includes('/root/')) {
        return 'common';
    }
    return 'unknown';
}

/**
 * 从文件路径中解析内容类型信息。
 */
function getContentTypeFromFilePath(filePath) {
    if (filePath.includes('/pre/')) return 'pre';
    if (filePath.includes('/suf/')) return 'suf';
    if (filePath.includes('/root/')) return 'root';
    if (filePath.includes('/category/')) return 'category';
    if (filePath.includes('/root-') || filePath.includes('/prefix-') || filePath.includes('/suffix-')) {
        if (filePath.includes('/root-')) return 'root';
        if (filePath.includes('/prefix-')) return 'pre';
        if (filePath.includes('/suffix-')) return 'suf';
    }
    return 'category';
}

/**
 * 异步加载并处理所有数据文件。
 */
export async function loadAndProcessData() {
    if (typeof DATA_FILES === 'undefined' || !Array.isArray(DATA_FILES) || DATA_FILES.length === 0) {
        throw new Error("数据清单 'data-manifest.js' 未找到或为空。");
    }

    const grades = new Set();
    allVocabularyData = [];

    for (const file of DATA_FILES) {
        try {
            const response = await fetch(file);
            if (!response.ok) throw new Error(`网络错误，无法加载文件: ${file}`);
            const dataFile = await response.json();

            if (!dataFile.prefix || !Array.isArray(dataFile.meanings)) {
                console.warn(`文件 ${file} 格式不正确，已跳过。`);
                continue;
            }

            const grade = getGradeFromFilePath(file);
            if (grade.startsWith('grade')) {
                grades.add(grade);
            }
            const contentType = getContentTypeFromFilePath(file);
            const affixType = dataFile.affixType || 'prefix';

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
                    isLearned: cardType === 'word' ? learnedWordsSet.has(item.word) : false,
                    ...(cardType === 'intro' && { visual: meaningGroup.prefixVisual }),
                    ...(cardType === 'word' && { prefixVisual: meaningGroup.prefixVisual || '' })
                });

                if (meaningGroup.prefixIntro) {
                    allVocabularyData.push(processItem(meaningGroup.prefixIntro, 'intro'));
                }

                if (Array.isArray(meaningGroup.words)) {
                    const wordsData = meaningGroup.words.map(word => processItem(word, 'word'));
                    allVocabularyData.push(...wordsData);
                }
            }
        } catch (fileError) {
            console.error(`加载或处理文件 ${file} 时出错:`, fileError);
        }
    }

    return { grades: Array.from(grades).sort() };
}

/**
 * 根据当前筛选条件更新 currentDataSet。
 */
export function filterAndPrepareDataSet() {
    let gradeFilteredData;
    if (currentGrade === 'all') {
        gradeFilteredData = allVocabularyData;
    } else {
        gradeFilteredData = allVocabularyData.filter(
            item => item.grade === currentGrade || item.grade === 'common'
        );
    }

    let contentTypeFilteredData;
    if (currentContentType === 'all') {
        contentTypeFilteredData = gradeFilteredData;
    } else {
        contentTypeFilteredData = gradeFilteredData.filter(
            item => item.contentType === currentContentType
        );
    }

    if (currentFilter === 'learned') {
        currentDataSet = contentTypeFilteredData.filter(item => item.cardType === 'word' && item.isLearned);
    } else if (currentFilter === 'all') {
        currentDataSet = contentTypeFilteredData.filter(item => item.cardType === 'intro' || !item.isLearned);
    } else {
        currentDataSet = contentTypeFilteredData.filter(item =>
            item.type === currentFilter && (item.cardType === 'intro' || !item.isLearned)
        );
    }
}

/**
 * Fisher-Yates 洗牌算法。
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
 * 【改动】根据当前筛选动态获取可用的类别列表，并为每个类别生成纯英文的显示名。
 * @returns {Array<object>} - 一个包含唯一类别对象的数组，新增了 englishDisplayName 属性。
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
    if (currentContentType === 'all') {
        finalFilteredData = gradeFilteredData;
    } else {
        finalFilteredData = gradeFilteredData.filter(
            item => item.contentType === currentContentType
        );
    }

    const categoryMap = new Map();
    finalFilteredData.forEach(item => {
        if (!categoryMap.has(item.type)) {
            const originalDisplayName = item.displayName;
            let englishDisplayName = originalDisplayName; // 默认值

            // 【核心逻辑】根据内容类型解析出纯英文名
            if (item.contentType === 'category') {
                const match = originalDisplayName.match(/\(([^)]+)\)/);
                if (match && match[1]) {
                    englishDisplayName = match[1]; // 提取括号内的英文
                }
            }
            // 对于 pre, suf, root, 我们将在 UI 层使用 `prefix` 属性，所以这里无需处理

            categoryMap.set(item.type, {
                meaningId: item.type,
                displayName: originalDisplayName,
                englishDisplayName: englishDisplayName, // 新增的、处理过的英文名
                prefix: item.prefix,
                themeColor: item.themeColor,
                contentType: item.contentType
            });
        }
    });

    return Array.from(categoryMap.values());
}