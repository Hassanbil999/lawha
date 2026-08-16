/**
 * i18n.js
 * Strings, reading direction and numerals, for English and Arabic alike.
 */

/* Lawha — strings, direction, and numerals.
 *
 * Arabic here is written, not translated. `طاب يومك` is what an Arabic speaker
 * says at midday; a literal rendering of "Good afternoon" reads like a machine
 * wrote it. Where the two languages want different shapes — an eyebrow label
 * is uppercased in Latin and left alone in Arabic — the difference lives in
 * CSS, not in the string.
 *
 * Direction is handled by flipping `dir` on <html> and letting CSS logical
 * properties do the rest. Nothing in this codebase writes `left`, `right`, or
 * `row-reverse`: `row-reverse` reverses visual order without reversing tab
 * order, which silently breaks keyboard navigation in RTL. */

import { MODULES } from './modules.js';

export const LANGUAGES = ['en', 'ar'];

export const STRINGS = {
  en: {
    greet_dawn: "Early start", greet_morning: "Good morning",
    greet_afternoon: "Good afternoon", greet_evening: "Good evening",
    greet_night: "Still up",

    sec_shortcuts: "Quick access", sec_recent: "Recent",
    sec_collections: "Collections", sec_notes: "Notes", sec_later: "Later",

    cmd_placeholder: "Search tabs, bookmarks, history",
    cmd_empty: "Nothing matches. Try fewer words.",
    tabs_empty: "No tabs open. Open one to get started.",
    notes_empty: "Add a note to keep something in view.",
    later_empty: "Save a page here to come back to it.",

    action_new_tab: "New tab", action_close: "Close", action_pin: "Pin",
    action_save: "Save for later", action_add: "Add", action_delete: "Delete",

    set_scene: "Scene", set_palette: "Colors", set_density: "Density",
    set_language: "Language", set_background: "Background",
    set_export: "Export scene", set_import: "Import scene",
    set_build: "Build a scene", set_start_from: "Start from",
    set_arrangement: "Arrangement", set_labels: "Section labels",

    contrast_pass: "Readable",
    contrast_warn: "Low contrast — text may be hard to read",
    import_bad: "That file isn't a Lawha scene.",
    import_newer: "That scene was made in a newer version. Update Lawha to use it.",
    image_too_big: "Image is over 3 MB. Pick a smaller one to keep new tabs fast.",

    /* -- added beyond the spec's list, for surfaces it describes but does not
          spell out: relative timestamps, the palette's source column, the
          sidebar chrome, the builder, and the background editor. -- */

    time_now: "now", time_m: "m", time_h: "h", time_d: "d",

    cmd_src_tab: "tab", cmd_src_bookmark: "bookmark", cmd_src_history: "history",
    cmd_hint_nav: "navigate", cmd_hint_open: "open", cmd_hint_close: "close",

    shortcuts_empty: "Add a link to reach it in one click.",
    recent_empty: "Pages you visit will collect here.",
    bookmarks_empty: "Bookmarks you save will show up here.",

    tabs_filter: "Filter tabs",
    tabs_count_one: "1 tab", tabs_count_many: "$1 tabs",
    tab_age_old: "Untouched for more than a day",

    action_unpin: "Unpin", action_mute: "Mute", action_unmute: "Unmute",
    action_close_others: "Close others", action_open: "Open",
    action_edit: "Edit", action_cancel: "Cancel", action_done: "Done",
    action_remove: "Remove", action_save_scene: "Save",
    action_open_sidebar: "Open sidebar", action_settings: "Settings",
    action_expand: "Expand", action_collapse: "Collapse",
    action_search: "Search",

    note_placeholder: "Write a note",
    shortcut_url: "Address", shortcut_label: "Label",

    set_numerals: "Numerals", num_latin: "Latin", num_arabic: "Arabic",
    set_focus: "Focus mode", set_scenes: "Scenes",
    opt_on: "On", opt_off: "Off", opt_auto: "Follow system",

    dens_compact: "Compact", dens_comfortable: "Comfortable", dens_airy: "Airy",

    arr_two: "Two columns", arr_three: "Three columns", arr_single: "Single column",
    arr_sidebar: "Sidebar", arr_bento: "Bento",

    bg_theme: "Scene color", bg_gradient: "Gradient", bg_image: "Image",
    bg_angle: "Angle", bg_colors: "Colors", bg_presets: "Presets",
    bg_choose_image: "Choose an image", bg_clear_image: "Remove image",

    grad_fajr: "Dawn", grad_sahara: "Sahara", grad_bahr: "Sea",
    grad_zaytoun: "Olive", grad_layl: "Night", grad_ward: "Rose",
    grad_raml: "Sand", grad_dukhan: "Smoke", grad_nuhas: "Copper",
    grad_thalj: "Snow",

    build_name: "Name", build_saved: "Scene saved.",
    build_preview: "Live preview", build_remix_of: "Remixed from $1",
    build_delete_scene: "Delete scene",

    later_saved: "Saved for later.",
    module_label: "Module",

    /* -- The tuning panel, the gallery, and Istikhraj -- */

    tune_title: "Adjust",
    set_gallery: "Browse & create scenes",
    pal_custom: "Custom",
    pal_pick: "Pick an accent color",

    contrast_fail: "Unreadable",
    tune_adjusted: "Adjusted so the text stays readable",

    bg_extract: "Extract palette",
    bg_extract_note: "Take the colors from the image",
    bg_extracting: "Reading the image…",

    gal_title: "Scenes",
    gal_create: "Create new",
    gal_builtin: "Built-in",
    gal_custom: "Yours",
    gal_by: "by $1",
    gal_apply: "Apply",
    gal_applied: "Applied",
    gal_more: "More",
    gal_share: "Copy for sharing",
    gal_shared: "Scene JSON copied. Paste it into a GitHub Gist and share the link.",
    gal_import_url: "Paste a raw Gist URL or scene JSON",
    gal_empty: "No scenes match that filter.",
    gal_back: "Back to scenes",

    filter_all: "All",
    tag_minimal: "Minimal", tag_dense: "Dense", tag_dark: "Dark",
    tag_light: "Light", tag_arabic: "Arabic",
    tag_arabic_friendly: "Arabic-friendly", tag_focus: "Focus",
    tag_creative: "Creative",

    onboard_welcome: "Pick a place to start.",
    onboard_go: "Open my canvas",

    focus_indicator: "Focus",
    empty_illustration: "Nothing here yet",


    /* -- The cheatsheet, shortcut filtering, session restore, the scrim
          slider, and copying an address. -- */

    help_title: "Keyboard shortcuts",
    help_sidebar: "Sidebar",
    help_this: "This list",
    help_filter: "Filter shortcuts",
    cmd_palette_global: "Search from any page",

    filter_hint: "Filtering… Esc to clear",
    filter_none: "Nothing matches “$1”",

    action_copy: "Copy address",
    action_copied: "Copied",
    action_restore: "Restore",
    action_dismiss: "Dismiss",

    session_restore_one: "You had 1 tab open. Restore it?",
    session_restore_many: "You had $1 tabs open. Restore them?",

    bg_scrim: "Background opacity",
    set_badge: "Tab count on the icon",
  },

  ar: {
    greet_dawn: "بدايةٌ مبكرة", greet_morning: "صباح الخير",
    greet_afternoon: "طاب يومك", greet_evening: "مساء الخير",
    greet_night: "ما زلت مستيقظًا",

    sec_shortcuts: "وصول سريع", sec_recent: "الأخيرة",
    sec_collections: "المجموعات", sec_notes: "ملاحظات", sec_later: "لاحقًا",

    cmd_placeholder: "ابحث في التبويبات والعلامات والسجل",
    cmd_empty: "لا نتائج. جرّب كلماتٍ أقل.",
    tabs_empty: "لا توجد تبويبات مفتوحة.",
    notes_empty: "أضف ملاحظةً لتبقى أمامك.",
    later_empty: "احفظ صفحةً لتعود إليها لاحقًا.",

    action_new_tab: "تبويب جديد", action_close: "إغلاق", action_pin: "تثبيت",
    action_save: "احفظ لاحقًا", action_add: "إضافة", action_delete: "حذف",

    set_scene: "المشهد", set_palette: "الألوان", set_density: "الكثافة",
    set_language: "اللغة", set_background: "الخلفية",
    set_export: "تصدير المشهد", set_import: "استيراد مشهد",
    set_build: "أنشئ مشهدًا", set_start_from: "ابدأ من",
    set_arrangement: "الترتيب", set_labels: "عناوين الأقسام",

    contrast_pass: "واضح",
    contrast_warn: "تباين منخفض — قد يصعب قراءة النص",
    import_bad: "هذا الملف ليس مشهد لوحة.",
    import_newer: "هذا المشهد أُنشئ بإصدارٍ أحدث. حدّث لوحة لاستخدامه.",
    image_too_big: "حجم الصورة يتجاوز ٣ ميغابايت. اختر صورةً أصغر.",

    time_now: "الآن", time_m: "د", time_h: "س", time_d: "ي",

    cmd_src_tab: "تبويب", cmd_src_bookmark: "علامة", cmd_src_history: "سجل",
    cmd_hint_nav: "للتنقل", cmd_hint_open: "للفتح", cmd_hint_close: "للإغلاق",

    shortcuts_empty: "أضف رابطًا لتصل إليه بنقرة.",
    recent_empty: "ستتجمّع هنا الصفحات التي تزورها.",
    bookmarks_empty: "ستظهر هنا العلامات التي تحفظها.",

    tabs_filter: "صفِّ التبويبات",
    tabs_count_one: "تبويب واحد", tabs_count_many: "$1 تبويبات",
    tab_age_old: "لم يُفتح منذ أكثر من يوم",

    action_unpin: "إلغاء التثبيت", action_mute: "كتم", action_unmute: "إلغاء الكتم",
    action_close_others: "إغلاق البقية", action_open: "فتح",
    action_edit: "تعديل", action_cancel: "إلغاء", action_done: "تم",
    action_remove: "إزالة", action_save_scene: "حفظ",
    action_open_sidebar: "افتح الشريط الجانبي", action_settings: "الإعدادات",
    action_expand: "توسيع", action_collapse: "طيّ",
    action_search: "بحث",

    note_placeholder: "اكتب ملاحظة",
    shortcut_url: "العنوان", shortcut_label: "الاسم",

    set_numerals: "الأرقام", num_latin: "لاتينية", num_arabic: "عربية",
    set_focus: "وضع التركيز", set_scenes: "المشاهد",
    opt_on: "مفعّل", opt_off: "معطّل", opt_auto: "حسب النظام",

    dens_compact: "مضغوطة", dens_comfortable: "مريحة", dens_airy: "فسيحة",

    arr_two: "عمودان", arr_three: "ثلاثة أعمدة", arr_single: "عمود واحد",
    arr_sidebar: "شريط جانبي", arr_bento: "بينتو",

    bg_theme: "لون المشهد", bg_gradient: "تدرّج", bg_image: "صورة",
    bg_angle: "الزاوية", bg_colors: "الألوان", bg_presets: "جاهزة",
    bg_choose_image: "اختر صورة", bg_clear_image: "إزالة الصورة",

    grad_fajr: "فجر", grad_sahara: "صحراء", grad_bahr: "بحر",
    grad_zaytoun: "زيتون", grad_layl: "ليل", grad_ward: "ورد",
    grad_raml: "رمل", grad_dukhan: "دخان", grad_nuhas: "نحاس",
    grad_thalj: "ثلج",

    build_name: "الاسم", build_saved: "حُفظ المشهد.",
    build_preview: "معاينة حيّة", build_remix_of: "مُقتبس من $1",
    build_delete_scene: "حذف المشهد",

    later_saved: "حُفظت الصفحة.",
    module_label: "الوحدة",

    tune_title: "ضبط",
    set_gallery: "تصفّح المشاهد وأنشئ",
    pal_custom: "مخصّص",
    pal_pick: "اختر لون التمييز",

    contrast_fail: "غير مقروء",
    tune_adjusted: "عُدِّل ليبقى النص مقروءًا",

    bg_extract: "استخراج اللون",
    bg_extract_note: "خذ الألوان من الصورة",
    bg_extracting: "نقرأ الصورة…",

    gal_title: "المشاهد",
    gal_create: "أنشئ جديدًا",
    gal_builtin: "أصلي",
    gal_custom: "مشاهدك",
    gal_by: "بواسطة $1",
    gal_apply: "تطبيق",
    gal_applied: "مُطبَّق",
    gal_more: "المزيد",
    gal_share: "انسخ للمشاركة",
    gal_shared: "نُسخ المشهد. الصقه في GitHub Gist وشارك الرابط.",
    gal_import_url: "الصق رابط Gist خامًا أو نص المشهد",
    gal_empty: "لا مشاهد تطابق هذا التصفية.",
    gal_back: "العودة إلى المشاهد",

    filter_all: "الكل",
    tag_minimal: "بسيط", tag_dense: "مكثّف", tag_dark: "داكن",
    tag_light: "فاتح", tag_arabic: "عربي",
    tag_arabic_friendly: "يناسب العربية", tag_focus: "تركيز",
    tag_creative: "إبداعي",

    onboard_welcome: "اختر نقطة البداية.",
    onboard_go: "افتح لوحتي",

    focus_indicator: "تركيز",
    empty_illustration: "لا شيء هنا بعد",


    help_title: "اختصارات لوحة المفاتيح",
    help_sidebar: "الشريط الجانبي",
    help_this: "هذه القائمة",
    help_filter: "تصفية الاختصارات",
    cmd_palette_global: "البحث من أي صفحة",

    filter_hint: "فلترة… Esc للإلغاء",
    filter_none: "لا شيء يطابق «$1»",

    action_copy: "نسخ العنوان",
    action_copied: "نُسخ",
    action_restore: "استعادة",
    action_dismiss: "إخفاء",

    session_restore_one: "كان لديك تبويب واحد. هل تريد استعادته؟",
    session_restore_many: "كان لديك $1 تبويبات. هل تريد استعادتها؟",

    bg_scrim: "شفافية الخلفية",
    set_badge: "عدد التبويبات على الأيقونة",
  },
};

