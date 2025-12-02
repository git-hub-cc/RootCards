# -*- coding: utf-8 -*-
"""
Etymology Visualizer 音频缓存生成脚本 (v3.2 - 新增慢速音频)

功能:
1. 自动读取 `data/manifest.js` 文件，获取所有单词数据源。
2. 解析新的JSON数据结构，能够处理单个文件内包含多个 "meanings" (意境) 数组的情况。
3. 聚合所有唯一的单词和例句。
4. 使用 Google Text-to-Speech (gTTS) 服务，为每个单词和例句生成对应的英文发音 MP3 文件。
5. 【新增功能】为每个单词额外生成一个慢速版本的发音文件 (文件名以 _slow.mp3 结尾)。
6. 为例句生成基于其内容的文件名，避免因顺序变化或内容相似导致的重复或冲突。
7. 将生成的音频文件保存到 `audio/words` 和 `audio/sentences` 目录中。
8. 具有缓存检查功能：如果音频文件已存在且有效，则会跳过。

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
MAX_FILENAME_SLUG_LENGTH = 60

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


def sanitize_for_filename(text: str, max_length: int = MAX_FILENAME_SLUG_LENGTH) -> str:
    """
    将文本转换为一个对文件名安全、唯一的“slug”。
    """
    slug = text.lower()
    slug = re.sub(r'[^a-z0-9]+', '_', slug)
    if len(slug) > max_length:
        slug = slug[:max_length]
    slug = slug.strip('_')
    return slug


# 【核心修改】函数签名增加 is_slow 参数
def generate_audio_file(text: str, output_path: Path, is_slow: bool = False) -> bool:
    """
    为给定的文本生成音频文件，并进行缓存检查。

    :param text: 要转换为语音的文本。
    :param output_path: 音频文件的输出路径。
    :param is_slow: 是否生成慢速版本的音频。
    :return: 生成成功返回 True，否则返回 False。
    """
    # 1. 缓存检查：如果文件已存在且有效，则跳过
    if output_path.exists() and output_path.stat().st_size >= MIN_FILE_SIZE_BYTES:
        try:
            MP3(output_path)
            # 文件有效，直接返回成功
            return True
        except HeaderNotFoundError:
            print(f"  [警告] '{output_path.name}' 已存在但文件损坏，将重新生成。")
        except Exception as e:
            print(f"  [警告] 检查 '{output_path.name}' 时出错 ({e})，将重新生成。")

    # 2. 文件生成
    try:
        speed_str = "慢速" if is_slow else "正常"
        print(f"  [生成] 正在请求 '{output_path.name}' ({speed_str})...")

        # 【核心修改】根据 is_slow 参数决定 gTTS 的 slow 属性
        tts = gTTS(text=text, lang='en', slow=is_slow)
        tts.save(str(output_path))

        # 在每次请求后稍作延迟，避免对API造成过大压力
        time.sleep(REQUEST_DELAY)
        return True
    except AssertionError:
        print(f"  [错误] 文本为空，无法为 '{output_path.name}' 生成音频。")
        return False
    except Exception as e:
        print(f"  [严重错误] 生成 '{output_path.name}' 失败: {e}")
        # 如果生成失败，删除可能已创建的空文件或损坏文件，确保下次能重新生成
        if output_path.exists():
            output_path.unlink()
        return False


def main():
    """脚本主执行函数"""
    print("=" * 50)
    print("🚀 开始执行 Etymology Visualizer 音频缓存生成脚本 🚀")
    print("=" * 50)

    # 确保输出目录存在
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
    print(f"🎤 开始处理 {len(words)} 个单词音频 (每词2种速度)...")
    print("-" * 20)
    success_words, failed_words = 0, 0
    total_word_audios = len(words) * 2  # 每个单词生成两种速度
    processed_word_audios = 0

    for i, word in enumerate(sorted(list(words)), 1):
        print(f"进度: {i}/{len(words)} - 单词: '{word}'")

        # --- 【核心修改】为每个单词生成两种速度的音频 ---
        # 1. 生成正常速度音频
        normal_path = WORDS_DIR / f"{word}.mp3"
        processed_word_audios += 1
        print(f"   ({processed_word_audios}/{total_word_audios})", end="")
        if generate_audio_file(word, normal_path, is_slow=False):
            success_words += 1
        else:
            failed_words += 1

        # 2. 生成慢速音频
        slow_path = WORDS_DIR / f"{word}_slow.mp3"
        processed_word_audios += 1
        print(f"   ({processed_word_audios}/{total_word_audios})", end="")
        if generate_audio_file(word, slow_path, is_slow=True):
            success_words += 1
        else:
            failed_words += 1

    # --- 开始生成例句音频 (例句通常只需正常速度) ---
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

            sentence_slug = sanitize_for_filename(sentence)
            filename = f"{word_key}_{sentence_slug}.mp3"
            file_path = SENTENCES_DIR / filename

            # 例句默认使用正常速度
            if generate_audio_file(sentence, file_path, is_slow=False):
                success_sentences += 1
            else:
                failed_sentences += 1

    # --- 最终报告 ---
    print("\n" + "=" * 50)
    print("🎉🎉🎉 所有任务执行完毕！🎉🎉🎉")
    print("=" * 50)
    print("📊 生成报告:")
    print(f"  - 单词音频: {success_words} 个成功, {failed_words} 个失败。 (共计 {total_word_audios} 个文件)")
    print(f"  - 例句音频: {success_sentences} 个成功, {failed_sentences} 个失败。")
    print("\n现在您的 'audio' 文件夹已是最新状态。")
    print("=" * 50)


if __name__ == "__main__":
    main()