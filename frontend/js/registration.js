import {
    qs,
    requireLogin,
    clearFieldErrors,
    setFieldError,
    setState,
    searchSubject,
    loadOpenSections,
    addToCart,
    loadCart,
    loadRegistered,
    confirmRegistration,
    removeCartItem,
    loadAdvisor,
    browseOpenSections,
    openModal
} from "./app.js";

let student;

window.onload = async () => {
    student = requireLogin();
    bindEvents();
    updateHero();
    await updateAdvisor();
    await loadCartTable();
};

function bindEvents() {
    qs("#btnSearch").addEventListener("click", searchHandler);
    qs("#btnBrowse").addEventListener("click", browseSubjects);

    // Search on Enter key
    qs("#subjectSearch").addEventListener("keydown", (e) => {
        if (e.key === "Enter") searchHandler();
    });

    qs("#regYear").addEventListener("change", () => {
        updateHero();
        updateAdvisor();
        loadCartTable();
        browseSubjects();
    });
    qs("#regSemester").addEventListener("change", () => {
        updateHero();
        updateAdvisor();
        loadCartTable();
        browseSubjects();
    });

    const confirmBtn = qs("#confirmRegistrationBtn");
    if (confirmBtn) confirmBtn.addEventListener("click", confirmCart);
}


