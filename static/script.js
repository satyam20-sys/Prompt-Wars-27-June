/**
 * ExamZen Frontend Controller
 * Manages SPA state, Web Speech API voice transcription, Chart.js rendering,
 * sessionStorage rate limits, and API fetch calls.
 */

// Global State
let currentTab = 'journal';
let recognition = null;
let isRecording = false;
let stressChart = null;
let emotionsChart = null;

// Track chat messages (last 5 for context)
let chatHistory = [];

// Initialize Page
document.addEventListener('DOMContentLoaded', () => {
    updateUsageBar();
    initVoiceRecognition();
    setupCharCounter();
    
    // Default Tab
    switchTab('journal');
});

// AI Session Limit Utility
const MAX_AI_CALLS = 20;

function getCallCount() {
    try {
        const count = sessionStorage.getItem('examzen_ai_calls');
        return count ? parseInt(count, 10) : 0;
    } catch (e) {
        return 0;
    }
}

function incrementCallCount() {
    try {
        let count = getCallCount();
        count++;
        sessionStorage.setItem('examzen_ai_calls', count.toString());
        updateUsageBar();
        return count;
    } catch (e) {
        return 0;
    }
}

function updateUsageBar() {
    const count = getCallCount();
    const progressPercent = Math.min((count / MAX_AI_CALLS) * 100, 100);
    
    const countLabel = document.getElementById('limit-count');
    const progressBar = document.getElementById('limit-progress');
    
    if (countLabel) countLabel.innerText = count.toString();
    if (progressBar) progressBar.style.width = `${progressPercent}%`;

    if (count >= MAX_AI_CALLS) {
        showError("Daily AI limit reached. Refresh to continue.");
        disableActionButtons();
    }
}

function verifyCallLimit() {
    const count = getCallCount();
    if (count >= MAX_AI_CALLS) {
        showError("Daily AI limit reached. Refresh to continue.");
        disableActionButtons();
        return false;
    }
    return true;
}

function disableActionButtons() {
    const btnSubmit = document.getElementById('btn-submit-journal');
    const btnPanic = document.getElementById('btn-panic');
    const btnMotivate = document.getElementById('btn-motivate');
    const btnDna = document.getElementById('btn-generate-dna');
    const btnBurnout = document.getElementById('btn-predict-burnout');
    const btnChat = document.getElementById('btn-send-chat');

    if (btnSubmit) btnSubmit.disabled = true;
    if (btnPanic) btnPanic.disabled = true;
    if (btnMotivate) btnMotivate.disabled = true;
    if (btnDna) btnDna.disabled = true;
    if (btnBurnout) btnBurnout.disabled = true;
    if (btnChat) btnChat.disabled = true;
}

// Character Counter
function setupCharCounter() {
    const textarea = document.getElementById('journal-text');
    const charCounter = document.getElementById('char-count');
    if (textarea && charCounter) {
        textarea.addEventListener('input', () => {
            charCounter.innerText = textarea.value.length.toString();
        });
    }
}

// SPA Navigation
function switchTab(tabName) {
    currentTab = tabName;
    
    // Update navigation item active classes
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.classList.remove('active');
    });
    
    const activeNav = document.getElementById(`tab-${tabName}`);
    if (activeNav) activeNav.classList.add('active');
    
    // Toggle Section views
    const sections = document.querySelectorAll('.tab-content');
    sections.forEach(section => {
        section.classList.remove('active');
    });
    
    const activeSection = document.getElementById(`section-${tabName}`);
    if (activeSection) activeSection.classList.add('active');
    
    // Tab Specific Logic
    if (tabName === 'dashboard') {
        loadDashboard();
    }
}

