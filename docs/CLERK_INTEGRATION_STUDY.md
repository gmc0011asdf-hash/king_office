# دراسة جدوى: استبدال AuthSkill بـ Clerk
## Clerk Integration Feasibility Study — King Office

**تاريخ الدراسة:** 2026-04-06  
**الحالة:** تحليل — لا تنفيذ بعد

---

## الحكم المبدئي

> **الاستبدال يزيد التعقيد بشكل كبير ولا يُبسّط النظام في حالة King Office.**  
> التوصية: **أبقِ AuthSkill الحالية.** راجع الأسباب أدناه.

---

## 1. تحليل التأثير (Impact Analysis)

### حجم AuthSkill الحالية

| المقياس | القيمة |
|---|---|
| نقاط حقن `get_current_user` / `require_admin` | **116 موقع** |
| عدد الملفات المتأثرة | **17 ملف** |
| أكثر الملفات اعتماداً | `materials_router.py` (20)، `meta_router.py` (18)، `subscribers_router.py` (16) |
| FKs تشير لـ `users.id` | **4 علاقات**: `subscriber_debt_entries`, `notifications`, `activity_log`, `audit_logs` |

### كيف يعمل النظام الحالي

**Backend:** `oauth2_scheme` يسحب `Bearer token` → `security.get_current_user_from_token()` يفك JWT محلياً → يُرجع `models.User` من PostgreSQL.

