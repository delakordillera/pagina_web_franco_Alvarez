from datetime import time, timedelta, datetime
from django.utils import timezone
from django.db import transaction
from django.core.mail import send_mail
from django.conf import settings
from rest_framework import viewsets, status, permissions
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from .models import Slot, Booking, DayBlock
from .serializers import (
    SlotSerializer, BookingCreateSerializer, BookingSerializer,
    DayBlockSerializer, SlotAdminSerializer, BookingAdminUpdateSerializer
)

START_HOUR = 9
END_HOUR = 18
SLOT_DURATION = 60

def generate_slots_for_date(date_obj):
    existing = {s.time for s in Slot.objects.filter(date=date_obj)}
    created = []
    for hour in range(START_HOUR, END_HOUR):
        t = time(hour, 0)
        if t not in existing:
            s = Slot(date=date_obj, time=t, status='available')
            created.append(s)
    Slot.objects.bulk_create(created, ignore_conflicts=True)


@api_view(['GET'])
def get_slots(request):
    date_str = request.GET.get('date')
    if not date_str:
        return Response({'error': 'Se requiere parámetro date'}, status=400)
    try:
        date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        return Response({'error': 'Formato inválido. Use YYYY-MM-DD'}, status=400)

    generate_slots_for_date(date_obj)
    is_blocked = DayBlock.objects.filter(date=date_obj).exists()

    if is_blocked:
        return Response({
            'date': date_str,
            'day_blocked': True,
            'slots': [],
            'all_blocked': True,
        })

    slots = Slot.objects.filter(date=date_obj).select_related('booking').order_by('time')
    serializer = SlotSerializer(slots, many=True)
    return Response({
        'date': date_str,
        'day_blocked': False,
        'slots': serializer.data,
        'all_blocked': False,
    })


@api_view(['POST'])
def create_booking(request):
    serializer = BookingCreateSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(serializer.errors, status=400)

    with transaction.atomic():
        slot_id = serializer.validated_data['slot'].id
        slot = Slot.objects.select_for_update().get(id=slot_id)
        if slot.status != 'available' or hasattr(slot, 'booking'):
            return Response({'error': 'Horario no disponible'}, status=409)
        slot.status = 'available'
        slot.save()
        booking = serializer.save()

    # send email notification
    _notify_new_booking(booking)

    return Response({
        'message': 'Reserva creada correctamente',
        'booking_id': booking.id,
    }, status=201)


def _notify_new_booking(booking):
    contact = settings.CONTACT_EMAIL
    if not contact:
        return
    subject = f"Nueva reserva: {booking.client_name} - {booking.slot.date} {booking.slot.time}"
    message = (
        f"Nombre: {booking.client_name}\n"
        f"Email: {booking.client_email}\n"
        f"Teléfono: {booking.client_phone}\n"
        f"Mensaje: {booking.message}\n"
        f"Fecha: {booking.slot.date}\n"
        f"Hora: {booking.slot.time}\n"
        f"Estado: Pendiente de confirmación"
    )
    try:
        send_mail(subject, message, settings.EMAIL_HOST_USER, [contact], fail_silently=True)
    except Exception:
        pass


# --- Admin endpoints (simple token auth) ---

ADMIN_PASSWORD = "terapia2026"

def _check_admin(request):
    pwd = request.headers.get('X-Admin-Password') or request.GET.get('admin_password')
    return pwd == ADMIN_PASSWORD


@api_view(['GET', 'POST'])
@permission_classes([permissions.AllowAny])
def admin_manage_slot(request, slot_id):
    if not _check_admin(request):
        return Response({'error': 'No autorizado'}, status=403)
    try:
        slot = Slot.objects.select_related('booking').get(id=slot_id)
    except Slot.DoesNotExist:
        return Response({'error': 'Slot no encontrado'}, status=404)

    if request.method == 'GET':
        data = SlotAdminSerializer(slot).data
        if hasattr(slot, 'booking'):
            data['booking'] = BookingSerializer(slot.booking).data
        return Response(data)

    # POST: toggle block or update booking status
    action = request.data.get('action')

    if action == 'toggle_block':
        slot.status = 'blocked' if slot.status == 'available' else 'available'
        slot.save()
        return Response({'status': 'ok', 'new_status': slot.status})

    elif action == 'update_booking':
        if not hasattr(slot, 'booking'):
            return Response({'error': 'No hay reserva en este slot'}, status=400)
        new_status = request.data.get('booking_status')
        if new_status not in ('pending', 'confirmed', 'cancelled'):
            return Response({'error': 'Estado inválido'}, status=400)
        slot.booking.status = new_status
        slot.booking.save()
        return Response({'status': 'ok', 'booking_status': new_status})

    return Response({'error': 'Acción no reconocida'}, status=400)


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def admin_block_day(request):
    if not _check_admin(request):
        return Response({'error': 'No autorizado'}, status=403)
    date_str = request.data.get('date')
    if not date_str:
        return Response({'error': 'Se requiere date'}, status=400)
    try:
        date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        return Response({'error': 'Formato inválido'}, status=400)

    block = request.data.get('block', True)
    if block:
        DayBlock.objects.get_or_create(date=date_obj)
        Slot.objects.filter(date=date_obj).update(status='blocked')
        message = 'Día bloqueado'
    else:
        DayBlock.objects.filter(date=date_obj).delete()
        Slot.objects.filter(date=date_obj).update(status='available')
        message = 'Día habilitado'

    return Response({'status': 'ok', 'message': message})


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def admin_export(request):
    if not _check_admin(request):
        return Response({'error': 'No autorizado'}, status=403)
    blocked_slots = Slot.objects.filter(status='blocked').values('date', 'time')
    blocked_days = DayBlock.objects.values_list('date', flat=True)
    return Response({
        'blocked_slots': list(blocked_slots),
        'blocked_days': [str(d) for d in blocked_days],
    })


@api_view(['POST'])
@permission_classes([permissions.AllowAny])
def admin_import(request):
    if not _check_admin(request):
        return Response({'error': 'No autorizado'}, status=403)
    data = request.data
    for item in data.get('blocked_slots', []):
        try:
            date_obj = datetime.strptime(item['date'], '%Y-%m-%d').date()
            time_obj = datetime.strptime(item['time'], '%H:%M:%S').time()
        except (ValueError, KeyError):
            continue
        generate_slots_for_date(date_obj)
        Slot.objects.filter(date=date_obj, time=time_obj).update(status='blocked')
    for date_str in data.get('blocked_days', []):
        try:
            date_obj = datetime.strptime(date_str, '%Y-%m-%d').date()
            DayBlock.objects.get_or_create(date=date_obj)
        except ValueError:
            continue
    return Response({'status': 'ok', 'message': 'Configuración importada'})


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def admin_bookings(request):
    if not _check_admin(request):
        return Response({'error': 'No autorizado'}, status=403)
    date_str = request.GET.get('date')
    bookings = Booking.objects.select_related('slot')
    if date_str:
        bookings = bookings.filter(slot__date=date_str)
    serializer = BookingSerializer(bookings, many=True)
    return Response(serializer.data)