/** Module names, for the builder. */
export const MODULE_LABELS = {
  en: {
    clock: "Clock", waqt: "Time arc", shortcuts: "Shortcuts", recent: "Recent",
    bookmarks: "Bookmarks", notes: "Notes", later: "Later", search: "Search",
  },
  ar: {
    clock: "الساعة", waqt: "قوس الوقت", shortcuts: "الوصول السريع",
    recent: "الأخيرة", bookmarks: "العلامات", notes: "الملاحظات",
    later: "لاحقًا", search: "البحث",
  },
};

/** Variant names, for the builder's per-module dropdowns. */
export const VARIANT_LABELS = {
  en: {
    clock: { minimal: "Minimal", monumental: "Monumental", ring: "Ring", off: "Off" },
    waqt: { arc: "Arc", bar: "Bar", dots: "Dots", off: "Off" },
    shortcuts: { circles: "Circles", squares: "Squares", strip: "Strip", ring: "Ring", list: "List" },
    recent: { list: "List", compact: "Compact", tiles: "Tiles", feed: "Feed" },
    bookmarks: { folders: "Folders", shelf: "Shelf", tree: "Tree", tiles: "Tiles", columns: "Columns" },
    notes: { cards: "Cards", strip: "Strip", stack: "Stack", off: "Off" },
    later: { count: "Count", list: "List", tiles: "Tiles", off: "Off" },
    search: { bar: "Bar", icon: "Icon", off: "Off" },
  },
  ar: {
    clock: { minimal: "بسيطة", monumental: "ضخمة", ring: "دائرة", off: "مخفية" },
    waqt: { arc: "قوس", bar: "شريط", dots: "نقاط", off: "مخفي" },
    shortcuts: { circles: "دوائر", squares: "مربعات", strip: "شريط", ring: "حلقة", list: "قائمة" },
    recent: { list: "قائمة", compact: "مضغوطة", tiles: "بلاطات", feed: "تدفّق" },
    bookmarks: { folders: "مجلدات", shelf: "رفّ", tree: "شجرة", tiles: "بلاطات", columns: "أعمدة" },
    notes: { cards: "بطاقات", strip: "شريط", stack: "كومة", off: "مخفية" },
    later: { count: "عدد", list: "قائمة", tiles: "بلاطات", off: "مخفي" },
    search: { bar: "شريط", icon: "أيقونة", off: "مخفي" },
  },
};

