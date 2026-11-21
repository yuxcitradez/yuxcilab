import os

ENGINE_VERSION = "0.2.0"


def env(name: str, default: str | None = None) -> str:
    v = os.environ.get(name, default)
    if v is None:
        raise RuntimeError(f"Missing environment variable {name}")
    return v


def engine_token() -> str:
    return env("ENGINE_TOKEN")


def callback_url() -> str:
    return env("APP_CALLBACK_URL").rstrip("/")
