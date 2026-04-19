// ═══════════════════════════════════════════════════════════════════════
//  DebriefAI · app.js
//  Audio/Video Interview Recording + Real-time Analysis Platform
//  DevClash 2026 · PS6
// ═══════════════════════════════════════════════════════════════════════

import { initializeApp }      from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
         signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, getDoc,
         query, where, orderBy, serverTimestamp, doc }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ──────────────────────────────────────────────────────────────────────
//  FIREBASE CONFIG
// ──────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDUWptWsnyTD8C0ODav7waoQVWA2Tb09uM",
  authDomain: "interview-527c9.firebaseapp.com",
  projectId: "interview-527c9",
  storageBucket: "interview-527c9.firebasestorage.app",
  messagingSenderId: "1076041774473",
  appId: "1:1076041774473:web:6c0f9a084c75c6b3ea1d58",
  measurementId: "G-2MYQLLMSFY"
};

// ──────────────────────────────────────────────────────────────────────
//  ⚠️  ANTHROPIC API KEY — Replace with your key for the hackathon demo
//  For production, proxy through Firebase Functions (see README).
// ──────────────────────────────────────────────────────────────────────
const ANTHROPIC_API_KEY = "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"; // 🔑 Replace this

const firebaseApp = initializeApp(firebaseConfig);
const auth        = getAuth(firebaseApp);
const db          = getFirestore(firebaseApp);

// ──────────────────────────────────────────────────────────────────────
//  GLOBAL STATE
// ──────────────────────────────────────────────────────────────────────
const state = {
  currentUser:    null,
  mediaStream:    null,
  mediaRecorder:  null,
  audioContext:   null,
  analyserNode:   null,
  recordedChunks: [],
  isRecording:    false,
  isPaused:       false,
  recStartTime:   null,
  recElapsed:     0,
  recTimerInterval: null,
  recognition:    null,

  transcript:       [],
  fillerDetected:   [],
  pauseDetected:    [],
  confidenceCurve:  [],
  wordCount:        0,
  lastWordTime:     null,
  pauseThresholdMs: 2000,

  currentReport:  null,
  uploadedBlob:   null,
  uploadedFile:   null,

  waveAnimId:     null,
  heroAnimId:     null,
  confAnimId:     null,
};

// ──────────────────────────────────────────────────────────────────────
//  DOM HELPERS
// ──────────────────────────────────────────────────────────────────────
const $  = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];

function showPage(name) {
  $$('.page').forEach(p => p.classList.remove('active'));
  $$('.nav-link').forEach(a => a.classList.remove('active'));
  const page = $(`#page-${name}`);
  if (page) page.classList.add('active');
  const link = $(`.nav-link[data-page="${name}"]`);
  if (link) link.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showToast(msg, duration = 3500) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), duration);
}

