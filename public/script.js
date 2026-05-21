const API_URL = '/api';

const state = {
    authToken: localStorage.getItem('authToken'),
    currentDream: null,
    context: {},
    conversationHistory: [],
    isProcessing: false,
    assistantProcessing: false
};

document.addEventListener('DOMContentLoaded', () => {
    setCopyrightYear();
    initNavigation();
    initDreamAnalysis();
    initAssistant();
});

function setCopyrightYear() {
    const year = document.getElementById('year');
    if (year) year.textContent = new Date().getFullYear();
}

function initNavigation() {
    const hamburger = document.querySelector('.hamburger');
    const navLinks = document.querySelector('.nav-links');
    const navbar = document.querySelector('.navbar');

    if (hamburger && navLinks) {
        hamburger.addEventListener('click', () => {
            hamburger.classList.toggle('active');
            navLinks.classList.toggle('active');
        });

        navLinks.querySelectorAll('a').forEach((link) => {
            link.addEventListener('click', () => {
                hamburger.classList.remove('active');
                navLinks.classList.remove('active');
            });
        });
    }

    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
        anchor.addEventListener('click', (event) => {
            const targetId = anchor.getAttribute('href');
            const target = targetId ? document.querySelector(targetId) : null;

            if (!target) return;

            event.preventDefault();
            const offset = navbar ? navbar.offsetHeight : 0;
            window.scrollTo({
                top: target.offsetTop - offset,
                behavior: 'smooth'
            });
        });
    });

    if (navbar) {
        window.addEventListener('scroll', () => {
            navbar.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
            navbar.style.boxShadow = window.scrollY > 50
                ? '0 2px 10px rgba(0, 0, 0, 0.1)'
                : 'var(--shadow)';
        });
    }
}

function initDreamAnalysis() {
    const dreamForm = document.getElementById('dream-form');
    const analysisChatForm = document.getElementById('analysis-chat-form');
    const analysisQuery = document.getElementById('analysis-query');

    if (dreamForm) {
        dreamForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            if (state.isProcessing) return;

            const dreamData = {
                description: getValue('dream-description'),
                sleepQuality: getValue('sleep-quality') || 'average',
                sleepHours: getValue('sleep-hours') || '7',
                feelings: getValue('feelings')
            };

            if (!dreamData.description) {
                showAnalysisError('Please describe your dream.');
                return;
            }

            const result = await submitDream(dreamData);
            if (!result) return;

            state.currentDream = dreamData.description;
            state.context = {
                sleepQuality: dreamData.sleepQuality,
                sleepHours: dreamData.sleepHours,
                feelings: dreamData.feelings,
                timestamp: new Date().toISOString()
            };
            state.conversationHistory = [];

            clearAnalysisMessages();
            appendAnalysisMessage({
                text: dreamData.description,
                type: 'user',
                metadata: {
                    sleepQuality: dreamData.sleepQuality,
                    sleepHours: dreamData.sleepHours,
                    feelings: dreamData.feelings
                }
            });

            try {
                state.isProcessing = true;
                const typing = showAnalysisTyping();
                const analysis = await generateDreamAnalysis();
                typing.remove();
                appendAnalysisMessage({ text: analysis, type: 'ai' });
                updateAnalysisSuggestions(dreamData.description);
                if (analysisQuery) analysisQuery.focus();
            } catch (error) {
                showAnalysisError('An error occurred while analyzing your dream. Please try again.');
            } finally {
                state.isProcessing = false;
            }
        });
    }

    if (analysisChatForm && analysisQuery) {
        analysisChatForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            await handleAnalysisQuestion(analysisQuery.value);
            analysisQuery.value = '';
        });
    }

    document.addEventListener('click', async (event) => {
        const chip = event.target.closest('[data-analysis-suggestion]');
        if (!chip) return;
        await handleAnalysisQuestion(chip.textContent.trim());
    });
}

