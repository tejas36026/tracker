// dashboard.js
const SENTENCES_PER_CHUNK = 15; // Display 15 sentences at a time, adjust as needed
let currentSentenceChunkLine = 0;
let currentSentenceChunkBar = 0;
let fullSentenceStatsForPaging = [];




document.addEventListener('DOMContentLoaded', () => {
    // ... (keep existing const declarations for elements)
    const filterStartDateEl = document.getElementById('filterStartDate');
    const filterEndDateEl = document.getElementById('filterEndDate');
    const applyFilterBtn = document.getElementById('applyFilterBtn');
    const resetFilterBtn = document.getElementById('resetFilterBtn');
    const printDashboardBtn = document.getElementById('printDashboardBtn');

    const totalTimeEl = document.getElementById('totalTime');
    // const sessionStartEl = document.getElementById('sessionStart');
    const essayTypedWordsEl = document.getElementById('essayTypedWords');
    const essayPastedWordsEl = document.getElementById('essayPastedWords');
    const essayTypedCharsEl = document.getElementById('essayTypedChars');
    const essayPastedCharsEl = document.getElementById('essayPastedChars');
    const essayPasteRatioWordsEl = document.getElementById('essayPasteRatioWords');
    const essayPasteRatioCharsEl = document.getElementById('essayPasteRatioChars');
    const essayPasteEventsCountEl = document.getElementById('essayPasteEventsCount');
    const essayTypingSpeedEl = document.getElementById('essayTypingSpeed');
    const essayBackspaceCountEl = document.getElementById('essayBackspaceCount');
    const essayDeleteCountEl = document.getElementById('essayDeleteCount');
    const mainAIAttemptsEl = document.getElementById('mainAIAttempts');
    const jsAIAttemptsEl = document.getElementById('jsAIAttempts');
    const promptsUsedCountEl = document.getElementById('promptsUsedCount');
    const jsFocusTimeEl = document.getElementById('jsFocusTime'); // Assuming this is total active time
    const prevSentenceChunkBtn = document.getElementById('prevSentenceChunkBtn');
    const nextSentenceChunkBtn = document.getElementById('nextSentenceChunkBtn');
    const sentenceChunkIndicator = document.getElementById('sentenceChunkIndicator');
    
    const prevSentenceBarChunkBtn = document.getElementById('prevSentenceBarChunkBtn');
    const nextSentenceBarChunkBtn = document.getElementById('nextSentenceBarChunkBtn');
    const sentenceBarChunkIndicator = document.getElementById('sentenceBarChunkIndicator');
    
    
    const dailyInsightsContainer = document.getElementById('dailyInsightsContainer');
    const refreshDataBtn = document.getElementById('refreshData');
    const analyzedTextContainer = document.getElementById('dashboardHighlightedText');

    const THEME_STORAGE_KEY = 'studentTrackerTheme';

    let allSessionsData = [];
    let charts = {}; // To store chart instances
    let allTypingEvents = [];

    // Function to get theme-aware colors
    function getThemeColor(variableName, fallback) {
        return getComputedStyle(document.documentElement).getPropertyValue(variableName).trim() || fallback;
    }

    
    const chartColors = {
        text: () => getThemeColor('--text-secondary', '#666'),
        grid: () => getThemeColor('--border-color', '#ddd'),
        wpm: () => getThemeColor('--color-line-1', 'rgba(54, 162, 235, 0.8)'),
        chars: () => getThemeColor('--color-bar-1', 'rgba(75, 192, 192, 0.7)'),
        backspace: () => getThemeColor('--color-warning', 'rgba(255, 159, 64, 0.7)'), // Original orange, will be changed to green for bar chart
        delete: () => getThemeColor('--color-error', 'rgba(255, 99, 132, 0.8)'),   // Original red
        focus: () => getThemeColor('--color-primary-03', 'rgba(60, 200, 200, 0.7)'),
        success: () => getThemeColor('--color-success', 'rgba(46, 204, 113, 0.7)'), // Green for success/corrections
    };

    function loadData() {
        try {
            const storedData = localStorage.getItem('studentTrackingDataAll');
            allSessionsData = storedData ? JSON.parse(storedData) : [];
            if (!Array.isArray(allSessionsData)) {
                allSessionsData = [];
            }
            allSessionsData.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
        } catch (e) {
            console.error("Error loading data from localStorage:", e);
            allSessionsData = [];
        }
    }


    function renderTypingRhythmChart(typingEvents) {
        const canvasId = 'typingRhythmChart';
        const ctx = document.getElementById(canvasId)?.getContext('2d');
        if (!ctx) { console.warn(`Canvas ID ${canvasId} not found.`); return; }
        const existingChart = charts[canvasId];
        if (existingChart && typeof existingChart.destroy === 'function') {
            try {
                existingChart.destroy();
            } catch (e) {
                console.warn("Error destroying existing chart:", canvasId, e);
            }
        }
        charts[canvasId] = null; // Clear the reference

        if (!typingEvents || typingEvents.length === 0) {
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            // Optionally, display a "No data" message on the canvas
            // ctx.font = "16px Arial";
            // ctx.fillStyle = getThemeColor('--text-secondary', '#666');
            // ctx.textAlign = "center";
            // ctx.fillText("No typing rhythm data available.", ctx.canvas.width / 2, ctx.canvas.height / 2);
            return;
        }
    
        const dataPoints = [];
        let lastTimestamp = typingEvents[0]?.timestamp || 0;

        typingEvents.forEach((event, index) => {
            const eventTime = event.timestamp || 0;
            const eventDuration = event.durationMs || 0;
            const charDuration = event.type === 'char' ? (event.durationMs || 50) : 0;
    
            if (event.type === 'pause') {
                if (dataPoints.length > 0 && dataPoints[dataPoints.length -1].y !== 0) {
                     dataPoints.push({ x: eventTime -1 , y: 0 });
                } else if (dataPoints.length === 0 && index === 0) {
                     dataPoints.push({ x: eventTime, y: 0 });
                }
                dataPoints.push({ x: eventTime + eventDuration, y: 0 });
                lastTimestamp = eventTime + eventDuration;
            } else if (event.type === 'char') {
                if (eventTime > lastTimestamp + 100) {
                    if(dataPoints.length > 0 && dataPoints[dataPoints.length -1].y !== 0) {
                        dataPoints.push({x: lastTimestamp, y: 0});
                    }
                    dataPoints.push({x: eventTime -1, y: 0});
                }
                dataPoints.push({ x: eventTime, y: 20 });
                dataPoints.push({ x: eventTime + charDuration, y: 0 });
                lastTimestamp = eventTime + charDuration;
            }
        });
        
        if (dataPoints.length === 0 && typingEvents.length > 0) {
            typingEvents.forEach(event => dataPoints.push({x: (event.timestamp || 0), y: event.type === 'char' ? 10 : 0}));
       }


       dataPoints.sort((a, b) => a.x - b.x);
       const finalDataPoints = dataPoints.reduce((acc, current, index, arr) => {
           if (index > 0 && current.y === 0 && arr[index - 1].y === 0 && current.x === arr[index-1].x) { /* skip */ }
           else { acc.push(current); }
           return acc;
       }, []);
       
       if(finalDataPoints.length === 0) {
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
            // Optionally, display a "No data" message
            return;
       }
   
       charts[canvasId] = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Typing Activity',
                data: finalDataPoints,
                borderColor: chartColors.focus(),
                backgroundColor: chartColors.focus().replace('0.7', '0.1'),
                borderWidth: 1.5,
                pointRadius: 0,
                tension: 0.1,
                fill: true,
                stepped: false // Or true, depending on desired visual for pulses
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'time',
                    // Let Chart.js automatically determine the unit based on data range
                    time: {
                        // unit: 'second', // REMOVE THIS TO ALLOW AUTO UNIT
                        tooltipFormat: 'PP HH:mm:ss', // This will still be used for tooltips
                        displayFormats: { // Provide formats for different units Chart.js might choose
                            millisecond: 'HH:mm:ss.SSS',
                            second: 'HH:mm:ss',
                            minute: 'HH:mm',
                            hour: 'HH:mm', // e.g., 13:00
                            day: 'MMM d',  // e.g., Jan 1
                            week: 'MMM d',
                            month: 'MMM yyyy', // e.g., Jan 2023
                            quarter: '[Q]Q - yyyy',
                            year: 'yyyy'
                        }
                    },
                    title: { display: true, text: 'Time', color: chartColors.text() },
                    ticks: { source: 'auto', color: chartColors.text(), autoSkip: true, maxTicksLimit: 20 }, // autoSkip helps
                    grid: { color: chartColors.grid() }
                },
                y: {
                    title: { display: true, text: 'Activity Level', color: chartColors.text() },
                    ticks: { color: chartColors.text(), beginAtZero: true, suggestedMax: 30 },
                    grid: { color: chartColors.grid() }
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: { 
                    enabled: true, // Enable tooltips for better inspection if needed
                    mode: 'index',
                    intersect: false,
                 },
                zoom: { pan: { enabled: true, mode: 'x' }, zoom: { wheel: { enabled: true }, pinch: { enabled: true }, mode: 'x' } }
            }
        }
    });


    }







