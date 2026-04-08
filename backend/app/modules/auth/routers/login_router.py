import json
import secrets
from datetime import datetime, timedelta

from app.core.mail_service import send_password_reset_email_async

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from starlette.requests import Request
from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core import database, security
from app.core.config import settings
from app.core.rate_limit import limiter
from app.core.dependencies import get_current_user, require_active_user
from app.models import models
from app.schemas import schemas

router = APIRouter(tags=['Authentication'])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl='/api/auth/login')


def _parse_permissions(raw):
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


def _serialize_user(user: models.User):
    return {
        'id': user.id,
        'name': user.name,
        'email': user.email,
        'role': user.role,
        'password': '',
        'recovery_email': user.recovery_email,
        'last_login': user.last_login,
        'status': user.status,
        'created_at': user.created_at,
        'permissions': _parse_permissions(user.permissions),
        'requires_password_change': getattr(user, 'requires_password_change', False),
    }


def _password_matches(plain_password: str, stored_password: str) -> bool:
    """التحقق من كلمة المرور باستخدام bcrypt فقط."""
    return security.verify_password(plain_password, stored_password)




@router.post('/api/auth/login', response_model=schemas.LoginResponse)
@limiter.limit('5/minute')
def login_for_access_token(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(database.get_db),
):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not _password_matches(form_data.password, user.password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Incorrect email or password', headers={'WWW-Authenticate': 'Bearer'})

    user.last_login = datetime.utcnow()
    db.commit()
    db.refresh(user)

    # إشعار المديرين عند تسجيل دخول موظف (من أي جهاز)
    if user.role != 'admin':
        admins = db.query(models.User).filter(models.User.role == 'admin').all()
        for admin in admins:
            n = models.Notification(
                user_id=admin.id,
                title='تسجيل دخول موظف',
                message=f'قام {user.name} ({user.email}) بتسجيل الدخول إلى النظام',
                type='info',
            )
            db.add(n)
        db.commit()

    access_token = security.create_access_token(
        data={'sub': user.email},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return {
        'access_token': access_token,
        'token_type': 'bearer',
        'user': _serialize_user(user),
    }


@router.post('/api/auth/logout')
def logout():
    """Standard logout endpoint for client-side cleanup."""
    return {'ok': True, 'message': 'Logged out successfully'}


@router.get('/api/auth/me', response_model=schemas.User)
def read_users_me(current_user: models.User = Depends(get_current_user)):
    """
    Returns current user info. 
    Note: we use get_current_user (not require_active_user) so the UI can still 
    get user info (like role/name) even when a password change is pending.
    """
    return _serialize_user(current_user)


@router.post('/api/auth/forgot-password')
async def forgot_password(payload: schemas.ForgotPasswordRequest, db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.email == payload.email).first()
    if not user:
        # For security reasons, still return 200/ok but don't say "sent"
        return {'ok': True, 'message': 'إذا كان البريد مسجلاً، فستصلك رسالة قريباً'}

    if not (user.recovery_email or user.email):
        raise HTTPException(status_code=400, detail='لا يوجد بريد مخصص للاستعادة لهذا الحساب')

    # Generate secure token
    token = secrets.token_urlsafe(64)
    user.reset_code = token
    user.reset_code_expiry = datetime.utcnow() + timedelta(hours=1) # 1 hour as requested
    db.commit()

    recipient = user.recovery_email or user.email
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"

    try:
        await send_password_reset_email_async(recipient, reset_url)
    except Exception as exc:
        # Log the real error for debugging
        print(f"ERROR: Failed to send password reset email: {exc}")
        
        # Return a clear, non-crashing error to the user
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, 
            detail='تعذر إرسال بريد إعادة التعيين حالياً. يرجى التأكد من إعدادات SMTP أو المحاولة لاحقاً.'
        )

    return {'ok': True, 'message': 'تم إرسال رابط إعادة تعيين كلمة المرور إلى البريد الإلكتروني'}


@router.post('/api/auth/reset-password')
def reset_password(payload: schemas.ResetPasswordRequest, db: Session = Depends(database.get_db)):
    # Find user by token
    user = db.query(models.User).filter(models.User.reset_code == payload.token).first()
    if not user:
        raise HTTPException(status_code=400, detail='رابط إعادة التعيين غير صالح أو منتهي')

    if not user.reset_code or not user.reset_code_expiry:
        raise HTTPException(status_code=400, detail='لا يوجد طلب إعادة تعيين نشط')

    if datetime.utcnow() > user.reset_code_expiry:
        raise HTTPException(status_code=400, detail='انتهت صلاحية رابط إعادة التعيين')

    user.password = security.get_password_hash(payload.new_password)
    user.reset_code = None
    user.reset_code_expiry = None
    db.commit()

    return {'ok': True, 'message': 'تم تغيير كلمة المرور بنجاح'}


@router.post('/api/auth/force-change-password')
def force_change_password(
    payload: schemas.ForceChangePasswordRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(database.get_db),
):
    """Force password change for users with requires_password_change=True."""
    if not current_user.requires_password_change:
        raise HTTPException(status_code=400, detail='تغيير كلمة المرور غير مطلوب لهذا الحساب')

    new_password = payload.new_password
    if len(new_password) < 8:
        raise HTTPException(status_code=400, detail='كلمة المرور يجب أن تكون 8 أحرف على الأقل')

    current_user.password = security.get_password_hash(new_password)
    current_user.requires_password_change = False
    db.commit()
    db.refresh(current_user)

    return {
        'ok': True,
        'message': 'تم تغيير كلمة المرور بنجاح',
        'user': _serialize_user(current_user),
    }
