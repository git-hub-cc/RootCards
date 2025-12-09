# -*- coding: utf-8 -*-

import json
import os
import shutil
from datetime import datetime

# --- 配置区域 ---

# 定义数据目录的根路径
DATA_DIR = '../data'

# 定义不需要去重的特殊目录关键字
# 这些是词根、前缀、后缀所在的目录
SPECIAL_DIRS = ('/pre/', '/root/', '/suf/')


def create_backup(source_dir: str) -> bool:
    """
    为指定目录创建一个带时间戳的备份。

    Args:
        source_dir (str): 需要备份的目录路径。

    Returns:
        bool: 如果备份成功或用户跳过，则返回 True，否则返回 False。
    """
    if not os.path.isdir(source_dir):
        print(f"❌ 错误: 找不到要备份的目录 '{source_dir}'。")
        return False

    timestamp = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    backup_dir = f"{source_dir}_backup_{timestamp}"

    # 增加用户交互，确保安全
    try:
        choice = input(f"⚠️ 警告: 此脚本将直接修改源文件。\n    是否要创建一个 '{backup_dir}' 备份目录? (Y/n): ").lower().strip()
    except EOFError: # 在某些非交互式环境中可能会出现
        choice = 'n'

    if choice == 'y' or choice == '':
        try:
            shutil.copytree(source_dir, backup_dir)
            print(f"✅ 成功创建备份: '{backup_dir}'")
            return True
        except Exception as e:
            print(f"❌ 备份失败: {e}")
            return False
    else:
        confirm_no_backup = input("❓ 确定要在没有备份的情况下继续吗? 这将直接覆盖原始文件。 (y/N): ").lower().strip()
        if confirm_no_backup == 'y':
            print("👍 已跳过备份，将直接修改原始文件。")
            return True
        else:
            print("🚫 操作已取消。")
            return False

def collect_word_data(file_paths: list[str]) -> tuple[dict, dict]:
    """
    阶段 1: 读取所有 JSON 文件，收集每个单词的数据和位置信息。

    Returns:
        tuple[dict, dict]:
        - word_data_map: {'word': {'canonical_data': {...}, 'locations': [...]}}
        - file_content_map: {'path/to/file.json': { original json content }}
    """
    word_data_map = {}
    file_content_map = {}

    print("\n[阶段 1/3] 🔍 正在收集所有文件中的单词数据...")

    for path in file_paths:
        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
            file_content_map[path] = data

            is_special = any(sd in path.replace('\\', '/') for sd in SPECIAL_DIRS)

            meanings = data.get('meanings', [])
            if not isinstance(meanings, list):
                continue

            for meaning_idx, meaning_group in enumerate(meanings):
                words_list = meaning_group.get('words', [])
                if not isinstance(words_list, list):
                    continue

                for word_idx, word_item in enumerate(words_list):
                    word = word_item.get('word')
                    if not isinstance(word, str) or not word:
                        continue

                    location_info = {
                        "path": path,
                        "is_special": is_special,
                        "meaning_idx": meaning_idx,
                        "word_idx": word_idx
                    }

                    if word not in word_data_map:
                        word_data_map[word] = {
                            "canonical_data": word_item, # 第一个遇到的版本作为权威版本
                            "locations": [location_info]
                        }
                    else:
                        word_data_map[word]["locations"].append(location_info)
        except Exception as e:
            print(f"⚠️ 警告: 读取文件 '{path}' 失败: {e}，已跳过。")

    print(f"✅ 数据收集完成，共索引 {len(word_data_map)} 个独立单词。")
    return word_data_map, file_content_map


