from datetime import datetime, timedelta, timezone
import secrets
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from .config import get_settings
from .database import get_db
from .models import User

ph = PasswordHasher()
bearer = HTTPBearer(auto_error=False)
SESSION_COOKIE = "cr_session"
CSRF_COOKIE = "cr_csrf"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def hash_password(password: str) -> str:
    return ph.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return ph.verify(hashed, password)
    except (VerifyMismatchError, Exception):
        return False


def create_token(user: User) -> str:
    s = get_settings()
    now = datetime.now(timezone.utc)
    return jwt.encode({"sub": user.id, "role": user.role, "iat": now, "exp": now + timedelta(minutes=s.jwt_minutes)}, s.jwt_secret, algorithm="HS256")


def set_auth_cookies(response, token: str) -> None:
    """Cookie is HttpOnly; CSRF token is readable only to echo in a request header."""
    s = get_settings()
    age = s.jwt_minutes * 60
    response.set_cookie(SESSION_COOKIE, token, max_age=age, httponly=True, secure=s.cookie_secure, samesite="lax", path="/")
    response.set_cookie(CSRF_COOKIE, secrets.token_urlsafe(32), max_age=age, httponly=False, secure=s.cookie_secure, samesite="lax", path="/")


def clear_auth_cookies(response) -> None:
    s = get_settings()
    response.delete_cookie(SESSION_COOKIE, secure=s.cookie_secure, samesite="lax", path="/")
    response.delete_cookie(CSRF_COOKIE, secure=s.cookie_secure, samesite="lax", path="/")


def current_user(request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)) -> User:
    # Bearer support remains for API automation/tests. Browsers use the HttpOnly cookie.
    token = credentials.credentials if credentials else request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(401, "Authentication required")
    try:
        payload = jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Invalid or expired token")
    user = db.get(User, payload.get("sub"))
    if not user or not user.active:
        raise HTTPException(401, "Account is unavailable")
    return user


def csrf_protect(request: Request) -> None:
    # Only cookie-authenticated browser requests need CSRF protection. Authorization bearer
    # calls are protected by possession of the bearer token.
    if request.method in SAFE_METHODS or request.headers.get("authorization") or request.url.path.endswith("/auth/login"):
        return
    if request.url.path.endswith("/auth/logout") and not request.cookies.get(SESSION_COOKIE):
        return
    session = request.cookies.get(SESSION_COOKIE)
    if session and not secrets.compare_digest(request.cookies.get(CSRF_COOKIE, ""), request.headers.get("X-CSRF-Token", "")):
        raise HTTPException(403, "Invalid CSRF token")


def require(*roles: str):
    def dependency(user: User = Depends(current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(403, "Insufficient permission")
        return user
    return dependency
