// =================================================================================
// 数据清单 (Data Manifest) - v4.0 (支持年级分类)
// ---------------------------------------------------------------------------------
// 这个文件是数据加载的入口点。
// 【核心改动】: 按年级对数据文件进行了物理隔离，路径已更新。
// 主应用 (app.js) 将读取这个列表，并根据文件路径解析其所属年级。
// =================================================================================

const DATA_FILES = [
    // --- Prefixes (前缀) --- (通用资源, 不分年级)
    'data/pre/re.json',
    'data/pre/dis.json',
    'data/pre/ex.json',
    'data/pre/in.json',
    'data/pre/un.json',
    'data/pre/en.json',
    'data/pre/com.json',
    'data/pre/sub.json',
    'data/pre/trans.json',
    'data/pre/pre.json',
    'data/pre/de.json',
    'data/pre/inter.json',
    'data/pre/ab.json',
    'data/pre/sur.json',
    'data/pre/dia.json',
    'data/pre/op.json',

    // --- Suffixes (后缀) --- (通用资源)
    'data/suf/tion.json',
    'data/suf/ship.json',
    'data/suf/ment.json',
    'data/suf/ness.json',
    'data/suf/ist.json',
    'data/suf/ity.json',
    'data/suf/ess.json',
    'data/suf/eer.json',
    'data/suf/ance.json',
    'data/suf/ure.json',
    'data/suf/al.json',
    'data/suf/y.json',
    'data/suf/ous.json',
    'data/suf/ful.json',
    'data/suf/less.json',
    'data/suf/able.json',
    'data/suf/ic.json',
    'data/suf/ive.json',
    'data/suf/ly.json',
    'data/suf/ize.json',
    'data/suf/ward.json',
    'data/suf/ate.json',
    'data/suf/ish.json',
    'data/suf/ary.json',

    // --- Roots (词根) --- (通用资源)
    'data/root/rect.json',
    'data/root/sect.json',
    'data/root/flu.json',
    'data/root/tend.json',
    'data/root/pos.json',
    'data/root/spir.json',

    // --- 【改动】Grade 7 (初一) ---
    'data/grade7/geo_world.json',
    'data/grade7/nature_landscape.json',
    'data/grade7/city_infrastructure.json',
    'data/grade7/weather_seasons.json',
    'data/grade7/food_ingredients.json',
    'data/grade7/dining_cooking.json',
    'data/grade7/home_bedroom.json',
    'data/grade7/clothing_appearance.json',
    'data/grade7/study_hobbies.json',
    'data/grade7/people_roles.json',
    'data/grade7/movement_position.json',
    'data/grade7/interaction_communication.json',
    'data/grade7/mental_emotional.json',
    'data/grade7/measurement_quantity.json',
    'data/grade7/attributes_status.json',
    'data/grade7/time_logic.json',
    'data/grade7/other.json',
    // --- 未来可以添加 Grade 8 的数据文件 ---
    // 'data/grade8/some_topic.json',
];