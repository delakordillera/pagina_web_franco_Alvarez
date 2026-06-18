from django.db import models

class Slot(models.Model):
    STATUS_CHOICES = [
        ('available', 'Disponible'),
        ('blocked', 'Bloqueado'),
    ]
    date = models.DateField()
    time = models.TimeField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='available')

    class Meta:
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
    slot = models.OneToOneField(Slot, on_delete=models.CASCADE, related_name='booking')
    client_name = models.CharField(max_length=100)
    client_email = models.EmailField()
    client_phone = models.CharField(max_length=20)
    message = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.client_name} - {self.slot.date} {self.slot.time} ({self.status})"


class DayBlock(models.Model):
    date = models.DateField(unique=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Día bloqueado: {self.date}"
