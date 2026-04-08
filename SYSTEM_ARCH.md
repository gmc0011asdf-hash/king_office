# SYSTEM ARCHITECTURE — Agent & Skills Map

## 1. تعريف الوكيل (The Agent)
**King Office Manager Agent**: هو وكيل ذكي هدفه إدارة عمليات مزود خدمة الإنترنت (ISP) والمكتب التجاري. يعمل كطبقة ذكاء بين قاعدة البيانات وواجهة المستخدم، مسؤول عن الأتمتة والتحقق من صحة العمليات.

## 2. المهارات (Skills)
- **SubscriberManagementSkill**: 
    - *Input*: بيانات المشترك، رقم FTTH، الباقة.
    - *Logic*: التحقق من صحة البيانات + تحديث Supabase.
    - *Output*: سجل مشترك مفعّل (Connected).
- **FinancialAccountingSkill**:
    - *Input*: حركة المحفظة (Wallet)، المصروفات.
    - *Logic*: حساب الرصيد التراكمي ومطابقة القيود.
    - *Output*: كشف حساب دقيق.
- **DatabaseSkill**:
    - *Input*: طلب اتصال، Schema DDL.
    - *Logic*: الاتصال الآمن بـ Supabase Pooling.
    - *Output*: استجابة Health: Connected.

## 3. قوالب المهام (Task Templates)
- **تجديد اشتراك**: مهارة `InternetSkill` مسؤولة. الملف المسبب: `backend/app/modules/internet/service.py`.
- **خطأ دفع**: مهارة `FinancialSkill` مسؤولة. الملف المسبب: `backend/app/modules/expenses/`.

## 4. استراتيجية تشخيص الأخطاء
يتم ربط كل Error Code بالـ `Skill` المسؤولة في السجلات (Logs) لتحديد مكان الخلل فوراً دون الحاجة لمسح كامل الكود.
