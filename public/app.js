const AUTH_USERNAME = 'avy';
const AUTH_OTP = '977133';
const AUTH_STORAGE_KEY = 'clinicMentorAuthenticated';

const SYSTEM_PROMPT = `You are an experienced senior community and family physician advisor with over 30 years of practical primary care experience. Your purpose is to help a junior doctor running a pharmacy and primary clinic think through patient cases systematically and safely. You are not speaking directly to patients; you are guiding the doctor.

You must conduct clinical history-taking in a structured but conversational way. During history-taking, ask exactly one focused question in each assistant reply. Do not ask multiple questions, do not use a checklist of questions, and do not combine several questions with "and/or". Every next question must clearly refer to the doctor's previous answer and use that answer to narrow the diagnostic reasoning. When information is incomplete or uncertain, continue drilling down with one question at a time.

If emergency red flags are already apparent, first advise urgent referral clearly, then ask no more than one immediate safety-related follow-up question if it is necessary.

You should help identify the most likely primary disease patterns, common differential diagnoses, and potential next steps for assessment. Always prioritize patient safety and evidence-based reasoning. Clearly identify red flags such as chest pain with instability, stroke symptoms, breathing difficulty, severe dehydration, altered mental status, sepsis signs, uncontrolled bleeding, suicidal intent, severe abdominal pain, meningitis signs, high-risk pregnancy symptoms, or any emergency features. If red flags appear, strongly advise urgent referral to a hospital, emergency department, or relevant specialist.

During assessment, proactively ask about:
- Duration and progression of symptoms
- Fever, pain, appetite, bowel/bladder changes, sleep, weight changes
- Existing diseases and chronic conditions
- Current medications, allergies, substance use, and relevant family history
- Vitals or examination findings if available
- Age, sex, pregnancy status when clinically relevant
- Any lab results or prescriptions already tried

If visual assessment may help, ask the doctor to upload clear images, such as skin lesions, throat findings, swelling, eye findings, wounds, prescriptions, lab reports, or scans.

You should not pretend to confirm a diagnosis without enough information. Use cautious clinical language such as 'possible', 'likely', or 'needs exclusion'. Explain the clinical reasoning briefly and practically in a way useful for a junior doctor.

If the case is safely manageable at the primary clinic and does NOT require a referral, you must suggest the best possible medication plan, along with any necessary diagnostic tests or laboratory investigations (e.g., blood work, imaging) required to confirm the diagnosis. Keep the prescription to an absolute minimum to avoid polypharmacy, but ensure no required or essential medication is left out. Provide clear dosing, frequency, and duration for the junior doctor to review. Do not prescribe dangerous treatments or unsafe dosing. Encourage referral when uncertainty is high, symptoms are worsening, or examination is needed beyond primary care capability.

Maintain a calm, experienced, practical tone like a senior mentor teaching a junior clinician. Avoid jargon overload. Keep responses concise, focused, and clinically useful.`;

// --- PDF.js Setup ---
if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';
}

// --- State Management ---
let state = {
    patients: [], // { id, name, date, messages: [] }
    currentPatientId: null,
    attachedImageBase64: null,
    attachedPdfText: null,
    attachedFileName: null
};

let appStarted = false;
let lastHandledFileKey = '';

// Load state from localStorage
function loadState() {
    const savedPatients = localStorage.getItem('clinicMentorPatients');
    if (savedPatients) {
        state.patients = JSON.parse(savedPatients);
    }
}

function saveState() {
    const patientsForStorage = state.patients.map(patient => ({
        ...patient,
        messages: patient.messages.map(stripLargeAttachmentsForStorage)
    }));

    localStorage.setItem('clinicMentorPatients', JSON.stringify(patientsForStorage));
}

function stripLargeAttachmentsForStorage(message) {
    if (!Array.isArray(message.content)) return message;

    return {
        ...message,
        content: message.content.map(part => {
            if (part.type !== 'image_url') return part;

            return {
                type: 'text',
                text: '[Image was attached in this message.]'
            };
        })
    };
}

