from django.db import models

class Slot(models.Model):
    STATUS_CHOICES = [
        ('available', 'Disponible'),
        ('blocked', 'Bloqueado'),
    ]
    date = models.DateField(verbose_name="Fecha")
    time = models.TimeField(verbose_name="Hora")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='available', verbose_name="Estado")

    class Meta:
        verbose_name = "Horario"
        verbose_name_plural = "Horarios"
        ordering = ['date', 'time']
        unique_together = ['date', 'time']

    def __str__(self):
        return f"{self.date} {self.time} - {self.status}"


class Booking(models.Model):
    STATUS_CHOICES = [
        ('pending', 'Pendiente'),
        ('confirmed', 'Confirmado'),
        ('cancelled', 'Cancelado'),
    ]
    slot = models.OneToOneField(Slot, on_delete=models.CASCADE, related_name='booking', verbose_name="Horario")
    client_name = models.CharField(max_length=100, verbose_name="Nombre del paciente")
    client_email = models.EmailField(verbose_name="Correo electrónico")
    client_phone = models.CharField(max_length=20, verbose_name="Teléfono")
    message = models.TextField(blank=True, verbose_name="Mensaje")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending', verbose_name="Estado")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Creado el")

    class Meta:
        verbose_name = "Reserva"
        verbose_name_plural = "Reservas"
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.client_name} - {self.slot.date} {self.slot.time} ({self.status})"


class DayBlock(models.Model):
    date = models.DateField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Bloqueo de día"
        verbose_name_plural = "Bloqueos de día"

    def __str__(self):
        return f"Día bloqueado: {self.date}"
