# -*- coding: utf-8 -*-
"""
Etymology Visualizer 音频缓存生成脚本 (v3.1 - 优化文件名)

功能:
1. 自动读取 `data/manifest.js` 文件，获取所有单词数据源。
2. 解析新的JSON数据结构，能够处理单个文件内包含多个 "meanings" (意境) 数组的情况。
3. 聚合所有唯一的单词和例句。
4. 使用 Google Text-to-Speech (gTTS) 服务，为每个单词和例句生成对应的英文发音 MP3 文件。
5. 【优化】为例句生成基于其内容的文件名，避免因顺序变化或内容相似导致的重复或冲突。
6. 将生成的音频文件保存到 `audio/words` 和 `audio/sentences` 目录中。
7. 具有缓存检查功能：如果音频文件已存在且有效，则会跳过。

使用方法:
1. 确保已安装 Python 3 和必要的库:
   pip install gtts mutagen
2. 将此脚本放置在项目根目录下。
3. 在终端中运行此脚本:
   python generate_audio.py
"""

import os
import json
import re
import time
from pathlib import Path
from gtts import gTTS
from mutagen.mp3 import MP3, HeaderNotFoundError

# --- 配置区域 ---
MANIFEST_PATH = Path("data/manifest.js")
AUDIO_ROOT = Path("audio")
WORDS_DIR = AUDIO_ROOT / "words"
SENTENCES_DIR = AUDIO_ROOT / "sentences"
REQUEST_DELAY = 0.5
MIN_FILE_SIZE_BYTES = 1024  # 1 KB
MAX_FILENAME_SLUG_LENGTH = 60 # <--- 优化点: 新增配置，限制例句文件名片段的最大长度

# --- 脚本核心逻辑 ---

def parse_manifest(manifest_path: Path) -> list[Path]:
    """
    解析 data-manifest.js 文件，提取其中 DATA_FILES 数组中的所有 JSON 文件路径。
    """
    print(f"📄 正在解析数据清单: {manifest_path}")
    if not manifest_path.exists():
        print(f"❌ 错误: 未找到数据清单文件 '{manifest_path}'。请确保脚本位置正确。")
        return []

    try:
        content = manifest_path.read_text(encoding='utf-8')
        match = re.search(r"const DATA_FILES\s*=\s*\[(.*?)\];", content, re.DOTALL)
        if not match:
            print(f"❌ 错误: 无法在 '{manifest_path}' 中找到 'DATA_FILES' 数组。")
            return []

        file_paths_str = match.group(1)
        file_paths_str = re.sub(r'//.*', '', file_paths_str)
        paths = [p.strip() for p in re.findall(r"['\"](.*?)['\"]", file_paths_str)]

        absolute_paths = [Path(p) for p in paths if p]
        print(f"   - 成功找到 {len(absolute_paths)} 个数据文件。")
        return absolute_paths
    except Exception as e:
        print(f"❌ 错误: 解析清单文件时发生意外错误: {e}")
        return []


def aggregate_data(file_paths: list[Path]) -> tuple[set[str], dict[str, list[str]]]:
    """
    遍历所有数据文件，聚合所有唯一的单词和例句。
    【核心修改】现在会处理新的嵌套式JSON结构。

    Args:
        file_paths: 数据文件的路径列表。

    Returns:
        一个元组，包含:
        - unique_words (set): 所有唯一单词的小写集合。
        - unique_sentences (dict): {单词: [例句1, 例句2, ...]} 的字典。
    """
    unique_words = set()
    unique_sentences = {}
    total_sentence_count = 0

    print("\n📦 正在聚合所有单词和例句...")
    for file_path in file_paths:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

                if "meanings" not in data or not isinstance(data["meanings"], list):
                    print(f"   - [警告] 文件 '{file_path}' 缺少 'meanings' 数组，已跳过。")
                    continue

                for meaning_group in data["meanings"]:
                    if "words" not in meaning_group or not isinstance(meaning_group["words"], list):
                        continue

                    for word_data in meaning_group["words"]:
                        word = word_data.get("word")
                        sentences_list = word_data.get("sentences")

                        if word:
                            word_lower = word.lower()
                            unique_words.add(word_lower)

                            if sentences_list and isinstance(sentences_list, list):
                                if word_lower not in unique_sentences:
                                    unique_sentences[word_lower] = []

                                for sentence_obj in sentences_list:
                                    if isinstance(sentence_obj, dict) and 'en' in sentence_obj:
                                        sentence_en = sentence_obj['en'].strip()
                                        if sentence_en and sentence_en not in unique_sentences[word_lower]:
                                            unique_sentences[word_lower].append(sentence_en)
                                            total_sentence_count += 1

        except json.JSONDecodeError:
            print(f"   - [警告] 文件 '{file_path}' 不是有效的 JSON 文件，已跳过。")
        except FileNotFoundError:
            print(f"   - [警告] 未找到文件 '{file_path}'，已跳过。")
        except Exception as e:
            print(f"   - [错误] 处理文件 '{file_path}' 时出错: {e}")

    print(f"   - 聚合完成: 找到 {len(unique_words)} 个独立单词，{total_sentence_count} 条独立例句。")
    return unique_words, unique_sentences