// main.js
function renderHighlightedText(segments, fallbackText) {
    highlightedOutputContainer.innerHTML = '';
    if (segments && segments.length > 0) {
        segments.forEach(segment => {
            const span = document.createElement('span');
            span.textContent = segment.text;
            if (segment.category) { // e.g., 'highlight-pasted'
                // console.log("Applying category:", segment.category, "to text:", segment.text.substring(0,10)); // DEBUG
                span.className = segment.category; // This is correct
            }
            highlightedOutputContainer.appendChild(span);
        });
    } else if (fallbackText) {
        highlightedOutputContainer.textContent = fallbackText;
    } else {
        highlightedOutputContainer.innerHTML = '<span style="color: var(--text-secondary);">Start typing to see analysis...</span>'; // Placeholder
    }
    highlightedOutputContainer.scrollTop = highlightedOutputContainer.scrollHeight;
}


function formatTime(ms) {
    if (isNaN(ms) || ms < 0) return "00:00:00";
    const totalSeconds = Math.floor(ms / 1000);
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

function formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}




function formatDateTime(timestamp) {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleString();
}


    function getFilteredData() { /* ... (keep existing) ... */ }



    function updateDashboard(filteredData) {
        // --- Initial check for no data ---
        if (!filteredData || filteredData.length === 0) {
            Object.values(charts).forEach(chart => {
                if (chart && typeof chart.destroy === 'function') {
                    try { chart.destroy(); } catch (e) { console.warn("Error destroying chart:", e); }
                }
            });
            charts = {}; // Reset charts object

            // Reset UI elements to default/empty states
            totalTimeEl.textContent = formatTime(0);
            essayTypedWordsEl.textContent = '0';
            essayPastedWordsEl.textContent = '0';
            essayTypedCharsEl.textContent = '0';
            essayPastedCharsEl.textContent = '0';
            essayPasteRatioWordsEl.textContent = '--%';
            essayPasteRatioCharsEl.textContent = '--%';
            essayPasteEventsCountEl.textContent = '0';
            essayTypingSpeedEl.textContent = '-- WPM';
            essayBackspaceCountEl.textContent = '0';
            essayDeleteCountEl.textContent = '0';
            jsFocusTimeEl.textContent = formatTime(0);
            // sessionStartEl.textContent = 'N/A'; // If you have this element

            dailyInsightsContainer.innerHTML = '<p>No data for the selected period.</p>';
            analyzedTextContainer.innerHTML = '<p>No session data to display text from.</p>'; // Specific to "Analyzed Text" card

            if(sentenceChunkIndicator) sentenceChunkIndicator.textContent = "No sentence data";
            if(prevSentenceChunkBtn) prevSentenceChunkBtn.disabled = true;
            if(nextSentenceChunkBtn) nextSentenceChunkBtn.disabled = true;

            if(sentenceBarChunkIndicator) sentenceBarChunkIndicator.textContent = "No sentence data";
            if(prevSentenceBarChunkBtn) prevSentenceBarChunkBtn.disabled = true;
            if(nextSentenceBarChunkBtn) nextSentenceBarChunkBtn.disabled = true;

            renderQrCodeForReport(null);
            // Render placeholder/empty charts if desired, or just let them be blank
            renderPlaceholderChart('textCompositionPieChart', 'pie', 'Text Composition', [], []);
            renderPlaceholderChart('aiUsageChart', 'bar', 'AI Usage', [], []);
            renderPlaceholderChart('activityChart', 'bar', 'Activity Over Time', [], []);
            renderPlaceholderChart('typingRhythmChart', 'line', 'Typing Rhythm', [], []);
            // ... and other charts ...
            return;
        }

        // --- Data Aggregation ---
        let allSentenceStats = [];
        let localAllTypingEvents = []; // For typing rhythm chart

        filteredData.forEach(session => {
            if (session.sentenceStats && Array.isArray(session.sentenceStats)) {
                const sentencesWithSessionInfo = session.sentenceStats.map(s => ({
                    ...s,
                    sessionId: session.sessionId // or session.startTime
                }));
                allSentenceStats.push(...sentencesWithSessionInfo);
            }
            if (session.typingEvents && Array.isArray(session.typingEvents)) {
                localAllTypingEvents.push(...session.typingEvents);
            }
        });

        if (allSentenceStats.length > 0) {
            allSentenceStats.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));
        }
        fullSentenceStatsForPaging = allSentenceStats; // For paged charts

        if (localAllTypingEvents.length > 0) {
            localAllTypingEvents.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        }

        // --- START: Logic for "Analyzed Text Sample (Latest Session)" card ---
        analyzedTextContainer.innerHTML = ''; // Clear it ONCE specifically for this section

        let latestSessionWithTextData = null;
        // Use filteredData if available, otherwise fall back to allSessionsData for finding the latest text.
        // This ensures if the filter results in no sessions, we still try to show something from all data.
        const dataSourceForLatestText = (filteredData && filteredData.length > 0) ? filteredData : allSessionsData;

        if (dataSourceForLatestText && dataSourceForLatestText.length > 0) {
            // Prioritize sessions with sentenceStats from the end of the (potentially filtered) list
            for (let i = dataSourceForLatestText.length - 1; i >= 0; i--) {
                if (dataSourceForLatestText[i] && dataSourceForLatestText[i].sentenceStats && dataSourceForLatestText[i].sentenceStats.length > 0) {
                    latestSessionWithTextData = dataSourceForLatestText[i];
                    break;
                }
            }
            // If no session with sentenceStats, try for contentSegments or currentFullText from the absolute latest of the dataSource
            if (!latestSessionWithTextData && dataSourceForLatestText.length > 0) {
                 const absLatest = dataSourceForLatestText[dataSourceForLatestText.length - 1];
                 if (absLatest && ( (absLatest.contentSegments && absLatest.contentSegments.length > 0) || absLatest.currentFullText)) {
                    latestSessionWithTextData = absLatest;
                 }
            }
        }

        // Your existing debug logs for latestSessionWithTextData can remain here
        console.log("DASHBOARD: --- Debugging Analyzed Text Sample ---");
        if (latestSessionWithTextData) {
            console.log("DASHBOARD: latestSessionWithTextData.sessionId:", latestSessionWithTextData.sessionId);
            console.log("DASHBOARD: latestSessionWithTextData.currentFullText:", latestSessionWithTextData.currentFullText);
            console.log("DASHBOARD: latestSessionWithTextData.sentenceStats exists?", !!latestSessionWithTextData.sentenceStats);
            if (latestSessionWithTextData.sentenceStats) {
                console.log("DASHBOARD: latestSessionWithTextData.sentenceStats.length:", latestSessionWithTextData.sentenceStats.length);
                if (latestSessionWithTextData.sentenceStats.length > 0) {
                    console.log("DASHBOARD: First sentenceStat object:", JSON.stringify(latestSessionWithTextData.sentenceStats[0]));
                }
            }
            console.log("DASHBOARD: latestSessionWithTextData.contentSegments exists?", !!latestSessionWithTextData.contentSegments);
             if (latestSessionWithTextData.contentSegments) {
                console.log("DASHBOARD: latestSessionWithTextData.contentSegments.length:", latestSessionWithTextData.contentSegments.length);
            }
        } else {
            console.log("DASHBOARD: No latestSessionWithTextData found.");
        }
        console.log("DASHBOARD: --- End Debugging Analyzed Text Sample ---");

        if (latestSessionWithTextData && latestSessionWithTextData.sentenceStats && latestSessionWithTextData.sentenceStats.length > 0) {
            console.log("DASHBOARD: Rendering 'Analyzed Text' using latestSessionWithTextData.sentenceStats");
            latestSessionWithTextData.sentenceStats.forEach(sStat => {
                const sentenceContainer = document.createElement('span');
                sentenceContainer.classList.add('sentence-block');

                let tooltipTitleContent = `WPM: ${sStat.wpm.toFixed(0)}, Duration: ${formatTime(sStat.typedDurationMs)}, Typed: ${sStat.typedChars}, Pasted: ${sStat.pasteInfluence || 0}, Edits: ${sStat.totalCorrections || 0}`;
                if (sStat.backspaces !== undefined) tooltipTitleContent += `, BS: ${sStat.backspaces}`;
                if (sStat.deletes !== undefined) tooltipTitleContent += `, Del: ${sStat.deletes}`;
                if (sStat.undos !== undefined) tooltipTitleContent += `, Undo: ${sStat.undos}`;
                sentenceContainer.title = tooltipTitleContent;

                if (sStat.category === 'mixed-paste-typed' && sStat.subSegments && sStat.subSegments.length > 0) {
                    sStat.subSegments.forEach(subSeg => {
                        const span = document.createElement('span');
                        span.textContent = subSeg.text;
                        span.className = subSeg.type === 'pasted' ? 'highlight-red-pasted' : 'highlight-yellow-typed';
                        sentenceContainer.appendChild(span);
                    });
                } else if (sStat.category === 'corrected') {
                    const span = document.createElement('span');
                    span.textContent = sStat.text;
                    span.className = 'highlight-green-corrected';
                    sentenceContainer.appendChild(span);
                } else if (sStat.category === 'typed') {
                    const span = document.createElement('span');
                    span.textContent = sStat.text;
                    span.className = 'highlight-yellow-typed';
                    sentenceContainer.appendChild(span);
                } else { // Fallback for unknown category
                    const span = document.createElement('span');
                    span.textContent = sStat.text || "Error: No text";
                    span.className = 'highlight-yellow-typed';
                    if(!sStat.text) console.warn("DASHBOARD (Latest): SentenceStat has no text:", sStat);
                    if(!sStat.category) console.warn("DASHBOARD (Latest): SentenceStat has NO CATEGORY for text:", sStat.text ? sStat.text.substring(0,10) : "NO TEXT", sStat);
                    sentenceContainer.appendChild(span);
                }

                const tooltipVisibleSpan = document.createElement('span');
                tooltipVisibleSpan.classList.add('tooltip-visible-data-dashboard'); // CSS target
                tooltipVisibleSpan.textContent = ` [WPM: ${sStat.wpm.toFixed(0)}, Typed: ${sStat.typedChars}, Pasted: ${sStat.pasteInfluence || 0}, Edits: ${sStat.totalCorrections || 0}]`;
                sentenceContainer.appendChild(tooltipVisibleSpan);
                
                analyzedTextContainer.appendChild(sentenceContainer);
            });
        } else if (latestSessionWithTextData && latestSessionWithTextData.contentSegments && latestSessionWithTextData.contentSegments.length > 0) {
            console.log("DASHBOARD: Rendering 'Analyzed Text' using latestSessionWithTextData.contentSegments (fallback)");
            latestSessionWithTextData.contentSegments.forEach(segment => {
                const span = document.createElement('span');
                span.textContent = segment.text;
                if (segment.category) {
                    span.className = segment.category;
                } else {
                    span.className = 'highlight-typed';
                }
                analyzedTextContainer.appendChild(span);
                analyzedTextContainer.appendChild(document.createTextNode(' '));
            });
        } else if (latestSessionWithTextData && latestSessionWithTextData.currentFullText) {
            console.log("DASHBOARD: Rendering 'Analyzed Text' using latestSessionWithTextData.currentFullText (fallback)");
            analyzedTextContainer.textContent = latestSessionWithTextData.currentFullText;
        } else {
            console.log("DASHBOARD: No text data to render for 'Analyzed Text' from the latest session.");
            analyzedTextContainer.innerHTML = '<p>No text to display from the latest session.</p>';
        }
    

        
        let totalActiveTime = 0, totalTypedChars = 0, totalPastedChars = 0;
        let totalTypedWordsAgg = 0, totalPastedWordsAgg = 0;
        let totalBackspace = 0, totalDelete = 0, totalUndo = 0, totalPasteEvents = 0;
        let earliestSessionStart = (filteredData[0]?.startTime) || Date.now();
        let overallSessionTimeAcrossAllData = 0; // This is for the "Total Time Spent on App"

        // Calculate total time spent on app using ALL sessions, not just filtered ones
        (Array.isArray(allSessionsData) ? allSessionsData : []).forEach(session => {
            overallSessionTimeAcrossAllData += session.totalActiveTimeMs || 0;
        });

        filteredData.forEach(session => {
            totalActiveTime += session.totalActiveTimeMs || 0;
            totalTypedChars += session.typedChars || 0;
            totalPastedChars += session.pastedChars || 0;
            totalBackspace += session.backspaceCount || 0;
            totalDelete += session.deleteCount || 0;
            totalUndo += session.undoCount || 0; // Make sure this is in your session data

            if (session.pastedSegmentsDetails && Array.isArray(session.pastedSegmentsDetails)) {
                totalPasteEvents += session.pastedSegmentsDetails.length;
                session.pastedSegmentsDetails.forEach(p => { totalPastedWordsAgg += p.wordCount || 0; });
            }
            if (session.startTime < earliestSessionStart) earliestSessionStart = session.startTime;
        });

        totalTypedWordsAgg = allSentenceStats.reduce((sum, s) => sum + (s.typedWords || 0), 0);

        // --- Update DOM Elements with Metrics ---
        totalTimeEl.textContent = formatTime(overallSessionTimeAcrossAllData); // Total app time
        // if (sessionStartEl) sessionStartEl.textContent = formatDateTime(earliestSessionStart); // If you have this element

        jsFocusTimeEl.textContent = formatTime(totalActiveTime); // Active time for filtered period
        essayTypedWordsEl.textContent = totalTypedWordsAgg;
        essayPastedWordsEl.textContent = totalPastedWordsAgg;
        essayTypedCharsEl.textContent = totalTypedChars;
        essayPastedCharsEl.textContent = totalPastedChars;

        const totalWordsFiltered = totalTypedWordsAgg + totalPastedWordsAgg;
        essayPasteRatioWordsEl.textContent = totalWordsFiltered > 0 ? ((totalPastedWordsAgg / totalWordsFiltered) * 100).toFixed(1) + '%' : '--%';
        const totalCharsFiltered = totalTypedChars + totalPastedChars;
        essayPasteRatioCharsEl.textContent = totalCharsFiltered > 0 ? ((totalPastedChars / totalCharsFiltered) * 100).toFixed(1) + '%' : '--%';
        essayPasteEventsCountEl.textContent = totalPasteEvents;

        const totalTypingDurationSecFiltered = allSentenceStats.reduce((sum, s) => sum + ((s.typedDurationMs || 0) / 1000), 0);
        const overallWPMFiltered = totalTypedWordsAgg > 0 && totalTypingDurationSecFiltered > 0 ?
            Math.round((totalTypedWordsAgg / totalTypingDurationSecFiltered) * 60) : 0;
        essayTypingSpeedEl.textContent = `${overallWPMFiltered} WPM`;
        essayBackspaceCountEl.textContent = totalBackspace;
        essayDeleteCountEl.textContent = totalDelete;
        // mainAIAttemptsEl, jsAIAttemptsEl, promptsUsedCountEl would need data from sessions if tracked

        // --- Render Charts ---
        currentSentenceChunkLine = 0; // Reset for paged charts
        currentSentenceChunkBar = 0;  // Reset for paged charts
        renderPagedSentenceCharts(); // Uses fullSentenceStatsForPaging

        renderTypingRhythmChart(localAllTypingEvents);
        renderActivityAggregationCharts(filteredData); // For hourly/daily charts
        renderOverallActivityChart(filteredData); // For general activity bar chart
        renderTextCompositionPieChart(totalTypedChars, totalPastedChars);

        // Placeholder or actual data for AI charts
        renderPlaceholderChart('aiUsageChart', 'bar', 'AI Usage (Placeholder)', ['Main AI', 'JS AI', 'Prompts'], [0, 0, 0]);
        // renderPlaceholderChart('errorChart', 'line', 'Errors (Placeholder)', [], []); // If you add error tracking

        generateDailyInsights(filteredData);
        renderQrCodeForReport(filteredData);

        // Your console logs for debugging sentence stats can remain if helpful
        console.log("DASHBOARD: allSentenceStats for charts :>> ", fullSentenceStatsForPaging.slice(0,5));
        if (fullSentenceStatsForPaging.length > 0) {
            console.log("DASHBOARD: First sentence stat object for paged charts:", JSON.stringify(fullSentenceStatsForPaging[0]));
        } else {
            console.warn("DASHBOARD: fullSentenceStatsForPaging IS EMPTY for charts!");
        }
        console.log("------------------------------------------------------");
    }




    function renderPagedSentenceCharts() {
        const lineChartDataChunk = fullSentenceStatsForPaging.slice(
            currentSentenceChunkLine * SENTENCES_PER_CHUNK,
            (currentSentenceChunkLine + 1) * SENTENCES_PER_CHUNK
        );
        renderTypingBehaviorLineChart(lineChartDataChunk);
        updateNavControls(
            prevSentenceChunkBtn, nextSentenceChunkBtn, sentenceChunkIndicator,
            currentSentenceChunkLine, fullSentenceStatsForPaging.length, SENTENCES_PER_CHUNK
        );
    
        const barChartDataChunk = fullSentenceStatsForPaging.slice(
            currentSentenceChunkBar * SENTENCES_PER_CHUNK,
            (currentSentenceChunkBar + 1) * SENTENCES_PER_CHUNK
        );
        renderSentenceSummaryBarChart(barChartDataChunk);
        updateNavControls(
            prevSentenceBarChunkBtn, nextSentenceBarChunkBtn, sentenceBarChunkIndicator,
            currentSentenceChunkBar, fullSentenceStatsForPaging.length, SENTENCES_PER_CHUNK
        );
    }




    function updateNavControls(prevBtn, nextBtn, indicatorEl, currentChunk, totalItems, itemsPerChunk) {
        if (!prevBtn || !nextBtn || !indicatorEl) return;
        const totalChunks = Math.ceil(totalItems / itemsPerChunk);
        prevBtn.disabled = currentChunk === 0;
        nextBtn.disabled = currentChunk >= totalChunks - 1 || totalChunks === 0;
        if (totalItems > 0) {
            indicatorEl.textContent = `Sentences ${currentChunk * itemsPerChunk + 1}-${Math.min((currentChunk + 1) * itemsPerChunk, totalItems)} of ${totalItems}`;
        } else {
            indicatorEl.textContent = "No sentence data";
        }
    }

    if (prevSentenceChunkBtn) {
        prevSentenceChunkBtn.addEventListener('click', () => {
            if (currentSentenceChunkLine > 0) {
                currentSentenceChunkLine--;
                renderPagedSentenceCharts();
            }
        });
    }

    if (nextSentenceChunkBtn) {
        nextSentenceChunkBtn.addEventListener('click', () => {
            const totalChunks = Math.ceil(fullSentenceStatsForPaging.length / SENTENCES_PER_CHUNK);
            if (currentSentenceChunkLine < totalChunks - 1) {
                currentSentenceChunkLine++;
                renderPagedSentenceCharts();
            }
        });
    }
    if (prevSentenceBarChunkBtn) {
        prevSentenceBarChunkBtn.addEventListener('click', () => {
            if (currentSentenceChunkBar > 0) {
                currentSentenceChunkBar--;
                renderPagedSentenceCharts();
            }
        });
    }
    if (nextSentenceBarChunkBtn) {
        nextSentenceBarChunkBtn.addEventListener('click', () => {
            const totalChunks = Math.ceil(fullSentenceStatsForPaging.length / SENTENCES_PER_CHUNK);
            if (currentSentenceChunkBar < totalChunks - 1) {
                currentSentenceChunkBar++;
                renderPagedSentenceCharts();
            }
        });
    }

    


    function renderWordSpeedSineChart(allSessionsTypingEvents) { // Assuming worker provides this
        const canvasId = 'wordSpeedSineChart'; // You'll need this canvas in dashboard.html
        // ... (get ctx, destroy old chart) ...
    
        if (!allSessionsTypingEvents || allSessionsTypingEvents.length < 2) return;
    
        const chartData = [];
        let lastEventEndTime = allSessionsTypingEvents[0].timestamp;
    
        allSessionsTypingEvents.forEach(event => {
            // Pause before this event
            if (event.timestamp > lastEventEndTime) {
                chartData.push({ x: lastEventEndTime, y: 0 }); // Start of pause
                chartData.push({ x: event.timestamp, y: 0 });   // End of pause
            }
    
            if (event.type === 'word' && event.durationMs > 0) {
                const speed = (event.word.length / event.durationMs) * 1000; // Chars per second
                chartData.push({ x: event.timestamp, y: 0 }); // Start of typing burst
                chartData.push({ x: event.timestamp + (event.durationMs / 2), y: speed }); // Peak
                chartData.push({ x: event.timestamp + event.durationMs, y: 0 }); // End of typing burst
                lastEventEndTime = event.timestamp + event.durationMs;
            } else if (event.type === 'char') { // Simpler: small blip for each char
                chartData.push({ x: event.timestamp, y: 10 }); // Arbitrary small amplitude
                chartData.push({ x: event.timestamp + 20, y: 0 }); // Short duration blip
                lastEventEndTime = event.timestamp + 20; // Rough
            }
        });
    
        // Sort chartData by x (time)
        chartData.sort((a, b) => a.x - b.x);
    
        charts[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                datasets: [{
                    label: 'Typing Activity (Chars/sec or Pauses)',
                    data: chartData,
                    borderColor: chartColors.wpm(),
                    fill: false,
                    tension: 0.1 // For a slightly smoother look
                }]
            },
            options: {
                // ... scales (time axis), tooltips ...
                scales: {
                    x: { type: 'time', time: { unit: 'second' }, ticks: {color: chartColors.text()}, grid: {color: chartColors.grid()} },
                    y: { title: {display: true, text: 'Activity Level'}, ticks: {color: chartColors.text()}, grid: {color: chartColors.grid()} }
                }
            }
        });
    }


    function renderTextCompositionPieChart(typedChars, pastedChars) {
        const canvasId = 'textCompositionPieChart';
        const ctx = document.getElementById(canvasId)?.getContext('2d');
        if (!ctx) return;
        if (charts[canvasId]) charts[canvasId].destroy();
    
        if (typedChars === 0 && pastedChars === 0) {
            ctx.clearRect(0,0,ctx.canvas.width, ctx.canvas.height);
            // Optionally display "No data"
            return;
        }
    
        charts[canvasId] = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: ['Typed Characters', 'Pasted Characters'],
                datasets: [{
                    label: 'Character Source',
                    data: [typedChars, pastedChars],
                    backgroundColor: [
                        chartColors.chars(),    // Re-use existing color
                        chartColors.delete()    // Re-use existing color (or define a new one)
                    ],
                    borderColor: [
                        getThemeColor('--editor-bg', '#fff'),
                        getThemeColor('--editor-bg', '#fff')
                    ],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: chartColors.text() }
                    },
                    title: {
                        display: false // Title is in the card header
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                if (context.parsed !== null) {
                                    label += context.parsed + ' chars';
                                }
                                return label;
                            }
                        }
                    },
                    zoom: {
                        pan: {
                            enabled: true,
                            mode: 'x', // Pan horizontally
                        },
                        zoom: {
                            wheel: { enabled: true },
                            pinch: { enabled: true },
                            mode: 'x',
                        }
                    }
                
                }
            }
        });
    }
    
    function renderSentenceSummaryBarChart(sentenceStats) {
        const canvasId = 'sentenceSummaryBarChart';
        const ctx = document.getElementById(canvasId)?.getContext('2d');
        if (!ctx) {
            console.warn(`Canvas ID ${canvasId} not found for bar chart.`);
            return;
        }
        if (charts[canvasId]) charts[canvasId].destroy();

        if (!sentenceStats || sentenceStats.length === 0) {
            ctx.clearRect(0,0,ctx.canvas.width, ctx.canvas.height);
            return;
        }

        const labels = sentenceStats.map((s, i) => `S${currentSentenceChunkBar * SENTENCES_PER_CHUNK + i + 1}`);
        
        const greenColor = chartColors.success(); // e.g., 'rgba(46, 204, 113, 0.7)'
        const lighterGreenColor = greenColor.replace('0.7', '0.4'); // More transparent for distinction


        charts[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'WPM',
                        data: sentenceStats.map(s => s.wpm || 0),
                        backgroundColor: sentenceStats.map(s => s.category === 'highlight-anomaly-speed' ? chartColors.delete() : chartColors.wpm()),
                        yAxisID: 'yWPM_bar',
                    },
                    {
                        label: 'Typed Chars',
                        data: sentenceStats.map(s => s.typedChars || 0),
                        backgroundColor: chartColors.chars(),
                        yAxisID: 'yChars_bar',
                    },
                    {
                        label: 'Duration (s)',
                        data: sentenceStats.map(s => parseFloat(((s.typedDurationMs || 0) / 1000).toFixed(1))),
                        backgroundColor: chartColors.focus(),
                        yAxisID: 'yDuration_bar',
                    },
                    { // MODIFIED COLOR
                        label: 'Backspaces',
                        data: sentenceStats.map(s => s.backspaces || 0),
                        backgroundColor: greenColor, // Solid Green
                        yAxisID: 'yCorrections_bar',
                    },
                    { // MODIFIED COLOR & DISTINCTION
                        label: 'Deletes',
                        data: sentenceStats.map(s => s.deletes || 0),
                        backgroundColor: lighterGreenColor, // Lighter/Transparent Green
                        yAxisID: 'yCorrections_bar',
                    },
                     { // MODIFIED COLOR
                        label: 'Paste Influence (Chars)',
                        data: sentenceStats.map(s => s.pasteInfluence || 0),
                        backgroundColor: chartColors.delete(), // RED
                        yAxisID: 'yPaste_bar',
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    yWPM_bar: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'WPM', color: chartColors.text()}, ticks: {color: chartColors.text()}, grid: {color: chartColors.grid()} },
                    yChars_bar: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Typed Chars', color: chartColors.text()}, ticks: {color: chartColors.text()}, grid: {drawOnChartArea: false} },
                    yDuration_bar: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Duration (s)', color: chartColors.text()}, ticks: {color: chartColors.text()}, grid: {drawOnChartArea: false} },
                    yCorrections_bar: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Corrections', color: chartColors.text()}, ticks: {color: chartColors.text(), precision: 0}, grid: {drawOnChartArea: false}, stacked: true }, // Keep stacked if desired
                    yPaste_bar: { type: 'linear', display: true, position: 'right', title: {display: true, text: 'Paste Chars', color: chartColors.text()}, ticks: {color: chartColors.text(), precision: 0}, grid: {drawOnChartArea: false}},
                    x: { stacked: false, title: {display: true, text: 'Sentences', color: chartColors.text()}, ticks: {color: chartColors.text()}, grid: {color: chartColors.grid()} }
                },

                plugins: {
                    legend: { labels: { color: chartColors.text(), usePointStyle: true }, position: 'bottom' },
                    tooltip: {
                        backgroundColor: getThemeColor('--editor-bg', '#fff'),
                        titleColor: chartColors.text(),
                        bodyColor: chartColors.text(),
                        borderColor: chartColors.grid(),
                        borderWidth: 1,
                    },
                    zoom: {
                        pan: {
                            enabled: true,
                            mode: 'x', // Pan horizontally
                        },
                        zoom: {
                            wheel: { enabled: true },
                            pinch: { enabled: true },
                            mode: 'x',
                        }
                    }
                
                }
            },
            callbacks: {
                label: function(context) {
                    let label = context.dataset.label || '';
                    if (label) {
                        label += ': ';
                    }
                    if (context.parsed.y !== null) {
                        label += context.parsed.y;
                    }
                    // Add sentence category to tooltip title or footer
                    // For simplicity, we'll rely on the text highlighting in main.html
                    // and the visual spike in the chart for anomalies.
                    // More complex tooltips can be built if needed.
                    return label;
                },
                afterTitle: function(context) { // Add category to tooltip title area
                    const sentenceIndex = context[0]?.dataIndex; // Get index from first item
                    if (sentenceStats && sentenceStats[sentenceIndex] !== undefined && sentenceStats[sentenceIndex].category) {
                        let cat = sentenceStats[sentenceIndex].category.replace('highlight-', '');
                        if (cat === 'anomaly-speed') cat = 'Speed Anomaly!';
                        return `Category: ${cat}`;
                    }
                    return '';
                }
            }

        });
    }

    
    function renderOverallActivityChart(filteredData) { // Renamed from your old renderDailyActivityChart
        const canvasId = 'activityChart';
        const ctx = document.getElementById(canvasId)?.getContext('2d');
        if (!ctx) { console.warn("Canvas activityChart not found"); return; }
        if (charts[canvasId]) charts[canvasId].destroy();
    
        if (!filteredData || filteredData.length === 0) {
            ctx.clearRect(0,0,ctx.canvas.width, ctx.canvas.height); return;
        }
        const dailyData = {};
        filteredData.forEach(session => {
            const date = formatDate(session.startTime);
            if (!dailyData[date]) {
                dailyData[date] = { typedWords: 0, activeTimeMinutes: 0, pasteEvents: 0, sessionCount: 0 };
            }
            (session.sentenceStats || []).forEach(s => dailyData[date].typedWords += (s.typedWords || 0)); // Fallback used
            dailyData[date].activeTimeMinutes += (session.totalActiveTimeMs || 0) / 60000;
            dailyData[date].pasteEvents += (session.pastedSegmentsDetails || []).length;
            dailyData[date].sessionCount++;
        });

        const labels = Object.keys(dailyData).sort((a,b) => new Date(a) - new Date(b));
        const typedWordsData = labels.map(date => dailyData[date].typedWords);
        const activeTimeData = labels.map(date => parseFloat(dailyData[date].activeTimeMinutes.toFixed(1)));
        const pasteEventsData = labels.map(date => dailyData[date].pasteEvents);
        charts[canvasId] = new Chart(ctx, {
            type: 'bar', // Or line
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Words Typed', data: typedWordsData,
                        backgroundColor: chartColors.chars(), yAxisID: 'yPrimary',
                    },
                    {
                        label: 'Active Time (min)', data: activeTimeData,
                        backgroundColor: chartColors.focus(), yAxisID: 'ySecondary', type: 'line', tension: 0.1, fill:false, borderColor: chartColors.focus()
                    },
                    {
                        label: 'Paste Events', data: pasteEventsData,
                        backgroundColor: chartColors.delete(), yAxisID: 'yPrimary', // Share axis or make new
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    yPrimary: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'Count', color: chartColors.text()}, ticks: {color: chartColors.text()}, grid: {color: chartColors.grid()} },
                    ySecondary: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Minutes', color: chartColors.text()}, ticks: {color: chartColors.text()}, grid: {drawOnChartArea: false} },
                    x: { title: {display: true, text: 'Date', color: chartColors.text()}, ticks: {color: chartColors.text()}, grid: {color: chartColors.grid()} }
                },
                plugins: { legend: { labels: { color: chartColors.text() } } }
            }
        });
    }
    

    function renderTypingBehaviorLineChart(sentenceStats) {
        const canvasId = 'typingBehaviorChart';
        const ctx = document.getElementById(canvasId)?.getContext('2d');
        if (!ctx) { console.warn(`Canvas ID ${canvasId} not found.`); return; }
        if (charts[canvasId]) charts[canvasId].destroy();
        if (!sentenceStats || sentenceStats.length === 0) {
            ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); return;
        }

        // sentenceStats should already be sorted by startTime from updateDashboard
