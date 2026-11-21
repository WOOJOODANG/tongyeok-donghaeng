// 통역 엔진 3종: free(Web Speech+Gemini) / eco(OpenAI 분할) / premium(OpenAI Realtime)
import { LANGS, KO, translatePrompt } from './config.js?v=41';
import { speakOut, stopSpeaking } from './voice.js?v=41';

export class QuotaError extends Error { constructor(m) { super(m); this.name = 'QuotaError'; } }
export class KeyError extends Error { constructor(m) { super(m); this.name = 'KeyError'; } }

async function checkOpenAI(res) {
  if (res.ok) return res;
  let body = {}; try { body = await res.json(); } catch {}
  const code = body?.error?.code || body?.error?.type || '';
  const msg = body?.error?.message || res.statusText;
  if (res.status === 401) throw new KeyError('OpenAI 키가 올바르지 않습니다.');
  if (code === 'insufficient_quota' || /quota|billing|balance/i.test(msg)) throw new QuotaError('OpenAI 잔액이 부족합니다.');
  throw new Error(`OpenAI 오류 (${res.status}): ${msg}`);
}

// ---------- 텍스트 번역 / 생성 ----------
export function geminiGenerate(key, system, text, opts = {}) { return geminiParts(key, system, [{ text }], opts); }
// parts: [{text}] 또는 [{inlineData:{mimeType,data}}] — 음성 평가에도 사용
// 모델 자동 선택: 구글이 모델을 바꿔도 동작하도록 후보를 차례로 시도하고, 실패 시 사용 가능 목록에서 자동 탐색
const GEMINI_CANDIDATES = ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3-flash', 'gemini-3.8-flash-lite', 'gemini-flash-lite-latest', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'];
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function listGemini(key) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } });
  if (!r.ok) return [];
  return ((await r.json()).models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace('models/', ''))
    .filter(n => /gemini/.test(n) && /flash/.test(n) && !/image|tts|live|audio|embedding/.test(n)).slice(0, 8);
}
async function discoverGemini(key) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key } });
  if (!r.ok) return null;
  const list = ((await r.json()).models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace('models/', ''));
  const flash = list.filter(n => /flash/.test(n) && !/lite|image|tts|live|audio|thinking|exp/.test(n));
  const ver = n => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
  flash.sort((x, y) => ver(y) - ver(x) || (/latest/.test(x) ? -1 : 1));
  return flash[0] || list.find(n => /gemini/.test(n)) || null;
}
async function geminiCall(key, model, system, parts, json, thinking) {
  const gc = { temperature: 0.2, ...(json ? { responseMimeType: 'application/json' } : {}) };
  if (thinking) gc.thinkingConfig = { thinkingBudget: 0 };
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts }], generationConfig: gc }),
  });
}
export async function geminiParts(key, system, parts, { json = false } = {}) {
  if (!key) throw new KeyError('⚙️ 설정에서 Gemini 키를 입력하세요.');
  const saved = localStorage.getItem('tyd_geminiModel');
  const tried = new Set(); let queue = [...new Set([saved, ...GEMINI_CANDIDATES].filter(Boolean))], discovered = false, lastMsg = '', over = false; const retried = new Set();
  while (queue.length) {
    const model = queue.shift(); if (tried.has(model)) continue; tried.add(model);
    let res = await geminiCall(key, model, system, parts, json, true);
    if (res.status === 400) { // thinkingConfig 미지원 모델이면 빼고 재시도
      const b = await res.clone().json().catch(() => ({})); const m = b?.error?.message || '';
      if (/API key/i.test(m)) throw new KeyError('Gemini 키가 올바르지 않습니다.');
      if (/thinking/i.test(m)) res = await geminiCall(key, model, system, parts, json, false);
    }
    if (res.ok) {
      if (saved !== model) localStorage.setItem('tyd_geminiModel', model);
      const d = await res.json();
      return (d.candidates?.[0]?.content?.parts || []).filter(p => !p.thought).map(p => p.text || '').join('').trim();
    }
    let b = {}; try { b = await res.json(); } catch {}
    lastMsg = b?.error?.message || res.statusText;
    if (res.status === 403 || (res.status === 400 && /API key/i.test(lastMsg))) throw new KeyError('Gemini 키가 올바르지 않습니다.');
    if (res.status === 429) throw new Error('Gemini 무료 사용량을 잠시 초과했습니다. 1분 후 다시 시도하세요.');
    // 503/500: 일시 과부하 → 같은 모델 1회 재시도 후 다른 모델로 자동 전환
    if (res.status === 503 || res.status === 500 || res.status === 502 || res.status === 504) {
      over = true;
      if (!retried.has(model)) { retried.add(model); await sleep(1200); tried.delete(model); queue.unshift(model); continue; }
      if (!queue.length && !discovered) { discovered = true; const all = await listGemini(key); queue.push(...all.filter(m => !tried.has(m))); }
      continue;
    }
    if (res.status === 404 || res.status === 400) {
      if (saved === model) localStorage.removeItem('tyd_geminiModel');
      const hint = (lastMsg.match(/models\/([\w.-]+)/g) || []).map(x => x.replace('models/', '')).filter(x => x !== model);
      queue.unshift(...hint);
      if (!queue.length && !discovered) { discovered = true; const m = await discoverGemini(key); if (m) queue.push(m); }
      continue;
    }
    throw new Error(`Gemini 오류 (${res.status}): ${lastMsg}`);
  }
  if (over) throw new Error('구글 서버가 일시적으로 혼잡합니다(키는 정상). 1~2분 후 다시 시도해 주세요.');
  throw new Error('사용 가능한 Gemini 모델을 찾지 못했습니다: ' + lastMsg);
}

