/*!
 * Owner'sLOCAL Online Booking widget.
 *
 * Paste on any website:
 *   <div id="ownerslocal-booking"></div>
 *   <script src="https://YOUR-OWNERSLOCAL-APP/embed/ownerslocal-booking.js"
 *           data-token="YOUR_WEBSITE_FORM_TOKEN" async></script>
 *
 * Optional attributes:
 *   data-mode="booking"   booking calendar only (default)
 *   data-mode="combined"  business contact info + a choice between
 *                         "Book a time" and "Just contact me" (lead form)
 *   data-mode="contact"   contact info + lead form only
 *   data-show-contact="false"  hide the business contact card
 *   data-track-visit="false"   don't count this page view (combined/contact
 *                              modes count it, like the lead form snippet)
 *   data-target="element-id" (default "ownerslocal-booking"), data-accent="#315C9F"
 *
 * "Just contact me" posts to the same Website Lead Capture webhook as the
 * standalone lead form, so it still creates an ordinary Lead.
 *
 * Talks only to /api/booking/web/:token/* on the Owner'sLOCAL server that
 * served this file. Every slot shown and every booking made is validated
 * there against the business's live schedule -- this script holds no
 * business logic and no data beyond what the visitor types.
 */
(function () {
  "use strict";
  var script = document.currentScript;
  if (!script) return;
  var token = script.getAttribute("data-token") || "";
  var targetId = script.getAttribute("data-target") || "ownerslocal-booking";
  var accent = /^#[0-9a-fA-F]{3,8}$/.test(script.getAttribute("data-accent") || "") ? script.getAttribute("data-accent") : "#315C9F";
  var serverOrigin = new URL(script.src).origin;
  var apiBase = serverOrigin + "/api/booking/web/" + encodeURIComponent(token);
  var mode = ({ combined: "combined", contact: "contact" })[script.getAttribute("data-mode") || ""] || "booking";
  var showContact = script.getAttribute("data-show-contact") !== "false";
  var trackVisit = mode !== "booking" && script.getAttribute("data-track-visit") !== "false";

  function start() {
    var root = document.getElementById(targetId);
    if (!root) {
      root = document.createElement("div");
      root.id = targetId;
      script.parentNode.insertBefore(root, script);
    }
    if (root.getAttribute("data-ol-ready")) return;
    root.setAttribute("data-ol-ready", "1");
    run(root);
  }

  // ---- tiny DOM helpers (textContent only -- never innerHTML with data) ----
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "style") node.style.cssText = attrs[k];
      else if (k === "text") node.textContent = attrs[k];
      else if (k.slice(0, 2) === "on") node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== false) node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return node;
  }
  var S = {
    box: "max-width:520px;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1F3557;border:1px solid #9EC8EF;border-radius:16px;padding:18px;background:#fff;box-sizing:border-box;",
    h: "margin:0 0 4px;font-size:18px;font-weight:800;",
    sub: "margin:0 0 14px;font-size:13px;color:#5E7393;",
    label: "display:block;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#5E7393;margin:12px 0 4px;",
    input: "width:100%;box-sizing:border-box;padding:10px;border:1px solid #9EC8EF;border-radius:10px;font-size:14px;font-family:inherit;",
    btn: "padding:10px 16px;border:none;border-radius:10px;background:" + accent + ";color:#fff;font-weight:800;font-size:14px;cursor:pointer;",
    btn2: "padding:10px 16px;border:1px solid #9EC8EF;border-radius:10px;background:#fff;color:" + accent + ";font-weight:800;font-size:14px;cursor:pointer;",
    chip: "padding:9px 4px;border:1px solid #9EC8EF;border-radius:10px;background:#fff;color:" + accent + ";font-weight:700;font-size:13px;cursor:pointer;",
    chipOn: "padding:9px 4px;border:1px solid " + accent + ";border-radius:10px;background:" + accent + ";color:#fff;font-weight:700;font-size:13px;cursor:pointer;",
    err: "margin:10px 0;padding:10px;border-radius:10px;background:#FFF1F2;border:1px solid #FECDD3;color:#BE123C;font-size:13px;",
    row: "display:flex;justify-content:space-between;gap:8px;margin-top:16px;"
  };

  function fmtTime(t) {
    var p = t.split(":"); var h = +p[0];
    return (h % 12 || 12) + ":" + p[1] + " " + (h >= 12 ? "PM" : "AM");
  }
  function fmtDate(d, opts) {
    var p = d.split("-");
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).toLocaleDateString("en-US", Object.assign({ timeZone: "UTC" }, opts || { weekday: "long", month: "long", day: "numeric", year: "numeric" }));
  }
  function shiftDate(d, days) {
    var p = d.split("-");
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + days)).toISOString().slice(0, 10);
  }
  function api(path, init) {
    return fetch(apiBase + path, init).then(function (r) { return r.json(); }).catch(function () {
      return { ok: false, error: "Could not reach the booking service. Please try again." };
    });
  }
  function newKey() {
    return (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2)).replace(/-/g, "");
  }
  function compress(file) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        var attempts = [[1200, 0.72], [900, 0.62], [700, 0.55]];
        for (var i = 0; i < attempts.length; i++) {
          var scale = Math.min(1, attempts[i][0] / Math.max(img.width, img.height));
          var c = document.createElement("canvas");
          c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          var data = c.toDataURL("image/jpeg", attempts[i][1]);
          if (data.length <= 340000) { URL.revokeObjectURL(url); resolve(data); return; }
        }
        URL.revokeObjectURL(url); reject(new Error("too large"));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("bad image")); };
      img.src = url;
    });
  }

  function run(root) {
    var state = {
      options: null, serviceId: "", days: null, date: "", time: "", error: "", busy: false,
      name: "", phone: "", email: "", address: "", description: "", photos: [], website: "", key: newKey(), confirmation: null,
      company: "", notes: "", info: null,
      step: mode === "booking" ? "service" : mode === "contact" ? "contact" : "choose"
    };
    var CONTACT_STEPS = { choose: 1, contact: 1, contactDone: 1 };

    function bookingAvailable() {
      return mode !== "contact" && !!(state.options && state.options.ok);
    }

    function render() {
      root.textContent = "";
      var box = el("div", { style: S.box });
      root.appendChild(box);
      if (mode !== "booking") {
        if (!state.info) { box.appendChild(el("p", { style: S.sub, text: "Loading…" })); return; }
        // Booking is off (or still loading) -> combined mode falls back to the contact form.
        if (state.step === "choose" && state.options && !bookingAvailable()) state.step = "contact";
      }
      if (CONTACT_STEPS[state.step]) {
        var name = state.info.businessName || (state.options && state.options.businessName) || "";
        box.appendChild(el("p", { style: S.h, text: state.step === "contactDone" ? "Message Sent" : name ? "Contact " + name : "Contact Us" }));
        if (showContact && state.step !== "contactDone") renderContactCard(box);
        if (state.error) box.appendChild(el("div", { style: S.err, role: "alert", text: state.error }));
        ({ choose: renderChoose, contact: renderContactForm, contactDone: renderContactDone })[state.step](box);
        return;
      }
      if (!state.options) { box.appendChild(el("p", { style: S.sub, text: "Loading available appointments…" })); return; }
      if (!state.options.ok) {
        box.appendChild(el("p", { style: S.h, text: "Online booking unavailable" }));
        box.appendChild(el("p", { style: S.sub, text: state.options.error || "Please contact us directly to schedule." }));
        return;
      }
      box.appendChild(el("p", { style: S.h, text: state.step === "done" ? "Booking Confirmed" : "Book an Appointment" }));
      if (state.options.businessName && state.step !== "done") box.appendChild(el("p", { style: S.sub, text: "with " + state.options.businessName }));
      if (state.error) box.appendChild(el("div", { style: S.err, role: "alert", text: state.error }));
      ({ service: renderService, time: renderTime, details: renderDetails, review: renderReview, done: renderDone })[state.step](box);
    }

    function service() {
      return (state.options.services || []).filter(function (s) { return s.id === state.serviceId; })[0];
    }

    function renderService(box) {
      box.appendChild(el("span", { style: S.label, text: "Service needed" }));
      var list = el("div", { style: "display:grid;gap:8px;" });
      (state.options.services || []).forEach(function (s) {
        var on = s.id === state.serviceId;
        list.appendChild(el("button", {
          type: "button",
          style: "text-align:left;padding:12px;border-radius:12px;cursor:pointer;background:" + (on ? "#EAF5FF" : "#fff") + ";border:1px solid " + (on ? accent : "#9EC8EF") + ";font-family:inherit;",
          onclick: function () { state.serviceId = s.id; state.days = null; state.time = ""; render(); }
        }, [
          el("div", { style: "font-weight:800;font-size:14px;color:#1F3557;", text: s.name }),
          el("div", { style: "font-size:12px;color:#5E7393;", text: "About " + s.durationMinutes + " min" + (s.description ? " · " + s.description : "") })
        ]));
      });
      box.appendChild(list);
      box.appendChild(el("div", { style: S.row }, [mode === "combined" ? el("button", { type: "button", style: S.btn2, onclick: function () { state.step = "choose"; state.error = ""; render(); } }, ["← Back"]) : el("span"), el("button", {
        type: "button", style: S.btn + (state.serviceId ? "" : "opacity:.4;"), disabled: !state.serviceId,
        onclick: function () { state.step = "time"; state.error = ""; render(); loadDays(""); }
      }, ["Choose a time →"])]));
    }

    function loadDays(from) {
      state.days = null; render();
      api("/availability?serviceId=" + encodeURIComponent(state.serviceId) + "&days=7" + (from ? "&from=" + from : "")).then(function (r) {
        if (!r.ok) { state.error = r.error || "Could not load available times."; state.days = []; render(); return; }
        setDays(r.days || []);
      });
    }
    function setDays(days) {
      state.days = days;
      var stillOpen = days.filter(function (d) { return d.date === state.date && d.slots.length; })[0];
      if (!stillOpen) {
        var first = days.filter(function (d) { return d.slots.length; })[0];
        state.date = first ? first.date : (days[0] ? days[0].date : "");
        state.time = "";
      }
      render();
    }

    function renderTime(box) {
      var nav = el("div", { style: "display:flex;justify-content:space-between;align-items:center;" }, [
        el("span", { style: S.label, text: "Pick a day" }),
        el("span", null, [
          el("button", { type: "button", "aria-label": "Earlier dates", style: S.btn2 + "padding:4px 10px;margin-right:4px;", onclick: function () { if (state.days && state.days[0]) loadDays(shiftDate(state.days[0].date, -7)); } }, ["‹"]),
          el("button", { type: "button", "aria-label": "Later dates", style: S.btn2 + "padding:4px 10px;", onclick: function () { if (state.days && state.days.length) loadDays(shiftDate(state.days[state.days.length - 1].date, 1)); } }, ["›"])
        ])
      ]);
      box.appendChild(nav);
      if (!state.days) { box.appendChild(el("p", { style: S.sub, text: "Checking the schedule…" })); }
      else if (!state.days.length) { box.appendChild(el("p", { style: S.sub, text: "No more dates are open for online booking." })); }
      else {
        var grid = el("div", { style: "display:grid;grid-template-columns:repeat(7,1fr);gap:4px;" });
        state.days.forEach(function (d) {
          var open = d.slots.length > 0, on = d.date === state.date;
          grid.appendChild(el("button", {
            type: "button", disabled: !open,
            style: (on ? S.chipOn : S.chip) + (open ? "" : "opacity:.35;cursor:default;") + "font-size:11px;line-height:1.3;",
            onclick: function () { state.date = d.date; state.time = ""; render(); }
          }, [fmtDate(d.date, { weekday: "short" }), el("br"), el("strong", { text: fmtDate(d.date, { day: "numeric" }) })]));
        });
        box.appendChild(grid);
        var day = state.days.filter(function (d) { return d.date === state.date; })[0];
        box.appendChild(el("span", { style: S.label, text: state.date ? "Available times · " + fmtDate(state.date, { weekday: "long", month: "short", day: "numeric" }) : "Available times" }));
        if (day && day.slots.length) {
          var slots = el("div", { style: "display:grid;grid-template-columns:repeat(4,1fr);gap:6px;" });
          day.slots.forEach(function (s) {
            slots.appendChild(el("button", { type: "button", style: s.startTime === state.time ? S.chipOn : S.chip, onclick: function () { state.time = s.startTime; render(); } }, [fmtTime(s.startTime)]));
          });
          box.appendChild(slots);
        } else box.appendChild(el("p", { style: S.sub, text: "No open times this day -- try another date." }));
        if (state.options.timeZone) box.appendChild(el("p", { style: "font-size:11px;color:#5E7393;margin:10px 0 0;", text: "Times are in our local time (" + state.options.timeZone.replace(/_/g, " ") + ")." }));
      }
      box.appendChild(el("div", { style: S.row }, [
        el("button", { type: "button", style: S.btn2, onclick: function () { state.step = "service"; render(); } }, ["← Back"]),
        el("button", { type: "button", style: S.btn + (state.time ? "" : "opacity:.4;"), disabled: !state.time, onclick: function () { state.step = "details"; state.error = ""; render(); } }, ["Continue →"])
      ]));
    }

    function field(box, label, key, attrs) {
      box.appendChild(el("label", { style: S.label, for: "ol-bk-" + key, text: label }));
      var tag = attrs && attrs.textarea ? "textarea" : "input";
      var input = el(tag, Object.assign({ id: "ol-bk-" + key, style: S.input, value: state[key] }, attrs || {}, { textarea: null }));
      if (tag === "textarea") input.value = state[key];
      input.addEventListener("input", function () { state[key] = input.value; });
      box.appendChild(input);
    }

    function renderDetails(box) {
      field(box, "Your name *", "name", { autocomplete: "name" });
      field(box, "Phone", "phone", { type: "tel", autocomplete: "tel" });
      field(box, "Email", "email", { type: "email", autocomplete: "email" });
      field(box, "Service address *", "address", { autocomplete: "street-address" });
      field(box, "Short description", "description", { textarea: true, rows: "3", maxlength: "2000" });
      // Honeypot: real visitors never see this.
      var hp = el("input", { name: "website", tabindex: "-1", autocomplete: "off", "aria-hidden": "true", style: "position:absolute;left:-9999px;" });
      hp.addEventListener("input", function () { state.website = hp.value; });
      box.appendChild(hp);

      box.appendChild(el("span", { style: S.label, text: "Photos (optional, up to 4)" }));
      var photos = el("div", { style: "display:flex;gap:6px;flex-wrap:wrap;" });
      state.photos.forEach(function (p, i) {
        photos.appendChild(el("span", { style: "position:relative;" }, [
          el("img", { src: p, alt: "Photo " + (i + 1), style: "width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid #9EC8EF;" }),
          el("button", { type: "button", "aria-label": "Remove photo", style: "position:absolute;top:-6px;right:-6px;border:none;border-radius:50%;background:#E11D48;color:#fff;width:18px;height:18px;font-size:11px;cursor:pointer;", onclick: function () { state.photos.splice(i, 1); render(); } }, ["×"])
        ]));
      });
      if (state.photos.length < 4) {
        var file = el("input", { type: "file", accept: "image/*", style: "font-size:12px;" });
        file.addEventListener("change", function () {
          var f = file.files && file.files[0];
          if (!f) return;
          compress(f).then(function (d) { state.photos.push(d); render(); }, function () { state.error = "Couldn't use that photo -- try a different image."; render(); });
        });
        photos.appendChild(file);
      }
      box.appendChild(photos);

      box.appendChild(el("div", { style: S.row }, [
        el("button", { type: "button", style: S.btn2, onclick: function () { state.step = "time"; render(); } }, ["← Back"]),
        el("button", { type: "button", style: S.btn, onclick: function () {
          if (!state.name.trim()) { state.error = "Please enter your name."; render(); return; }
          if (!state.phone.trim() && !state.email.trim()) { state.error = "Please enter a phone number or email."; render(); return; }
          if (!state.address.trim()) { state.error = "Please enter the service address."; render(); return; }
          state.error = ""; state.step = "review"; render();
        } }, ["Review Booking →"])
      ]));
    }

    function summary(box, rows) {
      var dl = el("dl", { style: "margin:8px 0 0;border:1px solid #9EC8EF;border-radius:12px;" });
      rows.forEach(function (r, i) {
        dl.appendChild(el("div", { style: "display:flex;gap:10px;padding:9px 12px;" + (i ? "border-top:1px solid #E3F0FB;" : "") }, [
          el("dt", { style: "width:80px;flex-shrink:0;font-size:11px;font-weight:800;text-transform:uppercase;color:#5E7393;", text: r[0] }),
          el("dd", { style: "margin:0;font-size:14px;font-weight:700;word-break:break-word;", text: r[1] })
        ]));
      });
      box.appendChild(dl);
    }

    function renderReview(box) {
      var s = service();
      summary(box, [
        ["Service", s.name + " (about " + s.durationMinutes + " min)"],
        ["Date", fmtDate(state.date)],
        ["Time", fmtTime(state.time)],
        ["Address", state.address.trim()],
        ["Name", state.name.trim()],
        ["Contact", [state.phone.trim(), state.email.trim()].filter(Boolean).join(" · ")]
      ]);
      if (state.photos.length) box.appendChild(el("p", { style: S.sub + "margin-top:8px;", text: state.photos.length + " photo(s) attached" }));
      box.appendChild(el("div", { style: S.row }, [
        el("button", { type: "button", style: S.btn2, disabled: state.busy, onclick: function () { state.step = "details"; render(); } }, ["← Back"]),
        el("button", { type: "button", style: S.btn + (state.busy ? "opacity:.5;" : ""), disabled: state.busy, onclick: submit }, [state.busy ? "Booking…" : "Confirm Booking"])
      ]));
    }

    function submit() {
      if (state.busy) return;
      state.busy = true; state.error = ""; render();
      api("/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId: state.serviceId, date: state.date, startTime: state.time,
          name: state.name.trim(), phone: state.phone.trim(), email: state.email.trim(),
          address: state.address.trim(), description: state.description.trim(), photos: state.photos,
          website: state.website, idempotencyKey: state.key
        })
      }).then(function (r) {
        state.busy = false;
        if (r.ok && r.confirmation) { state.confirmation = r.confirmation; state.step = "done"; render(); return; }
        if (r.ok) { state.step = "done"; render(); return; }
        state.error = r.error || "Something went wrong -- please try again.";
        if (r.code === "SLOT_UNAVAILABLE") {
          state.key = newKey(); state.step = "time"; state.time = "";
          if (r.availability) { setDays(r.availability); return; }
          loadDays(state.date); return;
        }
        render();
      });
    }

    function renderContactCard(box) {
      var i = state.info, rows = [];
      if (i.phone) rows.push(["Phone", el("a", { href: "tel:" + i.phone.replace(/[^0-9+]/g, ""), style: "color:" + accent + ";font-weight:700;text-decoration:none;", text: i.phone })]);
      if (i.email) rows.push(["Email", el("a", { href: "mailto:" + i.email, style: "color:" + accent + ";font-weight:700;text-decoration:none;", text: i.email })]);
      if (i.address) rows.push(["Address", el("span", { text: i.address })]);
      if (i.hours) rows.push(["Hours", el("span", { text: i.hours })]);
      if (!rows.length) return;
      var card = el("div", { style: "margin:4px 0 14px;padding:10px 12px;border-radius:12px;background:#F5FAFF;border:1px solid #D6E8F8;font-size:13px;" });
      rows.forEach(function (r) {
        card.appendChild(el("div", { style: "display:flex;gap:10px;padding:2px 0;" }, [
          el("span", { style: "width:64px;flex-shrink:0;font-size:11px;font-weight:800;text-transform:uppercase;color:#5E7393;padding-top:1px;", text: r[0] }), r[1]
        ]));
      });
      box.appendChild(card);
    }

    function choiceButton(title, sub, onclick) {
      return el("button", { type: "button", onclick: onclick, style: "text-align:left;padding:14px;border-radius:12px;cursor:pointer;background:#fff;border:1px solid #9EC8EF;font-family:inherit;width:100%;" }, [
        el("div", { style: "font-weight:800;font-size:15px;color:" + accent + ";", text: title }),
        el("div", { style: "font-size:12px;color:#5E7393;margin-top:2px;", text: sub })
      ]);
    }

    function renderChoose(box) {
      box.appendChild(el("span", { style: S.label, text: "How can we help?" }));
      box.appendChild(el("div", { style: "display:grid;gap:8px;" }, [
        choiceButton("📅 Book a time", "Pick an open appointment on our schedule.", function () {
          state.step = "service"; state.error = ""; render();
        }),
        choiceButton("✉️ Just contact me", "Send us your info and we'll reach out.", function () {
          state.step = "contact"; state.error = ""; render();
        })
      ]));
    }

    function renderContactForm(box) {
      field(box, "Your name *", "name", { autocomplete: "name" });
      field(box, "Phone", "phone", { type: "tel", autocomplete: "tel" });
      field(box, "Email", "email", { type: "email", autocomplete: "email" });
      field(box, "Company (optional)", "company", { autocomplete: "organization" });
      field(box, "What do you need help with?", "notes", { textarea: true, rows: "3", maxlength: "2000" });
      var hp = el("input", { name: "website", tabindex: "-1", autocomplete: "off", "aria-hidden": "true", style: "position:absolute;left:-9999px;" });
      hp.addEventListener("input", function () { state.website = hp.value; });
      box.appendChild(hp);
      var canGoBack = mode === "combined" && bookingAvailable();
      box.appendChild(el("div", { style: S.row }, [
        canGoBack ? el("button", { type: "button", style: S.btn2, disabled: state.busy, onclick: function () { state.step = "choose"; state.error = ""; render(); } }, ["← Back"]) : el("span"),
        el("button", { type: "button", style: S.btn + (state.busy ? "opacity:.5;" : ""), disabled: state.busy, onclick: submitContact }, [state.busy ? "Sending…" : "Send"])
      ]));
    }

    function submitContact() {
      if (state.busy) return;
      if (!state.name.trim()) { state.error = "Please enter your name."; render(); return; }
      if (!state.phone.trim() && !state.email.trim()) { state.error = "Please enter a phone number or email."; render(); return; }
      state.busy = true; state.error = ""; render();
      fetch(serverOrigin + "/api/leads/submit-web-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token, name: state.name.trim(), phone: state.phone.trim(), email: state.email.trim(), company: state.company.trim(), notes: state.notes.trim(), website: state.website })
      }).then(function (r) { return r.json(); }).catch(function () { return { ok: false }; }).then(function (r) {
        state.busy = false;
        if (r.ok) { state.step = "contactDone"; render(); return; }
        state.error = r.error || "Something went wrong -- please try again.";
        render();
      });
    }

    function renderContactDone(box) {
      box.appendChild(el("p", { style: S.sub, text: "Thanks, " + (state.name.trim().split(" ")[0] || "we got it") + "! We'll be in touch shortly." }));
      if (mode === "combined" && bookingAvailable()) {
        box.appendChild(el("button", { type: "button", style: S.btn2, onclick: function () { state.step = "service"; render(); } }, ["Or book a time now →"]));
      }
    }

    function renderDone(box) {
      var c = state.confirmation;
      if (!c) { box.appendChild(el("p", { style: S.sub, text: "Thanks! We'll be in touch shortly." })); return; }
      box.appendChild(el("p", { style: S.sub, text: "You're booked. Confirmation #" + c.jobNumber + (c.businessName ? " with " + c.businessName : "") + "." }));
      summary(box, [
        ["Business", c.businessName || ""],
        ["Service", c.serviceName],
        ["Date", fmtDate(c.date)],
        ["Time", fmtTime(c.startTime) + " – " + fmtTime(c.endTime)],
        ["Address", c.address]
      ]);
    }

    render();
    if (trackVisit) {
      // Same visitor counter the standalone lead form snippet uses.
      fetch(serverOrigin + "/api/leads/track-visit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: token }) }).catch(function () {});
    }
    function loadOptions() {
      api("/options").then(function (r) {
        state.options = r;
        if (r.ok && r.services && r.services.length === 1) state.serviceId = r.services[0].id;
        render();
      });
    }
    if (mode === "booking") loadOptions();
    else {
      api("/info").then(function (r) {
        state.info = r && r.ok ? r : { businessName: "" };
        // Only ask for the calendar when booking is actually on; otherwise
        // combined mode simply becomes the contact form.
        if (mode === "combined" && r && r.bookingEnabled) loadOptions();
        else state.options = { ok: false };
        render();
      });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