/* ---- Completeness check -------------------------------------------------
 * Runs on unpacked installs only. A missing Arabic string is a bug that
 * should stop the build, not something a user discovers as a blank label. */

function isDevBuild() {
  try {
    // Chrome sets update_url only for Web Store installs.
    return !('update_url' in chrome.runtime.getManifest());
  } catch {
    return false;
  }
}

export function assertStringsComplete() {
  const problems = [];

  const keys = new Set([...Object.keys(STRINGS.en), ...Object.keys(STRINGS.ar)]);
  for (const key of keys) {
    for (const lang of LANGUAGES) {
      if (typeof STRINGS[lang][key] !== 'string' || !STRINGS[lang][key]) {
        problems.push(`STRINGS.${lang}.${key}`);
      }
    }
  }

  for (const lang of LANGUAGES) {
    for (const moduleId of Object.keys(MODULES)) {
      if (!MODULE_LABELS[lang][moduleId]) problems.push(`MODULE_LABELS.${lang}.${moduleId}`);
      for (const variant of MODULES[moduleId].variants) {
        if (!VARIANT_LABELS[lang][moduleId]?.[variant]) {
          problems.push(`VARIANT_LABELS.${lang}.${moduleId}.${variant}`);
        }
      }
    }
  }

  if (problems.length) {
    throw new Error(`Lawha i18n: ${problems.length} missing string(s):\n  ${problems.join('\n  ')}`);
  }
  return true;
}

