# قائمة الاستثناءات عند ضغط المشروع للتسليم للعميل
# Files/Folders to Exclude When Zipping Project for Client Delivery

عند إنشاء أرشيف ZIP للمشروع، **استثنِ** المجلدات والملفات التالية للحفاظ على حجم صغير وتجنب تسريب بيانات حساسة:

---

## 1. التبعيات (Dependencies)

| المسار | السبب |
|--------|-------|
| `node_modules/` | يمكن إعادة تثبيتها بـ `npm install` |
| `backend/venv/` | يمكن إعادة إنشائها بـ `python -m venv venv` |
| `venv/` | نفس السبب |
| `env/` | بيئة افتراضية |
| `.venv/` | بيئة افتراضية |

---

## 2. ملفات البناء والكاش (Build & Cache)

| المسار | السبب |
|--------|-------|
| `dist/` | مخرجات Vite - يُبنى بـ `npm run build` |
| `build/` | مخرجات بناء |
| `__pycache__/` | كاش بايثون |
| `*.py[cod]` | ملفات بايثون المترجمة |
| `.cache/` | كاش عام |
| `.pytest_cache/` | كاش pytest |
| `coverage/` | تقارير التغطية |
| `htmlcov/` | تقارير تغطية HTML |

---

## 3. البيئة والأسرار (Environment & Secrets)

| المسار | السبب |
|--------|-------|
| `.env` | **مهم جداً** - يحتوي على كلمات مرور وقيم سرية |
| `.env.local` | إعدادات محلية |
| `.env.*.local` | إعدادات محلية |

**ملاحظة:** أبقِ `.env.example` و `backend/.env.example` كمثال بدون قيم حقيقية.

---

## 4. قواعد البيانات المحلية (Local Databases)

| المسار | السبب |
|--------|-------|
| `*.db` | قواعد SQLite محلية |
| `*.sqlite` | نفس السبب |
| `*.sqlite3` | نفس السبب |
| `data/legacy/*.db` | أرشيف قواعد SQLite قديمة (غير مستخدمة) |

---

## 5. IDE ومحررات الكود

| المسار | السبب |
|--------|-------|
| `.idea/` | إعدادات JetBrains IDE |
| `.vscode/` | إعدادات VS Code (ما لم تكن مشتركة) |
| `*.swp` | ملفات vim المؤقتة |
| `*.swo` | ملفات vim المؤقتة |

---

## 6. نظام التشغيل

| المسار | السبب |
|--------|-------|
| `.DS_Store` | ملفات macOS |
| `Thumbs.db` | ملفات Windows |

---

## 7. سجلات (Logs)

| المسار | السبب |
|--------|-------|
| `*.log` | ملفات السجلات |

---

## 8. Git (إن وُجد)

| المسار | السبب |
|--------|-------|
| `.git/` | تاريخ Git - لا يُرسل للعميل عادة |

---

## أوامر سريعة لإنشاء ZIP نظيف

### Windows (PowerShell)
```powershell
# إنشاء أرشيف باستثناء المجلدات الشائعة
Compress-Archive -Path * -DestinationPath ../king_office_delivery.zip -Force -CompressionLevel Optimal
# ملاحظة: Compress-Archive لا يدعم الاستثناءات مباشرة. استخدم 7-Zip أو WinRAR مع قائمة استثناء.
```

### باستخدام 7-Zip (إن وُجد)
```bash
7z a -xr!node_modules -xr!backend\venv -xr!dist -xr!__pycache__ -xr!.env -xr!*.db -xr!.git -xr!.idea ../king_office_delivery.7z .
```

### حجم تقريبي بعد الاستثناء
- **مع** node_modules و venv: ~500 MB - 1 GB
- **بدون** (بعد الاستثناء): ~5–20 MB

---

## ما يجب تضمينه في التسليم

- [x] كود المصدر (`src/`, `backend/app/`)
- [x] `package.json`, `requirements.txt`
- [x] `.env.example`, `backend/.env.example`
- [x] `setup_new_machine.bat`, `start_system_king_office.bat`
- [x] `docs/` (بما فيه `INSTALL.md`, `ZIP_EXCLUSIONS.md`)
- [x] `tests/smoke_test.py`
- [ ] **لا تضمن** `.env` أو أي ملفات تحتوي على كلمات مرور حقيقية
