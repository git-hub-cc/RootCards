/**
 * =================================================================================
 * 全局配置 (Global Configuration) - v2.0 (新增翻译配置)
 * ---------------------------------------------------------------------------------
 * 职责:
 * 1. 集中管理 API 密钥和端点。
 * 2. 存储 LLM 模型的参数配置。
 * 3. 定义对话模式和翻译模式的 System Prompts。
 * =================================================================================
 */

// API 基础配置
export const API_CONFIG = {
    // 接口地址
    ENDPOINT: 'https://ppmc.club/webchat/api/v1/chat/completions',

    // API 密钥 (请在此处填入实际的 sk-xxxx)
    API_KEY: 'sk-xxxx',

    // 模型名称
    MODEL_NAME: 'THUDM/GLM-4-32B-0414',

    // 最大输出 Token 数
    MAX_TOKENS: 2048,

    // 是否开启流式传输
    STREAM: true,

    // 来源标识
    ORIGIN: 'https://ppmc.club',
    REFERER: 'https://ppmc.club/webchat-vue/'
};

// 对话引导配置
export const DIALOGUE_CONFIG = {
    // 每次发送给 AI 的“已掌握单词”最大样本数，防止 Token 溢出
    MAX_LEARNED_WORDS_CONTEXT: 100,

    // 系统提示词的基础角色
    SYSTEM_ROLE_NAME: 'system'
};

// 【新增】AI 翻译专用配置
export const TRANSLATE_CONFIG = {
    // 翻译专用的系统提示词，强制要求简洁、直接，无额外废话
    SYSTEM_PROMPT: "你是一个专业的英汉翻译助手。请将用户输入的英文直接翻译成地道、通顺的简体中文。如果输入是单词，直接给出词义；如果输入是句子，直接给出译文。不要包含任何解释、拼音、注音或开场白。只需输出中文结果。"
};