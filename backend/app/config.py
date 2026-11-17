from functools import lru_cache
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "CampusResolve"
    app_env: str = "development"  # development | test | production
    database_url: str = "sqlite:///./campusresolve.db"
    jwt_secret: str = "development-only-change-me-change-me"
    jwt_minutes: int = 480
    cors_origins: str = "http://localhost:5173"
    trusted_hosts: str = "localhost,127.0.0.1,testserver"
    cookie_secure: bool = False
    model_path: str = "models/complaint_pipeline.joblib"
    model_version: str = "unconfigured"
    seed_demo_data: bool = True
    login_attempts_per_minute: int = 8
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def origins(self) -> list[str]:
        return [x.strip() for x in self.cors_origins.split(",") if x.strip()]

    @property
    def hosts(self) -> list[str]:
        return [x.strip() for x in self.trusted_hosts.split(",") if x.strip()]

    @field_validator("jwt_secret")
    @classmethod
    def reject_weak_production_secret(cls, value: str) -> str:
        # The default is allowed only outside production so first-run development stays easy.
        if len(value) < 32:
            raise ValueError("JWT_SECRET must be at least 32 characters")
        return value

    def validate_production(self) -> None:
        if self.app_env != "production":
            return
        if self.jwt_secret == "development-only-change-me-change-me":
            raise RuntimeError("Set a unique JWT_SECRET before starting production")
        if self.seed_demo_data:
            raise RuntimeError("SEED_DEMO_DATA must be false in production")
        if not self.cookie_secure:
            raise RuntimeError("COOKIE_SECURE must be true in production")
        if self.database_url.startswith("sqlite"):
            raise RuntimeError("Use PostgreSQL, not SQLite, in production")


@lru_cache
def get_settings() -> Settings:
    return Settings()
