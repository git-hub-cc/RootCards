// =================================================================================
// 数据与状态管理模块 (State Management Module) - v8.3 (统一阶段标识符)
// ---------------------------------------------------------------------------------
// 主要职责：
// 1. (数据加载) 异步加载所有词汇数据文件。
// 2. (数据处理) 将原始数据处理成应用所需的格式。
// 3. (状态管理) 维护全局数据和当前筛选状态。
// 4. (用户数据) 管理“已掌握”单词、“自定义单词本”以及“用户笔记”的增删改查。
// 5. (持久化) 负责 localStorage 的读写。
// =================================================================================

// --- 模块内常量 ---
const LEARNED_WORDS_KEY = 'etymologyLearnedWords';
const USER_WORDBOOKS_KEY = 'etymologyUserWordbooks';
const USER_NOTES_KEY = 'etymologyUserNotes';

// --- 导出的状态变量 (供其他模块读取和修改) ---
export let allVocabularyData = [];      // 存储所有已加载和处理过的数据
export let currentDataSet = [];         // 当前经过筛选后，需要被渲染的数据集
export let currentFilter = 'all';       // 当前类别筛选器状态
export let currentGrade = 'middle';     // 【修改】当前年级筛选器状态, 默认'middle'
export let currentContentType = 'pre';  // 当前内容类型筛选器状态
export let learnedWordsSet = new Set(); // 存储所有已掌握单词的 Set 集合
export let currentSearchQuery = '';     // 当前搜索框中的关键词
export let userWordbooks = [];          // 存储所有用户创建的单词本
export let userNotes = new Map();       // 存储用户笔记 Map<word, text>

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
 * 从 localStorage 加载用户笔记。
 */
export function loadUserNotes() {
    try {
        const storedNotes = localStorage.getItem(USER_NOTES_KEY);
        if (storedNotes) {
            const notesObj = JSON.parse(storedNotes);
            userNotes = new Map(Object.entries(notesObj));
        }
    } catch (error) {
        console.error('无法从 localStorage 加载用户笔记:', error);
        userNotes = new Map();
    }
}

/**
 * 保存用户笔记到 localStorage。
 */
function saveUserNotes() {
    try {
        const notesObj = Object.fromEntries(userNotes);
        localStorage.setItem(USER_NOTES_KEY, JSON.stringify(notesObj));
    } catch (error) {
        console.error('无法保存用户笔记到 localStorage:', error);
    }
}

/**
 * 获取指定单词的笔记内容。
 * @param {string} word - 单词文本
 * @returns {string} - 笔记内容，如果没有则返回空字符串
 */
export function getUserNote(word) {
    if (!word) return '';
    return userNotes.get(word.toLowerCase()) || '';
}

/**
 * 保存或更新指定单词的笔记。
 * 如果 text 为空，则删除该条笔记。
 * @param {string} word - 单词文本
 * @param {string} text - 笔记内容
 */
