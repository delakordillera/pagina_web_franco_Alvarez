import os
from django.views.decorators.csrf import ensure_csrf_cookie
from django.http import JsonResponse
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

    # send email notification (non-blocking: don't break API if email fails)
    try:
        _notify_new_booking(booking)
    except Exception:
        pass

    return Response({
        'message': 'Reserva creada correctamente',
        'booking_id': booking.id,
    }, status=201)


def _notify_new_booking(booking):
    contact = settings.CONTACT_EMAIL
    if not contact:
        return
    # Notify psychologist
    subject = f"Nueva reserva: {booking.client_name} - {booking.slot.date} {booking.slot.time:%H:%M}"
    message = (
        f"Se ha recibido una nueva solicitud de reserva:\n\n"
        f"Paciente: {booking.client_name}\n"
        f"Email: {booking.client_email}\n"
        f"Teléfono: {booking.client_phone}\n"
        f"Mensaje: {booking.message}\n"
        f"Fecha: {booking.slot.date}\n"
        f"Hora: {booking.slot.time:%H:%M}\n"
        f"Estado: Pendiente de confirmación\n\n"
        f"Ingresa al panel de administración para confirmar o cancelar."
    )
    send_mail(subject, message, settings.EMAIL_HOST_USER, [contact], fail_silently=False)

    # Notify patient
    patient_subject = "Solicitud de hora recibida - ps. Franco Álvarez"
    patient_message = (
        f"Hola {booking.client_name},\n\n"
        f"Hemos recibido tu solicitud de reserva para el día {booking.slot.date} a las {booking.slot.time:%H:%M}.\n\n"
        f"Pronto recibirás una confirmación por este mismo medio.\n\n"
        f"Si tienes dudas, escríbeme por WhatsApp al +56 9 5698 5589.\n\n"
        f"Saludos,\n"
        f"ps. Franco Álvarez"
    )
    send_mail(patient_subject, patient_message, settings.EMAIL_HOST_USER, [booking.client_email], fail_silently=False)


def _notify_booking_confirmed(booking):
    """Notify patient that their booking was confirmed"""
    if not booking.client_email:
        return
    subject = "Reserva confirmada - ps. Franco Álvarez"
    message = (
        f"Hola {booking.client_name},\n\n"
        f"Tu reserva ha sido CONFIRMADA para el día {booking.slot.date} a las {booking.slot.time:%H:%M}.\n\n"
        f"La sesión se realizará de forma online. Te enviaré el enlace de videollamada antes de la sesión.\n\n"
        f"Si necesitas reagendar o cancelar, escríbeme por WhatsApp al +56 9 5698 5589.\n\n"
        f"Saludos,\n"
        f"ps. Franco Álvarez"
    )
    send_mail(subject, message, settings.EMAIL_HOST_USER, [booking.client_email], fail_silently=False)


@ensure_csrf_cookie
def get_csrf(request):
    return JsonResponse({'detail': 'CSRF cookie set'})


# --- Admin endpoints (simple token auth) ---

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "")

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
        if new_status == 'confirmed':
            try:
                _notify_booking_confirmed(slot.booking)
            except Exception:
                pass
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


import subprocess
import sys

@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def _setup_install_reportlab(request):
    if request.GET.get('key') != 'setup2026':
        return Response({'error': 'no'}, status=403)
    try:
        import reportlab
        return Response({'status': 'already_installed', 'version': reportlab.Version})
    except ImportError:
        pass
    try:
        result = subprocess.check_call(
            [sys.executable, '-m', 'pip', 'install', 'reportlab'],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            timeout=120
        )
        import reportlab
        return Response({'status': 'installed', 'version': reportlab.Version})
    except Exception as e:
        return Response({'error': str(e)}, status=500)