export async function openaiChat(key, system, text, { json = false, model = 'gpt-4o-mini' } = {}) {
  const res = await checkOpenAI(await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, temperature: 0.2, messages: [{ role: 'system', content: system }, { role: 'user', content: text }],
      ...(json ? { response_format: { type: 'json_object' } } : {}) }),
  }));
  const d = await res.json();
  return d.choices[0].message.content.trim();
}

// ---------- 공통 베이스 ----------
class Base {
  constructor(opts) {
    // opts: { partner, domain, keys, onTurn(turn), onStatus(text, state), onError(err), onSpeaking(bool) }
    this.o = opts; this.running = false;
  }
  status(t, s = 'listen') { this.o.onStatus?.(t, s); }
  get pl() { return LANGS[this.o.partner]; }
}

// ---------- ① 무료: Web Speech 인식 + Gemini 번역 + 폰 TTS ----------
export class FreeEngine extends Base {
  constructor(o) { super(o); this.side = 'ko'; this.voices = []; }
  static supported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
  setSide(side) { // 수동 화자 전환
    this.side = side; if (this.rec) { try { this.rec.abort(); } catch {} }
  }
  async start() {
    if (!FreeEngine.supported()) throw new Error('이 브라우저는 음성인식을 지원하지 않습니다. 갤럭시의 Chrome에서 열어주세요.');
    if (!this.o.keys.gemini && navigator.onLine) throw new KeyError('설정에서 Gemini 키를 입력하세요.');
    // 마이크 권한 먼저 확보
    const s = await navigator.mediaDevices.getUserMedia({ audio: true }); s.getTracks().forEach(t => t.stop());
    this.voices = speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => { this.voices = speechSynthesis.getVoices(); };
    this.running = true; this.listen();
  }
  listen() {
    if (!this.running || this.busy) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR(); this.rec = rec;
    const side = this.side;
    rec.lang = side === 'ko' ? KO.bcp : this.pl.bcp;
    rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
    let finalText = '';
    this.status(side === 'ko' ? '🎙 한국어 듣는 중… (나)' : `🎙 ${this.pl.name} 듣는 중… (상대)`, side === 'ko' ? 'me' : 'partner');
    rec.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript; else interim += e.results[i][0].transcript;
      }
      this.o.onInterim?.(side, finalText + interim);
    };
    rec.onerror = e => { if (e.error === 'not-allowed') { this.o.onError(new Error('마이크 권한이 거부되었습니다.')); this.stop(); } };
    rec.onend = async () => {
      this.rec = null;
      if (!this.running) return;
      const text = finalText.trim();
      if (!text) { this.listen(); return; }
      this.busy = true; this.o.onInterim?.(side, '');
      await this.handle(side, text);
      this.busy = false;
      if (this.running) { this.side = side === 'ko' ? 'partner' : 'ko'; this.listen(); } // 턴 자동 교대
    };
    try { rec.start(); } catch { setTimeout(() => this.listen(), 300); }
  }
  async handle(side, text) {
    const from = side === 'ko' ? KO : this.pl, to = side === 'ko' ? this.pl : KO;
    this.status('🔄 번역 중…', 'busy');
    try {
      const tr = this.o.translate ? await this.o.translate(side === 'ko' ? 'ko' : this.o.partner, side === 'ko' ? this.o.partner : 'ko', text) : await geminiGenerate(this.o.keys.gemini, translatePrompt(this.o.domain, from.native, to.native), text);
      this.o.onTurn({ speaker: side === 'ko' ? 'me' : 'partner', src: text, dst: tr, t: Date.now() });
      await this.speak(tr.replace(/ ⓞ$/, '').replace(/^\(오프라인 — 번역 불가\) /, ''), to.bcp);
    } catch (e) { this.o.onError(e); if (e instanceof KeyError) this.stop(); }
  }
  async speak(text, bcp) {
    if (!this.running) return;
    this.status('🔊 통역 음성 재생 중…', 'speak'); this.o.onSpeaking?.(true);
    const how = await speakOut(text, bcp, this.o.rate || 1.0);
    this.o.onSpeaking?.(false);
    if (!how && this.running) this.o.onError(new Error('🔇 음성이 재생되지 않았습니다. 폰 볼륨(미디어)과 무음모드를 확인하세요. ⚙️ 설정 → 소리 테스트'));
    await new Promise(r => setTimeout(r, 300)); // 스피커 잔향이 마이크에 잡히지 않게
  }
  stop() { this.running = false; try { this.rec?.abort(); } catch {} stopSpeaking(); this.status('정지됨', 'idle'); }
}

