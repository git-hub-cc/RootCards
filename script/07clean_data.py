import os
import json
import glob
from collections import defaultdict

# --- CONFIGURATION ---
# Priority order for deduplication. Lower index = higher priority.
PRIORITY_ORDER = ['pre', 'suf', 'root']
# Vocab files in the current directory to be cleaned.
VOCAB_FILENAME_PATTERN = 'vocab_*.json'
# Files to ignore completely during scanning.
IGNORE_FILES = ['manifest.json', 'package.json', os.path.basename(__file__)]

def load_json(filepath):
    """Safely loads a JSON file."""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"❌ Error loading {filepath}: {e}")
        return None

def save_json(filepath, data):
    """Saves data to a JSON file with consistent formatting."""
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"💾 Changes saved to: {filepath}")
    except Exception as e:
        print(f"❌ Error saving {filepath}: {e}")

def get_words_from_data(data):
    """Extracts all words from a standard data file structure."""
    words = set()
    if data and 'meanings' in data and isinstance(data['meanings'], list):
        for meaning in data['meanings']:
            if 'words' in meaning and isinstance(meaning['words'], list):
                for word_item in meaning['words']:
                    w_str = word_item.get('word', '').strip()
                    if w_str:
                        words.add(w_str)
    return words

def remove_words_from_data(data, words_to_remove_set):
    """Removes a set of words from a data object and returns the count of removed items."""
    removed_count = 0
    if data and 'meanings' in data:
        for meaning in data['meanings']:
            if 'words' in meaning:
                original_len = len(meaning['words'])
                meaning['words'] = [
                    w for w in meaning['words']
                    if w.get('word', '').strip() not in words_to_remove_set
                ]
                removed_count += (original_len - len(meaning['words']))
    return removed_count

def step_1_deduplicate_affixes():
    """
    Step 1: Automatically find and remove duplicate words across pre/suf/root directories
    based on the defined PRIORITY_ORDER.
    """
    print("\n=== 🔍 Step 1: Automatically cleaning duplicates in pre/suf/root... ===")

    word_file_map = defaultdict(list)
    all_affix_files = []

    for affix_dir in PRIORITY_ORDER:
        if os.path.exists(affix_dir):
            all_affix_files.extend(glob.glob(os.path.join(affix_dir, '*.json')))

    for filepath in all_affix_files:
        data = load_json(filepath)
        if not data: continue

        words_in_file = get_words_from_data(data)
        for word in words_in_file:
            word_file_map[word].append(filepath)

    duplicates = {word: files for word, files in word_file_map.items() if len(files) > 1}

    if not duplicates:
        print("✅ No duplicate words found across pre/suf/root directories.")
        return set(word_file_map.keys())

    print(f"⚠️ Found {len(duplicates)} duplicate words. Resolving automatically...")

    for word, files in duplicates.items():
        best_file = None
        best_priority = float('inf')

        # Determine the file with the highest priority to keep the word
        for f in sorted(files): # Sort files alphabetically to handle ties consistently
            dir_name = os.path.basename(os.path.dirname(f))
            try:
                priority = PRIORITY_ORDER.index(dir_name)
                if priority < best_priority:
                    best_priority = priority
                    best_file = f
            except ValueError:
                # This directory is not in our priority list, give it lowest priority
                continue

        if not best_file:
            print(f"   - Skipping '{word}': Could not determine priority for its files.")
            continue

        files_to_remove_from = [f for f in files if f != best_file]
        print(f"🔸 For word '{word}':")
        print(f"   - ✅ Keeping in: {best_file} (Highest priority)")

        # Perform the removal from lower-priority files
        for f_path in files_to_remove_from:
            data = load_json(f_path)
            if remove_words_from_data(data, {word}) > 0:
                print(f"   - ➖ Removing from: {f_path}")
                save_json(f_path, data)

    # After cleaning, rescan to get the final set of unique affix words
    final_affix_words = set()
    for filepath in all_affix_files:
        data = load_json(filepath)
        if data:
            final_affix_words.update(get_words_from_data(data))

    return final_affix_words

def step_2_clean_vocab(affix_words_set):
    """
    Step 2: Scans vocab_*.json files in the current directory and removes any words
    that are already present in the affix_words_set.
    """
    print("\n=== 🧹 Step 2: Cleaning general vocabulary files (vocab_*.json)... ===")

    vocab_files = [f for f in glob.glob(VOCAB_FILENAME_PATTERN) if f not in IGNORE_FILES]

    if not vocab_files:
        print("⚠️ No vocab_*.json files found in the current directory.")
        return

    total_removed = 0

    for filepath in vocab_files:
        data = load_json(filepath)
        if not data: continue

        count = remove_words_from_data(data, affix_words_set)

        if count > 0:
            print(f"📄 In {filepath}: Removed {count} words already defined in pre/suf/root.")
            save_json(filepath, data)
            total_removed += count
        else:
            print(f"✅ No conflicts in {filepath}. No changes needed.")

    print(f"\n🎉 Finished! Total of {total_removed} duplicate words removed from vocab files.")

if __name__ == "__main__":
    print(f"📂 Running script in: {os.getcwd()}")
    if not any(os.path.exists(d) for d in PRIORITY_ORDER):
        print("❌ CRITICAL: No 'pre', 'suf', or 'root' directories found. Please run this script from the correct 'middle', 'high', etc. directory.")
        exit()

    confirm = input("⚠️ This script will automatically modify JSON files based on a pre-defined priority (pre > suf > root).\nEnsure you have backed up your data.\n\nPress Enter to continue, or type 'q' and Enter to quit: ")
    if confirm.lower() != 'q':
        final_affix_word_set = step_1_deduplicate_affixes()
        step_2_clean_vocab(final_affix_word_set)
    else:
        print("Operation cancelled by user.")