function escH(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function scoreColor(s) {
  if (s >= 75) return 'var(--green)';
  if (s >= 50) return 'var(--yellow)';
  if (s >= 30) return 'var(--orange)';
  return 'var(--red)';
}
function scoreLabel(s) {
  if (s >= 80) return 'Strong Candidate';
  if (s >= 65) return 'Decent — Needs Polish';
  if (s >= 45) return 'Significant Gaps';
  if (s >= 25) return 'Major Issues';
  return 'Critical Weaknesses';
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

// ──────────────────────────────────────────────────────────────────────
//  NAV
// ──────────────────────────────────────────────────────────────────────
$$('.nav-link').forEach(l => l.addEventListener('click', e => {
  e.preventDefault();
  const p = l.dataset.page;
  if (p === 'history') loadHistory();
  showPage(p);
}));

$('#btnGoRecord').addEventListener('click', () => showPage('record'));
$('#btnGoUpload').addEventListener('click', () => showPage('upload'));
$('#btnNewSession').addEventListener('click', () => showPage('record'));

// ──────────────────────────────────────────────────────────────────────
//  HERO WAVE ANIMATION
// ──────────────────────────────────────────────────────────────────────
(function animateHeroWave() {
  const canvas = $('#heroWaveCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let t = 0;

  function draw() {
    const W = canvas.parentElement.offsetWidth || 700;
    canvas.width = W; canvas.height = 80;
    ctx.clearRect(0, 0, W, 80);
    for (let wave = 0; wave < 3; wave++) {
      ctx.beginPath();
      const amp   = [12, 8, 5][wave];
      const freq  = [0.018, 0.025, 0.012][wave];
      const phase = [0, Math.PI/3, Math.PI/1.5][wave];
      const alpha = [0.25, 0.15, 0.08][wave];
      ctx.strokeStyle = `rgba(0,212,255,${alpha})`;
      ctx.lineWidth = 1.5;
      for (let x = 0; x < W; x++) {
        const y = 40 + amp * Math.sin(freq * x + t + phase);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    t += 0.02;
    state.heroAnimId = requestAnimationFrame(draw);
  }
  draw();
})();

// ──────────────────────────────────────────────────────────────────────
//  CAMERA & MIC INIT
// ──────────────────────────────────────────────────────────────────────
$('#btnInitCamera').addEventListener('click', initCamera);

async function initCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    state.mediaStream = stream;
    $('#videoPreview').srcObject = stream;
    $('#videoOverlay').classList.add('hidden');
    $('#confidenceHud').classList.remove('hidden');
    $('#btnStartRec').disabled = false;
    initAudioAnalyser(stream);
    startWaveformDraw();
    showToast('✓ Camera and microphone ready!');
  } catch (err) {
    showToast('⚠ Could not access camera/mic: ' + err.message);
    console.error(err);
  }
}

// ──────────────────────────────────────────────────────────────────────
//  AUDIO ANALYSER
// ──────────────────────────────────────────────────────────────────────
function initAudioAnalyser(stream) {
  state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const source = state.audioContext.createMediaStreamSource(stream);
  state.analyserNode = state.audioContext.createAnalyser();
  state.analyserNode.fftSize = 256;
  source.connect(state.analyserNode);
}

function startWaveformDraw() {
  const canvas = $('#waveformCanvas');
  const ctx    = canvas.getContext('2d');
  const label  = $('#waveformLabel');

  function draw() {
    const W = canvas.parentElement.offsetWidth || 400;
    canvas.width = W; canvas.height = 64;
    ctx.clearRect(0, 0, W, 64);

    if (!state.analyserNode) {
      state.waveAnimId = requestAnimationFrame(draw); return;
    }

    const bufLen = state.analyserNode.frequencyBinCount;
    const data   = new Uint8Array(bufLen);
    state.analyserNode.getByteTimeDomainData(data);

    let sumSq = 0;
    data.forEach(v => { const n = (v - 128) / 128; sumSq += n * n; });
    const rms = Math.sqrt(sumSq / bufLen);
    const vol = Math.min(100, Math.round(rms * 600));

    const hud = $('#hudBarFill');
    const hudV = $('#hudVal');
    if (hud) {
      hud.style.width = vol + '%';
      const c = vol > 40 ? 'var(--green)' : vol > 20 ? 'var(--orange)' : 'var(--red)';
      hud.style.background = c;
    }
    if (hudV) hudV.textContent = vol;

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = state.isRecording ? 'rgba(255,71,87,0.7)' : 'rgba(0,212,255,0.5)';
    ctx.beginPath();
    const sliceW = W / bufLen;
    let x = 0;
    for (let i = 0; i < bufLen; i++) {
      const v = data[i] / 128;
      const y = (v * 32);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      x += sliceW;
    }
    ctx.stroke();

    if (label) {
      label.textContent = state.isRecording
        ? `🔴 Recording · Volume: ${vol}%`
        : `Microphone active · Volume: ${vol}%`;
    }

    if (state.isRecording) {
      const elapsed = (Date.now() - state.recStartTime) / 1000;
      state.confidenceCurve.push({ time: elapsed, score: vol });
      drawConfidenceGraph();
    }

    state.waveAnimId = requestAnimationFrame(draw);
  }
  draw();
}

function drawConfidenceGraph() {
  const canvas = $('#confidenceCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W   = canvas.parentElement.offsetWidth || 360;
  canvas.width = W; canvas.height = 80;
  ctx.clearRect(0, 0, W, 80);

  const pts = state.confidenceCurve.slice(-60);
  if (pts.length < 2) return;

  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = (i / (pts.length - 1)) * W;
    const y = 80 - (p.score / 100) * 70;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.strokeStyle = 'rgba(0,212,255,0.6)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.lineTo(W, 80); ctx.lineTo(0, 80); ctx.closePath();
  ctx.fillStyle = 'rgba(0,212,255,0.08)';
  ctx.fill();
}

// ──────────────────────────────────────────────────────────────────────
//  SPEECH RECOGNITION
// ──────────────────────────────────────────────────────────────────────
const FILLER_WORDS = ['um','uh','like','you know','i mean','basically','literally',
  'actually','honestly','right','so','well','kind of','sort of','you see','okay so'];

function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    showToast('⚠ Speech recognition not supported. Use Chrome or Edge.');
    return null;
  }

  const rec = new SpeechRecognition();
  rec.continuous     = true;
  rec.interimResults = true;
  rec.lang           = 'en-US';

  let interimEl = null;

  rec.onstart = () => {
    const badge = $('#liveBadge');
    if (badge) { badge.textContent = 'LIVE'; badge.classList.add('live'); }
  };

  rec.onresult = event => {
    const box = $('#transcriptBox');
    if (!box) return;

    const placeholder = box.querySelector('.transcript-placeholder');
    if (placeholder) placeholder.remove();

    let finalText = '';
    let interimText = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (result.isFinal) {
        finalText += result[0].transcript;
      } else {
        interimText += result[0].transcript;
      }
    }

    if (finalText.trim()) {
      const ts = (Date.now() - state.recStartTime) / 1000;
      const words = finalText.trim().split(/\s+/);
      state.wordCount += words.length;
      state.transcript.push({ text: finalText.trim(), timestamp: ts, confidence: 0.8 });

      const lower = finalText.toLowerCase();
      FILLER_WORDS.forEach(fw => {
        const regex = new RegExp(`\\b${fw.replace(/\s/g,'\\s+')}\\b`, 'gi');
        let m;
        while ((m = regex.exec(finalText)) !== null) {
          state.fillerDetected.push({ word: fw, timestamp: ts });
        }
      });

      const now = Date.now();
      if (state.lastWordTime && (now - state.lastWordTime) > state.pauseThresholdMs) {
        const dur = (now - state.lastWordTime) / 1000;
        state.pauseDetected.push({ start: ts - dur, end: ts, duration: dur });
        addLiveIssue(`[${fmtTime(ts)}] ${dur.toFixed(1)}s pause detected`, 'med');
      }
      state.lastWordTime = now;

      const highlighted = highlightFillers(finalText.trim());
      if (interimEl) { interimEl.remove(); interimEl = null; }
      const span = document.createElement('span');
      span.innerHTML = highlighted + ' ';
      box.appendChild(span);
      box.scrollTop = box.scrollHeight;

      updateLiveStats();

      const fillerBurst = state.fillerDetected.filter(f => ts - f.timestamp < 10).length;
      if (fillerBurst >= 3) addLiveIssue(`[${fmtTime(ts)}] Filler word burst detected (3+ in 10s)`, 'high');
    }

    if (interimText) {
      if (!interimEl) {
        interimEl = document.createElement('span');
        interimEl.style.color = 'var(--text3)';
        interimEl.style.fontStyle = 'italic';
        box.appendChild(interimEl);
      }
      interimEl.textContent = interimText;
      box.scrollTop = box.scrollHeight;
    }
  };

  rec.onerror = err => {
    if (err.error !== 'no-speech') console.warn('Speech recognition error:', err.error);
  };

  rec.onend = () => {
    if (state.isRecording && !state.isPaused) {
      try { rec.start(); } catch(e) {}
    }
  };

  return rec;
}

function highlightFillers(text) {
  let result = escH(text);
  FILLER_WORDS.forEach(fw => {
    const re = new RegExp(`\\b(${fw.replace(/\s/g,'\\s+')})\\b`, 'gi');
    result = result.replace(re, `<span class="transcript-filler" title="Filler word">$1</span>`);
  });
  return result;
}

function addLiveIssue(msg, severity = 'med') {
  const box = $('#liveIssues');
  if (!box) return;
  const noIssues = box.querySelector('.no-issues');
  if (noIssues) noIssues.remove();

  const div = document.createElement('div');
  div.className = `live-issue-item li-${severity}`;
  div.innerHTML = `<span>${severity === 'high' ? '🔴' : '🟠'}</span><span>${msg}</span>`;
  box.prepend(div);
  while (box.children.length > 12) box.lastChild.remove();
}

function updateLiveStats() {
  const ts  = state.recStartTime ? (Date.now() - state.recStartTime) / 1000 : 1;
  const wpm = ts > 1 ? Math.round((state.wordCount / ts) * 60) : 0;
  $('#lsFillers').textContent = state.fillerDetected.length;
  $('#lsPauses').textContent  = state.pauseDetected.length;
  $('#lsWords').textContent   = state.wordCount;
  $('#lsWpm').textContent     = wpm;
}

// ──────────────────────────────────────────────────────────────────────
//  RECORDING CONTROLS
// ──────────────────────────────────────────────────────────────────────
$('#btnStartRec').addEventListener('click', startRecording);
$('#btnPauseRec').addEventListener('click', togglePause);
$('#btnStopRec').addEventListener('click', stopRecording);

function startRecording() {
  const role = $('#recRole').value.trim();
  if (!role) { showToast('⚠ Please enter the target role first.'); return; }
  if (!state.mediaStream) { showToast('⚠ Camera/mic not initialized.'); return; }

  state.recordedChunks  = [];
  state.transcript      = [];
  state.fillerDetected  = [];
  state.pauseDetected   = [];
  state.confidenceCurve = [];
  state.wordCount       = 0;
  state.lastWordTime    = null;
  state.recStartTime    = Date.now();
  state.isRecording     = true;
  state.isPaused        = false;

  const box = $('#transcriptBox');
  box.innerHTML = '';
  $('#liveIssues').innerHTML = '<p class="no-issues">Listening…</p>';
  $('#lsFillers').textContent = '0';
  $('#lsPauses').textContent  = '0';
  $('#lsWords').textContent   = '0';
  $('#lsWpm').textContent     = '—';

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : MediaRecorder.isTypeSupported('video/webm')
    ? 'video/webm'
    : '';
  
  const recOptions = mimeType ? { mimeType } : {};
  state.mediaRecorder = new MediaRecorder(state.mediaStream, recOptions);
  state.mediaRecorder.ondataavailable = e => {
    if (e.data && e.data.size > 0) state.recordedChunks.push(e.data);
  };
  state.mediaRecorder.start(500);

  state.recognition = initSpeechRecognition();
  if (state.recognition) {
    try { state.recognition.start(); } catch(e) { console.warn('Speech rec start error:', e); }
  }

  state.recTimerInterval = setInterval(() => {
    if (!state.isPaused) {
      state.recElapsed = (Date.now() - state.recStartTime) / 1000;
      $('#recTimer').textContent = fmtTime(state.recElapsed);
    }
  }, 500);

  $('#recIndicator').classList.remove('hidden');
  $('#btnStartRec').classList.add('hidden');
  $('#btnPauseRec').classList.remove('hidden');
  $('#btnStopRec').classList.remove('hidden');
  $('#preRecordForm').style.opacity = '0.4';
  $('#preRecordForm').style.pointerEvents = 'none';
}

function togglePause() {
  if (!state.mediaRecorder) return;
  state.isPaused = !state.isPaused;
  if (state.isPaused) {
    state.mediaRecorder.pause();
    if (state.recognition) { try { state.recognition.stop(); } catch(e) {} }
    $('#btnPauseRec').innerHTML = '<span class="ctrl-icon">▶</span> Resume';
    showToast('Recording paused');
  } else {
    state.mediaRecorder.resume();
    if (state.recognition) { try { state.recognition.start(); } catch(e) {} }
    $('#btnPauseRec').innerHTML = '<span class="ctrl-icon">⏸</span> Pause';
    showToast('Recording resumed');
  }
}

async function stopRecording() {
  if (!state.mediaRecorder) return;
  state.isRecording = false;
  clearInterval(state.recTimerInterval);

  if (state.recognition) {
    try { state.recognition.stop(); } catch(e) {}
    state.recognition = null;
  }

  // Stop the recorder and wait for it to finalize
  await new Promise(resolve => {
    state.mediaRecorder.onstop = resolve;
    state.mediaRecorder.stop();
  });

  await new Promise(r => setTimeout(r, 400));

  const blobType = state.mediaRecorder.mimeType || 'video/webm';
  const blob = new Blob(state.recordedChunks, { type: blobType });
  state.uploadedBlob = blob;

  $('#recIndicator').classList.add('hidden');
  $('#btnStartRec').classList.remove('hidden');
  $('#btnPauseRec').classList.add('hidden');
  $('#btnStopRec').classList.add('hidden');
  $('#preRecordForm').style.opacity = '1';
  $('#preRecordForm').style.pointerEvents = '';
  $('#liveBadge').textContent = 'OFFLINE';
  $('#liveBadge').classList.remove('live');

  const duration = state.recElapsed;
  const role     = $('#recRole').value.trim();
  const itype    = $('#recType').value;

  showToast(`✓ Recording complete (${fmtTime(duration)}). Analyzing…`);
  await runAnalysis({ role, itype, blob, fromRecording: true });
}

// ──────────────────────────────────────────────────────────────────────
//  UPLOAD PAGE
// ──────────────────────────────────────────────────────────────────────
const dropzone = $('#dropzone');
const fileInput = $('#fileInput');

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.classList.add('drag-over'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
dropzone.addEventListener('drop', e => {
  e.preventDefault(); dropzone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFileSelect(file);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFileSelect(fileInput.files[0]);
});
$('#btnPickFile').addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
$('#btnClearFile').addEventListener('click', () => {
  state.uploadedFile = null;
  state.uploadedBlob = null;
  $('#uploadPreview').classList.add('hidden');
  $('#dropzone').classList.remove('hidden');
  $('#btnAnalyzeUpload').disabled = true;
  fileInput.value = '';
});

function handleFileSelect(file) {
  const isVideo = file.type.startsWith('video/');
  const isAudio = file.type.startsWith('audio/');
  if (!isVideo && !isAudio) {
    showToast('⚠ Please select a video or audio file.'); return;
  }

  state.uploadedFile = file;
  state.uploadedBlob = file;

  const preview = $('#uploadPreview');
  const media   = $('#previewMedia');
  const info    = $('#previewInfo');

  const url = URL.createObjectURL(file);
  media.innerHTML = isVideo
    ? `<video src="${url}" controls></video>`
    : `<audio src="${url}" controls></audio>`;
  info.innerHTML  = `📁 ${escH(file.name)} &nbsp;·&nbsp; ${(file.size / 1024 / 1024).toFixed(1)} MB &nbsp;·&nbsp; ${file.type}`;

  preview.classList.remove('hidden');
  $('#dropzone').classList.add('hidden');
  $('#btnAnalyzeUpload').disabled = false;
}

$('#btnAnalyzeUpload').addEventListener('click', async () => {
  const role    = $('#uploadRole').value.trim();
  const itype   = $('#uploadType').value;
  const context = $('#uploadContext').value.trim();
  if (!role)               { showToast('⚠ Please enter the target role.'); return; }
  if (!state.uploadedBlob) { showToast('⚠ No file selected.'); return; }

  $('#uploadLabel').classList.add('hidden');
  $('#uploadSpinner').classList.remove('hidden');
  $('#btnAnalyzeUpload').disabled = true;

  try {
    await runAnalysis({ role, itype, blob: state.uploadedBlob, context, fromRecording: false });
  } finally {
    $('#uploadLabel').classList.remove('hidden');
    $('#uploadSpinner').classList.add('hidden');
    $('#btnAnalyzeUpload').disabled = false;
  }
});

// ──────────────────────────────────────────────────────────────────────
//  AUDIO ANALYSIS (extract voice stats from blob)
// ──────────────────────────────────────────────────────────────────────
async function analyzeAudioBlob(blob) {
  try {
    const arrayBuffer = await blob.arrayBuffer();
    
    // Determine duration heuristic (max 5 min for OfflineAudioContext)
    const estimatedDuration = Math.min(blob.size / 16000, 300); // rough estimate
    const sampleRate = 44100;
    const numFrames  = Math.floor(sampleRate * Math.min(estimatedDuration, 300));
    
    const offlineCtx  = new OfflineAudioContext(1, Math.max(numFrames, sampleRate), sampleRate);
    let audioBuffer;
    
    try {
      audioBuffer = await offlineCtx.decodeAudioData(arrayBuffer);
    } catch (decodeErr) {
      console.warn('Audio decode error:', decodeErr);
      return null;
    }

    const duration   = audioBuffer.duration;
    const data       = audioBuffer.getChannelData(0);
    const sr         = audioBuffer.sampleRate;

    const windowSize  = Math.floor(sr * 0.5);
    const volumeCurve = [];
    const silenceSegs = [];
    let   silStart    = null;

    for (let i = 0; i < data.length; i += windowSize) {
      const chunk = data.slice(i, i + windowSize);
      let sumSq   = 0;
      chunk.forEach(v => sumSq += v * v);
      const rms     = Math.sqrt(sumSq / chunk.length);
      const vol     = Math.min(100, Math.round(rms * 600));
      const timeSec = i / sr;

      volumeCurve.push({ time: timeSec, score: vol });

      if (vol < 5) {
        if (!silStart) silStart = timeSec;
      } else {
        if (silStart && (timeSec - silStart) > 1.5) {
          silenceSegs.push({ start: silStart, end: timeSec, duration: timeSec - silStart });
        }
        silStart = null;
      }
    }

    const avgVol     = volumeCurve.reduce((a, b) => a + b.score, 0) / (volumeCurve.length || 1);
    const peakVol    = Math.max(...volumeCurve.map(p => p.score));
    const volVariance = volumeCurve.reduce((a, b) => a + Math.pow(b.score - avgVol, 2), 0) / (volumeCurve.length || 1);

    return {
      duration,
      volumeCurve,
      silenceSegments:  silenceSegs,
      avgVolume:        Math.round(avgVol),
      peakVolume:       Math.round(peakVol),
      volumeVariance:   Math.round(Math.sqrt(volVariance)),
      silenceCount:     silenceSegs.length,
    };
  } catch (err) {
    console.error('Audio analysis error:', err);
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────
//  TRANSCRIBE UPLOADED AUDIO via Web Speech API
// ──────────────────────────────────────────────────────────────────────
async function transcribeUploadedAudio(blob) {
  return new Promise(resolve => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      resolve({ text: '[Speech recognition not available — use Chrome for auto-transcription]', segments: [] });
      return;
    }

    const url   = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.volume = 1; // needs to be audible for Web Speech API to pick up

    const rec  = new SpeechRecognition();
    rec.continuous     = true;
    rec.interimResults = false;
    rec.lang           = 'en-US';
    rec.maxAlternatives = 1;

    const segs   = [];
    let   started = false;
    const t0      = Date.now();
    let   done    = false;

    const finish = () => {
      if (done) return;
      done = true;
      try { rec.stop(); } catch(e) {}
      audio.pause();
      setTimeout(() => {
        URL.revokeObjectURL(url);
        const text = segs.map(s => s.text).join(' ');
        resolve({ text: text || '[No speech detected in recording]', segments: segs });
      }, 800);
    };

    rec.onresult = event => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          segs.push({
            text: event.results[i][0].transcript,
            timestamp: (Date.now() - t0) / 1000,
            confidence: event.results[i][0].confidence || 0.8,
          });
        }
      }
    };

    rec.onerror = err => {
      if (err.error !== 'no-speech') console.warn('Transcription error:', err.error);
    };

    rec.onend = () => {
      if (!done && started && audio && !audio.ended && audio.currentTime < audio.duration - 1) {
        // Recording still playing — restart recognition
        try { rec.start(); } catch(e) { finish(); }
      } else if (!done) {
        finish();
      }
    };

    audio.onended = finish;
    audio.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ text: '[Could not play audio file for transcription]', segments: [] });
    };

    audio.play()
      .then(() => {
        started = true;
        try { rec.start(); } catch(e) {
          console.warn('Could not start recognition:', e);
          finish();
        }
      })
      .catch(err => {
        console.warn('Autoplay blocked:', err);
        URL.revokeObjectURL(url);
        resolve({
          text: '[Autoplay blocked by browser — please use the live recording mode or allow autoplay in browser settings]',
          segments: []
        });
      });

    // Safety timeout — 20 minutes max
    setTimeout(finish, 1200000);
  });
}

