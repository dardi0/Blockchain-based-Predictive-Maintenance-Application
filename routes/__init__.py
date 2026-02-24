"""
Routes Package - API endpoint modülleri

Bu paket API endpoint'lerini modüler hale getirir.
Her modül belirli bir işlev grubunu içerir.
"""

from .auth import router as auth_router
from .admin import router as admin_router
from .sensors import router as sensors_router
from .predictions import router as predictions_router
from .blockchain import router as blockchain_router
from .machines import router as machines_router
from .maintenance import router as maintenance_router
from .analytics import router as analytics_router
from .automation import router as automation_router
from .notifications import router as notifications_router
from .reports import router as reports_router
from .training import router as training_router

__all__ = [
    'auth_router',
    'admin_router',
    'sensors_router',
    'predictions_router',
    'blockchain_router',
    'machines_router',
    'maintenance_router',
    'analytics_router',
    'automation_router',
    'notifications_router',
    'reports_router',
    'training_router',
]