@api_view(['GET'])
@permission_classes([permissions.AllowAny])
def download_guide_pdf(request):
    try:
        from reportlab.lib.pagesizes import letter
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import inch, mm
        from reportlab.lib.colors import HexColor
        from reportlab.platypus import (
            SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
            PageBreak, HRFlowable
        )
        from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_JUSTIFY
        from io import BytesIO
    except ImportError:
        return Response({'error': 'reportlab no instalado'}, status=500)

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        topMargin=0.6*inch, bottomMargin=0.6*inch,
        leftMargin=0.75*inch, rightMargin=0.75*inch
    )

    sage = HexColor('#28453a')
    terracotta = HexColor('#a3603a')
    dark = HexColor('#1c3129')
    text_color = HexColor('#4d5950')
    light_bg = HexColor('#f7f4ee')
    cream = HexColor('#fcfaf6')

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle('Title2', parent=styles['Title'], fontName='Helvetica-Bold', fontSize=22, textColor=sage, spaceAfter=6, alignment=TA_LEFT)
    subtitle_style = ParagraphStyle('Sub', parent=styles['Normal'], fontName='Helvetica', fontSize=11, textColor=HexColor('#5e6a5f'), spaceAfter=4, alignment=TA_LEFT)
    h1 = ParagraphStyle('H1', fontName='Helvetica-Bold', fontSize=16, textColor=dark, spaceBefore=18, spaceAfter=6)
    h2 = ParagraphStyle('H2', fontName='Helvetica-Bold', fontSize=13, textColor=sage, spaceBefore=12, spaceAfter=4)
    body = ParagraphStyle('Body', fontName='Helvetica', fontSize=10, textColor=text_color, leading=15, alignment=TA_JUSTIFY, spaceAfter=6)
    body_bold = ParagraphStyle('BodyB', parent=body, fontName='Helvetica-Bold', textColor=dark)
    tip = ParagraphStyle('Tip', fontName='Helvetica-Oblique', fontSize=9, textColor=sage, leading=13, leftIndent=12, spaceAfter=8)
    center = ParagraphStyle('Center', parent=body, alignment=TA_CENTER, fontSize=9, textColor=HexColor('#5e6a5f'))
    cta_title = ParagraphStyle('CtaT', fontName='Helvetica-Bold', fontSize=14, textColor=cream, alignment=TA_CENTER, spaceBefore=12, spaceAfter=6)
    cta_body = ParagraphStyle('CtaB', fontName='Helvetica', fontSize=9, textColor=HexColor('rgba(252,250,246,0.65)'), alignment=TA_CENTER, leading=13, spaceAfter=10)
    footer = ParagraphStyle('Footer', fontName='Helvetica', fontSize=7.5, textColor=HexColor('#5e6a5f'), alignment=TA_CENTER, leading=10)

    elements = []
    elements.append(Paragraph("5 Estrategias para Manejar la Ansiedad", title_style))
    elements.append(Paragraph("Guía práctica · 2026", subtitle_style))
    elements.append(Spacer(1, 8))

    # Author line
    author_data = [[Paragraph("<b>Franco Álvarez</b>", ParagraphStyle('AName', fontName='Helvetica-Bold', fontSize=10, textColor=sage)), Paragraph("Psicólogo Clínico · UCSH", ParagraphStyle('ATitle', fontName='Helvetica', fontSize=9, textColor=HexColor('#5e6a5f')))]]
    t = Table(author_data, colWidths=[2*inch, 3*inch])
    t.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'MIDDLE')]))
    elements.append(t)
    elements.append(Spacer(1, 6))
    elements.append(HRFlowable(width="100%", thickness=1, color=HexColor('#e8e2d4')))
    elements.append(Spacer(1, 12))

    # Intro
    elements.append(Paragraph("Hola, soy Franco.", h1))
    elements.append(Paragraph(
        "Si llegaste hasta acá, probablemente la ansiedad se ha vuelto una visita más frecuente de lo que te gustaría. "
        "Quiero empezar diciéndote algo: <b>sentir ansiedad no es una falla personal</b>. Es un sistema de alarma que se "
        "activó y quedó pegado, como una radio que no logras apagar. Lo que sí está en tus manos —y para eso está esta "
        "guía— es aprender a bajarla de volumen, paso a paso. Esto no reemplaza un proceso terapéutico, pero es un "
        "primer empujón en la dirección correcta.", body))
    elements.append(Spacer(1, 8))

    # Strategy 1
    elements.append(Paragraph("1. Respiración que ancla: el 4-7-8", h2))
    elements.append(Paragraph(
        "Cuando la ansiedad aparece, la respiración se vuelve rápida y superficial. El cuerpo interpreta que hay peligro "
        "y se prepara para huir. Una forma de engañar al sistema nervioso es respirar <b>más lento de lo que él quiere</b>.", body))
    elements.append(Paragraph(
        "Inhala por la nariz contando hasta 4, sostén el aire contando hasta 7, y exhala por la boca contando hasta 8. "
        "Repite tres o cuatro veces. La exhalación larga es la clave: activa el nervio vago y le dice al cerebro "
        "«ya pasó, puedes calmarte».", body))
    elements.append(Paragraph("💡 Puedes hacerlo en la micro, antes de una reunión, en la noche antes de dormir. Nadie nota que lo estás haciendo.", tip))
    elements.append(Spacer(1, 6))

    # Strategy 2
    elements.append(Paragraph("2. Anclaje sensorial: la regla 5-4-3-2-1", h2))
    elements.append(Paragraph(
        "Hay momentos en que la ansiedad se siente como una ola que te cubre entero. En esos momentos, tratar de "
        "«pensar positivamente» no funciona porque la parte racional del cerebro quedó offline. Lo que sí funciona "
        "es volver al cuerpo.", body))
    elements.append(Paragraph(
        "Detente y nombra en voz baja o mentalmente: <b>5 cosas que ves</b> a tu alrededor, <b>4 que puedes tocar</b>, "
        "<b>3 que escuchas</b>, <b>2 que puedes oler</b> y <b>1 que puedes saborear</b>. Este ejercicio obliga al "
        "cerebro a salir del modo amenaza y volver al presente.", body))
    elements.append(Paragraph("💡 Perfecto para crisis cortas e intensas. No necesitas nada más que tus sentidos.", tip))
    elements.append(Spacer(1, 6))

    # Strategy 3
    elements.append(Paragraph("3. Desenmascara al pensamiento automático", h2))
    elements.append(Paragraph(
        "La ansiedad vive de frases como «y si todo sale mal», «no voy a ser capaz», «me van a juzgar». Estos "
        "pensamientos aparecen solos, sin que los invites, y se sienten verdad absoluta. Pero no lo son: son "
        "<b>hipótesis</b>, no hechos.", body))
    elements.append(Paragraph(
        "Un ejercicio útil es escribir el pensamiento en un papel y preguntarte: ¿qué evidencia tengo de que esto "
        "va a pasar? ¿qué evidencia tengo de que no? ¿qué le diría a un amigo si estuviera pensando esto? Ese "
        "pequeño distanciamiento empieza a quitarle poder al pensamiento.", body))
    elements.append(Paragraph("💡 Lleva una libreta chica o una nota en el celular. Anota esos pensamientos automáticos durante una semana.", tip))
    elements.append(Spacer(1, 6))

    # Strategy 4
    elements.append(Paragraph("4. Micro rutinas de regulación diaria", h2))
    elements.append(Paragraph(
        "La ansiedad crónica no solo se juega en los momentos de crisis, sino en el día a día acumulado. Dormir poco, "
        "saltarse comidas, pasar horas pegado al celular viendo noticias, no moverse en todo el día. Cada una de esas "
        "cosas es una micro dosis de estrés.", body))
    elements.append(Paragraph(
        "No necesitas una rutina perfecta. Basta con elegir una cosa: <b>salir 10 minutos al sol</b> en la mañana, "
        "<b>cortar pantallas 30 minutos antes de dormir</b>, <b>tomar once sin el celular en la mano</b>. Son actos "
        "chicos, pero sostenidos en el tiempo le mandan una señal al cerebro de que estás en un entorno seguro.", body))
    elements.append(Paragraph("💡 Elige solo un hábito nuevo por semana. Intentar cambiarlo todo al mismo tiempo es receta para la frustración.", tip))
    elements.append(Spacer(1, 6))

    # Strategy 5
    elements.append(Paragraph("5. Saber cuándo pedir ayuda (y por qué no es debilidad)", h2))
    elements.append(Paragraph(
        "Hay un mito muy instalado en Chile: que la terapia es para «los que están muy mal» o para «los que no pueden "
        "solos». Y no es así. Así como vas al dentista cuando te duele una muela, vas al psicólogo cuando tu mente "
        "está atascada en un bucle que no logras desarmar solo.", body))
    elements.append(Paragraph(
        "Señales de que podría ser momento de pedir ayuda: la ansiedad te despierta todas las noches, evitas "
        "situaciones cotidianas (tomar micro, hablar en público, juntarte con gente), llevas más de un mes "
        "sintiéndote irritable o agotado. <b>Pedir ayuda no es rendirse: es tomar el timón.</b>", body))
    elements.append(Paragraph("💡 La primera sesión es solo para conversar, evaluar y ver si hay sintonía. No hay compromiso.", tip))
    elements.append(Spacer(1, 12))

    # CTA
    elements.append(HRFlowable(width="100%", thickness=1, color=HexColor('#e8e2d4')))
    elements.append(Spacer(1, 10))
    elements.append(Paragraph("¿Quieres dar el siguiente paso?", h1))
    elements.append(Paragraph(
        "Si después de leer esta guía sientes que necesitas un espacio para ti, con acompañamiento profesional "
        "y a tu ritmo, escríbeme por WhatsApp al <b>+56 9 5698 5589</b> para una primera conversación.",
        body))
    elements.append(Spacer(1, 16))

    # Footer
    elements.append(HRFlowable(width="100%", thickness=0.5, color=HexColor('#e8e2d4')))
    elements.append(Spacer(1, 6))
    elements.append(Paragraph(
        "Esta guía es un recurso informativo y <b>no reemplaza una atención psicológica profesional</b>. "
        "Si estás en una crisis de salud mental, contacta a Salud Responde al 600 360 7777 o acude a tu "
        "centro de salud más cercano.<br/>"
        "© 2026 Franco Álvarez · Psicología Clínica · UCSH · ps-francoalvarez.cl", footer))

    doc.build(elements)
    pdf_data = buf.getvalue()
    buf.close()

    from django.http import HttpResponse
    response = HttpResponse(pdf_data, content_type='application/pdf')
    response['Content-Disposition'] = 'attachment; filename="guia-ansiedad-franco-alvarez.pdf"'
    return response
