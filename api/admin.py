from django.contrib import admin
from .models import Slot, Booking, DayBlock

admin.site.site_header = "Panel de Administración"
admin.site.site_title = "Administración"
admin.site.index_title = "Gestión de horarios y reservas"

@admin.register(Slot)
class SlotAdmin(admin.ModelAdmin):
    list_display = ['date', 'time', 'status', 'booking_info']
    list_filter = ['date', 'status']
    search_fields = ['date']
    date_hierarchy = 'date'

    def booking_info(self, obj):
        if hasattr(obj, 'booking'):
            return f"{obj.booking.client_name} ({obj.booking.get_status_display()})"
        return "-"
    booking_info.short_description = 'Paciente'


@admin.register(Booking)
class BookingAdmin(admin.ModelAdmin):
    list_display = ['client_name', 'slot_date', 'slot_time', 'status', 'created_at']
    list_filter = ['status', 'slot__date']
    search_fields = ['client_name', 'client_email']

    def slot_date(self, obj):
        return obj.slot.date
    slot_date.short_description = 'Fecha'

    def slot_time(self, obj):
        return obj.slot.time
    slot_time.short_description = 'Hora'


@admin.register(DayBlock)
class DayBlockAdmin(admin.ModelAdmin):
    list_display = ['date', 'created_at']
