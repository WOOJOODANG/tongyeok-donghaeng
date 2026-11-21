// 🎓 영어 연습: 오늘의 단어 / 오늘의 문장 / 한→영 만들기 / 발음·속도·강세 코칭 / 전화영어(AI 롤플레이)
import { DOMAINS } from './config.js';
import { geminiGenerate, geminiParts } from './engines.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LS = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem('tyd_' + k)) ?? d; } catch { return d; } },
  set: (k, v) => localStorage.setItem('tyd_' + k, JSON.stringify(v)),
};
const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD (현지)
let ctx = { key: () => '', domain: () => 'general' };

// ---------- 음성 출력 (원어민 발음 듣기) ----------
let voices = [];
const loadVoices = () => { voices = speechSynthesis.getVoices(); };
speechSynthesis.onvoiceschanged = loadVoices; loadVoices();
export function say(text, rate = 1, lang = 'en-US') {
  return new Promise(res => {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = lang; u.rate = rate;
    const v = voices.find(v => v.lang.replace('_', '-') === lang && /google/i.test(v.name)) || voices.find(v => v.lang.replace('_', '-').startsWith(lang.slice(0, 2)));
    if (v) u.voice = v;
    u.onend = u.onerror = res; speechSynthesis.speak(u);
    setTimeout(res, 3000 + text.length * 200);
  });
}

// ---------- 녹음 ----------
class Recorder {
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(m => MediaRecorder.isTypeSupported(m)) || '';
    this.mime = (mime || 'audio/webm').split(';')[0];
    this.chunks = []; this.mr = new MediaRecorder(this.stream, mime ? { mimeType: mime } : {});
    this.mr.ondataavailable = e => e.data.size && this.chunks.push(e.data);
    this.t0 = performance.now(); this.mr.start();
  }
  stop() {
    return new Promise(res => {
      this.mr.onstop = async () => {
        this.stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(this.chunks, { type: this.mime });
        const b64 = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(blob); });
        res({ blob, b64, mime: this.mime, sec: (performance.now() - this.t0) / 1000 });
      };
      this.mr.stop();
    });
  }
}

// ---------- 한 번 말하기 → 텍스트 (Web Speech) ----------
function listenOnce(lang) {
  return new Promise((res, rej) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return rej(new Error('Chrome에서 열어주세요 (음성인식 미지원).'));
    const r = new SR(); r.lang = lang; r.interimResults = false; r.maxAlternatives = 1;
    let txt = ''; r.onresult = e => { txt = [...e.results].map(x => x[0].transcript).join(' '); };
    r.onerror = e => rej(new Error(e.error === 'no-speech' ? '말소리가 들리지 않았어요.' : e.error === 'not-allowed' ? '마이크 권한을 허용해주세요.' : e.error));
    r.onend = () => res(txt.trim()); r.start();
  });
}

// ---------- 발음 코칭 (Gemini 음성 분석) ----------
const COACH_SYS = `You are an expert English pronunciation coach for a Korean adult learner (physical therapist, professor, insurance planner, accounting firm).
You receive an audio recording and the TARGET sentence. Listen carefully to the actual audio.
Return ONLY JSON:
{"heard":"what the learner actually said (transcribe faithfully, including mistakes)",
 "accuracy":0-100, "pronunciation":0-100, "fluency":0-100, "stress_intonation":0-100,
 "overall":0-100,
 "wpm_comment":"Korean: speed feedback (native conversational ~130-160 WPM)",
 "word_issues":[{"word":"...","problem":"Korean explanation (e.g. r/l, f/p, th, v/b, final consonant, extra vowel 'uh')","tip":"Korean mouth/tongue tip"}],
 "stress_tip":"Korean: which words to stress, where to rise/fall, linking (e.g. 'check it out' → 체킷아웃)",
 "stressed_text":"target sentence with STRESSED words in CAPS and ↗/↘ for intonation, | for pauses",
 "praise":"Korean one-line encouragement",
 "next":"Korean: single most important thing to practice next"}
Be honest and specific; Korean speakers commonly: add vowels after final consonants, confuse r/l, p/f, b/v, th→s/d, flat intonation, equal syllable timing. If audio is silent or unrelated, overall=0.`;