const labels = sentenceStats.map((s, i) => `S${currentSentenceChunkLine * SENTENCES_PER_CHUNK + i + 1}`);
const wpmData = sentenceStats.map(s => s.wpm || 0);
const backspaceData = sentenceStats.map(s => s.backspaces || 0);
const deleteData = sentenceStats.map(s => s.deletes || 0);
const durationData = sentenceStats.map(s => parseFloat(((s.typedDurationMs || 0) / 1000).toFixed(1)));
const pasteInfluenceData = sentenceStats.map(s => s.pasteInfluence || 0);

        charts[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'WPM', data: wpmData, borderColor: chartColors.wpm(), /* ... point styling ... */ yAxisID: 'yWPM', fill: false, tension: 0.1 },
                    { label: 'Duration (s)', data: durationData, borderColor: chartColors.focus(), tension: 0.1, yAxisID: 'yDuration', fill: false },
                    { label: 'Backspaces', data: backspaceData, borderColor: chartColors.backspace(), type: 'bar', yAxisID: 'yCorrections', order: 1 },
                    { label: 'Deletes', data: deleteData, borderColor: chartColors.delete(), type: 'bar', yAxisID: 'yCorrections', order: 1 },
                    { label: 'Paste Influence (Chars)', data: pasteInfluenceData, borderColor: getThemeColor('--color-primary-02', 'rgba(153, 102, 255, 0.8)'), type: 'bar', yAxisID: 'yPaste', order: 0 }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { // Improved tooltips
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    yWPM: {
                        type: 'linear', display: true, position: 'left',
                        title: { display: true, text: 'WPM', color: chartColors.text() },
                        ticks: { color: chartColors.text() }, grid: { color: chartColors.grid() }
                    },
                    yDuration: {
                        type: 'linear', display: true, position: 'left', // Can be on the same side if scales are different enough
                        title: { display: true, text: 'Duration (s)', color: chartColors.text() },
                        ticks: { color: chartColors.text() }, grid: { drawOnChartArea: false } // Avoid clutter
                    },
                    yCorrections: {
                        type: 'linear', display: true, position: 'right',
                        title: { display: true, text: 'Corrections', color: chartColors.text() },
                        ticks: { color: chartColors.text(), precision: 0 }, grid: { drawOnChartArea: false },
                        beginAtZero: true
                    },
                    yPaste: {
                        type: 'linear', display: true, position: 'right',
                        title: { display: true, text: 'Paste Chars', color: chartColors.text() },
                        ticks: { color: chartColors.text(), precision: 0 }, grid: { drawOnChartArea: false },
                        beginAtZero: true,
                        suggestedMax: Math.max(...pasteInfluenceData, 10) // Dynamic max or a sensible default
                    },
                    x: {
                        title: { display: true, text: 'Typed Sentences/Segments', color: chartColors.text() },
                        ticks: { color: chartColors.text() }, grid: { color: chartColors.grid() }
                    }
                },
                plugins: {
                    legend: { labels: { color: chartColors.text(), usePointStyle: true }, position: 'bottom' },
                    tooltip: {
                        backgroundColor: getThemeColor('--editor-bg', '#fff'),
                        titleColor: chartColors.text(),
                        bodyColor: chartColors.text(),
                        borderColor: chartColors.grid(),
                        borderWidth: 1,
                        callbacks: { // Custom tooltip labels for clarity
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                                         if (context.parsed.y !== null) {
                                    label += context.parsed.y;
                                    // Add units based on yAxisID
                                    if (context.dataset.yAxisID === 'yWPM') label += ' WPM';
                                    else if (context.dataset.yAxisID === 'yDuration') label += ' s';
                                    else if (context.dataset.yAxisID === 'yPaste') label += ' chars';

                                    // Add sentence category if available
                                    const sentenceIndex = context.dataIndex;
                                    if (sentenceStats && sentenceStats[sentenceIndex] && sentenceStats[sentenceIndex].category) {
                                        let cat = sentenceStats[sentenceIndex].category.replace('highlight-', '');
                                        if (cat === 'anomaly-speed') cat = 'Speed Anomaly!';
                                        label += ` (${cat})`;
                                    }
                                }
                                return label;

                            }
                        }
                    },
                    zoom: {
                        pan: {
                            enabled: true,
                            mode: 'x', // Pan horizontally
                        },
                        zoom: {
                            wheel: { enabled: true },
                            pinch: { enabled: true },
                            mode: 'x',
                        }
                    }
                
                }
            }
        });
    }

    function renderPlaceholderChart(canvasId, type, label, labels, data) {
        const ctx = document.getElementById(canvasId)?.getContext('2d');
        if (!ctx) return;
        if (charts[canvasId]) charts[canvasId].destroy();
        charts[canvasId] = new Chart(ctx, {
            type: type,
            data: { labels: labels, datasets: [{ label: label, data: data, backgroundColor: chartColors.grid() }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, ticks: { color: chartColors.text() }, grid: { color: chartColors.grid() } },
                    x: { ticks: { color: chartColors.text() }, grid: { color: chartColors.grid() } }
                },
                plugins: { legend: { labels: { color: chartColors.text() } },
                zoom: {
                    pan: {
                        enabled: true,
                        mode: 'x', // Pan horizontally
                    },
                    zoom: {
                        wheel: { enabled: true },
                        pinch: { enabled: true },
                        mode: 'x',
                    }
                }
             
            
            
            
            }
            }
        });
    }

    function renderTypingBehaviorChart(sentenceStats) { /* ... (keep existing, but use chartColors) ... */
        const ctx = document.getElementById('typingBehaviorChart')?.getContext('2d');
        if (!ctx) return;
        if (charts.typingBehaviorChart) charts.typingBehaviorChart.destroy();
        if (!sentenceStats || sentenceStats.length === 0) { /* ... clear canvas ... */ return; }
        sentenceStats.sort((a, b) => a.startTime - b.startTime);
        const labels = sentenceStats.map((s, i) => `S${i + 1}`);
        charts.typingBehaviorChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    { label: 'WPM', data: sentenceStats.map(s => s.wpm), borderColor: chartColors.wpm(), tension: 0.1, yAxisID: 'yWPM' },
                    { label: 'Backspaces', data: sentenceStats.map(s => s.backspaces), borderColor: chartColors.backspace(), stepped: true, yAxisID: 'yCorrections' },
                    { label: 'Deletes', data: sentenceStats.map(s => s.deletes), borderColor: chartColors.delete(), stepped: true, yAxisID: 'yCorrections' }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                scales: {
                    yWPM: { type: 'linear', display: true, position: 'left', title: { display: true, text: 'WPM', color: chartColors.text() }, ticks: { color: chartColors.text() }, grid: { color: chartColors.grid() } },
                    yCorrections: { type: 'linear', display: true, position: 'right', title: { display: true, text: 'Corrections', color: chartColors.text() }, grid: { drawOnChartArea: false }, ticks: { color: chartColors.text() } },
                    x: { ticks: { color: chartColors.text() }, grid: { color: chartColors.grid() } }
                },
                plugins: { legend: { labels: { color: chartColors.text() } } }
            }
        });
    }

    // New function for aggregated charts
    function renderActivityAggregationCharts(data) {
        if (!data || data.length === 0) return;

        const hourlyAgg = {};
        const dailyAgg = {};

        data.forEach(session => {
            const sessionDate = new Date(session.startTime);
            const dateKey = `${sessionDate.getFullYear()}-${String(sessionDate.getMonth() + 1).padStart(2, '0')}-${String(sessionDate.getDate()).padStart(2, '0')}`;
            const hourKeyBase = `${dateKey}T${String(sessionDate.getHours()).padStart(2, '0')}`;
            const dailyKey = formatDate(session.startTime); // YYYY-MM-DD
            const hourlyKey = `${dailyKey}T${String(sessionDate.getHours()).padStart(2, '0')}`;
            if (!dailyAgg[dailyKey]) dailyAgg[dailyKey] = { backspaces: 0, deletes: 0, undos: 0, typedChars: 0, typedWords:0, durationMs:0, focusTimeMs: 0 };
            
            
            // Aggregate per session first then distribute to hourly/daily
            let sessionTypedChars = 0;
            let sessionTypedWords = 0;
            let sessionDurationMs = 0; // for WPM calculation
            (session.sentenceStats || []).forEach(s => {
                sessionTypedChars += s.typedChars;
                sessionTypedWords += s.typedWords;
                sessionDurationMs += s.typedDurationMs;
            });
            if (!dailyAgg[dailyKey]) dailyAgg[dailyKey] = { backspaces: 0, deletes: 0, undos: 0, typedChars: 0, typedWords:0, durationMs:0, focusTimeMs: 0 }; // Initialize all expected properties
            dailyAgg[dailyKey].backspaces += (session.backspaceCount || 0);
            dailyAgg[dailyKey].deletes += (session.deleteCount || 0);
            dailyAgg[dailyKey].undos += (session.undoCount || 0);
            // ... other dailyAgg accumulations
        
            if (!hourlyAgg[hourlyKey]) hourlyAgg[hourlyKey] = { backspaces: 0, deletes: 0, undos: 0 /* other metrics */};
            hourlyAgg[hourlyKey].backspaces += (session.backspaceCount || 0);
            hourlyAgg[hourlyKey].deletes += (session.deleteCount || 0);
            hourlyAgg[hourlyKey].undos += (session.undoCount || 0);
        
            // For hourly, we consider parts of sessions falling into an hour
            // This is a simplification: assumes session events (sentences) are timestamped
            // We'll use sentence start times for aggregation
             (session.sentenceStats || []).forEach(s => {
                const sentenceDate = new Date(s.startTime);
                const sentenceHourKey = `${sentenceDate.getFullYear()}-${String(sentenceDate.getMonth() + 1).padStart(2, '0')}-${String(sentenceDate.getDate()).padStart(2, '0')}T${String(sentenceDate.getHours()).padStart(2, '0')}`;
                const sentenceDateKey = sentenceHourKey.substring(0,10); // Should be same as dailyKey for this session
                
                
                if (!hourlyAgg[sentenceHourKey]) hourlyAgg[sentenceHourKey] = { typedChars: 0, typedWords:0, durationMs:0, backspaces: 0, deletes: 0, focusTimeMs: 0, undos: 0 }; // Initialize all
                if (!dailyAgg[sentenceDateKey]) dailyAgg[sentenceDateKey] = { typedChars: 0, typedWords:0, durationMs:0, backspaces: 0, deletes: 0, focusTimeMs: 0, undos: 0 }; // Initialize all if not already by session

                // *** ADDED FALLBACKS (|| 0) ***
                hourlyAgg[sentenceHourKey].typedChars += (s.typedChars || 0);
                hourlyAgg[sentenceHourKey].typedWords += (s.typedWords || 0);
                hourlyAgg[sentenceHourKey].durationMs += (s.typedDurationMs || 0);
                hourlyAgg[sentenceHourKey].backspaces += (s.backspaces || 0);
                hourlyAgg[sentenceHourKey].deletes += (s.deletes || 0);
                hourlyAgg[sentenceHourKey].focusTimeMs += (s.typedDurationMs || 0); // Using typedDurationMs as proxy


                dailyAgg[sentenceDateKey].typedChars += (s.typedChars || 0);
                dailyAgg[sentenceDateKey].typedWords += (s.typedWords || 0);
                dailyAgg[sentenceDateKey].durationMs += (s.typedDurationMs || 0);
                dailyAgg[sentenceDateKey].backspaces += (s.backspaces || 0); // Note: this adds sentence backspaces on top of session backspaces
                dailyAgg[sentenceDateKey].deletes += (s.deletes || 0);     // Same for deletes. Consider if this is intended or should be one source.
                dailyAgg[sentenceDateKey].focusTimeMs += (s.typedDurationMs || 0);            });
             // Add overall session backspaces/deletes if not fully covered by sentences (e.g. outside sentence typing)
            // This is a bit tricky. For now, sentence-level is primary.
        });
        const dailyLabels = Object.keys(dailyAgg).sort();

        // Create Hourly Charts
        
        const hourlyLabels = Object.keys(hourlyAgg).sort();
        createBarChart('hourlyTypingSpeedChart', 'Hourly WPM', hourlyLabels, 
        hourlyLabels.map(k => hourlyAgg[k] && (hourlyAgg[k].typedWords || 0) > 0 && (hourlyAgg[k].durationMs || 0) > 0 ? Math.round((hourlyAgg[k].typedWords || 0) / ((hourlyAgg[k].durationMs || 1)/60000)) : 0), 
        chartColors.wpm()
    );

    createBarChart('hourlyTypedCharsChart', 'Hourly Typed Chars', hourlyLabels, 
    hourlyLabels.map(k => hourlyAgg[k]?.typedChars || 0), chartColors.chars());

    createBarChart('hourlyCorrectionsChart', 'Hourly Corrections', hourlyLabels, [
        { label: 'Backspaces', data: hourlyLabels.map(k => hourlyAgg[k]?.backspaces || 0), backgroundColor: chartColors.backspace() },
        { label: 'Deletes', data: hourlyLabels.map(k => hourlyAgg[k]?.deletes || 0), backgroundColor: chartColors.delete() }
    ]);

    createBarChart('hourlyFocusTimeChart', 'Hourly Focus (min)', hourlyLabels, 
    hourlyLabels.map(k => parseFloat(((hourlyAgg[k]?.focusTimeMs || 0) / 60000).toFixed(1))), chartColors.focus());
    
        // Create Daily Charts
        createBarChart('dailyTypingSpeedChart', 'Daily Avg WPM', dailyLabels, 
        dailyLabels.map(k => dailyAgg[k] && (dailyAgg[k].typedWords || 0) > 0 && (dailyAgg[k].durationMs || 0) > 0 ? Math.round((dailyAgg[k].typedWords || 0) / ((dailyAgg[k].durationMs || 1)/60000)) : 0), 
        chartColors.wpm()
    );

    
    createBarChart('dailyTypedCharsChart', 'Daily Typed Chars', dailyLabels, 
    dailyLabels.map(k => dailyAgg[k]?.typedChars || 0), chartColors.chars());

    createBarChart('dailyCorrectionsChart', 'Daily Corrections', dailyLabels, [
        { label: 'Backspaces', data: dailyLabels.map(k => dailyAgg[k]?.backspaces || 0), backgroundColor: chartColors.backspace() },
        { label: 'Deletes', data: dailyLabels.map(k => dailyAgg[k]?.deletes || 0), backgroundColor: chartColors.delete() }
    ]);


    createBarChart('dailyFocusTimeChart', 'Daily Focus (min)', dailyLabels, 
    dailyLabels.map(k => parseFloat(((dailyAgg[k]?.focusTimeMs || 0) / 60000).toFixed(1))), chartColors.focus());



    createBarChart('correctionUndoDailyChart', 'Daily Correction/Undo', dailyLabels, [
        { label: 'Backspaces', data: dailyLabels.map(k => dailyAgg[k]?.backspaces || 0), backgroundColor: chartColors.backspace() },
        { label: 'Deletes', data: dailyLabels.map(k => dailyAgg[k]?.deletes || 0), backgroundColor: chartColors.delete() },
        { label: 'Undos (Ctrl+Z)', data: dailyLabels.map(k => dailyAgg[k]?.undos || 0), backgroundColor: getThemeColor('--color-primary-03', 'lightblue') }
    ]);
    createBarChart('correctionUndoHourlyChart', 'Hourly Correction/Undo', hourlyLabels, [
        { label: 'Backspaces', data: hourlyLabels.map(k => hourlyAgg[k]?.backspaces || 0), backgroundColor: chartColors.backspace() },
        { label: 'Deletes', data: hourlyLabels.map(k => hourlyAgg[k]?.deletes || 0), backgroundColor: chartColors.delete() },
        { label: 'Undos (Ctrl+Z)', data: hourlyLabels.map(k => hourlyAgg[k]?.undos || 0), backgroundColor: getThemeColor('--color-primary-03', 'lightblue') }
    ]);



    }