// Error Handling UI
function showError(message) {
    const container = document.getElementById('error-container');
    const messageEl = document.getElementById('error-message');
    if (container && messageEl) {
        messageEl.innerText = message;
        container.classList.remove('hidden');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

function dismissError() {
    const container = document.getElementById('error-container');
    if (container) {
        container.classList.add('hidden');
    }
}

// Voice Recognition setup (Web Speech API)
function initVoiceRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const micButton = document.getElementById('btn-mic');
    const micStatus = document.getElementById('mic-status');
    
    if (!SpeechRecognition) {
        if (micButton) micButton.classList.add('hidden');
        if (micStatus) {
            micStatus.innerText = "Voice input not supported in this browser. Use Chrome.";
            micStatus.style.color = "var(--red)";
        }
        return;
    }
    
    recognition = new SpeechRecognition();
    recognition.lang = 'en-IN'; // Indian English
    recognition.continuous = true;
    recognition.interimResults = true;
    
    recognition.onstart = () => {
        isRecording = true;
        if (micButton) micButton.classList.add('recording');
        if (micStatus) micStatus.innerText = "Listening (speak in English/Hindi-English)...";
    };
    
    recognition.onresult = (event) => {
        const textarea = document.getElementById('journal-text');
        const charCounter = document.getElementById('char-count');
        let interimTranscript = '';
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript;
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }
        
        if (finalTranscript) {
            textarea.value = (textarea.value + ' ' + finalTranscript).trim();
            if (charCounter) charCounter.innerText = textarea.value.length.toString();
        }
        if (micStatus && interimTranscript) {
            micStatus.innerText = `Speech: ${interimTranscript}`;
        }
    };
    
    recognition.onend = () => {
        isRecording = false;
        if (micButton) micButton.classList.remove('recording');
        if (micStatus) micStatus.innerText = "Microphone off.";
    };
    
    recognition.onerror = (event) => {
        isRecording = false;
        if (micButton) micButton.classList.remove('recording');
        if (micStatus) micStatus.innerText = `Error: ${event.error}`;
        console.error("Speech Recognition Error:", event.error);
    };
}

function toggleVoiceInput() {
    if (!recognition) return;
    
    if (isRecording) {
        recognition.stop();
    } else {
        recognition.start();
    }
}

// Journal Submit and AI Analysis Flow
async function handleJournalSubmit(event) {
    event.preventDefault();
    dismissError();
    
    if (!verifyCallLimit()) return;
    
    const textEl = document.getElementById('journal-text');
    const moodEl = document.querySelector('input[name="mood"]:checked');
    const examEl = document.getElementById('journal-exam');
    const dateEl = document.getElementById('journal-exam-date');
    const spinner = document.getElementById('submit-spinner');
    const btnSubmit = document.getElementById('btn-submit-journal');
    
    if (!textEl || !moodEl || !examEl) return;
    
    const text = textEl.value.trim();
    const mood = moodEl.value;
    const exam = examEl.value;
    const examDate = dateEl ? dateEl.value : null;
    
    if (!text) {
        showError("Please enter some thoughts before submitting.");
        return;
    }
    
    // Toggle Loading State
    if (spinner) spinner.classList.remove('hidden');
    if (btnSubmit) btnSubmit.disabled = true;
    
    try {
        // Step 1: Save Journal Entry
        const journalResponse = await fetch('/journal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: text,
                mood: mood,
                exam: exam,
                exam_date: examDate
            })
        });
        
        let savedEntry;
        const rawJournalText = await journalResponse.text();
        try {
            savedEntry = JSON.parse(rawJournalText);
        } catch (parseErr) {
            throw new Error(`Failed to parse journal save response: ${parseErr.message}. Raw: ${rawJournalText}`);
        }
        
        if (!journalResponse.ok) {
            throw new Error(savedEntry.error || `Server responded with code ${journalResponse.status}`);
        }
        
        // Step 2: Trigger AI Analysis
        incrementCallCount();
        const analyzeResponse = await fetch('/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: savedEntry.id })
        });
        
        let analysisData;
        const rawAnalyzeText = await analyzeResponse.text();
        try {
            analysisData = JSON.parse(rawAnalyzeText);
        } catch (parseErr) {
            throw new Error(`Failed to parse analysis response: ${parseErr.message}. Raw: ${rawAnalyzeText}`);
        }
        
        if (!analyzeResponse.ok) {
            throw new Error(analysisData.error || `Analysis failed with code ${analyzeResponse.status}`);
        }
        
        // Clear input form
        textEl.value = '';
        const charCounter = document.getElementById('char-count');
        if (charCounter) charCounter.innerText = '0';
        
        // Render Analysis Cards
        renderAnalysisCard(analysisData);
        
    } catch (err) {
        showError(err.message);
        console.error("Submission error:", err);
    } finally {
        if (spinner) spinner.classList.add('hidden');
        if (btnSubmit) btnSubmit.disabled = false;
        updateUsageBar();
    }
}