def rebuild_and_write_files(word_data_map: dict, file_content_map: dict, all_paths: list[str]):
    """
    阶段 2 & 3: 在内存中重建文件内容，然后写入磁盘。
    """
    print("\n[阶段 2/3] 🧠 正在决策需要保留和统一的单词...")

    # 创建原始文件结构的深拷贝，用于修改
    reconstructed_files = {path: json.loads(json.dumps(content)) for path, content in file_content_map.items()}

    # 清空所有文件的单词列表，准备重新填充
    for content in reconstructed_files.values():
        if 'meanings' in content and isinstance(content['meanings'], list):
            for meaning in content['meanings']:
                if 'words' in meaning:
                    meaning['words'] = []

    words_kept_in_regular_files = set()
    total_original_entries = 0
    total_final_entries = 0

    # 按照原始文件顺序遍历，以决定哪个是“首次出现”
    for path in all_paths:
        if path not in file_content_map:
            continue

        original_content = file_content_map[path]
        is_special_file = any(sd in path.replace('\\', '/') for sd in SPECIAL_DIRS)
        words_seen_in_this_file = set() # 新增：用于跟踪当前文件内已出现的单词

        meanings = original_content.get('meanings', [])
        for meaning_idx, meaning_group in enumerate(meanings):
            words_list = meaning_group.get('words', [])
            if not isinstance(words_list, list):
                continue

            for word_item in words_list:
                word = word_item.get('word')
                if not word:
                    continue

                total_original_entries += 1

                # 逻辑补充：如果单词在当前文件中已出现，则直接跳过，实现文件内去重
                if word in words_seen_in_this_file:
                    continue
                words_seen_in_this_file.add(word)

                if is_special_file:
                    # 特殊文件中的单词总是保留其原始数据
                    reconstructed_files[path]['meanings'][meaning_idx]['words'].append(word_item)
                    total_final_entries += 1
                else:
                    # 对于普通文件，只有当这个单词是首次在普通文件中出现时才保留
                    if word not in words_kept_in_regular_files:
                        words_kept_in_regular_files.add(word)
                        # 使用 word_data_map 中存储的权威版本数据
                        canonical_data = word_data_map[word]['canonical_data']
                        reconstructed_files[path]['meanings'][meaning_idx]['words'].append(canonical_data)
                        total_final_entries += 1

    words_removed = total_original_entries - total_final_entries
    print(f"✅ 决策完成。将保留 {total_final_entries} 个条目，移除 {words_removed} 个重复条目。")

    print("\n[阶段 3/3] ✍️  正在将修改写入文件系统...")
    modified_files_count = 0
    for path, new_content in reconstructed_files.items():
        try:
            # 只有当内容发生变化时才写入，避免不必要的文件修改
            if file_content_map.get(path) != new_content:
                with open(path, 'w', encoding='utf-8') as f:
                    json.dump(new_content, f, ensure_ascii=False, indent=2)
                modified_files_count += 1
        except Exception as e:
            print(f"❌ 写入文件 '{path}' 失败: {e}")

    print(f"✅ 写入操作完成，共修改了 {modified_files_count} 个文件。")
    return words_removed, modified_files_count