// ──────────────────────────────────────────────────────────────────────
//  MAIN ANALYSIS PIPELINE
// ──────────────────────────────────────────────────────────────────────
async function runAnalysis({ role, itype, blob, context = '', fromRecording = false }) {
  showPage('processing');

  // Reset all step states
  ['pstep1','pstep2','pstep3','pstep4'].forEach(id => {
    const el = $(`#${id}`);
    if (el) { el.classList.remove('active-step','done'); }
  });

  const steps = ['pstep1','pstep2','pstep3','pstep4'];
  let step = 0;

  function nextStep(msg) {
    if (step > 0) {
      const prev = $(`#${steps[step-1]}`);
      if (prev) { prev.classList.remove('active-step'); prev.classList.add('done'); }
    }
    if (step < steps.length) {
      const cur = $(`#${steps[step]}`);
      if (cur) cur.classList.add('active-step');
    }
    if (msg) { $('#procSub').textContent = msg; }
    step++;
  }

  try {
    // ── Step 1: Transcribe ──
    nextStep('Transcribing audio…');
    let transcriptText, transcriptSegments;
    let audioStats = null;

    if (fromRecording && state.transcript.length > 0) {
      transcriptText     = state.transcript.map(s => s.text).join(' ');
      transcriptSegments = state.transcript;
      audioStats = {
        duration:        state.recElapsed,
        volumeCurve:     state.confidenceCurve,
        silenceSegments: state.pauseDetected,
        avgVolume:       Math.round(state.confidenceCurve.reduce((a,b) => a+b.score, 0) / (state.confidenceCurve.length || 1)),
        silenceCount:    state.pauseDetected.length,
      };
    } else {
      // For uploaded files: run audio analysis and transcription in parallel
      await new Promise(r => setTimeout(r, 400));
      const [transcResult, audioResult] = await Promise.all([
        transcribeUploadedAudio(blob),
        analyzeAudioBlob(blob)
      ]);
      transcriptText     = transcResult.text;
      transcriptSegments = transcResult.segments;
      audioStats         = audioResult;
    }

    // ── Step 2: Voice Patterns ──
    nextStep('Analyzing voice patterns and confidence…');
    await new Promise(r => setTimeout(r, 600));

    const fillerStats   = computeFillerStats(transcriptText, fromRecording ? state.fillerDetected : []);
    const speechMetrics = computeSpeechMetrics(transcriptText, audioStats, fromRecording);

    // ── Step 3: Score Structure ──
    nextStep('Scoring answer structure…');
    await new Promise(r => setTimeout(r, 400));

    // ── Step 4: Claude AI Analysis ──
    nextStep('Generating your debrief report with Claude AI…');
    const aiAnalysis = await callClaudeAI({
      role, itype, context,
      transcript: transcriptText,
      segments:   transcriptSegments,
      fillerStats,
      speechMetrics,
      audioStats,
      fillerTimestamps: fromRecording ? state.fillerDetected : [],
      pauseTimestamps:  fromRecording ? state.pauseDetected  : [],
    });

    // Mark all done
    steps.forEach(s => {
      const el = $(`#${s}`);
      if (el) { el.classList.remove('active-step'); el.classList.add('done'); }
    });
    await new Promise(r => setTimeout(r, 500));

    state.currentReport = {
      role, itype,
      transcript: transcriptText,
      segments:   transcriptSegments,
      audioStats,
      fillerStats,
      speechMetrics,
      analysis:   aiAnalysis,
      blob,
      createdAt:  new Date(),
    };

    if (state.currentUser) {
      try { await saveReport(state.currentReport); } catch(e) { console.warn('Save failed:', e); }
    }

    renderResults(state.currentReport);
    showPage('results');

  } catch (err) {
    console.error('Analysis failed:', err);
    showToast('❌ Analysis error: ' + err.message);
    showPage(fromRecording ? 'record' : 'upload');
  }
}

