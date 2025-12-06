import os
import re

def create_project_from_markdown(markdown_file):
    """
    读取 Markdown 文件，解析其中的文件路径和代码块，并生成项目文件。
    此版本已适配从 "01.md" 文件中提取文件路径和代码的格式。
    """
    if not os.path.exists(markdown_file):
        print(f"错误: 文件 '{markdown_file}' 未找到。")
        return

    with open(markdown_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # 更新正则表达式以匹配 "01.md" 的格式
    # 匹配格式：
    # #### [数字]. [动词] `path/to/file.ext`
    # ...
    # ```[language]
    # code content
    # ```

    # 正则表达式解释:
    # #### \d+\.\s(?:修改|新建)\s   -> 匹配 "#### 1. 修改 " 或 "#### 2. 新建 "
    # `(.+?)`                       -> (捕获组 1) 捕获反引号中的文件路径
    # \n.*?                         -> 非贪婪地匹配到代码块开始前的任何字符
    # ```(?:[\w+\-]+)?\n            -> 匹配代码块的起始标记，语言可选
    # (.*?)                         -> (捕获组 2) 捕获代码块内的所有内容
    # \n```                         -> 匹配代码块的结束标记
    # re.DOTALL (re.S)              -> 使 `.` 能够匹配换行符

    pattern = re.compile(r'#### \d+\.\s(?:修改|新建)\s`(.+?)`\n.*?```(?:[\w+\-]+)?\n(.*?)\n```', re.DOTALL)

    matches = pattern.findall(content)

    if not matches:
        print("在 Markdown 文件中未找到符合格式的文件块。")
        print("请确保格式为: #### 1. 新建 `path/to/file.json`")
        return

    print(f"找到 {len(matches)} 个文件待创建/更新。")

    for file_path, code_content in matches:
        file_path = file_path.strip()

        # 注意: 对于 manifest.js，脚本将用代码片段覆盖或创建文件。
        # 用户需要手动将其合并到现有文件中。
        if 'manifest.js' in file_path:
            print(f"注意: 将为 {file_path} 生成一个包含代码片段的文件。")
            print("您需要手动将此片段合并到您的主 manifest.js 文件中。")

        # 处理路径：确保目录存在
        directory = os.path.dirname(file_path)
        if directory and not os.path.exists(directory):
            try:
                os.makedirs(directory, exist_ok=True)
                print(f"已创建目录: {directory}")
            except OSError as e:
                print(f"创建目录 {directory} 时出错: {e}")
                continue

        # 写入文件
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(code_content)
            print(f"已生成: {file_path}")
        except IOError as e:
            print(f"写入文件 {file_path} 时出错: {e}")

if __name__ == "__main__":
    markdown_file = "01.md"  # 读取您提供的 Markdown 文件名

    if os.path.exists(markdown_file):
        print(f"开始从 '{markdown_file}' 生成项目文件...")
        create_project_from_markdown(markdown_file)
        print("\n项目文件生成完成。")
    else:
        print(f"错误: 文件 '{markdown_file}' 不在当前目录中。")
        print("请确保 '01.md' 文件和此脚本在同一个目录下。")