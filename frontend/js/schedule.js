import {
    qs,
    requireLogin,
    loadClassSchedule,
    loadExamSchedule,
    loadAdvisor
} from "./app.js";

let student;
let examFilter = "all";

// ----------------------------
// เมื่อหน้าโหลด
// ----------------------------
window.onload = async () => {
    student = requireLogin();
    bindEvents();
    await refreshSchedule();
};

// ----------------------------
// ผูก event
// ----------------------------
function bindEvents() {

    qs("#btn-class").onclick = () => showTab("class");
    qs("#btn-exam").onclick = () => showTab("exam");
    qs("#btn-exam-all").onclick = () => setExamFilter("all");
    qs("#btn-exam-mid").onclick = () => setExamFilter("midterm");
    qs("#btn-exam-final").onclick = () => setExamFilter("final");

    qs("#yearSelect").addEventListener("change", refreshSchedule);
    qs("#termSelect").addEventListener("change", refreshSchedule);
}

// ----------------------------
// สลับแท็บ
// ----------------------------
function showTab(type) {

    if (type === "class") {
        qs("#btn-class").classList.add("active");
        qs("#btn-exam").classList.remove("active");

        qs("#classSection").style.display = "block";
        qs("#examSection").style.display = "none";
        qs("#examTypeTabs").style.display = "none";

    } else {
        qs("#btn-class").classList.remove("active");
        qs("#btn-exam").classList.add("active");

        qs("#classSection").style.display = "none";
        qs("#examSection").style.display = "block";
        qs("#examTypeTabs").style.display = "flex";
    }
}

// ----------------------------
// โหลดข้อมูลตารางเรียน + ตารางสอบ
// ----------------------------
async function refreshSchedule() {

    const year = qs("#yearSelect").value;
    const semester = qs("#termSelect").value;

    await loadClassTable(year, semester);
    await loadExamTable(year, semester);
    await loadAdvisorInfo(year, semester);
}

// ----------------------------
// ตารางเรียน
// ----------------------------
async function loadClassTable(year, semester) {

    const head = qs("#classGridHead");
    const body = qs("#classGridBody");
    head.innerHTML = "";
    body.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px;">กำลังโหลด...</td></tr>`;
    const rows = await loadClassSchedule(student.id, year, semester);
    const classCount = document.getElementById("classCount");
    if (classCount) classCount.textContent = rows.length;

    if (rows.length === 0) {
        body.innerHTML = `
            <tr><td colspan="8" style="text-align:center; padding:20px;">ไม่มีข้อมูลตารางเรียน</td></tr>`;
        return;
    }

    buildClassGrid(rows);
}

// ----------------------------
// ตารางสอบ
// ----------------------------
async function loadExamTable(year, semester) {

    const body = qs("#examListBody");
    body.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px;">กำลังโหลด...</td></tr>`;
    const rows = await loadExamSchedule(student.id, year, semester);
    const examCount = document.getElementById("examCount");
    if (examCount) examCount.textContent = rows.length;

    const filtered = filterExamRows(rows);
    if (filtered.length === 0) {
        body.innerHTML = `
            <tr><td colspan="5" style="text-align:center; padding:20px;">ยังไม่มีข้อมูล</td></tr>`;
        return;
    }

    buildExamList(filtered);
}

function setExamFilter(type) {
    examFilter = type;
    qs("#btn-exam-all").classList.toggle("active", type === "all");
    qs("#btn-exam-mid").classList.toggle("active", type === "midterm");
    qs("#btn-exam-final").classList.toggle("active", type === "final");
    refreshSchedule();
}

function filterExamRows(rows) {
    if (examFilter === "all") return rows;
    return rows.filter((r) => String(r.exam_type || "").toLowerCase() === examFilter);
}

function buildClassGrid(rows) {
    const head = qs("#classGridHead");
    const body = qs("#classGridBody");

    const fixedSlots = [
        "8:00-8:50",
        "9:00-9:50",
        "10:00-10:50",
        "11:00-11:50",
        "12:00-12:50",
        "13:00-13:50",
        "14:00-14:50",
        "15:00-15:50",
        "16:00-16:50"
    ];

    const timeSlots = fixedSlots;

    head.innerHTML = `
        <tr>
            <th>วัน/เวลา</th>
            ${timeSlots.map((t) => `<th>${t}</th>`).join("")}
        </tr>
    `;

    const byDay = {};
    rows.forEach((r) => {
        const day = normalizeDay(r.day_of_week || "-");
        if (!byDay[day]) byDay[day] = [];
        byDay[day].push(r);
    });

    const baseDays = ["จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"];
    const extraDays = Object.keys(byDay).filter((d) => !baseDays.includes(d));
    const dayOrder = baseDays.concat(extraDays);

    body.innerHTML = "";
    dayOrder.forEach((day) => {
        const dayRows = byDay[day] || [];
        const tr = document.createElement("tr");
        tr.innerHTML = `<th>${day}</th>`;

        timeSlots.forEach((slot) => {
            const matches = dayRows.filter((r) => slotMatch(r.time_range, slot));
            if (!matches.length) {
                tr.innerHTML += `<td></td>`;
                return;
            }

            const cellHtml = matches
                .map((r) => {
                    const code = r.subject_code || "-";
                    const name = r.subject_name || "";
                    const room = r.room || r.classroom || "";
                    const teacher = r.teacher ? `(${r.teacher})` : "";
                    return `
                        <div class="schedule-cell">
                            <span class="cell-code">${code}</span>
                            <div>${name} ${teacher}</div>
                            ${room ? `<div class="cell-room">ห้อง ${room}</div>` : ""}
                        </div>
                    `;
                })
                .join("");

            tr.innerHTML += `<td>${cellHtml}</td>`;
        });

        body.appendChild(tr);
    });
}

