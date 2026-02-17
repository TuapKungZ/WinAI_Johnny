import { requireTeacherLogin, qs, setState, clearFieldErrors, setFieldError, openModal, closeModal } from "./app.js";
import { API_BASE } from "./config.js";

let teacher = null;
let sectionList = [];
let selectedSection = null;
let useDemoData = false;

let currentHeaders = [];
let currentStudents = [];
let currentScores = new Map();

const demoSections = [
    { section_id: 501, subject_code: "SCI102", subject_name: "วิทยาศาสตร์พื้นฐาน", class_level: "ม.1", room: "1" },
    { section_id: 502, subject_code: "MATH101", subject_name: "คณิตศาสตร์พื้นฐาน", class_level: "ม.1", room: "1" },
    { section_id: 503, subject_code: "ENG102", subject_name: "ภาษาอังกฤษ", class_level: "ม.1", room: "1" },
    { section_id: 504, subject_code: "SOC101", subject_name: "สังคมศึกษา", class_level: "ม.1", room: "1" }
];

const demoHeaders = [
    { id: 1001, title: "งานที่ 1", max_score: 10 },
    { id: 1002, title: "งานที่ 2", max_score: 10 },
    { id: 1003, title: "งานที่ 3", max_score: 10 }
];

window.onload = async () => {
    teacher = requireTeacherLogin();

    await loadSubjects();

    qs("#subjectSelect").addEventListener("change", loadSectionInfo);
    qs("#levelSelect").addEventListener("change", () => updateRoomOptions());
    qs("#roomSelect").addEventListener("change", updateSectionSelection);
    qs("#loadHeadersBtn").addEventListener("click", loadHeaders);
    qs("#saveAllScoresBtn").addEventListener("click", saveAllScores);
    qs("#saveHeaderFormBtn").addEventListener("click", saveHeaderForm);
    qs("#openHeaderModalBtn").addEventListener("click", () => {
        qs("#editHeaderId").value = "";
        qs("#headerName").value = "";
        qs("#maxScore").value = "";
        qs("#headerModalTitle").textContent = "เพิ่มหัวข้อคะแนน";
        openModal("headerModal");
    });

    setState(qs("#scoreTableBox"), "empty", "กรุณาเลือกวิชาและห้องเรียนก่อน");
};

async function loadSubjects() {
    const box = qs("#subjectSelect");
    box.innerHTML = "<option value=''>กำลังโหลด...</option>";

    let subjects = [];
    try {
        const res = await fetch(`${API_BASE}/teacher/scores/subjects?teacher_id=${teacher.id}`);
        subjects = await res.json();
    } catch (err) {
        subjects = [];
    }

    if (!Array.isArray(subjects) || subjects.length === 0) {
        useDemoData = true;
        subjects = demoSections;
    }

    sectionList = subjects;
    box.innerHTML = "";

    // Group by unique subject_code + subject_name
    const seen = new Set();
    subjects.forEach((sec) => {
        const key = `${sec.subject_code}|${sec.subject_name}`;
        if (!seen.has(key)) {
            seen.add(key);
            box.innerHTML += `
                <option value="${key}">
                    ${sec.subject_code} - ${sec.subject_name}
                </option>
            `;
        }
    });

    if (subjects.length > 0) {
        loadSectionInfo();
    }
}

function loadSectionInfo() {
    const subjectKey = qs("#subjectSelect").value;
    if (!subjectKey) return;

    const [code, name] = subjectKey.split("|");
    const matching = sectionList.filter(
        (s) => s.subject_code === code && s.subject_name === name
    );

    // Populate level dropdown with unique levels for this subject
    const levelSelect = qs("#levelSelect");
    const roomSelect = qs("#roomSelect");

    const uniqueLevels = [...new Set(matching.map((s) => s.class_level))];
    levelSelect.innerHTML = "";
    uniqueLevels.forEach((lv) => {
        levelSelect.innerHTML += `<option value="${lv}">${lv}</option>`;
    });

    // Populate room dropdown based on selected level
    updateRoomOptions(matching);
}

function updateRoomOptions(matching) {
    if (!matching) {
        const subjectKey = qs("#subjectSelect").value;
        if (!subjectKey) return;
        const [code, name] = subjectKey.split("|");
        matching = sectionList.filter(
            (s) => s.subject_code === code && s.subject_name === name
        );
    }

    const level = qs("#levelSelect").value;
    const roomSelect = qs("#roomSelect");
    const filteredByLevel = matching.filter((s) => s.class_level === level);

    const uniqueRooms = [...new Set(filteredByLevel.map((s) => s.room))];
    roomSelect.innerHTML = "";
    uniqueRooms.forEach((rm) => {
        roomSelect.innerHTML += `<option value="${rm}">${rm}</option>`;
    });

    // Set selectedSection
    updateSectionSelection();
}

