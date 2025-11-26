# -*- coding: utf-8 -*-
"""
Etymology Visualizer 音频缓存生成脚本

功能:
1. 自动读取 `js/data-manifest.js` 文件，获取所有单词数据源。
2. 解析 JSON 数据文件，提取所有唯一的单词和例句。
3. 使用 Google Text-to-Speech (gTTS) 服务，为每个单词和例句生成对应的英文发音 MP3 文件。
4. 将生成的音频文件保存到 `audio/words` 和 `audio/sentences` 目录中。
5. [核心] 脚本具有缓存检查功能：如果音频文件已存在且有效，则会跳过，大大提高二次运行的速度。

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

# 数据清单文件的路径
MANIFEST_PATH = Path("js/data-manifest.js")
# JSON 数据文件所在的根目录
DATA_ROOT = Path("data")
# 音频文件输出的根目录
AUDIO_ROOT = Path("audio")
# 单词音频输出目录
WORDS_DIR = AUDIO_ROOT / "words"
# 例句音频输出目录
SENTENCES_DIR = AUDIO_ROOT / "sentences"

# 每次请求 gTTS API 后的延迟时间（秒），避免因请求过快被服务器封禁
REQUEST_DELAY = 0.5
# 用于判断现有文件是否有效的最小文件大小（字节）。小于此值的文件将被视为无效并重新生成。
MIN_FILE_SIZE_BYTES = 1024  # 1 KB

# --- 脚本核心逻辑 ---

def parse_manifest(manifest_path: Path) -> list[Path]:
    """
    解析 data-manifest.js 文件，提取其中 DATA_FILES 数组中的所有 JSON 文件路径。

    Args:
        manifest_path: data-manifest.js 的路径对象。

    Returns:
        一个包含所有数据文件绝对路径的列表。
    """
    print(f"📄 正在解析数据清单: {manifest_path}")
    if not manifest_path.exists():
        print(f"❌ 错误: 未找到数据清单文件 '{manifest_path}'。请确保脚本位置正确。")
        return []

    try:
        content = manifest_path.read_text(encoding='utf-8')
        # 使用正则表达式匹配 DATA_FILES 数组的内容
        match = re.search(r"const DATA_FILES\s*=\s*\[(.*?)\];", content, re.DOTALL)
        if not match:
            print(f"❌ 错误: 无法在 '{manifest_path}' 中找到 'DATA_FILES' 数组。")
            return []

        # 提取数组内容，去除注释、空格和引号，并过滤空行
        file_paths_str = match.group(1)
        # 移除行注释
        file_paths_str = re.sub(r'//.*', '', file_paths_str)
        # 提取引号内的路径
        paths = [p.strip() for p in re.findall(r"['\"](.*?)['\"]", file_paths_str)]

        # 转换为 Path 对象
        absolute_paths = [Path(p) for p in paths if p]
        print(f"   - 成功找到 {len(absolute_paths)} 个数据文件。")
        return absolute_paths
    except Exception as e:
        print(f"❌ 错误: 解析清单文件时发生意外错误: {e}")
        return []


def aggregate_data(file_paths: list[Path]) -> tuple[set[str], dict[str, str]]:
    """
    遍历所有数据文件，聚合所有唯一的单词和例句。

    Args:
        file_paths: 数据文件的路径列表。

    Returns:
        一个元组，包含:
        - unique_words (set): 所有唯一单词的小写集合。
        - unique_sentences (dict): {例句: 对应单词的小写} 的字典。
    """
    unique_words = set()
    unique_sentences = {}

    print("\n📦 正在聚合所有单词和例句...")
    for file_path in file_paths:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)
                if "words" in data and isinstance(data["words"], list):
                    for word_data in data["words"]:
                        word = word_data.get("word")
                        sentence = word_data.get("sentence")
                        if word:
                            word_lower = word.lower()
                            unique_words.add(word_lower)
                            if sentence:
                                # 使用字典确保每个例句只被添加一次
                                unique_sentences[sentence] = word_lower
        except json.JSONDecodeError:
            print(f"   - [警告] 文件 '{file_path}' 不是有效的 JSON 文件，已跳过。")
        except FileNotFoundError:
            print(f"   - [警告] 未找到文件 '{file_path}'，已跳过。")
        except Exception as e:
            print(f"   - [错误] 处理文件 '{file_path}' 时出错: {e}")

    print(f"   - 聚合完成: 找到 {len(unique_words)} 个独立单词，{len(unique_sentences)} 条独立例句。")
    return unique_words, unique_sentences


def generate_audio_file(text: str, output_path: Path) -> bool:
    """
    为给定的文本生成音频文件，并进行缓存检查。

    Args:
        text: 需要转换为语音的文本。
        output_path: MP3 文件的输出路径。

    Returns:
        True 表示成功（或已缓存），False 表示失败。
    """
    # 1. 缓存检查：如果文件存在且有效，则跳过
    if output_path.exists() and output_path.stat().st_size >= MIN_FILE_SIZE_BYTES:
        try:
            # 使用 mutagen 尝试读取文件，验证其为有效的 MP3
            MP3(output_path)
            # print(f"  [跳过] '{output_path.name}' 已存在且有效。")
            return True
        except HeaderNotFoundError:
            print(f"  [警告] '{output_path.name}' 已存在但文件损坏，将重新生成。")
        except Exception as e:
            print(f"  [警告] 检查 '{output_path.name}' 时出错 ({e})，将重新生成。")

    # 2. 生成文件
    try:
        print(f"  [生成] 正在请求 '{output_path.name}'...")
        tts = gTTS(text=text, lang='en', slow=False)
        tts.save(str(output_path))  # gTTS 的 save 方法需要字符串路径
        # print(f"  [成功] 已保存 '{output_path.name}'")
        time.sleep(REQUEST_DELAY)  # 礼貌性延迟
        return True
    except AssertionError:
        # gTTS 在没有文本时会抛出 AssertionError
        print(f"  [错误] 文本为空，无法为 '{output_path.name}' 生成音频。")
        return False
    except Exception as e:
        print(f"  [严重错误] 生成 '{output_path.name}' 失败: {e}")
        # 如果生成失败，删除可能已创建的空文件或损坏文件
        if output_path.exists():
            output_path.unlink()
        return False


def main():
    """脚本主执行函数"""
    print("=" * 50)
    print("🚀 开始执行 Etymology Visualizer 音频缓存生成脚本 🚀")
    print("=" * 50)

    # 1. 确保输出目录存在
    WORDS_DIR.mkdir(parents=True, exist_ok=True)
    SENTENCES_DIR.mkdir(parents=True, exist_ok=True)
    print(f"✅ 输出目录已准备就绪:\n   - 单词: {WORDS_DIR}\n   - 例句: {SENTENCES_DIR}")

    # 2. 解析清单并聚合数据
    data_files = parse_manifest(MANIFEST_PATH)
    if not data_files:
        print("\n❌ 未能从清单中获取任何数据文件，脚本终止。")
        return

    words, sentences = aggregate_data(data_files)
    if not words and not sentences:
        print("\n❌ 未能从数据文件中聚合任何单词或例句，脚本终止。")
        return

    # --- 开始生成单词音频 ---
    print("\n" + "-" * 20)
    print(f"🎤 开始处理 {len(words)} 个单词音频...")
    print("-" * 20)

    success_words, failed_words = 0, 0
    # 排序以保证每次运行顺序一致
    for i, word in enumerate(sorted(list(words)), 1):
        print(f"进度: {i}/{len(words)} - 单词: '{word}'")
        file_path = WORDS_DIR / f"{word}.mp3"
        if generate_audio_file(word, file_path):
            success_words += 1
        else:
            failed_words += 1

    # --- 开始生成例句音频 ---
    print("\n" + "-" * 20)
    print(f"🎧 开始处理 {len(sentences)} 条例句音频...")
    print("-" * 20)

    success_sentences, failed_sentences = 0, 0
    # 排序以保证每次运行顺序一致
    sorted_sentences = sorted(sentences.items(), key=lambda item: item[1])
    for i, (sentence, word_key) in enumerate(sorted_sentences, 1):
        # 文件名使用其对应的单词来命名，与前端逻辑保持一致
        filename = f"{word_key}_sentence.mp3"
        print(f"进度: {i}/{len(sentences)} - 例句 for '{word_key}'")
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