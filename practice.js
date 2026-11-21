// 🎓 외국어 연습 (모든 지원 언어 공통)
// 탭: 오늘의 단어 / 오늘의 문장 / 단계별 코스(초·중·고·대·비즈니스·생활) / 한→외 만들기 / 전화회화 / 단어장·복습·퀴즈
import { DOMAINS, LANGS } from './config.js';
import { geminiGenerate, geminiParts } from './engines.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LS = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem('tyd_' + k)) ?? d; } catch { return d; } },
  set: (k, v) => localStorage.setItem('tyd_' + k, JSON.stringify(v)),
};
const today = () => new Date().toLocaleDateString('sv-SE');
let ctx = { key: () => '', domain: () => 'general' };
const learn = () => LS.get('learnLang', 'en');
const L = () => LANGS[learn()];
const LEVEL_NAME = { beginner: '초급', intermediate: '중급', advanced: '고급' };
const ai = (sys, text) => geminiGenerate(ctx.key(), sys, text, { json: true }).then(r => JSON.parse(r.replace(/^```json|```$/g, '').trim()));
// 읽기 표기 안내 (언어별)
const READING = { en: 'IPA', zh: 'pinyin with tones', ja: 'hiragana reading + romaji', ru: 'stress-marked Cyrillic + romanization', es: 'syllables with stressed syllable', vi: 'tone names', fr: 'IPA', de: 'IPA', th: 'romanization with tones' };

// ---------- 음성 ----------
let voices = [];
const loadVoices = () => { voices = speechSynthesis.getVoices(); };
speechSynthesis.addEventListener?.('voiceschanged', loadVoices); loadVoices();
export function say(text, rate = 1, lang) {
  lang = lang || L().bcp;
  return new Promise(res => {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = lang; u.rate = rate;
    const n = l => l.replace('_', '-');
    const v = voices.find(v => n(v.lang) === lang && /google/i.test(v.name)) || voices.find(v => n(v.lang).startsWith(lang.slice(0, 2)));
    if (v) u.voice = v;
    u.onend = u.onerror = res; speechSynthesis.speak(u);
    setTimeout(res, 3000 + text.length * 220);
  });
}
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
        res({ blob, b64, mime: this.mime, sec: (performance.now() - this.t0) / 1000, url: URL.createObjectURL(blob) });
      };
      this.mr.stop();
    });
  }
}
export function listenOnce(lang) {
  return new Promise((res, rej) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return rej(new Error('Chrome에서 열어주세요 (음성인식 미지원).'));
    const r = new SR(); r.lang = lang; r.interimResults = false;
    let txt = ''; r.onresult = e => { txt = [...e.results].map(x => x[0].transcript).join(' '); };
    r.onerror = e => rej(new Error(e.error === 'no-speech' ? '말소리가 들리지 않았어요.' : e.error === 'not-allowed' ? '마이크 권한을 허용해주세요.' : e.error));
    r.onend = () => res(txt.trim()); r.start();
  });
}

