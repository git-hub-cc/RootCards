// =================================================================================
// 数据清单 (Data Manifest) - v4.0 (支持年级分类)
// ---------------------------------------------------------------------------------
// 这个文件是数据加载的入口点。
// 【核心改动】: 按年级对数据文件进行了物理隔离，路径已更新。
// 主应用 (app.js) 将读取这个列表，并根据文件路径解析其所属年级。
// =================================================================================

const DATA_FILES = [
    // --- Prefixes (前缀) --- (通用资源, 不分年级)
    'data/grade7/pre/re.json',
    'data/grade7/pre/dis.json',
    'data/grade7/pre/ex.json',
    'data/grade7/pre/in.json',
    'data/grade7/pre/un.json',
    'data/grade7/pre/en.json',
    'data/grade7/pre/com.json',
    'data/grade7/pre/sub.json',
    'data/grade7/pre/trans.json',
    'data/grade7/pre/pre.json',
    'data/grade7/pre/de.json',
    'data/grade7/pre/inter.json',
    'data/grade7/pre/ab.json',
    'data/grade7/pre/sur.json',
    'data/grade7/pre/dia.json',
    'data/grade7/pre/op.json',

    // --- Suffixes (后缀) --- (通用资源)
    'data/grade7/suf/tion.json',
    'data/grade7/suf/ship.json',
    'data/grade7/suf/ment.json',
    'data/grade7/suf/ness.json',
    'data/grade7/suf/ist.json',
    'data/grade7/suf/ity.json',
    'data/grade7/suf/ess.json',
    'data/grade7/suf/eer.json',
    'data/grade7/suf/ance.json',
    'data/grade7/suf/ure.json',
    'data/grade7/suf/al.json',
    'data/grade7/suf/y.json',
    'data/grade7/suf/ous.json',
    'data/grade7/suf/ful.json',
    'data/grade7/suf/less.json',
    'data/grade7/suf/able.json',
    'data/grade7/suf/ic.json',
    'data/grade7/suf/ive.json',
    'data/grade7/suf/ly.json',
    'data/grade7/suf/ize.json',
    'data/grade7/suf/ward.json',
    'data/grade7/suf/ate.json',
    'data/grade7/suf/ish.json',
    'data/grade7/suf/ary.json',

    // --- Roots (词根) --- (通用资源)
    'data/grade7/root/rect.json',
    'data/grade7/root/sect.json',
    'data/grade7/root/flu.json',
    'data/grade7/root/tend.json',
    'data/grade7/root/pos.json',
    'data/grade7/root/spir.json',

    // --- 【改动】Grade 7 (初一) ---
    'data/grade7/category/geo_world.json',
    'data/grade7/category/nature_landscape.json',
    'data/grade7/category/city_infrastructure.json',
    'data/grade7/category/weather_seasons.json',
    'data/grade7/category/food_ingredients.json',
    'data/grade7/category/dining_cooking.json',
    'data/grade7/category/home_bedroom.json',
    'data/grade7/category/clothing_appearance.json',
    'data/grade7/category/study_hobbies.json',
    'data/grade7/category/people_roles.json',
    'data/grade7/category/movement_position.json',
    'data/grade7/category/interaction_communication.json',
    'data/grade7/category/mental_emotional.json',
    'data/grade7/category/measurement_quantity.json',
    'data/grade7/category/attributes_status.json',
    'data/grade7/category/time_logic.json',
    'data/grade7/category/other.json',
    // --- 未来可以添加 Grade 8 的数据文件 ---
    // 'data/grade8/some_topic.json',
];