function buildExamList(rows) {
    const body = qs("#examListBody");
    const grouped = new Map();

    rows.forEach((r) => {
        const key = `${r.section_id || ""}-${r.subject_code || ""}`;
        if (!grouped.has(key)) {
            grouped.set(key, {
                subject_code: r.subject_code || "-",
                subject_name: r.subject_name || "-",
                group: r.class_level || r.room ? `${r.class_level || ""}${r.room ? "/" + r.room : ""}` : "-",
                midterm: null,
                final: null
            });
        }
        const record = grouped.get(key);
        if (String(r.exam_type).toLowerCase() === "midterm") {
            record.midterm = r;
        } else if (String(r.exam_type).toLowerCase() === "final") {
            record.final = r;
        }
    });

    body.innerHTML = "";
    Array.from(grouped.values()).forEach((item) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${item.subject_code}</td>
            <td style="text-align:left; padding-left:16px;">${item.subject_name}</td>
            <td class="center">${item.group || "-"}</td>
            <td class="center">${renderExamCell(item.midterm)}</td>
            <td class="center">${renderExamCell(item.final)}</td>
        `;
        body.appendChild(tr);
    });
}

function renderExamCell(exam) {
    if (!exam) return "-";
    const date = exam.exam_date ? formatThaiDate(exam.exam_date) : "-";
    const time = exam.time_range || "-";
    const room = exam.room ? `ห้อง ${exam.room}` : "-";
    return `
        <div>${date}</div>
        <div>${time}</div>
        <div class="cell-room">${room}</div>
    `;
}

function formatThaiDate(dateStr) {
    return new Date(dateStr).toLocaleDateString("th-TH", {
        year: "numeric",
        month: "short",
        day: "numeric"
    });
}

function toMinutes(timeRange) {
    if (!timeRange) return 0;
    const match = timeRange.match(/(\d{1,2}):(\d{2})/);
    if (!match) return 0;
    return Number(match[1]) * 60 + Number(match[2]);
}

function normalizeTime(timeRange) {
    if (!timeRange) return "";
    return timeRange.replace(/\s/g, "").replace("–", "-").replace("—", "-");
}

function parseRange(timeRange) {
    if (!timeRange) return null;
    const clean = normalizeTime(timeRange);
    const parts = clean.split("-");
    if (parts.length < 2) {
        const startOnly = toMinutes(parts[0]);
        if (!startOnly) return null;
        return { start: startOnly, end: startOnly + 50 };
    }
    const start = toMinutes(parts[0]);
    const end = toMinutes(parts[1]);
    if (!start || !end) return null;
    return { start, end };
}

function slotMatch(timeRange, slot) {
    const r = parseRange(timeRange);
    const s = parseRange(slot);
    if (!r || !s) return false;
    return r.start < s.end && r.end > s.start;
}

function normalizeDay(day) {
    const clean = String(day).trim();
    const map = {
        "Mon": "จันทร์",
        "Monday": "จันทร์",
        "จ.": "จันทร์",
        "จันทร์": "จันทร์",
        "Tue": "อังคาร",
        "Tuesday": "อังคาร",
        "อ.": "อังคาร",
        "อังคาร": "อังคาร",
        "Wed": "พุธ",
        "Wednesday": "พุธ",
        "พ.": "พุธ",
        "พุธ": "พุธ",
        "Thu": "พฤหัสบดี",
        "Thursday": "พฤหัสบดี",
        "พฤ.": "พฤหัสบดี",
        "พฤหัสบดี": "พฤหัสบดี",
        "Fri": "ศุกร์",
        "Friday": "ศุกร์",
        "ศ.": "ศุกร์",
        "ศุกร์": "ศุกร์",
        "Sat": "เสาร์",
        "Saturday": "เสาร์",
        "ส.": "เสาร์",
        "เสาร์": "เสาร์",
        "Sun": "อาทิตย์",
        "Sunday": "อาทิตย์",
        "อา.": "อาทิตย์",
        "อาทิตย์": "อาทิตย์"
    };
    return map[clean] || clean;
}


async function loadAdvisorInfo(year, semester) {
    const target = qs("#scheduleAdvisor");
    if (!target) return;
    const data = await loadAdvisor(student.id, year, semester);

    // Support both old {advisor: {...}} and new {advisors: [...]} formats
    const advisors = data.advisors || (data.advisor ? [data.advisor] : []);

    if (!advisors.length) {
        target.textContent = "-";
        return;
    }

    const names = advisors.map(adv =>
        `${adv.teacher_code || ""} ${adv.first_name || ""} ${adv.last_name || ""}`.trim()
    ).join("<br>");

    target.innerHTML = names || "-";
}

function dayFromDate(dateStr) {
    if (!dateStr) return "-";
    const d = new Date(dateStr);
    const idx = d.getDay();
    const days = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
    return days[idx] || "-";
}