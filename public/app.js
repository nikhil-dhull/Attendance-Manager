// State management
let subjects = [];
let currentUser = null;

// DOM Elements
const subjectsContainer = document.getElementById('subjects-container');
const overallPercentageEl = document.getElementById('overall-percentage');
const template = document.getElementById('subject-card-template');

const modalOverlay = document.getElementById('modal-overlay');
const addSubjectBtn = document.getElementById('add-subject-btn');
const cancelBtn = document.getElementById('cancel-btn');
const addSubjectForm = document.getElementById('add-subject-form');
const subjectNameInput = document.getElementById('subject-name');

// Edit Modal Elements
const editModalOverlay = document.getElementById('edit-modal-overlay');
const editSubjectForm = document.getElementById('edit-subject-form');
const editSubjectIdInput = document.getElementById('edit-subject-id');
const editSubjectNameInput = document.getElementById('edit-subject-name');
const editSubjectAttendedInput = document.getElementById('edit-subject-attended');
const editSubjectTotalInput = document.getElementById('edit-subject-total');
const editCancelBtn = document.getElementById('edit-cancel-btn');

// Target percentage
const TARGET = 0.75; // 75%

// Session Check & Data Fetch
async function checkSession() {
    try {
        const res = await fetch('/api/session');
        const data = await res.json();
        if (data.loggedIn) {
            currentUser = data.username;
            document.getElementById('display-username').textContent = currentUser;
            fetchSubjects();
        } else {
            window.location.href = '/login.html';
        }
    } catch (err) {
        console.error('Session check failed', err);
        window.location.href = '/login.html';
    }
}

async function fetchSubjects() {
    try {
        const res = await fetch('/api/subjects');
        subjects = await res.json();
        render();
    } catch (err) {
        console.error('Fetch subjects failed', err);
    }
}