// dashboard.js

// dashboard.js

function createBarChart(canvasId, title, labels, datasetsOrDataArray, defaultColorForSingleDataset) {
    const ctx = document.getElementById(canvasId)?.getContext('2d');
    if (!ctx) {
        console.warn(`Canvas with ID '${canvasId}' not found.`);
        return;
    }

    if (charts[canvasId]) {
        charts[canvasId].destroy();
    }

    let finalDatasets;

    // Check if datasetsOrDataArray is an array of dataset objects
    if (Array.isArray(datasetsOrDataArray) && datasetsOrDataArray.length > 0 && typeof datasetsOrDataArray[0] === 'object' && datasetsOrDataArray[0] !== null && 'data' in datasetsOrDataArray[0]) {
        // It's already in the format of [{ label: 'L1', data: [], ...}, { label: 'L2', data: [], ...}]
        finalDatasets = datasetsOrDataArray;
    } else if (Array.isArray(datasetsOrDataArray)) {
        // It's a simple array of data points for a single dataset
        finalDatasets = [{
            label: title, // Use the main title for this single dataset
            data: datasetsOrDataArray,
            backgroundColor: defaultColorForSingleDataset
        }];
    } else {
        console.error(`Invalid datasetsOrDataArray for chart ${canvasId}:`, datasetsOrDataArray);
        finalDatasets = [{ label: title, data: [], backgroundColor: defaultColorForSingleDataset || 'grey' }]; // Fallback
    }

    try {
        charts[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: finalDatasets // Use the processed finalDatasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: { display: false, text: title, color: chartColors.text() }, // Main title is less critical if datasets have labels
                    legend: { labels: { color: chartColors.text() } }
                },
                scales: {
                    y: { beginAtZero: true, ticks: { color: chartColors.text() }, grid: { color: chartColors.grid() } },
                    x: { ticks: { color: chartColors.text(), autoSkip: true, maxTicksLimit: labels.length > 24 ? 12 : 24 }, grid: { color: chartColors.grid() } }
                }
            }
        });
    } catch (e) {
        console.error(`Error creating chart ${canvasId}:`, e);
        console.error(`Data passed to chart ${canvasId}:`, { labels, finalDatasets });
    }
}



