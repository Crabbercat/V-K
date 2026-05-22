import os
import sys

from django.apps import AppConfig


class DashboardConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.dashboard"

    def ready(self) -> None:
        if os.environ.get("DJANGO_RUN_MQTT", "1") != "1":
            return

        # Do not start MQTT listener for one-off management commands.
        is_manage_py = bool(sys.argv) and sys.argv[0].endswith("manage.py")
        if is_manage_py:
            command = sys.argv[1] if len(sys.argv) > 1 else ""
            if command != "runserver":
                return

        # Django runserver starts a parent process plus a reloader child.
        # Start MQTT only in the reloader child to avoid duplicate listeners.
        is_runserver = any("runserver" in arg for arg in sys.argv)
        if is_runserver and os.environ.get("RUN_MAIN") != "true":
            return

        from mqtt_service.mqtt_client import start_mqtt_listener

        start_mqtt_listener()
