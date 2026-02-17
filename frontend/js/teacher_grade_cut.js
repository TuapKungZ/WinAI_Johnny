import { API_BASE } from "./config.js";
import { requireTeacherLogin, qs, setState, clearFieldErrors, setFieldError } from "./app.js";

let teacher = null;
let sectionList = [];
let selectedSection = null;
let currentRows = [];
let saveGradesTimer = null;
let saveThresholdsTimer = null;

window.onload = async () => {
    teacher = requireTeacherLogin();

    await loadSubjects();

    qs("#subjectSelect").addEventListener("change", loadSectionInfo);
    qs("#levelSelect").addEventListener("change", () => updateRoomOptions());
    qs("#roomSelect").addEventListener("change", updateSectionSelection);
    qs("#studentSearchInput").addEventListener("input", filterTable);
    qs("#gradeA").addEventListener("input", handleThresholdChange);
    qs("#gradeBPlus").addEventListener("input", handleThresholdChange);
    qs("#gradeB").addEventListener("input", handleThresholdChange);
    qs("#gradeCPlus").addEventListener("input", handleThresholdChange);
    qs("#gradeC").addEventListener("input", handleThresholdChange);
    qs("#gradeDPlus").addEventListener("input", handleThresholdChange);
    qs("#gradeD").addEventListener("input", handleThresholdChange);
    qs("#gradeF").addEventListener("input", handleThresholdChange);
    qs("#loadScoreBtn").addEventListener("click", loadScoreTable);
    qs("#saveGradeBtn").addEventListener("click", () => {
        if (confirm("ยืนยันการบันทึกเกรดทั้งหมด?")) {
            saveGrades(false);
        }
    });
};