async function coach(target, rec) {
  const words = target.trim().split(/\s+/).length;
  const wpm = Math.round(words / Math.max(rec.sec - 0.6, 0.5) * 60);
  const raw = await geminiParts(ctx.key(), COACH_SYS, [
    { text: `TARGET: "${target}"\nRecording length: ${rec.sec.toFixed(1)}s, approx ${wpm} WPM.` },
    { inlineData: { mimeType: rec.mime, data: rec.b64 } },
  ], { json: true });
  const j = JSON.parse(raw); j.wpm = wpm; return j;
}
const bar = (label, v) => `<div class="score"><span>${label}</span><div class="barBg"><div class="barFg" style="width:${v}%;background:${v >= 85 ? '#22c55e' : v >= 65 ? '#f59e0b' : '#ef4444'}"></div></div><b>${v}</b></div>`;
function coachHTML(j, target) {
  return `<div class="coach">
   <div class="big">${j.overall}<small>점</small></div>
   ${bar('정확도', j.accuracy)}${bar('발음', j.pronunciation)}${bar('유창성', j.fluency)}${bar('강세·억양', j.stress_intonation)}
   <p>🕐 속도 <b>${j.wpm} WPM</b> — ${esc(j.wpm_comment)}</p>
   <p>👂 들린 문장: <i>${esc(j.heard)}</i></p>
   ${j.word_issues?.length ? '<h4>🔤 교정할 단어</h4><ul>' + j.word_issues.map(w => `<li><b>${esc(w.word)}</b> — ${esc(w.problem)}<br><span class="note">💡 ${esc(w.tip)}</span> <button class="mini" data-say="${esc(w.word)}">🔊</button></li>`).join('') + '</ul>' : ''}
   <h4>🎵 강약·억양</h4><p class="stressed">${esc(j.stressed_text)}</p><p>${esc(j.stress_tip)}</p>
   <p>👍 ${esc(j.praise)}</p><p>🎯 다음 연습: ${esc(j.next)}</p>
   <div class="row"><button class="btn gray" data-say="${esc(target)}" data-rate="0.75">🐢 천천히 듣기</button><button class="btn gray" data-say="${esc(target)}">🔊 원어민 속도</button></div>
  </div>`;
}
function bindSay(root) { root.querySelectorAll('[data-say]').forEach(b => b.onclick = () => say(b.dataset.say, Number(b.dataset.rate || 1))); }

