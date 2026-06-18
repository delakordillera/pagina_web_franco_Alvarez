document.addEventListener("DOMContentLoaded", () => {
  const bookingModal = document.getElementById("bookingModal");
  const bookingForm = document.getElementById("bookingForm");
  const bookingDateInput = document.getElementById("bookingDate");
  const calendarContainer = document.getElementById("calendarContainer");
  const slotsGrid = document.getElementById("slotsGrid");
  const selectedSlotText = document.getElementById("selectedSlotText");
  const formStatus = document.getElementById("formStatus");
  const cookieBanner = document.getElementById("cookieBanner");
  const acceptCookies = document.getElementById("acceptCookies");
  const carousel = document.getElementById("clinicalCarousel");
  const slides = Array.from(document.querySelectorAll("#clinicalCarousel .cf-slide"));
  const prevBtn = document.getElementById("carouselPrev");
  const nextBtn = document.getElementById("carouselNext");
  const dotsContainer = document.getElementById("carouselDots");
  const progressBar = document.getElementById("carouselProgress");

  const WHATSAPP_NUMBER = "56985755891";
  const BOOKINGS_STORAGE_KEY = "franco_alvarez_bookings";
  const DEFAULT_SLOTS = [];

  // --- API configuration ---
  const API_URL = window.__API_URL__ || '';
  function apiUrl(path) { return API_URL ? API_URL + path : path; }

  async function apiGet(endpoint) {
    try {
      const r = await fetch(apiUrl(endpoint));
      if (!r.ok) throw new Error('API error');
      return await r.json();
    } catch { return null; }
  }

  async function apiPost(endpoint, data, password) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (password) headers['X-Admin-Password'] = password;
      const r = await fetch(apiUrl(endpoint), { method: 'POST', headers, body: JSON.stringify(data) });
      return { ok: r.ok, data: r.ok ? await r.json() : await r.json().catch(() => null) };
    } catch { return null; }
  }

  let cachedSlots = {}; // simple in-memory cache for current day

  async function fetchSlotsFromApi(dateStr) {
    const data = await apiGet(`/api/slots/?date=${dateStr}`);
    if (!data || !data.slots) return null;
    cachedSlots[dateStr] = data;
    return data;
  }

  function slotsFromCache(dateStr) {
    return cachedSlots[dateStr] || null;
  }

  // --- Dark Mode ---
  const darkModeToggle = document.getElementById("darkModeToggle");
  const storedTheme = window.localStorage.getItem("franco_theme");
  if (storedTheme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
    if (darkModeToggle) darkModeToggle.innerHTML = '<i class="fa-regular fa-sun"></i>';
  }
  darkModeToggle?.addEventListener("click", () => {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    if (isDark) {
      document.documentElement.removeAttribute("data-theme");
      window.localStorage.setItem("franco_theme", "light");
      darkModeToggle.innerHTML = '<i class="fa-regular fa-moon"></i>';
    } else {
      document.documentElement.setAttribute("data-theme", "dark");
      window.localStorage.setItem("franco_theme", "dark");
      darkModeToggle.innerHTML = '<i class="fa-regular fa-sun"></i>';
    }
  });

  // --- Scroll Reveal ---
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );
  document.querySelectorAll(".reveal").forEach((el) => revealObserver.observe(el));

  let currentSlide = 0;
  let carouselTimer = null;
  let selectedTime = "";
  const autoplayDelay = 5000;

  function escapeHTML(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  for (let hour = 8; hour <= 18; hour += 1) {
    DEFAULT_SLOTS.push(`${String(hour).padStart(2, "0")}:00`);
  }

  function getStoredBookings() {
    try {
      const raw = window.localStorage.getItem(BOOKINGS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (_error) {
      return {};
    }
  }

  function saveStoredBookings(bookings) {
    try {
      window.localStorage.setItem(BOOKINGS_STORAGE_KEY, JSON.stringify(bookings));
    } catch (_error) {
      return;
    }
  }

  function getBookedSlots(dateStr) {
    const bookings = getStoredBookings();
    return Array.isArray(bookings[dateStr]) ? bookings[dateStr] : [];
  }

  function persistBooking(dateStr, time) {
    const bookings = getStoredBookings();
    const existing = Array.isArray(bookings[dateStr]) ? bookings[dateStr] : [];
    if (!existing.includes(time)) {
      bookings[dateStr] = [...existing, time].sort();
      saveStoredBookings(bookings);
    }
  }

  function formatDateForDisplay(dateStr) {
    if (!dateStr) return "";
    const [year, month, day] = dateStr.split("-").map(Number);
    const date = new Date(year, (month || 1) - 1, day || 1);
    return new Intl.DateTimeFormat("es-CL", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    }).format(date);
  }

  function formatDateTimeShort(dateStr, time) {
    return `${formatDateForDisplay(dateStr)} a las ${time}`;
  }

  function buildWhatsAppMessage(payload) {
    const lines = [
      "Hola, se ha solicitado una nueva cita desde la web.",
      `Nombre: ${payload.fullName}`,
      `Correo: ${payload.email}`,
      `Teléfono: ${payload.phone}`,
      `Modalidad: Online`,
      `Fecha: ${formatDateForDisplay(payload.bookingDate)}`,
      `Hora: ${payload.selectedTime}`,
      `Motivo de consulta: ${payload.reason || "No especificado"}`
    ];
    return encodeURIComponent(lines.join("\n"));
  }

  // --- Admin storage functions (hoisted) ---
  const ADMIN_PASSWORD_KEY = "franco_admin_password";
  const ADMIN_BLOCKED_KEY = "franco_admin_blocked";
  const ADMIN_BOOKING_STATUS_KEY = "franco_admin_booking_status";
  const ADMIN_SESSION_KEY = "franco_admin_session";
  const DEFAULT_ADMIN_PASSWORD = "terapia2026";

  function initAdminPassword() {
    if (!window.localStorage.getItem(ADMIN_PASSWORD_KEY)) {
      window.localStorage.setItem(ADMIN_PASSWORD_KEY, DEFAULT_ADMIN_PASSWORD);
    }
  }
  initAdminPassword();

  function getAdminBlocked() {
    try {
      const raw = window.localStorage.getItem(ADMIN_BLOCKED_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_e) { return {}; }
  }

  function saveAdminBlocked(blocked) {
    window.localStorage.setItem(ADMIN_BLOCKED_KEY, JSON.stringify(blocked));
  }

  function getBlockedSlots(dateStr) {
    const blocked = getAdminBlocked();
    const published = window.__BLOCKED_SLOTS || {};
    const dateBlocked = Array.isArray(blocked[dateStr]) ? blocked[dateStr] : [];
    const pubBlocked = Array.isArray(published[dateStr]) ? published[dateStr] : [];
    return [...new Set([...dateBlocked, ...pubBlocked])];
  }

  function isDateBlocked(dateStr) {
    const blocked = getAdminBlocked();
    const published = window.__BLOCKED_SLOTS || {};
    return blocked[dateStr] === "__all__" || published[dateStr] === "__all__";
  }

  function getBookingStatus(dateStr, time) {
    try {
      const raw = window.localStorage.getItem(ADMIN_BOOKING_STATUS_KEY);
      const statuses = raw ? JSON.parse(raw) : {};
      return statuses[`${dateStr}_${time}`] || "pending";
    } catch (_e) { return "pending"; }
  }

  function setBookingStatus(dateStr, time, status) {
    try {
      const raw = window.localStorage.getItem(ADMIN_BOOKING_STATUS_KEY);
      const statuses = raw ? JSON.parse(raw) : {};
      statuses[`${dateStr}_${time}`] = status;
      window.localStorage.setItem(ADMIN_BOOKING_STATUS_KEY, JSON.stringify(statuses));
    } catch (_e) { return; }
  }

  function getAdminSession() {
    return window.localStorage.getItem(ADMIN_SESSION_KEY) === "true";
  }

  function setAdminSession(value) {
    if (value) {
      window.localStorage.setItem(ADMIN_SESSION_KEY, "true");
    } else {
      window.localStorage.removeItem(ADMIN_SESSION_KEY);
    }
  }

  function getSlotsForDate(dateStr) {
    if (!dateStr) return { slots: [...DEFAULT_SLOTS], isApi: false };
    // Try API cache first
    const cached = slotsFromCache(dateStr);
    if (cached) {
      if (cached.all_blocked) return { slots: [], isApi: true };
      const available = cached.slots
        .filter(s => s.status === 'available' && !s.booking_status)
        .map(s => s.time.slice(0, 5));
      return { slots: available, isApi: true };
    }
    // Fallback to localStorage
    if (isDateBlocked(dateStr)) return { slots: [], isApi: false };
    const blocked = getBlockedSlots(dateStr);
    return { slots: DEFAULT_SLOTS.filter(slot => !blocked.includes(slot)), isApi: false };
  }

  function showToast(message) {
    const toastElement = document.getElementById("appToast");
    const toastMessageSpan = document.getElementById("toastMessage");
    if (toastElement && toastMessageSpan) {
      toastMessageSpan.textContent = message;
      const bootstrapToast = bootstrap.Toast.getOrCreateInstance(toastElement);
      bootstrapToast.show();
    }
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight" && carousel) {
      nextSlide();
      restartCarousel();
    }
    if (event.key === "ArrowLeft" && carousel) {
      prevSlide();
      restartCarousel();
    }
  });

  const navbarLinks = document.querySelectorAll(".navbar-nav .nav-link, .navbar-nav .btn");
  const navbarCollapse = document.getElementById("mainNavbar");
  navbarLinks.forEach((link) => {
    link.addEventListener("click", () => {
      if (navbarCollapse && navbarCollapse.classList.contains("show")) {
        const bsCollapse = bootstrap.Collapse.getOrCreateInstance(navbarCollapse);
        if (bsCollapse) bsCollapse.hide();
      }
    });
  });

  function renderSlots(dateStr) {
    if (!slotsGrid) return;

    const { slots, isApi } = getSlotsForDate(dateStr);
    const bookedSlots = getBookedSlots(dateStr);
    selectedTime = "";

    if (selectedSlotText) {
      selectedSlotText.textContent = "";
    }

    slotsGrid.innerHTML = "";

    if (!dateStr) {
      slotsGrid.innerHTML = '<p class="text-muted small m-0 text-center py-4">Selecciona un día para ver horarios.</p>';
      return;
    }

    slots.forEach((time) => {
      const button = document.createElement("button");
      const isBooked = bookedSlots.includes(time) || (isApi && cachedSlots[dateStr]?.slots?.find(s => s.time.slice(0, 5) === time && s.booking_status));
      const status = getBookingStatus(dateStr, time);
      const isConfirmed = isBooked && status === "confirmed";

      button.type = "button";
      let label = time;
      if (isBooked && isConfirmed) {
        label = `${time} · Confirmado`;
      } else if (isBooked) {
        label = `${time} · Reservado`;
      }
      button.className = "btn btn-sm w-100 text-start time-slot-btn";
      if (isBooked && isConfirmed) {
        button.className += " btn-outline-success disabled";
      } else if (isBooked) {
        button.className += " btn-outline-secondary disabled";
      } else {
        button.className += " btn-outline-dark";
      }
      
      button.textContent = label;
      button.disabled = isBooked;
      button.setAttribute("aria-disabled", isBooked ? "true" : "false");

      button.addEventListener("click", () => {
        if (isBooked) return;
        document.querySelectorAll(".time-slot-btn").forEach((btn) => {
          btn.classList.remove("btn-dark", "text-white");
          btn.classList.add("btn-outline-dark");
        });
        button.classList.remove("btn-outline-dark");
        button.classList.add("btn-dark", "text-white");
        
        selectedTime = time;
        if (selectedSlotText) {
          selectedSlotText.classList.remove("visually-hidden");
          selectedSlotText.textContent = `Horario seleccionado: ${formatDateTimeShort(dateStr, time)}.`;
        }
      });

      slotsGrid.appendChild(button);
    });
  }

  if (window.flatpickr && bookingDateInput && calendarContainer) {
    flatpickr.localize(flatpickr.l10ns.es);

    flatpickr(bookingDateInput, {
      inline: true,
      appendTo: calendarContainer,
      minDate: "today",
      dateFormat: "Y-m-d",
      altInput: true,
      altFormat: "l, j \\d\\e F \\d\\e Y",
      locale: "es",
      disableMobile: true,
      onChange: function (_selectedDates, dateStr) {
        if (API_URL) {
          fetchSlotsFromApi(dateStr).finally(() => renderSlots(dateStr));
        } else {
          renderSlots(dateStr);
        }
      }
    });
  }

  bookingForm?.addEventListener("submit", (event) => {
    event.preventDefault();

    const fullName = escapeHTML(document.getElementById("fullName")?.value.trim());
    const email = escapeHTML(document.getElementById("email")?.value.trim());
    const phone = escapeHTML(document.getElementById("phone")?.value.trim());
    const reason = escapeHTML(document.getElementById("reason")?.value.trim());
    const bookingDate = escapeHTML(bookingDateInput?.value.trim());

    formStatus.className = "small";

    if (!fullName || !email || !phone || !bookingDate || !selectedTime) {
      formStatus.textContent = "Completa tus datos y selecciona una fecha y un horario.";
      formStatus.className = "small text-danger mb-3 d-block";
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      formStatus.textContent = "El correo electrónico no es válido.";
      formStatus.className = "small text-danger mb-3 d-block";
      return;
    }

    const phoneRegex = /^(\+?\d{1,3})?\s?\d{8,12}$/;
    if (!phoneRegex.test(phone.replace(/[\s\-()]/g, ""))) {
      formStatus.textContent = "El teléfono no es válido. Ingresa un número chileno (ej: +56 9 1234 5678).";
      formStatus.className = "small text-danger mb-3 d-block";
      return;
    }

    if (getBookedSlots(bookingDate).includes(selectedTime)) {
      formStatus.textContent = "Ese horario ya fue reservado. Selecciona otro disponible.";
      formStatus.className = "small text-danger mb-3 d-block";
      renderSlots(bookingDate);
      return;
    }

    async function submitBooking() {
      if (API_URL) {
        const cache = cachedSlots[bookingDate];
        const slotEntry = cache?.slots?.find(s => s.time.slice(0, 5) === selectedTime);
        if (slotEntry) {
          const result = await apiPost('/api/book/', {
            slot: slotEntry.id,
            client_name: fullName,
            client_email: email,
            client_phone: phone,
            message: reason || '',
          }, null);
          if (result && result.ok) {
            persistBooking(bookingDate, selectedTime);
            return true;
          }
        }
      }
      persistBooking(bookingDate, selectedTime);
      return false;
    }

    submitBooking().then((apiSuccess) => {
      const message = buildWhatsAppMessage({
        fullName,
        email,
        phone,
        reason,
        bookingDate,
        selectedTime
      });

      const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${message}`;
      window.open(whatsappUrl, "_blank", "noopener,noreferrer");

      const submittedDate = bookingDate;
      bookingForm.reset();
      selectedTime = "";

      if (selectedSlotText) {
        selectedSlotText.textContent = "";
        selectedSlotText.classList.add("visually-hidden");
      }

      if (bookingDateInput?._flatpickr) {
        bookingDateInput._flatpickr.clear();
      }

      renderSlots(submittedDate);
      showToast(apiSuccess
        ? "Solicitud enviada correctamente."
        : "Solicitud enviada correctamente por WhatsApp.");

    window.setTimeout(() => {
      if (bookingModal) {
        const bsModal = bootstrap.Modal.getInstance(bookingModal);
        if (bsModal) bsModal.hide();
      }
      formStatus.textContent = "";
      formStatus.className = "small";
    }, 900);
  });
  });

  if (cookieBanner && acceptCookies) {
    window.setTimeout(() => {
      cookieBanner.hidden = false;
    }, 900);

    acceptCookies.addEventListener("click", () => {
      cookieBanner.hidden = true;
    });
  }

  function updateProgress() {
    if (!progressBar || !slides.length) return;
    progressBar.style.width = `${((currentSlide + 1) / slides.length) * 100}%`;
  }

  function updateDots() {
    if (!dotsContainer) return;
    const dots = dotsContainer.querySelectorAll(".cf-dot");
    dots.forEach((dot, index) => {
      const active = index === currentSlide;
      dot.classList.toggle("active", active);
      dot.setAttribute("aria-current", active ? "true" : "false");
    });
  }

  function updateSlides() {
    slides.forEach((slide, index) => {
      const active = index === currentSlide;
      slide.classList.toggle("active", active);
      slide.setAttribute("aria-hidden", active ? "false" : "true");
    });
    updateDots();
    updateProgress();
  }

  function goToSlide(index) {
    if (!slides.length) return;
    currentSlide = (index + slides.length) % slides.length;
    updateSlides();
  }

  function nextSlide() {
    goToSlide(currentSlide + 1);
  }

  function prevSlide() {
    goToSlide(currentSlide - 1);
  }

  function stopCarousel() {
    if (carouselTimer) {
      clearInterval(carouselTimer);
      carouselTimer = null;
    }
  }

  function startCarousel() {
    if (slides.length <= 1) return;
    stopCarousel();
    carouselTimer = setInterval(() => {
      nextSlide();
    }, autoplayDelay);
  }

  function restartCarousel() {
    stopCarousel();
    startCarousel();
  }

  function buildDots() {
    if (!dotsContainer || !slides.length) return;
    dotsContainer.innerHTML = "";
    slides.forEach((_, index) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.className = "cf-dot";
      dot.setAttribute("aria-label", `Ir a la imagen ${index + 1}`);
      dot.addEventListener("click", () => {
        goToSlide(index);
        restartCarousel();
      });
      dotsContainer.appendChild(dot);
    });
  }

  function initCarousel() {
    if (!carousel || !slides.length) return;
    buildDots();
    goToSlide(0);
    startCarousel();

    nextBtn?.addEventListener("click", () => {
      nextSlide();
      restartCarousel();
    });

    prevBtn?.addEventListener("click", () => {
      prevSlide();
      restartCarousel();
    });

    carousel.addEventListener("mouseenter", stopCarousel);
    carousel.addEventListener("mouseleave", startCarousel);

    let touchStartX = 0;
    let touchEndX = 0;
    let isDragging = false;

    carousel.addEventListener(
      "touchstart",
      (event) => {
        touchStartX = event.changedTouches[0].clientX;
        isDragging = true;
        stopCarousel();
      },
      { passive: true }
    );

    carousel.addEventListener(
      "touchmove",
      (event) => {
        if (!isDragging) return;
        touchEndX = event.changedTouches[0].clientX;
      },
      { passive: true }
    );

    carousel.addEventListener(
      "touchend",
      (event) => {
        touchEndX = event.changedTouches[0].clientX;
        const delta = touchEndX - touchStartX;
        if (Math.abs(delta) > 40) {
          if (delta < 0) {
            nextSlide();
          } else {
            prevSlide();
          }
        }
        isDragging = false;
        restartCarousel();
      },
      { passive: true }
    );

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        stopCarousel();
      } else {
        startCarousel();
      }
    });
  }

  initCarousel();

  // --- WhatsApp button handling ---
  const whatsappBtn = document.getElementById("whatsappStickyBtn");
  const whatsappContainer = document.getElementById("whatsappContainer");
  if (whatsappBtn && whatsappContainer) {
    const tooltip = document.createElement("div");
    tooltip.id = "whatsappTooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" style="vertical-align:-3px;margin-right:4px;"><path fill="#25D366" d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg> ¿Tienes dudas? Escríbeme';
    tooltip.style.cssText =
      "position:absolute;top:50%;right:calc(100% + 12px);transform:translateY(-50%) translateX(8px);background:#fff;color:#20281f;padding:10px 16px;border-radius:12px;font-size:0.85rem;font-family:'Inter',sans-serif;box-shadow:0 8px 28px rgba(32,40,31,0.12);z-index:1060;max-width:220px;line-height:1.4;pointer-events:none;opacity:0;transition:opacity 0.3s ease,transform 0.3s ease;border:1px solid rgba(232,226,212,0.6);";
    // arrow pointing right (toward the button)
    const arrow = document.createElement("div");
    arrow.style.cssText =
      "position:absolute;top:50%;right:-6px;width:10px;height:10px;background:#fff;border-right:1px solid rgba(232,226,212,0.6);border-top:1px solid rgba(232,226,212,0.6);transform:translateY(-50%) rotate(45deg);z-index:-1;border-radius:0 2px 0 0;";
    tooltip.appendChild(arrow);
    whatsappContainer.appendChild(tooltip);

    function showTooltip() {
      tooltip.style.opacity = "1";
      tooltip.style.transform = "translateY(-50%) translateX(0)";
    }

    function hideTooltip() {
      tooltip.style.opacity = "0";
      tooltip.style.transform = "translateY(-50%) translateX(8px)";
    }

    window.setTimeout(showTooltip, 5000);
    window.setTimeout(hideTooltip, 11000);

    whatsappBtn.addEventListener("mouseenter", showTooltip);
    whatsappBtn.addEventListener("mouseleave", hideTooltip);

    whatsappBtn.addEventListener("click", () => {
      hideTooltip();
      const msg = encodeURIComponent("Hola, vi tu sitio web y me gustaría hacer una consulta administrativa.");
      window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, "_blank", "noopener,noreferrer");
    });
  }

  // --- PDF Download ---
  const downloadPdfBtn = document.getElementById("downloadPdfBtn");
  downloadPdfBtn?.addEventListener("click", async () => {
    downloadPdfBtn.disabled = true;
    const originalText = downloadPdfBtn.innerHTML;
    downloadPdfBtn.innerHTML = '<i class="fa-regular fa-spinner fa-spin me-2"></i>Generando PDF...';

    async function getGuideHTML() {
      try {
        const response = await fetch("./guia-ansiedad.html");
        return await response.text();
      } catch (_e1) {
        const tmpl = document.getElementById("guideContent");
        if (tmpl) {
          const frag = tmpl.content.cloneNode(true);
          const tmp = document.createElement("div");
          tmp.appendChild(frag);
          return tmp.innerHTML;
        }
        throw new Error("No guide content available");
      }
    }

    async function renderPDF(html) {
      const wrapper = document.createElement("div");
      wrapper.id = "guidePdfContent";
      wrapper.innerHTML = html;
      wrapper.style.cssText = "position:fixed;top:0;left:0;width:100%;background:#f7f4ee;z-index:-1;opacity:0.001;pointer-events:none;";
      document.body.appendChild(wrapper);
      await Promise.race([
        document.fonts.ready,
        new Promise((r) => setTimeout(r, 2000))
      ]);
      await new Promise((r) => setTimeout(r, 1000));
      const opt = {
        margin: [10, 10, 10, 10],
        filename: "guia-ansiedad-franco-alvarez.pdf",
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, letterRendering: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
      };
      await html2pdf().set(opt).from(wrapper).save();
      document.body.removeChild(wrapper);
    }

    try {
      const html = await getGuideHTML();
      await renderPDF(html);
    } catch (_err) {
      try {
        const w = window.open("./guia-ansiedad.html", "_blank");
        if (w) {
          w.onload = function () { w.print(); };
        }
      } catch (_e2) {
        window.open("./guia-ansiedad.html", "_blank");
      }
    }
    downloadPdfBtn.disabled = false;
    downloadPdfBtn.innerHTML = originalText;
  });

  // --- Admin Panel ---
  const adminModal = document.getElementById("adminModal");
  const adminLogin = document.getElementById("adminLogin");
  const adminPanel = document.getElementById("adminPanel");
  const adminPasswordInput = document.getElementById("adminPassword");
  const adminLoginBtn = document.getElementById("adminLoginBtn");
  const adminLoginError = document.getElementById("adminLoginError");
  const adminLogoutBtn = document.getElementById("adminLogoutBtn");
  const adminDateInput = document.getElementById("adminDate");
  const adminCalendarContainer = document.getElementById("adminCalendarContainer");
  const adminSlotsGrid = document.getElementById("adminSlotsGrid");
  const adminBlockAllBtn = document.getElementById("adminBlockAllBtn");
  const adminExportBtn = document.getElementById("adminExportBtn");
  const adminImportBtn = document.getElementById("adminImportBtn");
  const adminExportStatus = document.getElementById("adminExportStatus");
  const adminImportBox = document.getElementById("adminImportBox");
  const adminImportText = document.getElementById("adminImportText");
  const adminImportApplyBtn = document.getElementById("adminImportApplyBtn");

  let brandClickCount = 0;
  const brandLink = document.querySelector(".navbar-brand");
  brandLink?.classList.add("brand-click-hint");
  brandLink?.addEventListener("click", (e) => {
    if (adminModal && adminModal.getAttribute("aria-hidden") !== "false") {
      brandClickCount++;
      if (brandClickCount >= 5) {
        brandClickCount = 0;
        if (getAdminSession()) {
          showAdminPanel();
        }
        const bsModal = new bootstrap.Modal(adminModal);
        bsModal.show();
      }
      setTimeout(() => { brandClickCount = 0; }, 2000);
    }
  });

  function showAdminPanel() {
    if (adminLogin) adminLogin.classList.add("d-none");
    if (adminPanel) adminPanel.classList.remove("d-none");
    if (adminPasswordInput) adminPasswordInput.value = "";
    if (adminLoginError) adminLoginError.classList.add("d-none");
  }

  function hideAdminPanel() {
    if (adminLogin) adminLogin.classList.remove("d-none");
    if (adminPanel) adminPanel.classList.add("d-none");
  }

  let adminPassword = "";

  adminLoginBtn?.addEventListener("click", async () => {
    const pwd = adminPasswordInput?.value || "";
    let ok = false;
    if (API_URL) {
      const result = await apiPost('/api/admin/bookings/', {}, pwd);
      ok = result && result.ok;
    }
    if (!ok) {
      const storedPwd = window.localStorage.getItem(ADMIN_PASSWORD_KEY) || DEFAULT_ADMIN_PASSWORD;
      ok = pwd === storedPwd;
    }
    if (ok) {
      adminPassword = pwd;
      setAdminSession(true);
      showAdminPanel();
      initAdminDatePicker();
    } else {
      if (adminLoginError) adminLoginError.classList.remove("d-none");
    }
  });

  adminPasswordInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") adminLoginBtn?.click();
  });

  adminLogoutBtn?.addEventListener("click", () => {
    adminPassword = "";
    setAdminSession(false);
    hideAdminPanel();
    if (adminExportStatus) adminExportStatus.textContent = "";
    const bsModal = bootstrap.Modal.getInstance(adminModal);
    if (bsModal) bsModal.hide();
  });

  adminModal?.addEventListener("hidden.bs.modal", () => {
    if (!getAdminSession()) {
      hideAdminPanel();
    }
  });

  adminModal?.addEventListener("show.bs.modal", () => {
    if (getAdminSession()) {
      showAdminPanel();
      initAdminDatePicker();
    }
  });

  let adminFlatpickr = null;
  function initAdminDatePicker() {
    if (!window.flatpickr || !adminDateInput || !adminCalendarContainer) return;
    if (adminFlatpickr) {
      adminFlatpickr.destroy();
      adminFlatpickr = null;
    }
    adminFlatpickr = flatpickr(adminDateInput, {
      inline: true,
      appendTo: adminCalendarContainer,
      minDate: "today",
      dateFormat: "Y-m-d",
      altInput: true,
      altFormat: "l, j \\d\\e F \\d\\e Y",
      locale: "es",
      disableMobile: true,
      onChange: function (_selectedDates, dateStr) {
        if (API_URL) {
          fetchSlotsFromApi(dateStr).finally(() => renderAdminSlots(dateStr));
        } else {
          renderAdminSlots(dateStr);
        }
      }
    });
  }

  function renderAdminSlots(dateStr) {
    if (!adminSlotsGrid) return;
    adminSlotsGrid.innerHTML = "";
    if (!dateStr) {
      adminSlotsGrid.innerHTML = '<p class="text-muted small m-0 text-center py-4">Selecciona una fecha.</p>';
      return;
    }

    const cached = slotsFromCache(dateStr);
    const useApi = !!(API_URL && cached);

    if (useApi) {
      if (cached.all_blocked) {
        adminSlotsGrid.innerHTML = '<p class="text-muted small m-0 text-center py-4">Día bloqueado.</p>';
        if (adminBlockAllBtn) adminBlockAllBtn.textContent = "Habilitar todo";
        return;
      }
      cached.slots.forEach((slot) => {
        const isBlocked = slot.status === 'blocked';
        const isBooked = !!slot.booking_status;

        const row = document.createElement("div");
        row.className = "admin-slot";

        const timeSpan = document.createElement("span");
        timeSpan.className = "slot-time";
        timeSpan.textContent = slot.time.slice(0, 5);

        const statusSpan = document.createElement("span");
        statusSpan.className = "slot-status";
        if (isBlocked) {
          statusSpan.textContent = "Bloqueado";
          statusSpan.classList.add("blocked");
        } else if (isBooked && slot.booking_status === "confirmed") {
          statusSpan.textContent = "Confirmado";
          statusSpan.classList.add("confirmed");
        } else if (isBooked) {
          statusSpan.textContent = "Reservado";
          statusSpan.classList.add("booked");
        } else {
          statusSpan.textContent = "Disponible";
          statusSpan.classList.add("available");
        }

        const actions = document.createElement("div");
        actions.className = "slot-actions";

        if (isBlocked) {
          const habilitar = document.createElement("button");
          habilitar.textContent = "Habilitar";
          habilitar.addEventListener("click", async () => {
            await apiPost(`/api/admin/slot/${slot.id}/`, { action: 'toggle_block' }, adminPassword);
            const data = await fetchSlotsFromApi(dateStr);
            renderAdminSlots(dateStr);
          });
          actions.appendChild(habilitar);
        } else {
          const bloquear = document.createElement("button");
          bloquear.textContent = "Bloquear";
          bloquear.addEventListener("click", async () => {
            await apiPost(`/api/admin/slot/${slot.id}/`, { action: 'toggle_block' }, adminPassword);
            const data = await fetchSlotsFromApi(dateStr);
            renderAdminSlots(dateStr);
          });
          actions.appendChild(bloquear);

          if (isBooked) {
            if (slot.booking_status !== "confirmed") {
              const confirmar = document.createElement("button");
              confirmar.textContent = "Confirmar";
              confirmar.addEventListener("click", async () => {
                await apiPost(`/api/admin/slot/${slot.id}/`, { action: 'update_booking', booking_status: 'confirmed' }, adminPassword);
                const data = await fetchSlotsFromApi(dateStr);
                renderAdminSlots(dateStr);
              });
              actions.appendChild(confirmar);
            } else {
              const pendiente = document.createElement("button");
              pendiente.textContent = "Pendiente";
              pendiente.addEventListener("click", async () => {
                await apiPost(`/api/admin/slot/${slot.id}/`, { action: 'update_booking', booking_status: 'pending' }, adminPassword);
                const data = await fetchSlotsFromApi(dateStr);
                renderAdminSlots(dateStr);
              });
              actions.appendChild(pendiente);
            }

            const cancelar = document.createElement("button");
            cancelar.textContent = "Cancelar";
            cancelar.addEventListener("click", async () => {
              await apiPost(`/api/admin/slot/${slot.id}/`, { action: 'update_booking', booking_status: 'cancelled' }, adminPassword);
              const data = await fetchSlotsFromApi(dateStr);
              renderAdminSlots(dateStr);
            });
            actions.appendChild(cancelar);
          }
        }

        row.appendChild(timeSpan);
        row.appendChild(statusSpan);
        row.appendChild(actions);
        adminSlotsGrid.appendChild(row);
      });

      if (adminBlockAllBtn) {
        adminBlockAllBtn.textContent = "Bloquear todo";
      }
      return;
    }

    const allSlots = [...DEFAULT_SLOTS];
    const blocked = getAdminBlocked();
    const dateBlocked = Array.isArray(blocked[dateStr]) ? blocked[dateStr] : [];
    const isAllBlocked = blocked[dateStr] === "__all__";
    const bookedSlots = getBookedSlots(dateStr);

    allSlots.forEach((time) => {
      const isBooked = bookedSlots.includes(time);
      const status = getBookingStatus(dateStr, time);
      const isBlocked = dateBlocked.includes(time) || isAllBlocked;

      const row = document.createElement("div");
      row.className = "admin-slot";

      const timeSpan = document.createElement("span");
      timeSpan.className = "slot-time";
      timeSpan.textContent = time;

      const statusSpan = document.createElement("span");
      statusSpan.className = "slot-status";
      if (isBlocked) {
        statusSpan.textContent = "Bloqueado";
        statusSpan.classList.add("blocked");
      } else if (isBooked && status === "confirmed") {
        statusSpan.textContent = "Confirmado";
        statusSpan.classList.add("confirmed");
      } else if (isBooked) {
        statusSpan.textContent = "Reservado";
        statusSpan.classList.add("booked");
      } else {
        statusSpan.textContent = "Disponible";
        statusSpan.classList.add("available");
      }

      const actions = document.createElement("div");
      actions.className = "slot-actions";

      if (isBlocked) {
        const habilitar = document.createElement("button");
        habilitar.textContent = "Habilitar";
        habilitar.title = "Habilitar este horario";
        habilitar.addEventListener("click", () => {
          const current = getAdminBlocked();
          const list = Array.isArray(current[dateStr]) ? current[dateStr].filter(s => s !== time) : [];
          if (list.length === 0) {
            delete current[dateStr];
          } else {
            current[dateStr] = list;
          }
          if (Object.keys(current).length === 0) {
            window.localStorage.removeItem(ADMIN_BLOCKED_KEY);
          } else {
            saveAdminBlocked(current);
          }
          renderAdminSlots(dateStr);
        });
        actions.appendChild(habilitar);
      } else {
        const bloquear = document.createElement("button");
        bloquear.textContent = "Bloquear";
        bloquear.title = "Deshabilitar este horario";
        bloquear.addEventListener("click", () => {
          const current = getAdminBlocked();
          if (!current[dateStr]) current[dateStr] = [];
          if (!current[dateStr].includes(time)) {
            current[dateStr].push(time);
          }
          saveAdminBlocked(current);
          renderAdminSlots(dateStr);
        });
        actions.appendChild(bloquear);

        if (isBooked) {
          if (status !== "confirmed") {
            const confirmar = document.createElement("button");
            confirmar.textContent = "Confirmar";
            confirmar.title = "Marcar como confirmada";
            confirmar.addEventListener("click", () => {
              setBookingStatus(dateStr, time, "confirmed");
              renderAdminSlots(dateStr);
            });
            actions.appendChild(confirmar);
          } else {
            const pendiente = document.createElement("button");
            pendiente.textContent = "Pendiente";
            pendiente.title = "Volver a pendiente";
            pendiente.addEventListener("click", () => {
              setBookingStatus(dateStr, time, "pending");
              renderAdminSlots(dateStr);
            });
            actions.appendChild(pendiente);
          }

          const cancelar = document.createElement("button");
          cancelar.textContent = "Cancelar";
          cancelar.title = "Cancelar y liberar horario";
          cancelar.addEventListener("click", () => {
            const bookings = getStoredBookings();
            if (Array.isArray(bookings[dateStr])) {
              bookings[dateStr] = bookings[dateStr].filter(s => s !== time);
            }
            saveStoredBookings(bookings);
            setBookingStatus(dateStr, time, "pending");
            renderAdminSlots(dateStr);
          });
          actions.appendChild(cancelar);
        }
      }

      row.appendChild(timeSpan);
      row.appendChild(statusSpan);
      row.appendChild(actions);
      adminSlotsGrid.appendChild(row);
    });

    if (adminBlockAllBtn) {
      adminBlockAllBtn.textContent = isAllBlocked ? "Habilitar todo" : "Bloquear todo";
    }
  }

  adminBlockAllBtn?.addEventListener("click", async () => {
    const dateStr = adminDateInput?.value;
    if (!dateStr) return;
    if (API_URL) {
      const cached = slotsFromCache(dateStr);
      const currentlyBlocked = cached?.all_blocked;
      await apiPost('/api/admin/block-day/', { date: dateStr, block: !currentlyBlocked }, adminPassword);
      const data = await fetchSlotsFromApi(dateStr);
      renderAdminSlots(dateStr);
      return;
    }
    const blocked = getAdminBlocked();
    const isAllBlocked = blocked[dateStr] === "__all__";
    if (isAllBlocked) {
      delete blocked[dateStr];
    } else {
      blocked[dateStr] = "__all__";
    }
    if (Object.keys(blocked).length === 0) {
      window.localStorage.removeItem(ADMIN_BLOCKED_KEY);
    } else {
      saveAdminBlocked(blocked);
    }
    renderAdminSlots(dateStr);
  });

  adminExportBtn?.addEventListener("click", async () => {
    if (API_URL) {
      const result = await apiGet(`/api/admin/export/?admin_password=${adminPassword}`);
      if (result) {
        const output = JSON.stringify(result, null, 2);
        navigator.clipboard.writeText(output).then(() => {
          if (adminExportStatus) adminExportStatus.textContent = "Configuración copiada al portapapeles.";
        }).catch(() => {
          if (adminExportStatus) adminExportStatus.textContent = "Copia manual: " + output;
        });
      } else {
        if (adminExportStatus) adminExportStatus.textContent = "Error al exportar.";
      }
      if (adminImportBox) adminImportBox.classList.add("d-none");
      return;
    }
    const blocked = getAdminBlocked();
    const output = JSON.stringify(blocked, null, 0);
    navigator.clipboard.writeText(output).then(() => {
      if (adminExportStatus) adminExportStatus.textContent = "Configuración copiada al portapapeles.";
    }).catch(() => {
      if (adminExportStatus) adminExportStatus.textContent = "Copia manual: " + output;
    });
    if (adminImportBox) adminImportBox.classList.add("d-none");
  });

  adminImportBtn?.addEventListener("click", () => {
    if (adminImportBox) adminImportBox.classList.toggle("d-none");
    if (adminExportStatus) adminExportStatus.textContent = "";
  });

  adminImportApplyBtn?.addEventListener("click", async () => {
    const text = adminImportText?.value?.trim();
    if (!text) return;
    if (API_URL) {
      try {
        const parsed = JSON.parse(text);
        const result = await apiPost('/api/admin/import/', parsed, adminPassword);
        if (result && result.ok) {
          if (adminImportBox) adminImportBox.classList.add("d-none");
          if (adminImportText) adminImportText.value = "";
          if (adminExportStatus) adminExportStatus.textContent = "Configuración importada correctamente.";
          const dateStr = adminDateInput?.value;
          if (dateStr) {
            await fetchSlotsFromApi(dateStr);
            renderAdminSlots(dateStr);
          }
        } else {
          if (adminExportStatus) adminExportStatus.textContent = "Error al importar.";
        }
      } catch {
        if (adminExportStatus) adminExportStatus.textContent = "JSON inválido. Revisa el formato.";
      }
      return;
    }
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === "object" && !Array.isArray(parsed)) {
        saveAdminBlocked(parsed);
        if (adminImportBox) adminImportBox.classList.add("d-none");
        if (adminImportText) adminImportText.value = "";
        if (adminExportStatus) adminExportStatus.textContent = "Configuración importada correctamente.";
        const dateStr = adminDateInput?.value;
        if (dateStr) renderAdminSlots(dateStr);
      } else {
        if (adminExportStatus) adminExportStatus.textContent = "Formato inválido. Debe ser un objeto JSON.";
      }
    } catch (_e) {
      if (adminExportStatus) adminExportStatus.textContent = "JSON inválido. Revisa el formato.";
    }
  });

  // Open admin panel via URL param ?admin
  if (window.location.search.includes("admin") && adminModal) {
    if (getAdminSession()) {
      const bsModal = new bootstrap.Modal(adminModal);
      bsModal.show();
    }
  }
});
