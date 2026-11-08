// English for the signed-in pages (account + project editor). These pages are written in Arabic; when the
// site language is English, visible text and labels are swapped from this dictionary, including text the
// page renders later (watched with a MutationObserver). The dashboard preview (.dash) translates itself,
// and user content (titles, inputs, data values) is never touched.
const EXACT = {
  // nav / shell
  'الرئيسية': 'Home', 'مشروع جديد': 'New project', 'المشاريع': 'Projects', 'الروابط المنشورة': 'Published links', 'سجل التحديثات': 'Update history',
  'الحساب والهوية': 'Account & brand', 'حسابي': 'My account', 'خروج': 'Sign out', 'فاتح': 'Light', 'داكن': 'Dark', 'عنابي': 'Bordeaux',
  'لوحة المؤشرات': 'Dashboard', 'حسابي | لوحة المؤشرات': 'My account | Dashboard', 'المشروع | لوحة المؤشرات': 'Project | Dashboard', 'القائمة الرئيسية': 'Main menu',
  'مشاريعي': 'My projects', '→ مشاريعي': '← My projects', 'مشاريعي والتقويم': 'My projects & calendar', 'التقويم': 'Calendar', 'سجل': 'History', 'السجل': 'History',
  'العرض التجريبي': 'Live demo', 'سياسة الخصوصية': 'Privacy policy', 'تسجيل الدخول': 'Sign in', 'لون الموقع': 'Site color', 'يُحفظ على هذا الجهاز': 'Saved on this device',
  'صباح الخير': 'Good morning', 'مساء الخير': 'Good evening', 'هذا ملخص مشاريعك اليوم.': 'Here is your projects summary for today.', 'ملخص اليوم': 'Today’s summary',
  'التاريخ': 'Date', 'اليوم': 'Day', 'عدد المشاريع': 'Projects', 'السنة': 'Year', 'نظرة سريعة': 'At a glance', 'آخر النشاطات': 'Recent activity',
  'منشورة': 'Published', 'محدّثة خلال 30 يوم': 'Updated in 30 days', 'فيها بيانات': 'Have data', 'منشور': 'Published', 'مسودة': 'Draft', 'الكل': 'All',
  'الشهر السابق': 'Previous month', 'الشهر التالي': 'Next month', 'لا توجد أحداث في هذا اليوم.': 'No events on this day.', 'لا توجد أحداث بعد.': 'No events yet.',
  'ح': 'S', 'ن': 'M', 'ث': 'T', 'ر': 'W', 'خ': 'T', 'ج': 'F', 'س': 'S',
  'دليل البداية': 'Getting started', 'ابدأ في 4 خطوات': 'Get started in 4 steps', 'إخفاء': 'Hide', 'إنشاء مشروع': 'Create a project', 'كل لوحة مؤشرات مشروع مستقل.': 'Each dashboard is its own project.',
  'ارفع ملف Excel': 'Upload an Excel file', 'أو استخدم الملف النموذجي.': 'Or use the sample file.', 'ارفع الملف': 'Upload file', 'الهوية والقالب': 'Brand & template', 'الشعار والألوان والقالب.': 'Logo, colors and template.',
  'انشر وشارك': 'Publish & share', 'رابط للعرض فقط.': 'A view-only link.', 'المشاركة': 'Sharing', 'ابدأ أول مشروع': 'Start your first project', 'ارفع ملف Excel وشوف الرسم البياني هنا.': 'Upload an Excel file and see the chart here.',
  'حمّل ملف نموذجي': 'Download a sample file', 'لا توجد مشاريع بعد': 'No projects yet', 'إنشاء أول مشروع': 'Create your first project', 'جاري التحميل…': 'Loading…',
  'فتح المشروع': 'Open project', 'لا توجد بيانات منشورة لهذا المشروع.': 'No published data for this project.', 'إجمالي المؤشرات': 'All metrics', 'حسب الشهر': 'by month', 'حسب اليوم': 'by day', 'المؤشر': 'Metric',
  'كل لوحة مؤشرات لها رابطها وهويتها.': 'Each dashboard has its own link and brand.', 'تصفية المشاريع': 'Filter projects', 'بحث في المشاريع': 'Search projects', 'ابحث باسم المشروع': 'Search by project name',
  'ارفع ملف Excel وابدأ': 'Upload an Excel file to start', 'لا توجد مشاريع تطابق البحث.': 'No projects match your search.', 'بدون تصنيف': 'Uncategorized', 'بدون بيانات': 'No data', 'مربعات': 'Tiles', 'تنفيذي': 'Executive', 'جوال': 'Mobile',
  'كل الروابط اللي شاركتيها، للعرض فقط.': 'Every link you shared, view-only.', 'ما نشرتي أي لوحة مؤشرات بعد.': 'You haven’t published a dashboard yet.', 'افتح أي مشروع، ومن قسم «المشاركة» فعّل النشر.': 'Open any project and turn on publishing in the “Sharing” section.',
  'نسخ': 'Copy', 'تم نسخ الرابط': 'Link copied', 'تم نسخ الرابط.': 'Link copied.', 'حدّد الرابط وانسخه يدويًا.': 'Select the link and copy it manually.', 'انسخ الرابط من المربع': 'Copy the link from the box',
  'مشاهدات الرابط': 'Link views', '· آخر 14 يوم': '· last 14 days', 'آخر مشاهدة': 'Last viewed', 'ما فتح أحد الرابط بعد.': 'Nobody has opened the link yet.', '🔒 محمي بكلمة مرور': '🔒 Password protected',
  'كل ملف رفعتيه، من الأحدث للأقدم.': 'Every file you uploaded, newest first.', 'المشروع': 'Project', 'الفترة': 'Period', 'الملف': 'File', 'لا توجد تحديثات بعد.': 'No updates yet.', 'ستظهر هنا عمليات الرفع والنشر.': 'Uploads and publishing will show here.',
  'تم رفع ملف': 'File uploaded', 'إعداداتك الشخصية، وهوية تنطبق على كل مشروع جديد.': 'Your personal settings, and a brand applied to every new project.', 'بياناتك': 'Your details', 'الاسم الظاهر في الترحيب': 'Name shown in the greeting',
  'الهوية الافتراضية للمشاريع الجديدة': 'Default brand for new projects', 'حفظ': 'Save', 'تم الحفظ': 'Saved', 'تعذّر الحفظ، حاول مرة أخرى': 'Couldn’t save, try again', 'مشروع': 'Project',
  // project editor
  'تفاصيل المشروع': 'Project details', 'العنوان': 'Title', 'الموضوع أو اسم الجهة': 'Topic or organization', 'وصف قصير': 'Short description', 'ماذا تعرض لوحة المؤشرات هذه ولمن؟': 'What does this dashboard show, and for whom?',
  'مثال: شركة آفاق · قسم المبيعات': 'e.g. Afaaq Co. · Sales', 'مثال: الربع الثالث 2026': 'e.g. Q3 2026', 'مثال: سبتمبر 2026': 'e.g. September 2026', 'بدون عنوان': 'Untitled',
  'الهوية البصرية': 'Visual identity', 'ارفع الشعار': 'Upload logo', 'رفع الشعار': 'Upload logo', 'PNG أو SVG أو JPG، حتى 2MB': 'PNG, SVG or JPG, up to 2MB', 'ألوان الشعار. اضغط لونًا لجعله اللون الرئيسي': 'Logo colors. Click one to make it the primary color',
  'الرئيسي': 'Primary', 'الثانوي': 'Secondary', 'المميز': 'Accent', 'الرئيسي: اختيار من الألوان': 'Primary: pick a color', 'الثانوي: اختيار من الألوان': 'Secondary: pick a color', 'المميز: اختيار من الألوان': 'Accent: pick a color',
  'الرئيسي: كود اللون': 'Primary: color code', 'الثانوي: كود اللون': 'Secondary: color code', 'المميز: كود اللون': 'Accent: color code', 'الخط': 'Font', 'إزالة الشعار': 'Remove logo', 'جاري رفع الشعار…': 'Uploading logo…', 'تعذّر رفع الشعار': 'Couldn’t upload the logo',
  'اختر صورة بصيغة PNG أو SVG أو JPG': 'Choose a PNG, SVG or JPG image', 'حجم الشعار أكبر من 2MB': 'The logo is larger than 2MB',
  'البيانات': 'Data', 'ملف البيانات (Excel أو CSV)': 'Data file (Excel or CSV)', 'ملف البيانات الفعلية': 'Actual data file', 'يحل محل البيانات الحالية ويُحفظ كتحديث جديد': 'Replaces the current data and is saved as a new update',
  'أو الصق الجدول من Excel': 'Or paste the table from Excel', 'انسخ الجدول مع صف العناوين والصقه هنا': 'Copy the table with its header row and paste it here', 'استخدام البيانات الملصوقة': 'Use pasted data',
  'ما تعرف شكل الملف؟ حمّل نموذج جاهز:': 'Not sure about the format? Download a ready template:', 'نموذج مبيعات': 'Sales template', 'نموذج تسويق': 'Marketing template', 'الورقة': 'Sheet', 'ورقة المستهدف': 'Target sheet',
  'ملف المستهدف (اختياري)': 'Target file (optional)', 'ملف المستهدف': 'Target file', 'لحساب نسبة الإنجاز. مثال: عمود الفرع وعمود المستهدف': 'To calculate achievement. e.g. a branch column and a target column', 'إزالة ملف المستهدف': 'Remove target file',
  'ربط المستهدف بالبيانات': 'Link target to data', 'الربط في البيانات': 'Key in data', 'قيمة الفعلي': 'Actual value', 'الربط في المستهدف': 'Key in target', 'قيمة المستهدف': 'Target value',
  'اسم الفترة لهذا التحديث': 'Period name for this update', 'نشر التحديث': 'Publish update', 'تجاهل': 'Discard', 'هكذا فُهمت الأعمدة. غيّر النوع إذا كان غير صحيح.': 'This is how the columns were read. Change a type if it’s wrong.',
  'تقرير التنظيف': 'Cleaning report', 'البيانات نظيفة، ما احتجنا نغيّر شي.': 'The data is clean; nothing needed changing.', 'حذفها': 'Remove them', 'تراجع': 'Undo', 'حذف المكرر': 'Remove duplicates', 'اعتبره رقم': 'Treat as number',
  'رقم': 'Number', 'تاريخ': 'Date', 'فئة': 'Category', 'نص': 'Text', 'جاري قراءة الملف…': 'Reading the file…', 'جاري النشر…': 'Publishing…', 'تم التحديث': 'Updated', 'تم تجاهل التحديث.': 'Update discarded.',
  'تم نشر التحديث. الرابط يعرض البيانات الجديدة الآن.': 'Update published. The link shows the new data now.', 'لا توجد بيانات بعد. ارفع أول ملف.': 'No data yet. Upload your first file.', 'لا توجد بيانات بعد': 'No data yet',
  'ارفع ملف البيانات أولًا، ثم ملف المستهدف.': 'Upload the data file first, then the target file.', 'ملف المستهدف جاهز. راجع الربط ثم انشر التحديث.': 'Target file ready. Check the link, then publish the update.', 'تعذّرت قراءة ملف المستهدف.': 'Couldn’t read the target file.',
  'اختر ملفًا بصيغة xlsx أو xls أو csv.': 'Choose an xlsx, xls or csv file.', 'الصق الجدول أولًا.': 'Paste the table first.', 'لم أستطع ربط المستهدف تلقائيًا. اختر الأعمدة يدويًا.': 'Couldn’t link the target automatically. Pick the columns manually.',
  'تعذّرت قراءة البيانات. تأكد أن أحد الصفوف الأولى يحتوي عناوين الأعمدة.': 'Couldn’t read the data. Make sure one of the first rows holds the column names.', 'مستهدف': 'Target',
  'تعذّر تحميل أداة قراءة Excel. تحقق من الاتصال بالإنترنت، أو جرّب من شبكة ثانية (بعض شبكات العمل تحجبها).': 'Couldn’t load the Excel reader. Check your connection, or try another network (some work networks block it).',
  'الملف محمي بكلمة مرور أو بتصنيف حماية من الشركة. افتحه في Excel واحفظ نسخة جديدة بدون حماية، أو انسخ الجدول والصقه في خانة اللصق.': 'The file is password-protected or has a company protection label. Open it in Excel and save an unprotected copy, or paste the table instead.',
  'الملف فاضي أو ما فيه صف عناوين. تأكد أن أول صف في الجدول فيه أسماء الأعمدة.': 'The file is empty or has no header row. Make sure the first row holds the column names.',
  'القالب وشكل الرسوم': 'Template & chart style', 'ماذا تعرض الرسوم': 'What the charts show', 'اختر الرقم والأعمدة اللي تتربط فيها. «تلقائي» يخلي الموقع يختار.': 'Choose the number and the columns it’s split by. “Auto” lets the site choose.',
  'المؤشر (الرقم)': 'Metric (number)', 'التقسيم الأساسي': 'Main split', 'التقسيم الثاني (ألوان الأعمدة)': 'Second split (bar colors)', 'الرسم الدائري حسب': 'Pie chart by', 'تلقائي': 'Auto', 'بدون': 'None', 'عدد السجلات': 'Record count',
  'ارفع البيانات أولًا.': 'Upload data first.', 'شكل الرسوم': 'Chart style', 'خصّص الشكل': 'Customize', 'رجوع للشكل الافتراضي': 'Back to default style',
  'التوزيع حسب الفئة': 'Breakdown by category', 'الحصص': 'Shares', 'الاتجاه عبر الزمن': 'Trend over time', 'نسبة الإنجاز': 'Achievement', 'توقع الأشهر القادمة': 'Forecast next months',
  'أعمدة': 'Bars', 'أفقي': 'Horizontal', 'خطي': 'Line', 'دائري': 'Pie', 'حلقي': 'Doughnut', 'مساحة': 'Area', 'عداد': 'Gauge', 'شريط': 'Bar', 'إظهار': 'Show',
  'مربعات تحليلية': 'Analytic tiles', 'تقرير تنفيذي': 'Executive report', 'ملخص للجوال': 'Mobile summary',
  'شبكة مربعات بأرقام كبيرة ونسب تغير ورسوم صغيرة': 'A grid of tiles with big numbers, change rates and small charts', 'شريط بهوية الجهة ومؤشرات ورسم اتجاه كبير': 'A branded banner, KPIs and a large trend chart', 'عمود واحد مرتب يناسب الشاشات الصغيرة': 'One tidy column that suits small screens',
  'التوصيات': 'Recommendations', 'تظهر في لوحة المؤشرات وفي الرابط المنشور. ولّدها من البيانات، وعدّل أو احذف أو أضف توصياتك.': 'Shown on the dashboard and the published link. Generate them from the data, then edit, delete or add your own.',
  'توليد توصيات من البيانات': 'Generate recommendations from data', 'توصية جديدة': 'New recommendation', 'اكتب توصيتك هنا': 'Write your recommendation here', 'إضافة': 'Add', 'حذف': 'Delete', 'حذف التوصية': 'Delete recommendation',
  'لا توجد توصيات بعد.': 'No recommendations yet.', 'ارفع ملف البيانات أولًا.': 'Upload the data file first.', 'لا توجد توصيات جديدة من هذه البيانات.': 'No new recommendations from this data.',
  'الملاحظات والقرارات': 'Notes & decisions', 'سجّل ملاحظاتك وقراراتك على هذه البيانات. تظهر في اللوحة والرابط للقراءة فقط.': 'Record your notes and decisions on this data. They appear on the dashboard and link, read-only.',
  'نوع الملاحظة': 'Note type', 'ملاحظة': 'Note', 'قرار': 'Decision', 'إجراء مطلوب': 'Action needed', 'مثال: نوقف حملة الفرع الشمالي ونحوّل الميزانية لجدة من الشهر القادم.': 'e.g. Pause the north branch campaign and move the budget to Jeddah from next month.',
  'لا توجد ملاحظات بعد.': 'No notes yet.', 'نص الملاحظة': 'Note text',
  'نشر لوحة المؤشرات برابط عام (للعرض فقط)': 'Publish the dashboard with a public link (view-only)', 'رابط المشاركة': 'Share link', 'كلمة مرور للرابط (اختياري)': 'Link password (optional)', 'بدون كلمة مرور': 'No password',
  'إزالة كلمة المرور': 'Remove password', 'الرابط محمي بكلمة مرور': 'The link is password-protected', 'الرابط يعمل الآن. أي شخص معه الرابط يقدر يتصفح.': 'The link is live. Anyone with it can browse.', 'أُوقف الرابط. لن يفتح لأحد.': 'The link is off. It won’t open for anyone.',
  'تم النشر، لكن ارفع البيانات وانشر تحديثًا لتظهر لوحة المؤشرات.': 'Published, but upload data and publish an update for the dashboard to appear.', 'اكتب كلمة مرور من 4 أحرف أو أكثر.': 'Enter a password of 4 or more characters.',
  'تم حفظ كلمة المرور. أرسلها لمن تريد مع الرابط.': 'Password saved. Send it with the link to whoever you want.', 'أُزيلت كلمة المرور.': 'Password removed.', 'تعذّر حفظ كلمة المرور.': 'Couldn’t save the password.', 'فعّل النشر وشارك الرابط لتبدأ المشاهدات.': 'Turn on publishing and share the link to start getting views.',
  'حذف المشروع': 'Delete project', 'يُحذف المشروع وكل تحديثاته نهائيًا.': 'The project and all its updates are deleted permanently.', 'تأكيد الحذف': 'Confirm delete', 'تعذّر الحذف.': 'Couldn’t delete.', 'المشروع غير موجود': 'Project not found',
  'تعذّر إنشاء المشروع': 'Couldn’t create the project', 'تم إنشاء المشروع': 'Project created', 'تعذّر الحفظ:': 'Couldn’t save:', 'جاري الحفظ…': 'Saving…', 'لم يُحفظ بعد…': 'Not saved yet…', 'تم': 'Done',
  'معاينة مباشرة': 'Live preview', 'معاينة تحديث غير منشور': 'Preview of an unpublished update', 'صورة': 'Image', '⛶ تكبير': '⛶ Expand', '✕ تصغير': '✕ Collapse', 'تكبير المعاينة لملء الشاشة (Esc للرجوع)': 'Expand the preview to full screen (Esc to exit)',
  'فتح رابط المشاركة': 'Open share link', 'عرض الكل': 'Show all', 'الحالي': 'Current', 'لا يوجد': 'None'
};
// sentences built with numbers/names: [pattern, replacement]
const RULES = [
  [/تمت قراءة ([\d,]+) صف و(\d+) عمود من «([^»]+)»\./g, 'Read $1 rows and $2 columns from “$3”.'],
  [/ملف المستهدف: ([\d,]+) صف\./g, 'Target file: $1 rows.'],
  [/راجع المعاينة ثم اضغط «نشر التحديث»\./g, 'Check the preview, then press “Publish update”.'],
  [/البيانات الحالية: /g, 'Current data: '],
  [/أُضيفت (\d+) توصيات\. عدّلها أو احذف ما لا يناسب\./g, 'Added $1 recommendations. Edit or delete any that don’t fit.'],
  [/تجاهلنا (\d+) (?:صف|صفوف) فوق الجدول \(عنوان أو ملاحظات\)، وبدأنا من صف العناوين\./g, 'Skipped $1 row(s) above the table (title or notes) and started at the header row.'],
  [/أبقينا (\d+) (?:صف إجمالي|صفوف إجمالي) \(([^)]*)\)\. قد ينحسب المجموع مرتين\./g, 'Kept $1 total row(s) ($2). Totals may be counted twice.'],
  [/حذفنا (\d+) (?:صف إجمالي|صفوف إجمالي) \(([^)]*)\) عشان ما ينحسب المجموع مرتين\./g, 'Removed $1 total row(s) ($2) so totals aren’t counted twice.'],
  [/حذفنا (\d+) (?:صف مكرر|صفوف مكررة) \(متطابقة في كل الأعمدة\)\./g, 'Removed $1 duplicate row(s) (identical in every column).'],
  [/لقينا (\d+) (?:صف مكرر|صفوف مكررة) بالضبط\. إذا كانت تكرار بالغلط احذفها\./g, 'Found $1 exact duplicate row(s). Remove them if they’re a mistake.'],
  [/عمود «([^»]+)» فيه أرقام، بس اعتبرناه ترقيم\/نص فما ينجمع\./g, 'Column “$1” holds numbers, but it was treated as an ID/text so it isn’t summed.'],
  [/حوّلنا ([\d,]+) قيمة مكتوبة كنص \(مثل «1,200 ر\.س» أو أرقام عربية\) إلى أرقام\./g, 'Converted $1 values written as text (like “1,200 SAR” or Arabic digits) into numbers.'],
  [/تجاهلنا (\d+) (?:عمود فاضي|أعمدة فاضية) بدون عنوان\./g, 'Ignored $1 empty column(s) with no header.'],
  [/عمود «([^»]+)» فيه ([\d,]+) (?:خانة فاضية|خانات فاضية) \((\d+)%\)\. ما عدّلناها\./g, 'Column “$1” has $2 blank cell(s) ($3%). Left as is.'],
  [/الملف فيه ([\d,]+) صف؛ استخدمنا أول ([\d,]+) صف فقط\./g, 'The file has $1 rows; only the first $2 were used.'],
  [/تعذّرت قراءة الملف \(/g, 'Couldn’t read the file ('], [/\)\. جرّب تحفظه بصيغة \.xlsx أو انسخ الجدول والصقه في خانة اللصق\./g, '). Try saving it as .xlsx, or paste the table instead.'],
  [/تعذّر النشر: /g, 'Couldn’t publish: '], [/استخدام (#[0-9a-fA-F]{6}) كلون رئيسي/g, 'Use $1 as primary color'], [/^نوع (.+)$/g, 'Type of $1'], [/^رابط (.+)$/g, 'Link for $1'], [/^فتح (.+)$/g, 'Open $1'], [/^توصية (\d+)$/g, 'Recommendation $1'],
  [/^قبل دقيقة$/g, '1 min ago'], [/^قبل دقيقتين$/g, '2 min ago'], [/^قبل (\d+) (?:دقائق|دقيقة)$/g, '$1 min ago'],
  [/^قبل ساعة$/g, '1 hour ago'], [/^قبل ساعتين$/g, '2 hours ago'], [/^قبل (\d+) (?:ساعات|ساعة)$/g, '$1 hours ago'],
  [/^قبل يوم$/g, '1 day ago'], [/^قبل يومين$/g, '2 days ago'], [/^قبل (\d+) (?:أيام|يوم)$/g, '$1 days ago'], [/(^|\s)الآن($|\s)/g, '$1just now$2'],
  [/قبل دقيقتين/g, '2 min ago'], [/قبل دقيقة/g, '1 min ago'], [/قبل (\d+) (?:دقائق|دقيقة)/g, '$1 min ago'], [/قبل ساعتين/g, '2 hours ago'], [/قبل ساعة/g, '1 hour ago'], [/قبل (\d+) (?:ساعات|ساعة)/g, '$1 hours ago'],
  [/قبل يومين/g, '2 days ago'], [/قبل يوم/g, '1 day ago'], [/قبل (\d+) (?:أيام|يوم)/g, '$1 days ago'],
  [/^(صباح|مساء) الخير، (.+)$/g, (m0, a, n) => (a === 'صباح' ? 'Good morning, ' : 'Good evening, ') + n],
  [/^منشورة (\d+%)$/g, 'Published $1'], [/^محدّثة خلال 30 يوم (\d+%)$/g, 'Updated in 30 days $1'], [/^فيها بيانات (\d+%)$/g, 'Have data $1'],
  [/آخر تحديث/g, 'last update'], [/(\d+) هـ/g, '$1 AH'],
  [/(\d+) (محرم|صفر|ربيع الأول|ربيع الآخر|جمادى الأولى|جمادى الآخرة|رجب|شعبان|رمضان|شوال|ذو القعدة|ذو الحجة)/g, (m0, d, mo) => d + ' ' + HM[mo]],
  [/(\d+) من 4 مكتملة/g, '$1 of 4 done'], [/الأسبوع (\d+) من السنة/g, 'Week $1 of the year'], [/(\d+) منشور · (\d+) مسودة/g, '$1 published · $2 draft'], [/(\d+) تحديث/g, '$1 updates'],
  [/(\d+) أحداث/g, '$1 events'], [/، (\d+ events)/g, ', $1'], [/تم رفع ملف/g, 'File uploaded'], [/تم إنشاء المشروع/g, 'Project created'], [/تم النشر/g, 'Published'], [/عدّلتي الهوية/g, 'Brand edited'], [/([\d,]+) مشاهدة/g, '$1 views'], [/آخرها /g, 'last '], [/([\d,]+) سجل/g, '$1 records'], [/([\d,]+) صف/g, '$1 rows'], [/^رسم (.+)$/g, 'Chart of $1'], [/^حسب (.+)$/g, 'by $1'],
  // month names only next to a number (dates), so titles that mention a month are left alone
  [/(\d+)\s*(يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر)/g, (m0, d, mo) => d + ' ' + MO[mo]],
  [/(يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر)\s*(\d+)/g, (m0, mo, d) => MO[mo] + ' ' + d],
  [/^(يناير|فبراير|مارس|أبريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر)$/g, (m0, mo) => MO[mo]],
  [/^(السبت|الأحد|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة)$/g, (m0, d) => DAY[d]],
  [/ · منشور$/g, ' · Published'], [/ · مسودة$/g, ' · Draft']
];
const MO = { 'يناير': 'Jan', 'فبراير': 'Feb', 'مارس': 'Mar', 'أبريل': 'Apr', 'مايو': 'May', 'يونيو': 'Jun', 'يوليو': 'Jul', 'أغسطس': 'Aug', 'سبتمبر': 'Sep', 'أكتوبر': 'Oct', 'نوفمبر': 'Nov', 'ديسمبر': 'Dec' };
const DAY = { 'السبت': 'Saturday', 'الأحد': 'Sunday', 'الاثنين': 'Monday', 'الثلاثاء': 'Tuesday', 'الأربعاء': 'Wednesday', 'الخميس': 'Thursday', 'الجمعة': 'Friday' };
const HM = { 'محرم': 'Muharram', 'صفر': 'Safar', 'ربيع الأول': 'Rabi I', 'ربيع الآخر': 'Rabi II', 'جمادى الأولى': 'Jumada I', 'جمادى الآخرة': 'Jumada II', 'رجب': 'Rajab', 'شعبان': 'Shaban', 'رمضان': 'Ramadan', 'شوال': 'Shawwal', 'ذو القعدة': 'Dhu al-Qidah', 'ذو الحجة': 'Dhu al-Hijjah' };
const AR = /[؀-ۿ]/;
const SKIP = '.dash, .d-sqlmodal, bdi, textarea, input, [data-no-i18n], [lang="ar"], script, style, code';
function tr(s) {
  const t = s.trim(); if (!t || !AR.test(t)) return null;
  if (EXACT[t]) return s.replace(t, EXACT[t]);
  let o = t; for (const [re, rep] of RULES) o = o.replace(re, rep);
  return o !== t ? s.replace(t, o) : null;
}
function skip(el) { return !el || (el.closest && el.closest(SKIP)); }
function walk(root) {
  if (root.nodeType === 3) { if (!skip(root.parentElement)) { const n = tr(root.nodeValue); if (n != null) root.nodeValue = n; } return; }
  if (root.nodeType !== 1) return;
  const inUser = root.closest('.dash, .d-sqlmodal, [data-no-i18n], [lang="ar"]');
  if (!inUser) for (const a of ['placeholder', 'aria-label', 'title']) { const v = root.getAttribute(a); if (v) { const n = tr(v); if (n != null) root.setAttribute(a, n); } }
  if (skip(root)) return;
  if (root.tagName === 'OPTION' && !root.closest('.dash')) { const n = tr(root.textContent); if (n != null) root.textContent = n; return; }
  for (const c of [...root.childNodes]) walk(c);
}
export function startI18n() {
  if (document.documentElement.lang !== 'en') return;
  const t = tr(document.title); if (t) document.title = t;
  walk(document.body);
  let busy = false;
  new MutationObserver(ms => {
    if (busy) return; busy = true;
    try { for (const m of ms) { if (m.type === 'characterData') walk(m.target); else if (m.type === 'attributes') walk(m.target); else m.addedNodes.forEach(walk); } }
    finally { busy = false; }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'aria-label', 'title'] });
}