def main():
    """
    主执行函数
    """
    # 0. 备份
    if not create_backup(DATA_DIR):
        return

    # 1. 直接使用硬编码的文件列表
    file_paths = [
        'data/middle/pre/re.json', 'data/middle/pre/dis.json', 'data/middle/pre/ex.json', 'data/middle/pre/in.json',
        'data/middle/pre/un.json', 'data/middle/pre/en.json', 'data/middle/pre/com.json', 'data/middle/pre/sub.json',
        'data/middle/pre/trans.json', 'data/middle/pre/pre.json', 'data/middle/pre/de.json', 'data/middle/pre/inter.json',
        'data/middle/pre/ab.json', 'data/middle/pre/sur.json', 'data/middle/pre/dia.json', 'data/middle/pre/op.json',
        'data/high/pre/anti.json', 'data/high/pre/with.json', 'data/middle/suf/tion.json', 'data/middle/suf/ship.json',
        'data/middle/suf/ment.json', 'data/middle/suf/ness.json', 'data/middle/suf/ist.json', 'data/middle/suf/ity.json',
        'data/middle/suf/ess.json', 'data/middle/suf/eer.json', 'data/middle/suf/ance.json', 'data/middle/suf/ure.json',
        'data/middle/suf/al.json', 'data/middle/suf/y.json', 'data/middle/suf/ous.json', 'data/middle/suf/ful.json',
        'data/middle/suf/less.json', 'data/middle/suf/able.json', 'data/middle/suf/ic.json', 'data/middle/suf/ive.json',
        'data/middle/suf/ly.json', 'data/middle/suf/ize.json', 'data/middle/suf/ward.json', 'data/middle/suf/ate.json',
        'data/middle/suf/ish.json', 'data/middle/suf/ary.json', 'data/high/suf/ion.json', 'data/high/suf/ics.json',
        'data/high/suf/logy.json', 'data/middle/root/rect.json', 'data/middle/root/sect.json', 'data/middle/root/flu.json',
        'data/middle/root/tend.json', 'data/middle/root/pos.json', 'data/middle/root/spir.json', 'data/high/root/arm.json',
        'data/high/root/ball.json', 'data/high/root/bear.json', 'data/high/root/bind.json', 'data/high/root/break.json',
        'data/high/root/cept.json', 'data/high/root/cid.json', 'data/high/root/circ.json', 'data/high/root/clar.json',
        'data/high/root/clud.json', 'data/high/root/count.json', 'data/high/root/cru.json', 'data/high/root/cur.json',
        'data/high/root/curs.json', 'data/high/root/dict.json', 'data/high/root/do.json', 'data/high/root/du.json',
        'data/high/root/duc.json', 'data/high/root/equ.json', 'data/high/root/fac.json', 'data/high/root/fend.json',
        'data/high/root/fer.json', 'data/high/root/fid.json', 'data/high/root/fl.json', 'data/high/root/flex.json',
        'data/high/root/gen.json', 'data/high/root/gest.json', 'data/high/root/gl.json', 'data/high/root/graph.json',
        'data/high/root/ject.json', 'data/high/root/lect.json', 'data/high/root/liber.json', 'data/high/root/liter.json',
        'data/high/root/log.json', 'data/high/root/long.json', 'data/high/root/man.json', 'data/high/root/mens.json',
        'data/high/root/ment_mind.json', 'data/high/root/mer.json', 'data/high/root/mid.json', 'data/high/root/min.json',
        'data/high/root/mit.json', 'data/high/root/multi.json', 'data/high/root/nov.json', 'data/high/root/pend.json',
        'data/high/root/pet.json', 'data/high/root/ply.json', 'data/high/root/port.json', 'data/high/root/press.json',
        'data/high/root/rad.json', 'data/high/root/reg.json', 'data/high/root/rupt.json', 'data/high/root/scrib.json',
        'data/high/root/sequ.json', 'data/high/root/serv.json', 'data/high/root/sid.json', 'data/high/root/sign.json',
        'data/high/root/sl.json', 'data/high/root/soci.json', 'data/high/root/solv.json', 'data/high/root/spect.json',
        'data/high/root/spr.json', 'data/high/root/sta.json', 'data/high/root/strict.json', 'data/high/root/struct.json',
        'data/high/root/ten.json', 'data/high/root/terr.json', 'data/high/root/tract.json', 'data/high/root/val.json',
        'data/high/root/vent.json', 'data/high/root/vert.json', 'data/high/root/view.json', 'data/high/root/vinc.json',
        'data/high/root/vis.json', 'data/high/root/voc.json', 'data/high/root/volv.json', 'data/high/root/wr.json',
        'data/middle/geo_world.json', 'data/middle/nature_landscape.json', 'data/middle/city_infrastructure.json',
        'data/middle/weather_seasons.json', 'data/middle/food_ingredients.json', 'data/middle/dining_cooking.json',
        'data/middle/home_bedroom.json', 'data/middle/clothing_appearance.json', 'data/middle/study_hobbies.json',
        'data/middle/people_roles.json', 'data/middle/movement_position.json', 'data/middle/interaction_communication.json',
        'data/middle/mental_emotional.json', 'data/middle/measurement_quantity.json', 'data/middle/attributes_status.json',
        'data/middle/time_logic.json', 'data/middle/month.json', 'data/middle/other.json', 'data/middle/conflict_crisis.json',
        'data/middle/food_nature.json', 'data/middle/society_interaction.json', 'data/middle/thought_education.json',
        'data/middle/objects_tech.json', 'data/middle/emotion_traits.json', 'data/middle/topic_people_roles.json',
        'data/middle/topic_places_locations.json', 'data/middle/topic_food_drink.json', 'data/middle/topic_nature_animals.json',
        'data/middle/topic_objects_tools.json', 'data/middle/topic_action_process.json', 'data/middle/topic_core_concepts.json',
        'data/middle/topic_abstract_qualities.json', 'data/middle/topic_humanities_arts.json',
        'data/middle/topic_conflict_negation.json', 'data/middle/topic_positive_traits.json',
        'data/middle/topic_time_measurement.json', 'data/middle/topic_technology_components.json',
        'data/middle/topic_daily_life.json', 'data/middle/topic_nature.json', 'data/high/etymology_basics.json',
        'data/high/phonetic_rules.json', 'data/high/vocab_a_d.json', 'data/high/vocab_e_h.json', 'data/high/vocab_i_m.json',
        'data/high/vocab_n_p.json', 'data/high/vocab_q_r.json', 'data/high/vocab_s.json', 'data/high/vocab_t.json',
        'data/high/vocab_u_z.json', 'data/CET-4/pre/bene.json', 'data/CET-4/pre/with.json', 'data/CET-4/root/ac.json',
        'data/CET-4/root/ag.json', 'data/CET-4/root/aug.json', 'data/CET-4/root/auto.json', 'data/CET-4/root/bar.json',
        'data/CET-4/root/bat.json', 'data/CET-4/root/cap.json', 'data/CET-4/root/cept.json', 'data/CET-4/root/du.json',
        'data/CET-4/root/form.json', 'data/CET-4/root/fort.json', 'data/CET-4/root/fract.json', 'data/CET-4/root/fus.json',
        'data/CET-4/root/hab.json', 'data/CET-4/root/imper.json', 'data/CET-4/root/main.json', 'data/CET-4/root/mun.json',
        'data/CET-4/root/opt.json', 'data/CET-4/root/pac.json', 'data/CET-4/root/pass.json', 'data/CET-4/root/pater.json',
        'data/CET-4/root/pha.json', 'data/CET-4/root/plaud.json', 'data/CET-4/root/port.json', 'data/CET-4/root/press.json',
        'data/CET-4/root/pro.json', 'data/CET-4/root/rad.json', 'data/CET-4/root/sat.json', 'data/CET-4/root/sen.json',
        'data/CET-4/root/sequ.json', 'data/CET-4/root/sert.json', 'data/CET-4/root/sign.json', 'data/CET-4/root/sol.json',
        'data/CET-4/root/soph.json', 'data/CET-4/root/sta.json', 'data/CET-4/root/tact.json', 'data/CET-4/root/ten.json',
        'data/CET-4/root/tend.json', 'data/CET-4/root/vac.json', 'data/CET-4/root/vol.json', 'data/CET-4/vocab_a_d.json',
        'data/CET-4/vocab_e_h.json', 'data/CET-4/vocab_i_m.json', 'data/CET-4/vocab_n_p.json', 'data/CET-4/vocab_q_r.json',
        'data/CET-4/vocab_s.json', 'data/CET-6/pre/de.json', 'data/CET-6/pre/pro.json', 'data/CET-6/pre/re.json',
        'data/CET-6/pre/sub.json', 'data/CET-6/pre/syn.json', 'data/CET-6/root/fer.json', 'data/CET-6/root/lig.json',
        'data/CET-6/root/part.json', 'data/CET-6/root/pot.json', 'data/CET-6/root/psych.json', 'data/CET-6/root/san.json',
        'data/CET-6/root/sarc.json', 'data/CET-6/root/sat.json', 'data/CET-6/root/sta.json', 'data/CET-6/root/sume.json',
        'data/CET-6/root/tact.json', 'data/CET-6/root/val.json', 'data/CET-6/root/verb.json', 'data/CET-6/root/vert.json',
        'data/CET-6/root/vid.json', 'data/CET-6/vocab_o_q.json', 'data/CET-6/vocab_r_s.json', 'data/CET-6/vocab_t_z.json',
    ]
    print(f"ℹ️  使用内置的文件列表，共 {len(file_paths)} 个文件。")

    try:
        # 阶段 1: 收集数据
        word_data_map, file_content_map = collect_word_data(file_paths)

        # 阶段 2 & 3: 重建并写入文件
        removed_count, modified_count = rebuild_and_write_files(word_data_map, file_content_map, file_paths)

        # 4. 输出最终报告
        print("\n" + "=" * 40)
        print("🎉 任务全部完成！")
        print("=" * 40)
        print(f"    - 移除了 {removed_count} 个重复的单词条目。")
        print(f"    - 更新了 {modified_count} 个 JSON 文件。")
        print("\n💡 提示: 您可以检查文件内容，或使用版本控制工具 (如 Git) 查看具体的修改。")

    except Exception as e:
        print(f"\n❌ 程序因未知错误而终止: {e}")


if __name__ == "__main__":
    main()