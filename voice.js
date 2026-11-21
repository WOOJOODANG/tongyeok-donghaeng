// 🔊 음성 출력 공용 모듈 — 안드로이드 크롬에서 소리가 안 나는 문제 대응
// 1) 폰 내장 음성(speechSynthesis) 시도 → 1.5초 안에 재생이 시작 안 되면
// 2) 온라인 음성(구글 번역 음성, mp3)으로 자동 전환
// 설정 'ttsMode': auto | phone | online
const getMode = () => { try { return JSON.parse(localStorage.getItem('tyd_ttsMode')) || 'auto'; } catch { return 'auto'; } };
let voices = [];
const loadVoices = () => { try { voices = speechSynthesis.getVoices(); } catch {} };
if ('speechSynthesis' in window) { speechSynthesis.addEventListener?.('voiceschanged', loadVoices); loadVoices(); }
let unlocked = false, phoneBroken = false, curAudio = null, stopFlag = 0;
export let lastMethod = '';

// ▶ 버튼 등 '사용자 터치' 순간에 호출 → 이후 자동 재생 허용
export function unlockAudio() {
  if (unlocked) return; unlocked = true;
  try { // 0.1초 무음 WAV 생성 후 재생 → 오디오 재생 권한 확보
    const n = 800, buf = new ArrayBuffer(44 + n), v = new DataView(buf), w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true);
    for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
    const a = new Audio(URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))); a.play().catch(() => {});
  } catch {}
  try { if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } } catch {}
}
export function stopSpeaking() {
  stopFlag++;
  try { speechSynthesis.cancel(); } catch {}
  try { curAudio?.pause(); } catch {} curAudio = null;
}

function pickVoice(bcp) {
  if (!voices.length) loadVoices();
  const n = l => (l || '').replace('_', '-').toLowerCase(), b = bcp.toLowerCase(), p = b.slice(0, 2);
  return voices.find(v => n(v.lang) === b && /google/i.test(v.name)) || voices.find(v => n(v.lang) === b) || voices.find(v => n(v.lang).startsWith(p));
}
function phoneSpeak(text, bcp, rate) {
  return new Promise(res => {
    if (!('speechSynthesis' in window)) return res(false);
    const u = new SpeechSynthesisUtterance(text); u.lang = bcp; u.rate = rate; u.volume = 1;
    const v = pickVoice(bcp); if (v) u.voice = v;
    let started = false, finished = false;
    const fin = ok => { if (finished) return; finished = true; clearTimeout(t1); clearTimeout(t2); clearInterval(keep); res(ok); };
    u.onstart = () => { started = true; };
    u.onend = () => fin(started || true);
    u.onerror = e => fin(started && e.error === 'interrupted');
    // 크롬 버그: 일시정지 상태로 멈추는 것 방지
    const keep = setInterval(() => { try { if (speechSynthesis.paused) speechSynthesis.resume(); } catch {} }, 500);
    if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
    setTimeout(() => speechSynthesis.speak(u), 60); // cancel 직후 바로 speak 하면 무시되는 안드로이드 버그 회피
    const t1 = setTimeout(() => { if (!started) { try { speechSynthesis.cancel(); } catch {} fin(false); } }, 1800);
    const t2 = setTimeout(() => fin(true), 6000 + text.length * 180);
  });
}
function chunks(text, max = 180) {
  const parts = text.match(/[^.!?。！？\n]+[.!?。！？]?/g) || [text]; const out = []; let cur = '';
  for (const p of parts) {
    if ((cur + p).length > max) { if (cur) out.push(cur); cur = ''; }
    if (p.length > max) { for (let i = 0; i < p.length; i += max) out.push(p.slice(i, i + max)); } else cur += p;
  }
  if (cur.trim()) out.push(cur); return out.map(s => s.trim()).filter(Boolean);
}
async function onlineSpeak(text, bcp, rate) {
  const tl = bcp.startsWith('zh') ? 'zh-CN' : bcp.slice(0, 2); const my = stopFlag;
  for (const c of chunks(text)) {
    if (my !== stopFlag) return true;
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${tl}&ttsspeed=${rate < 0.9 ? 0.3 : 1}&q=${encodeURIComponent(c)}`;
    const ok = await new Promise(res => {
      const a = new Audio(url); curAudio = a; a.playbackRate = rate >= 0.9 ? rate : 1; a.volume = 1;
      a.onended = () => res(true); a.onerror = () => res(false);
      a.play().catch(() => res(false));
      setTimeout(() => res(true), 4000 + c.length * 200);
    });
    if (!ok) return false;
  }
  return true;
}
// 메인: 소리 내기 (끝날 때까지 기다림). 반환: 사용한 방법 or '' (실패)
export async function speakOut(text, bcp, rate = 1) {
  text = String(text || '').trim(); if (!text) return '';
  const mode = getMode();
  if (mode !== 'online' && !(mode === 'auto' && phoneBroken)) {
    if (await phoneSpeak(text, bcp, rate)) return (lastMethod = 'phone');
    if (mode === 'auto') phoneBroken = true; // 한 번 실패하면 이번 실행 동안은 바로 온라인 음성
  }
  if (mode !== 'phone' && navigator.onLine) { if (await onlineSpeak(text, bcp, rate)) return (lastMethod = 'online'); }
  if (mode === 'online' && await phoneSpeak(text, bcp, rate)) return (lastMethod = 'phone');
  return (lastMethod = '');
}
export function resetVoiceProbe() { phoneBroken = false; }
export function voiceInfo(bcp) { const v = pickVoice(bcp); return v ? `${v.name} (${v.lang})` : '설치된 음성 없음'; }