function updateSectionSelection() {
    const subjectKey = qs("#subjectSelect").value;
    if (!subjectKey) return;

    const [code, name] = subjectKey.split("|");
    const level = qs("#levelSelect").value;
    const room = qs("#roomSelect").value;

    const sec = sectionList.find(
        (s) => s.subject_code === code && s.subject_name === name &&
            String(s.class_level) === String(level) && String(s.room) === String(room)
    );

    selectedSection = sec ? sec.section_id : null;
}

async function loadHeaders() {
    const form = qs(".score-select-section");
    clearFieldErrors(form);
    if (!selectedSection) {
        setFieldError(qs("#subjectSelect"), "กรุณาเลือกวิชา");
        return;
    }

    if (useDemoData) {
        renderHeaders(demoHeaders);
        return;
    }

    setState(qs("#scoreTableBox"), "loading", "กำลังโหลดหัวข้อคะแนน...");
    const res = await fetch(`${API_BASE}/teacher/scores/headers?section_id=${selectedSection}`);
    const headers = await res.json();

    if (!Array.isArray(headers)) {
        headers = [];
    }

    renderHeaders(headers);
}

function renderHeaders(list) {
    currentHeaders = Array.isArray(list) ? list : [];
    if (currentHeaders.length === 0) {
        setState(qs("#scoreTableBox"), "empty", "ยังไม่มีหัวข้อคะแนน");
        return;
    }
    loadStudentsAndScores();
}

window.deleteHeader = async function (id) {
    if (!confirm("ต้องการลบหัวข้อคะแนนนี้หรือไม่?")) return;

    const res = await fetch(`${API_BASE}/teacher/scores/header_delete/${id}`, { method: "DELETE" });
    const data = await res.json();

    if (data.success) {
        loadHeaders();
    } else {
        alert("ลบไม่สำเร็จ");
    }
};

