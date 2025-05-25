// main.js

const PASTE_MATCH_THRESHOLD = 0.6; // Segment must be at least 60% similar to an original paste

document.addEventListener('DOMContentLoaded', () => {

    const jsEditor = document.getElementById('jsEditor');
    const highlightedOutputContainer = document.getElementById('highlighted-output-container');
    const analysisButton = document.getElementById('analysisButton');
    const printButton = document.getElementById('printButton');
    const themeLightBtn = document.getElementById('themeLightBtn');
    const themeDarkBtn = document.getElementById('themeDarkBtn');
    const themeBlueNeonBtn = document.getElementById('themeBlueNeonBtn');

    const statSessionTimeEl = document.getElementById('statSessionTime');
    const statTypedCharsEl = document.getElementById('statTypedChars');
    const statPastedCharsEl = document.getElementById('statPastedChars');
    const statAvgSpeedEl = document.getElementById('statAvgSpeed');
    const statBackspacesEl = document.getElementById('statBackspaces');
    const statDeletesEl = document.getElementById('statDeletes');
    const statPasteCountEl = document.getElementById('statPasteCount');

    const dashboardModalOverlay = document.getElementById('dashboardModalOverlay');
    const closeDashboardModalBtn = document.getElementById('closeDashboardModalBtn');
    const dashboardFrame = document.getElementById('dashboardFrame');

    // --- Constants ---
    const THEME_STORAGE_KEY = 'studentTrackerTheme';
    const SESSION_DATA_KEY = 'studentTrackingDataAll';
    const WORD_AVG_LENGTH = 5; // For WPM calculation
    // const PASTE_CHECK_THRESHOLD_MS = 100; // Time window to consider rapid input as potential paste - Not directly used in this version's paste logic
    // const MIN_CHARS_FOR_WPM_CALC = 10; // Not directly used for global WPM calc logic here
    // const ANOMALY_WPM_INCREASE_FACTOR = 1.5; // 50% increase - For more advanced WPM analysis not implemented
    // const FAST_NO_MISTAKE_WPM_THRESHOLD = 60; // For category not implemented
    // const SLOW_WPM_THRESHOLD = 20; // For category not implemented
    const MAX_PAUSE_MS_FOR_CONTINUOUS_TYPING = 2000; // 2 seconds
    const TEXT_ANALYSIS_DEBOUNCE_MS = 500;

    // --- State Variables ---
    let currentTheme = 'light';
    let allSessionsData = [];
    let currentSessionData = {};
    let sessionIntervalId = null;
    let lastInputTimestamp = 0;
    let lastInputType = null; // 'char', 'backspace', 'delete', 'paste', 'undo'
    let lastCharTypedTimestamp = 0;
    let lastContentBeforeChange = ""; // For detecting type of change in 'input' event

    let typingAnalysisTimeout;
    let correctionHappenedSinceLastCharInput = false;

    // --- Initialization ---
    function init() {
        loadAllSessions();
        loadTheme();
        startNewSession();
        setupEventListeners();
        jsEditor.focus();
        lastContentBeforeChange = jsEditor.value;
    }

    function setupEventListeners() {
        jsEditor.addEventListener('input', handleEditorInput);
        jsEditor.addEventListener('paste', handlePaste);
        jsEditor.addEventListener('keydown', handleKeyDown);
        jsEditor.addEventListener('focus', handleEditorFocus);
        jsEditor.addEventListener('blur', handleEditorBlur);

        analysisButton.addEventListener('click', openDashboardModal);
        printButton.addEventListener('click', printEditorContent);
        closeDashboardModalBtn.addEventListener('click', closeDashboardModal);

        themeLightBtn.addEventListener('click', () => applyTheme('light'));
        themeDarkBtn.addEventListener('click', () => applyTheme('dark'));
        themeBlueNeonBtn.addEventListener('click', () => applyTheme('blue-neon'));

        window.addEventListener('beforeunload', finalizeAndSaveSession);
    }

    // --- Theme Management ---
    function applyTheme(themeName) {
        document.body.className = '';
        document.body.classList.add(`theme-${themeName}`);
        currentTheme = themeName;
        localStorage.setItem(THEME_STORAGE_KEY, themeName);

        [themeLightBtn, themeDarkBtn, themeBlueNeonBtn].forEach(btn => btn.classList.remove('active-theme'));
        if (themeName === 'light') themeLightBtn.classList.add('active-theme');
        else if (themeName === 'dark') themeDarkBtn.classList.add('active-theme');
        else if (themeName === 'blue-neon') themeBlueNeonBtn.classList.add('active-theme');

        if (dashboardModalOverlay.classList.contains('show') && dashboardFrame.contentWindow) {
            dashboardFrame.contentWindow.postMessage({ type: 'SET_THEME', theme: themeName }, '*');
        }
        jsEditor.style.opacity = '1';
    }

    function loadTheme() {
        const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
        applyTheme(savedTheme);
    }

    // --- Session Management ---
    function startNewSession() {
        finalizeAndSaveSession();

        currentSessionData = {
            sessionId: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            startTime: Date.now(),
            endTime: null,
            totalActiveTimeMs: 0,
            jsEditorFocusTimeMs: 0,
            typedChars: 0,
            pastedChars: 0,
            backspaceCount: 0,
            deleteCount: 0,
            undoCount: 0,
            pasteEventsCount: 0,
            pastedSegmentsDetails: [],
            typingEvents: [],
            sentenceStats: [], // Stores {text, category, wpm} for each segment from the *last* analysis pass
            contentSegments: [],
            currentFullText: "",
            errors: [],
            totalTypedWordsForSession: 0,
            totalTypedTimeForSessionMs: 0,
            averageWPM: 0,
        };
        lastInputTimestamp = Date.now();
        lastCharTypedTimestamp = Date.now();
        correctionHappenedSinceLastCharInput = false;


        if (sessionIntervalId) clearInterval(sessionIntervalId);
        sessionIntervalId = setInterval(updateSessionTime, 1000);
        updateStatsBar();

        highlightedOutputContainer.innerHTML = '<span style="color: var(--text-secondary);">Start typing to see analysis...</span>';
        jsEditor.value = "";
        lastContentBeforeChange = "";
    }

    function finalizeAndSaveSession() {
        if (!currentSessionData || !currentSessionData.startTime) return;

        currentSessionData.endTime = Date.now();
        currentSessionData.currentFullText = jsEditor.value;

        if (currentSessionData.totalTypedTimeForSessionMs > 0 && currentSessionData.totalTypedWordsForSession > 0) {
            const minutes = currentSessionData.totalTypedTimeForSessionMs / 60000;
            currentSessionData.averageWPM = Math.round(currentSessionData.totalTypedWordsForSession / minutes);
        } else {
            currentSessionData.averageWPM = 0;
        }

        if (currentSessionData.typedChars > 0 || currentSessionData.pastedChars > 0 || currentSessionData.jsEditorFocusTimeMs > 1000) {
            allSessionsData = allSessionsData.filter(s => s.sessionId !== currentSessionData.sessionId);
            allSessionsData.push({ ...currentSessionData });
            saveAllSessions();
        }
        currentSessionData = {};
        if (sessionIntervalId) clearInterval(sessionIntervalId);
        sessionIntervalId = null;
    }

    function loadAllSessions() {
        const storedData = localStorage.getItem(SESSION_DATA_KEY);
        allSessionsData = storedData ? JSON.parse(storedData) : [];
    }

    function saveAllSessions() {
        localStorage.setItem(SESSION_DATA_KEY, JSON.stringify(allSessionsData));
    }

    function updateSessionTime() {
        if (document.hasFocus() && document.activeElement === jsEditor) {
            currentSessionData.jsEditorFocusTimeMs = (currentSessionData.jsEditorFocusTimeMs || 0) + 1000;
        }
        currentSessionData.totalActiveTimeMs = (currentSessionData.totalActiveTimeMs || 0) + 1000;
        updateStatsBar();
    }

    // --- Editor Event Handlers ---
    function handleEditorFocus() {
        jsEditor.style.opacity = '1';
        if (!currentSessionData.startTime) {
            startNewSession();
        }
        lastInputTimestamp = Date.now();
    }

    function handleEditorBlur() {
        recordPauseEvent(Date.now());
    }

    function handleKeyDown(event) {
        const now = Date.now();
        recordPauseEvent(now);
        const key = event.key;

        let isCorrectionKey = false;
        if (key === 'Backspace' || key === 'Delete' || (event.ctrlKey && (key === 'z' || key === 'Z'))) {
            isCorrectionKey = true;
            if (key === 'Backspace') {
                currentSessionData.backspaceCount++;
                lastInputType = 'backspace';
            } else if (key === 'Delete') {
                currentSessionData.deleteCount++;
                lastInputType = 'delete';
            } else if (event.ctrlKey && (key === 'z' || key === 'Z')) {
                currentSessionData.undoCount++;
                lastInputType = 'undo';
            }
            currentSessionData.typingEvents.push({ type: lastInputType, timestamp: now, charCount: -1 });
            correctionHappenedSinceLastCharInput = true;
        } else {
            // Not a correction key by itself, though it might lead to input event
        }

        lastInputTimestamp = now;
        if (isCorrectionKey) {
            scheduleTextAnalysis();
        }
    }

    function handlePaste(event) {
        const now = Date.now();
        recordPauseEvent(now);

        const pastedText = (event.clipboardData || window.clipboardData).getData('text');
        currentSessionData.pastedChars += pastedText.length;
        currentSessionData.pasteEventsCount++;
        const wordCount = Math.ceil(pastedText.length / WORD_AVG_LENGTH);
        currentSessionData.pastedSegmentsDetails.push({
            timestamp: now, text: pastedText, charCount: pastedText.length, wordCount: wordCount
        });
        currentSessionData.typingEvents.push({ type: 'paste', timestamp: now, text: pastedText, charCount: pastedText.length });
        lastInputType = 'paste';
        lastInputTimestamp = now;
        // `correctionHappenedSinceLastCharInput` will be set to false in `handleEditorInput`
        // Analysis scheduled in `handleEditorInput`
    }

    function handleEditorInput(event) {
        const now = Date.now();
        const currentText = jsEditor.value;

        recordPauseEvent(now);

        if (event.inputType === 'insertText') {
            const typedCharsInEvent = event.data || (currentText.length > lastContentBeforeChange.length ? currentText.substring(lastContentBeforeChange.length) : "");
            if (typedCharsInEvent) {
                currentSessionData.typedChars += typedCharsInEvent.length;
                currentSessionData.totalTypedWordsForSession = Math.floor(currentSessionData.typedChars / WORD_AVG_LENGTH);
                const charDurationMs = now - lastCharTypedTimestamp;
                currentSessionData.typingEvents.push({ type: 'char', timestamp: now, char: typedCharsInEvent, durationMs: charDurationMs });
                if (charDurationMs < MAX_PAUSE_MS_FOR_CONTINUOUS_TYPING && charDurationMs > 0) {
                    currentSessionData.totalTypedTimeForSessionMs = (currentSessionData.totalTypedTimeForSessionMs || 0) + charDurationMs;
                }
            }
            lastCharTypedTimestamp = now;
            lastInputType = 'char';
            correctionHappenedSinceLastCharInput = false;
        } else if (event.inputType === 'insertFromPaste') {
            lastInputType = 'paste'; // Already set in handlePaste, but good to be defensive
            correctionHappenedSinceLastCharInput = false;
        } else if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
            // This covers Ctrl+Z/Y if browser fires 'input' for it.
            // `handleKeyDown` already sets `correctionHappenedSinceLastCharInput = true` for Ctrl+Z.
            // If it's an undo, we want the correction flag.
            if (event.inputType === 'historyUndo') {
                 correctionHappenedSinceLastCharInput = true; // Ensure it's set
                 lastInputType = 'undo'; // Update last input type
            } else {
                 correctionHappenedSinceLastCharInput = false; // Redo might not be a "correction" in the same sense
                 lastInputType = 'redo';
            }
        } else if (event.inputType && (event.inputType.startsWith('delete'))) {
            // e.g. 'deleteContentBackward', 'deleteContentForward'
            // `handleKeyDown` should have set correctionHappenedSinceLastCharInput = true
            // We can ensure it here if keydown didn't catch it or for other delete types.
            correctionHappenedSinceLastCharInput = true;
            if(!lastInputType?.startsWith('delete')) lastInputType = event.inputType;
        }


        lastInputTimestamp = now;
        lastContentBeforeChange = currentText;
        scheduleTextAnalysis();
    }

    function recordPauseEvent(currentTime) {
        const pauseDuration = currentTime - lastInputTimestamp;
        if (pauseDuration > MAX_PAUSE_MS_FOR_CONTINUOUS_TYPING && lastInputTimestamp > 0 && currentSessionData.typingEvents) {
            const lastEvent = currentSessionData.typingEvents[currentSessionData.typingEvents.length - 1];
            if (lastEvent && lastEvent.type !== 'pause' && (currentSessionData.typedChars > 0 || currentSessionData.pastedChars > 0 || currentSessionData.backspaceCount > 0 || currentSessionData.deleteCount > 0) ) {
                currentSessionData.typingEvents.push({
                    type: 'pause', timestamp: lastInputTimestamp, durationMs: pauseDuration
                });
            }
        }
    }

    function scheduleTextAnalysis() {
        clearTimeout(typingAnalysisTimeout);
        typingAnalysisTimeout = setTimeout(() => {
            if (currentSessionData && currentSessionData.startTime) {
                analyzeAndHighlightText();
                updateStatsBar();
            }
        }, TEXT_ANALYSIS_DEBOUNCE_MS);
    }

    function analyzeAndHighlightText() {
        const fullText = jsEditor.value;
        if (!currentSessionData || !currentSessionData.startTime) return;
    
        currentSessionData.currentFullText = fullText;
        const newContentSegments = [];
        const newSentenceStats = []; // For dashboard and carry-over logic
        const previousAnalysisSentenceStats = currentSessionData.sentenceStats || [];
    
        let currentSessionAverageWPM = 0;
        if (currentSessionData.totalTypedTimeForSessionMs > 0 && currentSessionData.totalTypedWordsForSession > 0) {
            const minutes = currentSessionData.totalTypedTimeForSessionMs / 60000;
            currentSessionAverageWPM = Math.round(currentSessionData.totalTypedWordsForSession / minutes);
        } else {
            currentSessionAverageWPM = currentSessionData.averageWPM || 0; // Use last calculated if available
        }
    
    
        const sentences = fullText.split(/([.!?\n]+)\s*/g).reduce((acc, part, i, arr) => {
            if (i % 2 === 0 && part.trim()) acc.push(part + (arr[i + 1] || '').trim());
            return acc;
        }, []).filter(s => s.trim().length > 0);
    
        let charOffsetInFullText = 0;
    
        for (let i = 0; i < sentences.length; i++) {
            const sentenceText = sentences[i]; // Ensure sentenceText is defined in this scope
            let segmentText = sentenceText;
        const sentenceStartIndex = fullText.indexOf(sentenceText, charOffsetInFullText);
        if (sentenceStartIndex !== -1) {
            segmentText = fullText.substring(sentenceStartIndex, sentenceStartIndex + sentenceText.length);
            charOffsetInFullText = sentenceStartIndex + segmentText.length;
        } else {
            charOffsetInFullText += sentenceText.length;
        }

    
    
        let isPastedSegment = false;
        const currentSegmentTrimmed = segmentText.trim();

            if (currentSessionData.pastedSegmentsDetails && currentSegmentTrimmed.length > 0) {
                for (const paste of currentSessionData.pastedSegmentsDetails) {
                    const originalPasteTrimmed = paste.text.trim();
                    if (originalPasteTrimmed.length === 0) continue;
                    if (originalPasteTrimmed === currentSegmentTrimmed) { isPastedSegment = true; break; }
                    if (originalPasteTrimmed.includes(currentSegmentTrimmed) && originalPasteTrimmed.length > 5 && currentSegmentTrimmed.length > 0) {
                         isPastedSegment = true; break;
                    }
                    const distance = levenshteinDistance(originalPasteTrimmed, currentSegmentTrimmed);
                    const maxLength = Math.max(originalPasteTrimmed.length, currentSegmentTrimmed.length);
                    const similarity = maxLength > 0 ? (maxLength - distance) / maxLength : 0;
                    if (similarity >= PASTE_MATCH_THRESHOLD) { isPastedSegment = true; break; }
                }
            }
    

        let category = 'highlight-no-mistake';
        const isLastSegment = (i === sentences.length - 1);
    
            // --- For Sentence Stats Object (used by dashboard and carry-over) ---
            // We will try to get more detailed stats for the dashboard later.
            // For now, live tooltips in main.js will be simpler.
            let sentenceStatObject = {
                text: segmentText.substring(0, 150), // For matching and dashboard display
                wpm: currentSessionAverageWPM > 0 ? currentSessionAverageWPM : (isPastedSegment ? 0 : 25),
                category: '', // Will be set below
                typedChars: 0, // Placeholder - true per-sentence needs more logic
                typedDurationMs: 0, // Placeholder
                backspaces: 0, // Placeholder
                deletes: 0, // Placeholder
                undos: 0, // Placeholder
                pasteInfluence: isPastedSegment ? segmentText.length : 0,
                startTime: Date.now() // Approximate, could be refined
            };
    
    
            if (isPastedSegment) {
                category = 'highlight-pasted';
            } else {
                if (isLastSegment) {
                    if (correctionHappenedSinceLastCharInput) {
                        category = 'highlight-corrected';
                    } else {
                        if (previousAnalysisSentenceStats.length === sentences.length &&
                            previousAnalysisSentenceStats[i] &&
                            previousAnalysisSentenceStats[i].category === 'highlight-corrected') {
                            category = 'highlight-corrected';
                        } else {
                            category = 'highlight-no-mistake';
                        }
                    }
                } else {
                    const previousStatForThisText = previousAnalysisSentenceStats.find(
                        s => s.text && segmentText && s.text.substring(0, 100) === segmentText.substring(0, 100)
                    );
                    if (previousStatForThisText && previousStatForThisText.category === 'highlight-corrected') {
                        category = 'highlight-corrected';
                    } else {
                        category = 'highlight-no-mistake';
                    }
                }
            }
            sentenceStatObject.category = category; // Update category in stat object
    
            // Add to newContentSegments for rendering highlighted output
            newContentSegments.push({
                text: segmentText,
                category: category,
                wpm: sentenceStatObject.wpm, // Pass WPM for tooltip
                // For live tooltips, direct per-sentence B/D/U counts are hard.
                // We can show session totals or a general "corrected" status.
                isCorrected: category === 'highlight-corrected',
                sessionBackspaces: currentSessionData.backspaceCount,
                sessionDeletes: currentSessionData.deleteCount,
                sessionUndos: currentSessionData.undoCount
            });
            newSentenceStats.push(sentenceStatObject);
            
        }
    
        // Fallback for unsplit text
        if (fullText.length > 0 && newContentSegments.length === 0) {
            let category = 'highlight-no-mistake';
            let isPastedFullBlock = false;
            // ... (paste detection logic for full block as before, using Levenshtein) ...
            const fullTextTrimmed = fullText.trim();
            if (currentSessionData.pastedSegmentsDetails && fullTextTrimmed.length > 0) {
                for (const paste of currentSessionData.pastedSegmentsDetails) {
                    const originalPasteTrimmed = paste.text.trim();
                    if (originalPasteTrimmed.length === 0) continue;
                    if (originalPasteTrimmed === fullTextTrimmed) { isPastedFullBlock = true; break; }
                    const distance = levenshteinDistance(originalPasteTrimmed, fullTextTrimmed);
                    const maxLength = Math.max(originalPasteTrimmed.length, fullTextTrimmed.length);
                    const similarity = maxLength > 0 ? (maxLength - distance) / maxLength : 0;
                    if (similarity >= PASTE_MATCH_THRESHOLD) { isPastedFullBlock = true; break; }
                }
            }
    
            if (isPastedFullBlock) {
                category = 'highlight-pasted';
            } else {
                if (correctionHappenedSinceLastCharInput) {
                    category = 'highlight-corrected';
                } else {
                    if (previousAnalysisSentenceStats.length === 1 &&
                        previousAnalysisSentenceStats[0].category === 'highlight-corrected') {
                        category = 'highlight-corrected';
                    } else {
                        category = 'highlight-no-mistake';
                    }
                }
            }
            const fallbackWpm = currentSessionAverageWPM > 0 ? currentSessionAverageWPM : (isPastedFullBlock ? 0 : 25);
            newContentSegments.push({
                text: fullText,
                category: category,
                wpm: fallbackWPM,
                isCorrected: category === 'highlight-corrected',
                sessionBackspaces: currentSessionData.backspaceCount,
                sessionDeletes: currentSessionData.deleteCount,
                sessionUndos: currentSessionData.undoCount
            });
            newSentenceStats.push({
                text: fullText.substring(0,150), wpm: fallbackWpm, category: category,
                typedChars: 0, typedDurationMs: 0, backspaces: 0, deletes: 0, undos: 0,
                pasteInfluence: isPastedFullBlock ? fullText.length : 0, startTime: Date.now()
            });
        }
    
        currentSessionData.contentSegments = newContentSegments;
        currentSessionData.sentenceStats = newSentenceStats; // This is vital for dashboard
        renderHighlightedTextOutput();
    }
    

    function levenshteinDistance(a, b) { /* ... (keep existing function) ... */
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

    

function renderHighlightedTextOutput() {
    highlightedOutputContainer.innerHTML = '';
    if (currentSessionData.contentSegments && currentSessionData.contentSegments.length > 0) {
        currentSessionData.contentSegments.forEach(segment => {
            const span = document.createElement('span');
            span.textContent = segment.text;
            if (segment.category) {
                span.className = segment.category;
            }

            // --- Build Tooltip Title ---
            let tooltipTitle = [];
            if (segment.category === 'highlight-pasted') {
                tooltipTitle.push('Pasted Content');
            } else {
                tooltipTitle.push(`Approx. WPM: ${segment.wpm}`);
                // No reliable live per-sentence duration
                // tooltipTitle.push(`Duration: N/A`); 
                if (segment.isCorrected) {
                    tooltipTitle.push(`Status: Corrected`);
                }
            }
            // Add session totals for corrections as an alternative
            tooltipTitle.push(`Session B/S: ${segment.sessionBackspaces}`);
            tooltipTitle.push(`Session Del: ${segment.sessionDeletes}`);
            tooltipTitle.push(`Session Undo: ${segment.sessionUndos}`);
            
            span.title = tooltipTitle.join('\n'); // Newline for better readability in tooltip
            // --- End Tooltip Title ---

            highlightedOutputContainer.appendChild(span);
        });
    } else if (jsEditor.value.length > 0) {
        highlightedOutputContainer.textContent = jsEditor.value;
    } else {
        highlightedOutputContainer.innerHTML = '<span style="color: var(--text-secondary);">Start typing to see analysis...</span>';
    }
    highlightedOutputContainer.scrollTop = highlightedOutputContainer.scrollHeight;
}


    function updateStatsBar() {
        if (!currentSessionData || !currentSessionData.startTime) {
            // Update initial display to reflect minute/second format
            statSessionTimeEl.textContent = '0m 0s'; // Or '0 min' if you prefer
            statTypedCharsEl.textContent = '0';
            statPastedCharsEl.textContent = '0';
            statAvgSpeedEl.textContent = '0 WPM';
            statBackspacesEl.textContent = '0';
            statDeletesEl.textContent = '0';
            statPasteCountEl.textContent = '0';
            return;
        }

        const totalSessionMs = currentSessionData.totalActiveTimeMs || 0;
        const totalSessionSeconds = Math.floor(totalSessionMs / 1000);

        const minutes = Math.floor(totalSessionSeconds / 60);
        const seconds = totalSessionSeconds % 60;

        // Display session time in "Xm Ys" format
        statSessionTimeEl.textContent = `${minutes}m ${seconds}s`;

        statTypedCharsEl.textContent = currentSessionData.typedChars || 0;
        statPastedCharsEl.textContent = currentSessionData.pastedChars || 0;

        let wpm = 0;
        if (currentSessionData.totalTypedTimeForSessionMs > 0 && currentSessionData.totalTypedWordsForSession > 0) {
            const typingMinutes = currentSessionData.totalTypedTimeForSessionMs / 60000; // Already in minutes
            wpm = Math.round(currentSessionData.totalTypedWordsForSession / typingMinutes);
        } else if (currentSessionData.typedChars > 0 && totalSessionSeconds > 5) {
            const sessionMinutesForWPM = totalSessionSeconds / 60; // Convert total session seconds to minutes
            const wordsFromTotalChars = Math.floor((currentSessionData.typedChars || 0) / WORD_AVG_LENGTH);
            if (sessionMinutesForWPM > 0) {
                 wpm = Math.round(wordsFromTotalChars / sessionMinutesForWPM);
            }
        }
        statAvgSpeedEl.textContent = `${wpm} WPM`;
        currentSessionData.averageWPM = wpm;

        statBackspacesEl.textContent = currentSessionData.backspaceCount || 0;
        statDeletesEl.textContent = currentSessionData.deleteCount || 0;
        statPasteCountEl.textContent = currentSessionData.pasteEventsCount || 0;
    }

    
    function openDashboardModal() {
        finalizeAndSaveSession();
        dashboardFrame.src = `dashboard.html#theme=${currentTheme}`;
        dashboardFrame.onload = () => { /* dashboard.js handles theme and data */ };
        dashboardModalOverlay.classList.add('show');
        startNewSession();
    }

    function closeDashboardModal() {
        dashboardModalOverlay.classList.remove('show');
        dashboardFrame.src = 'about:blank';
    }

    function printEditorContent() {
        const printableArea = document.createElement('div');
        printableArea.innerHTML = highlightedOutputContainer.innerHTML;
        const style = document.createElement('style');
        style.textContent = `
            @media print {
                body * { visibility: hidden; }
                .printable-content, .printable-content * { visibility: visible; }
                .printable-content { position: absolute; left: 0; top: 0; width: 100%; font-family: monospace; }
                .highlight-pasted { border: 1px solid #ccc; padding: 2px; background-color: #ffe0e0 !important; color: black !important; }
                .highlight-corrected { background-color: #e0ffe0 !important; color: black !important; }
                .highlight-no-mistake { background-color: #ffffdd !important; color: black !important; }
                span { white-space: pre-wrap !important; word-break: break-all !important; display: inline !important; }
            }
        `;
        document.head.appendChild(style);
        printableArea.classList.add('printable-content');
        document.body.appendChild(printableArea);
        window.print();
        document.body.removeChild(printableArea);
        document.head.removeChild(style);
    }

    init();
});