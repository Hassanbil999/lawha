# Lawha · لوحة

Your browser's new tab, redesigned as a personal canvas.

## What it does

Lawha replaces Chrome's blank new tab with a page you arrange yourself: the
links you actually use, the pages you were just on, your bookmark folders, a few
notes, and a short queue of things to read later. A side panel lists the tabs
open in the current window, and lets you adjust how the whole thing looks
without leaving the page you are looking at.

Most new-tab extensions are dashboards. Weather, news, a quote, a countdown —
all of it competing for the two seconds you spend there. Lawha does the
opposite. It is a held breath: exactly what you need to get somewhere else, laid
out with enough room that finding it takes no effort, and then out of the way.

What makes it different from a theme is that you can change the layout, not just
the colours. Bookmarks can be cards, a shelf, a tree or tiles. Shortcuts can be
circles, a ring orbiting the clock, or a plain list. A complete arrangement —
palette, grid, and how every module draws itself — is called a Scene, and it is
a file you can export and send to someone.

There is one piece of decoration: a hairline arc across the top showing how far
through the day you are. No numbers, no label. You stop noticing it after a
week, and then you cannot unsee where you are in your day.

## Install

1. Download or clone this repository
2. Open `chrome://extensions`
3. Enable Developer mode
4. Load unpacked → select the `Lawha/` folder

## Scenes

A Scene is a JSON file describing a complete arrangement: the colour palette,
the grid, and the variant every module renders in. Five ship with the extension
— Diwan, Rasf, Satr, Falak and Warsha — and switching between them changes the
layout, not just the paint.

Open the gallery from the side panel to browse them, apply one, or build your
own by remixing an existing Scene. Export saves it as a file; anyone who imports
that file sees exactly what you saw. Switching Scenes never touches your notes,
shortcuts or reading queue — that boundary is enforced in the storage layer, not
left to good intentions.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `?` | Show every shortcut. Press again to dismiss |
| `Ctrl+K` | Search open tabs, bookmarks and history at once |
| `/` | The same search, from the new tab |
| `Ctrl+Shift+P` | The same search, from any page in the browser |
| `Ctrl+Shift+L` | Show or hide the side panel |
| `Ctrl+Shift+S` | Save the current page to read later |
| `Ctrl+Shift+F` | Focus mode — the time and the day, nothing else |
| `A`–`Z` | Filter your shortcuts by typing, with the grid focused |
| `Esc` | Close the search, clear a filter, or leave focus mode |

On macOS, `⌘` replaces `Ctrl` throughout.

If `Ctrl+Shift+P` doesn't open the command palette, go to
`chrome://extensions/shortcuts` and assign it manually — Chrome silently
declines a shortcut another extension already claimed.

## Arabic

Lawha is written for Arabic speakers rather than translated for them: full
right-to-left layout, Arabic and Latin numerals as a preference, and phrasing
that reads the way a person would actually say it. `طاب يومك` is what you say at
midday; a literal rendering of "Good afternoon" reads like a machine wrote it.

Arabic is set in IBM Plex Sans Arabic and Tajawal, both bundled with the
extension, so nothing is fetched to draw a page.

## Privacy

Lawha makes no network requests at all. There is no server, no account, no
analytics and no telemetry — fonts are bundled, icons are drawn from path data,
and colours are computed on your machine.

Everything you create stays in your browser's own storage, and the extension
asks for no host permissions, so it cannot read the content of any page you
visit.

You can check all of this yourself: open a new tab, open DevTools → Network, and
reload. Every request will be a local `chrome-extension://` one, and filtering by
domain will leave the list empty.

## Development

No dependencies and no build step — it is HTML, CSS and JavaScript as shipped.
`bash tools/pre-submission.sh` runs every check: syntax, craft rules, colour
contrast, the data-preservation guard, manifest validity and translation
completeness. `tools/selftest.html`, loaded as an extension page, runs the
data-preservation test against real storage.

## License

MIT

---

<div dir="rtl">

# لوحة · Lawha

تبويبك الجديد، مُعادُ تصميمه لوحةً شخصية.

## ما الذي تفعله

تستبدل لوحة صفحة التبويب الجديد الفارغة بصفحةٍ ترتّبها بنفسك: الروابط التي
تستخدمها فعلًا، والصفحات التي غادرتها للتو، ومجلدات علاماتك، وبعض الملاحظات،
وقائمةٍ قصيرة لما تنوي قراءته لاحقًا. ويعرض الشريط الجانبي التبويبات المفتوحة في
النافذة الحالية، ويتيح لك ضبط شكل الصفحة دون أن تغادرها.

معظم إضافات التبويب الجديد لوحات معلومات: طقسٌ وأخبارٌ واقتباس، كلّها تتنافس على
الثانيتين اللتين تقضيهما هناك. لوحة تفعل العكس. هي نَفَسٌ محبوس: ما تحتاجه
للوصول إلى مكانٍ آخر، بمساحةٍ تكفي لئلّا يكلّفك إيجاده جهدًا، ثم تنزوي.