function renderAnalysisCard(data) {
    const card = document.getElementById('card-analysis');
    if (!card) return;
    
    document.getElementById('analysis-stress-val').innerText = data.stress_level;
    
    // Emotions Badges
    const badgeContainer = document.getElementById('analysis-emotions');
    badgeContainer.innerHTML = '';
    data.detected_emotions.forEach(emo => {
        const span = document.createElement('span');
        span.className = 'badge badge-low'; // styling utility
        span.innerText = emo;
        badgeContainer.appendChild(span);
    });
    
    document.getElementById('analysis-triggers').innerText = data.hidden_triggers.join(', ');
    document.getElementById('analysis-coping').innerText = data.coping_strategy;
    document.getElementById('analysis-mindfulness').innerText = data.mindfulness_exercise;
    document.getElementById('analysis-motivational').innerText = data.motivational_message;
    document.getElementById('analysis-india-context').innerText = data.india_context;
    
    // Safety Alert Trigger
    const safetyAlert = document.getElementById('analysis-safety-alert');
    if (data.safety_flag === true || data.safety_flag === "true") {
        safetyAlert.classList.remove('hidden');
    } else {
        safetyAlert.classList.add('hidden');
    }
    
    card.classList.remove('hidden');
}

// Close Diagnostic Cards
function closeCard(cardId) {
    const card = document.getElementById(cardId);
    if (card) card.classList.add('hidden');
}

// Stress DNA Trigger
async function triggerStressDNA() {
    dismissError();
    if (!verifyCallLimit()) return;
    
    const btn = document.getElementById('btn-generate-dna');
    if (btn) btn.disabled = true;
    
    try {
        incrementCallCount();
        const response = await fetch('/stress-dna', { method: 'POST' });
        
        let data;
        const rawText = await response.text();
        try {
            data = JSON.parse(rawText);
        } catch (parseErr) {
            throw new Error(`Failed to parse stress DNA: ${parseErr.message}. Raw: ${rawText}`);
        }
        
        if (!response.ok) {
            throw new Error(data.error || `Server responded with code ${response.status}`);
        }
        
        if (data.insufficient_data) {
            showError("Add your first journal entry to generate your Stress DNA");
            return;
        }
        
        // Render
        document.getElementById('dna-primary-stressor').innerText = data.primary_stressor;
        document.getElementById('dna-stress-pattern').innerText = data.stress_pattern;
        document.getElementById('dna-emotional-default').innerText = data.emotional_default;
        document.getElementById('dna-personalized-mantra').innerText = data.personalized_mantra;
        
        const winsList = document.getElementById('dna-weekly-wins');
        winsList.innerHTML = '';
        data.weekly_wins.forEach(win => {
            const li = document.createElement('li');
            li.innerText = win;
            winsList.appendChild(li);
        });
        
        document.getElementById('dna-next-week-focus').innerText = data.next_week_focus;
        
        document.getElementById('card-stress-dna').classList.remove('hidden');
        
    } catch (err) {
        showError(err.message);
        console.error("Stress DNA generation error:", err);
    } finally {
        if (btn) btn.disabled = false;
        updateUsageBar();
    }
}

// Burnout Prediction Trigger
async function triggerBurnoutPrediction() {
    dismissError();
    if (!verifyCallLimit()) return;
    
    const btn = document.getElementById('btn-predict-burnout');
    if (btn) btn.disabled = true;
    
    try {
        incrementCallCount();
        const response = await fetch('/burnout-predict', { method: 'POST' });
        
        let data;
        const rawText = await response.text();
        try {
            data = JSON.parse(rawText);
        } catch (parseErr) {
            throw new Error(`Failed to parse burnout prediction: ${parseErr.message}. Raw: ${rawText}`);
        }
        
        if (!response.ok) {
            throw new Error(data.error || `Server responded with code ${response.status}`);
        }
        
        if (data.insufficient_data) {
            showError("Journal for at least 3 days to unlock burnout prediction");
            return;
        }
        
        // Render risk badge
        const badge = document.getElementById('burnout-risk-badge');
        badge.innerText = data.burnout_risk;
        badge.className = `badge badge-${data.burnout_risk.toLowerCase()}`;
        
        // Days
        document.getElementById('burnout-days').innerText = data.days_until_burnout !== null ? `${data.days_until_burnout} Days` : "Stable / Indefinite";
        
        // Warning Signs
        const warningList = document.getElementById('burnout-warning-signs');
        warningList.innerHTML = '';
        data.warning_signs.forEach(sign => {
            const li = document.createElement('li');
            li.innerText = sign;
            warningList.appendChild(li);
        });
        
        document.getElementById('burnout-intervention').innerText = data.intervention;
        
        document.getElementById('card-burnout').classList.remove('hidden');
        
    } catch (err) {
        showError(err.message);
        console.error("Burnout prediction error:", err);
    } finally {
        if (btn) btn.disabled = false;
        updateUsageBar();
    }
}

