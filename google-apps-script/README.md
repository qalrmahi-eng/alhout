# Google Apps Script — الحوت

هذا المجلد هو مصدر نسخة الخادم التي تُلصق في مشروع Apps Script المرتبط بملف Google Sheets. لا يحتوي على أسرار ولا يتصل بالملف أثناء اختبارات Next.js.

## الأعمدة

الأعمدة القديمة محفوظة في أماكنها:

- `settings`: `id, system_name, capital, default_profit_percent`
- `customers`: `id, name, phone, principal, profit_percent, installments, paid_installments, start_date, notes, status, created_at`
- `payments`: `id, customer_id, amount, payment_date, notes, created_at`

تضيف الترقية في نهاية كل ورقة فقط:

- `settings`: `default_installment_type, receipt_footer, updated_at`
- `customers`: `address, guarantor_name, guarantor_phone, profit_amount, contract_total, installment_type, delivery_date, first_due_date, expected_end_date, installment_value, paid_amount, remaining_amount, current_installment_paid, current_installment_remaining, next_due_date, archived, updated_at`
- `payments`: `request_id, receipt_number, status, cancellation_reason, cancelled_at, updated_at`

## تشغيل الترقية بأمان

1. أنشئ نسخة مستقلة من ملف Sheets من واجهة Google Drive.
2. الصق `Code.gs` في مشروع Apps Script تجريبي مرتبط بنسخة الملف.
3. شغّل `upgradeSheets()` دون معاملات. الوضع الافتراضي `dryRun` ويكتب الخطة في Execution log فقط ولا يغير أي خلية.
4. راجع الخطة وتأكد أن الأعمدة المقترحة هي الناقصة فعلاً، ثم شغّل الدالة الرسمية التالية من محرر Apps Script:

   ```js
   applySheetsUpgrade()
   ```

5. قبل أي تغيير مادي، ينشئ السكربت أوراقًا باسم `Backup_<sheet>_<timestamp>`. كما يسجل النتيجة في `migration_report`. إعادة التشغيل آمنة لأنها لا تضيف رأسًا موجودًا ولا ترتب أو تمسح أي صف.

تُقارن العناوين بعد تطبيع المسافات وNBSP وBOM والمحارف صفرية العرض وعلامات RTL/LTR وحالة الأحرف، مع إبقاء نص العنوان وترتيب العمود الفعلي دون تغيير. إذا أصبحت عناوين متعددة متساوية بعد التطبيع، تتوقف الترقية برسالة تحدد الورقة وأرقام الأعمدة؛ يجب تصحيح التكرار يدويًا قبل تشغيل `applySheetsUpgrade()`.

الرجوع البرمجي يتم بإعادة نشر إصدار Apps Script السابق. لا تحذف الأعمدة أو الصفوف الجديدة عند الرجوع؛ أوراق Backup مرجع لاستعادة القيم يدويًا إن لزم.

## النشر

1. أضف `SHEETS_API_SECRET` من **Project Settings → Script Properties**.
2. اختر **Deploy → New deployment → Web app**، والتنفيذ باسم المالك، والوصول وفق حساب النشر المناسب.
3. ضع رابط `/exec` في `SHEETS_API_URL` والسر نفسه في `SHEETS_API_SECRET` على خادم Next.js فقط.
4. اختبر `doGet` للـhealth check؛ لا يعيد أي بيانات عملاء.
5. اختبر القراءة والكتابة على نسخة Sheets تجريبية قبل نشر إصدار جديد على الملف الحقيقي.

كل القراءة الفعلية تمر بـPOST ويحمل السر في body. عمليات الإضافة والتعديل والإلغاء مقفلة بـ`LockService`. لا تُحذف دفعة أو عميل نهائيًا.