ما يفرّقها عن السِّمة أنك تغيّر التخطيط لا الألوان وحدها. العلامات بطاقاتٌ أو
رفٌّ أو شجرةٌ أو بلاطات، والوصول السريع دوائرُ أو حلقةٌ تدور حول الساعة أو قائمة.
والترتيب الكامل — اللوحة اللونية والشبكة وكيفية رسم كل وحدة — يُسمّى مشهدًا، وهو
ملفٌّ تصدّره وترسله لمن تشاء.

وفيها زخرفةٌ واحدة: قوسٌ رفيع أعلى الصفحة يبيّن كم مضى من يومك. بلا أرقام ولا
عناوين. تكفّ عن ملاحظته بعد أسبوع، ثم لا تعود قادرًا على تجاهل موضعك من نهارك.

## التثبيت

١. نزّل هذا المستودع أو استنسخه
٢. افتح `chrome://extensions`
٣. فعّل وضع المطوّر
٤. اضغط «تحميل غير محزوم» واختر مجلد `Lawha/`

## المشاهد

المشهد ملف JSON يصف ترتيبًا كاملًا: اللوحة اللونية، والشبكة، والشكل الذي تُرسم
به كل وحدة. تأتي خمسة مشاهد مع الإضافة — ديوان ورصف وسطر وفلك وورشة — والتنقّل
بينها يغيّر التخطيط لا الطلاء وحده.

افتح المعرض من الشريط الجانبي لتتصفّحها أو تطبّق أحدها أو تبني مشهدك باقتباس
مشهدٍ قائم. والتصدير يحفظه ملفًّا، ومن يستورده يرى ما رأيته تمامًا. وتبديل
المشاهد لا يمسّ ملاحظاتك ولا اختصاراتك ولا قائمة القراءة؛ هذا الحدّ مفروضٌ في
طبقة التخزين نفسها، لا متروكٌ لحسن النية.

## الاختصارات

| الاختصار | الوظيفة |
|---|---|
| `؟` | إظهار كل الاختصارات. اضغطه ثانيةً لإغلاقها |
| `Ctrl+K` | البحث في التبويبات والعلامات والسجل معًا |
| `/` | البحث نفسه من صفحة التبويب الجديد |
| `Ctrl+Shift+P` | البحث نفسه من أي صفحة في المتصفح |
| `Ctrl+Shift+L` | إظهار الشريط الجانبي أو إخفاؤه |
| `Ctrl+Shift+S` | حفظ الصفحة الحالية لقراءتها لاحقًا |
| `Ctrl+Shift+F` | وضع التركيز — الوقت واليوم فقط |
| `أ`–`ي` | تصفية الوصول السريع بالكتابة، والتركيز على الشبكة |
| `Esc` | إغلاق البحث أو إلغاء التصفية أو مغادرة وضع التركيز |

على ماك يحلّ `⌘` محلّ `Ctrl` في كل ما سبق.

إن لم يفتح `Ctrl+Shift+P` لوحة الأوامر، فافتح `chrome://extensions/shortcuts`
وعيّنه يدويًا؛ يتجاهل كروم الاختصار إن كانت إضافةٌ أخرى قد حجزته، دون أن ينبّهك.

## العربية

لوحة مكتوبةٌ لأهل العربية لا مترجَمةٌ لهم: تخطيطٌ من اليمين إلى اليسار بالكامل،
وأرقامٌ عربيةٌ أو لاتينيةٌ حسب تفضيلك، وصياغةٌ تُقال كما يقولها الناس. `طاب يومك`
هو ما تقوله ظهرًا؛ أما الترجمة الحرفية لـ«مساء الخير الإنجليزية» فتقرأ وكأن آلةً
كتبتها.

والعربية مضبوطةٌ بخطَّي IBM Plex Sans Arabic وتجوّل، وكلاهما مرفقٌ مع الإضافة،
فلا يُجلب شيءٌ من الشبكة لرسم صفحة.

## الخصوصية

لا تجري لوحة أي اتصالٍ بالشبكة إطلاقًا. لا خادم ولا حساب ولا تحليلات ولا
تتبّع — الخطوط مرفقة، والأيقونات مرسومةٌ من بيانات مسارات، والألوان تُحسب على
جهازك.

وكل ما تنشئه يبقى في تخزين متصفحك، والإضافة لا تطلب أي أذونات مضيف، فلا تستطيع
قراءة محتوى أي صفحةٍ تزورها.

ويمكنك التحقق من ذلك بنفسك: افتح تبويبًا جديدًا، ثم أدوات المطوّر ← الشبكة، ثم
أعد التحميل. كل طلبٍ ستراه محليٌّ من `chrome-extension://`، وإذا صفّيت بحسب
النطاق فستجد القائمة فارغة.

## الرخصة

MIT

</div>