/* ---- Numerals -----------------------------------------------------------
 * Default to Latin digits even in Arabic — most Arabic web UIs use them — but
 * the choice belongs to the reader, not to us. */

const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

export function toArabicDigits(value) {
  return String(value).replace(/[0-9]/g, (d) => ARABIC_DIGITS[Number(d)]);
}

/* ---- State -------------------------------------------------------------- */

const state = {
  lang: 'en',
  numerals: 'latin',
};

const listeners = new Set();

export function currentLanguage() {
  return state.lang;
}

export function currentNumerals() {
  return state.numerals;
}

export function isRTL() {
  return state.lang === 'ar';
}

/** Translate. `$1`, `$2` … are replaced by the substitutions given. */
export function t(key, ...subs) {
  const table = STRINGS[state.lang] || STRINGS.en;
  let value = table[key];

  if (value === undefined) {
    if (isDevBuild()) throw new Error(`Lawha i18n: missing key "${key}" for "${state.lang}"`);
    value = STRINGS.en[key] ?? key;
  }

  return subs.length
    ? value.replace(/\$(\d)/g, (_, n) => String(subs[Number(n) - 1] ?? ''))
    : value;
}

/** A module's display name. */
export function tModule(moduleId) {
  return MODULE_LABELS[state.lang]?.[moduleId] ?? MODULE_LABELS.en[moduleId] ?? moduleId;
}