// 문장 하나를 [듣기 → 따라 말하기 → 평가] 하는 공용 카드
function drillCard(el, target, ko) {
  el.innerHTML = `<div class="drill"><p class="target">${esc(target)}</p>${ko ? `<p class="note">${esc(ko)}</p>` : ''}
   <div class="row"><button class="btn gray" data-say="${esc(target)}" data-rate="0.75">🐢 천천히</button><button class="btn gray" data-say="${esc(target)}">🔊 듣기</button><button class="btn red" data-rec>🎙 따라 말하기</button></div>
   <div data-result></div></div>`;
  bindSay(el);
  const btn = el.querySelector('[data-rec]'), out = el.querySelector('[data-result]');
  let rec = null;
  btn.onclick = async () => {
    if (!rec) {
      try { speechSynthesis.cancel(); rec = new Recorder(); await rec.start(); btn.textContent = '⏹ 다 말했어요'; btn.classList.add('pulse'); out.innerHTML = '<p class="note">말씀하세요… 끝나면 ⏹</p>'; }
      catch (e) { rec = null; out.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
    } else {
      btn.disabled = true; btn.textContent = '분석 중…'; btn.classList.remove('pulse');
      const r = await rec.stop(); rec = null;
      try {
        const j = await coach(target, r); out.innerHTML = coachHTML(j, target); bindSay(out);
        const st = LS.get('stats', {}); const d = st[today()] || { n: 0, sum: 0 }; d.n++; d.sum += j.overall; st[today()] = d; LS.set('stats', st);
      } catch (e) { out.innerHTML = `<p class="err">⚠️ ${esc(e.message)}</p>`; }
      btn.disabled = false; btn.textContent = '🎙 다시 말하기';
    }
  };
}

// ---------- 오늘의 단어 / 문장 (하루 1회 생성, 캐시) ----------
async function daily(kind) {
  const dom = ctx.domain(); const k = `daily_${kind}_${today()}_${dom}`;
  const cached = LS.get(k, null); if (cached) return cached;
  const level = LS.get('level', 'intermediate');
  const field = DOMAINS[dom].prompt;
  const sys = kind === 'words'
    ? `Create today's 8 useful English words/phrases for a Korean professional (${level} level). Context: ${field} Mix 5 field-specific and 3 everyday. Return ONLY JSON: {"items":[{"en":"word","ipa":"/IPA/","ko":"한국어 뜻","ko_sound":"한글 발음 근사(강세 음절은 굵게 표시 없이 대문자 로마자 X, 그냥 한글)","stress":"stressed syllable e.g. re-HAB","example":"short natural example sentence","example_ko":"예문 해석"}]}`
    : `Create today's 5 natural spoken English sentences a Korean professional would actually say to a foreign client (${level} level). Context: ${field} Return ONLY JSON: {"items":[{"en":"sentence","ko":"한국어 뜻","situation":"언제 쓰는지(한국어)","point":"표현 포인트(한국어 1줄)"}]}`;
  const raw = await geminiGenerate(ctx.key(), sys, `Date seed: ${today()} ${kind} ${dom}. Avoid very basic words.`, { json: true });
  const data = JSON.parse(raw).items; LS.set(k, data); return data;
}

async function renderWords(el) {
  el.innerHTML = '<p class="note">오늘의 단어를 준비 중…</p>';
  try {
    const items = await daily('words');
    el.innerHTML = `<p class="note">📅 ${today()} · ${DOMAINS[ctx.domain()].label} · 단어를 눌러 따라 말하기</p>` + items.map((w, i) => `
     <div class="wcard" data-i="${i}"><div class="wtop"><b>${esc(w.en)}</b> <span class="note">${esc(w.ipa)} · ${esc(w.ko_sound)}</span><button class="mini" data-say="${esc(w.en)}">🔊</button></div>
     <div>${esc(w.ko)} <span class="note">강세: ${esc(w.stress)}</span></div>
     <div class="note">“${esc(w.example)}” — ${esc(w.example_ko)}</div><div data-drill></div></div>`).join('');
    bindSay(el);
    el.querySelectorAll('.wcard').forEach(c => c.querySelector('b').onclick = () => {
      const w = items[c.dataset.i]; drillCard(c.querySelector('[data-drill]'), w.en, w.ko);
    });
  } catch (e) { el.innerHTML = `<p class="err">⚠️ ${esc(e.message)}</p>`; }
}
async function renderSentences(el) {
  el.innerHTML = '<p class="note">오늘의 문장을 준비 중…</p>';
  try {
    const items = await daily('sentences');
    el.innerHTML = `<p class="note">📅 ${today()} · ${DOMAINS[ctx.domain()].label}</p>` + items.map((s, i) => `
      <div class="wcard"><div class="note">🗨 ${esc(s.situation)} · ${esc(s.point)}</div><div data-drill="${i}"></div></div>`).join('');
    el.querySelectorAll('[data-drill]').forEach(d => drillCard(d, items[d.dataset.drill].en, items[d.dataset.drill].ko));
  } catch (e) { el.innerHTML = `<p class="err">⚠️ ${esc(e.message)}</p>`; }
}

// ---------- 한→영 만들기 ----------
function renderMake(el) {
  el.innerHTML = `<p>하고 싶은 말을 <b>한국어로</b> 말하거나 적으세요. 상황에 맞는 영어 문장으로 만들어 드립니다.</p>
   <textarea id="mkKo" rows="3" placeholder="예) 오늘 운동은 하루에 세 번, 10회씩 해주세요"></textarea>
   <div class="row"><button class="btn gray" id="mkMic">🎙 한국어로 말하기</button><button class="btn" id="mkGo">✨ 영어로 만들기</button></div><div id="mkOut"></div>`;
  $('mkMic').onclick = async () => { $('mkMic').textContent = '듣는 중…'; try { $('mkKo').value = await listenOnce('ko-KR'); if ($('mkKo').value) $('mkGo').click(); } catch (e) { alert(e.message); } $('mkMic').textContent = '🎙 한국어로 말하기'; };
  $('mkGo').onclick = async () => {
    const ko = $('mkKo').value.trim(); if (!ko) return;
    $('mkOut').innerHTML = '<p class="note">만드는 중…</p>';
    try {
      const raw = await geminiGenerate(ctx.key(), `Convert the Korean into natural spoken English for a Korean professional. Context: ${DOMAINS[ctx.domain()].prompt}
Return ONLY JSON: {"options":[{"style":"정중(고객용)","en":"..."},{"style":"자연스러운 일상","en":"..."},{"style":"쉽고 짧게","en":"..."}],"key_expressions":[{"en":"...","ko":"..."}],"note":"Korean: nuance tip"}`, ko, { json: true });
      const j = JSON.parse(raw);
      $('mkOut').innerHTML = j.options.map((o, i) => `<div class="wcard"><div class="note">${esc(o.style)}</div><div data-d="${i}"></div></div>`).join('') +
        (j.key_expressions?.length ? '<h4>핵심 표현</h4><ul>' + j.key_expressions.map(x => `<li><b>${esc(x.en)}</b> — ${esc(x.ko)} <button class="mini" data-say="${esc(x.en)}">🔊</button></li>`).join('') + '</ul>' : '') +
        `<p class="note">💡 ${esc(j.note)}</p>`;
      $('mkOut').querySelectorAll('[data-d]').forEach(d => drillCard(d, j.options[d.dataset.d].en));
      bindSay($('mkOut'));
      const h = LS.get('myPhrases', []); h.unshift({ ko, en: j.options[0].en, at: Date.now() }); LS.set('myPhrases', h.slice(0, 100));
    } catch (e) { $('mkOut').innerHTML = `<p class="err">⚠️ ${esc(e.message)}</p>`; }
  };
}

// ---------- 전화영어 (AI 롤플레이, 연속 대화) ----------
const SCENES = {
  free: { t: '☕ 자유 대화', s: 'a friendly native English tutor named Emma making casual small talk' },
  pt: { t: '🩺 외국인 환자 초진', s: 'a foreign patient visiting a Korean physical therapy clinic with lower back pain; the learner is the therapist' },
  lecture: { t: '🎓 외국인 학생 수업', s: 'an international student asking questions after the learner\'s physical therapy lecture' },
  ins: { t: '🛡 보험 상담', s: 'a foreign resident in Korea asking about health/life insurance; the learner is the insurance planner' },
  tax: { t: '💼 세무·상속 상담', s: 'a foreign client asking about Korean inheritance/gift tax and bookkeeping; the learner is the accounting consultant' },
};
let call = null;
function renderCall(el) {
  el.innerHTML = `<p>피클 전화영어처럼 AI와 <b>영어로 계속 대화</b>합니다. 틀린 표현은 매 턴 한국어로 바로 고쳐드려요.</p>
   <label class="note">상황</label><select id="clScene">${Object.entries(SCENES).map(([k, v]) => `<option value="${k}">${v.t}</option>`).join('')}</select>
   <div class="row"><button class="btn green" id="clStart">📞 전화 시작</button><button class="btn red hidden" id="clEnd">📴 종료·피드백</button></div>
   <div id="clStatus" class="statusBar"></div><div id="clLog" class="log callLog"></div>`;
  $('clStart').onclick = startCall; $('clEnd').onclick = endCall;
}
async function startCall() {
  const sc = SCENES[$('clScene').value];
  call = { sc, hist: [], on: true };
  $('clStart').classList.add('hidden'); $('clEnd').classList.remove('hidden'); $('clLog').innerHTML = '';
  await callTurn('(The call just connected. Greet the learner and open the conversation in one or two short sentences.)');
  callLoop();
}
function callSys() {
  return `Role-play phone English lesson. You are ${call.sc.s}. Level: ${LS.get('level', 'intermediate')}.
Speak naturally, SHORT turns (1-3 sentences), ask one question at a time to keep the learner talking.
Return ONLY JSON: {"reply":"your spoken English reply","correction":"if learner's last line had errors: Korean explanation + better English; else empty","better":"more natural version of learner's line or empty","hint_ko":"Korean hint for how learner could answer next"}`;
}
async function callTurn(userText) {
  if (userText && !userText.startsWith('(')) addLine('me', userText);
  const convo = call.hist.map(h => `${h.r === 'me' ? 'Learner' : 'You'}: ${h.t}`).join('\n') + `\nLearner: ${userText}`;
  setCS('💭 생각 중…');
  const j = JSON.parse(await geminiGenerate(ctx.key(), callSys(), convo, { json: true }));
  call.hist.push({ r: 'me', t: userText }, { r: 'ai', t: j.reply });
  addLine('ai', j.reply, j);
  setCS('🔊 듣는 중…'); await say(j.reply, Number(LS.get('callRate', 1)));
}
async function callLoop() {
  while (call?.on) {
    setCS('🎙 영어로 말하세요…');
    let t = '';
    try { t = await listenOnce('en-US'); } catch (e) { if (!/들리지/.test(e.message)) { setCS('⚠️ ' + e.message); break; } }
    if (!call?.on) break;
    if (!t) continue;
    try { await callTurn(t); } catch (e) { setCS('⚠️ ' + e.message); break; }
  }
}
function addLine(who, text, j) {
  const d = document.createElement('div'); d.className = 'bub ' + (who === 'me' ? 'me' : 'partner');
  d.innerHTML = `<div class="dst">${esc(text)}</div>` + (j ? `<button class="mini" data-say="${esc(text)}">🔊</button>
    ${j.correction ? `<div class="corr">✏️ ${esc(j.correction)}${j.better ? `<br>👉 <b>${esc(j.better)}</b>` : ''}</div>` : ''}
    ${j.hint_ko ? `<div class="note">💡 ${esc(j.hint_ko)}</div>` : ''}` : '');
  $('clLog').appendChild(d); bindSay(d); $('clLog').scrollTop = 1e9;
}
const setCS = t => { if ($('clStatus')) $('clStatus').textContent = t; };
async function endCall() {
  if (!call) return; call.on = false; speechSynthesis.cancel();
  $('clStart').classList.remove('hidden'); $('clEnd').classList.add('hidden');
  const mine = call.hist.filter(h => h.r === 'me' && !h.t.startsWith('(')).map(h => h.t);
  if (!mine.length) { setCS('통화 종료'); return; }
  setCS('📊 오늘 통화 피드백 작성 중…');
  try {
    const j = JSON.parse(await geminiGenerate(ctx.key(), `Review a Korean learner's English phone lesson. Return ONLY JSON:
{"score":0-100,"good":["잘한 점 (Korean)"],"fix":[{"said":"...","better":"...","why":"Korean"}],"expressions":[{"en":"useful expression for next time","ko":"뜻"}],"summary":"Korean 2 lines"}`,
      call.hist.map(h => `${h.r === 'me' ? 'Learner' : 'Tutor'}: ${h.t}`).join('\n'), { json: true }));
    const d = document.createElement('div'); d.className = 'wcard';
    d.innerHTML = `<h4>📊 통화 피드백 ${j.score}점</h4><p>${esc(j.summary)}</p><b>👍 잘한 점</b><ul>${j.good.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      <b>✏️ 고칠 표현</b><ul>${j.fix.map(f => `<li>${esc(f.said)} → <b>${esc(f.better)}</b> <button class="mini" data-say="${esc(f.better)}">🔊</button><br><span class="note">${esc(f.why)}</span></li>`).join('')}</ul>
      <b>📌 다음에 써볼 표현</b><ul>${j.expressions.map(x => `<li>${esc(x.en)} — ${esc(x.ko)} <button class="mini" data-say="${esc(x.en)}">🔊</button></li>`).join('')}</ul>`;
    $('clLog').appendChild(d); bindSay(d); $('clLog').scrollTop = 1e9; setCS('통화 종료');
  } catch (e) { setCS('⚠️ ' + e.message); }
}

// ---------- 화면 ----------
const TABS = { words: ['📚 오늘의 단어', renderWords], sentences: ['🗨 오늘의 문장', renderSentences], make: ['✨ 한→영 만들기', renderMake], call: ['📞 전화영어', renderCall] };
export function openPractice(c) {
  ctx = c;
  const st = LS.get('stats', {}); const d = st[today()];
  const streak = (() => { let n = 0; const x = new Date(); while (st[x.toLocaleDateString('sv-SE')]) { n++; x.setDate(x.getDate() - 1); } return n; })();
  $('practice').innerHTML = `<header><div class="brand">🎓 영어 연습</div><button class="icon" id="prX">✕</button></header>
   <div class="note pstat">🔥 연속 ${streak}일 · 오늘 ${d ? d.n + '회, 평균 ' + Math.round(d.sum / d.n) + '점' : '아직 연습 전'}
     · 레벨 <select id="prLv" class="inline">${['beginner', 'intermediate', 'advanced'].map(l => `<option ${LS.get('level', 'intermediate') === l ? 'selected' : ''} value="${l}">${{ beginner: '초급', intermediate: '중급', advanced: '고급' }[l]}</option>`).join('')}</select></div>
   <div class="tabs">${Object.entries(TABS).map(([k, v]) => `<button data-t="${k}">${v[0]}</button>`).join('')}</div>
   <div id="prBody" class="prBody"></div>`;
  $('practice').classList.remove('hidden');
  $('prX').onclick = () => { if (call) { call.on = false; } speechSynthesis.cancel(); $('practice').classList.add('hidden'); };
  $('prLv').onchange = e => LS.set('level', e.target.value);
  const go = k => { if (call) call.on = false; $('practice').querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === k)); TABS[k][1]($('prBody')); };
  $('practice').querySelectorAll('.tabs button').forEach(b => b.onclick = () => go(b.dataset.t));
  go('words');
}
