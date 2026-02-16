/* ===========================================================
   FRONTEND GLOBAL APP.JS
   ใช้ร่วมกันทุกหน้า
   =========================================================== */

import { API_BASE, FILE_BASE } from "./config.js";

/* ---------- 1. AUTH HELPERS ---------- */

export function getStudent() {
    return JSON.parse(localStorage.getItem("student"));
}

export function getTeacher() {
    const raw = localStorage.getItem("teacher");
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw);
        return parsed && parsed.teacher ? parsed.teacher : parsed;
    } catch {
        return null;
    }
}

export function getDirector() {
    const raw = localStorage.getItem("director");
    if (!raw) return null;

    try {
        const parsed = JSON.parse(raw);
        return parsed && parsed.director ? parsed.director : parsed;
    } catch {
        return null;
    }
}

export function requireLogin() {
    const student = getStudent();
    if (!student) {
        alert("กรุณาเข้าสู่ระบบ");
        window.location.href = "/frontend/pages/login.html";
    }
    return student;
}

/* ---------- 2. API CALLER ---------- */

async function api(path, options = {}) {
    const res = await fetch(API_BASE + path, {
        headers: { "Content-Type": "application/json", "Cache-Control": "no-cache" },
        cache: "no-store",
        ...options
    });
    return await res.json();
}

/* ---------- 3. REGISTRATION ---------- */

export async function searchSubject(keyword) {
    return await api(`/registration/search?keyword=${keyword}`);
}

export async function loadOpenSections(year, semester) {
    return await api(`/registration/sections?year=${year}&semester=${semester}`);
}

export async function addToCart(student_id, section_id, year, semester) {
    return await api(`/registration/add`, {
        method: "POST",
        body: JSON.stringify({ student_id, section_id, year, semester })
    });
}

export async function loadCart(student_id, year, semester) {
    return await api(`/registration/cart?student_id=${student_id}&year=${year}&semester=${semester}`);
}

export async function loadRegistered(student_id, year, semester) {
    return await api(`/registration/registered?student_id=${student_id}&year=${year}&semester=${semester}`);
}

export async function confirmRegistration(student_id, year, semester) {
    return await api(`/registration/confirm`, {
        method: "POST",
        body: JSON.stringify({ student_id, year, semester })
    });
}

export async function removeCartItem(id) {
    return await api(`/registration/remove/${id}`, { method: "DELETE" });
}

export async function browseOpenSections(year, semester, class_level, room) {
    return await api(`/registration/browse?year=${year}&semester=${semester}&class_level=${class_level}&room=${room}`);
}

/* ---------- 4. SCHEDULE ---------- */

export async function loadClassSchedule(student_id, year, semester) {
    return await api(`/schedule/class?student_id=${student_id}&year=${year}&semester=${semester}`);
}

export async function loadExamSchedule(student_id, year, semester) {
    return await api(`/schedule/exam?student_id=${student_id}&year=${year}&semester=${semester}`);
}

export async function loadAdvisor(student_id, year = null, semester = null) {
    const params = new URLSearchParams({ student_id });
    if (year && semester) {
        params.append("year", year);
        params.append("semester", semester);
    }
    return await api(`/student/advisor?${params.toString()}`);
}

/* ---------- 5. GRADES ---------- */

export async function loadGrades(student_id, year, semester) {
    return await api(`/grades?student_id=${student_id}&year=${year}&semester=${semester}`);
}

/* ---------- 6. HEALTH ---------- */

export async function getHealth(student_id) {
    const res = await fetch(`${API_BASE}/health?student_id=${student_id}`);
    return await res.json();
}

