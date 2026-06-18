from django.urls import path
from . import views

urlpatterns = [
    path('api/csrf/', views.get_csrf, name='get_csrf'),
    path('api/slots/', views.get_slots, name='get_slots'),
    path('api/book/', views.create_booking, name='create_booking'),
    path('api/admin/slot/<int:slot_id>/', views.admin_manage_slot, name='admin_manage_slot'),
    path('api/admin/block-day/', views.admin_block_day, name='admin_block_day'),
    path('api/admin/export/', views.admin_export, name='admin_export'),
    path('api/admin/import/', views.admin_import, name='admin_import'),
    path('api/admin/bookings/', views.admin_bookings, name='admin_bookings'),
    path('api/download-guide/', views.download_guide_pdf, name='download_guide_pdf'),
]
