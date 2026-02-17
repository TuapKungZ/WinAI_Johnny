import { requireDirectorLogin, qs, clearFieldErrors, setFieldError, openModal, closeModal } from "./app.js";
import { API_BASE, FILE_BASE } from "./config.js";

let subjects = [];
let teachers = [];
let sections = [];
let examList = [];

window.onload = async () => {
    requireDirectorLogin();
    qs("#openSectionModalBtn").addEventListener("click", () => {
        resetSectionForm();
        openModal("sectionModal");
    });
    qs("#searchSectionBtn").addEventListener("click", () => loadSections());
    qs("#saveSectionBtn").addEventListener("click", saveSection);
    qs("#resetSectionBtn").addEventListener("click", () => {
        resetSectionForm();
        closeModal("sectionModal");
    });
    await loadRefs();
    await loadSections();
    await loadExams();

    // EXAM EVENTS
    qs("#openExamModalBtn").addEventListener("click", () => openExamModal());
    qs("#saveExamBtn").addEventListener("click", saveExam);
    qs("#resetExamBtn").addEventListener("click", resetExamForm);
};

async function loadRefs() {
    const [subRes, teacherRes] = await Promise.all([
        fetch(`${API_BASE}/director/subjects`),
        fetch(`${API_BASE}/director/teachers`)
    ]);
    subjects = await subRes.json();
    teachers = await teacherRes.json();

    const subSelect = qs("#sectionSubject");
    const teacherSelect = qs("#sectionTeacher");
    subSelect.innerHTML = "";
    teacherSelect.innerHTML = "";
    subjects.forEach((s) => {
        subSelect.innerHTML += `<option value="${s.id}">${s.subject_code} - ${s.name}</option>`;
    });
    teachers.forEach((t) => {
        teacherSelect.innerHTML += `<option value="${t.id}">${t.teacher_code} - ${t.first_name || ""} ${t.last_name || ""}</option>`;
    });
}

async function loadSections() {
    const keyword = qs("#sectionSearch")?.value.trim() || "";
    const params = new URLSearchParams();
    if (keyword) params.set("search", keyword);
    const res = await fetch(`${API_BASE}/director/sections?${params.toString()}`);
    sections = await res.json();
    if (keyword) {
        const needle = keyword.toLowerCase();
        sections = sections.filter((s) =>
            String(s.subject_code || "").toLowerCase().includes(needle)
        );
    }
    renderSections();
}

function renderSections() {
    const body = qs("#sectionsBody");
    body.innerHTML = "";
    if (!sections.length) {
        body.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px;">ไม่มีข้อมูล</td></tr>`;
        return;
    }
    sections.forEach((s) => {
        body.innerHTML += `
            <tr>
                <td>${s.subject_code || "-"}</td>
                <td>${s.teacher_name || "-"}</td>
                <td>${s.year}/${s.semester}</td>
                <td>${s.class_level || "-"} / ${s.classroom || s.room || "-"}</td>
                <td>${s.day_of_week || "-"} ${s.time_range || ""}</td>
                <td>
                    <button class="btn-outline" onclick="editSection(${s.id})">แก้ไข</button>
                    <button class="btn-danger" onclick="deleteSection(${s.id})">ลบ</button>
                </td>
            </tr>
        `;
    });
}

window.editSection = function (id) {
    const s = sections.find((x) => x.id === id);
    if (!s) return;
    qs("#sectionId").value = s.id;
    qs("#sectionSubject").value = s.subject_id || "";
    qs("#sectionTeacher").value = s.teacher_id || "";
    qs("#sectionYear").value = s.year || 2568;
    qs("#sectionSemester").value = s.semester || 1;
    qs("#sectionLevel").value = s.class_level || "";
    qs("#sectionRoom").value = s.classroom || s.room || "";
    qs("#sectionDay").value = s.day_of_week || "";
    qs("#sectionTime").value = s.time_range || "";
    qs("#sectionClassroom").value = s.room || "";
    openModal("sectionModal");
};