// --- DOM Elements ---
const els = {
    // Login
    loginScreen: document.getElementById('login-screen'),
    loginForm: document.getElementById('login-form'),
    loginUsername: document.getElementById('login-username'),
    loginOtp: document.getElementById('login-otp'),
    loginError: document.getElementById('login-error'),
    logoutBtn: document.getElementById('logout-btn'),

    // Sidebar
    sidebar: document.getElementById('sidebar'),
    toggleSidebarBtn: document.getElementById('toggle-sidebar-btn'),
    closeSidebarBtn: document.getElementById('close-sidebar-btn'),
    newPatientBtn: document.getElementById('new-patient-btn'),
    patientSearchInput: document.getElementById('patient-search-input'),
    patientList: document.getElementById('patient-list'),
    
    // Main UI
    currentPatientName: document.getElementById('current-patient-name'),
    chatContainer: document.getElementById('chat-container'),
    welcomeScreen: document.getElementById('welcome-screen'),
    chatHistory: document.getElementById('chat-history'),
    
    // Input
    chatForm: document.getElementById('chat-form'),
    messageInput: document.getElementById('message-input'),
    attachBtn: document.getElementById('attach-btn'),
    sendBtn: document.getElementById('send-btn'),
    fileUpload: document.getElementById('file-upload'),
    imagePreviewContainer: document.getElementById('image-preview-container'),
    imagePreview: document.getElementById('image-preview'),
    removeImageBtn: document.getElementById('remove-image-btn'),
    
    // Modals
    editPatientModal: document.getElementById('edit-patient-modal'),
    closeEditPatientBtn: document.getElementById('close-edit-patient-btn'),
    patientNameInput: document.getElementById('patient-name-input'),
    patientAgeInput: document.getElementById('patient-age-input'),
    patientGenderInput: document.getElementById('patient-gender-input'),
    patientWeightInput: document.getElementById('patient-weight-input'),
    patientPhoneInput: document.getElementById('patient-phone-input'),
    savePatientBtn: document.getElementById('save-patient-btn'),
};
// Fix ID mapping
els.toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');

// --- Setup & Initialization ---
function init() {
    setupAuthListeners();

    if (!isAuthenticated()) {
        showLogin();
        return;
    }

    showApp();
    startApp();
}

function startApp() {
    if (appStarted) return;
    appStarted = true;

    loadState();
    setupEventListeners();
    renderPatientList();
    
    // If we have an active session, render it, else show welcome
    if (state.patients.length > 0) {
        // Find most recent
        const recent = state.patients.reduce((prev, current) => (prev.date > current.date) ? prev : current);
        selectPatient(recent.id);
    } else {
        updateUIForNoPatient();
    }
    
    // Markdown options
    marked.setOptions({
        breaks: true, // translate newlines to <br>
    });
}

function setupAuthListeners() {
    els.loginForm.addEventListener('submit', handleLogin);
    els.logoutBtn.addEventListener('click', handleLogout);
}

function isAuthenticated() {
    return localStorage.getItem(AUTH_STORAGE_KEY) === 'true';
}

function showLogin() {
    document.body.classList.add('app-locked');
    els.loginError.textContent = '';
    els.loginUsername.focus();
}

function showApp() {
    document.body.classList.remove('app-locked');
}

function handleLogin(e) {
    e.preventDefault();

    const username = els.loginUsername.value.trim().toLowerCase();
    const otp = els.loginOtp.value.trim();

    if (username === AUTH_USERNAME && otp === AUTH_OTP) {
        localStorage.setItem(AUTH_STORAGE_KEY, 'true');
        els.loginOtp.value = '';
        showApp();
        startApp();
        return;
    }

    els.loginError.textContent = 'Invalid username or OTP.';
    els.loginOtp.value = '';
    els.loginOtp.focus();
}

function handleLogout() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    window.location.reload();
}

function setupEventListeners() {
    // New Patient
    els.newPatientBtn.addEventListener('click', openNewPatientModal);
    els.closeEditPatientBtn.addEventListener('click', closeModals);
    els.savePatientBtn.addEventListener('click', createNewPatient);
    els.patientSearchInput.addEventListener('input', renderPatientList);
    
    // Input Resizing & Validation
    els.messageInput.addEventListener('input', handleInputResize);
    els.messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            els.chatForm.dispatchEvent(new Event('submit'));
        }
    });
    
    // Mobile Sidebar Toggle
    if (els.toggleSidebarBtn && els.sidebar) {
        els.toggleSidebarBtn.addEventListener('click', () => {
            els.sidebar.classList.toggle('open');
        });
    }
    
    if (els.closeSidebarBtn && els.sidebar) {
        els.closeSidebarBtn.addEventListener('click', () => {
            els.sidebar.classList.remove('open');
        });
    }

    // File Upload
    els.attachBtn.addEventListener('click', openFilePicker);
    els.fileUpload.addEventListener('click', () => {
        els.fileUpload.value = '';
        lastHandledFileKey = '';
    });
    els.fileUpload.addEventListener('input', handleFileUpload);
    els.fileUpload.addEventListener('change', handleFileUpload);
    els.removeImageBtn.addEventListener('click', removeFile);
    
    // Form Submit
    els.chatForm.addEventListener('submit', handleSendMessage);
}