export function saveUserNote(word, text) {
    if (!word) return;
    const key = word.toLowerCase();
    const trimmedText = text ? text.trim() : '';

    if (trimmedText) {
        userNotes.set(key, trimmedText);
    } else {
        userNotes.delete(key);
    }
    saveUserNotes();
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

    const isDuplicate = userWordbooks.some(wb => wb.name === newName && wb.name !== oldName);
    if (isDuplicate) {
        throw new Error(`单词本名称 "${newName}" 已存在，请使用其他名称。`);
    }

    if (oldName) {
        const index = userWordbooks.findIndex(wb => wb.name === oldName);
        if (index > -1) {
            userWordbooks[index].name = newName;
            userWordbooks[index].words = words;
        } else {
            userWordbooks.push({ name: newName, words });
        }
    } else {
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
 * 清空所有“已掌握”的单词记录。
 */
export function clearLearnedWords() {
    learnedWordsSet.clear();
    allVocabularyData.forEach(item => {
        if (item.cardType === 'word') {
            item.isLearned = false;
        }
    });
    saveLearnedWords();
}

// =================================================================================
// 【核心修改区域】
// =================================================================================
/**
 * 根据文件路径判断其所属学习阶段。
 * @param {string} filePath - 文件的相对路径
 * @returns {string} - 学习阶段标识符 (e.g., 'middle', 'high', 'cet4', 'cet6')
 */
function getGradeFromFilePath(filePath) {
    if (filePath.includes('/CET-4/')) {
        return 'CET-4';
    }
    if (filePath.includes('/CET-6/')) {
        return 'CET-6';
    }
    // 【修改】将 'middle' (初中) 目录映射为 'middle' 标识符
    if (filePath.includes('/middle/')) {
        return 'middle';
    }
    if (filePath.includes('/high/')) {
        return 'high';
    }
    return 'unknown';
}
// =================================================================================


function getContentTypeFromFilePath(filePath) {
    if (filePath.includes('/pre/')) return 'pre';
    if (filePath.includes('/suf/')) return 'suf';
    if (filePath.includes('/root/')) return 'root';
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
            // 将 'middle', 'high', 'cet4' 等加入年级列表
            if (grade !== 'unknown') {
                grades.add(grade);
            }
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

    // 【修改】更新排序逻辑，使用 'middle'
    const gradeOrder = ['middle', 'high', 'cet4'];
    const sortedGrades = Array.from(grades).sort((a, b) => {
        const indexA = gradeOrder.indexOf(a);
        const indexB = gradeOrder.indexOf(b);
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
    });

    return { grades: sortedGrades };
}

/**
 * 【核心函数】根据当前所有筛选条件和搜索查询，更新 currentDataSet。
 */
export function filterAndPrepareDataSet() {
    let filteredData;

    // 阶段 1: 年级筛选
    if (currentGrade === 'all') {
        filteredData = allVocabularyData;
    } else {
        // 'middle' (初中) 会包含 middle 目录下的所有内容
        // 'high' (高中) 会包含 high 目录下的所有内容
        // 'cet4' (CET-4) 会包含 CET-4 目录下的所有内容
        filteredData = allVocabularyData.filter(item => item.grade === currentGrade);
    }

    // 阶段 2: 内容类型筛选
    if (currentContentType !== 'all') {
        filteredData = filteredData.filter(item => item.contentType === currentContentType);
    }

    // 阶段 3: 类别筛选
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
        filteredData = filteredData.filter(item =>
            item.type === currentFilter && (item.cardType === 'intro' || !item.isLearned)
        );
    }

    // 阶段 4: 搜索查询
    if (currentSearchQuery) {
        // 1. 准备匹配关键词列表，默认包含原始输入
        let searchTerms = [currentSearchQuery];

        // 【核心修改】利用主线程加载的 NLP 库进行词形还原
        // 检查 window.nlp 是否可用
        if (typeof window.nlp === 'function') {
            try {
                const doc = window.nlp(currentSearchQuery);
                // 计算 root (词根/原型)，例如: "remains" -> "remain", "studied" -> "study"
                doc.compute('root');
                const rootForm = doc.text('root'); // 获取处理后的词根文本

                // 如果算出了不一样的词根，加入匹配列表
                if (rootForm && rootForm !== currentSearchQuery) {
                    searchTerms.push(rootForm);
                }
            } catch (e) {
                // 即使 NLP 失败也不影响基础搜索
                console.warn('NLP processing failed in search:', e);
            }
        }

        const matchingWordCards = filteredData.filter(item => {
            if (item.cardType !== 'word' || !item.word) return false;
            const dbWord = item.word.toLowerCase();

            // 【核心逻辑】只要原始输入 OR 词根其中之一能匹配上数据库单词，即算成功
            // 1. dbWord.includes(term): 正向模糊匹配 (输入 "rem" -> 搜到 "remain")
            // 2. term === dbWord: 精确词根匹配 (NLP还原后 "remains" -> "remain" == "remain")
            // 3. term.startsWith(dbWord): 反向容错匹配 (输入 "remaining" -> 包含 "remain")
            return searchTerms.some(term =>
                dbWord.includes(term) || term.startsWith(dbWord)
            );
        });

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
        gradeFilteredData = allVocabularyData.filter(item => item.grade === currentGrade);
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