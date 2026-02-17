import { API_BASE } from "./config.js";
import { requireDirectorLogin, qs, setState } from "./app.js";

let countChart = null;

window.onload = async () => {
    requireDirectorLogin();
    setState(qs("#dirCountStudents"), "loading", "กำลังโหลดข้อมูล...");
    await Promise.all([loadSummary(), loadStudentCountChart(), loadActivities()]);
};

async function loadSummary() {
    try {
        const res = await fetch(`${API_BASE}/director/summary`);
        const data = await res.json();
        qs("#dirCountStudents").textContent = data.students ?? 0;
        qs("#dirCountTeachers").textContent = data.teachers ?? 0;
        qs("#dirCountSubjects").textContent = data.subjects ?? 0;
        qs("#dirCountActivities").textContent = data.activities ?? 0;
        const income = Number(data.income ?? 0);
        const expense = Number(data.expense ?? 0);
        const budget = income - expense;

        // Update new bottom section
        if (qs("#dirIncomeDisplay")) qs("#dirIncomeDisplay").textContent = income.toLocaleString("th-TH");
        if (qs("#dirExpenseDisplay")) qs("#dirExpenseDisplay").textContent = expense.toLocaleString("th-TH");

        const balanceEl = qs("#dirBalanceDisplay");
        if (balanceEl) {
            balanceEl.textContent = budget.toLocaleString("th-TH");
            if (budget < 0) {
                balanceEl.style.color = "#dc2626";
                balanceEl.parentElement.style.borderColor = "#dc2626";
                balanceEl.parentElement.style.background = "#fef2f2";
            } else {
                balanceEl.style.color = "#1d4ed8"; // Reset to blue
                balanceEl.parentElement.style.borderColor = "#3b82f6";
                balanceEl.parentElement.style.background = "#eff6ff";
            }
        }

    } catch (err) {
        console.error(err);
        qs("#dirCountStudents").textContent = "0";
        qs("#dirCountTeachers").textContent = "0";
        qs("#dirCountSubjects").textContent = "0";
        qs("#dirCountActivities").textContent = "0";
        if (qs("#dirIncomeDisplay")) qs("#dirIncomeDisplay").textContent = "0";
        if (qs("#dirExpenseDisplay")) qs("#dirExpenseDisplay").textContent = "0";
        if (qs("#dirBalanceDisplay")) qs("#dirBalanceDisplay").textContent = "0";
    }
}

async function loadStudentCountChart() {
    const canvas = qs("#dirStudentCountChart");
    const emptyText = qs("#dirStudentCountEmpty");
    if (!canvas) return;
    try {
        const res = await fetch(`${API_BASE}/director/reports/student-count`);
        const rows = await res.json();
        if (!window.Chart) return;

        const grouped = rows.reduce((acc, row) => {
            const key = row.class_level || "-";
            acc[key] = (acc[key] || 0) + Number(row.total || 0);
            return acc;
        }, {});

        const labels = Object.keys(grouped);
        const data = Object.values(grouped);
        if (!labels.length) {
            if (emptyText) emptyText.textContent = "ไม่มีข้อมูล";
            return;
        }

        if (countChart) countChart.destroy();
        countChart = new Chart(canvas.getContext("2d"), {
            type: "bar",
            data: {
                labels,
                datasets: [
                    {
                        label: "จำนวนนักเรียน",
                        data,
                        backgroundColor: "#0f766e",
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: "#eef2f3" } },
                    x: { grid: { display: false } }
                }
            }
        });
    } catch (err) {
        console.error(err);
        if (emptyText) emptyText.textContent = "โหลดข้อมูลไม่สำเร็จ";
    }
}

async function loadActivities() {
    const list = qs("#dirActivityList");
    if (!list) return;
    setState(list, "loading", "กำลังโหลดกิจกรรม...");
    try {
        const res = await fetch(`${API_BASE}/director/activities`);
        const rows = await res.json();
        if (!rows.length) {
            setState(list, "empty", "ยังไม่มีกิจกรรม");
            return;
        }

        list.innerHTML = "";
        rows.slice(0, 5).forEach((item) => {
            const date = item.date ? new Date(item.date).toLocaleDateString("th-TH") : "-";
            list.innerHTML += `
                <div class="director-list-item">
                    <strong>${item.name || "-"}</strong>
                    <span>${date}${item.location ? ` • ${item.location}` : ""}</span>
                </div>
            `;
        });
    } catch (err) {
        console.error(err);
        setState(list, "empty", "โหลดกิจกรรมไม่สำเร็จ");
    }
}