export async function updateHealth(data) {
    const res = await fetch(`${API_BASE}/health/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });

    return await res.json();
}

/* ---------- 7. CONDUCT ---------- */

export async function loadConductScore(student_id) {
    return await api(`/conduct/score?student_id=${student_id}`);
}

export async function loadConductHistory(student_id) {
    return await api(`/conduct/history?student_id=${student_id}`);
}

/* ---------- 8. ACTIVITIES ---------- */

export async function loadActivities() {
    return await api(`/activities`);
}

/* ---------- 9. EVALUATION ---------- */

export async function getCompetency(student_id, year, semester) {
    return await api(`/evaluation/competency?student_id=${student_id}&year=${year}&semester=${semester}`);
}

export async function getAdvisorEvaluation(student_id, year, semester) {
    return await api(`/student/advisor_evaluation?student_id=${student_id}&year=${year}&semester=${semester}`);
}

export async function getSubjectEvaluation(student_id, section_id, year, semester, subject_id = null) {
    const params = new URLSearchParams({
        student_id,
        section_id,
        year,
        semester
    });
    if (subject_id) params.append("subject_id", subject_id);
    return await api(`/student/subject_evaluation?${params.toString()}`);
}

export async function submitEvaluation(student_id, data, year, semester, section_id = null, feedback = "") {
    return await api(`/evaluation/submit`, {
        method: "POST",
        body: JSON.stringify({ student_id, data, year, semester, section_id, feedback })
    });
}

/* ---------- 10. UI HELPERS ---------- */

export function qs(selector) {
    return document.querySelector(selector);
}

export function qsa(selector) {
    return document.querySelectorAll(selector);
}

export function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add("is-open");
    document.body.classList.add("modal-open");
}

export function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove("is-open");
    if (!document.querySelector(".modal.is-open")) {
        document.body.classList.remove("modal-open");
    }
}

export async function loadComponent(url, containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;
    const res = await fetch(url);
    const html = await res.text();
    container.innerHTML = html;
}

export async function initSidebar(role) {
    const sidebarPlaceholder = document.getElementById("sidebar-placeholder");
    if (!sidebarPlaceholder) return;

    // Use absolute-like path from frontend root
    const pathPrefix = window.location.pathname.includes("/pages/") ? "../../component/" : "./component/";
    const url = `${pathPrefix}sidebar_${role}.html`;

    await loadComponent(url, "#sidebar-placeholder");

    // Auto-highlight active link
    const currentPath = window.location.pathname;
    const items = document.querySelectorAll(".menu-item");
    items.forEach(item => {
        const href = item.getAttribute("href");
        if (href && currentPath.endsWith(href)) {
            item.classList.add("active");
        } else {
            item.classList.remove("active");
        }
    });

    // Initialize avatar after sidebar is loaded
    initAvatar(role);
}

export function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString("th-TH");
}

/* ---------- 10. UI STATE HELPERS ---------- */

export function setState(container, type, text) {
    if (!container) return;
    container.innerHTML = `<div class="state-message ${type}">${text}</div>`;
}

export function clearFieldErrors(form) {
    if (!form) return;
    form.querySelectorAll(".field-error").forEach((el) => el.remove());
    form.querySelectorAll(".is-invalid").forEach((el) => el.classList.remove("is-invalid"));
}

export function setFieldError(input, message) {
    if (!input) return;
    input.classList.add("is-invalid");
    const msg = document.createElement("div");
    msg.className = "field-error";
    msg.textContent = message;
    input.parentNode.insertBefore(msg, input.nextSibling);
}

export function toFileUrl(path) {
    if (!path) return "";
    if (path.startsWith("http")) return path;
    return `${FILE_BASE}${path}`;
}

export async function uploadProfilePhoto(role, id, file) {
    const form = new FormData();
    form.append("role", role);
    form.append("id", String(id));
    form.append("photo", file);

    const res = await fetch(`${FILE_BASE}/api/upload/profile`, {
        method: "POST",
        body: form
    });
    return await res.json();
}

export function initAvatar(role) {
    const el = document.querySelector(`[data-avatar-role="${role}"]`);
    if (!el) return;

    let user = null;
    if (role === "teacher") user = getTeacher();
    if (role === "student") user = getStudent();
    if (role === "director") user = getDirector();
    if (user && user.photo_url) {
        el.innerHTML = `<img src="${toFileUrl(user.photo_url)}" alt="profile">`;
        el.classList.add("avatar-circle");
    }

    el.addEventListener("click", async () => {
        if (!user) return;
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = "image/*";
        fileInput.onchange = async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            if (!file.type.startsWith("image/")) {
                alert("กรุณาเลือกไฟล์รูปภาพ");
                return;
            }
            const result = await uploadProfilePhoto(role, user.id, file);
            if (result?.url) {
                el.innerHTML = `<img src="${toFileUrl(result.url)}" alt="profile">`;
                el.classList.add("avatar-circle");
                const key = role;
                const stored = JSON.parse(localStorage.getItem(key));
                if (stored) {
                    if (stored.teacher) stored.teacher.photo_url = result.url;
                    if (stored.student) stored.student.photo_url = result.url;
                    if (stored.director) stored.director.photo_url = result.url;
                    stored.photo_url = result.url;
                    localStorage.setItem(key, JSON.stringify(stored));
                }
                alert("อัปเดตรูปโปรไฟล์สำเร็จ");
            } else {
                alert(result?.error || "อัปโหลดรูปไม่สำเร็จ");
            }
        };
        fileInput.click();
    });
}

/* ---------- 11. LOGOUT ---------- */

export function logout() {
    localStorage.removeItem("student");
    window.location.href = `${window.location.origin}/frontend/pages/login.html`;
}

window.logout = logout;

export function requireTeacherLogin() {
    const teacher = getTeacher();
    if (!teacher) {
        window.location.href = "/frontend/pages/login.html";
        return;
    }
    return teacher;
}

export function requireDirectorLogin() {
    const director = getDirector();
    if (!director) {
        window.location.href = "/frontend/pages/login.html";
        return;
    }
    return director;
}

export function logoutTeacher() {
    localStorage.removeItem("teacher");
    window.location.href = `${window.location.origin}/frontend/pages/login.html`;
}

window.logoutTeacher = logoutTeacher;

export function logoutDirector() {
    localStorage.removeItem("director");
    window.location.href = `${window.location.origin}/frontend/pages/login.html`;
}

window.logoutDirector = logoutDirector;

document.addEventListener("DOMContentLoaded", async () => {
    if (getTeacher()) {
        document.body.classList.add("teacher-view");
        await initSidebar("teacher");
    } else if (getStudent()) {
        document.body.classList.add("student-view");
        await initSidebar("student");
    } else if (getDirector()) {
        document.body.classList.add("director-view");
        await initSidebar("director");
    }

    // Load student form component if placeholder exists
    const studentFormPlaceholder = document.getElementById("student-form-placeholder");
    if (studentFormPlaceholder) {
        const pathPrefix = window.location.pathname.includes("/pages/") ? "../../component/" : "./component/";
        await loadComponent(`${pathPrefix}student_form.html`, "#student-form-placeholder");
    }
});

document.addEventListener("click", (event) => {
    const closeBtn = event.target.closest("[data-modal-close]");
    if (!closeBtn) return;
    const modalId = closeBtn.getAttribute("data-modal-close");
    if (modalId) closeModal(modalId);
});

document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const openModalEl = document.querySelector(".modal.is-open");
    if (openModalEl) {
        openModalEl.classList.remove("is-open");
        if (!document.querySelector(".modal.is-open")) {
            document.body.classList.remove("modal-open");
        }
    }
});