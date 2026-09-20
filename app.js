/* ============================================================
   ROUTINE — app logic
   Vanilla JS, no build step. Data persists in localStorage.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- helpers ---------- */
  var $  = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function load(key, fallback) {
    try { var v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch (e) { return fallback; }
  }
  function save() {
    try {
      localStorage.setItem("routine.tasks", JSON.stringify(tasks));
      localStorage.setItem("routine.rems", JSON.stringify(rems));
      localStorage.setItem("routine.routines", JSON.stringify(routines));
      localStorage.setItem("routine.goals", JSON.stringify(goals));
      localStorage.setItem("routine.settings", JSON.stringify(settings));
    } catch (e) { /* storage unavailable — app still works in memory */ }
  }

  function scheduleTaskNotification(task) {
    if (!swRegistration || !settings.notifications || !task.dueAt || Number(task.dueAt) <= Date.now()) return;
    var worker = swRegistration.active || swRegistration.waiting || swRegistration.installing;
    if (!worker) return;
    var step = task.repeat === "daily" ? 86400000 : task.repeat === "weekly" ? 604800000 : task.repeat === "monthly" ? 2592000000 : 0;
    var occurrences = step ? 30 : 1;
    for (var index = 0; index < occurrences; index++) {
      var timestamp = Number(task.dueAt) + step * index;
      if (timestamp > Date.now()) worker.postMessage({ type: "SCHEDULE_NOTIFICATION", title: "Routine reminder", body: task.title + " is due now.", timestamp: timestamp, tag: "routine-task-" + task.id + "-" + index });
    }
  }

  function scheduleAllNotifications() { tasks.forEach(scheduleTaskNotification); }

  async function ensureNotificationPermission() {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    return (await Notification.requestPermission()) === "granted";
  }

  function showAlarmPopup(task) {
    $("#alarmTitle").textContent = task.title;
    $("#alarmMessage").textContent = task.repeat && task.repeat !== "none" ? "Your repeating task is due now." : "It is time to complete this task.";
    $("#alarmModal").hidden = false;
  }

  function checkFallbackNotifications() {
    if (!settings.notifications || !("Notification" in window) || Notification.permission !== "granted") return;
    var changed = false;
    tasks.forEach(function (task) {
      if (!task.done && task.dueAt && Number(task.dueAt) <= Date.now() && !task.notifiedAt) {
        showAlarmPopup(task);
        new Notification("Routine reminder", { body: task.title + " is due now." });
        task.notifiedAt = Date.now();
        changed = true;
      }
    });
    if (changed) save();
  }

  /* ---------- data ---------- */
  var ICONS = { Study: "📘", Work: "💼", Health: "🏃", Personal: "🌿", Finance: "💳" };

  var SEED_TASKS = [
    { id: 1, title: "Wake up & freshen up", time: "05:30 AM",            cat: "Personal", prio: "med",  done: true  },
    { id: 2, title: "Study networking",     time: "09:00 – 10:00 AM",    cat: "Study",    prio: "high", done: true  },
    { id: 3, title: "College classes",      time: "11:00 AM – 01:00 PM", cat: "Study",    prio: "med",  done: true  },
    { id: 4, title: "Lunch break",          time: "01:00 – 02:00 PM",    cat: "Personal", prio: "low",  done: true  },
    { id: 5, title: "Finish assignment",    time: "03:00 – 04:30 PM",    cat: "Study",    prio: "high", done: false },
    { id: 6, title: "Workout / exercise",   time: "05:30 – 06:30 PM",    cat: "Health",   prio: "med",  done: false },
    { id: 7, title: "Read 20 pages",        time: "09:00 PM",            cat: "Personal", prio: "low",  done: true  },
    { id: 8, title: "Plan tomorrow",        time: "10:00 PM",            cat: "Work",     prio: "med",  done: true  }
  ];
  var SEED_REMS = [
    { id: 101, title: "College assignment", when: "Today · 07:00 PM",     cat: "Study",    done: true  },
    { id: 102, title: "Drink water",        when: "Every day · 10:00 AM", cat: "Health",   done: true  },
    { id: 103, title: "Call mom",           when: "Today · 07:00 AM",     cat: "Personal", done: false },
    { id: 104, title: "Pay internet bill",  when: "25 Sep · 09:00 AM",    cat: "Finance",  done: false },
    { id: 105, title: "Gym",                when: "25 Sep · 06:00 PM",    cat: "Health",   done: false }
  ];

  var tasks      = load("routine.tasks", SEED_TASKS);
  var rems       = load("routine.rems", SEED_REMS);
  var routines   = load("routine.routines", [
    { id: 1, name: "Morning routine", icon: "☀", done: 3, total: 4 },
    { id: 2, name: "Study block", icon: "📘", done: 2, total: 3 },
    { id: 3, name: "Evening wind-down", icon: "◐", done: 1, total: 3 }
  ]);
  var goals      = load("routine.goals", [
    { id: 1, title: "Complete daily tasks", progress: 75, target: 100, unit: "%" },
    { id: 2, title: "Keep a 7-day streak", progress: 5, target: 7, unit: "days" }
  ]);
  var settings   = load("routine.settings", { notifications: false, sound: true, vibration: true });
  var swRegistration = null;
  var remFilter  = "All";
  var priority   = "med";
  var calendarMode = "Week";

  var CHECK = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
              'stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';

  /* ---------- navigation ---------- */
  function go(id) {
    $$(".screen").forEach(function (s) { s.classList.toggle("active", s.id === id); });
    $$(".nav-inner button").forEach(function (b) { b.removeAttribute("aria-current"); });
    var nav = $('.nav-inner button[data-go="' + id + '"]');
    if (nav && !nav.classList.contains("fab")) nav.setAttribute("aria-current", "page");

    var el = $("#" + id);
    if (el) el.scrollTop = 0;
    if (id === "s-progress") drawProgress();
  }

  document.addEventListener("click", function (e) {
    if (e.target.closest("#focusOpen")) { $("#focusModal").hidden = false; resetFocus(); return; }
    if (e.target.closest("#focusClose")) { $("#focusModal").hidden = true; resetFocus(); return; }
    var navBtn = e.target.closest("[data-go]");
    if (navBtn) { go(navBtn.dataset.go); return; }

    var t = e.target.closest("[data-task]");
    if (t) {
      var task = tasks.filter(function (x) { return String(x.id) === t.dataset.task; })[0];
      if (task) { task.done = !task.done; save(); renderTasks(); }
      return;
    }
    var editTask = e.target.closest("[data-edit-task]");
    if (editTask) {
      var editable = tasks.filter(function (x) { return String(x.id) === editTask.dataset.editTask; })[0];
      if (editable) { var nextTitle = prompt("Edit task", editable.title); if (nextTitle && nextTitle.trim()) { editable.title = nextTitle.trim(); save(); renderTasks(); toast("Task updated"); } }
      return;
    }
    var deleteTask = e.target.closest("[data-delete-task]");
    if (deleteTask) {
      if (confirm("Delete this task?")) { tasks = tasks.filter(function (x) { return String(x.id) !== deleteTask.dataset.deleteTask; }); save(); renderTasks(); toast("Task deleted"); }
      return;
    }
    var r = e.target.closest("[data-rem]");
    if (r) {
      var rem = rems.filter(function (x) { return String(x.id) === r.dataset.rem; })[0];
      if (rem) { rem.done = !rem.done; save(); renderRems(); }
      return;
    }
    var routine = e.target.closest("[data-routine]");
    if (routine) {
      var item = routines.filter(function (x) { return String(x.id) === routine.dataset.routine; })[0];
      if (item) { item.done = item.done < item.total ? item.done + 1 : 0; save(); renderRoutines(); toast(item.name + " updated"); }
    }
  });

  /* ---------- segmented controls ---------- */
  $$(".seg").forEach(function (seg) {
    seg.addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      Array.prototype.forEach.call(seg.children, function (x) {
        x.setAttribute("aria-selected", String(x === b));
      });
      if (seg.id === "segRem") { remFilter = b.textContent.trim(); renderRems(); }
      if (seg.id === "segPlan") { calendarMode = b.textContent.trim(); renderCalendar(); }
    });
  });

  /* ---------- rendering ---------- */
  function setRing(sel, circumference, pct) {
    var el = $(sel);
    if (!el) return;
    requestAnimationFrame(function () {
      el.style.strokeDashoffset = circumference - circumference * pct / 100;
    });
  }

  function renderTasks() {
    $("#taskList").innerHTML = tasks.map(function (t) {
      return '<article class="glass task' + (t.done ? " done" : "") + '">' +
        '<i class="prio ' + t.prio + '"></i>' +
        '<span class="ico">' + (ICONS[t.cat] || "🌿") + '</span>' +
        '<span class="meta"><b>' + esc(t.title) + '</b><span>' + esc(t.time) + ' · ' + esc(t.cat) + (t.repeat && t.repeat !== "none" ? " · ↻ " + esc(t.repeat) : "") + '</span></span>' +
        '<button class="icon-btn task-edit" data-edit-task="' + t.id + '" aria-label="Edit ' + esc(t.title) + '">✎</button>' +
        '<button class="icon-btn task-delete" data-delete-task="' + t.id + '" aria-label="Delete ' + esc(t.title) + '">×</button>' +
        '<button class="check" data-task="' + t.id + '" aria-pressed="' + t.done +
        '" aria-label="Toggle ' + esc(t.title) + '">' + CHECK + '</button>' +
      '</article>';
    }).join("");

    var top = tasks.filter(function (t) { return t.prio !== "low"; }).slice(0, 3);
    $("#miniList").innerHTML = top.map(function (t) {
      return '<button class="' + (t.done ? "done" : "") + '" data-task="' + t.id + '">' +
        '<i class="check" style="pointer-events:none">' + CHECK + '</i>' +
        '<span>' + esc(t.title) + '</span>' +
        '<svg class="chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
        'stroke-width="2.4" stroke-linecap="round"><path d="m9 18 6-6-6-6"/></svg>' +
      '</button>';
    }).join("");

    var done  = tasks.filter(function (t) { return t.done; }).length;
    var total = tasks.length;
    var pct   = computeScore();

    $("#scoreVal").textContent  = pct + "%";
    $("#cDone").textContent     = done;
    $("#cPend").textContent     = total - done;
    $("#cMiss").textContent     = 0;
    $("#pDone").textContent     = done;
    $("#pPend").textContent     = total - done;
    $("#pMiss").textContent     = 0;
    $("#stDone").textContent    = done;
    $("#stPend").textContent    = total - done;
    $("#planCount").textContent = done + "/" + total;
    $("#leftCount").textContent = top.filter(function (t) { return !t.done; }).length + " left";

    setRing("#ringToday", 238.8, pct);
    setRing("#ringProf", 207, pct);
    $("#profileScoreVal").textContent = pct + "%";
    renderRoutines();
    renderGoals();
  }

  function computeScore() {
    var total = tasks.length, done = tasks.filter(function (t) { return t.done; }).length;
    var taskRate = total ? done / total : 0;
    var routineTotal = routines.reduce(function (sum, r) { return sum + r.total; }, 0);
    var routineDone = routines.reduce(function (sum, r) { return sum + r.done; }, 0);
    var routineRate = routineTotal ? routineDone / routineTotal : 0;
    var streakBonus = done >= Math.max(1, total * .75) ? 10 : 0;
    return Math.round(taskRate * 70 + routineRate * 20 + streakBonus);
  }

  function renderRoutines() {
    var wrap = $("#routineList");
    if (!wrap) return;
    wrap.innerHTML = routines.map(function (r) {
      var pct = r.total ? Math.round(r.done / r.total * 100) : 0;
      return '<button class="glass feature-item" data-routine="' + r.id + '"><span class="feature-icon">' + r.icon + '</span><span class="feature-copy"><b>' + esc(r.name) + '</b><small>' + r.done + '/' + r.total + ' steps complete</small></span><span class="feature-progress"><i style="width:' + pct + '%"></i></span></button>';
    }).join("");
  }

  function renderGoals() {
    var wrap = $("#goalList");
    if (!wrap) return;
    wrap.innerHTML = goals.map(function (g) {
      var pct = Math.min(100, Math.round(g.progress / g.target * 100));
      return '<div class="glass feature-item"><span class="feature-icon">◎</span><span class="feature-copy"><b>' + esc(g.title) + '</b><small>' + g.progress + '/' + g.target + ' ' + esc(g.unit) + '</small></span><span class="feature-progress"><i style="width:' + pct + '%"></i></span></div>';
    }).join("");
  }

  function renderRems() {
    var list = rems.filter(function (r) {
      if (remFilter === "Completed") return r.done;
      if (remFilter === "Upcoming")  return !r.done;
      return true;
    });
    $("#remList").innerHTML = list.length
      ? list.map(function (r) {
          return '<article class="glass task' + (r.done ? " done" : "") + '">' +
            '<span class="ico">' + (ICONS[r.cat] || "🔔") + '</span>' +
            '<span class="meta"><b>' + esc(r.title) + '</b><span>' + esc(r.when) + '</span></span>' +
            '<button class="check" data-rem="' + r.id + '" aria-pressed="' + r.done +
            '" aria-label="Toggle ' + esc(r.title) + '">' + CHECK + '</button>' +
          '</article>';
        }).join("")
      : '<p class="empty">Nothing here yet. Tap + to add a reminder.</p>';
  }

  function drawProgress() {
    var done = tasks.filter(function (t) { return t.done; }).length;
    var score = tasks.length ? Math.round(done / tasks.length * 100) : 0;
    setRing("#ringWeek", 490, score);
    $("#weekVal").textContent = score + "%";
    var names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    var hit   = [1, 1, 1, 1, 1, 0, 0];
    $("#streakDays").innerHTML = names.map(function (n, i) {
      return '<div class="' + (hit[i] ? "hit" : "") + '"><i>' + (hit[i] ? CHECK : "") + "</i>" + n + "</div>";
    }).join("");
    var vals = [score, Math.max(0, score - 8), Math.min(100, score + 6), Math.max(0, score - 4), score, Math.max(0, score - 20), Math.max(0, score - 30)];
    $("#bars").innerHTML = vals.map(function (v, i) {
      return '<div><i style="height:' + (v * 0.6) + 'px"></i>' + names[i].charAt(0) + "</div>";
    }).join("");
  }

  /* ---------- add task ---------- */
  $("#prioChips").addEventListener("click", function (e) {
    var b = e.target.closest(".chip");
    if (!b) return;
    priority = b.dataset.p;
    $$("#prioChips .chip").forEach(function (c) { c.setAttribute("aria-pressed", String(c === b)); });
  });

  function formatTime(v) {
    var parts = v.split(":");
    var h = Number(parts[0]), m = Number(parts[1]);
    var ap = h >= 12 ? "PM" : "AM";
    var hh = h % 12 || 12;
    return ("0" + hh).slice(-2) + ":" + ("0" + m).slice(-2) + " " + ap;
  }

  $("#saveTask").addEventListener("click", async function () {
    var title = $("#fTitle").value.trim();
    if (!title) { $("#fTitle").focus(); toast("Give the task a name first"); return; }
    var time = $("#fTime").value;
    var date = $("#fDate").value;
    var dueAt = date && time ? new Date(date + "T" + time).getTime() : null;
    tasks.push({
      id: Date.now(),
      title: title,
      prio: priority,
      cat: $("#fCat").value,
      done: false,
      time: time ? formatTime(time) : "Anytime",
      dueDate: date,
      dueAt: dueAt,
      repeat: $("#fRepeat").value,
      notes: $("#fNotes").value.trim()
    });
    save();
    renderTasks();
    $("#fTitle").value = "";
    $("#fNotes").value = "";
    $("#fRepeat").value = "none";
    scheduleTaskNotification(tasks[tasks.length - 1]);
    if (dueAt) {
      settings.notifications = await ensureNotificationPermission();
      $("#notifyToggle").checked = settings.notifications;
      save();
      scheduleTaskNotification(tasks[tasks.length - 1]);
      toast(settings.notifications ? "Task scheduled" : "Allow notifications to get the alarm");
    } else toast("Task added");
    go("s-planner");
  });

  /* ---------- week strip ---------- */
  (function buildWeek() {
    var names  = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    var today  = new Date();
    var dow    = (today.getDay() + 6) % 7;            // Monday-first index
    var monday = new Date(today);
    monday.setDate(today.getDate() - dow);

    $("#weekStrip").innerHTML = names.map(function (n, i) {
      var d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return "<button " + (i === dow ? 'aria-current="date"' : "") +
             "><i>" + n + "</i><em>" + d.getDate() + "</em></button>";
    }).join("");

    $("#weekStrip").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      $$("#weekStrip button").forEach(function (x) { x.removeAttribute("aria-current"); });
      b.setAttribute("aria-current", "date");
    });
  })();

  function renderCalendar() {
    var grid = $("#calendarGrid");
    if (!grid) return;
    var now = new Date(), day = now.getDay(), monday = new Date(now);
    monday.setDate(now.getDate() - ((day + 6) % 7));
    var dayCount = calendarMode === "Day" ? 1 : calendarMode === "Month" ? 30 : 7;
    $("#calendarTitle").textContent = calendarMode + " · " + now.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    grid.innerHTML = Array.from({ length: dayCount }, function (_, offset) {
      var d = new Date(monday); d.setDate(monday.getDate() + offset);
      var active = d.toDateString() === now.toDateString();
      var hasTasks = tasks.length && (offset < 5 || calendarMode === "Day");
      return '<button ' + (active ? 'aria-current="date"' : '') + '><span>' + d.toLocaleDateString(undefined, { weekday: "short" }) + '</span><b>' + d.getDate() + '</b><small>' + (hasTasks ? "•" : "") + '</small></button>';
    }).join("");
  }

  var focusTimer = null, focusSeconds = 25 * 60, focusRunning = false;
  function updateFocus() {
    var m = Math.floor(focusSeconds / 60), s = focusSeconds % 60;
    $("#focusTime").textContent = ("0" + m).slice(-2) + ":" + ("0" + s).slice(-2);
  }
  function toggleFocus() {
    focusRunning = !focusRunning;
    $("#focusStart").textContent = focusRunning ? "Pause" : "Start";
    $("#focusStatus").textContent = focusRunning ? "Stay with one thing." : "Paused when you need it.";
    if (focusRunning) focusTimer = setInterval(function () { if (focusSeconds > 0) { focusSeconds--; updateFocus(); } else { clearInterval(focusTimer); focusRunning = false; $("#focusStart").textContent = "Start"; $("#focusStatus").textContent = "Focus session complete."; toast("Focus session complete"); } }, 1000);
    else clearInterval(focusTimer);
  }
  function resetFocus() { clearInterval(focusTimer); focusRunning = false; focusSeconds = 25 * 60; updateFocus(); $("#focusStart").textContent = "Start"; $("#focusStatus").textContent = "Ready when you are."; }

  function addRoutine() {
    var name = prompt("Routine name", "New routine");
    if (!name) return;
    routines.push({ id: Date.now(), name: name, icon: "✦", done: 0, total: 3 }); save(); renderRoutines(); toast("Routine added");
  }
  function addGoal() {
    var title = prompt("Goal name", "New goal");
    if (!title) return;
    goals.push({ id: Date.now(), title: title, progress: 0, target: 7, unit: "days" }); save(); renderGoals(); toast("Goal added");
  }

  /* ---------- theme ---------- */
  $("#focusOpen").addEventListener("click", function () { $("#focusModal").hidden = false; resetFocus(); });
  $("#focusClose").addEventListener("click", function () { $("#focusModal").hidden = true; resetFocus(); });
  $("#focusStart").addEventListener("click", toggleFocus);
  $("#focusReset").addEventListener("click", resetFocus);
  $("#alarmDismiss").addEventListener("click", function () { $("#alarmModal").hidden = true; });
  $("#addRoutine").addEventListener("click", addRoutine);
  $("#addGoal").addEventListener("click", addGoal);
  renderCalendar();

  try {
    var stored = localStorage.getItem("routine.theme");
    if (stored) document.documentElement.setAttribute("data-theme", stored);
  } catch (e) {}

  $("#themeToggle").addEventListener("click", function () {
    var cur  = document.documentElement.getAttribute("data-theme");
    var next = cur === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("routine.theme", next); } catch (e) {}
    toast(next === "dark" ? "Dusk theme on" : "Sunrise theme on");
  });

  $("#notifyToggle").checked = !!settings.notifications;
  $("#soundToggle").checked = !!settings.sound;
  $("#vibrateToggle").checked = !!settings.vibration;
  ["notifyToggle", "soundToggle", "vibrateToggle"].forEach(function (id) {
    $("#" + id).addEventListener("change", async function () {
      settings.notifications = $("#notifyToggle").checked;
      settings.sound = $("#soundToggle").checked;
      settings.vibration = $("#vibrateToggle").checked;
      if (id === "notifyToggle" && settings.notifications && "Notification" in window) {
        settings.notifications = (await Notification.requestPermission()) === "granted";
        $("#notifyToggle").checked = settings.notifications;
      }
      save();
    });
  });
  $("#exportData").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify({ tasks: tasks, reminders: rems, routines: routines, goals: goals, settings: settings }, null, 2)], { type: "application/json" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "routine-backup.json"; a.click(); URL.revokeObjectURL(a.href); toast("Backup exported");
  });
  $("#importData").addEventListener("click", function () { $("#importFile").click(); });
  $("#importFile").addEventListener("change", function (e) {
    var file = e.target.files[0]; if (!file) return;
    var reader = new FileReader(); reader.onload = function () { try { var data = JSON.parse(reader.result); tasks = data.tasks || tasks; rems = data.reminders || rems; routines = data.routines || routines; goals = data.goals || goals; settings = data.settings || settings; save(); renderTasks(); renderRems(); toast("Backup restored"); } catch (err) { toast("Invalid backup"); } }; reader.readAsText(file);
  });

  /* ---------- toast ---------- */
  var toastTimer;
  function toast(msg) {
    var el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove("show"); }, 1800);
  }

  /* ---------- boot ---------- */
  $("#fDate").value = new Date().toISOString().slice(0, 10);
  renderTasks();
  renderRems();
  go("s-today");
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js?v=8").then(function (registration) {
      swRegistration = registration;
      return navigator.serviceWorker.ready;
    }).then(scheduleAllNotifications).catch(function () {});
  }
  checkFallbackNotifications();
  setInterval(checkFallbackNotifications, 30000);
  var openReminderKey = "routine.lastReminderNotice";
  var pendingReminders = rems.filter(function (r) { return !r.done; });
  try {
    if (settings.notifications && pendingReminders.length && "Notification" in window && Notification.permission === "granted" && localStorage.getItem(openReminderKey) !== new Date().toISOString().slice(0, 10)) {
      new Notification("Routine", { body: pendingReminders.length + " reminder" + (pendingReminders.length === 1 ? "" : "s") + " waiting for you." });
      localStorage.setItem(openReminderKey, new Date().toISOString().slice(0, 10));
    }
  } catch (e) {}
})();
