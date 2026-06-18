# Análisis Completo - Web Franco Álvarez | Psicología Clínica

## Resumen Ejecutivo

Web estática de una sola página (landing page) para un psicólogo clínico chileno.
Construida con HTML semántico, Bootstrap 5.3.3, CSS personalizado con paleta sage/terracota,
Flatpickr para calendario de agendamiento, FontAwesome para iconografía e integración con WhatsApp.

---

## 1. Estructura del Proyecto

```
├── index.html          (página principal)
├── styles.css          (estilos personalizados sobre Bootstrap)
├── script.js           (lógica: carrusel, formulario, flatpickr, WhatsApp)
├── vercel.json         (configuración de despliegue y seguridad)
├── franco-alvarez.png  (foto de perfil)
├── colectivo.jpg       (imagen carrusel)
├── fibromialgia.jpg    (imagen carrusel)
├── salvavidas.jpg      (imagen carrusel)
├── tabo.jpg            (imagen carrusel)
├── trabajofranco.jpg   (imagen carrusel)
└── README.md           (documentación del proyecto)
```

Sin framework de build, sin bundler, sin preprocesador CSS. Archivos planos servidos estáticamente.

---

## 2. Stack Tecnológico

| Tecnología | Versión | Uso |
|---|---|---|
| Bootstrap | 5.3.3 | Layout, componentes (navbar, accordion, modal, toast) |
| FontAwesome | 6.5.2 | Iconografía general |
| Flatpickr | última | Calendario inline en modal de agendamiento |
| Google Fonts | - | DM Serif Display + Inter |
| Vercel | - | Hosting con headers de seguridad y caché |
| WhatsApp API | - | Envío de solicitudes de agendamiento |
| localStorage | nativo | Persistencia de horarios reservados |

---

## 3. Arquitectura Visual (CSS)

Sistema de tokens con custom properties:
- **Paleta sage**: verde profesional (#4c7a5c, #3a6049, #28453a)
- **Acento terracota**: cálido humano (#a3603a, #c98a5e)
- **Base**: fondo hueco (#f7f4ee), superficie (#fcfaf6)
- **Tipografía**: DM Serif Display para títulos, Inter para cuerpo
- **Sombras**: 3 niveles (soft, md, lg) con opacidad controlada

Bootstrap se usa para estructura (grid, espaciado, componentes),
el CSS personalizado solo tematiza color, tipografía y atmósfera visual.

Aspectos destacados:
- Uso de `backdrop-filter: blur()` en navbar
- `scroll-behavior: smooth` en HTML
- `prefers-reduced-motion` implementado para accesibilidad
- Media queries en 991.98px y 575.98px para responsive

---

## 4. Funcionalidades JavaScript

### 4.1 Carrusel Clínico
- 5 diapositivas con crossfade
- Autoplay (5 segundos) con pausa al hacer hover
- Navegación por flechas, teclado (izquierda/derecha) y touch swipe
- Dots indicadores y barra de progreso
- Pausa al cambiar de pestaña (visibilitychange)

### 4.2 Sistema de Agendamiento
- Modal Bootstrap con formulario
- Calendario Flatpickr inline (localizado en español)
- Slots de horario de 08:00 a 18:00
- Persistencia de reservas en localStorage
- Envío de solicitud vía WhatsApp API

### 4.3 Botón WhatsApp Flotante
- Posición fija inferior derecha
- Tooltip personalizado con logo SVG de WhatsApp
- Popup automático después de 5 segundos
- Click abre WhatsApp con mensaje predefinido

### 4.4 Utilidades
- EscapeHTML para saneamiento XSS
- Toast de notificaciones Bootstrap
- Banner de cookies
- Cierre automático del navbar en móvil al hacer clic

---

## 5. Correcciones Realizadas

### 5.1 SRI Hashes (Crítico)
Los hashes de integridad de FontAwesome y Flatpickr eran placeholders inválidos
(patrón "e5e5e5e5...") que bloqueaban la carga de estos recursos CDN en el navegador.
Se generaron y reemplazaron por hashes SHA384 reales.

### 5.2 Duplicación WhatsApp (Bug)
El botón flotante de WhatsApp existía tanto en el HTML como creado dinámicamente
por JavaScript (injectWhatsAppStickyElement), generando dos botones con el mismo ID.
Se eliminó la inyección duplicada y se consolidó en un único botón HTML.

### 5.3 SEO
- Open Graph (Facebook) y Twitter Cards agregados
- JSON-LD con schema Person y FAQPage
- URL canónica y meta robots
- Resource hints (preconnect a CDNs)

### 5.4 Imágenes
- Lazy loading en imágenes del carrusel
- loading="eager" en hero image (above the fold)

### 5.5 Seguridad
- SRI hashes reemplazados por valores reales
- Vercel.json con Permissions-Policy y Cache-Control
- Headers CSP, HSTS, X-Frame-Options

### 5.6 Typos
- "modalid" → "modalidad"
- "Clinical" → "Clínica"
- Acentos en JSON-LD FAQ

### 5.7 Accesibilidad
- Dots del carrusel aumentados a 44px mínimos (WCAG 2.5.5)
- aria-label en flechas del carrusel
- Elementos #carouselDots y #carouselProgress agregados al DOM

### 5.8 Código
- py-2.5 (clase Bootstrap inexistente) → py-3

---

## 6. Auditoría de Puntajes

| Categoría | Antes | Después | Mejora |
|---|---|---|---|
| Rendimiento | 3/10 | 6/10 | +3 |
| SEO | 4/10 | 8/10 | +4 |
| Accesibilidad | 6/10 | 7/10 | +1 |
| Código | 5/10 | 7/10 | +2 |
| Seguridad | 3/10 | 7/10 | +4 |
| Mobile/Responsive | 7/10 | 7/10 | = |
| Mantenibilidad | 6/10 | 7/10 | +1 |
| **Promedio** | **4.9/10** | **7.0/10** | **+2.1** |

---

## 7. Problemas Persistentes (Mejoras Futuras)

### Prioridad Alta
- **CSP implementado en Vercel pero sin fallback meta tag en HTML** para entornos sin headers HTTP
- **OG/Twitter images usan URL absoluta del dominio** (requiere que el dominio real esté configurado)
- **FontAwesome y Flatpickr siguen siendo render-blocking** en el head

### Prioridad Media
- **Google Fonts sin fallback local** (dependencia total del CDN)
- **Sin srcset/sizes en imágenes** (no hay imágenes responsivas por resolución)
- **Sin validación de email/teléfono con regex** en el formulario
- **Sin servicio backend** (todo depende de WhatsApp para recibir solicitudes)

### Prioridad Baja
- **!important excesivo en CSS** (30+ ocurrencias para sobrescribir Bootstrap)
- **Sin linter ni formatter** (ESLint, Prettier, Stylelint)
- **Sin sistema de build** (Vite, Parcel, etc.)
- **Sin prueba unitaria** en el JavaScript

---

## 8. Recomendaciones Técnicas

1. **Migrar a WebP/AVIF** las imágenes y agregar srcset con 480w, 768w, 1200w
2. **Extraer CSS crítico inline** para mejorar First Contentful Paint
3. **Agregar service worker** para caché offline y mejora en visitas recurrentes
4. **Implementar analytics** respetuoso con privacidad (Plausible, Umami)
5. **Reemplazar FontAwesome por SVG inline** para eliminar dependencia CDN
6. **Agregar sitemap.xml** y referenciarlo desde robots.txt
7. **Configurar monitor de uptime** (Better Uptime, Pingdom)
8. **Refactorizar CSS** reduciendo !important con selectores de mayor especificidad