// ---------- 발음 코칭 ----------
const coachSys = () => `You are an expert ${L().native} pronunciation coach for a Korean adult learner.
You receive an audio recording and the TARGET text in ${L().native}. Listen carefully to the actual audio.
Return ONLY JSON:
{"heard":"what the learner actually said (faithful, including mistakes)",
 "accuracy":0-100,"pronunciation":0-100,"fluency":0-100,"stress_intonation":0-100,"overall":0-100,
 "speed_comment":"Korean: speed feedback vs natural native conversational speed",
 "word_issues":[{"word":"...","problem":"Korean explanation of the error typical for Korean speakers","tip":"Korean mouth/tongue/tone tip"}],
 "stress_tip":"Korean: stress / tone / intonation / linking guidance specific to ${L().native}",
 "stressed_text":"target with STRESSED parts in CAPS (or tone marks for tonal languages), ↗/↘ for intonation, | for pauses",
 "praise":"Korean one-line encouragement","next":"Korean: single most important next practice"}
Be honest and specific. If audio is silent or unrelated, overall=0.`;
async function coach(target, rec) {
  const units = /^(zh|ja|th)$/.test(learn()) ? target.replace(/\s/g, '').length : target.trim().split(/\s+/).length;
  const rate = Math.round(units / Math.max(rec.sec - 0.6, 0.5) * 60);
  const unitName = /^(zh|ja|th)$/.test(learn()) ? '글자/분' : 'WPM';
  const raw = await geminiParts(ctx.key(), coachSys(), [
    { text: `TARGET (${L().native}): "${target}"\nRecording ${rec.sec.toFixed(1)}s, approx ${rate} ${unitName}.` },
    { inlineData: { mimeType: rec.mime, data: rec.b64 } }], { json: true });
  const j = JSON.parse(raw); j.rate = rate; j.unit = unitName; return j;
}
const bar = (label, v) => `<div class="score"><span>${label}</span><div class="barBg"><div class="barFg" style="width:${v}%;background:${v >= 85 ? '#22c55e' : v >= 65 ? '#f59e0b' : '#ef4444'}"></div></div><b>${v}</b></div>`;
function coachHTML(j, target, myUrl) {
  return `<div class="coach"><div class="big">${j.overall}<small>점</small></div>
   ${bar('정확도', j.accuracy)}${bar('발음', j.pronunciation)}${bar('유창성', j.fluency)}${bar('강세·억양', j.stress_intonation)}
   <p>🕐 속도 <b>${j.rate} ${j.unit}</b> — ${esc(j.speed_comment)}</p>
   <p>👂 들린 말: <i>${esc(j.heard)}</i></p>
   ${j.word_issues?.length ? '<h4>🔤 교정할 부분</h4><ul>' + j.word_issues.map(w => `<li><b>${esc(w.word)}</b> — ${esc(w.problem)}<br><span class="note">💡 ${esc(w.tip)}</span> <button class="mini" data-say="${esc(w.word)}">🔊</button></li>`).join('') + '</ul>' : ''}
   <h4>🎵 강약·억양</h4><p class="stressed">${esc(j.stressed_text)}</p><p>${esc(j.stress_tip)}</p>
   <p>👍 ${esc(j.praise)}</p><p>🎯 다음 연습: ${esc(j.next)}</p>
   <div class="row"><button class="btn gray" data-play="${myUrl}">🎧 내 목소리</button><button class="btn gray" data-say="${esc(target)}">🔊 원어민</button><button class="btn gray" data-say="${esc(target)}" data-rate="0.7">🐢 천천히</button></div></div>`;
}
function bindSay(root) {
  root.querySelectorAll('[data-say]').forEach(b => b.onclick = () => say(b.dataset.say, Number(b.dataset.rate || 1)));
  root.querySelectorAll('[data-play]').forEach(b => b.onclick = () => new Audio(b.dataset.play).play());
  root.querySelectorAll('[data-star]').forEach(b => { const it = JSON.parse(b.dataset.star); b.textContent = inBook(it.t) ? '⭐' : '☆'; b.onclick = () => { toggleBook(it); b.textContent = inBook(it.t) ? '⭐' : '☆'; }; });
}
const star = (t, k, r) => `<button class="mini" data-star="${esc(JSON.stringify({ t, k, r: r || '' }))}">☆</button>`;
function logStat(score) { const st = LS.get('stats', {}); const d = st[today()] || { n: 0, sum: 0 }; d.n++; d.sum += score; st[today()] = d; LS.set('stats', st); }