// ---------- ② 절약: 마이크 VAD 분할 → gpt-4o-mini-transcribe → gpt-4o-mini → gpt-4o-mini-tts ----------
export class EcoEngine extends Base {
  async start() {
    if (!this.o.keys.openai) throw new KeyError('OpenAI 키가 필요합니다.');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    this.ctx = new AudioContext();
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.an = this.ctx.createAnalyser(); this.an.fftSize = 1024; src.connect(this.an);
    this.buf = new Float32Array(this.an.fftSize);
    this.running = true; this.queue = Promise.resolve(); this.noise = 0.008;
    this.status('🎙 듣는 중… (누가 말해도 자동 인식)', 'listen');
    this.loop();
  }
  level() { this.an.getFloatTimeDomainData(this.buf); let s = 0; for (const x of this.buf) s += x * x; return Math.sqrt(s / this.buf.length); }
  loop() {
    let speaking = false, lastVoice = 0, startT = 0;
    const tick = () => {
      if (!this.running) return;
      const now = performance.now(); const lv = this.level();
      if (!this.playing) {
        if (!speaking) this.noise = this.noise * 0.98 + lv * 0.02;
        const th = Math.max(0.015, this.noise * 3);
        if (lv > th) {
          lastVoice = now;
          if (!speaking) { speaking = true; startT = now; this.beginRec(); this.status('🗣 말하는 중…', 'me'); }
        } else if (speaking && now - lastVoice > 800) {
          speaking = false; const dur = now - startT; this.endRec(dur > 500);
          this.status('🎙 듣는 중…', 'listen');
        }
        if (speaking && now - startT > 25000) { speaking = false; this.endRec(true); }
      }
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }
  beginRec() {
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
    this.chunks = []; this.mr = new MediaRecorder(this.stream, { mimeType: mime });
    this.mr.ondataavailable = e => e.data.size && this.chunks.push(e.data);
    this.mr.start();
  }
  endRec(keep) {
    const mr = this.mr; if (!mr) return; this.mr = null;
    mr.onstop = () => { if (keep) { const blob = new Blob(this.chunks, { type: 'audio/webm' }); this.queue = this.queue.then(() => this.process(blob)); } };
    try { mr.stop(); } catch {}
  }
  async process(blob) {
    if (!this.running) return;
    const key = this.o.keys.openai;
    try {
      this.status('🔄 인식·번역 중…', 'busy');
      const fd = new FormData(); fd.append('file', blob, 'a.webm'); fd.append('model', 'gpt-4o-mini-transcribe');
      const r = await checkOpenAI(await fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: fd }));
      const text = ((await r.json()).text || '').trim();
      if (!text || text.length < 2) return;
      const pl = this.pl;
      const sys = translatePrompt(this.o.domain, 'the source language', 'the target language') +
        `\nRules: If the utterance is Korean, translate into ${pl.native}. Otherwise translate into Korean.
Return JSON: {"src_lang":"ko" or "${this.o.partner}" (or other code), "translation":"..."}`;
      const j = JSON.parse(await openaiChat(key, sys, text, { json: true }));
      const me = j.src_lang === 'ko';
      this.o.onTurn({ speaker: me ? 'me' : 'partner', src: text, dst: j.translation, t: Date.now() });
      await this.tts(j.translation);
      this.o.onUsage?.(blob.size / 16000 / 60 + 0.05);
    } catch (e) { this.o.onError(e); if (e instanceof QuotaError || e instanceof KeyError) this.stop(); }
    finally { if (this.running) this.status('🎙 듣는 중…', 'listen'); }
  }
  async tts(text) {
    const r = await checkOpenAI(await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.o.keys.openai}` },
      body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: 'alloy', input: text, response_format: 'mp3', speed: this.o.rate || 1.0 }),
    }));
    const url = URL.createObjectURL(await r.blob());
    this.playing = true; this.o.onSpeaking?.(true); this.status('🔊 재생 중…', 'speak');
    await new Promise(res => { const a = new Audio(url); this.audio = a; a.onended = a.onerror = res; a.play().catch(res); });
    URL.revokeObjectURL(url); this.audio = null;
    await new Promise(r => setTimeout(r, 250)); // 스피커 잔향 무시
    this.playing = false; this.o.onSpeaking?.(false);
  }
  stop() {
    this.running = false; cancelAnimationFrame(this.raf);
    try { this.mr?.stop(); } catch {} this.audio?.pause();
    this.stream?.getTracks().forEach(t => t.stop()); this.ctx?.close().catch(() => {});
    this.status('정지됨', 'idle');
  }
}

// ---------- ③ 프리미엄: OpenAI Realtime (WebRTC 음성→음성) ----------
export class PremiumEngine extends Base {
  async start() {
    const key = this.o.keys.openai; if (!key) throw new KeyError('OpenAI 키가 필요합니다.');
    const model = this.o.realtimeModel || 'gpt-realtime-mini';
    const pl = this.pl;
    const instructions = translatePrompt(this.o.domain, 'the speaker language', 'the other language') +
      `\nYou are a bidirectional interpreter between Korean and ${pl.native}. When you hear Korean, say ONLY the ${pl.native} translation. When you hear ${pl.native} (or any non-Korean language), say ONLY the Korean translation. Never answer questions yourself, never add comments, never greet. Translate faithfully and immediately.`;
    this.status('🔌 연결 중…', 'busy');
    // 1) 임시 토큰 발급
    const r = await checkOpenAI(await fetch('https://api.openai.com/v1/realtime/client_secrets', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ session: { type: 'realtime', model, instructions,
        audio: { input: { transcription: { model: 'gpt-4o-mini-transcribe' }, noise_reduction: { type: 'near_field' },
                          turn_detection: { type: 'server_vad', silence_duration_ms: 500, threshold: 0.6 } },
                 output: { voice: 'alloy', speed: this.o.rate || 1.0 } } } }),
    }));
    const ek = (await r.json()).value;
    // 2) WebRTC
    const pc = new RTCPeerConnection(); this.pc = pc;
    this.audio = new Audio(); this.audio.autoplay = true;
    pc.ontrack = e => { this.audio.srcObject = e.streams[0]; };
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    pc.addTrack(this.stream.getTracks()[0]);
    const dc = pc.createDataChannel('oai-events'); this.dc = dc;
    dc.onmessage = e => this.onEvent(JSON.parse(e.data));
    const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
    const sdp = await fetch(`https://api.openai.com/v1/realtime/calls?model=${model}`, {
      method: 'POST', body: offer.sdp, headers: { Authorization: `Bearer ${ek}`, 'Content-Type': 'application/sdp' } });
    if (!sdp.ok) await checkOpenAI(sdp);
    await pc.setRemoteDescription({ type: 'answer', sdp: await sdp.text() });
    this.running = true; this.t0 = Date.now(); this.pending = {};
    this.status('🎙 실시간 통역 중… (자유롭게 대화하세요)', 'listen');
    pc.onconnectionstatechange = () => { if (['failed', 'disconnected'].includes(pc.connectionState) && this.running) { this.o.onError(new Error('연결이 끊어졌습니다.')); this.stop(); } };
  }
  onEvent(ev) {
    switch (ev.type) {
      case 'input_audio_buffer.speech_started': this.status('🗣 말하는 중…', 'me'); break;
      case 'conversation.item.input_audio_transcription.completed':
        this.lastSrc = (ev.transcript || '').trim(); this.flush(); break;
      case 'response.output_audio_transcript.done':
      case 'response.audio_transcript.done':
        this.lastDst = (ev.transcript || '').trim(); this.flush(); break;
      case 'output_audio_buffer.started': case 'response.output_audio.delta':
        this.o.onSpeaking?.(true); this.status('🔊 통역 음성 재생 중…', 'speak'); break;
      case 'output_audio_buffer.stopped': case 'response.done':
        this.o.onSpeaking?.(false); if (this.running) this.status('🎙 실시간 통역 중…', 'listen');
        if (ev.type === 'response.done' && ev.response?.status === 'failed') {
          const err = ev.response.status_details?.error;
          if (err?.code === 'insufficient_quota' || /quota/i.test(err?.message || '')) { this.o.onError(new QuotaError('OpenAI 잔액이 부족합니다.')); this.stop(); }
        }
        break;
      case 'error':
        if (/quota/i.test(ev.error?.message || '') || ev.error?.code === 'insufficient_quota') { this.o.onError(new QuotaError('OpenAI 잔액이 부족합니다.')); this.stop(); }
        else console.warn(ev.error); break;
    }
  }
  flush() {
    if (this.lastSrc == null || this.lastDst == null) {
      // 원문 전사가 늦으면 번역만 먼저 기다림
      clearTimeout(this.ft); this.ft = setTimeout(() => { if (this.lastSrc != null || this.lastDst != null) this.emit(); }, 2500); return;
    }
    this.emit();
  }
  emit() {
    clearTimeout(this.ft);
    const src = this.lastSrc || '', dst = this.lastDst || '';
    this.lastSrc = this.lastDst = null;
    if (!src && !dst) return;
    const me = /[\uAC00-\uD7A3]/.test(src) ? true : (/[\uAC00-\uD7A3]/.test(dst) ? false : true);
    this.o.onTurn({ speaker: me ? 'me' : 'partner', src, dst, t: Date.now() });
  }
  stop() {
    if (this.running && this.t0) this.o.onUsage?.((Date.now() - this.t0) / 60000);
    this.running = false; this.t0 = 0;
    try { this.dc?.close(); this.pc?.close(); } catch {}
    this.stream?.getTracks().forEach(t => t.stop()); if (this.audio) this.audio.srcObject = null;
    this.status('정지됨', 'idle');
  }
}
