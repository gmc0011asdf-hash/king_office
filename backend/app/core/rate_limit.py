"""محدد معدّل الطلبات (slowapi) — يُربَط بـ app.state.limiter في main."""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
