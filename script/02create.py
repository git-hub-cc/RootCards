import os
import re

def create_project_from_markdown(markdown_file):
    """
    读取 Markdown 文件，解析其中的文件路径和代码块，并生成项目文件。
    """
    if not os.path.exists(markdown_file):
        print(f"Error: File '{markdown_file}' not found.")
        return

    with open(markdown_file, 'r', encoding='utf-8') as f:
        content = f.read()

    # 正则表达式匹配文件名和代码块
    # 匹配格式：
    # ## 📄 文件: path/to/file.ext
    # ...
    # ```[language]
    # code content
    # ```

    # 解释正则:
    # ## 📄 文件: (.+?)  -> 捕获文件名
    # .*?               -> 非贪婪匹配中间可能的空行或分隔符
    # ```(?:[\w+\-]+)?\n(.*?)``` -> 捕获代码块内容 (忽略语言标记)
    # re.DOTALL (re.S)  -> 让 . 匹配换行符

    pattern = re.compile(r'## 📄 文件: (.+?)\n.*?```(?:[\w+\-]+)?\n(.*?)```', re.DOTALL)

    matches = pattern.findall(content)

    if not matches:
        print("No file blocks found in the markdown.")
        return

    print(f"Found {len(matches)} files to create.")

    for file_path, code_content in matches:
        file_path = file_path.strip()

        # 处理路径：确保目录存在
        directory = os.path.dirname(file_path)
        if directory and not os.path.exists(directory):
            try:
                os.makedirs(directory)
                print(f"Created directory: {directory}")
            except OSError as e:
                print(f"Error creating directory {directory}: {e}")
                continue

        # 写入文件
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                # 去除代码块末尾可能多余的换行符（通常markdown解析会带上末尾换行）
                # 但保留代码内部的空行
                f.write(code_content)
            print(f"Generated: {file_path}")
        except IOError as e:
            print(f"Error writing file {file_path}: {e}")

if __name__ == "__main__":
    markdown_file = "01.md" # 你的 Markdown 文件名

    # 简单的检查，防止在错误的目录下运行
    if os.path.exists(markdown_file):
        print("Starting project generation...")
        create_project_from_markdown(markdown_file)
        print("Project generation complete.")
    else:
        print(f"File '{markdown_file}' does not exist in the current directory.")
        print("Please create '01.md' and paste the project content into it.")