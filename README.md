# Global Kick - ربات روبیکا

## راه‌اندازی
1. Node.js 18+ و MongoDB نصب باشد.
2. `cp .env.example .env` و مقادیر را پر کنید (BOT_TOKEN, OWNER_PASS, ADMIN_PASS).
3. `npm install` سپس `npm start`
4. روی لینوکس برای نمایش فارسی جدول فونت نصب کنید: `apt install fonts-vazirmatn fonts-dejavu`
5. ربات را در گروه اضافه کنید، با حساب مالک/ادمین (بعد از /panel در پیوی) داخل گروه `/setgroup` بزنید.
6. از /panel: «ساخت برنامه مسابقات» سپس «اجرای هفته بعد» (یا MATCH_INTERVAL_MIN برای اتوماتیک).
## اسم بازیکنان واقعی: src/data.js → REAL_NAMES