async function saveHeaderForm() {
    const id = qs("#editHeaderId").value;
    const name = qs("#headerName").value.trim();
    const maxScore = qs("#maxScore").value;
    const form = qs("#headerModal");
    clearFieldErrors(form);

    if (!selectedSection) {
        setFieldError(qs("#subjectSelect"), "กรุณาเลือกวิชา");
        return;
    }

    if (!name || !maxScore) {
        if (!name) setFieldError(qs("#headerName"), "กรุณากรอกชื่อหัวข้อคะแนน");
        if (!maxScore) setFieldError(qs("#maxScore"), "กรุณากรอกคะแนนเต็ม");
        return;
    }

    if (Number(maxScore) <= 0) {
        setFieldError(qs("#maxScore"), "คะแนนเต็มต้องมากกว่า 0");
        return;
    }

    const payload = {
        section_id: selectedSection,
        header_name: name, // For Add
        title: name,       // For Update (backend naming inconsistency handled here or uniform it)
        max_score: Number(maxScore)
    };

    try {
        let url, method;
        if (id) {
            // Update
            url = `${API_BASE}/teacher/scores/header_update/${id}`;
            method = "PUT";
        } else {
            // Add
            url = `${API_BASE}/teacher/scores/header_add`;
            method = "POST";
        }

        const res = await fetch(url, {
            method: method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error("Request failed");

        await loadHeaders();
        closeModal("headerModal");
    } catch (err) {
        console.error(err);
        alert("เกิดข้อผิดพลาดในการบันทึกหัวข้อคะแนน");
    }
}

async function loadStudentsAndScores() {
    setState(qs("#scoreTableBox"), "loading", "กำลังโหลดรายชื่อและคะแนน...");
    currentScores = new Map();
    currentStudents = [];

    if (useDemoData) {
        currentStudents = [
            { student_id: 101, student_code: "6501001", first_name: "เมฆ", last_name: "ทองดี" },
            { student_id: 102, student_code: "6501002", first_name: "น้ำฝน", last_name: "สดใส" },
            { student_id: 103, student_code: "6501003", first_name: "พีระ", last_name: "ศรีสุข" },
            { student_id: 104, student_code: "6501004", first_name: "ณัฐ", last_name: "ใจดี" }
        ];
        currentHeaders.forEach((h) => {
            const map = new Map();
            currentStudents.forEach((s) => {
                map.set(s.student_id, Math.floor(h.max_score * 0.6 + Math.random() * h.max_score * 0.3));
            });
            currentScores.set(h.id, map);
        });
        renderScoreTable();
        return;
    }

    try {
        const resStudents = await fetch(`${API_BASE}/teacher/scores/students?section_id=${selectedSection}`);
        const students = await resStudents.json();
        currentStudents = Array.isArray(students) ? students : [];
    } catch (err) {
        currentStudents = [];
    }

    if (currentStudents.length === 0) {
        setState(qs("#scoreTableBox"), "empty", "ไม่พบรายชื่อนักเรียน");
        return;
    }

    await Promise.all(
        currentHeaders.map(async (h) => {
            try {
                const res = await fetch(`${API_BASE}/teacher/scores/scores?header_id=${h.id}`);
                const rows = await res.json();
                const map = new Map();
                if (Array.isArray(rows)) {
                    rows.forEach((r) => {
                        map.set(Number(r.student_id), Number(r.score));
                    });
                }
                currentScores.set(h.id, map);
            } catch (err) {
                currentScores.set(h.id, new Map());
            }
        })
    );

    renderScoreTable();
}

function renderScoreTable() {
    const box = qs("#scoreTableBox");
    if (!currentStudents.length || !currentHeaders.length) {
        setState(box, "empty", "ยังไม่มีข้อมูลสำหรับตารางคะแนน");
        return;
    }

    let html = `
        <table class="score-table">
            <thead>
                <tr>
                    <th>รหัสนักเรียน</th>
                    <th>ชื่อ-นามสกุล</th>
                    ${currentHeaders.map((h) => `
                        <th style="position:relative;">
                            <div style="display:flex; align-items:center; justify-content:center; gap:6px;">
                                <span>${h.title}</span>
                                <button onclick="editHeader(${h.id})" title="แก้ไขหัวข้อ"
                                    style="background:none; border:none; color:#000; cursor:pointer; font-size:0.8em; padding:2px;">
                                    <i class="fas fa-pencil-alt"></i>
                                </button>
                                <button onclick="deleteHeader(${h.id})" title="ลบหัวข้อ"
                                    style="background:none; border:none; color:#000; cursor:pointer; font-size:0.8em; padding:2px;">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                            <div class="score-max">เต็ม ${h.max_score}</div>
                        </th>
                    `).join("")}
                    <th>คะแนนรวม</th>
                </tr>
            </thead>
            <tbody>
    `;

    currentStudents.forEach((s) => {
        const fullName = `${s.first_name || ""} ${s.last_name || ""}`.trim();
        html += `
            <tr data-student="${s.student_id}">
                <td>${s.student_code || "-"}</td>
                <td>${fullName || "-"}</td>
        `;

        let total = 0;
        currentHeaders.forEach((h) => {
            const map = currentScores.get(h.id) || new Map();
            const score = map.has(s.student_id) ? map.get(s.student_id) : "";
            const numericScore = score === "" ? 0 : Number(score);
            total += Number.isNaN(numericScore) ? 0 : numericScore;
            html += `
                <td>
                    <input
                        class="score-input"
                        type="number"
                        min="0"
                        max="${h.max_score}"
                        data-header="${h.id}"
                        data-student="${s.student_id}"
                        value="${score}"
                    />
                </td>
            `;
        });

        html += `<td class="score-total" data-student="${s.student_id}">${total}</td></tr>`;
    });

    html += "</tbody></table>";
    box.innerHTML = html;

    box.querySelectorAll(".score-input").forEach((input) => {
        input.addEventListener("input", () => {
            const row = input.closest("tr");
            if (!row) return;
            let sum = 0;
            row.querySelectorAll(".score-input").forEach((i) => {
                const val = Number(i.value);
                if (!Number.isNaN(val)) sum += val;
            });
            const totalCell = row.querySelector(".score-total");
            if (totalCell) totalCell.textContent = sum;
        });
    });
}

// แก้ไขหัวข้อคะแนน
// แก้ไขหัวข้อคะแนน
window.editHeader = function (id) {
    const header = currentHeaders.find((h) => h.id === id);
    if (!header) return;

    qs("#editHeaderId").value = header.id;
    qs("#headerName").value = header.title;
    qs("#maxScore").value = header.max_score;
    qs("#headerModalTitle").textContent = "แก้ไขหัวข้อคะแนน";

    openModal("headerModal");
};

async function saveAllScores() {
    if (!currentHeaders.length) {
        alert("ยังไม่มีหัวข้อคะแนน");
        return;
    }

    const inputs = Array.from(document.querySelectorAll(".score-input"));
    inputs.forEach((i) => i.classList.remove("is-invalid"));

    let hasInvalid = false;
    const payloadByHeader = new Map();

    inputs.forEach((input) => {
        const headerId = Number(input.dataset.header);
        const studentId = Number(input.dataset.student);
        const header = currentHeaders.find((h) => Number(h.id) === headerId);
        const max = header ? Number(header.max_score) : 100;
        const val = input.value === "" ? null : Number(input.value);

        if (val !== null && (Number.isNaN(val) || val < 0 || val > max)) {
            input.classList.add("is-invalid");
            hasInvalid = true;
            return;
        }

        if (!payloadByHeader.has(headerId)) payloadByHeader.set(headerId, []);
        payloadByHeader.get(headerId).push({
            student_id: studentId,
            score: val
        });
    });

    if (hasInvalid) {
        alert("กรุณากรอกคะแนนให้อยู่ในช่วงที่กำหนด");
        return;
    }

    try {
        for (const [headerId, scores] of payloadByHeader.entries()) {
            await fetch(`${API_BASE}/teacher/scores/save`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ header_id: headerId, scores })
            });
        }
        alert("บันทึกคะแนนเรียบร้อยแล้ว");
    } catch (err) {
        alert("เกิดข้อผิดพลาดในการบันทึกคะแนน");
    }
}