# <--- 优化点: 新增辅助函数，用于将句子转换为安全的文件名 "slug"
def sanitize_for_filename(text: str, max_length: int = MAX_FILENAME_SLUG_LENGTH) -> str:
    """
    将文本转换为一个对文件名安全、唯一的“slug”。

    1. 转换为小写。
    2. 将所有非字母数字字符替换为下划线。
    3. 压缩连续的下划线为一个。
    4. 截断到最大长度。
    5. 清理首尾的下划线。
    """
    # 转换为小写
    slug = text.lower()
    # 将所有非字母和非数字的字符替换为下划线
    slug = re.sub(r'[^a-z0-9]+', '_', slug)
    # 截断以避免文件名过长
    if len(slug) > max_length:
        slug = slug[:max_length]
    # 清理可能出现在开头或结尾的下划线
    slug = slug.strip('_')
    return slug


def generate_audio_file(text: str, output_path: Path) -> bool:
    """
    为给定的文本生成音频文件，并进行缓存检查。
    """
    if output_path.exists() and output_path.stat().st_size >= MIN_FILE_SIZE_BYTES:
        try:
            MP3(output_path)
            # 文件存在且有效，跳过
            return True
        except HeaderNotFoundError:
            print(f"  [警告] '{output_path.name}' 已存在但文件损坏，将重新生成。")
        except Exception as e:
            print(f"  [警告] 检查 '{output_path.name}' 时出错 ({e})，将重新生成。")

    try:
        print(f"  [生成] 正在请求 '{output_path.name}'...")
        tts = gTTS(text=text, lang='en', slow=False)
        tts.save(str(output_path))
        time.sleep(REQUEST_DELAY)
        return True
    except AssertionError:
        print(f"  [错误] 文本为空，无法为 '{output_path.name}' 生成音频。")
        return False
    except Exception as e:
        print(f"  [严重错误] 生成 '{output_path.name}' 失败: {e}")
        if output_path.exists():
            output_path.unlink() # 删除生成失败的空文件或损坏文件
        return False


def main():
    """脚本主执行函数"""
    print("=" * 50)
    print("🚀 开始执行 Etymology Visualizer 音频缓存生成脚本 🚀")
    print("=" * 50)

    WORDS_DIR.mkdir(parents=True, exist_ok=True)
    SENTENCES_DIR.mkdir(parents=True, exist_ok=True)
    print(f"✅ 输出目录已准备就绪:\n   - 单词: {WORDS_DIR}\n   - 例句: {SENTENCES_DIR}")

    data_files = parse_manifest(MANIFEST_PATH)
    if not data_files:
        print("\n❌ 未能从清单中获取任何数据文件，脚本终止。")
        return

    words, sentences_map = aggregate_data(data_files)
    if not words and not sentences_map:
        print("\n❌ 未能从数据文件中聚合任何单词或例句，脚本终止。")
        return

    # --- 开始生成单词音频 ---
    print("\n" + "-" * 20)
    print(f"🎤 开始处理 {len(words)} 个单词音频...")
    print("-" * 20)
    success_words, failed_words = 0, 0
    for i, word in enumerate(sorted(list(words)), 1):
        print(f"进度: {i}/{len(words)} - 单词: '{word}'")
        file_path = WORDS_DIR / f"{word}.mp3"
        if generate_audio_file(word, file_path):
            success_words += 1
        else:
            failed_words += 1

    # --- 开始生成例句音频 ---
    total_sentences = sum(len(s) for s in sentences_map.values())
    print("\n" + "-" * 20)
    print(f"🎧 开始处理 {total_sentences} 条例句音频...")
    print("-" * 20)
    success_sentences, failed_sentences = 0, 0
    processed_count = 0
    for word_key in sorted(sentences_map.keys()):
        sentence_list = sentences_map[word_key]
        for index, sentence in enumerate(sentence_list):
            processed_count += 1
            print(f"进度: {processed_count}/{total_sentences} - 单词 '{word_key}' 的例句 {index + 1}/{len(sentence_list)}")

            # <--- 优化点: 使用新的函数生成基于内容的文件名
            sentence_slug = sanitize_for_filename(sentence)
            filename = f"{word_key}_{sentence_slug}.mp3"
            # --->

            file_path = SENTENCES_DIR / filename
            if generate_audio_file(sentence, file_path):
                success_sentences += 1
            else:
                failed_sentences += 1

    # --- 最终报告 ---
    print("\n" + "=" * 50)
    print("🎉🎉🎉 所有任务执行完毕！🎉🎉🎉")
    print("=" * 50)
    print("📊 生成报告:")
    print(f"  - 单词音频: {success_words} 个成功, {failed_words} 个失败。")
    print(f"  - 例句音频: {success_sentences} 个成功, {failed_sentences} 个失败。")
    print("\n现在您的 'audio' 文件夹已是最新状态。")
    print("=" * 50)


if __name__ == "__main__":
    main()