/** A variant's display name. */
export function tVariant(moduleId, variant) {
  return (
    VARIANT_LABELS[state.lang]?.[moduleId]?.[variant] ??
    VARIANT_LABELS.en[moduleId]?.[variant] ??
    variant
  );
}

/** Digits, shaped per the numerals setting. */
export function fmtNum(value) {
  const text = String(value);
  return state.numerals === 'arabic' ? toArabicDigits(text) : text;
}

/** BCP-47 tag that also pins the numbering system, so Intl agrees with the
 *  numerals setting instead of guessing from the language. */
export function locale() {
  const nu = state.numerals === 'arabic' ? 'arab' : 'latn';
  return `${state.lang}-u-nu-${nu}`;
}

export function formatTime(date, { seconds = false } = {}) {
  return new Intl.DateTimeFormat(locale(), {
    hour: '2-digit',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
    hour12: false,
  }).format(date);
}

export function formatDate(date) {
  return new Intl.DateTimeFormat(locale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

/* ---- Applying strings to the DOM ---------------------------------------- */

/**
 * Fill every marked node in `root`:
 *   data-i18n="key"              → textContent
 *   data-i18n-placeholder="key"  → placeholder
 *   data-i18n-aria="key"         → aria-label
 *   data-i18n-title="key"        → title
 * Always textContent, never innerHTML.
 */
export function applyStrings(root = document) {
  for (const node of root.querySelectorAll('[data-i18n]')) {
    node.textContent = t(node.dataset.i18n);
  }
  const attrs = [
    ['i18nPlaceholder', 'placeholder'],
    ['i18nAria', 'aria-label'],
    ['i18nTitle', 'title'],
  ];
  for (const [dataKey, attribute] of attrs) {
    for (const node of root.querySelectorAll(`[data-${dataKey.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}]`)) {
      node.setAttribute(attribute, t(node.dataset[dataKey]));
    }
  }
}

/** Called after a language switch so live-rendered modules redraw. */
export function onLanguageChange(handler) {
  listeners.add(handler);
  return () => listeners.delete(handler);
}

function notify() {
  for (const handler of listeners) handler(state.lang);
}

/**
 * Flip the whole interface. `dir` on <html> is what makes logical properties
 * do their work; nothing else needs to know which way the page runs.
 */
export async function setLanguage(lang, { persist = true } = {}) {
  state.lang = LANGUAGES.includes(lang) ? lang : 'en';

  const html = document.documentElement;
  html.lang = state.lang;
  html.dir = state.lang === 'ar' ? 'rtl' : 'ltr';

  applyStrings();
  notify();

  if (persist) {
    const { setPresentation } = await import('./storage.js');
    await setPresentation('language', state.lang);
  }
}

export async function setNumerals(numerals, { persist = true } = {}) {
  state.numerals = numerals === 'arabic' ? 'arabic' : 'latin';
  notify();
  if (persist) {
    const { setPresentation } = await import('./storage.js');
    await setPresentation('numerals', state.numerals);
  }
}

/**
 * First run detects from the browser UI language; after that the stored choice
 * wins, because someone who switched to English meant it.
 */
export async function initI18n() {
  if (isDevBuild()) assertStringsComplete();

  const { getMany } = await import('./storage.js');
  const { language, numerals } = await getMany(['language', 'numerals']);

  const detected = chrome.i18n.getUILanguage().startsWith('ar') ? 'ar' : 'en';
  state.numerals = numerals === 'arabic' ? 'arabic' : 'latin';

  await setLanguage(language ?? detected, { persist: false });
  return { language: state.lang, numerals: state.numerals };
}