async function updateAdvisor() {
    const target = document.getElementById("regHeroAdvisor");
    if (!target) return;
    const year = qs("#regYear").value;
    const semester = qs("#regSemester").value;
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

function updateHero(count = null) {
    const year = qs("#regYear").value;
    const semester = qs("#regSemester").value;
    const heroYear = document.getElementById("regHeroYear");
    const heroTerm = document.getElementById("regHeroTerm");
    const heroCount = document.getElementById("regHeroCount");

    if (heroYear) heroYear.textContent = year;
    if (heroTerm) heroTerm.textContent = semester;
    if (heroCount && count !== null) heroCount.textContent = count;
}

// ดูรายวิชาทั้งหมดที่เปิดสอนในเทอมนี้
async function browseSubjects() {
    const year = qs("#regYear").value;
    const semester = qs("#regSemester").value;
    const modalList = qs("#browseModalList");

    // Clear search input when browsing
    qs("#subjectSearch").value = "";

    // Open modal immediately with loading state
    openModal("browseModal");
    modalList.innerHTML = `<div class="center" style="padding:20px;">กำลังโหลดรายวิชาที่เปิดสอน...</div>`;

    try {
        const subjects = await browseOpenSections(year, semester, student.class_level, student.room);

        if (!subjects || subjects.length === 0) {
            modalList.innerHTML = `
                <div style="background:#fff9e6; border:1px dashed #f0ad4e; padding:15px; border-radius:8px; text-align:center; color:#8a6d3b;">
                    <i class="fas fa-info-circle"></i>
                    ไม่พบรายวิชาที่เปิดสอนในปี/เทอม/ระดับชั้นของคุณ
                </div>`;
            return;
        }

        renderSubjectList(subjects, modalList);
    } catch (err) {
        modalList.innerHTML = `
            <div style="background:#fff0f0; border:1px dashed #e74c3c; padding:15px; border-radius:8px; text-align:center;">
                <i class="fas fa-exclamation-circle" style="color:#e74c3c;"></i>
                เกิดข้อผิดพลาดในการโหลดรายวิชา
            </div>`;
    }
}

// ค้นหารายวิชา
async function searchHandler() {
    const keyword = qs("#subjectSearch").value.trim();
    const searchResult = qs("#searchResult");
    clearFieldErrors(document.body);

    if (!keyword) {
        // If empty, browse all (in modal)
        await browseSubjects();
        return;
    }

    setState(searchResult, "loading", "กำลังค้นหารายวิชา...");

    // Search from browse results (filtered by student's class)
    const year = qs("#regYear").value;
    const semester = qs("#regSemester").value;

    try {
        const allSubjects = await browseOpenSections(year, semester, student.class_level, student.room);
        const lowerKeyword = keyword.toLowerCase();

        const found = allSubjects.filter(s =>
            s.subject_code.toLowerCase().includes(lowerKeyword) ||
            s.subject_name.toLowerCase().includes(lowerKeyword)
        );

        if (found.length === 0) {
            searchResult.innerHTML = `
                <div style="background:#fff0f0; border:1px dashed #e74c3c; padding:15px; border-radius:8px; text-align:center;">
                    <i class="fas fa-exclamation-circle" style="color:#e74c3c;"></i>
                    ไม่พบรายวิชาที่ตรงกับ "<strong>${keyword}</strong>"
                </div>`;
            return;
        }

        renderSubjectList(found, searchResult);
    } catch (err) {
        searchResult.innerHTML = `
            <div style="background:#fff0f0; border:1px dashed #e74c3c; padding:15px; border-radius:8px; text-align:center;">
                <i class="fas fa-exclamation-circle" style="color:#e74c3c;"></i>
                เกิดข้อผิดพลาดในการค้นหา
            </div>`;
    }
}

// แสดงรายการวิชา
function renderSubjectList(subjects, container) {
    if (!container) return;

    const cards = subjects.map(subj => {
        const scheduleInfo = subj.schedules && subj.schedules.length > 0
            ? subj.schedules.map(sch => {
                const day = sch.day_of_week || "-";
                const time = sch.time_range || "-";
                return `<span class="schedule-badge">${day} ${time}</span>`;
            }).join(" ")
            : '<span style="color:#999;">ยังไม่กำหนดเวลา</span>';

        const teacherInfo = subj.teacher_name ? `<span style="color:#555;"><i class="fas fa-user-tie"></i> ${subj.teacher_name}</span>` : "";

        return `
            <div class="student-activity-card" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap: wrap; gap: 10px;">
                <div style="flex:1; min-width: 200px;">
                    <h4 style="margin:0 0 4px 0;">${subj.subject_code} — ${subj.subject_name}</h4>
                    <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; font-size:0.9em;">
                        <span><strong>หน่วยกิต:</strong> ${subj.credit}</span>
                        ${teacherInfo}
                    </div>
                    <div style="margin-top:4px; display:flex; flex-wrap:wrap; gap:4px;">
                        ${scheduleInfo}
                    </div>
                </div>
                <button class="btn-primary" onclick="selectSubject(${subj.subject_id}, ${subj.section_id})" style="white-space:nowrap; margin-left:auto;">
                    <i class="fa-solid fa-cart-plus"></i> เลือก
                </button>
            </div>
        `;
    }).join("");

    container.innerHTML = `
        <div style="margin-bottom:8px; color:#666; font-size:0.9em;">
            <i class="fas fa-list"></i> พบ ${subjects.length} รายวิชา
        </div>
        ${cards}
    `;
}

// เลือกวิชาแล้วเข้าตะกร้า
window.selectSubject = async (subject_id, section_id) => {
    const year = qs("#regYear").value;
    const semester = qs("#regSemester").value;

    try {
        await addToCart(student.id, section_id, year, semester);
        await loadCartTable();

        // Scroll to cart
        const cartSection = document.getElementById("cartSection");
        if (cartSection) cartSection.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
        alert("เกิดข้อผิดพลาดในการเพิ่มวิชา");
    }
};

// โหลดตะกร้า
async function loadCartTable() {
    const year = qs("#regYear").value;
    const semester = qs("#regSemester").value;
    const tbody = qs("#cartItems");

    tbody.innerHTML = `
        <tr>
            <td colspan="5" class="center">กำลังโหลดตะกร้า...</td>
        </tr>`;

    const items = await loadCart(student.id, year, semester);

    // Group items by subject_code
    const grouped = {};
    items.forEach(item => {
        const key = item.subject_code;
        if (!grouped[key]) {
            grouped[key] = {
                ...item,
                ids: [item.id],
                times: []
            };
        } else {
            grouped[key].ids.push(item.id);
        }
        // Only add time entry if day or time exist
        const day = item.day_of_week || "";
        const time = item.time_range || "";
        if (day || time) {
            grouped[key].times.push(`${day} ${time}`.trim());
        }
    });

    const groupedItems = Object.values(grouped);
    updateHero(groupedItems.length);

    if (groupedItems.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="center">ยังไม่มีรายวิชาในตะกร้า</td>
            </tr>`;
    } else {
        tbody.innerHTML = "";
        groupedItems.forEach(item => {
            const tr = document.createElement("tr");
            const timeDisplay = item.times.length > 0 ? item.times.join("<br>") : "-";
            // Store all IDs in data attribute for deletion
            const idsStr = JSON.stringify(item.ids);

            tr.innerHTML = `
                <td>${item.subject_code}</td>
                <td style="text-align:left;">${item.subject_name}</td>
                <td class="center">${item.credit}</td>
                <td>${timeDisplay}</td>
                <td class="center">
                    <button class="btn-icon delete" onclick='removeItem(${idsStr})'>
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    await loadRegisteredTable();
}

// รายวิชาที่บันทึกแล้ว
async function loadRegisteredTable() {
    const year = qs("#regYear").value;
    const semester = qs("#regSemester").value;
    const tbody = qs("#registeredItems");
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="5" class="center">กำลังโหลด...</td>
        </tr>`;

    const items = await loadRegistered(student.id, year, semester);
    if (!items.length) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="center">ยังไม่มีรายวิชาที่บันทึกแล้ว</td>
            </tr>`;
        return;
    }

    // Group items by subject_code
    const grouped = {};
    items.forEach(item => {
        const key = item.subject_code;
        if (!grouped[key]) {
            grouped[key] = {
                ...item,
                ids: [item.id],
                times: []
            };
        } else {
            grouped[key].ids.push(item.id);
        }
        const day = item.day_of_week || "";
        const time = item.time_range || "";
        if (day || time) {
            grouped[key].times.push(`${day} ${time}`.trim());
        }
    });

    tbody.innerHTML = "";
    Object.values(grouped).forEach(item => {
        const tr = document.createElement("tr");
        const timeDisplay = item.times.length > 0 ? item.times.join("<br>") : "-";
        const idsStr = JSON.stringify(item.ids);

        tr.innerHTML = `
            <td>${item.subject_code}</td>
            <td style="text-align:left;">${item.subject_name}</td>
            <td class="center">${item.credit}</td>
            <td>${timeDisplay}</td>
            <td class="center">
                <button class="btn-icon delete" onclick='removeRegisteredItem(${idsStr})'>
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// ลบออกจากตะกร้า (รองรับการลบหลาย ID พร้อมกัน)
window.removeItem = async (ids) => {
    // If passed a single number (backward compatibility), wrap in array
    const idList = Array.isArray(ids) ? ids : [ids];

    const ok = confirm("ต้องการลบวิชานี้ออกจากตะกร้าหรือไม่?");
    if (!ok) return;

    for (const id of idList) {
        await removeCartItem(id);
    }
    await loadCartTable();
};

// บันทึกรายวิชาในตะกร้า
async function confirmCart() {
    const year = qs("#regYear").value;
    const semester = qs("#regSemester").value;
    const ok = confirm("ยืนยันบันทึกรายวิชาที่เลือกทั้งหมดหรือไม่?");
    if (!ok) return;
    await confirmRegistration(student.id, year, semester);
    await loadCartTable();
}

// ลบออกจากวิชาที่บันทึกแล้ว (สำหรับทดสอบ)
window.removeRegisteredItem = async (ids) => {
    const idList = Array.isArray(ids) ? ids : [ids];
    const ok = confirm("ต้องการลบวิชานี้ออกจากรายการที่บันทึกแล้วหรือไม่? (ใช้สำหรับทดสอบระบบ)");
    if (!ok) return;

    for (const id of idList) {
        await removeCartItem(id);
    }
    await loadCartTable();
};