// ──────────────────────────────────────────────────────────────────────
//  HELPERS: filler stats, speech metrics
// ──────────────────────────────────────────────────────────────────────
function computeFillerStats(text, fillerTimestamps) {
  const result = {};
  FILLER_WORDS.forEach(fw => {
    const regex = new RegExp(`\\b${fw.replace(/\s/g,'\\s+')}\\b`, 'gi');
    const count = (text.match(regex) || []).length;
    if (count > 0) {
      const severity = count >= 5 ? 'high' : count >= 2 ? 'medium' : 'low';
      result[fw] = { count, severity };
    }
  });
  return result;
}

function computeSpeechMetrics(text, audioStats, fromRecording) {
  const words    = (text || '').split(/\s+/).filter(Boolean);
  const wc       = words.length;
  const duration = audioStats?.duration || (fromRecording ? state.recElapsed : 60) || 60;
  const wpm      = duration > 0 ? Math.round((wc / duration) * 60) : 0;

  const uniqueWords   = new Set(words.map(w => w.toLowerCase().replace(/[^a-z]/g,''))).size;
  const vocabRichness = wc > 0 ? Math.round((uniqueWords / wc) * 100) : 0;

  const sentences    = (text || '').split(/[.!?]+/).filter(Boolean);
  const avgSentLen   = sentences.length > 0 ? wc / sentences.length : 0;
  const complexity   = avgSentLen > 20 ? 'complex' : avgSentLen > 12 ? 'moderate' : 'simple';

  return {
    wordCount:          wc,
    wpm,
    uniqueWords,
    vocabRichness,
    sentenceComplexity: complexity,
    avgPace: wpm < 100 ? 'too slow' : wpm > 180 ? 'too fast' : 'appropriate',
    silenceCount: audioStats?.silenceCount ?? state.pauseDetected.length,
    avgVolume:    audioStats?.avgVolume ?? 50,
  };
}