function openFilePicker() {
    if (!state.currentPatientId) {
        alert("Please select or create a patient case before uploading a file.");
        return;
    }

    els.fileUpload.value = '';
    lastHandledFileKey = '';
    els.fileUpload.click();
}

// --- Logic & Actions ---

function openNewPatientModal() {
    els.patientNameInput.value = '';
    els.patientAgeInput.value = '';
    els.patientGenderInput.value = '';
    els.patientWeightInput.value = '';
    els.patientPhoneInput.value = '';
    els.editPatientModal.classList.add('active');
    els.patientNameInput.focus();
}

function createNewPatient() {
    const name = els.patientNameInput.value.trim();
    const age = els.patientAgeInput.value.trim();
    const gender = els.patientGenderInput.value;
    const weight = els.patientWeightInput.value.trim();
    const phone = els.patientPhoneInput.value.trim();
    
    if (!name || !age || !gender || !weight) {
        alert("Please fill in all mandatory fields: Name, Age, Gender, and Weight.");
        return;
    }

    const displayName = `${name} (${age}y ${gender.charAt(0)}, ${weight}kg)`;
    const newId = 'patient_' + Date.now();
    
    // Inject the patient's basic info directly as the first context message so the AI knows
    const contextMsg = {
        role: 'system',
        content: `Patient Context Profile: Name: ${name}, Age: ${age}, Gender: ${gender}, Weight: ${weight}kg, Phone: ${phone || 'Not provided'}. Please keep this in mind during the consultation and use it for precise diagnosis and treatment plans.`
    };

    const newPatient = {
        id: newId,
        name: displayName,
        phone,
        date: new Date().toISOString(),
        messages: [contextMsg]
    };
    
    state.patients.unshift(newPatient); // Add to beginning
    saveState();
    closeModals();
    selectPatient(newId);
    renderPatientList();
    
    // If on mobile, close sidebar
    els.sidebar.classList.remove('open');
}

function selectPatient(id) {
    state.currentPatientId = id;
    const patient = state.patients.find(p => p.id === id);
    if (!patient) return updateUIForNoPatient();
    
    els.currentPatientName.textContent = patient.name;
    els.welcomeScreen.style.display = 'none';
    els.chatHistory.style.display = 'flex';
    
    renderPatientList(); // Update active class
    renderChatHistory();
    checkInputEnabled();
}

function updateUIForNoPatient() {
    els.currentPatientName.textContent = 'No Patient Selected';
    els.welcomeScreen.style.display = 'flex';
    els.chatHistory.style.display = 'none';
    els.sendBtn.disabled = true;
    els.messageInput.disabled = true;
    els.fileUpload.disabled = true;
}

function checkInputEnabled() {
    const hasPatient = !!state.currentPatientId;
    els.messageInput.disabled = !hasPatient;
    els.fileUpload.disabled = !hasPatient;
    validateSendBtn();
}

function validateSendBtn() {
    const text = els.messageInput.value.trim();
    const hasImage = !!state.attachedImageBase64;
    const hasPdf = !!state.attachedPdfText;
    els.sendBtn.disabled = !state.currentPatientId || (!text && !hasImage && !hasPdf);
}

function closeModals() {
    els.editPatientModal.classList.remove('active');
}

// --- UI Rendering ---

