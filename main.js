document.addEventListener('DOMContentLoaded', () => {
    // --- Constants ---
    const THEME_STORAGE_KEY = 'studentTrackerTheme';
    const TRACKING_DATA_KEY = 'studentTrackingDataAll';
    const WORD_AVG_LENGTH = 5;
    const TYPING_PAUSE_THRESHOLD_MS = 1500;
    const DEBOUNCE_ANALYZE_MS = 300;
    const SESSION_SAVE_INTERVAL_MS = 30000;

    // --- DOM Elements ---
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

    // --- State Variables ---
    let sessionStartTime = null;
    let lastActivityTime = null;
    let totalActiveTimeMs = 0;
    let sessionTimerInterval = null;
    let autoSaveInterval = null;

    let typedChars = 0;
    let pastedChars = 0;
    let backspaceCount = 0;
    let deleteCount = 0;
    let pasteCount = 0;
    let undoCount = 0;

    let currentFullText = "";
    let typingEvents = [];
    let sentenceStats = [];

    let isPasting = false;
    let lastInputTimestamp = 0;
    let lastEventTimestamp = 0;

    let currentWordBuffer = "";
    let currentWordStartTime = 0;
    let wordsInCurrentSentence = 0;
    let charsInCurrentSentenceTyped = 0;
    let sentenceStartTime = 0;
    let sentenceTextBuffer = "";
    let sentenceTypedDurationMs = 0;
    let sentenceBackspaces = 0;
    let sentenceDeletes = 0;
    let sentenceUndos = 0;
    let currentSentenceContainedPaste = false;
    let currentSentenceHasBeenCorrected = false;

    let averageWPM = 0;
    let wpmValuesForAvg = [];
    let debounceRenderTimeout;

    // --- Core Logic Functions ---

    function init() {
        loadTheme();
        attachEventListeners();
        startSession();
        jsEditor.focus();
    }

    function startSession() {
        sessionStartTime = Date.now();
        lastActivityTime = Date.now();
        lastEventTimestamp = Date.now();
        totalActiveTimeMs = 0;
        typedChars = 0;
        pastedChars = 0;
        backspaceCount = 0;
        deleteCount = 0;
        pasteCount = 0;
        undoCount = 0;
        currentFullText = jsEditor.value;
        typingEvents = [];
        sentenceStats = [];
        averageWPM = 0;
        wpmValuesForAvg = [];
        currentWordBuffer = "";
        currentWordStartTime = 0;
        wordsInCurrentSentence = 0;
        charsInCurrentSentenceTyped = 0;
        sentenceStartTime = Date.now();
        sentenceTextBuffer = "";
        sentenceTypedDurationMs = 0;
        sentenceBackspaces = 0;
        sentenceDeletes = 0;
        sentenceUndos = 0;
        currentSentenceContainedPaste = false;
        currentSentenceHasBeenCorrected = false;

        updateStatsDisplay();
        renderAllFinalizedSentences();

        clearInterval(sessionTimerInterval);
        sessionTimerInterval = setInterval(updateSessionTime, 1000);

        clearInterval(autoSaveInterval);
        autoSaveInterval = setInterval(() => {
            if (document.hasFocus() && totalActiveTimeMs > 0) {
                saveCurrentSessionData(false);
            }
        }, SESSION_SAVE_INTERVAL_MS);
        console.log("Session started.");
    }

    function updateSessionTime() {
        if (document.hasFocus() && !isPasting) {
            const now = Date.now();
            totalActiveTimeMs += now - lastActivityTime;
            lastActivityTime = now;
        }
        statSessionTimeEl.textContent = formatTime(totalActiveTimeMs);
    }

    function recordTypingEvent(type, data = {}) {
        const now = Date.now();
        const durationSinceLast = now - lastEventTimestamp;
        typingEvents.push({
            type,
            timestamp: now,
            durationSinceLastEventMs: durationSinceLast,
            ...data
        });
        lastEventTimestamp = now;
        if (type !== 'pause' && durationSinceLast > TYPING_PAUSE_THRESHOLD_MS) {
            typingEvents.push({
                type: 'pause',
                timestamp: now - durationSinceLast,
                durationMs: durationSinceLast - (data.durationMs || 0)
            });
        }
    }

    function handleEditorInput(event) {
        const inputText = jsEditor.value;
        const now = Date.now();
        const timeDiff = now - lastInputTimestamp;
        lastInputTimestamp = now;
        lastActivityTime = now;

        let changeData = {
            oldText: currentFullText,
            newText: inputText,
            isPaste: isPasting,
            pastedText: ""
        };

        if (isPasting) {
            changeData.pastedText = (event.clipboardData || window.clipboardData)?.getData('text') || "";
            if (changeData.pastedText === "") {
                let startDiff = 0;
                while (startDiff < changeData.oldText.length && startDiff < changeData.newText.length && changeData.oldText[startDiff] === changeData.newText[startDiff]) {
                    startDiff++;
                }
                let endDiffOld = changeData.oldText.length;
                let endDiffNew = changeData.newText.length;
                while (endDiffOld > startDiff && endDiffNew > startDiff && changeData.oldText[endDiffOld - 1] === changeData.newText[endDiffNew - 1]) {
                    endDiffOld--;
                    endDiffNew--;
                }
                changeData.pastedText = changeData.newText.substring(startDiff, endDiffNew);
            }
        }
        
        const previousFullTextLength = currentFullText.length;
        currentFullText = inputText;

        if (changeData.isPaste && changeData.pastedText.length > 0) {
            pastedChars += changeData.pastedText.length;
            pasteCount++;
            recordTypingEvent('paste', { text: changeData.pastedText, charCount: changeData.pastedText.length });
            sentenceTextBuffer += changeData.pastedText;
            currentSentenceContainedPaste = true;
            isPasting = false;
        } else {
            if (inputText.length > previousFullTextLength) {
                const typedText = inputText.substring(previousFullTextLength);
                typedChars += typedText.length;
                recordTypingEvent('char', { char: typedText, durationMs: timeDiff });
                sentenceTextBuffer += typedText;
                charsInCurrentSentenceTyped += typedText.length;
                sentenceTypedDurationMs += timeDiff;
                currentWordBuffer += typedText;
                if (!currentWordStartTime) currentWordStartTime = now - timeDiff;
                if (typedText.match(/\s|[.!?]/)) {
                    if (currentWordBuffer.trim().length > 0) {
                        processTypedWord(now);
                    }
                    if (typedText.match(/[.!?\n]$/)) {
                         finalizeCurrentSentence(now);
                    }
                }
            }
        }
        clearTimeout(debounceRenderTimeout);
        debounceRenderTimeout = setTimeout(renderAllFinalizedSentences, DEBOUNCE_ANALYZE_MS);
        updateStatsDisplay();
    }

    function processTypedWord(timestamp) {
        if (currentWordBuffer.trim().length === 0) return;
        const wordText = currentWordBuffer.trim();
        const wordDurationMs = timestamp - currentWordStartTime;
        const wordChars = wordText.length;
        let wordWpm = 0;
        if (wordDurationMs > 0 && wordChars > 0) {
            wordWpm = Math.round((wordChars / WORD_AVG_LENGTH) / (wordDurationMs / 60000));
        }
        if (wordWpm > 0 && !currentSentenceContainedPaste) {
            wpmValuesForAvg.push(wordWpm);
            averageWPM = wpmValuesForAvg.reduce((a, b) => a + b, 0) / wpmValuesForAvg.length;
        }
        wordsInCurrentSentence++;
        currentWordBuffer = "";
        currentWordStartTime = 0;
    }
    
    function generateSubSegments(sentenceText, allTypingEvents) {
        let charTypes = Array(sentenceText.length).fill('typed');
        const pasteEvents = allTypingEvents.filter(e => e.type === 'paste' && e.text && e.text.length > 0);
        let activePasteTextsAndIndices = [];

        pasteEvents.forEach(event => {
            let searchFrom = 0;
            let matchIndex;
            while ((matchIndex = sentenceText.indexOf(event.text, searchFrom)) !== -1) {
                activePasteTextsAndIndices.push({ text: event.text, start: matchIndex, end: matchIndex + event.text.length });
                searchFrom = matchIndex + event.text.length;
            }
        });
        
        activePasteTextsAndIndices.sort((a, b) => {
            if (a.start !== b.start) return a.start - b.start;
            return b.end - b.start - (a.end - a.start);
        });

        let coveredRanges = [];
        activePasteTextsAndIndices.forEach(p => {
            let isCovered = false;
            for(const cr of coveredRanges) {
                if (p.start >= cr.start && p.end <= cr.end) {
                    isCovered = true;
                    break;
                }
            }
            if(!isCovered){
                for (let i = p.start; i < p.end; i++) charTypes[i] = 'pasted';
                coveredRanges.push({start: p.start, end: p.end});
                coveredRanges.sort((a,b) => a.start-b.start);
                let j=0;
                while(j < coveredRanges.length -1){
                    if(coveredRanges[j].end >= coveredRanges[j+1].start){
                        coveredRanges[j].end = Math.max(coveredRanges[j].end, coveredRanges[j+1].end);
                        coveredRanges.splice(j+1,1);
                    } else { j++; }
                }
            }
        });

        const segments = [];
        if (sentenceText.length === 0) return segments;
        let currentSegmentType = charTypes[0];
        let currentSegmentText = "";
        for (let i = 0; i < sentenceText.length; i++) {
            if (charTypes[i] === currentSegmentType) {
                currentSegmentText += sentenceText[i];
            } else {
                if (currentSegmentText.length > 0) segments.push({ text: currentSegmentText, type: currentSegmentType });
                currentSegmentType = charTypes[i];
                currentSegmentText = sentenceText[i];
            }
        }
        if (currentSegmentText.length > 0) segments.push({ text: currentSegmentText, type: currentSegmentType });
        return segments;
    }

    function finalizeCurrentSentence(timestamp) {
        const trimmedSentenceText = sentenceTextBuffer.trim();
        if (trimmedSentenceText.length === 0) {
            sentenceTextBuffer = "";
            charsInCurrentSentenceTyped = 0;
            wordsInCurrentSentence = 0;
            sentenceTypedDurationMs = 0;
            sentenceBackspaces = 0;
            sentenceDeletes = 0;
            sentenceUndos = 0;
            currentSentenceContainedPaste = false;
            currentSentenceHasBeenCorrected = false;
            currentWordBuffer = "";
            currentWordStartTime = 0;
            sentenceStartTime = timestamp || Date.now();
            return;
        }

        let category;
        let subSegmentsForRender = null;
        let actualPastedCharCountInSentence = 0;

        if (currentSentenceContainedPaste) {
            category = 'mixed-paste-typed';
            subSegmentsForRender = generateSubSegments(trimmedSentenceText, typingEvents);
            subSegmentsForRender.forEach(seg => {
                if (seg.type === 'pasted') actualPastedCharCountInSentence += seg.text.length;
            });
        } else if (currentSentenceHasBeenCorrected) {
            category = 'corrected';
        } else {
            category = 'typed';
        }

        const finalSentenceWPM = charsInCurrentSentenceTyped > 0 && sentenceTypedDurationMs > 0 ?
            Math.round((charsInCurrentSentenceTyped / WORD_AVG_LENGTH) / (sentenceTypedDurationMs / 60000)) : 0;
        const totalCorrections = sentenceBackspaces + sentenceDeletes + sentenceUndos;

        sentenceStats.push({
            text: trimmedSentenceText,
            startTime: sentenceStartTime,
            endTime: timestamp,
            typedDurationMs: sentenceTypedDurationMs,
            typedChars: charsInCurrentSentenceTyped,
            typedWords: wordsInCurrentSentence,
            wpm: finalSentenceWPM,
            backspaces: sentenceBackspaces,
            deletes: sentenceDeletes,
            undos: sentenceUndos,
            totalCorrections: totalCorrections,
            pastedCharsInSentence: actualPastedCharCountInSentence,
            pasteInfluence: actualPastedCharCountInSentence,
            category: category,
            subSegments: subSegmentsForRender,
        });

        // console.log('Finalizing Sentence:', {text: trimmedSentenceText, category, wpm: finalSentenceWPM, corrections: totalCorrections, pasted: actualPastedCharCountInSentence});

        sentenceTextBuffer = "";
        charsInCurrentSentenceTyped = 0;
        wordsInCurrentSentence = 0;
        sentenceTypedDurationMs = 0;
        sentenceBackspaces = 0;
        sentenceDeletes = 0;
        sentenceUndos = 0;
        currentSentenceContainedPaste = false;
        currentSentenceHasBeenCorrected = false;
        currentWordBuffer = "";
        currentWordStartTime = 0;
        sentenceStartTime = timestamp || Date.now();
    }

    function handleEditorKeyDown(event) {
        lastActivityTime = Date.now();
        if (event.key === 'Backspace') {
            backspaceCount++; sentenceBackspaces++;
            if (!currentSentenceContainedPaste) currentSentenceHasBeenCorrected = true;
            recordTypingEvent('backspace');
            if (currentWordBuffer.length > 0) currentWordBuffer = currentWordBuffer.slice(0, -1);
        } else if (event.key === 'Delete') {
            deleteCount++; sentenceDeletes++;
            if (!currentSentenceContainedPaste) currentSentenceHasBeenCorrected = true;
            recordTypingEvent('delete');
        } else if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
            undoCount++; sentenceUndos++;
            if (!currentSentenceContainedPaste) currentSentenceHasBeenCorrected = true;
            recordTypingEvent('undo');
        } else if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
            isPasting = true;
        }

        if (event.key === 'Enter') {
            if (currentWordBuffer.trim().length > 0) processTypedWord(Date.now());
            sentenceTextBuffer += "\n";
            finalizeCurrentSentence(Date.now());
        }
        updateStatsDisplay();
    }

    function handleEditorPaste() {
        isPasting = true;
        lastActivityTime = Date.now();
    }

    function handleEditorFocus() {
        lastActivityTime = Date.now();
        if (!sessionStartTime) startSession();
    }

    function handleEditorBlur() {
        const now = Date.now();
        if (currentWordBuffer.trim().length > 0) processTypedWord(now);
        if (sentenceTextBuffer.trim().length > 0) finalizeCurrentSentence(now);
        updateSessionTime();
    }

    function renderAllFinalizedSentences() {
        highlightedOutputContainer.innerHTML = ''; // Clear previous content
        function createSegmentDiv(segmentText, segmentClass, stats) {
            const wrapper = document.createElement('div');
            wrapper.className = 'segment-wrapper';

            const textSpan = document.createElement('span');
            textSpan.className = 'segment-text-content ' + segmentClass;
            textSpan.textContent = segmentText;

            const tooltip = document.createElement('div');
            tooltip.className = 'segment-tooltip';
            
            let tooltipContent = '';
            if (stats.wpm !== undefined && stats.wpm !== null && segmentClass !== 'highlight-red-pasted') {
                tooltipContent += `WPM: ${stats.wpm.toFixed(0)}, `;
            } else if (segmentClass === 'highlight-red-pasted') {
                 tooltipContent += `WPM: N/A (Pasted), `;
            } else {
                 tooltipContent += `WPM: N/A, `;
            }
            tooltipContent += `Duration: ${formatTime(stats.durationMs || 0)}, `;
            tooltipContent += `Chars: ${stats.charCount || 0}`;
            if (stats.edits > 0 && segmentClass !== 'highlight-red-pasted') {
                tooltipContent += `, Edits: ${stats.edits}`;
            }
             if (segmentClass === 'highlight-red-pasted' && stats.charCount > 0) { // Specifically for pasted segment
                // tooltipContent += ` (Pasted)`; // Redundant due to WPM N/A (Pasted)
            }


            tooltip.textContent = tooltipContent;

            wrapper.appendChild(tooltip);
            wrapper.appendChild(textSpan);
            return wrapper;
        }

        sentenceStats.forEach(sStat => {
            // Use span for sentenceContainer to make it inline by default, styled further with CSS.
            const sentenceContainer = document.createElement('span');
            sentenceContainer.classList.add('sentence-block');

            // Store detailed data in title attribute for hover (original behavior)
            let tooltipTitleContent = `WPM: ${sStat.wpm.toFixed(0)}, Duration: ${formatTime(sStat.typedDurationMs)}, Typed Chars: ${sStat.typedChars}, Pasted Chars: ${sStat.pasteInfluence}, BS: ${sStat.backspaces}, Del: ${sStat.deletes}, Undo: ${sStat.undos}`;
            sentenceContainer.title = tooltipTitleContent;

            // Create elements for sentence text based on category
            if (sStat.category === 'corrected') {
                const span = document.createElement('span');
                span.textContent = sStat.text;
                span.className = 'highlight-green-corrected';
                sentenceContainer.appendChild(span);
            } else if (sStat.category === 'typed') {
                const span = document.createElement('span');
                span.textContent = sStat.text;
                span.className = 'highlight-yellow-typed';
                sentenceContainer.appendChild(span);
            } else if (sStat.category === 'mixed-paste-typed') {
                if (sStat.subSegments && sStat.subSegments.length > 0) {
                    sStat.subSegments.forEach(subSeg => {
                        const span = document.createElement('span');
                        span.textContent = subSeg.text;
                        span.className = subSeg.type === 'pasted' ? 'highlight-red-pasted' : 'highlight-yellow-typed';
                        sentenceContainer.appendChild(span);
                    });
                } else {
                    const span = document.createElement('span');
                    span.textContent = sStat.text;
                    span.className = 'highlight-yellow-typed'; // Fallback
                    sentenceContainer.appendChild(span);
                }
            }

            // Create and append the visible tooltip data span
            const tooltipVisibleSpan = document.createElement('span');
            tooltipVisibleSpan.classList.add('tooltip-visible-data');
            tooltipVisibleSpan.textContent = ` [WPM: ${sStat.wpm.toFixed(0)}, Typed: ${sStat.typedChars}, Pasted: ${sStat.pasteInfluence}, Edits: ${sStat.totalCorrections}]`;
            sentenceContainer.appendChild(tooltipVisibleSpan);

            highlightedOutputContainer.appendChild(sentenceContainer);
            // Note: Spacing between sentence-block elements will be handled by CSS margin.
        });

        // Render current, unfinalized sentence buffer live
        if (sentenceTextBuffer.trim().length > 0) {
            const liveSentenceContainer = document.createElement('span'); // Use span
            liveSentenceContainer.classList.add('sentence-block', 'live-sentence');

            let liveCategory;
            let liveSubSegments = null;

            if (currentSentenceContainedPaste) {
                liveCategory = 'mixed-paste-typed';
                category = 'mixed-paste-typed'; // CORRECT

                liveSubSegments = generateSubSegments(sentenceTextBuffer.trim(), typingEvents);
            } else if (currentSentenceHasBeenCorrected) {
                liveCategory = 'corrected';
                category = 'corrected'; // CORRECT

            } else {
                liveCategory = 'typed';
                category = 'typed'; // CORRECT

            }

            // Original hover tooltip for live sentence
            let liveTooltipTitle = `(typing...) BS: ${sentenceBackspaces}, Del: ${sentenceDeletes}, Undo: ${sentenceUndos}`;
            if(currentSentenceContainedPaste) liveTooltipTitle += ", Paste Detected";
            liveSentenceContainer.title = liveTooltipTitle;

            // Render live text segments
            if (liveCategory === 'corrected') {
                const span = document.createElement('span');
                span.textContent = sentenceTextBuffer; // Display full buffer for live
                span.className = 'highlight-green-corrected';
                liveSentenceContainer.appendChild(span);
            } else if (liveCategory === 'typed') {
                const span = document.createElement('span');
                span.textContent = sentenceTextBuffer;
                span.className = 'highlight-yellow-typed';
                liveSentenceContainer.appendChild(span);
            } else if (liveCategory === 'mixed-paste-typed' && liveSubSegments) {
                 let currentPosInSentenceTextBuffer = 0;
                 liveSubSegments.forEach(subSeg => {
                    const span = document.createElement('span');
                    span.textContent = subSeg.text;
                    span.className = subSeg.type === 'pasted' ? 'highlight-red-pasted' : 'highlight-yellow-typed';
                    liveSentenceContainer.appendChild(span);
                    currentPosInSentenceTextBuffer += subSeg.text.length;
                 });
                 // Append any remaining part of sentenceTextBuffer (e.g., trailing spaces)
                 if(currentPosInSentenceTextBuffer < sentenceTextBuffer.length){
                    const trailingSpan = document.createElement('span');
                    trailingSpan.textContent = sentenceTextBuffer.substring(currentPosInSentenceTextBuffer);
                    // Default to typed style for trailing non-pasted parts of live buffer
                    trailingSpan.className = 'highlight-yellow-typed';
                    liveSentenceContainer.appendChild(trailingSpan);
                 }
            } else { // Fallback for live sentence if no category matches (e.g., empty buffer but somehow this block runs)
                 const span = document.createElement('span');
                 span.textContent = sentenceTextBuffer;
                 span.className = 'highlight-yellow-typed';
                 liveSentenceContainer.appendChild(span);
            }

            // Visible tooltip data for live sentence
            const liveTooltipVisibleSpan = document.createElement('span');
            liveTooltipVisibleSpan.classList.add('tooltip-visible-data');
            let liveVisibleText = ` [(typing...) Edits: ${sentenceBackspaces + sentenceDeletes + sentenceUndos}`;
            if(currentSentenceContainedPaste) liveVisibleText += ", Paste";
            liveVisibleText += "]";
            liveTooltipVisibleSpan.textContent = liveVisibleText;
            liveSentenceContainer.appendChild(liveTooltipVisibleSpan);

            highlightedOutputContainer.appendChild(liveSentenceContainer);
        }

        highlightedOutputContainer.scrollTop = highlightedOutputContainer.scrollHeight;
    }


    function updateStatsDisplay() {
        statTypedCharsEl.textContent = typedChars;
        statPastedCharsEl.textContent = pastedChars;
        statAvgSpeedEl.textContent = `${Math.round(averageWPM)} WPM`;
        statBackspacesEl.textContent = backspaceCount;
        statDeletesEl.textContent = deleteCount;
        statPasteCountEl.textContent = pasteCount;
    }

    function saveCurrentSessionData(isFinal = false) {
        if (!sessionStartTime) return;
        const now = Date.now();
        if (currentWordBuffer.trim().length > 0) processTypedWord(now);
        if (sentenceTextBuffer.trim().length > 0) finalizeCurrentSentence(now);
        updateSessionTime();

        const sessionData = {
            sessionId: sessionStartTime,
            startTime: sessionStartTime,
            endTime: Date.now(),
            totalActiveTimeMs: totalActiveTimeMs,
            typedChars: typedChars,
            pastedChars: pastedChars,
            backspaceCount: backspaceCount,
            deleteCount: deleteCount,
            undoCount: undoCount,
            pasteCount: pasteCount,
            averageWPM: parseFloat(averageWPM.toFixed(1)),
            currentFullText: jsEditor.value,
            typingEvents: typingEvents,
            sentenceStats: sentenceStats,
            pastedSegmentsDetails: typingEvents.filter(e => e.type === 'paste').map(e => ({
                text: e.text,
                timestamp: e.timestamp,
                charCount: e.text ? e.text.length : 0,
                wordCount: e.text ? countWords(e.text) : 0
            }))
        };

        try {
            let allData = JSON.parse(localStorage.getItem(TRACKING_DATA_KEY) || '[]');
            if (!Array.isArray(allData)) allData = [];
            const existingSessionIndex = allData.findIndex(s => s.sessionId === sessionData.sessionId);
            if (existingSessionIndex > -1) {
                allData[existingSessionIndex] = sessionData;
            } else {
                allData.push(sessionData);
            }
            localStorage.setItem(TRACKING_DATA_KEY, JSON.stringify(allData));
            // console.log(`Session data ${existingSessionIndex > -1 ? 'updated' : 'saved'}.`);
            if (isFinal) {
                 sessionStartTime = null;
                 clearInterval(sessionTimerInterval);
                 clearInterval(autoSaveInterval);
            }
        } catch (e) {
            console.error("Error saving session data:", e);
        }
    }
    
    window.addEventListener('beforeunload', () => {
        saveCurrentSessionData(true);
    });

    function openDashboardModal() {
        saveCurrentSessionData(false); 
        const currentTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'light';
        dashboardFrame.src = `dashboard.html#theme=${currentTheme}`;
        dashboardModalOverlay.classList.add('show');
        dashboardFrame.onload = () => {
            dashboardFrame.contentWindow.postMessage({ type: 'SET_THEME', theme: currentTheme }, '*');
        };
    }

    function closeDashboardModal() {
        dashboardModalOverlay.classList.remove('show');
        dashboardFrame.src = 'about:blank';
    }

    function applyTheme(themeName) {
        document.body.className = '';
        document.body.classList.add(`theme-${themeName}`);
        localStorage.setItem(THEME_STORAGE_KEY, themeName);
        [themeLightBtn, themeDarkBtn, themeBlueNeonBtn].forEach(btn => btn.classList.remove('active-theme'));
        if (themeName === 'light') themeLightBtn.classList.add('active-theme');
        else if (themeName === 'dark') themeDarkBtn.classList.add('active-theme');
        else if (themeName === 'blue-neon') themeBlueNeonBtn.classList.add('active-theme');
        if (dashboardModalOverlay.classList.contains('show') && dashboardFrame.contentWindow) {
            dashboardFrame.contentWindow.postMessage({ type: 'SET_THEME', theme: themeName }, '*');
        }
    }

    function loadTheme() {
        const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'light';
        applyTheme(savedTheme);
    }

    function printInput() {
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'height:0;width:0;position:absolute;visibility:hidden;';
        document.body.appendChild(iframe);

        const printDoc = iframe.contentDocument || iframe.contentWindow.document;
        printDoc.open();
        printDoc.write(`
            <html><head><title>Print</title><style>
                body { font-family: sans-serif; margin: 20px; }
                #highlighted-output-container { line-height: 1.6; }
                .sentence-block {
                    display: inline-block !important;
                    margin-right: 0.5em !important;
                    margin-bottom: 0.3em !important;
                    padding: 1px 2px !important; /* Minimal padding for print */
                    vertical-align: top !important;
                    border: 1px solid #eee; /* Subtle border for print blocks */
                }
                .sentence-block span, /* Covers colored spans and general text spans */
                .highlight-yellow-typed,
                .highlight-red-pasted,
                .highlight-green-corrected {
                    display: inline !important;
                    white-space: pre-wrap !important;
                    -webkit-print-color-adjust: exact !important;
                    color-adjust: exact !important;
                }
                .highlight-yellow-typed { background-color: #fffacd !important; color: black !important; }
                .highlight-red-pasted { background-color: #ffcccb !important; color: black !important; }
                .highlight-green-corrected { background-color: #90ee90 !important; color: black !important; }

                .tooltip-visible-data {
                    display: inline !important;
                    font-size: 0.75em !important; /* Slightly smaller for print */
                    color: #333 !important;
                    margin-left: 0.4em !important;
                    font-style: italic !important;
                    /* No background for tooltip data in print for cleaner look */
                }
            </style></head><body><div id="highlighted-output-container">${highlightedOutputContainer.innerHTML}</div></body></html>
        `);
        printDoc.close();

        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => document.body.removeChild(iframe), 1000);
    }

    function formatTime(ms) {
        if (isNaN(ms) || ms < 0) return "00:00:00";
        const totalSeconds = Math.floor(ms / 1000);
        const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
        const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
        const seconds = String(totalSeconds % 60).padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    function countWords(str) {
        return str.trim().split(/\s+/).filter(Boolean).length;
    }

    function attachEventListeners() {
        jsEditor.addEventListener('input', handleEditorInput);
        jsEditor.addEventListener('keydown', handleEditorKeyDown);
        jsEditor.addEventListener('paste', handleEditorPaste);
        jsEditor.addEventListener('focus', handleEditorFocus);
        jsEditor.addEventListener('blur', handleEditorBlur);
        analysisButton.addEventListener('click', openDashboardModal);
        closeDashboardModalBtn.addEventListener('click', closeDashboardModal);
        printButton.addEventListener('click', printInput);
        themeLightBtn.addEventListener('click', () => applyTheme('light'));
        themeDarkBtn.addEventListener('click', () => applyTheme('dark'));
        themeBlueNeonBtn.addEventListener('click', () => applyTheme('blue-neon'));
    }

    init();
});