from rest_framework import serializers
from .models import Slot, Booking, DayBlock

class SlotSerializer(serializers.ModelSerializer):
    booking_status = serializers.SerializerMethodField()
    booking_name = serializers.SerializerMethodField()

    class Meta:
        model = Slot
        fields = ['id', 'date', 'time', 'status', 'booking_status', 'booking_name']

    def get_booking_status(self, obj):
        if hasattr(obj, 'booking'):
            return obj.booking.status
        return None

    def get_booking_name(self, obj):
        if hasattr(obj, 'booking'):
            return obj.booking.client_name
        return None


class BookingCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Booking
        fields = ['slot', 'client_name', 'client_email', 'client_phone', 'message']

    def validate_slot(self, value):
        if value.status != 'available':
            raise serializers.ValidationError("Este horario no está disponible.")
        if hasattr(value, 'booking'):
            raise serializers.ValidationError("Este horario ya está reservado.")
        return value


class BookingSerializer(serializers.ModelSerializer):
    slot_date = serializers.DateField(source='slot.date', read_only=True)
    slot_time = serializers.TimeField(source='slot.time', read_only=True)

    class Meta:
        model = Booking
        fields = ['id', 'slot', 'slot_date', 'slot_time', 'client_name',
                  'client_email', 'client_phone', 'message', 'status', 'created_at']


class DayBlockSerializer(serializers.ModelSerializer):
    class Meta:
        model = DayBlock
        fields = ['id', 'date', 'created_at']


class SlotAdminSerializer(serializers.ModelSerializer):
    class Meta:
        model = Slot
        fields = ['id', 'date', 'time', 'status']


class BookingAdminUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=['pending', 'confirmed', 'cancelled'])
