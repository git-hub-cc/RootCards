// =================================================================================
// 数据清单 (Data Manifest) - v2.4 (All 04.md Suffixes Added)
// ---------------------------------------------------------------------------------
// 这个文件是数据加载的入口点。
// 主应用 (app.js) 将读取这个列表，并加载其中定义的所有 JSON 文件。
// =================================================================================

const DATA_FILES = [
    // --- Prefixes (前缀) ---
    // 原始数据
    'data/pre/re.json',
    'data/pre/dis.json',
    'data/pre/ex.json',

    // 02.md 新增数据
    'data/pre/in.json',   // in-, im- (neg & in)
    'data/pre/un.json',   // un-
    'data/pre/en.json',   // en-, em-
    'data/pre/com.json',  // com-, con-, co-
    'data/pre/sub.json',  // sub-, sup-
    'data/pre/trans.json',// trans-
    'data/pre/pre.json',  // pre-
    'data/pre/de.json',   // de-
    'data/pre/inter.json',// inter-
    'data/pre/ab.json',   // ab-
    'data/pre/sur.json',  // sur-
    'data/pre/dia.json',  // dia-
    'data/pre/op.json',   // op-

    // --- Suffixes (后缀) ---
    // 03.md 数据
    'data/suf/tion.json', // -tion, -ion, -ation
    'data/suf/ship.json', // -ship
    'data/suf/ment.json', // -ment
    'data/suf/ness.json', // -ness
    'data/suf/ist.json',  // -ist
    'data/suf/ity.json',  // -ity
    'data/suf/ess.json',  // -ess
    'data/suf/eer.json',  // -eer
    'data/suf/ance.json', // -ance
    'data/suf/ure.json',   // -ure

    // 04.md 新增数据 (形容词、动词、综合)
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
    'data/suf/ary.json'
];