async function submitDream(dreamData) {
    if (!state.authToken) {
        sessionStorage.setItem('pendingDream', JSON.stringify(dreamData));
        window.location.href = '/login';
        return null;
    }

    try {
        const response = await fetch(`${API_URL}/dreams`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${state.authToken}`
            },
            body: JSON.stringify(dreamData)
        });

        const data = await response.json().catch(() => ({}));

        if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('authToken');
            state.authToken = null;
            window.location.href = '/login';
            return null;
        }

        if (!response.ok) {
            showAnalysisError(data.message || 'Unable to submit your dream.');
            return null;
        }

        return data;
    } catch (error) {
        showAnalysisError('Unable to reach the dream analysis server.');
        return null;
    }
}

async function handleAnalysisQuestion(query) {
    const cleanQuery = String(query || '').trim();
    if (!cleanQuery || state.isProcessing) return;

    if (!state.currentDream) {
        showAnalysisError('Share a dream first, then ask follow-up questions.');
        return;
    }

    try {
        state.isProcessing = true;
        appendAnalysisMessage({ text: cleanQuery, type: 'user' });
        const typing = showAnalysisTyping();
        const response = await generateFollowUpResponse(cleanQuery);
        typing.remove();
        appendAnalysisMessage({ text: response, type: 'ai' });
        updateAnalysisSuggestions(cleanQuery);
    } catch (error) {
        showAnalysisError('An error occurred while processing your question. Please try again.');
    } finally {
        state.isProcessing = false;
    }
}

function initAssistant() {
    const assistantToggle = document.querySelector('.assistant-toggle');
    const chatBox = document.querySelector('.chat-box');
    const assistantForm = document.getElementById('assistant-form');
    const assistantInput = document.getElementById('assistant-query');

    if (assistantToggle && chatBox && assistantInput) {
        assistantToggle.addEventListener('click', () => {
            chatBox.classList.toggle('active');
            assistantInput.focus();
        });
    }

    if (assistantForm && assistantInput) {
        assistantForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const message = assistantInput.value.trim();
            assistantInput.value = '';
            await handleAssistantInput(message);
        });
    }

    document.addEventListener('click', async (event) => {
        const chip = event.target.closest('[data-assistant-suggestion]');
        if (!chip) return;
        await handleAssistantInput(chip.textContent.trim());
    });
}

async function handleAssistantInput(message) {
    if (!message || state.assistantProcessing) return;

    state.assistantProcessing = true;
    appendAssistantMessage(message, 'user');
    const typing = appendAssistantTyping();

    try {
        const response = await processAssistantMessage(message);
        typing.remove();
        appendAssistantMessage(response, 'bot');
        updateAssistantSuggestions(generateAssistantSuggestions(message));
    } catch (error) {
        typing.remove();
        appendAssistantMessage('I am having trouble processing that request. Please try again.', 'bot error');
    } finally {
        state.assistantProcessing = false;
    }
}

function clearAnalysisMessages() {
    const container = document.getElementById('analysis-messages');
    if (!container) return;

    const welcome = container.querySelector('.welcome-message');
    container.innerHTML = '';
    if (welcome) container.appendChild(welcome);
}

function appendAnalysisMessage({ text, type, metadata = {} }) {
    const container = document.getElementById('analysis-messages');
    if (!container) return;

    const message = document.createElement('div');
    message.className = `analysis-message ${type}`;

    const content = document.createElement('div');
    content.className = 'message-content';
    content.textContent = text;
    message.appendChild(content);

    const timestamp = document.createElement('div');
    timestamp.className = 'timestamp';
    timestamp.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    message.appendChild(timestamp);

    if (type === 'user' && Object.keys(metadata).some((key) => metadata[key])) {
        const metadataDiv = document.createElement('div');
        metadataDiv.className = 'message-metadata';
        [
            ['Sleep Quality', metadata.sleepQuality],
            ['Hours', metadata.sleepHours],
            ['Feelings', metadata.feelings]
        ].forEach(([label, value]) => {
            if (!value) return;
            const item = document.createElement('span');
            item.textContent = `${label}: ${value}`;
            metadataDiv.appendChild(item);
        });
        message.appendChild(metadataDiv);
    }

    container.appendChild(message);
    container.scrollTop = container.scrollHeight;
    state.conversationHistory.push({
        role: type === 'user' ? 'user' : 'assistant',
        content: text,
        metadata,
        timestamp: new Date().toISOString()
    });
}

function showAnalysisTyping() {
    const container = document.getElementById('analysis-messages');
    const indicator = document.createElement('div');
    indicator.className = 'typing-indicator';
    indicator.innerHTML = '<span></span><span></span><span></span>';
    if (container) {
        container.appendChild(indicator);
        container.scrollTop = container.scrollHeight;
    }
    return indicator;
}

function showAnalysisError(message) {
    const container = document.getElementById('analysis-messages');
    if (!container) {
        alert(message);
        return;
    }

    const error = document.createElement('div');
    error.className = 'analysis-message error';
    error.textContent = message;
    container.appendChild(error);
    container.scrollTop = container.scrollHeight;
    setTimeout(() => error.remove(), 5000);
}

function updateAnalysisSuggestions(lastMessage) {
    const container = document.querySelector('.dream-result .suggestion-chips');
    if (!container) return;

    const lower = lastMessage.toLowerCase();
    let suggestions = ['Explore symbols', 'Emotional meaning', 'Continue the dream', 'Personal insights'];

    if (lower.includes('nightmare')) {
        suggestions = ['Why nightmares occur', 'Process fear in dreams', 'Transform nightmares', 'Recurring nightmares'];
    } else if (lower.includes('symbol') || lower.includes('mean')) {
        suggestions = ['What do colors symbolize?', 'Interpret animal symbols', 'Common dream symbols', 'Personal symbolism'];
    } else if (lower.includes('feel') || lower.includes('emotion')) {
        suggestions = ['Why these emotions?', 'Connect to daily life', 'Process dream feelings', 'Emotional patterns'];
    }

    container.innerHTML = '';
    suggestions.forEach((suggestion) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'suggestion-chip';
        chip.dataset.analysisSuggestion = 'true';
        chip.textContent = suggestion;
        container.appendChild(chip);
    });
}

function appendAssistantMessage(text, sender) {
    const container = document.querySelector('.chat-box .chat-messages');
    if (!container) return;

    const message = document.createElement('div');
    message.className = `msg ${sender}`;

    const content = document.createElement('div');
    content.className = 'msg-content';
    content.textContent = text;
    message.appendChild(content);

    const timestamp = document.createElement('div');
    timestamp.className = 'msg-timestamp';
    timestamp.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    message.appendChild(timestamp);

    container.appendChild(message);
    container.scrollTop = container.scrollHeight;
}

function appendAssistantTyping() {
    const container = document.querySelector('.chat-box .chat-messages');
    const indicator = document.createElement('div');
    indicator.className = 'msg bot typing';
    indicator.innerHTML = '<div class="typing-indicator"><span></span><span></span><span></span></div>';
    if (container) {
        container.appendChild(indicator);
        container.scrollTop = container.scrollHeight;
    }
    return indicator;
}

function updateAssistantSuggestions(suggestions) {
    const container = document.querySelector('.chat-box .suggestion-chips');
    if (!container) return;

    container.innerHTML = '';
    suggestions.forEach((suggestion) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'suggestion-chip';
        chip.dataset.assistantSuggestion = 'true';
        chip.textContent = suggestion;
        container.appendChild(chip);
    });
}

async function generateDreamAnalysis() {
    await wait(700);
    const dream = state.currentDream.toLowerCase();
    const context = state.context;
    const parts = [
        `Based on your ${context.sleepQuality} sleep quality and ${context.sleepHours} hours of sleep, this dream may reflect how your mind was processing recent emotion and memory.`
    ];

    if (context.feelings) {
        parts.push(`The feeling of ${context.feelings} on waking is important because dream emotion often points to what your attention is trying to resolve.`);
    }

    if (dream.includes('fly') || dream.includes('flying')) {
        parts.push('Flying often points toward freedom, distance from pressure, or a wish to see a situation from above.');
    }
    if (dream.includes('fall') || dream.includes('falling')) {
        parts.push('Falling can suggest uncertainty, loss of control, or a transition that feels hard to steady.');
    }
    if (dream.includes('chase') || dream.includes('running')) {
        parts.push('Being chased may reflect avoidance, pressure, or a conflict your waking mind has not fully faced.');
    }
    if (dream.includes('water')) {
        parts.push('Water often mirrors emotional depth, clarity, overwhelm, or renewal depending on how it appeared.');
    }
    if (dream.includes('house') || dream.includes('home')) {
        parts.push('A house or home commonly represents the self, family patterns, or the private spaces of your life.');
    }

    parts.push('Tell me which symbol, feeling, or scene stood out most, and we can go deeper.');
    return parts.join(' ');
}

async function generateFollowUpResponse(query) {
    await wait(500);
    const lower = query.toLowerCase();

    if (lower.includes('symbol')) {
        return 'Dream symbols become clearer when paired with your own associations. Choose one symbol from the dream and notice the first memory, person, or feeling it brings up.';
    }
    if (lower.includes('continue') || lower.includes('next')) {
        return 'If the dream continued, let the next scene emerge from its strongest emotion. The most useful continuation is usually the one that changes your relationship to the dream, not just the scenery.';
    }
    if (lower.includes('emotion') || lower.includes('feel')) {
        return 'The emotion is the thread to follow. Ask where that feeling appears in waking life, whether it feels familiar, and what the dream allowed you to express indirectly.';
    }
    if (lower.includes('meaning') || lower.includes('interpret')) {
        return 'A grounded interpretation connects the dream image, the emotion, and your current life context. Look for a recent situation that has the same emotional shape as the dream.';
    }
    if (lower.includes('color')) {
        return 'Colors can act like emotional lighting. Bright colors may signal energy or clarity, muted colors may suggest distance, and sharp contrasts may point to tension.';
    }

    return 'That is a useful direction. Focus on the scene that felt most charged, then ask what changed in you before and after that moment.';
}

async function processAssistantMessage(message) {
    await wait(500);
    const lower = message.toLowerCase();

    if (lower.includes('recurring')) {
        return 'Recurring dreams often return because a pattern is still active. Track what repeats, what changes, and what emotion is present each time.';
    }
    if (lower.includes('nightmare')) {
        return 'Nightmares can be the mind rehearsing threat, stress, or unresolved emotion. A helpful first step is naming the fear and imagining one small change that gives you agency.';
    }
    if (lower.includes('lucid')) {
        return 'Lucid dreaming starts with recall. Keep a short dream journal, look for recurring signs, and practice simple reality checks during the day.';
    }
    if (lower.includes('water')) {
        return 'Water often represents emotion. Calm water can suggest steadiness, while waves, floods, or murky water may point to intensity or uncertainty.';
    }
    if (lower.includes('flying')) {
        return 'Flying dreams often carry themes of freedom, perspective, ambition, or escape. The key detail is whether the flight felt effortless or difficult.';
    }
    if (lower.includes('falling')) {
        return 'Falling dreams often show up around stress, uncertainty, or loss of control. The landing, or absence of one, can be just as meaningful as the fall.';
    }

    return 'Share the strongest image from the dream and how it felt. The best interpretations usually start from emotion, then move into symbols.';
}

function generateAssistantSuggestions(message) {
    const lower = message.toLowerCase();

    if (lower.includes('nightmare')) {
        return ['How to stop nightmares?', 'Why do nightmares occur?', 'Dream anxiety', 'Nightmare patterns'];
    }
    if (lower.includes('lucid')) {
        return ['Lucid dreaming techniques', 'Reality checks', 'Dream journal tips', 'Benefits of lucid dreams'];
    }
    if (lower.includes('symbol') || lower.includes('meaning')) {
        return ['Water symbols', 'Flying meaning', 'Falling interpretation', 'Animal symbols'];
    }

    return ['Recurring dreams', 'Interpret my nightmare', 'Common dream symbols', 'How to lucid dream?'];
}

function getValue(id) {
    const element = document.getElementById(id);
    return element ? element.value.trim() : '';
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