// Usage example that might be problematic if hourlyAgg[k] values are not as expected:
// Inside renderActivityAggregationCharts:
// Hourly WPM

    
    function generateDailyInsights(data) { /* ... (keep existing, but ensure robustness for empty data) ... */ }

    function renderQrCodeForReport(filteredData) {
        const qrContainer = document.getElementById('qrCodeContainerDashboard');
        if (!qrContainer) return;
        qrContainer.innerHTML = '';

        if (!filteredData || filteredData.length === 0 || typeof kjua === 'undefined') {
            qrContainer.textContent = 'QR code available with data.';
            return;
        }
        // ... (summary logic as before) ...
        let summaryTypedWords = 0, summaryPastedWords = 0, summaryActiveTimeMs = 0, summaryWPMs = [];
        filteredData.forEach(session => {
            (session.sentenceStats || []).forEach(s => summaryTypedWords += s.typedWords);
            (session.pastedSegmentsDetails || []).forEach(p => summaryPastedWords += p.wordCount);
            summaryActiveTimeMs += session.totalActiveTimeMs || 0;
            if (session.averageWPM) summaryWPMs.push(session.averageWPM);
        });
        const avgWpmOverall = summaryWPMs.length > 0 ? (summaryWPMs.reduce((a, b) => a + b, 0) / summaryWPMs.length).toFixed(0) : 0;
        const qrText = `Report Summary:\nDate: ${new Date().toLocaleDateString()}\nActive: ${formatTime(summaryActiveTimeMs)}\nTyped: ${summaryTypedWords}w\nPasted: ${summaryPastedWords}w\nAvg Speed: ${avgWpmOverall} WPM`;

        const qrEl = kjua({
            text: qrText,
            render: 'canvas', // or 'svg'
            crisp: true,
            size: 140,
            fill: getThemeColor('--text-primary', '#000'),
            back: getThemeColor('--editor-bg', '#fff'), // Use editor-bg for QR background
            rounded: 30, // 0-100 percentage for corner rounding
            quiet: 1, // quiet zone (modules)
        });
        qrContainer.appendChild(qrEl);
    }

    // Event Listeners for filters, print, refresh (keep existing)
    applyFilterBtn.addEventListener('click', () => {
        const data = getFilteredData();
        updateDashboard(data);
    });
    resetFilterBtn.addEventListener('click', () => {
        filterStartDateEl.value = ''; filterEndDateEl.value = '';
        updateDashboard(allSessionsData);
    });

    printDashboardBtn.addEventListener('click', () => window.print());
    
    refreshDataBtn.addEventListener('click', () => {
        console.log("Refresh button clicked. Old allSessionsData count:", allSessionsData.length);
        loadData(); // This re-reads from localStorage
        console.log("Data reloaded. New allSessionsData count:", allSessionsData.length);
    
        // It's crucial that getFilteredData() USES the newly loaded allSessionsData
        const currentFilteredData = getFilteredData();
        
        // updateDashboard should then use this potentially new data
        updateDashboard(currentFilteredData.length > 0 ? currentFilteredData : allSessionsData);
        
        console.log("Dashboard refreshed with data for update:", currentFilteredData.length > 0 ? currentFilteredData : allSessionsData);
    });
        document.querySelectorAll('.print-element-btn').forEach(button => { /* ... (keep existing) ... */ });

    // Theme handling for dashboard
    const themeButtonsDash = {
        light: document.getElementById('themeLightBtnDash'),
        dark: document.getElementById('themeDarkBtnDash'),
        blueNeon: document.getElementById('themeBlueNeonBtnDash'),
    };

    function applyThemeDashboard(themeName, fromMessage = false) {
        console.log("Dashboard: Applying theme -", themeName);
        document.body.className = '';
        document.body.classList.add(`theme-${themeName}`);
        if (!fromMessage) {
            localStorage.setItem(THEME_STORAGE_KEY, themeName);
        }
    
        // Call updateDashboard directly if it doesn't cause other issues
        const dataForUpdate = getFilteredData();
        updateDashboard(Array.isArray(dataForUpdate) && dataForUpdate.length > 0 ? dataForUpdate : allSessionsData);
    }
    
    function getFilteredData() {
        let startDate = filterStartDateEl.value ? new Date(filterStartDateEl.value).getTime() : 0;
        let endDate = filterEndDateEl.value ? new Date(filterEndDateEl.value) : null;
        if (endDate) {
            endDate.setHours(23, 59, 59, 999);
            endDate = endDate.getTime();
        } else {
            endDate = Date.now();
        }
        const dataToFilter = Array.isArray(allSessionsData) ? allSessionsData : []; 
        return dataToFilter.filter(session => {
            if (!session || typeof session.startTime === 'undefined') return false;
            const sessionStartTime = session.startTime;
            return sessionStartTime >= startDate && sessionStartTime <= endDate;
        });
    }


    if(themeButtonsDash.light) themeButtonsDash.light.addEventListener('click', () => applyThemeDashboard('light'));
    if(themeButtonsDash.dark) themeButtonsDash.dark.addEventListener('click', () => applyThemeDashboard('dark'));
    if(themeButtonsDash.blueNeon) themeButtonsDash.blueNeon.addEventListener('click', () => applyThemeDashboard('blue-neon'));
    
    // Listen for theme changes from parent window (main.js)
    window.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'SET_THEME') {
            applyThemeDashboard(event.data.theme, true);
        }
    });

    // Initial Load & Theme Application
    let initialTheme = 'dark'; // Default
    // Check hash first (passed from main.js when opening modal)
    if (window.location.hash && window.location.hash.startsWith('#theme=')) {
        initialTheme = window.location.hash.substring(7);
    } else { 
        initialTheme = localStorage.getItem(THEME_STORAGE_KEY) || 'dark';
    }

    applyThemeDashboard(initialTheme);
    
    loadData();
    updateDashboard(allSessionsData);
});