// ──────────────────────────────────────────────────────────────────────
//  CLAUDE AI ANALYSIS  ← FIXED: proper headers added
// ──────────────────────────────────────────────────────────────────────
async function callClaudeAI({ role, itype, context, transcript, segments,
  fillerStats, speechMetrics, audioStats, fillerTimestamps, pauseTimestamps }) {

  // Validate API key
  if (!ANTHROPIC_API_KEY || ANTHROPIC_API_KEY === 'YOUR_ANTHROPIC_API_KEY_HERE') {
    throw new Error(
      'Anthropic API key not configured. Open app.js and replace "YOUR_ANTHROPIC_API_KEY_HERE" with your actual API key from console.anthropic.com'
    );
  }

  const fillerSummary = Object.entries(fillerStats)
    .map(([w,v]) => `"${w}" × ${v.count} (${v.severity})`)
    .join(', ') || 'none detected';

  const pauseSummary = pauseTimestamps.slice(0,5)
    .map(p => `${fmtTime(p.start || 0)}-${fmtTime(p.end || 0)} (${(p.duration||0).toFixed(1)}s)`)
    .join(', ') || 'no significant pauses';

  const prompt = `You are a brutal, honest expert interview coach analyzing a real interview recording. Audio has been transcribed and voice analyzed.

TARGET ROLE: ${role}
INTERVIEW TYPE: ${itype}
${context ? `ADDITIONAL CONTEXT: ${context}` : ''}

TRANSCRIPT (from audio recording):
${transcript || '[No transcript available — analyze based on audio metrics only]'}

VOICE & AUDIO METRICS:
- Words per minute: ${speechMetrics.wpm} (${speechMetrics.avgPace})
- Total words: ${speechMetrics.wordCount}
- Vocabulary richness: ${speechMetrics.vocabRichness}%
- Sentence complexity: ${speechMetrics.sentenceComplexity}
- Filler words detected: ${fillerSummary}
- Long pauses (>2s): ${pauseTimestamps.length} detected at: ${pauseSummary}
- Average voice volume: ${speechMetrics.avgVolume}%
- Silence/pause segments: ${speechMetrics.silenceCount}
- Recording duration: ${audioStats?.duration ? fmtTime(audioStats.duration) : 'unknown'}

Return ONLY a valid JSON object with this exact structure (no markdown, no preamble, no extra text):

{
  "overallScore": <0-100>,
  "verdict": "<one brutal, specific sentence: why this candidate likely did not get the offer>",
  "scoreBreakdown": {
    "answerStructure": <0-100>,
    "voiceConfidence": <0-100>,
    "relevance": <0-100>,
    "specificity": <0-100>,
    "communication": <0-100>,
    "roleFit": <0-100>
  },
  "questions": [
    {
      "question": "<question asked or inferred from transcript>",
      "timestamp": "<MM:SS if detectable>",
      "answer": "<candidate answer snippet, max 200 chars>",
      "score": <0-100>,
      "issues": [
        {"severity": "high|medium|low", "description": "<specific issue referencing what was actually said>"}
      ],
      "suggestion": "<specific, actionable rewrite hint>",
      "metrics": {"clarity": <0-10>, "depth": <0-10>, "relevance": <0-10>, "starAdherence": <0-10>}
    }
  ],
  "voiceAnalysis": {
    "fillerWordAssessment": "<paragraph assessing filler word usage impact>",
    "paceAssessment": "<assessment of speaking pace and its effect>",
    "confidenceAssessment": "<assessment of voice confidence trends>",
    "fillerWordRanking": [
      {"word": "<word>", "count": <int>, "impact": "high|medium|low", "improvement": "<tip>"}
    ],
    "speechMetrics": [
      {"label": "<metric name>", "value": "<value string>", "rating": "good|okay|poor"}
    ],
    "confidenceCurve": [
      {"label": "<Q1/Opening/etc>", "score": <0-100>}
    ],
    "keyVoiceMoments": [
      {"timestamp": "<MM:SS>", "type": "low_confidence|filler_burst|strong_answer|long_pause", "description": "<what happened>"}
    ]
  },
  "weaknesses": [
    {
      "rank": <1-based>,
      "title": "<weakness>",
      "description": "<why it hurt, citing actual words used>",
      "impactScore": <0-100>,
      "category": "communication|technical|behavioral|structural|confidence|voice"
    }
  ],
  "improvementPlan": [
    {
      "week": <1-based>,
      "theme": "<theme>",
      "tasks": [
        {"action": "<task>", "detail": "<how>", "effort": "low|medium|high", "category": "practice|research|mindset|skill"}
      ]
    }
  ]
}

Be brutally specific. Reference actual words and phrases from the transcript. Do not give generic advice. Every weakness and suggestion must be grounded in what was actually said or how it was said.`;

  // ── THE FIX: Add required Anthropic API headers ──
const OPENROUTER_API_KEY = "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"; // 🔑 replace this

const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
    "HTTP-Referer": "http://localhost:3000", // or your deployed URL
    "X-Title": "DebriefAI"
  },
  body: JSON.stringify({
    model: "anthropic/claude-3-haiku", // fast + cheap (good for hackathon)
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: "You are a strict JSON generator. Always return only valid JSON."
      },
      {
        role: "user",
        content: prompt
      }
    ]
  })
});

  if (!response.ok) {
    let errMsg = `API error ${response.status}`;
    try {
      const errBody = await response.json();
      errMsg = errBody.error?.message || errMsg;
      if (response.status === 401) errMsg = 'Invalid API key. Check your ANTHROPIC_API_KEY in app.js.';
      if (response.status === 403) errMsg = 'Forbidden. Your API key may not have permission for direct browser access.';
      if (response.status === 429) errMsg = 'Rate limited. Please wait a moment and try again.';
    } catch(e) {}
    throw new Error(errMsg);
  }

const data = await response.json();
const text = data.choices?.[0]?.message?.content || "";
  
  // Robustly extract JSON — strip markdown fences if present
  const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/,'').trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not parse AI response. Raw response: ' + text.slice(0, 200));
  
  try {
    return JSON.parse(jsonMatch[0]);
  } catch (parseErr) {
    throw new Error('JSON parse error from AI response: ' + parseErr.message);
  }
}