**Frontend** ([src/api/client.ts:140](../src/api/client.ts#L140)):
```typescript
const token = !skipAuth ? authStorage.getToken?.() : null;
// يُضاف في كل طلب:
Authorization: `Bearer ${token}`
```
التوكن مخزَّن محلياً في `authStorage` (localStorage). لا يوجد SDK خارجي.

---

## 2. ما الذي سيتغير مع Clerk

### Frontend
```
الحالي:  Login form → POST /api/auth/login → JWT محلي → authStorage
مع Clerk: ClerkProvider → useAuth() → Clerk JWT → كل طلب
```

**التغييرات المطلوبة:**
- تغليف `App.tsx` بـ `<ClerkProvider publishableKey={...}>`
- استبدال `Login.tsx` بـ `<SignIn />` من Clerk
- استبدال `authStorage.getToken()` في `client.ts` بـ `await getToken()` من `useAuth()`
- حماية Routes بـ `<SignedIn>` / `<RedirectToSignIn>`
- حذف `ForceChangePassword.tsx` (Clerk يدير كلمات المرور)

**تقدير حجم التغيير Frontend:** ~15-20 ملف

### Backend
```
الحالي:  JWT.decode(SECRET_KEY) → user من DB محلي
مع Clerk: JWKS من Clerk → verify signature → clerk_user_id → lookup في DB
```

**التغييرات المطلوبة:**
```python
# get_current_clerk_user — بديل get_current_user
async def get_current_clerk_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db: Annotated[Session, Depends(database.get_db)],
) -> models.User:
    import httpx
    from jose import jwt, JWTError

    # 1. جلب JWKS من Clerk (يُخزَّن cache)
    jwks_url = f"https://clerk.your-domain.com/.well-known/jwks.json"
    async with httpx.AsyncClient() as client:
        jwks = (await client.get(jwks_url)).json()

    # 2. التحقق من التوكن
    try:
        payload = jwt.decode(
            token,
            jwks,           # مفتاح عام من Clerk
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
        clerk_user_id: str = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid Clerk token")

    # 3. ربط بـ users المحلي
    user = db.query(models.User).filter(
        models.User.clerk_id == clerk_user_id
    ).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not provisioned in local DB")

    return user
```

**ثم استبدال 116 موقع** من:
```python
_: models.User = Depends(get_current_user)
```
إلى:
```python
_: models.User = Depends(get_current_clerk_user)
```

---

## 3. مشكلة مزامنة قاعدة البيانات (Database Sync Problem)

هذه هي **المشكلة الأكبر** في التكامل.

### الوضع الحالي
```
users.id (INTEGER) ← ForeignKey من 4 جداول
users.email        ← معرّف بشري
users.role         ← admin | user (منطق صلاحيات محلي)
users.permissions  ← JSON مخصص لـ King Office
```

### ما يحدث مع Clerk
```
Clerk يُدير: clerk_user_id (string مثل "user_2abc123")
             email
             password
             sessions

King Office يحتاج: users.id (INTEGER) للـ FKs
                   users.role (admin/user)
                   users.permissions (JSON مخصص)
                   users.status (active/inactive)
```

### الحل الوحيد الممكن: Webhook Sync
```
Clerk Webhook (user.created) → FastAPI endpoint → INSERT users (clerk_id, email, role='user')
Clerk Webhook (user.deleted) → FastAPI endpoint → UPDATE users.status='inactive'
```

**المشاكل:**
1. يجب إضافة `clerk_id VARCHAR` لجدول `users` — migration جديدة
2. مستخدمون موجودون في DB لا يملكون `clerk_id` → يجب ترحيل يدوي
3. `users.permissions` (JSON مخصص) — Clerk لا يعرف عنه شيئاً
4. **البيئة المحلية (localhost):** Clerk webhooks لا تعمل مع localhost بدون tunnel (ngrok)

---

## 4. تأثير على مهارات الوكيل الأخرى

| المهارة | التأثير | التفاصيل |
|---|---|---|
| **AuthSkill** | ✗ تُحذف كلياً | `security.py`, `login_router.py` تُستبدل |
| **SubscriberManagementSkill** | تأثير غير مباشر | `created_by_user_id` FK يبقى لكن يحتاج مستخدم مُزامَن |
| **AuditSkill** | تأثير غير مباشر | `audit_logs.user_id` + `activity_log.user_id` يحتاجان مستخدم محلي |
| **SettingsSkill** | تأثير غير مباشر | `notifications.user_id` FK |
| **FTTHSyncSkill** | لا تأثير | لا تعتمد على auth |
| **OfficeSalesSkill** | لا تأثير | لا FK لـ users |
| **FinancialSkill** | لا تأثير | لا FK لـ users |
| **NotificationsSkill** | لا تأثير | يعتمد على Telegram وليس auth |

**الخلاصة:** 4 مهارات تتأثر بشكل أو بآخر.

---

## 5. المقارنة المباشرة

| المعيار | AuthSkill الحالية | Clerk |
|---|---|---|
| **التعقيد** | منخفض — كل شيء محلي | عالٍ — external service + webhook sync |
| **الملفات المتأثرة عند التغيير** | 0 (تعمل الآن) | 17+ backend + 15+ frontend |
| **العمل بدون إنترنت** | ✓ نعم | ✗ لا (Clerk cloud-only) |
| **الصلاحيات المخصصة** | ✓ JSON مرن في `users.permissions` | يحتاج Clerk metadata + تعقيد إضافي |
| **التكلفة** | $0 | مجاني حتى 10,000 MAU ثم $25/شهر |
| **الـ DX (تجربة المطور)** | واضح ومحلي | UI جاهز لكن تكامل معقد |
| **وقت التنفيذ المُقدَّر** | - | 3-5 أيام عمل + اختبار |
| **خطر كسر الإنتاج** | 0 | عالٍ (116 نقطة تغيير) |

---

## 6. متى يكون Clerk منطقياً؟

Clerk يُضيف قيمة **فقط** في هذه الحالات:

1. **مستخدمون خارجيون (عملاء)** يسجلون بأنفسهم — King Office نظام داخلي، المستخدمون يُضافون من المدير فقط.
2. **Social login** (Google, GitHub) — لا حاجة لهذا في ISP management.
3. **MFA / Passkeys** — يمكن إضافتها للنظام الحالي بدون Clerk.
4. **عشرات الآلاف من المستخدمين** — النظام الحالي يخدم فريق صغير (موظفو المكتب فقط).

---

## 7. التوصية النهائية

```
❌ لا تستبدل AuthSkill الحالية بـ Clerk.

الأسباب:
  1. 116 نقطة تغيير في البكند وحده
  2. مشكلة مزامنة DB معقدة (clerk_id ↔ users.id)
  3. Clerk لا يعرف عن permissions JSON المخصص
  4. التطبيق نظام داخلي — لا حاجة لـ social login أو self-registration
  5. يُضيف external dependency لنظام يعمل offline أو على VPN

✓ ما يمكن تحسينه بدلاً من ذلك:
  1. إضافة MFA محلي (TOTP) في security.py — يوم واحد
  2. تقصير JWT expiry + refresh tokens — يومان
  3. إضافة rate limiting على /api/auth/login — ساعة واحدة (موجود فعلاً)
```

---

## 8. إذا قررت المضي قدماً رغم ذلك

الترتيب الصحيح للتنفيذ لتجنب كسر الإنتاج:

```
المرحلة 0: إضافة clerk_id لجدول users (nullable)
  ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_id VARCHAR(255) UNIQUE;

المرحلة 1: تثبيت Clerk SDK في Frontend فقط
  npm install @clerk/clerk-react
  اختبار ClerkProvider بدون تغيير auth logic

المرحلة 2: بناء get_current_clerk_user موازي
  لا تحذف get_current_user بعد — شغّل الاثنين

المرحلة 3: ترحيل مستخدم واحد (المدير) للاختبار

المرحلة 4: ترحيل كامل بعد التحقق

المرحلة 5: حذف AuthSkill القديمة
```

**التقدير الزمني الواقعي:** 5-8 أيام عمل كاملة + أسبوع اختبار.

---

*المرجع: [KING_OFFICE_BLUEPRINT.md](../KING_OFFICE_BLUEPRINT.md) — القسم 3 (AuthSkill)*