// 공용: 듣기 → 따라 말하기 → 평가 (+쉐도잉 3회 반복 듣기)
function drillCard(el, target, ko, reading) {
  el.innerHTML = `<div class="drill"><p class="target">${esc(target)} ${star(target, ko, reading)}</p>${reading ? `<p class="note">${esc(reading)}</p>` : ''}${ko ? `<p class="note">${esc(ko)}</p>` : ''}
   <div class="row"><button class="btn gray" data-say="${esc(target)}" data-rate="0.7">🐢</button><button class="btn gray" data-say="${esc(target)}">🔊 듣기</button><button class="btn gray" data-shadow>🔁 쉐도잉</button><button class="btn red" data-rec>🎙 따라 말하기</button></div>
   <div data-result></div></div>`;
  bindSay(el);
  el.querySelector('[data-shadow]').onclick = async () => { for (const r of [0.7, 0.85, 1]) { await say(target, r); await new Promise(x => setTimeout(x, 1500 + target.length * 60)); } };
  const btn = el.querySelector('[data-rec]'), out = el.querySelector('[data-result]');
  let rec = null;
  btn.onclick = async () => {
    if (!rec) {
      try { speechSynthesis.cancel(); rec = new Recorder(); await rec.start(); btn.textContent = '⏹ 완료'; btn.classList.add('pulse'); out.innerHTML = '<p class="note">말씀하세요… 끝나면 ⏹</p>'; }
      catch (e) { rec = null; out.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
    } else {
      btn.disabled = true; btn.textContent = '분석 중…'; btn.classList.remove('pulse');
      const r = await rec.stop(); rec = null;
      try { const j = await coach(target, r); out.innerHTML = coachHTML(j, target, r.url); bindSay(out); logStat(j.overall); if (j.overall < 70) toggleBook({ t: target, k: ko || '', r: reading || '' }, true); }
      catch (e) { out.innerHTML = `<p class="err">⚠️ ${esc(e.message)}</p>`; }
      btn.disabled = false; btn.textContent = '🎙 다시';
    }
  };
}

// ---------- 단어 목록 / 문장 목록 렌더 공용 ----------
function wordsHTML(items) {
  return items.map((w, i) => `<div class="wcard" data-i="${i}"><div class="wtop"><b>${esc(w.word)}</b> <span class="note">${esc(w.reading)} · ${esc(w.ko_sound)}</span><button class="mini" data-say="${esc(w.word)}">🔊</button>${star(w.word, w.ko, w.reading)}</div>
    <div>${esc(w.ko)} ${w.stress ? `<span class="note">강세/성조: ${esc(w.stress)}</span>` : ''}</div>
    <div class="note">“${esc(w.example)}” — ${esc(w.example_ko)} <button class="mini" data-say="${esc(w.example)}">🔊</button></div><div data-drill></div></div>`).join('');
}
function bindWords(el, items) {
  bindSay(el);
  el.querySelectorAll('.wcard').forEach(c => c.querySelector('b').onclick = () => { const w = items[c.dataset.i]; drillCard(c.querySelector('[data-drill]'), w.word, w.ko, w.reading); });
}
function sentencesHTML(items) { return items.map((s, i) => `<div class="wcard"><div class="note">🗨 ${esc(s.situation)}${s.point ? ' · ' + esc(s.point) : ''}</div><div data-drill="${i}"></div></div>`).join(''); }
function bindSentences(el, items) { el.querySelectorAll('[data-drill]').forEach(d => { const s = items[d.dataset.drill]; drillCard(d, s.text, s.ko, s.reading); }); }
const WORD_SCHEMA = () => `{"items":[{"word":"in ${L().native}","reading":"${READING[learn()] || 'pronunciation'}","ko":"한국어 뜻","ko_sound":"한글 발음 근사","stress":"stressed syllable or tones","example":"short natural example in ${L().native}","example_ko":"예문 해석"}]}`;
const SENT_SCHEMA = () => `{"items":[{"text":"sentence in ${L().native}","reading":"${learn() === 'en' ? '' : READING[learn()] || ''}","ko":"한국어 뜻","situation":"언제 쓰는지(한국어)","point":"표현·문법 포인트(한국어 1줄)"}]}`;

// ---------- 오늘의 단어 / 문장 ----------
async function daily(kind) {
  const dom = ctx.domain(), k = `daily_${learn()}_${kind}_${today()}_${dom}`;
  const c = LS.get(k, null); if (c) return c;
  const lv = LS.get('level', 'intermediate'), field = DOMAINS[dom].prompt;
  const sys = kind === 'words'
    ? `Create today's 8 useful ${L().native} words/phrases for a Korean professional (${lv}). Context: ${field} 5 field-specific + 3 everyday. Return ONLY JSON: ${WORD_SCHEMA()}`
    : `Create today's 5 natural spoken ${L().native} sentences a Korean professional would say to a foreign client (${lv}). Context: ${field} Return ONLY JSON: ${SENT_SCHEMA()}`;
  const data = (await ai(sys, `Date seed ${today()} ${kind} ${dom}. Avoid very basic items.`)).items;
  LS.set(k, data); return data;
}
async function renderDaily(el, kind) {
  el.innerHTML = '<p class="note">준비 중…</p>';
  try {
    const items = await daily(kind);
    el.innerHTML = `<p class="note">📅 ${today()} · ${L().name} · ${DOMAINS[ctx.domain()].label} ${kind === 'words' ? '· 단어를 누르면 따라 말하기' : ''} <button class="mini" id="dlNew">🔄 새로</button></p>` + (kind === 'words' ? wordsHTML(items) : sentencesHTML(items));
    kind === 'words' ? bindWords(el, items) : bindSentences(el, items);
    $('dlNew').onclick = () => { localStorage.removeItem(`tyd_daily_${learn()}_${kind}_${today()}_${ctx.domain()}`); renderDaily(el, kind); };
  } catch (e) { el.innerHTML = `<p class="err">⚠️ ${esc(e.message)}</p>`; }
}

// ---------- 📖 단계별 코스 (초·중·고·대·비즈니스·생활필수) ----------
export const COURSES = {
  elem: { t: '🎒 초등', d: '초등 교육과정 수준 기초 어휘·문장 (가족, 학교, 동물, 음식, 숫자, 감정 등)' },
  middle: { t: '📘 중등', d: '중학교 교육과정 필수 어휘·기본 문법 문장' },
  high: { t: '📗 고등', d: '고등학교·수능 수준 어휘와 독해 핵심 문장' },
  univ: { t: '🎓 대학', d: '대학 교양·학술 어휘, 발표·토론·논문 표현' },
  biz: { t: '💼 비즈니스', d: '회의, 이메일, 협상, 전화, 프레젠테이션, 계약 표현' },
  life: { t: '🏠 생활필수', d: '여행, 쇼핑, 병원, 은행, 교통, 식당, 긴급상황 생존 표현' },
};
async function lesson(course, n, kind) {
  const k = `course_${learn()}_${course}_${n}_${kind}`; const c = LS.get(k, null); if (c) return c;
  const sys = `You design a progressive ${L().native} curriculum for Korean learners. Course: ${COURSES[course].d}.
This is lesson ${n} of 100 (difficulty increases gradually; each lesson has one clear topic, no repetition of earlier lessons' topics).
Return ONLY JSON: {"title":"Korean lesson title (topic)",${kind === 'words' ? WORD_SCHEMA().slice(1, -1).replace('"items":[', '"items":[') : SENT_SCHEMA().slice(1, -1)}} with ${kind === 'words' ? 10 : 6} items.`;
  const d = await ai(sys, `Course ${course}, lesson ${n}, ${kind}.`); LS.set(k, d); return d;
}
function renderCourse(el) {
  const prog = LS.get('courseProg', {});
  el.innerHTML = `<p class="note">${L().name} · 단계를 고르세요 (각 100과, 진도 자동 저장)</p>
   <div class="grid">${Object.entries(COURSES).map(([k, v]) => `<button class="gcard" data-c="${k}"><b>${v.t}</b><small>${esc(v.d.split('(')[0])}</small><small>진도 ${prog[learn() + k] || 1}/100</small></button>`).join('')}</div><div id="crBody"></div>`;
  el.querySelectorAll('[data-c]').forEach(b => b.onclick = () => openLesson(b.dataset.c));
}
async function openLesson(course, kind = 'words') {
  const prog = LS.get('courseProg', {}), pk = learn() + course; const n = prog[pk] || 1;
  const body = $('prBody');
  body.innerHTML = `<div class="lessonNav"><button class="mini" id="lsBack">← 코스</button><button class="mini" id="lsPrev">◀</button><b>${COURSES[course].t} ${n}과</b><button class="mini" id="lsNext">▶</button></div>
   <div class="tabs sub"><button data-k="words" class="${kind === 'words' ? 'on' : ''}">단어</button><button data-k="sentences" class="${kind === 'sentences' ? 'on' : ''}">문장</button><button data-k="quiz">퀴즈</button></div><div id="lsBody"><p class="note">수업 준비 중…</p></div>`;
  $('lsBack').onclick = () => renderCourse(body);
  const mv = d => { prog[pk] = Math.min(100, Math.max(1, n + d)); LS.set('courseProg', prog); openLesson(course, kind); };
  $('lsPrev').onclick = () => mv(-1); $('lsNext').onclick = () => mv(1);
  body.querySelectorAll('.tabs.sub button').forEach(b => b.onclick = async () => {
    if (b.dataset.k === 'quiz') { const d = await lesson(course, n, 'words'); return quiz($('lsBody'), d.items.map(w => ({ t: w.word, k: w.ko, r: w.reading })), () => mv(1)); }
    openLesson(course, b.dataset.k);
  });
  try {
    const d = await lesson(course, n, kind);
    $('lsBody').innerHTML = `<h4>📌 ${esc(d.title)}</h4>` + (kind === 'words' ? wordsHTML(d.items) : sentencesHTML(d.items)) + `<div class="row"><button class="btn green" id="lsDone">✅ 이 과 완료 → 다음 과</button></div>`;
    kind === 'words' ? bindWords($('lsBody'), d.items) : bindSentences($('lsBody'), d.items);
    $('lsDone').onclick = () => mv(1);
  } catch (e) { $('lsBody').innerHTML = `<p class="err">⚠️ ${esc(e.message)}</p>`; }
}

// ---------- ⭐ 단어장 + 간격반복 복습 + 퀴즈 ----------
const INTERVAL = [0, 1, 2, 4, 7, 15, 30]; // 일
const book = () => LS.get('book', []);
const inBook = t => book().some(b => b.t === t && b.lang === learn());
function toggleBook(it, onlyAdd) {
  const b = book(); const i = b.findIndex(x => x.t === it.t && x.lang === learn());
  if (i >= 0) { if (onlyAdd) { b[i].box = 0; b[i].due = today(); } else b.splice(i, 1); }
  else b.unshift({ ...it, lang: learn(), box: 0, due: today(), added: today() });
  LS.set('book', b);
}
function renderBook(el) {
  const all = book().filter(b => b.lang === learn()); const due = all.filter(b => b.due <= today());
  el.innerHTML = `<p>⭐ ${L().name} 단어장 <b>${all.length}</b>개 · 오늘 복습 <b>${due.length}</b>개</p>
   <p class="note">☆ 를 누르거나, 발음 70점 미만이면 자동으로 추가됩니다. 맞히면 1→2→4→7→15→30일 뒤 다시 나와요.</p>
   <div class="row"><button class="btn" id="bkRev">🃏 카드 복습 (${due.length})</button><button class="btn gray" id="bkQuiz">❓ 퀴즈</button><button class="btn gray" id="bkListen">🎧 연속 듣기</button></div>
   <div id="bkBody">${all.map(b => `<div class="hist"><div><b>${esc(b.t)}</b> <span class="note">${esc(b.r)}</span><br><small>${esc(b.k)} · ${b.box}단계 · 다음 ${b.due}</small></div><div><button class="mini" data-say="${esc(b.t)}">🔊</button>${star(b.t, b.k, b.r)}</div></div>`).join('') || '<p class="note">아직 비어있어요.</p>'}</div>`;
  bindSay(el);
  $('bkRev').onclick = () => review($('bkBody'), due);
  $('bkQuiz').onclick = () => all.length >= 4 ? quiz($('bkBody'), all.slice(0, 20)) : alert('퀴즈는 4개 이상 필요해요.');
  $('bkListen').onclick = async () => { for (const b of all.slice(0, 30)) { await say(b.t, 0.9); await say(b.k, 1, 'ko-KR'); } };
}
function review(el, list) {
  if (!list.length) { el.innerHTML = '<p>🎉 오늘 복습 끝!</p>'; return; }
  let i = 0;
  const show = flip => {
    if (i >= list.length) { el.innerHTML = '<p>🎉 오늘 복습 완료!</p>'; return; }
    const c = list[i];
    el.innerHTML = `<div class="flash"><p class="note">${i + 1}/${list.length}</p><div class="fq">${esc(c.t)}</div>${flip ? `<div class="note">${esc(c.r)}</div><div class="fa">${esc(c.k)}</div>` : ''}
     <div class="row">${flip ? `<button class="btn red" id="fN">😵 몰랐음</button><button class="btn green" id="fY">😀 알았음</button>` : `<button class="btn gray" data-say="${esc(c.t)}">🔊</button><button class="btn" id="fF">뜻 보기</button>`}</div></div>`;
    bindSay(el); say(c.t);
    if (!flip) $('fF').onclick = () => show(true);
    else {
      const grade = ok => { const b = book(); const x = b.find(y => y.t === c.t && y.lang === c.lang); if (x) { x.box = ok ? Math.min(6, x.box + 1) : 0; const d = new Date(); d.setDate(d.getDate() + INTERVAL[x.box] || 1); x.due = ok ? d.toLocaleDateString('sv-SE') : today(); LS.set('book', b); } logStat(ok ? 100 : 40); i++; show(false); };
      $('fY').onclick = () => grade(true); $('fN').onclick = () => grade(false);
    }
  };
  show(false);
}
function quiz(el, pool, onDone) {
  const qs = [...pool].sort(() => Math.random() - 0.5).slice(0, 10); let i = 0, ok = 0;
  const next = () => {
    if (i >= qs.length) { el.innerHTML = `<div class="flash"><div class="fq">${ok}/${qs.length}</div><p>${ok / qs.length >= 0.8 ? '🎉 훌륭해요!' : '💪 틀린 단어는 단어장에 넣었어요'}</p>${onDone ? '<div class="row"><button class="btn green" id="qzN">다음 과로</button></div>' : ''}</div>`; if (onDone) $('qzN').onclick = onDone; logStat(Math.round(ok / qs.length * 100)); return; }
    const q = qs[i], mode = i % 2; // 0: 외국어→뜻, 1: 듣고→뜻
    const opts = [q, ...pool.filter(p => p.t !== q.t).sort(() => Math.random() - 0.5).slice(0, 3)].sort(() => Math.random() - 0.5);
    el.innerHTML = `<div class="flash"><p class="note">${i + 1}/${qs.length} · ${mode ? '🎧 듣고 뜻 고르기' : '뜻 고르기'}</p><div class="fq">${mode ? `<button class="btn gray" data-say="${esc(q.t)}">🔊 다시 듣기</button>` : esc(q.t)}</div>
     <div class="opts">${opts.map(o => `<button class="btn gray" data-o="${esc(o.t)}">${esc(o.k)}</button>`).join('')}</div></div>`;
    bindSay(el); if (mode) say(q.t);
    el.querySelectorAll('[data-o]').forEach(b => b.onclick = () => {
      const right = b.dataset.o === q.t; if (right) ok++; else toggleBook(q, true);
      b.style.background = right ? '#16a34a' : '#dc2626';
      el.querySelector(`[data-o="${CSS.escape(q.t)}"]`).style.background = '#16a34a';
      setTimeout(() => { i++; next(); }, right ? 600 : 1500);
    });
  };
  next();
}

// ---------- ✨ 한→외국어 만들기 ----------
function renderMake(el) {
  el.innerHTML = `<p>하고 싶은 말을 <b>한국어로</b> 말하거나 적으세요. ${L().name} 문장 3가지로 만들어 드립니다.</p>
   <textarea id="mkKo" rows="3" placeholder="예) 오늘 운동은 하루에 세 번, 10회씩 해주세요"></textarea>
   <div class="row"><button class="btn gray" id="mkMic">🎙 한국어로 말하기</button><button class="btn" id="mkGo">✨ ${L().name}로 만들기</button></div><div id="mkOut"></div>
   <h4>📝 내가 만든 문장</h4><div id="mkHist"></div>`;
  const hist = () => { $('mkHist').innerHTML = LS.get('myPhrases', []).filter(p => (p.lang || 'en') === learn()).slice(0, 20).map(p => `<div class="hist"><div><b>${esc(p.en)}</b><br><small>${esc(p.ko)}</small></div><button class="mini" data-say="${esc(p.en)}">🔊</button></div>`).join('') || '<p class="note">-</p>'; bindSay($('mkHist')); };
  hist();
  $('mkMic').onclick = async () => { $('mkMic').textContent = '듣는 중…'; try { $('mkKo').value = await listenOnce('ko-KR'); if ($('mkKo').value) $('mkGo').click(); } catch (e) { alert(e.message); } $('mkMic').textContent = '🎙 한국어로 말하기'; };
  $('mkGo').onclick = async () => {
    const ko = $('mkKo').value.trim(); if (!ko) return;
    $('mkOut').innerHTML = '<p class="note">만드는 중…</p>';
    try {
      const j = await ai(`Convert the Korean into natural spoken ${L().native} for a Korean professional. Context: ${DOMAINS[ctx.domain()].prompt}
Return ONLY JSON: {"options":[{"style":"정중(고객용)","text":"...","reading":"${learn() === 'en' ? '' : READING[learn()]}"},{"style":"자연스러운 일상","text":"...","reading":""},{"style":"쉽고 짧게","text":"...","reading":""}],"key_expressions":[{"text":"...","ko":"..."}],"note":"Korean nuance/culture tip"}`, ko);
      $('mkOut').innerHTML = j.options.map((o, i) => `<div class="wcard"><div class="note">${esc(o.style)}</div><div data-d="${i}"></div></div>`).join('') +
        (j.key_expressions?.length ? '<h4>핵심 표현</h4><ul>' + j.key_expressions.map(x => `<li><b>${esc(x.text)}</b> — ${esc(x.ko)} <button class="mini" data-say="${esc(x.text)}">🔊</button>${star(x.text, x.ko)}</li>`).join('') + '</ul>' : '') + `<p class="note">💡 ${esc(j.note)}</p>`;
      $('mkOut').querySelectorAll('[data-d]').forEach(d => { const o = j.options[d.dataset.d]; drillCard(d, o.text, ko, o.reading); });
      bindSay($('mkOut'));
      const h = LS.get('myPhrases', []); h.unshift({ ko, en: j.options[0].text, lang: learn(), at: Date.now() }); LS.set('myPhrases', h.slice(0, 200)); hist();
    } catch (e) { $('mkOut').innerHTML = `<p class="err">⚠️ ${esc(e.message)}</p>`; }
  };
}

// ---------- 📞 전화회화 (AI 롤플레이) ----------
const SCENES = {
  free: { t: '☕ 자유 대화', s: 'a friendly native tutor making casual small talk' },
  pt: { t: '🩺 외국인 환자 초진', s: 'a foreign patient at a Korean physical therapy clinic with lower back pain; the learner is the therapist' },
  lecture: { t: '🎓 외국인 학생 수업', s: "an international student asking questions after the learner's physical therapy lecture" },
  ins: { t: '🛡 보험 상담', s: 'a foreign resident in Korea asking about health/life insurance; the learner is the insurance planner' },
  tax: { t: '💼 세무·상속 상담', s: 'a foreign client asking about Korean inheritance/gift tax and bookkeeping; the learner is the consultant' },
  biz: { t: '🤝 비즈니스 미팅', s: 'a foreign business partner in a first meeting' },
  travel: { t: '✈️ 여행·생활', s: 'a hotel/restaurant/airport staff member abroad; the learner is the traveler' },
  interview: { t: '🎤 면접·발표', s: 'an interviewer at an international conference or job interview' },
};
let call = null;
function renderCall(el) {
  el.innerHTML = `<p>AI와 <b>${L().name}로 계속 대화</b>합니다. 틀린 표현은 매 턴 한국어로 고쳐드려요. 막히면 한국어로 말해도 ${L().name}로 알려줘요.</p>
   <label class="note">상황</label><select id="clScene">${Object.entries(SCENES).map(([k, v]) => `<option value="${k}">${v.t}</option>`).join('')}</select>
   <div class="row"><label class="note"><input type="checkbox" id="clSub" checked style="width:auto"> 한국어 자막</label>
   <label class="note">속도 <select id="clRate" class="inline">${[0.75, 0.9, 1, 1.1].map(r => `<option ${r == LS.get('callRate', 0.9) ? 'selected' : ''}>${r}</option>`).join('')}</select></label></div>
   <div class="row"><button class="btn green" id="clStart">📞 전화 시작</button><button class="btn red hidden" id="clEnd">📴 종료·피드백</button></div>
   <div id="clStatus" class="statusBar"></div><div id="clLog" class="log callLog"></div>`;
  $('clRate').onchange = e => LS.set('callRate', Number(e.target.value));
  $('clStart').onclick = startCall; $('clEnd').onclick = endCall;
}
async function startCall() {
  call = { sc: SCENES[$('clScene').value], hist: [], on: true, t0: Date.now() };
  $('clStart').classList.add('hidden'); $('clEnd').classList.remove('hidden'); $('clLog').innerHTML = '';
  try { await callTurn('(The call just connected. Greet and open the conversation in one or two short sentences.)'); callLoop(); } catch (e) { setCS('⚠️ ' + e.message); }
}
const callSys = () => `Role-play phone ${L().native} lesson. You are ${call.sc.s}. Learner level: ${LS.get('level', 'intermediate')}.
Speak ONLY ${L().native}, naturally, SHORT turns (1-3 sentences), ask one question at a time.
If the learner speaks Korean, it means they are stuck: put the ${L().native} way to say it in "better" and continue.
Return ONLY JSON: {"reply":"your ${L().native} reply","reply_ko":"Korean translation of reply","correction":"Korean explanation of learner's errors or empty","better":"more natural ${L().native} version of learner's line or empty","hint_ko":"Korean hint for what to answer next"}`;
async function callTurn(userText) {
  if (!userText.startsWith('(')) addLine('me', userText);
  const convo = call.hist.map(h => `${h.r === 'me' ? 'Learner' : 'You'}: ${h.t}`).join('\n') + `\nLearner: ${userText}`;
  setCS('💭 생각 중…');
  const j = await ai(callSys(), convo);
  call.hist.push({ r: 'me', t: userText }, { r: 'ai', t: j.reply });
  addLine('ai', j.reply, j);
  setCS('🔊 듣는 중…'); await say(j.reply, Number(LS.get('callRate', 0.9)));
}
async function callLoop() {
  let fails = 0;
  while (call?.on) {
    setCS(`🎙 ${L().name}로 말하세요…`);
    let t = '';
    try { t = await listenOnce(L().bcp); } catch (e) { if (!/들리지/.test(e.message)) { setCS('⚠️ ' + e.message); break; } }
    if (!call?.on) break;
    if (!t) { if (++fails >= 4) { setCS('⏸ 대기 중 — 말하려면 아래 🎙'); break; } continue; }
    fails = 0;
    try { await callTurn(t); } catch (e) { setCS('⚠️ ' + e.message); break; }
  }
  if (call?.on && $('clLog')) { const b = document.createElement('button'); b.className = 'btn'; b.textContent = '🎙 이어서 말하기'; b.onclick = () => { b.remove(); callLoop(); }; $('clLog').appendChild(b); }
}
function addLine(who, text, j) {
  const d = document.createElement('div'); d.className = 'bub ' + (who === 'me' ? 'me' : 'partner');
  const sub = $('clSub')?.checked;
  d.innerHTML = `<div class="dst">${esc(text)}</div>` + (j ? `${sub ? `<div class="note">${esc(j.reply_ko)}</div>` : ''}<button class="mini" data-say="${esc(text)}">🔊</button>
    ${j.correction || j.better ? `<div class="corr">✏️ ${esc(j.correction)}${j.better ? `<br>👉 <b>${esc(j.better)}</b> <button class="mini" data-say="${esc(j.better)}">🔊</button>${star(j.better, '')}` : ''}</div>` : ''}
    ${j.hint_ko ? `<div class="note">💡 ${esc(j.hint_ko)}</div>` : ''}` : '');
  $('clLog').appendChild(d); bindSay(d); $('clLog').scrollTop = 1e9;
}
const setCS = t => { if ($('clStatus')) $('clStatus').textContent = t; };
async function endCall() {
  if (!call) return; call.on = false; speechSynthesis.cancel();
  $('clStart').classList.remove('hidden'); $('clEnd').classList.add('hidden');
  const mine = call.hist.filter(h => h.r === 'me' && !h.t.startsWith('('));
  if (!mine.length) { setCS('통화 종료'); return; }
  setCS('📊 피드백 작성 중…');
  try {
    const j = await ai(`Review a Korean learner's ${L().native} phone lesson. Return ONLY JSON:
{"score":0-100,"good":["잘한 점 (Korean)"],"fix":[{"said":"...","better":"...","why":"Korean"}],"expressions":[{"text":"useful ${L().native} expression for next time","ko":"뜻"}],"summary":"Korean 2 lines"}`,
      call.hist.map(h => `${h.r === 'me' ? 'Learner' : 'Tutor'}: ${h.t}`).join('\n'));
    const min = Math.max(1, Math.round((Date.now() - call.t0) / 60000));
    const d = document.createElement('div'); d.className = 'wcard';
    d.innerHTML = `<h4>📊 통화 피드백 ${j.score}점 · ${min}분</h4><p>${esc(j.summary)}</p><b>👍 잘한 점</b><ul>${(j.good || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      <b>✏️ 고칠 표현</b><ul>${(j.fix || []).map(f => `<li>${esc(f.said)} → <b>${esc(f.better)}</b> <button class="mini" data-say="${esc(f.better)}">🔊</button>${star(f.better, f.why)}<br><span class="note">${esc(f.why)}</span></li>`).join('')}</ul>
      <b>📌 다음에 써볼 표현</b><ul>${(j.expressions || []).map(x => `<li>${esc(x.text)} — ${esc(x.ko)} <button class="mini" data-say="${esc(x.text)}">🔊</button>${star(x.text, x.ko)}</li>`).join('')}</ul>`;
    $('clLog').appendChild(d); bindSay(d); $('clLog').scrollTop = 1e9; setCS('통화 종료'); logStat(j.score);
    const cl = LS.get('callLog', []); cl.unshift({ at: Date.now(), lang: learn(), scene: call.sc.t, score: j.score, min }); LS.set('callLog', cl.slice(0, 100));
  } catch (e) { setCS('⚠️ ' + e.message); }
}

// ---------- 화면 ----------
const TABS = {
  words: ['📚 오늘 단어', el => renderDaily(el, 'words')], sentences: ['🗨 오늘 문장', el => renderDaily(el, 'sentences')],
  course: ['📖 단계별 코스', renderCourse], make: ['✨ 한→외 만들기', renderMake], call: ['📞 전화회화', renderCall], book: ['⭐ 단어장·복습', renderBook],
};
export function openPractice(c, startTab = 'words') {
  ctx = c;
  const st = LS.get('stats', {}); const d = st[today()];
  const streak = (() => { let n = 0; const x = new Date(); if (!st[today()]) x.setDate(x.getDate() - 1); while (st[x.toLocaleDateString('sv-SE')]) { n++; x.setDate(x.getDate() - 1); } return n; })();
  const due = book().filter(b => b.lang === learn() && b.due <= today()).length;
  $('practice').innerHTML = `<header><div class="brand">🎓 외국어 연습</div><button class="icon" id="prX">✕</button></header>
   <div class="controls"><label>학습 언어<select id="prLang">${Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${k === learn() ? 'selected' : ''}>${v.name} (${v.native})</option>`).join('')}</select></label>
   <label>레벨<select id="prLv">${Object.entries(LEVEL_NAME).map(([k, v]) => `<option value="${k}" ${LS.get('level', 'intermediate') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
   <div class="note pstat">🔥 연속 ${streak}일 · 오늘 ${d ? d.n + '회 · 평균 ' + Math.round(d.sum / d.n) + '점' : '아직 연습 전'} · 📌 복습 대기 ${due}개</div>
   <div class="tabs">${Object.entries(TABS).map(([k, v]) => `<button data-t="${k}">${v[0]}</button>`).join('')}</div>
   <div id="prBody" class="prBody"></div>`;
  $('practice').classList.remove('hidden');
  $('prX').onclick = () => { if (call) call.on = false; speechSynthesis.cancel(); $('practice').classList.add('hidden'); };
  $('prLv').onchange = e => LS.set('level', e.target.value);
  $('prLang').onchange = e => { LS.set('learnLang', e.target.value); openPractice(ctx, cur); };
  let cur = startTab;
  const go = k => { cur = k; if (call) call.on = false; speechSynthesis.cancel(); $('practice').querySelectorAll('.tabs button[data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === k)); TABS[k][1]($('prBody')); };
  $('practice').querySelectorAll('.tabs button[data-t]').forEach(b => b.onclick = () => go(b.dataset.t));
  go(startTab);
}