window.deleteSection = async function (id) {
    if (!confirm("ต้องการลบตารางสอนนี้หรือไม่?")) return;
    await fetch(`${API_BASE}/director/sections/${id}`, { method: "DELETE" });
    loadSections();
};

async function saveSection() {
    clearFieldErrors(document.body);
    const id = qs("#sectionId").value;
    const payload = {
        subject_id: qs("#sectionSubject").value,
        teacher_id: qs("#sectionTeacher").value,
        year: Number(qs("#sectionYear").value),
        semester: Number(qs("#sectionSemester").value),
        class_level: qs("#sectionLevel").value.trim(),
        classroom: qs("#sectionRoom").value.trim(),
        day_of_week: qs("#sectionDay").value.trim(),
        time_range: qs("#sectionTime").value.trim(),
        room: qs("#sectionClassroom").value.trim()
    };

    if (!payload.subject_id || !payload.teacher_id) {
        if (!payload.subject_id) setFieldError(qs("#sectionSubject"), "กรุณาเลือกรายวิชา");
        if (!payload.teacher_id) setFieldError(qs("#sectionTeacher"), "กรุณาเลือกครูผู้สอน");
        return;
    }

    if (id) {
        await fetch(`${API_BASE}/director/sections/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
    } else {
        await fetch(`${API_BASE}/director/sections`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
    }
    resetSectionForm(); // Renamed resetForm to resetSectionForm
    loadSections();
    closeModal("sectionModal");
}

function resetSectionForm() { // Renamed resetForm to resetSectionForm
    qs("#sectionId").value = "";
    qs("#sectionSubject").value = ""; // Added to reset subject
    qs("#sectionTeacher").value = ""; // Added to reset teacher
    qs("#sectionYear").value = "2568"; // Added default year
    qs("#sectionSemester").value = "1"; // Added default semester
    qs("#sectionLevel").value = "";
    qs("#sectionRoom").value = "";
    qs("#sectionDay").value = "";
    qs("#sectionTime").value = "";
    qs("#sectionClassroom").value = "";
}

// --- EXAMS LOGIC ---

async function loadExams() {
    try {
        console.log("Fetching exams...");
        const res = await fetch(`${API_BASE}/director/exams`);
        if (!res.ok) {
            console.error("Fetch failed:", res.status, res.statusText);
            // alert("Fetch failed: " + res.status);
            return;
        }
        const data = await res.json();
        console.log("Exams loaded:", data.length);
        // alert("Exams loaded: " + data.length);
        examList = data;
        renderExams(data);
    } catch (err) {
        console.error("Error loading exams:", err);
        // alert("Error loading exams: " + err.message);
    }
}

function renderExams(list) {
    const tbody = qs("#examsBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    // Update count pill
    const pill = qs("#examCountPill");
    if (pill) pill.textContent = `${list.length} รายการ`;

    if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:#999;">
            <i class="fa-solid fa-inbox" style="font-size:2rem; display:block; margin-bottom:8px;"></i>
            ยังไม่มีรายการตารางสอบ
        </td></tr>`;
        return;
    }

    list.forEach((item, idx) => {
        const typeBadge = item.exam_type === 'midterm'
            ? '<span style="background:#e0f2fe; color:#0369a1; padding:3px 8px; border-radius:12px; font-size:0.8rem; font-weight:600; white-space:nowrap;">กลางภาค</span>'
            : '<span style="background:#fce7f3; color:#be185d; padding:3px 8px; border-radius:12px; font-size:0.8rem; font-weight:600; white-space:nowrap;">ปลายภาค</span>';

        const dateStr = item.exam_date
            ? new Date(item.exam_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
            : '-';

        const tr = document.createElement("tr");
        tr.style.verticalAlign = "middle";
        tr.innerHTML = `
            <td style="text-align:center; color:#999; font-weight:500;">${idx + 1}</td>
            <td style="overflow:hidden; text-overflow:ellipsis;">
                <strong>${item.subject_code || '-'}</strong><br>
                <span style="color:#666; font-size:0.85rem;">${item.subject_name || '-'}</span>
            </td>
            <td style="text-align:center; white-space:nowrap;">${item.class_level || '-'}/${item.classroom || '-'}</td>
            <td style="text-align:center;">${typeBadge}</td>
            <td style="text-align:center; white-space:nowrap;">${dateStr}</td>
            <td style="text-align:center; font-weight:500; white-space:nowrap;">${item.time_range || '-'}</td>
            <td style="text-align:center;">${item.room || '-'}</td>
            <td style="text-align:center; white-space:nowrap;">
                <button class="btn-outline" style="padding:4px 8px; font-size:0.8rem;" onclick="window.editExam(${item.id})"><i class="fa-solid fa-pen-to-square"></i> แก้ไข</button>
                <button class="btn-danger" style="padding:4px 8px; font-size:0.8rem;" onclick="window.deleteExam(${item.id})"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function openExamModal(exam = null) {
    resetExamForm();

    // Populate Section Select — show only unique subject+class combinations
    const select = qs("#examSectionSelect");
    select.innerHTML = '<option value="">-- เลือกรายวิชา --</option>';

    if (typeof sections !== 'undefined') {
        const seen = new Set();
        sections.forEach(s => {
            const key = `${s.subject_code}_${s.class_level}_${s.classroom || ''}`;
            if (seen.has(key)) return;
            seen.add(key);
            const opt = document.createElement("option");
            opt.value = s.id;
            opt.textContent = `${s.subject_code} (${s.class_level}/${s.classroom || '?'}) ${s.subject_name}`;
            select.appendChild(opt);
        });
    }

    if (exam) {
        qs("#examId").value = exam.id;
        qs("#examSectionSelect").value = exam.section_id;
        qs("#examType").value = exam.exam_type;
        qs("#examDate").value = exam.exam_date ? exam.exam_date.split('T')[0] : '';
        qs("#examTimeRange").value = exam.time_range;
        qs("#examRoom").value = exam.room;
    }

    openModal("examModal");
}

function resetExamForm() {
    qs("#examId").value = "";
    qs("#examSectionSelect").value = "";
    qs("#examType").value = "midterm";
    qs("#examDate").value = "";
    qs("#examTimeRange").value = "";
    qs("#examRoom").value = "";
}

async function saveExam() {
    const id = qs("#examId").value;
    const body = {
        section_id: qs("#examSectionSelect").value,
        exam_type: qs("#examType").value,
        exam_date: qs("#examDate").value,
        time_range: qs("#examTimeRange").value,
        room: qs("#examRoom").value
    };

    if (!body.section_id || !body.exam_date) {
        alert("กรุณากรอกข้อมูลให้ครบ");
        return;
    }

    try {
        const method = id ? "PUT" : "POST";
        const url = id ? `${API_BASE}/director/exams/${id}` : `${API_BASE}/director/exams`;

        const res = await fetch(url, {
            method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });

        const json = await res.json();
        if (json.success || json.id) {
            closeModal("examModal");
            loadExams();
        } else {
            alert(json.error || "บันทึกไม่สำเร็จ");
        }
    } catch (err) {
        console.error(err);
        alert("Server Error");
    }
}

window.editExam = function (id) {
    const exam = examList.find(x => x.id == id);
    if (exam) openExamModal(exam);
};

window.deleteExam = async function (id) {
    if (!confirm("ต้องการลบตารางสอบนี้หรือไม่?")) return;
    try {
        await fetch(`${API_BASE}/director/exams/${id}`, { method: "DELETE" });
        loadExams();
    } catch (err) {
        console.error(err);
    }
};