async function loadSubjects() {
    const box = qs("#subjectSelect");
    box.innerHTML = "<option value=''>กำลังโหลด...</option>";
    const res = await fetch(
        `${API_BASE}/teacher/scores/subjects?teacher_id=${teacher.id}`
    );
    sectionList = await res.json();

    box.innerHTML = "";

    if (!Array.isArray(sectionList) || sectionList.length === 0) {
        box.innerHTML = "<option value=''>ยังไม่มีวิชาที่สอน</option>";
        selectedSection = null;
        return;
    }

    // Group by unique subject_code + subject_name
    const seen = new Set();
    sectionList.forEach((sec) => {
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

    loadSectionInfo();
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

async function loadScoreTable() {
    const form = qs(".grade-controls");
    clearFieldErrors(form);
    if (!selectedSection) {
        setFieldError(qs("#subjectSelect"), "กรุณาเลือกวิชา");
        return;
    }
    await loadThresholds();
    setState(qs("#gradeTableContainer"), "loading", "กำลังโหลดคะแนนรวม...");
    const res = await fetch(
        `${API_BASE}/teacher/grade/scores?section_id=${selectedSection}`
    );

    const data = await res.json();
    currentRows = Array.isArray(data) ? data : [];
    renderScoreTable(currentRows);
}

function renderScoreTable(list) {
    if (!list || list.length === 0) {
        setState(qs("#gradeTableContainer"), "empty", "ไม่มีข้อมูลคะแนน");
        return;
    }
    let html = `
        <table class="grade-table">
            <tr>
                <th>รหัส</th>
                <th>ชื่อ - นามสกุล</th>
                <th>รวมคะแนน</th>
                <th>เกรด</th>
            </tr>
    `;

    list.forEach((stu) => {
        const totalScore = stu.total_score ?? 0;
        const grade = stu.saved_grade || calculateGrade(Number(totalScore));

        html += `
        <tr>
            <td>${stu.student_code}</td>
            <td>${stu.name}</td>
            <td>
                <input type="number" 
                       class="sum-input" 
                       data-id="${stu.student_id}" 
                       value="${totalScore}">
            </td>
            <td>
                <input type="text" 
                       class="grade-input" 
                       data-id="${stu.student_id}" 
                       value="${grade}">
            </td>
        </tr>`;
    });

    html += "</table>";

    qs("#gradeTableContainer").innerHTML = html;

    document.querySelectorAll(".sum-input").forEach((input) => {
        input.addEventListener("input", () => {
            const gradeInput = document.querySelector(`.grade-input[data-id="${input.dataset.id}"]`);
            if (gradeInput) gradeInput.value = calculateGrade(Number(input.value));
            queueAutoSaveGrades();
        });
    });

    document.querySelectorAll(".grade-input").forEach((input) => {
        input.addEventListener("input", () => {
            queueAutoSaveGrades();
        });
    });
}

async function loadThresholds() {
    try {
        const res = await fetch(`${API_BASE}/teacher/grade/thresholds?section_id=${selectedSection}`);
        const data = await res.json();
        qs("#gradeA").value = data.a ?? 80;
        qs("#gradeBPlus").value = data.b_plus ?? 75;
        qs("#gradeB").value = data.b ?? 70;
        qs("#gradeCPlus").value = data.c_plus ?? 65;
        qs("#gradeC").value = data.c ?? 60;
        qs("#gradeDPlus").value = data.d_plus ?? 55;
        qs("#gradeD").value = data.d ?? 50;
        qs("#gradeF").value = data.f ?? 30;
    } catch (err) {
        qs("#gradeA").value = 80;
        qs("#gradeBPlus").value = 75;
        qs("#gradeB").value = 70;
        qs("#gradeCPlus").value = 65;
        qs("#gradeC").value = 60;
        qs("#gradeDPlus").value = 55;
        qs("#gradeD").value = 50;
        qs("#gradeF").value = 30;
    }
}

function calculateGrade(score) {
    const a = Number(qs("#gradeA").value) || 0;
    const bPlus = Number(qs("#gradeBPlus").value) || 0;
    const b = Number(qs("#gradeB").value) || 0;
    const cPlus = Number(qs("#gradeCPlus").value) || 0;
    const c = Number(qs("#gradeC").value) || 0;
    const dPlus = Number(qs("#gradeDPlus").value) || 0;
    const d = Number(qs("#gradeD").value) || 0;
    if (score >= a) return "A";
    if (score >= bPlus) return "B+";
    if (score >= b) return "B";
    if (score >= cPlus) return "C+";
    if (score >= c) return "C";
    if (score >= dPlus) return "D+";
    if (score >= d) return "D";
    return "F";
}

function refreshGrades() {
    document.querySelectorAll(".sum-input").forEach((input) => {
        const gradeInput = document.querySelector(`.grade-input[data-id="${input.dataset.id}"]`);
        if (gradeInput) gradeInput.value = calculateGrade(Number(input.value));
    });
}

function handleThresholdChange() {
    refreshGrades();
    queueAutoSaveThresholds();
}

function queueAutoSaveThresholds() {
    if (!selectedSection) return;
    if (saveThresholdsTimer) clearTimeout(saveThresholdsTimer);
    saveThresholdsTimer = setTimeout(async () => {
        await saveThresholds();
    }, 700);
}

function queueAutoSaveGrades() {
    if (!selectedSection) return;
    if (saveGradesTimer) clearTimeout(saveGradesTimer);
    saveGradesTimer = setTimeout(async () => {
        await saveGrades(true);
    }, 900);
}

function filterTable() {
    const keyword = qs("#studentSearchInput").value.trim().toLowerCase();
    if (!keyword) {
        renderScoreTable(currentRows);
        return;
    }

    const filtered = currentRows.filter((s) => {
        const code = String(s.student_code || "").toLowerCase();
        const name = String(s.name || "").toLowerCase();
        return code.includes(keyword) || name.includes(keyword);
    });

    renderScoreTable(filtered);
}

async function saveGrades(silent = false) {
    const form = qs(".grade-controls");
    clearFieldErrors(form);
    if (!selectedSection) {
        setFieldError(qs("#subjectSelect"), "กรุณาเลือกวิชา");
        return;
    }

    // Try saving thresholds first, but don't block saving grades if it fails
    try {
        await saveThresholds();
    } catch (err) {
        console.warn("Failed to save thresholds:", err);
    }

    const sumInputs = document.querySelectorAll(".sum-input");
    const gradeInputs = document.querySelectorAll(".grade-input");

    const grades = [...sumInputs].map((s, i) => ({
        student_id: Number(s.dataset.id),
        total_score: Number(s.value),
        grade: gradeInputs[i].value
    }));

    const data = {
        section_id: selectedSection,
        grades
    };

    try {
        const res = await fetch(
            `${API_BASE}/teacher/grade/save`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data)
            }
        );

        if (!res.ok) {
            const text = await res.text();
            if (!silent) alert(text || "บันทึกเกรดไม่สำเร็จ");
            return;
        }

        const result = await res.json();
        if (result.success && !silent) {
            alert("บันทึกเกรดสำเร็จ");
        } else if (!result.success && !silent) {
            alert(result.error || "บันทึกเกรดไม่สำเร็จ");
        }
    } catch (err) {
        if (!silent) alert("บันทึกเกรดไม่สำเร็จ");
    }
}

async function saveThresholds() {
    const thresholds = {
        a: Number(qs("#gradeA").value),
        b_plus: Number(qs("#gradeBPlus").value),
        b: Number(qs("#gradeB").value),
        c_plus: Number(qs("#gradeCPlus").value),
        c: Number(qs("#gradeC").value),
        d_plus: Number(qs("#gradeDPlus").value),
        d: Number(qs("#gradeD").value),
        f: Number(qs("#gradeF").value)
    };

    await fetch(`${API_BASE}/teacher/grade/thresholds`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section_id: selectedSection, thresholds })
    });
}
