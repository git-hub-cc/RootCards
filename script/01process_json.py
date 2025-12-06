import os
import re

def process_json_file(filepath):
    """
    读取一个JSON文件，将其中的 "word": "VALUE" 的 VALUE 部分转换为小写，并写回文件。
    """
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        # 正则表达式模式：
        # 捕获组1: ("word"\s*:\s*") - 匹配键、冒号、空格和开头的引号
        # 捕获组2: ([^"]*) - 匹配引号内的值（我们要修改的部分）
        # 捕获组3: (") - 匹配结尾的引号
        # 这种方式可以保留原始的格式（比如冒号后的空格）
        pattern = re.compile(r'("word"\s*:\s*")([^"]*)(")')

        # 使用 re.subn 来执行替换并获取替换次数
        # lambda 函数用于构建替换后的字符串
        # m.group(1) 是前缀，m.group(2) 是需要转换的值，m.group(3) 是后缀
        new_content, num_replacements = pattern.subn(
            lambda m: m.group(1) + m.group(2).lower() + m.group(3),
            content
        )

        # 只有在内容发生改变时才写回文件
        if num_replacements > 0:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"✅ 更新了文件: {filepath} ({num_replacements} 处替换)")
        else:
            print(f"⚪ 跳过文件: {filepath} (未找到匹配项或无需更改)")

    except FileNotFoundError:
        print(f"❌ 错误: 文件未找到 {filepath}")
    except Exception as e:
        print(f"❌ 处理文件时发生未知错误 {filepath}: {e}")

def main():
    """
    主函数，遍历当前目录及子目录，处理所有.json文件。
    """
    # 获取脚本运行的当前目录
    start_dir = '.'
    print(f"--- 开始处理目录 '{os.path.abspath(start_dir)}' 中的 JSON 文件 ---")

    # 遍历目录树
    for root, _, files in os.walk(start_dir):
        for filename in files:
            # 检查文件是否为.json文件
            if filename.lower().endswith('.json'):
                # 构建完整的文件路径
                filepath = os.path.join(root, filename)
                process_json_file(filepath)

    print("\n--- 处理完成 ---")

if __name__ == "__main__":
    # 警告：此脚本会直接修改文件，建议在运行前备份您的数据。
    print("==========================================================")
    print("警告: 此脚本将直接修改当前目录及子目录下的.json文件。")
    print("建议在运行前备份您的数据。")
    print("==========================================================")

    # 在实际运行前给用户一个确认的机会
    # choice = input("是否继续? (y/n): ")
    # if choice.lower() == 'y':
    #     main()
    # else:
    #     print("操作已取消。")

    # 如果你确认要运行，可以直接调用 main()
    main()