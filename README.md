# DebriefAI — Audio/Video Interview Analysis Platform
### DevClash 2026 | PS6 | Open Track

---

## 🎙 What's Different from the Text Version

This version **records and analyzes audio/video directly in the browser**:

| Feature | Text Version | This Version |
|---------|-------------|--------------|
| Input | Paste transcript | Live recording OR file upload |
| Speech Detection | Manual typing | Web Speech API (real-time) |
| Voice Analysis | None | Volume curve, silence detection, pace |
| Confidence Metric | None | Real-time volume/confidence HUD |
| Filler Detection | Text scan | Live highlighted as you speak |
| Waveform | None | Live animated waveform |
| Audio Timeline | None | Visual waveform with event markers |
| Annotated Transcript | None | Fillers/pauses highlighted inline |

---

## 🚀 Setup (5 minutes)

### 1. Firebase Project

1. [firebase.google.com](https://firebase.google.com) → Add project → `debriefai`
2. **Auth** → Enable Email/Password
3. **Firestore** → Create database → Test mode
4. Project Settings → Web App → Copy `firebaseConfig`

### 2. Configure app.js

Replace `FIREBASE_CONFIG` at the top of `app.js`:
```js
const FIREBASE_CONFIG = {
  apiKey: "AIzaSy...",
  authDomain: "debriefai.firebaseapp.com",
  projectId: "debriefai",
  storageBucket: "debriefai.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:...:web:..."
};
```

### 3. Anthropic API (Proxy Required for Production)

For the hackathon demo, the app calls the Anthropic API directly. For production,
proxy calls through Firebase Functions to keep your key private.

**Firebase Functions proxy** (recommended):
```bash
firebase init functions
cd functions && npm install node-fetch
```

`functions/index.js`:
```js
const { onCall } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const fetch = require("node-fetch");

const anthropicKey = defineSecret("ANTHROPIC_KEY");

exports.analyzeInterview = onCall({ secrets: [anthropicKey] }, async (request) => {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey.value(),
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(request.data)
  });
  return res.json();
});
```

Set key: `firebase functions:secrets:set ANTHROPIC_KEY`

Then in `app.js`, replace `callClaudeAI` to use:
```js
import { getFunctions, httpsCallable } from "firebase/functions";
const analyzeInterview = httpsCallable(getFunctions(), 'analyzeInterview');
const result = await analyzeInterview({ model, max_tokens, messages });
```

### 4. Firestore Security Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /analyses/{docId} {
      allow read, write: if request.auth != null && request.auth.uid == resource.data.userId;
      allow create: if request.auth != null && request.auth.uid == request.resource.data.userId;
    }
  }
}
```

### 5. Run Locally

```bash
# Python
python3 -m http.server 3000

# Node
npx serve .
```

Open `http://localhost:3000`

> ⚠️ **Must be served over HTTP/HTTPS** — file:// doesn't support MediaDevices API.

---

## 🎥 How Recording Works

### Browser APIs Used

| API | Purpose |
|-----|---------|
| `MediaDevices.getUserMedia()` | Camera + microphone access |
| `MediaRecorder` | Records video/audio to `webm` chunks |
| `AudioContext + AnalyserNode` | Real-time waveform + volume analysis |
| `SpeechRecognition` (Web Speech API) | Live speech-to-text transcription |
| `OfflineAudioContext` | Batch audio analysis of uploaded files |

### Live Recording Flow
```
Camera/Mic → MediaRecorder (saves blob chunks)
           → AudioContext AnalyserNode → waveform + confidence HUD
           → SpeechRecognition → live transcript + filler detection
```

### Upload Flow
```
File selected → OfflineAudioContext → volume curve + silence segments
             → Audio element play → SpeechRecognition transcribes
             → Combined data → Claude AI analysis
```

### Analysis Pipeline
```
Recording/Upload
    ↓
Step 1: Transcription (Web Speech API)
    ↓
Step 2: Voice Analysis (AudioContext - RMS volume, silence, pace)
    ↓
Step 3: Speech Metrics (WPM, vocabulary richness, filler count)
    ↓
Step 4: Claude AI (structured JSON debrief)
    ↓
Results: Score banner + timeline + annotated transcript + 4-tab analysis
```

---

## 📁 File Structure

```
interview-analyzer/
├── index.html    — Full SPA: Home, Record, Upload, Processing, Results, History
├── style.css     — Dark command-center aesthetic
├── app.js        — Recording engine + audio analysis + Firebase + Claude AI
└── README.md     — This file
```

---

## ⚠️ Browser Compatibility

| Feature | Chrome | Edge | Firefox | Safari |
|---------|--------|------|---------|--------|
| MediaRecorder | ✅ | ✅ | ✅ | ✅ iOS 14.3+ |
| Web Speech API | ✅ | ✅ | ❌ | ❌ |
| OfflineAudioContext | ✅ | ✅ | ✅ | ✅ |

**Recommendation: Use Chrome or Edge for full speech-to-text support.**
Firefox/Safari will still record and analyze audio metrics, but auto-transcription won't work.
Users on non-supported browsers can manually add context in the "Additional Context" field.

---

## 🔬 What Gets Analyzed from Audio

1. **Real-time volume curve** — confidence scored second-by-second
2. **Silence/pause segments** — pauses over 1.5s flagged with timestamps
3. **Filler word frequency** — detected in live transcript & ranked by damage
4. **Words per minute** — speaking pace analysis
5. **Vocabulary richness** — unique word ratio (lexical diversity)
6. **Sentence complexity** — average sentence length
7. **Key voice moments** — timestamped low-confidence, filler bursts, strong answers

---

Built for DevClash 2026 · Problem Statement PS6 · Open Track
