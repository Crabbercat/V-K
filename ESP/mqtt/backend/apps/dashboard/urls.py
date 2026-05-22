from django.urls import path

from .views import api_command, api_events, api_history, api_overview, index

urlpatterns = [
    path("", index, name="dashboard-index"),
    path("api/overview", api_overview, name="api-overview"),
    path("api/history", api_history, name="api-history"),
    path("api/events", api_events, name="api-events"),
    path("api/command", api_command, name="api-command"),
]