// Quick Coping Modal Functions
function openCopingModal(title, text) {
    const modal = document.getElementById('modal-coping');
    const modalTitle = document.getElementById('modal-coping-title');
    const modalContent = document.getElementById('modal-coping-content');
    
    if (modal && modalTitle && modalContent) {
        modalTitle.innerText = title;
        modalContent.innerText = text;
        modal.classList.remove('hidden');
    }
}

function closeCopingModal() {
    const modal = document.getElementById('modal-coping');
    if (modal) modal.classList.add('hidden');
}

// Click anywhere on window to close modal if clicked outside
window.onclick = function(event) {
    const modal = document.getElementById('modal-coping');
    if (event.target === modal) {
        closeCopingModal();
    }
};

// Panic Breathing Exercise
document.getElementById('btn-panic').onclick = async function() {
    dismissError();
    if (!verifyCallLimit()) return;
    
    const btn = document.getElementById('btn-panic');
    btn.disabled = true;
    
    try {
        incrementCallCount();
        const response = await fetch('/panic-button');
        const text = await response.text();
        
        if (!response.ok) {
            let errorMsg = text;
            try {
                const errObj = JSON.parse(text);
                errorMsg = errObj.error || text;
            } catch(e) {}
            throw new Error(errorMsg || `Coping tool responded with code ${response.status}`);
        }
        
        openCopingModal("60-Second Breathing Relief", text);
    } catch (err) {
        showError(err.message);
    } finally {
        btn.disabled = false;
        updateUsageBar();
    }
};

// Motivation Booster
document.getElementById('btn-motivate').onclick = async function() {
    dismissError();
    if (!verifyCallLimit()) return;
    
    const select = document.getElementById('motivate-exam');
    const exam = select ? select.value : 'General';
    const btn = document.getElementById('btn-motivate');
    btn.disabled = true;
    
    try {
        incrementCallCount();
        const response = await fetch(`/motivate-me?exam=${encodeURIComponent(exam)}`);
        const text = await response.text();
        
        if (!response.ok) {
            let errorMsg = text;
            try {
                const errObj = JSON.parse(text);
                errorMsg = errObj.error || text;
            } catch(e) {}
            throw new Error(errorMsg || `Motivation booster failed: status ${response.status}`);
        }
        
        openCopingModal(`${exam} Preparation Motivation`, text);
    } catch (err) {
        showError(err.message);
    } finally {
        btn.disabled = false;
        updateUsageBar();
    }
};

// Dashboard Loader & Chart Renderer
async function loadDashboard() {
    dismissError();
    
    const emptyState = document.getElementById('dash-empty-state');
    const contentArea = document.getElementById('dash-content');
    
    try {
        const response = await fetch('/dashboard');
        
        let data;
        const rawText = await response.text();
        try {
            data = JSON.parse(rawText);
        } catch (parseErr) {
            throw new Error(`Failed to parse dashboard stats: ${parseErr.message}. Raw: ${rawText}`);
        }
        
        if (!response.ok) {
            throw new Error(data.error || `Failed to fetch stats: code ${response.status}`);
        }
        
        if (data.empty) {
            if (emptyState) emptyState.classList.remove('hidden');
            if (contentArea) contentArea.classList.add('hidden');
            destroyCharts();
            return;
        }
        
        if (emptyState) emptyState.classList.add('hidden');
        if (contentArea) contentArea.classList.remove('hidden');
        
        // Populate stats widgets
        document.getElementById('dash-streak').innerText = `${data.streak_days} Day${data.streak_days !== 1 ? 's' : ''}`;
        document.getElementById('dash-count').innerText = data.entries_count.toString();
        
        // Render Trend & Pattern Charts
        renderCharts(data);
        
    } catch (err) {
        showError(err.message);
        console.error("Dashboard error:", err);
    }
}

function destroyCharts() {
    if (stressChart) {
        stressChart.destroy();
        stressChart = null;
    }
    if (emotionsChart) {
        emotionsChart.destroy();
        emotionsChart = null;
    }
}

