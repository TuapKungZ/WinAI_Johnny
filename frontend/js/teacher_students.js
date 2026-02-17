import { requireTeacherLogin, qs, toFileUrl, setState } from "./app.js";
import { API_BASE, FILE_BASE } from "./config.js";

let teacher = null;

window.onload = async () => {
    teacher = requireTeacherLogin();
    loadStudentList();
};

async function loadStudentList() {
    setState(qs("#classInfo"), "loading", "กำลังโหลดข้อมูลห้องเรียน...");
    setState(qs("#studentList"), "loading", "กำลังโหลดรายชื่อนักเรียน...");

    // Fetch advisees directly
    const res = await fetch(
        `${API_BASE}/teacher/students/list?teacher_id=${teacher.id}`
    );

    const data = await res.json();
    const students = Array.isArray(data) ? data : (data.students || []);

    if (!Array.isArray(data)) {
        qs("#classInfo").innerHTML = `
            <h2>ชั้นเรียน: ${data.level} / ห้อง ${data.room}</h2>
        `;
    }

    if (students.length === 0) {
        if (!Array.isArray(data)) {
            qs("#classInfo").innerHTML = `
                <h2>ชั้นเรียน: ${data.level} / ห้อง ${data.room}</h2>
                <p style="margin:6px 0 0; color:#7a6f63;">ไม่มีนักเรียนในที่ปรึกษา</p>
            `;
        } else {
            qs("#classInfo").innerHTML = `
                <h2>ยังไม่ได้เป็นที่ปรึกษาห้องใด</h2>
            `;
        }
        setState(qs("#studentList"), "empty", "ไม่มีรายชื่อนักเรียน");
        return;
    }

    renderStudents(students);
}

function renderStudents(list) {
    const box = qs("#studentList");
    box.innerHTML = "";

    list.forEach((s) => {
        const img = s.photo_url
            ? `<img src="${toFileUrl(s.photo_url)}" alt="student">`
            : `<i class="fa-solid fa-user"></i>`;
        box.innerHTML += `
            <div class="student-card">
                <div class="avatar">${img}</div>
                <div class="info">
                    <h3>${s.first_name} ${s.last_name}</h3>
                    <p>รหัส: ${s.student_code}</p>
                </div>
                <button class="btn-outline" onclick="openStudent(${s.id})">
                    ดูโปรไฟล์
                </button>
            </div>
        `;
    });
}

window.openStudent = function (id) {
    window.location.href = `student_profile.html?id=${id}`;
};