function renderPatientList() {
    els.patientList.innerHTML = '';
    const searchTerm = els.patientSearchInput.value.trim().toLowerCase();
    const normalizePhone = (value) => (value || '').replace(/\D/g, '');
    const searchDigits = normalizePhone(searchTerm);
    const filteredPatients = state.patients.filter(patient => {
        if (!searchTerm) return true;

        const patientName = (patient.name || '').toLowerCase();
        const patientPhone = (patient.phone || '').toLowerCase();
        const patientPhoneDigits = normalizePhone(patient.phone);

        return patientName.includes(searchTerm)
            || patientPhone.includes(searchTerm)
            || (!!searchDigits && patientPhoneDigits.includes(searchDigits));
    });

    if (filteredPatients.length === 0) {
        els.patientList.innerHTML = '<div class="empty-patient-search">No matching cases found.</div>';
        return;
    }

    filteredPatients.forEach(patient => {
        const item = document.createElement('div');
        item.className = `patient-item ${patient.id === state.currentPatientId ? 'active' : ''}`;
        
        const dateObj = new Date(patient.date);
        const dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        item.innerHTML = `
            <div class="patient-info">
                <span class="patient-name">${patient.name}</span>
                <span class="patient-date">${dateStr}</span>
            </div>
            <div class="patient-actions">
                <button class="icon-btn delete-patient-btn" title="Delete"><i class="ph ph-trash"></i></button>
            </div>
        `;
        
        // Add click listener for selection
        item.addEventListener('click', (e) => {
            if(!e.target.closest('.delete-patient-btn')) {
                selectPatient(patient.id);
                // If on mobile, close sidebar
                if(window.innerWidth <= 768) els.sidebar.classList.remove('open');
            }
        });
        
        // Delete listener
        const delBtn = item.querySelector('.delete-patient-btn');
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if(confirm('Are you sure you want to delete this case?')) {
                state.patients = state.patients.filter(p => p.id !== patient.id);
                saveState();
                if(state.currentPatientId === patient.id) {
                    state.currentPatientId = null;
                    if(state.patients.length > 0) selectPatient(state.patients[0].id);
                    else updateUIForNoPatient();
                }
                renderPatientList();
            }
        });
        
        els.patientList.appendChild(item);
    });
}

function renderChatHistory() {
    els.chatHistory.innerHTML = '';
    const patient = state.patients.find(p => p.id === state.currentPatientId);
    if (!patient) return;
    
    patient.messages.forEach(msg => {
        // Skip system messages from display
        if (msg.role === 'system') return;
        appendMessageToUI(msg);
    });
    scrollToBottom();
}

function appendMessageToUI(msg) {
    const div = document.createElement('div');
    div.className = `message ${msg.role === 'user' ? 'user' : 'ai'}`;
    
    let contentHtml = '';
    
    // Handle complex multi-part message (with images) or simple text
    if (Array.isArray(msg.content)) {
        let textPart = msg.content.find(c => c.type === 'text');
        let imgPart = msg.content.find(c => c.type === 'image_url');
        
        if (textPart) {
            contentHtml += `<div class="markdown-body">${marked.parse(textPart.text)}</div>`;
        }
        if (imgPart) {
            contentHtml += `<img src="${imgPart.image_url.url}" class="message-image" alt="Uploaded Image" />`;
        }
    } else {
        contentHtml = `<div class="markdown-body">${marked.parse(msg.content)}</div>`;
    }
    
    const iconClass = msg.role === 'user' ? 'ph-user' : 'ph-stethoscope';
    
    div.innerHTML = `
        <div class="message-avatar"><i class="ph ${iconClass}"></i></div>
        <div class="message-content">${contentHtml}</div>
    `;
    
    els.chatHistory.appendChild(div);
    scrollToBottom();
}

function showTypingIndicator() {
    const div = document.createElement('div');
    div.className = `message ai typing-indicator-msg`;
    div.id = 'typing-indicator';
    div.innerHTML = `
        <div class="message-avatar"><i class="ph ph-stethoscope"></i></div>
        <div class="message-content" style="padding: 12px 16px;">
            <div class="typing-indicator">
                <div class="dot"></div><div class="dot"></div><div class="dot"></div>
            </div>
        </div>
    `;
    els.chatHistory.appendChild(div);
    scrollToBottom();
}

function removeTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.remove();
}

function scrollToBottom() {
    els.chatContainer.scrollTop = els.chatContainer.scrollHeight;
}

// --- Input & Form Handling ---

function handleInputResize() {
    els.messageInput.style.height = 'auto';
    els.messageInput.style.height = Math.min(els.messageInput.scrollHeight, 150) + 'px';
    validateSendBtn();
}

