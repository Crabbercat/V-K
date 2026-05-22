from django.conf import settings
from pymongo import ASCENDING, DESCENDING, MongoClient


# Create client with tz_aware so datetimes returned from MongoDB are timezone-aware (UTC)
_client = MongoClient(settings.MONGODB_URI, tz_aware=True)
_db = _client[settings.MONGODB_DB_NAME]


def get_db():
    return _db


def ensure_indexes() -> None:
    _db.devices.create_index([("deviceId", ASCENDING)], unique=True)
    _db.telemetry.create_index([("deviceId", ASCENDING), ("timestamp", DESCENDING)])
    _db.commands.create_index([("deviceId", ASCENDING), ("timestamp", DESCENDING)])
    _db.events.create_index([("deviceId", ASCENDING), ("timestamp", DESCENDING)])
    _db.device_status.create_index([("deviceId", ASCENDING)], unique=True)