function renderCharts(data) {
    destroyCharts();
    
    // YYYY-MM-DD stress dataset
    const sortedDates = Object.keys(data.stress_by_date).sort();
    const stressLevels = sortedDates.map(date => data.stress_by_date[date]);
    
    // Line Chart (Stress trend)
    const ctxStress = document.getElementById('chart-stress').getContext('2d');
    stressChart = new Chart(ctxStress, {
        type: 'line',
        data: {
            labels: sortedDates,
            datasets: [{
                label: 'Average Daily Stress (1-10)',
                data: stressLevels,
                borderColor: '#319795', // Teal
                backgroundColor: 'rgba(49, 151, 149, 0.12)',
                borderWidth: 3,
                tension: 0.3,
                fill: true,
                pointBackgroundColor: '#9f7aea', // Purple pointers
                pointBorderColor: '#fff',
                pointRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#f7fafc', font: { family: 'Plus Jakarta Sans' } }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#a0aec0', font: { family: 'Plus Jakarta Sans' } }
                },
                y: {
                    min: 1,
                    max: 10,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#a0aec0', stepSize: 1, font: { family: 'Plus Jakarta Sans' } }
                }
            }
        }
    });
    
    // Emotions Distribution Chart
    const emotionsLabels = Object.keys(data.top_emotions);
    const emotionsCounts = Object.values(data.top_emotions);
    
    // Pie / Doughnut Chart
    const ctxEmotions = document.getElementById('chart-emotions').getContext('2d');
    emotionsChart = new Chart(ctxEmotions, {
        type: 'doughnut',
        data: {
            labels: emotionsLabels,
            datasets: [{
                data: emotionsCounts,
                backgroundColor: [
                    '#9f7aea', // Purple
                    '#319795', // Teal
                    '#dd6b20', // Saffron
                    '#3182ce', // Blue
                    '#e53e3e', // Red
                    '#ecc94b'  // Yellow
                ],
                borderWidth: 1,
                borderColor: 'rgba(10, 8, 21, 0.9)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#f7fafc', font: { family: 'Plus Jakarta Sans' } }
                }
            }
        }
    });
}

// Empathetic Conversational Chat Tab
async function handleChatSubmit(event) {
    event.preventDefault();
    dismissError();
    
    if (!verifyCallLimit()) return;
    
    const inputEl = document.getElementById('chat-input');
    const sendBtn = document.getElementById('btn-send-chat');
    const spinner = document.getElementById('chat-spinner');
    const logEl = document.getElementById('chat-log');
    
    if (!inputEl || !inputEl.value.trim()) return;
    
    const userMessageText = inputEl.value.trim();
    inputEl.value = '';
    
    // Append user message immediately
    appendChatMessage('user', userMessageText);
    
    // Update local chat history (last 5 messages)
    chatHistory.push({ role: 'user', content: userMessageText });
    if (chatHistory.length > 5) {
        chatHistory.shift();
    }
    
    // Toggle Loading
    if (spinner) spinner.classList.remove('hidden');
    if (sendBtn) sendBtn.disabled = true;
    
    // Collect contextual details from the Journal tab selection
    const examEl = document.getElementById('journal-exam');
    const moodEl = document.querySelector('input[name="mood"]:checked');
    const currentExam = examEl ? examEl.value : 'General';
    const currentMood = moodEl ? moodEl.value : 'Neutral';
    
    try {
        incrementCallCount();
        const response = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: chatHistory,
                exam: currentExam,
                mood: currentMood
            })
        });
        
        let data;
        const rawText = await response.text();
        try {
            data = JSON.parse(rawText);
        } catch (parseErr) {
            throw new Error(`Failed to parse coach response: ${parseErr.message}. Raw: ${rawText}`);
        }
        
        if (!response.ok) {
            throw new Error(data.error || `Coach response failed: status ${response.status}`);
        }
        
        // Append coach message
        appendChatMessage('coach', data.response);
        
        // Add to history
        chatHistory.push({ role: 'assistant', content: data.response });
        if (chatHistory.length > 5) {
            chatHistory.shift();
        }
        
    } catch (err) {
        appendChatMessage('error', `Unable to reach AI: ${err.message}`);
        console.error("Chat error:", err);
    } finally {
        if (spinner) spinner.classList.add('hidden');
        if (sendBtn) sendBtn.disabled = false;
        updateUsageBar();
    }
}

function appendChatMessage(role, content) {
    const logEl = document.getElementById('chat-log');
    if (!logEl) return;
    
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble ${role}`;
    bubble.innerText = content;
    
    logEl.appendChild(bubble);
    
    // Scroll to bottom
    logEl.scrollTop = logEl.scrollHeight;
}
