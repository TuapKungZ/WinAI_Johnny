import { requireDirectorLogin, qs, setState, clearFieldErrors, setFieldError, openModal, closeModal } from "./app.js";
import { API_BASE, FILE_BASE } from "./config.js";

let financeList = [];

window.onload = async () => {
    requireDirectorLogin();
    qs("#openFinanceModalBtn").addEventListener("click", () => {
        resetForm();
        openModal("financeModal");
    });
    qs("#saveFinanceBtn").addEventListener("click", saveFinance);
    qs("#resetFinanceBtn").addEventListener("click", () => {
        resetForm();
        closeModal("financeModal");
    });
    await loadFinance();
};

async function loadFinance() {
    setState(qs("#financeBody"), "loading", "กำลังโหลดข้อมูล...");
    const res = await fetch(`${API_BASE}/director/finance`);
    financeList = await res.json();
    renderFinance();
}

function renderFinance() {
    const body = qs("#financeBody");
    body.innerHTML = "";

    if (!financeList.length) {
        body.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px;">ไม่มีข้อมูล</td></tr>`;
        updateSummary(0, 0);
        return;
    }

    let income = 0;
    let expense = 0;

    financeList.forEach((item) => {
        const amount = Number(item.amount || 0);
        const type = String(item.type || "").trim().toLowerCase();

        // Check for both English and Thai values
        const isIncome = type === "income" || type === "รายรับ";
        const isExpense = type === "expense" || type === "รายจ่าย";

        if (isIncome) income += amount;
        if (isExpense) expense += amount;

        body.innerHTML += `
            <tr>
                <td>${item.title || "-"}</td>
                <td>${item.category || "-"}</td>
                <td class="${isIncome ? 'text-success' : 'text-danger'}">
                    ${isIncome ? "รายรับ" : (isExpense ? "รายจ่าย" : item.type)}
                </td>
                <td>${formatDate(item.record_date)}</td>
                <td>${formatAmount(amount)}</td>
                <td>
                    <button class="btn-outline" onclick="editFinance(${item.id})">แก้ไข</button>
                    <button class="btn-danger" onclick="deleteFinance(${item.id})">ลบ</button>
                </td>
            </tr>
        `;
    });

    updateSummary(income, expense);
}

function updateSummary(income, expense) {
    qs("#financeIncome").textContent = formatAmount(income);
    qs("#financeExpense").textContent = formatAmount(expense);
    qs("#financeBalance").textContent = formatAmount(income - expense);
}

function formatAmount(value) {
    return Number(value || 0).toLocaleString("th-TH", { minimumFractionDigits: 0 });
}

function formatDate(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("th-TH");
}

window.editFinance = function (id) {
    const item = financeList.find((x) => x.id === id);
    if (!item) return;
    qs("#financeId").value = item.id;
    qs("#financeTitle").value = item.title || "";
    qs("#financeCategory").value = item.category || "";
    qs("#financeAmount").value = item.amount || "";
    qs("#financeType").value = item.type || "income";
    qs("#financeDate").value = item.record_date ? item.record_date.slice(0, 10) : "";
    qs("#financeNote").value = item.note || "";
    openModal("financeModal");
};

window.deleteFinance = async function (id) {
    if (!confirm("ต้องการลบรายการนี้หรือไม่?")) return;
    await fetch(`${API_BASE}/director/finance/${id}`, { method: "DELETE" });
    loadFinance();
};

async function saveFinance() {
    clearFieldErrors(document.body);
    const id = qs("#financeId").value;
    const payload = {
        title: qs("#financeTitle").value.trim(),
        category: qs("#financeCategory").value.trim(),
        amount: Number(qs("#financeAmount").value),
        type: qs("#financeType").value,
        record_date: qs("#financeDate").value,
        note: qs("#financeNote").value.trim()
    };

    let hasError = false;
    if (!payload.title) {
        setFieldError(qs("#financeTitle"), "กรุณากรอกชื่อรายการ");
        hasError = true;
    }
    if (!payload.amount) {
        setFieldError(qs("#financeAmount"), "กรุณากรอกจำนวนเงิน");
        hasError = true;
    }
    if (!payload.record_date) {
        setFieldError(qs("#financeDate"), "กรุณาเลือกวันที่");
        hasError = true;
    }
    if (hasError) return;

    if (id) {
        await fetch(`${API_BASE}/director/finance/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
    } else {
        await fetch(`${API_BASE}/director/finance`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
    }

    resetForm();
    loadFinance();
    closeModal("financeModal");
}

function resetForm() {
    qs("#financeId").value = "";
    qs("#financeTitle").value = "";
    qs("#financeCategory").value = "";
    qs("#financeAmount").value = "";
    qs("#financeType").value = "income";
    qs("#financeDate").value = "";
    qs("#financeNote").value = "";
}
