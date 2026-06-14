"""Root NinjaAPI: mounts the versioned routers."""
from ninja import NinjaAPI

from apps.auth_api.api import router as auth_router
from apps.devices.api import router as devices_router
from apps.ingest.api import router as ingest_router
from apps.legal.api import router as legal_router
from apps.web.api import router as web_router

api = NinjaAPI(
    title="MeteorPointer API",
    version="0.1.0",
    description="Device-based auth and secure measurement synchronisation.",
    docs_url="/api/docs",
)


@api.get("/healthz", tags=["meta"])
def healthz(request):
    return {"status": "ok"}


api.add_router("/v1/legal", legal_router, tags=["legal"])
api.add_router("/v1/devices", devices_router, tags=["devices"])
api.add_router("/v1/auth", auth_router, tags=["auth"])
api.add_router("/v1/reports", ingest_router, tags=["reports"])
api.add_router("/v1/web", web_router, tags=["web"])