// Subject Actions (API calls)
async function addSubject(name) {
    try {
        const res = await fetch('/api/subjects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        if (res.ok) fetchSubjects();
    } catch (err) {
        console.error('Add subject failed', err);
    }
}

async function updateSubject(id, name, attended, total) {
    try {
        const res = await fetch(`/api/subjects/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, attended, total })
        });
        if (res.ok) fetchSubjects();
    } catch (err) {
        console.error('Update subject failed', err);
    }
}

async function deleteSubject(id) {
    try {
        const res = await fetch(`/api/subjects/${id}`, {
            method: 'DELETE'
        });
        if (res.ok) fetchSubjects();
    } catch (err) {
        console.error('Delete subject failed', err);
    }
}

async function logout() {
    try {
        const res = await fetch('/api/logout', { method: 'POST' });
        if (res.ok) window.location.href = '/login.html';
    } catch (err) {
        console.error('Logout failed', err);
    }
}

// Logic to calculate how many classes to attend or leave
// Equations:
// To reach target `T`: T = (attended + x) / (total + x) => x = (T * total - attended) / (1 - T)
// To maintain above target `T` if user skips `y` classes: T = attended / (total + y) => y = (attended / T) - total
function calculateStatus(attended, total) {
    if (total === 0) return { status: 'blank', message: 'No classes held yet.' };
    
    const percentage = attended / total;
    
    if (percentage >= TARGET) {
        // Can miss
        // Safe to miss `y` classes such that attended / (total + y) >= 0.75
        // y = floor((attended / 0.75) - total)
        const canMiss = Math.floor((attended / TARGET) - total);
        if (canMiss > 0) {
            return { status: 'safe', message: `You can skip <span class="positive">${canMiss}</span> upcoming class${canMiss > 1 ? 'es' : ''} and still be at 75%.` };
        } else {
            return { status: 'ontrack', message: `On track! Don't skip the next one.` };
        }
    } else {
        // Must attend
        // Must attend `x` classes such that (attended + x) / (total + x) >= 0.75
        // x = ceil((0.75 * total - attended) / 0.25)
        const mustAttend = Math.ceil(((TARGET * total) - attended) / (1 - TARGET));
        return { status: 'danger', message: `You must attend the next <span class="negative">${mustAttend}</span> class${mustAttend > 1 ? 'es' : ''} to reach 75%.` };
    }
}

// Render the application
function render() {
    subjectsContainer.innerHTML = '';
    
    let totalAttendedOverall = 0;
    let totalClassesOverall = 0;

    subjects.forEach((subject, index) => {
        totalAttendedOverall += subject.attended;
        totalClassesOverall += subject.total;

        const clone = template.content.cloneNode(true);
        const card = clone.querySelector('.subject-card');
        
        // Populate static data
        clone.querySelector('.subject-title').textContent = subject.name;
        clone.querySelector('.attended-val').textContent = subject.attended;
        clone.querySelector('.total-val').textContent = subject.total;

        // Calculate stats
        let percentage = 0;
        let pText = '0%';
        if (subject.total > 0) {
            percentage = subject.attended / subject.total;
            pText = Math.round(percentage * 100) + '%';
        }
        
        const badge = clone.querySelector('.percentage-badge');
        badge.textContent = pText;
        
        const progressBar = clone.querySelector('.progress-bar-fill');
        progressBar.style.width = Math.min((percentage * 100), 100) + '%';

        // Apply colors based on 75% boundary
        if (subject.total > 0) {
            if (percentage >= TARGET) {
                badge.classList.add('green');
                progressBar.classList.add('green');
            } else {
                badge.classList.add('red');
                progressBar.classList.add('red');
            }
        }

        // Apply Analysis text
        const statusBox = clone.querySelector('.status-message');
        const calc = calculateStatus(subject.attended, subject.total);
        statusBox.innerHTML = calc.message;

        // Attach event listeners
        clone.querySelector('.attended-btn').addEventListener('click', () => {
            updateSubject(subject.id, subject.name, subject.attended + 1, subject.total + 1);
        });

        clone.querySelector('.absent-btn').addEventListener('click', () => {
            updateSubject(subject.id, subject.name, subject.attended, subject.total + 1);
        });

        clone.querySelector('.edit-btn').addEventListener('click', () => {
            editSubjectIdInput.value = subject.id;
            editSubjectNameInput.value = subject.name;
            editSubjectAttendedInput.value = subject.attended;
            editSubjectTotalInput.value = subject.total;
            editModalOverlay.classList.remove('hidden');
        });

        clone.querySelector('.delete-btn').addEventListener('click', () => {
            if (confirm(`Remove ${subject.name}?`)) {
                deleteSubject(subject.id);
            }
        });

        subjectsContainer.appendChild(clone);
    });

    // Overview update
    if (totalClassesOverall > 0) {
        let overAllPercent = (totalAttendedOverall / totalClassesOverall) * 100;
        overallPercentageEl.textContent = overAllPercent.toFixed(1) + '%';
        if (overAllPercent >= 75) {
            overallPercentageEl.style.color = '#00e676';
            overallPercentageEl.style.background = 'none';
            overallPercentageEl.style.webkitTextFillColor = '#00e676';
        } else {
            overallPercentageEl.style.color = '#ff5252';
            overallPercentageEl.style.background = 'none';
            overallPercentageEl.style.webkitTextFillColor = '#ff5252';
        }
    } else {
        overallPercentageEl.textContent = '0%';
        overallPercentageEl.style.background = 'var(--gradient-2)';
        overallPercentageEl.style.webkitBackgroundClip = 'text';
        overallPercentageEl.style.webkitTextFillColor = 'transparent';
    }
}

// Modal Handlers
addSubjectBtn.addEventListener('click', () => {
    modalOverlay.classList.remove('hidden');
    subjectNameInput.focus();
});

cancelBtn.addEventListener('click', () => {
    modalOverlay.classList.add('hidden');
    addSubjectForm.reset();
});

addSubjectForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = subjectNameInput.value.trim();
    if (name) {
        addSubject(name);
        modalOverlay.classList.add('hidden');
        addSubjectForm.reset();
    }
});

// Edit Modal Handlers
editCancelBtn.addEventListener('click', () => {
    editModalOverlay.classList.add('hidden');
    editSubjectForm.reset();
});

editSubjectForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const id = editSubjectIdInput.value;
    const name = editSubjectNameInput.value.trim();
    const attended = parseInt(editSubjectAttendedInput.value);
    const total = parseInt(editSubjectTotalInput.value);
    
    if (name && !isNaN(attended) && !isNaN(total)) {
        updateSubject(id, name, attended, total);
        editModalOverlay.classList.add('hidden');
        editSubjectForm.reset();
    }
});

// Logout handlers
document.getElementById('logout-btn')?.addEventListener('click', logout);

// Initial Load
checkSession();