async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const fileKey = `${file.name}-${file.size}-${file.lastModified}`;
    if (fileKey === lastHandledFileKey) return;
    lastHandledFileKey = fileKey;
    
    state.attachedFileName = file.name;

    if (file.type === 'application/pdf') {
        // Handle PDF
        try {
            els.imagePreviewContainer.style.display = 'inline-block';
            els.imagePreview.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="%230ea5e9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>'; // Generic PDF icon
            
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let fullText = '';
            
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(' ');
                fullText += `--- Page ${i} ---\n${pageText}\n\n`;
            }
            
            if (!fullText.trim()) {
                alert("Could not extract text from this PDF. It might be a scanned image.");
                removeFile();
                return;
            }
            
            state.attachedPdfText = fullText;
            validateSendBtn();
        } catch (err) {
            console.error(err);
            alert("Failed to read PDF.");
            removeFile();
        }
    } else if (isImageFile(file)) {
        // Handle Image
        try {
            state.attachedImageBase64 = await readImageForUpload(file);
            els.imagePreview.src = state.attachedImageBase64;
            els.imagePreviewContainer.style.display = 'inline-block';
            validateSendBtn();
        } catch (err) {
            console.error(err);
            alert("Failed to read this image. Please try a JPG, PNG, or WebP image.");
            removeFile();
        }
    } else {
        alert("Unsupported file type. Please upload a PDF, JPG, PNG, or WebP image.");
        removeFile();
    }
}

function isImageFile(file) {
    const imageExtensions = /\.(jpe?g|png|webp|gif|bmp)$/i;
    return file.type.startsWith('image/') || imageExtensions.test(file.name);
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error('Unable to read file.'));
        reader.readAsDataURL(file);
    });
}

async function readImageForUpload(file) {
    const dataUrl = await readFileAsDataUrl(file);

    if (file.type === 'image/gif' || file.type === 'image/svg+xml') {
        return dataUrl;
    }

    return compressImageDataUrl(dataUrl);
}

function compressImageDataUrl(dataUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const maxSide = 1600;
            const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(img.width * scale));
            canvas.height = Math.max(1, Math.round(img.height * scale));

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
    });
}

function removeFile() {
    state.attachedImageBase64 = null;
    state.attachedPdfText = null;
    state.attachedFileName = null;
    els.imagePreviewContainer.style.display = 'none';
    els.imagePreview.src = '';
    els.fileUpload.value = '';
    validateSendBtn();
}

async function handleSendMessage(e) {
    e.preventDefault();
    if (!state.currentPatientId || (!els.messageInput.value.trim() && !state.attachedImageBase64 && !state.attachedPdfText)) return;
    
    let text = els.messageInput.value.trim();
    const imageBase64 = state.attachedImageBase64;
    const pdfText = state.attachedPdfText;
    const fileName = state.attachedFileName;
    const patient = state.patients.find(p => p.id === state.currentPatientId);
    
    // Clear input UI
    els.messageInput.value = '';
    els.messageInput.style.height = 'auto';
    removeFile();
    els.sendBtn.disabled = true;
    
    // Append PDF text if it exists
    if (pdfText) {
        text += `\n\n[Attached File: ${fileName}]\n${pdfText}`;
    }
    
    // Construct user message payload
    let userMsgPayload = { role: 'user', content: text };
    if (imageBase64) {
        userMsgPayload.content = [
            { type: 'text', text: text || "Please analyze this image." },
            { type: 'image_url', image_url: { url: imageBase64 } }
        ];
    }
    
    // Save to patient history
    patient.messages.push(userMsgPayload);
    saveState();
    
    // Render
    appendMessageToUI(userMsgPayload);
    showTypingIndicator();
    
    // Prepare API call payload
    // We must ensure the System Prompt is always at the beginning of the context window.
    let apiMessages = [
        { role: 'system', content: SYSTEM_PROMPT }
    ];
    
    // Add all patient messages
    apiMessages = apiMessages.concat(patient.messages);
    
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'gpt-4o', // Must use a multimodal model since we support images
                messages: apiMessages,
                temperature: 0.7,
                max_tokens: 1500
            })
        });
        
        const data = await response.json();
        removeTypingIndicator();
        
        if (!response.ok) {
            throw new Error(data.error?.message || 'API Error');
        }
        
        const aiResponseText = data.choices[0].message.content;
        
        // Save AI response
        const aiMsg = { role: 'assistant', content: aiResponseText };
        patient.messages.push(aiMsg);
        saveState();
        
        // Render
        appendMessageToUI(aiMsg);
        
    } catch (error) {
        removeTypingIndicator();
        console.error(error);
        alert(`Error communicating with AI: ${error.message}`);
        
        // Optional: Remove the user message from history if it failed? Or keep it so they can try again.
        // For now, keeping it.
    }
}

// Start
init();
