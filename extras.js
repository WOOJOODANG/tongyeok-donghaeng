// v4 추가 기능: 📷 사진 번역 / 👤 고객 관리 / 📤 공유(FC·학생) / 📴 오프라인 통역 / 💳 계정·요금제(테스트 모드)
import { LANGS, KO, DOMAINS } from './config.js?v=40';
import { geminiParts, geminiGenerate } from './engines.js?v=40';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LS = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem('tyd_' + k)) ?? d; } catch { return d; } },
  set: (k, v) => localStorage.setItem('tyd_' + k, JSON.stringify(v)),
};
let H = null; // app 쪽 헬퍼 { modal, closeModal, alertModal, key(), lang(), domain(), speak(text,bcp), currentClient(), setClient(c) }
export function initExtras(helpers) { H = helpers; handleShareLink(); initOffline(); }

// =====================================================================
// 💳 계정·요금제 (테스트 모드 — 실제 결제 없음)
// =====================================================================
export const PLANS = {
  free: { name: '무료', price: 0, desc: '실시간 통역(무료 엔진), 오늘의 단어·문장, 브리핑 하루 3회, 사진 번역 하루 3회' },
  pro: { name: 'Pro', price: 19900, desc: '브리핑·사진 번역 무제한, 고객 관리, 단계별 코스 전체, 공유 패키지, 전화회화 피드백' },
  biz: { name: '기관(Biz)', price: 29900, desc: 'Pro 전체 + 팀 공유 패키지, 기관 로고 브리핑, 좌석 관리(서버 연동 후)' },
};
const LIMITS = { free: { brief: 3, photo: 3 }, pro: { brief: 1e9, photo: 1e9 }, biz: { brief: 1e9, photo: 1e9 } };
export const account = () => LS.get('account', { owner: true, name: '', email: '', plan: 'pro', until: null });
export function plan() {
  const a = account(); if (a.owner) return 'biz';
  if (a.plan !== 'free' && a.until && new Date(a.until) < new Date()) return 'free';
  return a.plan || 'free';
}
const todayKey = () => new Date().toLocaleDateString('sv-SE');
// 기능 사용 가능 여부 (+사용량 카운트). false면 업그레이드 안내 표시
export function canUse(feature, count = true) {
  const p = plan(); const lim = LIMITS[p][feature];
  if (lim === undefined) return true;
  const u = LS.get('dailyUse', {}); const d = u[todayKey()] || {};
  if ((d[feature] || 0) >= lim) { upgradeModal(`오늘 무료 ${feature === 'brief' ? '브리핑' : '사진 번역'} ${lim}회를 모두 사용했어요.`); return false; }
  if (count) { d[feature] = (d[feature] || 0) + 1; u[todayKey()] = d; LS.set('dailyUse', u); }
  return true;
}
export function needPro(featureName) {
  if (plan() !== 'free') return true;
  upgradeModal(`${featureName}은(는) Pro 기능입니다.`); return false;
}
function upgradeModal(reason) {
  H.modal(`<h3>⭐ Pro로 업그레이드</h3><p>${esc(reason)}</p>
   ${Object.entries(PLANS).filter(([k]) => k !== 'free').map(([k, v]) => `<div class="wcard"><b>${v.name}</b> · 월 ${v.price.toLocaleString()}원<br><span class="note">${v.desc}</span></div>`).join('')}
   <div class="row"><button class="btn" id="upGo">요금제 보기</button><button class="btn gray" id="upX">닫기</button></div>`);
  $('upGo').onclick = openAccount; $('upX').onclick = H.closeModal;
}
export function openAccount() {
  const a = account(), p = plan();
  H.modal(`<h3>👤 계정 · 요금제</h3>
   <div class="testBadge">🧪 테스트 모드 — 실제 결제가 일어나지 않습니다</div>
   <div class="field"><label>이름</label><input id="acName" value="${esc(a.name)}"></div>
   <div class="field"><label>이메일 (로그인 ID)</label><input id="acMail" type="email" value="${esc(a.email)}" placeholder="name@example.com"></div>
   <label class="note"><input type="checkbox" id="acOwner" ${a.owner ? 'checked' : ''} style="width:auto"> 개발자(소유자) 모드 — 모든 기능 무제한 (본인용)</label>
   <h4>현재: ${PLANS[p].name}${a.until && !a.owner ? ` (만료 ${a.until})` : ''}</h4>
   ${Object.entries(PLANS).map(([k, v]) => `<div class="wcard ${k === p ? 'onPlan' : ''}"><b>${v.name}</b> · ${v.price ? '월 ' + v.price.toLocaleString() + '원' : '무료'}<br><span class="note">${v.desc}</span>
     ${k !== 'free' && k !== p ? `<div class="row"><button class="btn" data-buy="${k}">테스트 결제로 시작</button></div>` : ''}</div>`).join('')}
   <p class="note">실제 판매 시: 사업자등록 → 결제대행(토스페이먼츠 등) 계약 → 서버(로그인·구독 확인) 연결이 필요합니다. 설계는 docs/MONETIZATION.md 참고.</p>
   <div class="row"><button class="btn" id="acSave">저장</button><button class="btn gray" id="acFree">무료로 전환(테스트)</button><button class="btn gray" id="acX">닫기</button></div>`);
  const save = extra => { const n = { ...account(), name: $('acName').value.trim(), email: $('acMail').value.trim(), owner: $('acOwner').checked, ...extra }; LS.set('account', n); return n; };
  $('acSave').onclick = () => { save(); H.closeModal(); H.refresh?.(); };
  $('acX').onclick = H.closeModal;
  $('acFree').onclick = () => { save({ plan: 'free', until: null, owner: false }); openAccount(); };
  document.querySelectorAll('[data-buy]').forEach(b => b.onclick = () => {
    if (!$('acMail').value.trim()) return alert('이메일을 입력해 주세요.');
    const k = b.dataset.buy;
    H.modal(`<h3>💳 결제 (테스트)</h3><p>${PLANS[k].name} · 월 ${PLANS[k].price.toLocaleString()}원</p>
      <div class="field"><label>카드번호</label><input value="4242 4242 4242 4242" disabled></div>
      <p class="note">테스트 결제입니다. 실제로 청구되지 않습니다.</p>
      <div class="row"><button class="btn green" id="payOk">결제하기</button><button class="btn gray" id="payX">취소</button></div>`);
    const name = $('acName')?.value; const mail = $('acMail')?.value;
    $('payX').onclick = openAccount;
    $('payOk').onclick = () => {
      const d = new Date(); d.setMonth(d.getMonth() + 1);
      LS.set('account', { ...account(), name, email: mail, owner: false, plan: k, until: d.toLocaleDateString('sv-SE') });
      const pays = LS.get('payments', []); pays.unshift({ at: Date.now(), plan: k, amount: PLANS[k].price, test: true }); LS.set('payments', pays);
      H.alertModal('✅ 결제 완료 (테스트)', `${PLANS[k].name} 요금제가 ${d.toLocaleDateString('sv-SE')}까지 적용됩니다.`); H.refresh?.();
    };
  });
}