// ──────────────────────────────────────────────────────────────────────
//  RENDER RESULTS
// ──────────────────────────────────────────────────────────────────────
function renderResults(report) {
  const { role, analysis, transcript, segments, audioStats, speechMetrics } = report;

  $('#resultsSubtitle').textContent = `${role} · Score: ${analysis.overallScore}/100 · ${
    audioStats?.duration ? fmtTime(audioStats.duration) : '—'}`;

  renderScoreBanner(analysis);
  renderTimeline(audioStats, analysis);
  renderAnnotatedTranscript(transcript, report);
  renderBreakdown(analysis);
  renderVoiceAnalysis(analysis, speechMetrics, report);
  renderWeaknesses(analysis);
  renderPlan(analysis);

  // Re-attach tab listeners
  $$('.tab').forEach(t => {
    const newT = t.cloneNode(true);
    t.parentNode.replaceChild(newT, t);
  });
  $$('.tab').forEach(t => t.addEventListener('click', () => {
    $$('.tab').forEach(x => x.classList.remove('active'));
    $$('.tab-content').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    $(`#tab-${t.dataset.tab}`).classList.add('active');
  }));

  // Playback
  const pb = $('#btnPlayback');
  const newPb = pb.cloneNode(true);
  pb.parentNode.replaceChild(newPb, pb);
  newPb.addEventListener('click', () => {
    const modal = $('#playbackModal');
    const media = $('#pmMedia');
    if (report.blob) {
      const url = URL.createObjectURL(report.blob);
      const isVideo = report.blob.type?.startsWith('video/');
      media.innerHTML = isVideo
        ? `<video src="${url}" controls autoplay style="width:100%;border-radius:6px"></video>`
        : `<audio src="${url}" controls autoplay style="width:100%;margin-top:20px"></audio>`;
    } else {
      media.innerHTML = '<p style="color:var(--text2);padding:20px;text-align:center">No recording available to play back.</p>';
    }
    modal.classList.remove('hidden');
  });

  const pmClose = $('#pmClose');
  const newPmClose = pmClose.cloneNode(true);
  pmClose.parentNode.replaceChild(newPmClose, pmClose);
  newPmClose.addEventListener('click', () => {
    $('#playbackModal').classList.add('hidden');
    $('#pmMedia').innerHTML = '';
  });
}

function renderScoreBanner(analysis) {
  const score = analysis.overallScore;
  const color = scoreColor(score);
  const circ  = 2 * Math.PI * 38;
  const sb    = analysis.scoreBreakdown || {};

  const metrics = [
    { label: 'Answer Structure', key: 'answerStructure' },
    { label: 'Voice Confidence', key: 'voiceConfidence' },
    { label: 'Relevance',        key: 'relevance' },
    { label: 'Specificity',      key: 'specificity' },
    { label: 'Communication',    key: 'communication' },
    { label: 'Role Fit',         key: 'roleFit' },
  ];

  $('#scoreBanner').innerHTML = `
    <div class="sb-main">
      <div class="sb-ring">
        <svg viewBox="0 0 80 80" width="90" height="90">
          <circle class="sb-track" cx="40" cy="40" r="38"/>
          <circle class="sb-fill" cx="40" cy="40" r="38"
            stroke="${color}"
            stroke-dasharray="${circ}"
            stroke-dashoffset="${circ}"
            id="sbFill"/>
        </svg>
        <div class="sb-num">
          <span class="sb-num-big" style="color:${color}">${score}</span>
          <span class="sb-num-sub">/100</span>
        </div>
      </div>
      <div class="sb-info">
        <div class="sb-verdict">${escH(scoreLabel(score))}</div>
        <div class="sb-sub">${escH(analysis.verdict || '')}</div>
      </div>
    </div>
    <div class="sb-metrics">
      ${metrics.map(m => {
        const v = sb[m.key] ?? 50;
        return `<div class="sb-metric">
          <div class="sb-metric-label">${m.label}</div>
          <div class="sb-metric-val" style="color:${scoreColor(v)}">${v}</div>
        </div>`;
      }).join('')}
    </div>`;

  requestAnimationFrame(() => requestAnimationFrame(() => {
    const el = $('#sbFill');
    if (el) el.style.strokeDashoffset = circ * (1 - score / 100);
  }));
}

