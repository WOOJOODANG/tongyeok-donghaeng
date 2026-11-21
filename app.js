import { LANGS, KO, DOMAINS, ENGINES, COST_PER_MIN, QUICK, briefingPrompt, translatePrompt } from './config.js?v=41';
import { openPractice } from './practice.js?v=41';
import { speakOut, unlockAudio, stopSpeaking, voiceInfo, resetVoiceProbe, lastMethod } from './voice.js?v=41';
import { initExtras, openAccount, openClients, openPhoto, openShare, openOffline, shareBriefToColleague, clientName, canUse, plan, PLANS, memoSave, offlineTranslate, isOffline } from './extras.js?v=41';
import { FreeEngine, EcoEngine, PremiumEngine, QuotaError, KeyError, geminiGenerate, openaiChat } from './engines.js?v=41';

const $ = id => document.getElementById(id);
const LS = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem('tyd_' + k)) ?? d; } catch { return d; } },
  set: (k, v) => localStorage.setItem('tyd_' + k, JSON.stringify(v)),
};
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- 상태 ----------
const S = {
  settings: LS.get('settings', { gemini: '', openai: '', limit: 10000, rate: 1.0, realtimeModel: 'gpt-realtime-mini', counselor: '정지훈' }),
  lang: LS.get('lang', 'en'), domain: LS.get('domain', 'general'), engine: LS.get('engine', 'free'),
  turns: [], engineObj: null, running: false, face: false, consented: false, startedAt: 0, client: null,
};
const monthKey = () => new Date().toISOString().slice(0, 7);
const usage = () => LS.get('usage', {})[monthKey()] || 0;
function addUsage(min, eng) {
  const u = LS.get('usage', {}); u[monthKey()] = (u[monthKey()] || 0) + min * COST_PER_MIN[eng]; LS.set('usage', u); renderUsage();
  if (eng !== 'free' && usage() >= S.settings.limit) {
    stopSession(false);
    selectEngine('free', true);
    alertModal('💸 월 사용 한도 도달', `이번 달 추정 사용액이 한도(${S.settings.limit.toLocaleString()}원)에 도달해 <b>무료 모드</b>로 전환했습니다. 설정에서 한도를 바꿀 수 있습니다.`);
  }
}
const hasOpenAI = () => !!S.settings.openai;