// =====================================================================
// 👤 고객 관리 (상담 기록 연결)
// =====================================================================
export const clients = () => LS.get('clients', []);
const saveClients = c => LS.set('clients', c);
export function clientName(id) { return clients().find(c => c.id === id)?.name || ''; }
export function openClients(pickMode) {
  if (!pickMode && !needPro('고객 관리')) return;
  const draw = q => {
    const hist = LS.get('history', []);
    const list = clients().filter(c => !q || JSON.stringify(c).includes(q));
    $('clList').innerHTML = list.map(c => {
      const n = hist.filter(h => h.clientId === c.id).length;
      return `<div class="hist"><div><b>${esc(c.name)}</b> <span class="note">${esc(LANGS[c.lang]?.name || '')} · ${esc(c.tag || '')}</span><br><small>${esc(c.phone || '')} ${esc(c.email || '')} · 상담 ${n}회</small></div>
        <div>${pickMode ? `<button class="btn" data-pick="${c.id}">선택</button>` : `<button class="btn" data-view="${c.id}">보기</button>`}</div></div>`;
    }).join('') || '<p class="note">등록된 고객이 없습니다.</p>';
    document.querySelectorAll('[data-pick]').forEach(b => b.onclick = () => { H.setClient(clients().find(c => c.id === b.dataset.pick)); H.closeModal(); pickMode?.(); });
    document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => viewClient(b.dataset.view));
  };
  H.modal(`<h3>👤 ${pickMode ? '상담 고객 선택' : '고객 관리'}</h3>
   <input id="clQ" placeholder="이름·연락처 검색"><div id="clList"></div>
   <div class="row"><button class="btn green" id="clNew">＋ 새 고객</button>${pickMode ? '<button class="btn gray" id="clSkip">고객 없이 진행</button>' : ''}<button class="btn gray" id="clX">닫기</button></div>`);
  draw(''); $('clQ').oninput = e => draw(e.target.value);
  $('clNew').onclick = () => editClient(null, pickMode);
  $('clX').onclick = H.closeModal;
  if (pickMode) $('clSkip').onclick = () => { H.setClient(null); H.closeModal(); pickMode(); };
}
function editClient(id, pickMode) {
  const c = clients().find(x => x.id === id) || { id: 'c' + Date.now(), name: '', lang: H.lang(), tag: DOMAINS[H.domain()]?.label.replace(/^\S+\s/, '') || '', phone: '', email: '', memo: '' };
  H.modal(`<h3>${id ? '고객 수정' : '새 고객'}</h3>
   <div class="field"><label>이름</label><input id="ceName" value="${esc(c.name)}"></div>
   <div class="field"><label>사용 언어</label><select id="ceLang">${Object.entries(LANGS).map(([k, v]) => `<option value="${k}" ${k === c.lang ? 'selected' : ''}>${v.name}</option>`).join('')}</select></div>
   <div class="field"><label>구분 (환자/학생/보험/세무 등)</label><input id="ceTag" value="${esc(c.tag)}"></div>
   <div class="field"><label>연락처</label><input id="cePhone" value="${esc(c.phone)}"></div>
   <div class="field"><label>이메일</label><input id="ceMail" value="${esc(c.email)}"></div>
   <div class="field"><label>메모</label><textarea id="ceMemo" rows="3">${esc(c.memo)}</textarea></div>
   <p class="note">🔐 고객 정보는 이 폰에만 저장됩니다.</p>
   <div class="row"><button class="btn" id="ceSave">저장</button>${id ? '<button class="btn gray" id="ceDel">삭제</button>' : ''}<button class="btn gray" id="ceX">취소</button></div>`);
  $('ceSave').onclick = () => {
    if (!$('ceName').value.trim()) return alert('이름을 입력하세요.');
    const n = { ...c, name: $('ceName').value.trim(), lang: $('ceLang').value, tag: $('ceTag').value.trim(), phone: $('cePhone').value.trim(), email: $('ceMail').value.trim(), memo: $('ceMemo').value };
    const all = clients(); const i = all.findIndex(x => x.id === n.id); if (i >= 0) all[i] = n; else all.unshift(n); saveClients(all);
    if (pickMode) { H.setClient(n); H.closeModal(); pickMode(); } else viewClient(n.id);
  };
  $('ceX').onclick = () => openClients(pickMode);
  if (id) $('ceDel').onclick = () => { if (!confirm('고객을 삭제할까요? (상담 기록은 남습니다)')) return; saveClients(clients().filter(x => x.id !== id)); openClients(); };
}
function viewClient(id) {
  const c = clients().find(x => x.id === id); if (!c) return;
  const hist = LS.get('history', []).filter(h => h.clientId === id);
  const photos = LS.get('photos', []).filter(p => p.clientId === id);
  H.modal(`<h3>👤 ${esc(c.name)}</h3><p class="note">${esc(LANGS[c.lang]?.name)} · ${esc(c.tag)} · ${esc(c.phone)} ${esc(c.email)}</p>
   ${c.memo ? `<div class="wcard">${esc(c.memo)}</div>` : ''}
   <h4>🗂 상담 기록 ${hist.length}건</h4>
   ${hist.map(h => `<div class="hist"><div><b>${esc(h.brief?.title || DOMAINS[h.domain]?.label)}</b><br><small>${new Date(h.at).toLocaleString('ko-KR')} · ${h.turns.length}건</small></div><button class="btn" data-open="${h.id}">열기</button></div>`).join('') || '<p class="note">-</p>'}
   <h4>📷 번역한 서류 ${photos.length}건</h4>
   ${photos.map(p => `<div class="hist"><div><b>${esc(p.result.doc_type)}</b><br><small>${new Date(p.at).toLocaleString('ko-KR')}</small></div><button class="btn" data-ph="${p.id}">열기</button></div>`).join('') || '<p class="note">-</p>'}
   ${hist.some(h => h.brief) ? '<div class="row"><button class="btn" id="cvSum">📈 전체 상담 흐름 요약</button></div><div id="cvSumOut"></div>' : ''}
   <div class="row"><button class="btn green" id="cvStart">▶ 이 고객과 상담 시작</button><button class="btn gray" id="cvEdit">수정</button><button class="btn gray" id="cvBack">목록</button></div>`);
  document.querySelectorAll('[data-open]').forEach(b => b.onclick = () => H.openSession(b.dataset.open));
  document.querySelectorAll('[data-ph]').forEach(b => b.onclick = () => showPhoto(LS.get('photos', []).find(p => p.id === b.dataset.ph)));
  $('cvStart').onclick = () => { H.setClient(c); H.closeModal(); H.startWithClient?.(); };
  $('cvEdit').onclick = () => editClient(id); $('cvBack').onclick = () => openClients();
  if ($('cvSum')) $('cvSum').onclick = async () => {
    $('cvSumOut').innerHTML = '<p class="note">분석 중…</p>';
    try {
      const txt = hist.filter(h => h.brief).map(h => `[${new Date(h.at).toLocaleDateString('ko-KR')}] ${h.brief.title}: ${(h.brief.summary || []).join(' / ')} | 할일: ${(h.brief.todos || []).join(', ')}`).join('\n');
      const r = await geminiGenerate(H.key(), '고객의 여러 상담 브리핑을 보고 한국어로 정리: 1) 지금까지의 흐름 3줄 2) 미해결 과제 3) 다음 상담에서 할 일과 제안. 간결한 글머리표로.', txt);
      $('cvSumOut').innerHTML = `<div class="wcard" style="white-space:pre-wrap">${esc(r)}</div>`;
    } catch (e) { $('cvSumOut').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  };
}

// =====================================================================
// 📷 사진 번역 (처방전·서류·안내문)
// =====================================================================
export function openPhoto() {
  H.modal(`<h3>📷 사진 번역</h3>
   <p>처방전, 진단서, 보험 서류, 세금 고지서, 안내문 등을 찍으면 <b>글자를 읽고 번역 + 핵심 정리</b>를 해드립니다.</p>
   <div class="field"><label>번역 방향</label><select id="phDir">
     <option value="toKo">외국어 서류 → 한국어 (내가 읽기)</option>
     <option value="toPartner">한국어 서류 → ${esc(LANGS[H.lang()].name)} (고객에게 설명)</option></select></div>
   ${H.currentClient() ? `<p class="note">👤 고객: ${esc(H.currentClient().name)} 기록에 저장됩니다</p>` : ''}
   <div class="row"><button class="btn green" id="phCam">📸 카메라로 찍기</button><button class="btn gray" id="phGal">🖼 앨범에서 선택</button></div>
   <input type="file" id="phFileC" accept="image/*" capture="environment" hidden><input type="file" id="phFileG" accept="image/*" hidden>
   <div id="phOut"></div>
   <h4>최근 번역</h4><div id="phHist"></div>
   <div class="row"><button class="btn gray" id="phX">닫기</button></div>`);
  $('phCam').onclick = () => $('phFileC').click(); $('phGal').onclick = () => $('phFileG').click();
  $('phFileC').onchange = e => runPhoto(e.target.files[0]); $('phFileG').onchange = e => runPhoto(e.target.files[0]);
  $('phX').onclick = H.closeModal;
  $('phHist').innerHTML = LS.get('photos', []).slice(0, 10).map(p => `<div class="hist"><div><b>${esc(p.result.doc_type)}</b><br><small>${new Date(p.at).toLocaleString('ko-KR')} ${p.clientId ? '· ' + esc(clientName(p.clientId)) : ''}</small></div><button class="btn" data-ph="${p.id}">열기</button></div>`).join('') || '<p class="note">-</p>';
  document.querySelectorAll('[data-ph]').forEach(b => b.onclick = () => showPhoto(LS.get('photos', []).find(p => p.id === b.dataset.ph)));
}
async function shrink(file, max = 1600) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  const s = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = img.width * s; c.height = img.height * s;
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.85).split(',')[1];
}
async function runPhoto(file) {
  if (!file) return;
  if (!canUse('photo')) return;
  const toKo = $('phDir').value === 'toKo'; const pl = LANGS[H.lang()];
  $('phOut').innerHTML = '<p class="note">📖 글자를 읽고 번역하는 중… (10~20초)</p>';
  try {
    const b64 = await shrink(file);
    const target = toKo ? '한국어(Korean)' : pl.native;
    const sys = `You are a professional document translator for a Korean physical therapist / professor / insurance planner / accounting-firm consultant.
Read ALL text in the image (OCR) and translate into ${target}. Context: ${DOMAINS[H.domain()].prompt}
Return ONLY JSON:
{"doc_type":"문서 종류(한국어, 예: 처방전/진단서/보험증권/세금고지서/안내문)","source_lang":"detected language",
 "original":"original text as read (keep line breaks)","translation":"full translation in ${target} (keep structure)",
 "key_points":[{"label":"항목(한국어)","value":"내용(한국어)"}],
 "warnings":["주의사항(한국어): 복용량·금기·기한·금액 등 놓치면 안 되는 것"],
 "explain_ko":"상담자가 이해할 수 있게 한국어로 3~5줄 쉬운 설명",
 "unclear":["읽기 어려웠던 부분"]}
For prescriptions: list each drug with dose, frequency, duration in key_points. Never invent unreadable text; mark as [판독불가].`;
    const raw = await geminiParts(H.key(), sys, [{ text: '이 서류를 처리해 주세요.' }, { inlineData: { mimeType: 'image/jpeg', data: b64 } }], { json: true });
    const result = JSON.parse(raw.replace(/^```json|```$/g, '').trim());
    const rec = { id: 'p' + Date.now(), at: Date.now(), toKo, lang: H.lang(), clientId: H.currentClient()?.id || null, result, thumb: await shrink(file, 320) };
    const all = LS.get('photos', []); all.unshift(rec);
    try { LS.set('photos', all.slice(0, 50)); } catch { LS.set('photos', all.slice(0, 15).map((p, i) => i < 5 ? p : { ...p, thumb: null })); }
    showPhoto(rec);
  } catch (e) { $('phOut').innerHTML = `<p class="err">⚠️ ${esc(e.message)}</p>`; }
}
function photoText(p) {
  const r = p.result;
  return `[${r.doc_type} 번역]\n${r.translation}\n\n■ 핵심\n${(r.key_points || []).map(k => `- ${k.label}: ${k.value}`).join('\n')}${r.warnings?.length ? '\n\n■ 주의\n' + r.warnings.map(w => '- ' + w).join('\n') : ''}\n\n※ AI 번역은 참고용이며 원본을 확인하세요.`;
}
function showPhoto(p) {
  if (!p) return; const r = p.result; const lang = p.toKo ? 'ko-KR' : LANGS[p.lang].bcp;
  H.modal(`<h3>📷 ${esc(r.doc_type)}</h3><p class="note">${new Date(p.at).toLocaleString('ko-KR')} · ${esc(r.source_lang)} → ${p.toKo ? '한국어' : esc(LANGS[p.lang].name)} ${p.clientId ? '· 👤 ' + esc(clientName(p.clientId)) : ''}</p>
   ${p.thumb ? `<img src="data:image/jpeg;base64,${p.thumb}" class="thumb">` : ''}
   <h4>💡 쉬운 설명</h4><p>${esc(r.explain_ko)}</p>
   ${r.key_points?.length ? `<h4>📌 핵심 항목</h4><table class="kv">${r.key_points.map(k => `<tr><th>${esc(k.label)}</th><td>${esc(k.value)}</td></tr>`).join('')}</table>` : ''}
   ${r.warnings?.length ? `<h4>⚠️ 주의</h4><ul>${r.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
   <h4>🌐 전체 번역 <button class="mini" id="phSay">🔊</button></h4><div class="client">${esc(r.translation)}</div>
   <details><summary class="note">원문 보기</summary><div class="client">${esc(r.original)}</div></details>
   ${r.unclear?.length ? `<p class="note">판독 어려움: ${esc(r.unclear.join(', '))}</p>` : ''}
   <p class="note">※ AI 번역은 참고용입니다. 약 복용·법적 판단은 반드시 원본과 전문가 확인.</p>
   <div class="row"><button class="btn yellow" id="phShare">💬 공유</button><button class="btn gray" id="phCopy">📋 복사</button><button class="btn gray" id="phBack">← 사진 번역</button></div>`);
  $('phSay').onclick = () => H.speak(r.translation.slice(0, 600), lang);
  $('phShare').onclick = () => shareText(photoText(p), r.doc_type);
  $('phCopy').onclick = async () => { await navigator.clipboard.writeText(photoText(p)); $('phCopy').textContent = '✅ 복사됨'; };
  $('phBack').onclick = openPhoto;
}
async function shareText(text, title) {
  if (navigator.share) { try { await navigator.share({ title, text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  await navigator.clipboard.writeText(text); alert('복사되었습니다. 카카오톡에 붙여넣기 하세요.');
}

// =====================================================================
// 📤 공유: FC·학생에게 (서버 없이 링크 / 파일)
// =====================================================================
const enc = o => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const dec = s => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));
export function openShare() {
  if (!needPro('공유 패키지')) return;
  const g = LS.get('glossary', []), q = LS.get('myQuick', []), book = LS.get('book', []), ph = LS.get('myPhrases', []);
  H.modal(`<h3>📤 FC·학생에게 공유</h3>
   <p class="note">서버 없이 <b>링크</b>로 보냅니다. 받는 사람이 링크를 열면 자기 앱에 추가됩니다. (고객 정보·상담 기록·API 키는 절대 포함되지 않습니다)</p>
   <div class="field"><label>공유 패키지 이름</label><input id="shName" value="${esc((account().name || '정지훈') + '의 ' + (DOMAINS[H.domain()]?.label.replace(/^\S+\s/, '') || '') + ' 패키지')}"></div>
   <label class="chk"><input type="checkbox" id="shG" ${g.length ? 'checked' : ''}> 📒 용어집 (${g.length}개)</label>
   <label class="chk"><input type="checkbox" id="shQ" ${q.length ? 'checked' : ''}> 💬 자주 쓰는 문구 (${q.length}개)</label>
   <label class="chk"><input type="checkbox" id="shB"> ⭐ 단어장 (${book.length}개) — 학생용</label>
   <label class="chk"><input type="checkbox" id="shP"> ✨ 내가 만든 문장 (${ph.length}개) — 학생용</label>
   <div class="field"><label>받는 사람에게 메시지</label><textarea id="shMsg" rows="2" placeholder="예) 외국인 환자 상담용 문구입니다"></textarea></div>
   <div class="row"><button class="btn yellow" id="shGo">💬 링크 공유 (카톡 등)</button><button class="btn gray" id="shFile">💾 파일로 공유</button></div>
   <h4>📥 받은 공유 파일 불러오기</h4><div class="row"><button class="btn gray" id="shImp">파일 선택</button></div>
   <div class="row"><button class="btn gray" id="shX">닫기</button></div>`);
  const pack = () => ({ v: 1, name: $('shName').value, msg: $('shMsg').value, from: account().name || '', at: Date.now(),
    glossary: $('shG').checked ? g : [], quick: $('shQ').checked ? q : [],
    book: $('shB').checked ? book.map(({ t, k, r, lang }) => ({ t, k, r, lang })) : [], phrases: $('shP').checked ? ph.map(({ ko, en, lang }) => ({ ko, en, lang })) : [] });
  $('shGo').onclick = () => {
    const p = pack(); const url = location.origin + location.pathname + '#share=' + enc(p);
    if (url.length > 60000) return alert('내용이 너무 많아요. 파일로 공유해 주세요.');
    shareText(`📲 [통역 동행] ${p.name}\n${p.msg ? p.msg + '\n' : ''}아래 링크를 크롬에서 열면 앱에 추가됩니다.\n${url}`, p.name);
  };
  $('shFile').onclick = async () => {
    const p = pack(); const file = new File([JSON.stringify(p)], `통역동행_공유_${p.name.slice(0, 20)}.json`, { type: 'application/json' });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: p.name }); return; } catch (e) { if (e.name === 'AbortError') return; } }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; a.click();
  };
  $('shImp').onclick = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json'; i.onchange = async () => { try { importPack(JSON.parse(await i.files[0].text())); } catch { alert('올바른 공유 파일이 아닙니다.'); } }; i.click(); };
  $('shX').onclick = H.closeModal;
}
function importPack(p) {
  H.modal(`<h3>📥 공유 받기</h3><p><b>${esc(p.name)}</b>${p.from ? ' · 보낸 사람 ' + esc(p.from) : ''}</p>${p.msg ? `<div class="wcard">${esc(p.msg)}</div>` : ''}
   <ul><li>📒 용어집 ${p.glossary?.length || 0}개</li><li>💬 문구 ${p.quick?.length || 0}개</li><li>⭐ 단어 ${p.book?.length || 0}개</li><li>✨ 문장 ${p.phrases?.length || 0}개</li></ul>
   <p class="note">기존 내용은 유지되고, 없는 것만 추가됩니다.</p>
   <div class="row"><button class="btn green" id="ipOk">내 앱에 추가</button><button class="btn gray" id="ipX">취소</button></div>`);
  $('ipX').onclick = H.closeModal;
  $('ipOk').onclick = () => {
    const merge = (key, items, same) => { const cur = LS.get(key, []); items.forEach(it => { if (!cur.some(c => same(c, it))) cur.push(it); }); LS.set(key, cur); };
    merge('glossary', p.glossary || [], (a, b) => a.ko === b.ko);
    merge('myQuick', p.quick || [], (a, b) => a === b);
    const today = new Date().toLocaleDateString('sv-SE');
    merge('book', (p.book || []).map(b => ({ ...b, box: 0, due: today, added: today })), (a, b) => a.t === b.t && a.lang === b.lang);
    merge('myPhrases', (p.phrases || []).map(x => ({ ...x, at: Date.now() })), (a, b) => a.ko === b.ko && a.en === b.en);
    const rec = LS.get('received', []); rec.unshift({ name: p.name, from: p.from, at: Date.now() }); LS.set('received', rec.slice(0, 50));
    H.alertModal('✅ 추가 완료', `“${esc(p.name)}” 패키지를 내 앱에 추가했습니다.`); H.refresh?.();
  };
}
function handleShareLink() {
  const m = location.hash.match(/#share=([\w-]+)/); if (!m) return;
  history.replaceState(null, '', location.pathname);
  try { setTimeout(() => importPack(dec(m[1])), 600); } catch { setTimeout(() => H.alertModal('⚠️', '공유 링크가 손상되었습니다.'), 600); }
}
// 상담 브리핑을 동료 FC에게 (고객 개인정보 가림)
export function shareBriefToColleague(b) {
  const L = (t, a) => a?.length ? `\n■ ${t}\n` + a.map(x => '- ' + x).join('\n') : '';
  const text = `[통역 동행 · 동료 공유용 상담 사례] ${b.title}\n(고객 개인정보 제외)` + L('요약', b.summary) + L('고객 니즈', b.needs) + L('제안', b.proposals) + L('다음 질문', b.questions);
  shareText(text, b.title);
}

// =====================================================================
// 📴 오프라인 통역
// =====================================================================
// 1) 온라인일 때 번역한 문장은 자동 저장(메모리) → 오프라인에서 같은/비슷한 문장 즉시 재사용
// 2) 자주 쓰는 문구 오프라인 팩: 미리 전체 언어로 번역해 저장
// 3) 브라우저 내장 번역(Translator API)이 있으면 사용 (기기·크롬 버전에 따라 다름)
const MEMO_MAX = 3000;
const norm = s => s.toLowerCase().replace(/[\s.,!?。、？！]/g, '');
export function memoSave(from, to, src, dst) {
  if (!src || !dst) return;
  const m = LS.get('tmemo', {}); const k = `${from}>${to}`; (m[k] = m[k] || {})[norm(src)] = dst;
  const keys = Object.keys(m[k]); if (keys.length > MEMO_MAX) delete m[k][keys[0]];
  try { LS.set('tmemo', m); } catch {}
}
function memoFind(from, to, src) {
  const m = LS.get('tmemo', {})[`${from}>${to}`] || {}; const n = norm(src);
  if (m[n]) return m[n];
  // 간단 유사도(포함 관계)
  let best = null, bl = 0;
  for (const [k, v] of Object.entries(m)) { if ((n.includes(k) || k.includes(n)) && Math.min(k.length, n.length) / Math.max(k.length, n.length) > 0.75 && k.length > bl) { best = v; bl = k.length; } }
  return best;
}
const translators = {};
async function builtinTranslate(from, to, text) {
  const T = window.Translator || self.translation; if (!T) return null;
  try {
    const key = from + to;
    if (!translators[key]) {
      if (window.Translator) {
        const av = await Translator.availability({ sourceLanguage: from, targetLanguage: to });
        if (av === 'unavailable') return null;
        translators[key] = await Translator.create({ sourceLanguage: from, targetLanguage: to });
      } else return null;
    }
    return await translators[key].translate(text);
  } catch { return null; }
}
export async function offlineTranslate(fromCode, toCode, text) {
  const hit = memoFind(fromCode, toCode, text); if (hit) return { text: hit, via: '저장된 번역' };
  const b = await builtinTranslate(fromCode, toCode, text); if (b) return { text: b, via: '기기 내장 번역' };
  return null;
}
export const isOffline = () => !navigator.onLine || LS.get('forceOffline', false);
function initOffline() {
  const upd = () => { const el = $('netBadge'); if (el) { el.textContent = isOffline() ? '📴 오프라인' : ''; el.classList.toggle('hidden', !isOffline()); } };
  addEventListener('online', upd); addEventListener('offline', upd); setTimeout(upd, 300);
}
export async function buildOfflinePack(quickLists, onProgress) {
  // 모든 문구를 모든 지원 언어로 미리 번역 → 메모리에 저장
  const all = [...new Set(quickLists.flat())]; const langs = Object.keys(LANGS);
  const sys = `Translate each Korean phrase into these languages: ${langs.map(l => l + '=' + LANGS[l].native).join(', ')}.
Return ONLY JSON: {"items":[{"ko":"...", ${langs.map(l => `"${l}":"..."`).join(', ')}}]} Natural spoken polite style.`;
  let done = 0;
  for (let i = 0; i < all.length; i += 15) {
    const chunk = all.slice(i, i + 15);
    const r = JSON.parse((await geminiGenerate(H.key(), sys, chunk.join('\n'), { json: true })).replace(/^```json|```$/g, ''));
    (r.items || []).forEach(it => langs.forEach(l => { if (it[l]) { memoSave('ko', l, it.ko, it[l]); memoSave(l, 'ko', it[l], it.ko); } }));
    done += chunk.length; onProgress?.(done, all.length);
  }
  LS.set('offlinePackAt', Date.now()); return all.length;
}
export async function openOffline(quickLists) {
  const at = LS.get('offlinePackAt', null);
  const memoN = Object.values(LS.get('tmemo', {})).reduce((s, o) => s + Object.keys(o).length, 0);
  const builtin = !!window.Translator;
  H.modal(`<h3>📴 인터넷 없이 통역</h3>
   <p>인터넷이 끊기면 앱이 자동으로 오프라인 방식으로 바뀝니다.</p>
   <div class="wcard">
    <b>현재 준비 상태</b><br>
    · 저장된 번역 문장: <b>${memoN}</b>개 (온라인 통역할 때마다 자동 저장)<br>
    · 자주 쓰는 문구 오프라인 팩: ${at ? '✅ ' + new Date(at).toLocaleDateString('ko-KR') : '❌ 아직 없음'}<br>
    · 기기 내장 번역: ${builtin ? '✅ 사용 가능' : '❌ 이 크롬에서는 미지원'}<br>
    · 음성 인식: 크롬 오프라인 음성팩 설치 시 가능
   </div>
   <div class="row"><button class="btn green" id="ofBuild">⬇️ 오프라인 팩 만들기 (모든 문구 × ${Object.keys(LANGS).length}개 언어)</button></div>
   <div id="ofProg" class="note"></div>
   <h4>📱 폰 음성팩 설치 (인식용, 1회)</h4>
   <ol class="note" style="line-height:1.7"><li>휴대폰 설정 → 일반 → 키보드 → Google 음성 입력 (또는 설정 → Google → 음성)</li><li>오프라인 음성 인식 → 언어 다운로드</li><li>한국어 + 영어 + 쓰실 언어 설치</li></ol>
   <h4>⚠️ 오프라인의 한계</h4>
   <p class="note">새로운 문장은 정확한 번역이 어렵습니다. 저장된 문장·문구는 즉시 재생되고, 처음 듣는 문장은 원문 자막만 표시됩니다. 중요한 상담은 인터넷 연결을 권장합니다.</p>
   <label class="chk"><input type="checkbox" id="ofForce" ${LS.get('forceOffline', false) ? 'checked' : ''}> 테스트: 강제 오프라인 모드</label>
   <div class="row"><button class="btn gray" id="ofX">닫기</button></div>`);
  $('ofX').onclick = H.closeModal;
  $('ofForce').onchange = e => { LS.set('forceOffline', e.target.checked); initOffline(); };
  $('ofBuild').onclick = async () => {
    if (!navigator.onLine) return alert('오프라인 팩은 인터넷이 연결된 상태에서 만들어야 합니다.');
    $('ofBuild').disabled = true;
    try { const n = await buildOfflinePack(quickLists, (d, t) => $('ofProg').textContent = `번역 중… ${d}/${t}`); $('ofProg').textContent = `✅ ${n}개 문구 × ${Object.keys(LANGS).length}개 언어 저장 완료`; }
    catch (e) { $('ofProg').textContent = '⚠️ ' + e.message; }
    $('ofBuild').disabled = false;
  };
}
