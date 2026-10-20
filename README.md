# Qoyod Accounting ERP — إصدار PostgreSQL الحقيقي

## التشغيل المحلي
```bash
npm install
cp .env.example .env        # املأ DATABASE_URL و JWT_SECRET و ADMIN_PASSWORD
npm run migrate             # إنشاء الجداول (idempotent)
npm run migrate:legacy ../qoyod-accounting-erp/web/data.json   # استيراد المنشآت والشجرة (اختياري)
npm run seed                # المستخدم المدير + الشجرة المضغوطة
npm start                   # http://localhost:3000
```

## الاختبارات
```bash
npm run test:unit           # بدون قاعدة بيانات
# اختبارات التكامل على قاعدة اختبار منفصلة (لا تستخدم الإنتاج):
createdb qoyod_test  # أو أنشئ فرعاً (branch) في Neon
TEST_DATABASE_URL=postgresql://... npm run test:api
```

## النشر على Render
1. New Web Service ← المستودع، Build: `npm install && npm run migrate && npm run seed`
2. Environment: `DATABASE_URL` (Neon + `sslmode=require`)، `JWT_SECRET`، `ADMIN_EMAIL`، `ADMIN_PASSWORD`، `CORS_ORIGINS=<نطاقك>`
3. بعد أول دخول: غيّر كلمة مرور المدير فورًا.

## النسخ الاحتياطي والاستعادة
- `npm run backup` → `pg_dump` إلى مجلد `backups/` بختم زمني. انقله لمخزن منفصل.
- الاستعادة: `psql $DATABASE_URL -f backups/qoyod-backup-XXXX.sql` على قاعدة اختبار أولًا، تحقق من الأرصدة، ثم الإنتاج.
- Neon ينشئ snapshots تلقائية — لكن لا تعتمد عليها وحدها؛ اختبر الاستعادة بنفسك.

## الأمان
- الأسرار من `.env` فقط. `audit_log` محمي بمشغّل (trigger) يمنع التعديل والحذف.
- كل العمليات المالية داخل معاملات (`BEGIN/COMMIT`) مع مفاتيح `idempotency-key`.
- الأموال تُخزَّن كـ BIGINT بالهللات — لا أرقام عشرية عائمة.
