import json
import os
import re

# ================= 配置区域 =================
SOURCE_FILE = 'middle.md'       # A数组源文件
FILTER_DIR = 'middle'           # B数组源目录（包含很多json和子文件夹）
OUTPUT_FILE = 'remaining_words.txt'
# ===========================================

def extract_json_from_md(file_path):
    """
    读取 .md 文件，清洗 markdown 标记并解析 JSON
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # 尝试提取代码块
        match = re.search(r'```(?:md|json)?\s*(.*?)```', content, re.DOTALL)
        json_str = match.group(1).strip() if match else content

        # 简单的清理（针对不规范的结尾）
        # 如果文件结尾被截断，尝试补全（简单的尝试，不保证完美）
        if json_str.strip().endswith(','):
            json_str = json_str.strip()[:-1]

            # 解析
        # 注意：如果文件截断严重，这里可能会抛错，需要用户保证middle.md是合法的JSON片段
        try:
            data = json.loads(json_str)
        except json.JSONDecodeError:
            # 最后的挣扎：尝试手动补全闭合符号
            try:
                data = json.loads(json_str + "]}]") # 根据你的文件结构猜测
            except:
                print(f"❌ 解析 {file_path} 失败，请检查文件内容是否完整（括号是否闭合）。")
                return []

        # 提取 words
        words = []
        deep_extract_words(data, words) # 复用递归提取逻辑
        return words

    except FileNotFoundError:
        print(f"❌ 找不到文件 {file_path}")
        return []

def deep_extract_words(data, collection):
    """
    递归深入 JSON 的每一层，寻找单词。
    策略：
    1. 如果是字典，找 'words' 或 'word' 键。
    2. 如果是列表，遍历元素。
    3. 如果是字符串，收集它（视情况而定，这里主要收集列表里的字符串）。
    """
    if isinstance(data, dict):
        for key, value in data.items():
            # 策略：如果键名是 words, word, list, vocab 等，重点提取
            if key in ['words', 'word', 'vocabulary', 'list']:
                deep_extract_words(value, collection)
            else:
                # 否则继续递归寻找
                deep_extract_words(value, collection)

    elif isinstance(data, list):
        for item in data:
            if isinstance(item, str):
                # 过滤掉一些明显不是单词的垃圾数据（比如长度过长的句子）
                if len(item) < 30 and " " not in item.strip():
                    collection.append(item)
            else:
                deep_extract_words(item, collection)

    # 如果 data 本身就是字符串（在递归中被传入），通常由 list 循环处理，这里不做处理

def load_words_from_directory_recursive(directory):
    """
    递归遍历目录及其子目录下的所有 json 文件
    """
    all_words = []
    file_count = 0

    if not os.path.exists(directory):
        print(f"⚠️ 目录 '{directory}' 不存在。")
        return all_words

    # os.walk 可以穿透子文件夹
    for root, dirs, files in os.walk(directory):
        for filename in files:
            if filename.endswith('.json'):
                file_path = os.path.join(root, filename)
                file_count += 1
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        # 递归提取当前文件中的单词
                        deep_extract_words(data, all_words)
                except Exception as e:
                    # 打印出错的文件名，方便排查
                    print(f"⚠️ 读取文件出错: {file_path} -> {e}")

    print(f"📂 已扫描 {file_count} 个 JSON 文件。")
    return all_words

def main():
    print("🚀 开始处理...")

    # 1. 处理 A 数组
    list_a = extract_json_from_md(SOURCE_FILE)
    set_a = set(w.strip().lower() for w in list_a)
    print(f"✅ A 数组 (middle.md) 提取到: {len(set_a)} 个唯一单词")

    # 2. 处理 B 数组
    list_b = load_words_from_directory_recursive(FILTER_DIR)
    set_b = set(w.strip().lower() for w in list_b)
    print(f"✅ B 数组 (目录中所有json) 提取到: {len(set_b)} 个唯一单词")

    if len(set_b) == 0:
        print("⚠️ 警告: B数组依然为空！请检查 json 文件内容格式，或者是否真的包含单词。")

    # 3. 差集运算
    result_set = set_a - set_b
    result_list = sorted(list(result_set))

    print("-" * 40)
    print(f"📊 统计结果:")
    print(f"   A 原有: {len(set_a)}")
    print(f"   B 排除: {len(set_b)}")
    print(f"   剩余  : {len(result_list)}")
    print("-" * 40)

    # 4. 输出
    if result_list:
        with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
            f.write(f"--- 剩余单词 ({len(result_list)}) ---\n")
            for word in result_list:
                f.write(word + '\n')
        print(f"💾 结果已保存至: {OUTPUT_FILE}")
    else:
        print("⭕ 结果为空，A中的所有单词均在B中。")

if __name__ == "__main__":
    main()