// ---------- 렌더 ----------
function init() {
  $('selLang').innerHTML = Object.entries(LANGS).map(([k, v]) => `<option value="${k}">${v.name} (${v.native})</option>`).join('');
  $('selDomain').innerHTML = Object.entries(DOMAINS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  $('selLang').value = S.lang; $('selDomain').value = S.domain;
  $('selLang').onchange = e => { S.lang = e.target.value; LS.set('lang', S.lang); S.consented = false; renderFace(); };
  $('selDomain').onchange = e => { S.domain = e.target.value; LS.set('domain', S.domain); renderQuick(); };
  renderQuick();
  const send = () => { const t = $('typeText').value.trim(); if (!t) return; $('typeText').value = ''; textTurn($('typeWho').value, t); };
  $('typeSend').onclick = send; $('typeText').onkeydown = e => { if (e.key === 'Enter') send(); };
  if (S.engine !== 'free' && !hasOpenAI()) S.engine = 'free';
  renderEngines(); renderUsage(); renderLog();
  $('btnPlay').onclick = () => { unlockAudio(); S.running ? stopSession(true) : startSession(); };
  document.addEventListener('pointerdown', unlockAudio, { once: true });
  $('btnSettings').onclick = openSettings;
  $('btnMenu').onclick = openMenu;
  $('clientChip').onclick = e => { if (e.target.classList.contains('x')) return setClient(null); openClients(() => {}); };
  initExtras({ modal, closeModal, alertModal, key: () => S.settings.gemini, lang: () => S.lang, domain: () => S.domain, speak,
    currentClient: () => S.client, setClient, openSession, startWithClient: () => startSession(), refresh: () => { renderQuick(); renderPlan(); } });
  renderPlan(); whatsNew();
  $('btnHistory').onclick = openHistory;
  $('btnPractice').onclick = () => { if (S.running) stopSession(false); if (!S.settings.gemini) return openSettings(); openPractice({ key: () => S.settings.gemini, domain: () => S.domain }); };
  $('btnBig').onclick = () => { document.body.classList.toggle('big'); LS.set('big', document.body.classList.contains('big')); };
  if (LS.get('big', false)) document.body.classList.add('big');
  $('btnFace').onclick = () => { S.face = !S.face; renderFace(); };
  $('btnBrief').onclick = () => S.turns.length ? makeBriefing() : alertModal('📝 브리핑', '아직 대화 내용이 없습니다. ▶ 로 통역을 시작하세요.');
  $('btnSide').onclick = () => { const e = S.engineObj; if (e instanceof FreeEngine) { e.setSide(e.side === 'ko' ? 'partner' : 'ko'); } };
  if (!S.settings.gemini) setTimeout(openSettings, 300);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
}
function renderEngines() {
  $('engines').innerHTML = Object.entries(ENGINES).map(([k, v]) => {
    const locked = k !== 'free' && !hasOpenAI();
    return `<button class="eng ${S.engine === k ? 'on' : ''} ${locked ? 'locked' : ''}" data-k="${k}">${locked ? '🔒 ' : ''}${v.label}<small>${v.desc}</small></button>`;
  }).join('');
  $('engines').querySelectorAll('.eng').forEach(b => b.onclick = () => selectEngine(b.dataset.k));
  $('btnSide').classList.toggle('hidden', S.engine !== 'free');
}
function selectEngine(k, force) {
  if (S.running && !force) return alertModal('안내', '통역 중에는 엔진을 바꿀 수 없습니다. ■ 로 정지 후 바꿔주세요.');
  if (k !== 'free' && !hasOpenAI()) return paidGuide();
  S.engine = k; LS.set('engine', k); renderEngines();
}
function renderUsage() {
  $('usage').textContent = `이번 달 추정 사용액 ${Math.round(usage()).toLocaleString()}원 / 한도 ${Number(S.settings.limit).toLocaleString()}원`;
}
function bubble(t, forPartner) {
  const pl = LANGS[S.lang];
  // 상대 화면: 상대 언어 텍스트를 크게
  if (forPartner) {
    const main = t.speaker === 'me' ? t.dst : t.src, sub = t.speaker === 'me' ? t.src : t.dst;
    return `<div class="bub ${t.speaker === 'me' ? 'partner' : 'me'}"><div class="src">${esc(sub)}</div><div class="dst">${esc(main)}</div></div>`;
  }
  const main = t.speaker === 'me' ? t.src : t.dst, sub = t.speaker === 'me' ? t.dst : t.src;
  return `<div class="bub ${t.speaker}"><div class="src">${t.speaker === 'me' ? '나 → ' + pl.name : pl.name + ' 원문'}: ${esc(sub)}</div><div class="dst">${esc(main)}</div><button class="mini replay" data-replay="${S.turns.indexOf(t)}">🔊</button></div>`;
}
function renderLog() {
  const pl = LANGS[S.lang];
  $('log').innerHTML = S.turns.length ? S.turns.map(t => bubble(t)).join('') :
    `<div class="empty">▶ 를 누르고 평소처럼 대화하세요.<br>한국어 → ${pl.name} / ${pl.name} → 한국어로<br>자동 통역되어 들립니다.<br><br>■ 를 누를 때까지 계속됩니다.</div>`;
  $('log').scrollTop = 1e9;
  $('log').querySelectorAll('[data-replay]').forEach(b => b.onclick = () => { const t = S.turns[b.dataset.replay]; speak(t.dst, t.speaker === 'me' ? pl.bcp : KO.bcp); });
  $('partnerLog').innerHTML = S.turns.length ? S.turns.map(t => bubble(t, true)).join('') : `<div class="empty">${esc(pl.welcome)}</div>`;
  $('partnerLog').scrollTop = 1e9;
}
// ---------- 공통 번역: 온라인(Gemini/OpenAI) → 실패/오프라인 시 저장된 번역·기기 내장 번역 ----------
async function translateText(fromCode, toCode, text) {
  const from = fromCode === 'ko' ? KO : LANGS[fromCode], to = toCode === 'ko' ? KO : LANGS[toCode];
  if (!isOffline()) {
    try {
      let tr;
      if (S.settings.gemini) tr = await geminiGenerate(S.settings.gemini, translatePrompt(S.domain, from.native, to.native), text);
      else if (hasOpenAI()) tr = await openaiChat(S.settings.openai, translatePrompt(S.domain, from.native, to.native), text);
      else throw new KeyError('⚙️ 설정에서 Gemini 키를 입력하세요.');
      memoSave(fromCode, toCode, text, tr); return tr;
    } catch (e) {
      if (e instanceof KeyError || navigator.onLine) { const off = await offlineTranslate(fromCode, toCode, text); if (off && !(e instanceof KeyError)) return off.text + ' ⓞ'; throw e; }
    }
  }
  const off = await offlineTranslate(fromCode, toCode, text);
  if (off) return off.text + ' ⓞ';
  return '(오프라인 — 번역 불가) ' + text;
}
// ---------- 글 입력 / 자주 쓰는 문구 / 다시 듣기 ----------
function speak(text, bcp) { unlockAudio(); stopSpeaking(); return speakOut(String(text).replace(/ ⓞ$/, ''), bcp, S.settings.rate || 1); }
async function textTurn(who, text) {
  const pl = LANGS[S.lang]; const from = who === 'me' ? KO : pl, to = who === 'me' ? pl : KO;
  try {
    if (!S.settings.gemini && !hasOpenAI() && !isOffline()) return openSettings();
    const tr = await translateText(who === 'me' ? 'ko' : S.lang, who === 'me' ? S.lang : 'ko', text);
    const turn = { speaker: who, src: text, dst: tr, t: Date.now() }; S.turns.push(turn); renderLog(); autosave(); showSub(turn);
    if (!S.running || S.engine === 'free') speak(tr, to.bcp);
  } catch (e) { alertModal('⚠️ 번역 실패', esc(e.message)); }
}
let subT = 0;
function showSub(t) {
  const el = $('bigSub'); const pl = LANGS[S.lang];
  el.innerHTML = `<div class="who">${t.speaker === 'me' ? '나 → ' + esc(pl.name) : esc(pl.name) + ' → 한국어'}</div><div class="txt">${esc(t.dst)}</div><div class="src">${esc(t.src)}</div>`;
  el.className = 'bigSub ' + t.speaker; clearTimeout(subT); subT = setTimeout(() => el.classList.add('hidden'), 12000);
  el.onclick = () => el.classList.add('hidden');
}
function renderQuick() {
  const list = [...LS.get('myQuick', []), ...(QUICK[S.domain] || []), ...(S.domain !== 'general' ? QUICK.general.slice(0, 2) : [])];
  $('quick').innerHTML = list.map(q => `<button class="chip">${esc(q)}</button>`).join('') + '<button class="chip add" id="qAdd">＋</button>';
  $('quick').querySelectorAll('.chip:not(.add)').forEach(b => b.onclick = () => textTurn('me', b.textContent));
  $('qAdd').onclick = () => { const t = prompt('자주 쓰는 문구(한국어)를 입력하세요'); if (t) { const m = LS.get('myQuick', []); m.unshift(t.trim()); LS.set('myQuick', m.slice(0, 20)); renderQuick(); } };
}
function renderFace() {
  $('partnerPane').classList.toggle('hidden', !S.face);
  $('partnerFlag').textContent = LANGS[S.lang].native;
  renderLog();
}
function setStatus(text, state) {
  $('status').textContent = text; $('status').parentElement.className = 'statusBar ' + (state || '');
  $('partnerStatus').textContent = state === 'partner' ? '🎙 …' : state === 'speak' ? '🔊' : '';
}

// ---------- 모달 ----------
function modal(html) { $('modalBox').innerHTML = html; $('modal').classList.remove('hidden'); }
function closeModal() { $('modal').classList.add('hidden'); }
$('modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };
function alertModal(title, body) {
  modal(`<h3>${title}</h3><p>${body}</p><div class="row"><button class="btn" id="mOk">확인</button></div>`);
  $('mOk').onclick = closeModal;
}
function paidGuide() {
  modal(`<h3>🔒 유료 모드 안내</h3>
  <p>절약·프리미엄 모드는 <b>OpenAI 가입과 충전(최소 $5, 약 7천원)</b>이 필요합니다.</p>
  <ol style="line-height:1.8">
   <li>platform.openai.com 가입</li>
   <li>Billing → 결제수단 등록 → $5 충전 (<b>Auto recharge는 OFF</b> 권장)</li>
   <li>API keys → Create new secret key (sk-로 시작)</li>
   <li>이 앱 ⚙️ 설정에 키 입력 → 자동으로 잠금 해제</li>
  </ol>
  <p class="note">자동충전을 끄면 충전한 금액 이상은 절대 청구되지 않습니다. 무료 모드는 계속 사용 가능합니다.</p>
  <div class="row"><button class="btn" id="mGo">가입 페이지 열기</button><button class="btn gray" id="mSet">키 입력</button><button class="btn gray" id="mX">닫기</button></div>`);
  $('mGo').onclick = () => window.open('https://platform.openai.com/settings/organization/billing/overview', '_blank');
  $('mSet').onclick = openSettings; $('mX').onclick = closeModal;
}
function quotaModal() {
  modal(`<h3>💳 OpenAI 잔액 부족</h3><p>잔액이 부족해 유료 통역이 중단되었습니다.<br><b>무료 모드로 전환해 계속할까요?</b></p>
  <div class="row"><button class="btn green" id="mFree">무료 모드로 계속</button><button class="btn gray" id="mCharge">충전하러 가기</button></div>`);
  $('mFree').onclick = () => { closeModal(); selectEngine('free', true); startSession(true); };
  $('mCharge').onclick = () => window.open('https://platform.openai.com/settings/organization/billing/overview', '_blank');
}
function openSettings() {
  const s = S.settings;
  modal(`<h3>⚙️ 설정</h3>
  <div class="field"><label>상담자 이름 (브리핑 문서 표기)</label><input id="sName" value="${esc(s.counselor)}"></div>
  <div class="field"><label>Gemini API 키 (무료 모드, AIza…)</label><input id="sGem" type="password" value="${esc(s.gemini)}" placeholder="AIza..."></div>
  <div class="field"><label>OpenAI API 키 (절약·프리미엄, sk-…) — 비우면 유료 모드 잠금</label><input id="sOai" type="password" value="${esc(s.openai)}" placeholder="sk-..."></div>
  <div class="field"><label>월 사용 한도 (원) — 초과 시 무료 모드 자동 전환</label><input id="sLim" type="number" step="1000" value="${s.limit}"></div>
  <div class="field"><label>말하기 속도</label><select id="sRate">${[0.85, 1.0, 1.15, 1.3].map(r => `<option ${r == s.rate ? 'selected' : ''} value="${r}">${r}x</option>`).join('')}</select></div>
  <div class="field"><label>🔊 통역 음성 출력 방식</label><select id="sTts">
     <option value="auto">자동 (폰 음성 → 안 되면 온라인 음성) — 추천</option>
     <option value="online">온라인 음성 (구글, 인터넷 필요·가장 확실)</option>
     <option value="phone">폰 내장 음성만 (오프라인 가능)</option></select></div>
  <div class="row"><button class="btn green" id="sSnd">🔊 소리 테스트 (한국어+상대 언어)</button></div><div id="sSndMsg" class="testMsg"></div>
  <div class="field"><label>프리미엄 모델</label><select id="sRt">
     <option value="gpt-realtime-mini" ${s.realtimeModel === 'gpt-realtime-mini' ? 'selected' : ''}>gpt-realtime-mini (저렴·추천)</option>
     <option value="gpt-realtime" ${s.realtimeModel === 'gpt-realtime' ? 'selected' : ''}>gpt-realtime (최고 품질·비쌈)</option></select></div>
  <p class="note">🔐 키는 이 기기(브라우저)에만 저장되며 어디에도 전송·업로드되지 않습니다(각 AI 회사 호출 제외).</p>
  <div class="row"><button class="btn" id="sSave">저장</button><button class="btn gray" id="sTest">키 테스트</button><button class="btn gray" id="sX">닫기</button></div>
  <div id="sMsg" class="testMsg"></div>
  <div class="row"><button class="btn gray" id="sReset">이번 달 사용액 초기화</button></div>
  <h4>📒 나만의 용어집 (통역에 항상 적용)</h4>
  <p class="note">한 줄에 하나씩: 한국어 = 원하는 번역 (예: 도수치료 = manual therapy)</p>
  <textarea id="sGlo" rows="4">${esc(LS.get('glossary', []).map(g => g.ko + ' = ' + g.en).join('\n'))}</textarea>
  <h4>💾 백업 / 복원 (폰 교체·초기화 대비)</h4>
  <div class="row"><button class="btn gray" id="sBak">백업 파일 받기</button><button class="btn gray" id="sRes">백업 불러오기</button></div>
  <p class="note">백업에는 기록·단어장·설정이 들어가며 API 키는 제외됩니다.</p>
  <p class="note">버전 v4.1 <button class="mini" id="sUpd">🔄 최신 버전으로 업데이트</button></p>`);
  $('sUpd').onclick = forceUpdate;
  const read = () => ({ counselor: $('sName').value.trim(), gemini: $('sGem').value.trim(), openai: $('sOai').value.trim(),
    limit: Number($('sLim').value) || 0, rate: Number($('sRate').value), realtimeModel: $('sRt').value });
  $('sTts').value = LS.get('ttsMode', 'auto');
  $('sTts').onchange = e => { LS.set('ttsMode', e.target.value); resetVoiceProbe(); };
  $('sSnd').onclick = async () => {
    unlockAudio(); const pl = LANGS[S.lang]; $('sSndMsg').textContent = '🔊 재생 중… 소리가 들리는지 확인하세요';
    const a = await speakOut('안녕하세요. 통역 동행 소리 테스트입니다.', 'ko-KR', 1);
    const b = await speakOut(pl.welcome, pl.bcp, 1);
    const nm = m => m === 'phone' ? '폰 음성 ✅' : m === 'online' ? '온라인 음성 ✅' : '❌ 실패';
    $('sSndMsg').innerHTML = `한국어: ${nm(a)} · ${esc(pl.name)}: ${nm(b)}<br><span class="note">폰 음성: ${esc(voiceInfo(pl.bcp))}</span><br>` +
      (a && b ? '들리셨으면 정상입니다 👍 안 들리면 볼륨(미디어) 버튼을 올리고 무음/방해금지를 꺼주세요.' : '❌ 소리 재생 실패 → 미디어 볼륨, 블루투스 연결, 무음모드를 확인하고 출력 방식을 "온라인 음성"으로 바꿔보세요.');
  };
  $('sBak').onclick = () => {
    const data = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('tyd_') && !k.startsWith('tyd_daily_') && !k.startsWith('tyd_course_')) data[k] = localStorage.getItem(k); }
    const st = JSON.parse(data.tyd_settings || '{}'); delete st.gemini; delete st.openai; data.tyd_settings = JSON.stringify(st);
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })); a.download = `통역동행_백업_${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  $('sRes').onclick = () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.onchange = async () => { try { const d = JSON.parse(await inp.files[0].text()); const keep = S.settings; Object.entries(d).forEach(([k, v]) => k.startsWith('tyd_') && localStorage.setItem(k, v)); const st = JSON.parse(d.tyd_settings || '{}'); LS.set('settings', { ...st, gemini: keep.gemini, openai: keep.openai }); alert('복원 완료! 새로고침합니다.'); location.reload(); } catch { alert('올바른 백업 파일이 아닙니다.'); } };
    inp.click();
  };
  $('sSave').onclick = () => {
    LS.set('glossary', $('sGlo').value.split('\n').map(l => l.split('=')).filter(p => p.length >= 2 && p[0].trim() && p[1].trim()).map(p => ({ ko: p[0].trim(), en: p.slice(1).join('=').trim() })));
    S.settings = read(); LS.set('settings', S.settings); if (S.engine !== 'free' && !hasOpenAI()) S.engine = 'free'; renderEngines(); renderUsage(); closeModal(); };
  $('sX').onclick = closeModal;
  $('sReset').onclick = () => { const u = LS.get('usage', {}); delete u[monthKey()]; LS.set('usage', u); renderUsage(); alert('초기화했습니다.'); };
  $('sTest').onclick = async () => {
    const v = read(); const out = [];
    $('sMsg').textContent = '⏳ 테스트 중… (최대 10초)'; $('sTest').disabled = true;
    if (v.gemini) { try { out.push('Gemini ✅ ' + await geminiGenerate(v.gemini, 'Translate to English. Output only translation.', '안녕하세요') + ' (모델: ' + localStorage.getItem('tyd_geminiModel') + ')'); } catch (e) { out.push('Gemini ❌ ' + e.message); } }
    else out.push('Gemini: 키 없음');
    if (v.openai) { try { await openaiChat(v.openai, 'Reply OK', 'ping'); out.push('OpenAI ✅ 사용 가능(잔액 있음)'); } catch (e) { out.push('OpenAI ❌ ' + e.message + (e.name === 'KeyError' ? ' → 유료 모드를 안 쓰시면 OpenAI 칸을 비워두세요.' : '')); } }
    else out.push('OpenAI: 키 없음 (유료 모드 잠금)');
    $('sMsg').innerHTML = out.map(esc).join('<br>'); $('sTest').disabled = false; $('sMsg').scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
}

function quickLists() { return [LS.get('myQuick', []), ...Object.values(QUICK)]; }
function openMenu() {
  modal(`<h3>☰ 메뉴</h3><div class="menu">
    <button data-m="clients">👤 고객 관리</button><button data-m="photo">📷 사진 번역 (처방전·서류)</button>
    <button data-m="practice">🎓 외국어 연습</button><button data-m="history">🗂 상담 기록</button>
    <button data-m="share">📤 FC·학생에게 공유</button><button data-m="offline">📴 인터넷 없이 통역</button>
    <button data-m="account">⭐ 계정 · 요금제 (${PLANS[plan()].name})</button><button data-m="settings">⚙️ 설정</button>
    <button data-m="news">🆕 새 기능 안내</button><button data-m="update">🔄 최신 버전으로 업데이트</button></div>
    <div class="row"><button class="btn gray" id="mnX">닫기</button></div>`);
  const act = { clients: () => openClients(), photo: () => S.settings.gemini ? openPhoto() : openSettings(), practice: () => $('btnPractice').click(), history: openHistory,
    share: openShare, offline: () => openOffline(quickLists()), account: openAccount, settings: openSettings, news: () => whatsNew(true), update: forceUpdate };
  document.querySelectorAll('[data-m]').forEach(b => b.onclick = () => act[b.dataset.m]());
  $('mnX').onclick = closeModal;
}
function renderPlan() { const p = plan(); $('planBadge').textContent = p === 'free' ? '무료' : PLANS[p].name; $('planBadge').className = 'planBadge ' + p; }
const APP_VER = '4.1';
function whatsNew(force) {
  if (!force && LS.get('seenVer', '') === APP_VER) return;
  LS.set('seenVer', APP_VER);
  setTimeout(() => modal(`<h3>🆕 v${APP_VER} 새 기능</h3><ul class="news">
    <li>🔊 <b>통역 음성 개선</b> — 폰 음성이 안 나오면 자동으로 온라인 음성으로 전환. ⚙️ 설정 → 소리 테스트</li>
    <li>💬 <b>큰 자막</b> — 통역된 말이 화면 아래에 크게 표시됩니다</li>
    <li>📷 <b>사진 번역</b> — 처방전·진단서·보험/세무 서류를 찍으면 번역 + 핵심 항목 + 주의사항</li>
    <li>👤 <b>고객 관리</b> — 상담 시작 시 고객 선택 → 기록·사진·브리핑이 고객별로 모임, 전체 상담 흐름 요약</li>
    <li>📤 <b>FC·학생 공유</b> — 용어집·문구·단어장을 링크로 전달, 브리핑을 개인정보 없이 동료에게 공유</li>
    <li>📴 <b>오프라인 통역</b> — 번역한 문장 자동 저장 + 문구 오프라인 팩, 인터넷 끊기면 자동 전환</li>
    <li>⭐ <b>계정·요금제</b> — 무료/Pro/기관 (현재 테스트 결제, 본인은 소유자 모드로 전부 무제한)</li>
    <li>🔧 Gemini 모델 자동 선택·혼잡 시 자동 재시도, 앱 업데이트 버튼</li></ul>
    <p class="note">왼쪽 위 ☰ 메뉴에서 모두 사용할 수 있어요.</p><div class="row"><button class="btn" id="wnOk">시작하기</button></div>`), force ? 0 : 900);
  setTimeout(() => { const b = $('wnOk'); if (b) b.onclick = closeModal; }, force ? 50 : 1000);
}
async function forceUpdate() {
  try { for (const k of await caches.keys()) await caches.delete(k); for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); } catch {}
  location.replace(location.pathname + '?v=' + Date.now());
}
// ---------- 세션 ----------
async function startSession(skipConsent) {
  unlockAudio();
  if (!S.settings.gemini && S.engine === 'free' && !isOffline()) return openSettings();
  if (isOffline() && S.engine !== 'free') selectEngine('free', true);
  if (!S.consented && !skipConsent) return consentModal();
  const opts = {
    partner: S.lang, domain: S.domain, rate: S.settings.rate, realtimeModel: S.settings.realtimeModel,
    keys: { gemini: S.settings.gemini, openai: S.settings.openai },
    translate: translateText,
    onTurn: t => { S.turns.push(t); renderLog(); autosave(); showSub(t); },
    onStatus: setStatus,
    onInterim: (side, txt) => { $('interim').textContent = txt ? (side === 'ko' ? '나: ' : '상대: ') + txt : ''; },
    onUsage: min => addUsage(min, eng),
    onSpeaking: () => {},
    onError: err => {
      if (err instanceof QuotaError) { stopSession(false); quotaModal(); }
      else if (err instanceof KeyError) { stopSession(false); alertModal('🔑 키 확인 필요', esc(err.message) + '<br>⚙️ 설정에서 확인하세요.'); }
      else setStatus('⚠️ ' + err.message, 'busy');
    },
  };
  const eng = S.engine;
  const E = eng === 'free' ? FreeEngine : eng === 'eco' ? EcoEngine : PremiumEngine;
  if (eng !== 'free' && usage() >= S.settings.limit) { selectEngine('free', true); return alertModal('💸 한도 도달', '월 한도에 도달해 무료 모드로 전환했습니다. 다시 ▶ 를 눌러주세요.'); }
  S.engineObj = new E(opts);
  if (!S.startedAt) S.startedAt = Date.now();
  try {
    await S.engineObj.start();
    S.running = true; $('btnPlay').textContent = '■'; $('btnPlay').classList.add('stop');
    acquireWake();
    if (eng === 'eco') S.ecoT0 = Date.now();
  } catch (e) { S.engineObj = null; opts.onError(e); if (!(e instanceof QuotaError || e instanceof KeyError)) alertModal('⚠️ 시작 실패', esc(e.message)); }
}
function stopSession(ask) {
  S.engineObj?.stop(); S.engineObj = null; S.running = false;
  $('btnPlay').textContent = '▶'; $('btnPlay').classList.remove('stop'); $('interim').textContent = '';
  releaseWake();
  setStatus('정지됨 — 📝 브리핑으로 상담 문서를 만들 수 있습니다', 'idle');
  if (ask && S.turns.length) {
    modal(`<h3>상담을 종료할까요?</h3><p>대화 ${S.turns.length}건이 기록되었습니다.</p>
    <div class="row"><button class="btn" id="mB">📝 브리핑 만들기</button><button class="btn gray" id="mN">새 상담 시작</button><button class="btn gray" id="mC">닫기(이어서)</button></div>`);
    $('mB').onclick = makeBriefing; $('mC').onclick = closeModal;
    $('mN').onclick = () => { newSession(); closeModal(); };
  }
}
function newSession() { S.turns = []; S.startedAt = 0; S.consented = false; S.sessionId = null; S.brief = null; S.clientAsked = false; setClient(null); renderLog(); }
function setClient(c) {
  S.client = c || null;
  if (c?.lang && LANGS[c.lang]) { S.lang = c.lang; $('selLang').value = c.lang; LS.set('lang', c.lang); renderFace(); }
  $('clientChip').innerHTML = c ? `👤 <b>${esc(c.name)}</b> <span class="x">✕</span>` : '👤 고객 선택';
  $('clientChip').classList.toggle('on', !!c);
  if (S.sessionId) autosave();
}
function consentModal() {
  if (!S.client && !S.turns.length && !S.clientAsked && LS.get('askClient', true) && plan() !== 'free') { S.clientAsked = true; return openClients(() => consentModal()); }
  const pl = LANGS[S.lang];
  modal(`<h3>상대방 동의</h3><p class="note">휴대폰을 상대방에게 보여주세요.</p>
  <p class="consent">${esc(pl.consent)}</p>
  <div class="row"><button class="btn green" id="cY">${esc(pl.agree)} ✅</button><button class="btn gray" id="cN">취소</button></div>`);
  $('cY').onclick = () => { S.consented = true; closeModal(); startSession(); };
  $('cN').onclick = closeModal;
}
let wake = null;
async function acquireWake() { try { wake = await navigator.wakeLock?.request('screen'); } catch {} }
function releaseWake() { try { wake?.release(); } catch {} wake = null; }
document.addEventListener('visibilitychange', () => { if (S.running && document.visibilityState === 'visible') acquireWake(); });

// ---------- 기록 저장 ----------
function autosave() {
  const h = LS.get('history', []);
  if (!S.sessionId) S.sessionId = 's' + Date.now();
  const rec = { id: S.sessionId, at: S.startedAt || Date.now(), lang: S.lang, domain: S.domain, turns: S.turns, brief: S.brief || null, clientId: S.client?.id || null };
  const i = h.findIndex(x => x.id === rec.id); if (i >= 0) h[i] = { ...h[i], ...rec }; else h.unshift(rec);
  LS.set('history', h.slice(0, 200));
}
function openSession(id) {
  const r = LS.get('history', []).find(x => x.id === id); if (!r) return;
  if (S.running) stopSession(false);
  S.turns = r.turns; S.lang = r.lang; S.domain = r.domain; S.sessionId = r.id; S.startedAt = r.at; S.brief = r.brief;
  $('selLang').value = r.lang; $('selDomain').value = r.domain; renderFace();
  const c = r.clientId ? JSON.parse(localStorage.getItem('tyd_clients') || '[]').find(x => x.id === r.clientId) : null;
  S.client = c; $('clientChip').innerHTML = c ? `👤 <b>${esc(c.name)}</b> <span class="x">✕</span>` : '👤 고객 선택'; $('clientChip').classList.toggle('on', !!c);
  r.brief ? showBriefing(r.brief) : closeModal();
}
function openHistory() {
  const h = LS.get('history', []);
  modal(`<h3>🗂 상담 기록 (이 기기에만 저장)</h3>
  <input id="hQ" placeholder="검색 (이름, 내용…)">
  <div id="hList"></div><div class="row"><button class="btn gray" id="hX">닫기</button></div>`);
  const draw = q => {
    const list = h.filter(r => !q || JSON.stringify(r).includes(q));
    $('hList').innerHTML = list.length ? list.map(r => `<div class="hist"><div><b>${r.clientId ? '👤 ' + esc(clientName(r.clientId)) + ' · ' : ''}${esc(r.brief?.title || DOMAINS[r.domain]?.label)}</b><br>
      <small>${new Date(r.at).toLocaleString('ko-KR')} · ${LANGS[r.lang]?.name} · ${r.turns.length}건</small></div>
      <div><button class="btn" data-o="${r.id}">열기</button> <button class="btn gray" data-d="${r.id}">삭제</button></div></div>`).join('') : '<p class="note">기록이 없습니다.</p>';
    $('hList').querySelectorAll('[data-o]').forEach(b => b.onclick = () => openSession(b.dataset.o));
    $('hList').querySelectorAll('[data-d]').forEach(b => b.onclick = () => {
      if (!confirm('이 기록을 삭제할까요?')) return;
      const i = h.findIndex(x => x.id === b.dataset.d); h.splice(i, 1); LS.set('history', h); draw($('hQ').value);
    });
  };
  draw(''); $('hQ').oninput = e => draw(e.target.value); $('hX').onclick = closeModal;
}

// ---------- 브리핑 ----------
async function makeBriefing() {
  if (S.running) stopSession(false);
  if (!canUse('brief')) return;
  modal('<h3>📝 브리핑 작성 중…</h3><p>대화를 요약하고 니즈·최적 제안을 분석하고 있습니다.</p>');
  const pl = LANGS[S.lang];
  const transcript = S.turns.map(t => t.speaker === 'me' ? `[상담자(한국어)] ${t.src}  (통역: ${t.dst})` : `[고객(${pl.name})] ${t.src}  (통역: ${t.dst})`).join('\n');
  let sys = briefingPrompt(S.domain, pl.native);
  if (S.client) {
    const prev = LS.get('history', []).filter(h => h.clientId === S.client.id && h.id !== S.sessionId && h.brief).slice(0, 3);
    sys += `\n고객 이름: ${S.client.name} (${S.client.tag || ''}). 메모: ${S.client.memo || '-'}` + (prev.length ? `\n이전 상담 요약(연속성 반영): ${prev.map(p => p.brief.title + ' - ' + (p.brief.summary || []).join(' ')).join(' | ')}` : '');
  }
  try {
    let raw;
    if (S.settings.gemini) {
      try { raw = await geminiGenerate(S.settings.gemini, sys, transcript, { json: true }); }
      catch (e) { if (!hasOpenAI()) throw e; raw = await openaiChat(S.settings.openai, sys, transcript, { json: true }); }
    } else raw = await openaiChat(S.settings.openai, sys, transcript, { json: true });
    const b = JSON.parse(raw.replace(/^```json|```$/g, '').trim());
    b.at = S.startedAt || Date.now(); b.lang = S.lang; b.domain = S.domain;
    S.brief = b; autosave(); showBriefing(b);
  } catch (e) { alertModal('⚠️ 브리핑 실패', esc(e.message)); }
}
const li = a => (a && a.length ? `<ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="note">-</p>');
function briefHTML(b, full) {
  const pl = LANGS[b.lang];
  const meta = `${S.client ? '👤 ' + esc(S.client.name) + ' · ' : ''}${new Date(b.at).toLocaleString('ko-KR')} · ${DOMAINS[b.domain]?.label} · 한국어↔${pl.name} · 상담자 ${esc(S.settings.counselor)}`;
  let h = `<div class="brief"><h3>📋 ${esc(b.title)}</h3><p class="note">${meta}</p>
  <h4>핵심 요약</h4>${li(b.summary)}<h4>고객 요청·고민</h4>${li(b.requests)}<h4>합의 사항</h4>${li(b.agreements)}
  <h4>다음 할 일</h4>${li(b.todos)}<h4>확인 필요</h4>${li(b.checks)}
  <h4>💡 숨은 니즈</h4>${li(b.needs)}<h4>💡 최적 제안</h4>${li(b.proposals)}<h4>💡 다음 질문</h4>${li(b.questions)}
  <h4>✉️ 고객용 요약 (${pl.native})</h4><div class="client">${esc(b.client_summary)}</div>`;
  if (full) h += `<h4>대화 원문</h4>${li(S.turns.map(t => `${t.speaker === 'me' ? '상담자' : '고객'}: ${t.src} → ${t.dst}`))}`;
  h += `<p class="note">※ AI 분석·제안은 참고용이며 의료·보험·세무 최종 판단은 상담자가 합니다.</p></div>`;
  return h;
}
function briefText(b, client) {
  if (client) return `${b.client_summary}\n\n— ${S.settings.counselor}`;
  const L = (t, a) => a?.length ? `\n■ ${t}\n` + a.map(x => '- ' + x).join('\n') : '';
  return `[통역 동행 상담 브리핑] ${b.title}\n${new Date(b.at).toLocaleString('ko-KR')} · ${DOMAINS[b.domain]?.label} · ${LANGS[b.lang].name}` +
    L('핵심 요약', b.summary) + L('고객 요청', b.requests) + L('합의', b.agreements) + L('다음 할 일', b.todos) + L('확인 필요', b.checks) +
    L('숨은 니즈', b.needs) + L('최적 제안', b.proposals) + L('다음 질문', b.questions) + `\n\n■ 고객용 요약\n${b.client_summary}\n\n※ AI 제안은 참고용`;
}
function showBriefing(b) {
  modal(briefHTML(b) + `
  <div class="row"><button class="btn yellow" id="bShare">💬 카톡 등 공유</button><button class="btn" id="bMail">✉️ 이메일</button></div>
  <div class="row"><button class="btn gray" id="bClient">🌐 고객용 공유</button><button class="btn gray" id="bPdf">📄 PDF 저장</button><button class="btn gray" id="bFile">💾 문서 파일</button><button class="btn gray" id="bCopy">📋 복사</button></div>
  <div class="row"><button class="btn gray" id="bCol">🤝 동료 FC에게 사례 공유 (개인정보 제외)</button></div>
  <div class="row"><button class="btn gray" id="bX">닫기</button></div>`);
  const share = async (text, title) => {
    if (navigator.share) { try { await navigator.share({ title, text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    await navigator.clipboard.writeText(text); alert('복사되었습니다. 카카오톡에 붙여넣기 하세요.');
  };
  $('bShare').onclick = () => share(briefText(b), b.title);
  $('bClient').onclick = () => share(briefText(b, true), b.title);
  $('bCol').onclick = () => shareBriefToColleague(b);
  if (S.client?.email) $('bMail').onclick = () => { location.href = `mailto:${encodeURIComponent(S.client.email)}?subject=${encodeURIComponent(b.title)}&body=${encodeURIComponent(briefText(b, true))}`; };
  $('bMail').onclick = () => { location.href = `mailto:?subject=${encodeURIComponent('[상담 브리핑] ' + b.title)}&body=${encodeURIComponent(briefText(b))}`; };
  $('bCopy').onclick = async () => { await navigator.clipboard.writeText(briefText(b)); $('bCopy').textContent = '✅ 복사됨'; };
  $('bPdf').onclick = () => printDoc(b);
  $('bFile').onclick = async () => {
    const html = docHTML(b); const name = `상담브리핑_${new Date(b.at).toISOString().slice(0, 10)}_${b.title.slice(0, 20)}.html`;
    const file = new File([html], name, { type: 'text/html' });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: b.title }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click();
  };
  $('bX').onclick = closeModal;
}
function docHTML(b) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(b.title)}</title><style>
  body{font-family:"Noto Sans KR","Malgun Gothic",sans-serif;max-width:760px;margin:30px auto;padding:0 20px;color:#111;line-height:1.6}
  h3{border-bottom:3px solid #0ea5e9;padding-bottom:6px}h4{color:#0369a1;margin:18px 0 4px}.note{color:#666;font-size:.85em}
  .client{background:#f1f5f9;padding:12px;border-radius:8px;white-space:pre-wrap}</style></head><body>
  <p class="note">통역 동행 · 상담 브리핑</p>${briefHTML(b, true)}</body></html>`;
}
function printDoc(b) {
  const w = window.open('', '_blank'); if (!w) return alert('팝업이 차단되었습니다.');
  w.document.write(docHTML(b)); w.document.close(); setTimeout(() => w.print(), 400);
}

init();
