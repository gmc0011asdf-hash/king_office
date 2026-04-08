# King Office - نظام مكتب الملك

نظام إدارة متكامل لإدارة الإنترنت والمكتب والبطاقات والشركاء والمصروفات.

## Quick Start

1. **Setup (first time):** Run `setup_new_machine.bat`
2. **Start:** Run `start_system_king_office.bat`
3. **Login:** admin@maktabalmalik.com / admin123

## Security & Hardening
- **Secrets:** Never commit `.env` files. Use `backend/.env.example` as a template.
- **Production:** In production, set `ENVIRONMENT=production` and provide a strong `SECRET_KEY`.
- **Scanning:** Run `python scripts/security_scan.py` to check for leaked secrets before pushing changes.
- **Email:** Uses [Resend API](https://resend.com) — set `RESEND_API_KEY` and verify your domain (`kingoffice.store`) in the Resend dashboard. `MAIL_FROM` must be from the verified domain (e.g. `noreply@kingoffice.store`). Run `python backend/diag_resend.py` to test.

## Documentation

جميع الملفات في مجلد [`docs/`](docs/README.md):

- [docs/INSTALL.md](docs/INSTALL.md) — دليل التثبيت
- [docs/TECHNICAL_GUIDE.md](docs/TECHNICAL_GUIDE.md) — البنية والـ API
- [docs/README.md](docs/README.md) — فهرس التوثيق

## API Docs

- Swagger: http://localhost:8000/docs
- Health: http://localhost:8000/health