function renderTimeline(audioStats, analysis) {
  const canvas = $('#timelineCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W   = canvas.parentElement.offsetWidth || 600;
  canvas.width = W; canvas.height = 80;

  const curve = audioStats?.volumeCurve?.length > 1
    ? audioStats.volumeCurve
    : (analysis.voiceAnalysis?.confidenceCurve || []).map((p,i,a) => ({
        time: i * (60/(a.length||1)), score: p.score
      }));

  if (curve.length < 2) {
    ctx.fillStyle = 'rgba(0,212,255,0.05)';
    ctx.fillRect(0, 0, W, 80);
    ctx.fillStyle = 'var(--text3)';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Timeline data not available', W/2, 44);
    return;
  }

  const barW = Math.max(1, W / curve.length);
  curve.forEach((pt, i) => {
    const x   = i * barW;
    const pct = (pt.score || 0) / 100;
    const h   = pct * 70;
    const r   = pct > 0.6 ? [0,150,100] : pct > 0.3 ? [180,140,0] : [200,50,50];
    ctx.fillStyle = `rgba(${r[0]},${r[1]},${r[2]},0.5)`;
    ctx.fillRect(x, 80 - h, barW - 1, h);
  });

  const events = $('#timelineEvents');
  if (events && analysis.voiceAnalysis?.keyVoiceMoments) {
    events.innerHTML = '';
    const totalDur = audioStats?.duration || 300;
    analysis.voiceAnalysis.keyVoiceMoments.slice(0, 15).forEach(ev => {
      const secs = parseTimestamp(ev.timestamp);
      const x    = (secs / totalDur) * 100;
      const col  = ev.type === 'low_confidence' ? 'var(--red)'
        : ev.type === 'filler_burst' ? 'var(--orange)'
        : ev.type === 'long_pause'   ? 'var(--yellow)'
        : 'var(--green)';
      const div = document.createElement('div');
      div.className = 't-event';
      div.style.cssText = `left:${x}%;background:${col}`;
      div.title = `[${ev.timestamp}] ${ev.description}`;
      events.appendChild(div);
    });
  }
}

function parseTimestamp(ts) {
  if (!ts) return 0;
  const m = ts.match(/(\d+):(\d+)/);
  return m ? parseInt(m[1]) * 60 + parseInt(m[2]) : 0;
}

function renderAnnotatedTranscript(transcript, report) {
  const box = $('#annotatedTranscript');
  if (!box) return;
  if (!transcript || transcript.length < 20) {
    box.innerHTML = '<span style="color:var(--text3);font-size:12px">No transcript available. Use live recording mode in Chrome for real-time transcription.</span>';
    return;
  }

  let html = escH(transcript);
  html = html.replace(/\b(um|uh|like|you know|i mean|basically|literally|actually|honestly|right|so|well)\b/gi,
    '<span class="at-filler" title="Filler word">$1</span>');
  html = html.replace(/(\.\.\.|…)/g, '<span class="at-pause" title="Pause/hesitation">[pause]</span>');
  html = html.replace(/\b(I think|I guess|kind of|sort of|maybe|possibly|I&#39;m not sure)\b/gi,
    '<span class="at-low-conf" title="Uncertainty language">$1</span>');
  html = html.replace(/\b(\d+%|\$\d+[kKmMbB]?|\d+ (?:users|customers|teams|projects|million|thousand))\b/g,
    '<span class="at-highlight" title="Strong specific data">$1</span>');

  box.innerHTML = `<span class="at-speaker">Candidate</span><span class="at-text"> ${html}</span>`;
}

function renderBreakdown(analysis) {
  const qs = analysis.questions || [];
  if (!qs.length) {
    $('#breakdownContent').innerHTML = '<p style="color:var(--text2);padding:16px">No questions detected in transcript.</p>';
    return;
  }
  $('#breakdownContent').innerHTML = qs.map((q, i) => {
    const sc    = q.score ?? 50;
    const color = scoreColor(sc);
    const issues = (q.issues||[]).map(is => {
      const cls = is.severity === 'high' ? 'hi' : is.severity === 'medium' ? 'md' : 'lo';
      const ico = is.severity === 'high' ? '🔴' : is.severity === 'medium' ? '🟠' : '🟡';
      return `<div class="q-issue ${cls}"><span>${ico}</span><span>${escH(is.description)}</span></div>`;
    }).join('');
    const mets = q.metrics || {};
    const metsHtml = Object.entries(mets).map(([k,v]) =>
      `<div class="q-met"><div class="q-met-l">${k.replace(/([A-Z])/g,' $1').trim()}</div>
       <div class="q-met-v" style="color:${scoreColor(v*10)}">${v}/10</div></div>`
    ).join('');
    return `
      <div class="q-card" id="qc${i}">
        <div class="q-card-head" onclick="toggleQ(${i})">
          <span class="q-n">Q${i+1}</span>
          <span class="q-q">${escH(q.question||`Question ${i+1}`)}</span>
          <span class="q-badge" style="color:${color};border-color:${color}22;background:${color}11">${sc}/100</span>
          <span class="q-chev">›</span>
        </div>
        <div class="q-card-body">
          ${q.timestamp ? `<div class="q-ts">⏱ ${q.timestamp}</div>` : ''}
          ${q.answer ? `<div class="q-ans">${escH(q.answer.slice(0,200))}${q.answer.length>200?'…':''}</div>` : ''}
          ${metsHtml ? `<div class="q-mets">${metsHtml}</div>` : ''}
          <div>${issues}</div>
          ${q.suggestion ? `<div class="q-sug"><strong>💡 Improve: </strong>${escH(q.suggestion)}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

window.toggleQ = i => {
  const card = $(`#qc${i}`);
  if (card) card.classList.toggle('open');
};

function renderVoiceAnalysis(analysis, speechMetrics, report) {
  const va = analysis.voiceAnalysis || {};
  const sm = speechMetrics || {};

  const fillerRank = (va.fillerWordRanking || []).map(f => {
    const col = f.impact === 'high' ? 'var(--red)' : f.impact === 'medium' ? 'var(--orange)' : 'var(--yellow)';
    return `<div style="display:flex;align-items:flex-start;gap:10px;padding:8px 10px;
      background:var(--bg2);border:1px solid var(--border);border-radius:4px;margin-bottom:6px;font-size:12px">
      <span style="font-family:var(--font-mono);color:${col};min-width:60px">"${escH(f.word)}"×${f.count}</span>
      <span style="color:var(--text2)">${escH(f.improvement||'')}</span>
    </div>`;
  }).join('');

  const totalFillers = Object.values(report.fillerStats||{}).reduce((a,b)=>a+b.count,0);
  const speechMetricRows = (va.speechMetrics || [
    { label: 'Words per minute',    value: sm.wpm + ' wpm',          rating: sm.wpm > 180 ? 'poor' : sm.wpm < 100 ? 'poor' : 'good' },
    { label: 'Vocabulary richness', value: sm.vocabRichness + '%',   rating: sm.vocabRichness > 60 ? 'good' : 'okay' },
    { label: 'Sentence complexity', value: sm.sentenceComplexity||'—', rating: 'okay' },
    { label: 'Filler word count',   value: String(totalFillers),      rating: totalFillers > 10 ? 'poor' : 'okay' },
    { label: 'Long pauses (>2s)',   value: sm.silenceCount + ' pauses', rating: sm.silenceCount > 5 ? 'poor' : 'good' },
  ]).map(m => {
    const col = m.rating === 'good' ? 'var(--green)' : m.rating === 'okay' ? 'var(--yellow)' : 'var(--red)';
    return `<div class="v-meter">
      <div class="v-meter-row">
        <span>${escH(m.label)}</span>
        <span style="color:${col}">${escH(String(m.value))}</span>
      </div>
    </div>`;
  }).join('');

  $('#voiceContent').innerHTML = `
    <div class="voice-grid">
      <div class="voice-card">
        <h4>Filler Word Impact</h4>
        ${fillerRank || '<p style="color:var(--text3);font-size:12px">No filler words detected — great!</p>'}
        ${va.fillerWordAssessment ? `<p style="font-size:12px;color:var(--text2);margin-top:10px;line-height:1.6">${escH(va.fillerWordAssessment)}</p>` : ''}
      </div>
      <div class="voice-card">
        <h4>Speech Quality Metrics</h4>
        ${speechMetricRows}
      </div>
      <div class="voice-card">
        <h4>Pace & Delivery</h4>
        <p style="font-size:12px;color:var(--text2);line-height:1.65;margin-bottom:10px">${escH(va.paceAssessment || 'No pace assessment available.')}</p>
        <p style="font-size:12px;color:var(--text2);line-height:1.65">${escH(va.confidenceAssessment || '')}</p>
      </div>
      <div class="voice-card">
        <h4>Key Moments</h4>
        ${(va.keyVoiceMoments||[]).slice(0,6).map(m => {
          const col = m.type==='low_confidence'?'var(--red)':m.type==='filler_burst'?'var(--orange)':m.type==='long_pause'?'var(--yellow)':'var(--green)';
          return `<div style="display:flex;gap:10px;padding:7px 10px;background:var(--bg2);border:1px solid var(--border);
            border-radius:4px;margin-bottom:5px;font-size:11px">
            <span style="font-family:var(--font-mono);color:${col};flex-shrink:0">${escH(m.timestamp||'?')}</span>
            <span style="color:var(--text2)">${escH(m.description||'')}</span>
          </div>`;
        }).join('') || '<p style="color:var(--text3);font-size:12px">No key moments detected.</p>'}
      </div>
    </div>`;
}

function renderWeaknesses(analysis) {
  const ws = (analysis.weaknesses||[]).sort((a,b) => (a.rank||99)-(b.rank||99));
  if (!ws.length) { $('#weaknessContent').innerHTML = '<p style="color:var(--text2)">No weaknesses identified.</p>'; return; }
  $('#weaknessContent').innerHTML = `<div class="weakness-list">` +
    ws.map(w => {
      const rc  = w.rank <= 3 ? `r${w.rank}` : '';
      const col = w.impactScore>=80?'var(--red)':w.impactScore>=60?'var(--orange)':'var(--yellow)';
      const catTag = `<span class="plan-tag" style="color:var(--text3);border-color:var(--border2)">${w.category||''}</span>`;
      return `<div class="w-item">
        <div class="w-rank ${rc}">#${w.rank}</div>
        <div class="w-body">
          <div class="w-title">${escH(w.title)}</div>
          <div class="w-desc">${escH(w.description)}</div>
          <div style="margin-top:6px">${catTag}</div>
        </div>
        <div class="w-impact">
          <div class="w-impact-val" style="color:${col}">${w.impactScore}%</div>
          <div class="w-impact-label">Impact</div>
        </div>
      </div>`;
    }).join('') + `</div>`;
}

function renderPlan(analysis) {
  const weeks = analysis.improvementPlan || [];
  if (!weeks.length) { $('#planContent').innerHTML = '<p style="color:var(--text2)">No plan generated.</p>'; return; }
  const eCol = { low:'var(--green)', medium:'var(--yellow)', high:'var(--red)' };
  const cCol = { practice:'var(--accent)', research:'var(--yellow)', mindset:'var(--green)', skill:'var(--orange)' };
  $('#planContent').innerHTML = `<div class="plan-tl">` +
    weeks.map(week => `
      <div class="plan-week">
        <div class="plan-dot"></div>
        <div class="plan-wlabel">Week ${week.week}</div>
        <div class="plan-wtheme">${escH(week.theme)}</div>
        <div class="plan-tasks">
          ${(week.tasks||[]).map(t => `
            <div class="plan-task">
              <strong>${escH(t.action)}</strong>
              <div class="plan-task-detail">${escH(t.detail)}</div>
              <div class="plan-meta">
                <span class="plan-tag" style="color:${eCol[t.effort]||'var(--text2)'};border-color:currentColor">${t.effort} effort</span>
                <span class="plan-tag" style="color:${cCol[t.category]||'var(--text2)'};border-color:currentColor">${t.category||''}</span>
              </div>
            </div>`).join('')}
        </div>
      </div>`
    ).join('') + `</div>`;
}

// ──────────────────────────────────────────────────────────────────────
//  FIREBASE: Save & History
// ──────────────────────────────────────────────────────────────────────
async function saveReport(report) {
  if (!state.currentUser) return;
  await addDoc(collection(db, 'analyses'), {
    userId:       state.currentUser.uid,
    role:         report.role,
    itype:        report.itype,
    score:        report.analysis.overallScore,
    verdict:      report.analysis.verdict,
    analysis:     JSON.stringify(report.analysis),
    speechMetrics: JSON.stringify(report.speechMetrics || {}),
    createdAt:    serverTimestamp(),
  });
}

$('#btnSaveReport').addEventListener('click', async () => {
  if (!state.currentUser) { openAuthModal(); return; }
  if (!state.currentReport) return;
  try {
    await saveReport(state.currentReport);
    showToast('✓ Report saved!');
  } catch (e) { showToast('❌ Save failed: ' + e.message); }
});

async function loadHistory() {
  const list = $('#historyList');
  if (!state.currentUser) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">◎</div>
      <p>Sign in to view saved analyses.</p>
      <button class="btn-ghost" onclick="openAuthModal()">Sign In →</button></div>`;
    return;
  }
  list.innerHTML = '<div style="padding:40px;color:var(--text2)">Loading…</div>';
  try {
    const q = query(collection(db,'analyses'), where('userId','==',state.currentUser.uid), orderBy('createdAt','desc'));
    const snap = await getDocs(q);
    if (snap.empty) {
      list.innerHTML = '<div class="empty-state"><div class="empty-icon">◎</div><p>No saved analyses yet.</p></div>';
      return;
    }
    list.innerHTML = snap.docs.map(d => {
      const data  = d.data();
      const date  = data.createdAt?.toDate?.()?.toLocaleDateString() || '—';
      const color = scoreColor(data.score||0);
      return `<div class="history-card" onclick="loadHistoryItem('${d.id}')">
        <div class="hc-role">${escH(data.role||'—')}</div>
        <div class="hc-meta">${data.itype||'—'} · ${date}</div>
        <div class="hc-score" style="color:${color}">${data.score??'—'}/100</div>
      </div>`;
    }).join('');
  } catch (e) {
    list.innerHTML = `<div style="padding:40px;color:var(--red)">Error: ${e.message}</div>`;
  }
}

window.loadHistoryItem = async id => {
  try {
    const snap = await getDoc(doc(db,'analyses',id));
    if (!snap.exists()) { showToast('Report not found.'); return; }
    const data = snap.data();
    state.currentReport = {
      role:         data.role,
      itype:        data.itype,
      analysis:     JSON.parse(data.analysis),
      speechMetrics: JSON.parse(data.speechMetrics || '{}'),
      transcript:   '',
      audioStats:   null,
      blob:         null,
      createdAt:    data.createdAt?.toDate?.() || new Date(),
    };
    renderResults(state.currentReport);
    showPage('results');
  } catch (e) { showToast('❌ Could not load: ' + e.message); }
};

// ──────────────────────────────────────────────────────────────────────
//  AUTH
// ──────────────────────────────────────────────────────────────────────
function openAuthModal()  { $('#authModal').classList.remove('hidden'); }
function closeAuthModal() { $('#authModal').classList.add('hidden'); $('#authErr').classList.add('hidden'); }
window.openAuthModal = openAuthModal;

$('#btnLogin').addEventListener('click', openAuthModal);
$('#modalClose').addEventListener('click', closeAuthModal);
$('#authModal').addEventListener('click', e => { if (e.target === $('#authModal')) closeAuthModal(); });

$('#btnSignIn').addEventListener('click', async () => {
  const e = $('#authEmail').value.trim(), p = $('#authPassword').value;
  if (!e||!p) { showAuthErr('Please fill both fields.'); return; }
  try { await signInWithEmailAndPassword(auth, e, p); closeAuthModal(); showToast('✓ Signed in.'); }
  catch (err) { showAuthErr(err.message); }
});
$('#btnSignUp').addEventListener('click', async () => {
  const e = $('#authEmail').value.trim(), p = $('#authPassword').value;
  if (!e||!p) { showAuthErr('Please fill both fields.'); return; }
  try { await createUserWithEmailAndPassword(auth, e, p); closeAuthModal(); showToast('✓ Account created!'); }
  catch (err) { showAuthErr(err.message); }
});

function showAuthErr(msg) {
  const el = $('#authErr');
  el.textContent = msg;
  el.classList.remove('hidden');
}

onAuthStateChanged(auth, user => {
  state.currentUser = user;
  const nu = $('#navUser');
  if (user) {
    nu.innerHTML = `<span style="font-size:11px;color:var(--text2);margin-right:8px;font-family:var(--font-mono)">${user.email}</span>
      <button class="btn-ghost btn-sm" id="btnSignOut">Sign Out</button>`;
    document.getElementById('btnSignOut').addEventListener('click', () => { signOut(auth); showToast('Signed out.'); });
    if ($('#page-history').classList.contains('active')) loadHistory();
    updateGlobalStats();
  } else {
    nu.innerHTML = '<button class="btn-ghost" id="btnLogin">Sign In</button>';
    document.getElementById('btnLogin').addEventListener('click', openAuthModal);
  }
});

async function updateGlobalStats() {
  try {
    const q = query(collection(db,'analyses'), where('userId','==', state.currentUser.uid));
    const s = await getDocs(q);
    const el = $('#statTotal');
    if (el) el.textContent = s.size + '+';
  } catch(_) {}
}

