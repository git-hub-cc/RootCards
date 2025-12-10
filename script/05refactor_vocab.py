import json
import os
import glob
import re

# 1. 配置 A-Z 的象形描述 (Imagery)
# 这些描述来自之前的上下文，用于填充 prefixIntro -> imagery
ALPHABET_IMAGERY = {
    'A': "字母 A 像一座山峰，代表起点和高度。",
    'B': "字母 B 像一个孕妇或两块木板（代表依靠、阻挡或膨胀）。",
    'C': "字母 C 像一只手做抓取的动作（或张开的嘴/包围圈）。",
    'D': "字母 D 像一个大肚子或弓（代表向下 Down 或坚固的大坝 Dam）。",
    'E': "字母 E 像一只眼睛（Eye）或向外张望的窗户，常含“向外”之意。",
    'F': "字母 F 像随风飘扬的旗帜（Flag）或羽毛（Feather），代表“飞翔、手”的概念。",
    'G': "字母 G 像地球（Globe）或握紧拳头的手，常含“生长（Grow）、大地”之意。",
    'H': "字母 H 像梯子或篱笆（Hurdle），常含“高处（High）、阻挡、抓持”之意。",
    'I': "字母 I 像一个人（I）站立或一根冰柱（Ice），常含“独立、个體”之意。",
    'J': "字母 J 像一个钩子或喷射的水柱（Jet），常含“连接（Join）、跳跃”之意。",
    'K': "字母 K 像张开的嘴或踢腿（Kick）动作，常含“张开、打击”之意。",
    'L': "字母 L 像一条长线（Line）或腿（Leg），常含“长、流动、延伸”之意。",
    'M': "字母 M 像连绵的山峦（Mountain）或牙齿，常含“多（Many）、移动、大”之意。",
    'N': "字母 N 像连接两点的通道或鼻子（Nose），常含“连接、否定（No）”之意。",
    'O': "字母 O 像太阳、嘴巴或圆圈，常含“圆、完整、开口（Open）”之意。",
    'P': "字母 P 像手掌（Palm）或长矛，常含“向前推（Push）、尖端”之意。",
    'Q': "字母 Q 像戴皇冠的王后（Queen）或问号（Question），常含“询问、追求”之意。",
    'R': "字母 R 像发芽的根（Root）或奔跑的人（Run），常含“生长、发散、强壮”之意。",
    'S': "字母 S 像一条蛇（Snake）或弯曲的河流，常含“弯曲、发出声音、视觉（See）”之意。",
    'T': "字母 T 像一棵树（Tree）或支撑物，常含“接触（Touch）、延伸、支撑”之意。",
    'U': "字母 U 像一个杯子或容器（Urn），常含“容纳、下面（Under）”之意。",
    'V': "字母 V 像山谷（Valley）或视线发散（View），常含“空、观看、旋转”之意。",
    'W': "字母 W 像水的波纹（Water）或波浪，常含“水、行走（Walk）、摆动”之意。",
    'X': "字母 X 像交叉符号或剪刀，常含“未知、交叉、错误”之意。",
    'Y': "字母 Y 像树枝分叉或嫩芽，常含“产出（Yield）、年轻（Young）”之意。",
    'Z': "字母 Z 像之字形路（Zigzag），常含“曲折、极大/极小（Zero）”之意。"
}

# 颜色池，用于循环分配给不同字母的主题色
THEME_COLORS = [
    "#6366f1", "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
    "#8b5cf6", "#ec4899", "#06b6d4", "#f97316", "#84cc16"
]

def get_theme_color(index):
    return THEME_COLORS[index % len(THEME_COLORS)]

def main():
    # 初始化存储容器，a-z
    words_bucket = {chr(i): [] for i in range(ord('a'), ord('z') + 1)}

    # 2. 读取当前目录下的所有 json 文件
    json_files = glob.glob("*.json")
    # 排除自己生成的 output 目录（虽然 glob 默认不递归，但为了安全）

    print(f"Found {len(json_files)} JSON files. Processing...")

    for file_path in json_files:
        # 跳过看起来像是我们即将生成的文件格式（避免重复处理）
        if re.match(r'vocab_[a-z]\.json', file_path):
            print(f"Skipping potential output file: {file_path}")
            continue

        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                data = json.load(f)

            # 遍历 meanings 数组
            if "meanings" in data and isinstance(data["meanings"], list):
                for meaning in data["meanings"]:
                    if "words" in meaning and isinstance(meaning["words"], list):
                        for word_obj in meaning["words"]:
                            word_text = word_obj.get("word", "").strip()
                            if word_text:
                                first_char = word_text[0].lower()
                                if 'a' <= first_char <= 'z':
                                    words_bucket[first_char].append(word_obj)
                                else:
                                    # 处理非字母开头的情况，如果需要可以放在 bucket['other']
                                    pass
        except Exception as e:
            print(f"Error reading {file_path}: {e}")

    # 3. 创建输出目录
    output_dir = "../data/middle/output_vocab"
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    # 4. 生成新的 JSON 文件
    count_files = 0

    # 按字母顺序处理 a-z
    for i, char_code in enumerate(range(ord('a'), ord('z') + 1)):
        char = chr(char_code)
        upper_char = char.upper()
        word_list = words_bucket[char]

        # 如果这个字母没有单词，是否生成文件？
        # 这里设定：如果没有单词，跳过不生成
        if not word_list:
            continue

        # 对单词列表按字母顺序排序
        word_list.sort(key=lambda x: x['word'].lower())

        # 构建输出结构
        output_data = {
            "prefix": f"Vocab {upper_char}",
            "affixType": "topic",
            "meanings": [
                {
                    "meaningId": f"vocab_{char}",
                    "displayName": f"Vocabulary {upper_char}",
                    "themeColor": get_theme_color(i),
                    "prefixIntro": {
                        "title": f"{upper_char} 开头核心词",
                        "description": f"高中阶段 {upper_char} 开头的高频混合词汇。",
                        "imagery": ALPHABET_IMAGERY.get(upper_char, f"字母 {upper_char} 的核心词汇。")
                    },
                    "words": word_list
                }
            ]
        }

        # 写入文件
        filename = f"vocab_{char}.json"
        output_path = os.path.join(output_dir, filename)

        with open(output_path, 'w', encoding='utf-8') as outfile:
            json.dump(output_data, outfile, ensure_ascii=False, indent=2)

        count_files += 1
        print(f"Generated: {filename} ({len(word_list)} words)")

    print(f"\nDone! Generated {count_files} files in the '{output_dir}' directory.")

if __name__ == "__main__":
    main()