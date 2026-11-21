// 언어·전문모드·요금 설정 (언어 추가는 LANGS에 한 줄)
export const LANGS = {
  en: { name: '영어', native: 'English', bcp: 'en-US',
        consent: 'This conversation will be interpreted by AI in real time. Only the text transcript is stored on this device. Do you agree?',
        agree: 'I agree', welcome: 'Hello, I will speak through an interpreter app.' },
  zh: { name: '중국어', native: '中文', bcp: 'zh-CN',
        consent: '本次对话将由AI实时翻译，仅在本设备保存文字记录。您同意吗？',
        agree: '同意', welcome: '您好，我将通过翻译应用与您交谈。' },
  ru: { name: '러시아어', native: 'Русский', bcp: 'ru-RU',
        consent: 'Этот разговор будет переводиться ИИ в реальном времени. На устройстве сохраняется только текст. Вы согласны?',
        agree: 'Согласен(на)', welcome: 'Здравствуйте, я буду говорить через приложение-переводчик.' },
  ja: { name: '일본어', native: '日本語', bcp: 'ja-JP',
        consent: 'この会話はAIがリアルタイムで通訳します。テキスト記録のみ本端末に保存されます。同意しますか？',
        agree: '同意します', welcome: 'こんにちは、通訳アプリを使ってお話しします。' },
  es: { name: '스페인어', native: 'Español', bcp: 'es-ES',
        consent: 'Esta conversación será interpretada por IA en tiempo real. Solo se guarda el texto en este dispositivo. ¿Está de acuerdo?',
        agree: 'Acepto', welcome: 'Hola, hablaré a través de una aplicación de interpretación.' },
  vi: { name: '베트남어', native: 'Tiếng Việt', bcp: 'vi-VN',
        consent: 'Cuộc trò chuyện này sẽ được AI phiên dịch theo thời gian thực. Chỉ văn bản được lưu trên thiết bị này. Bạn có đồng ý không?',
        agree: 'Tôi đồng ý', welcome: 'Xin chào, tôi sẽ nói chuyện qua ứng dụng phiên dịch.' },
  fr: { name: '프랑스어', native: 'Français', bcp: 'fr-FR',
        consent: "Cette conversation sera interprétée par l'IA en temps réel. Seul le texte est conservé sur cet appareil. Êtes-vous d'accord ?",
        agree: "J'accepte", welcome: "Bonjour, je vais parler via une application d'interprétation." },
  de: { name: '독일어', native: 'Deutsch', bcp: 'de-DE',
        consent: 'Dieses Gespräch wird in Echtzeit von KI gedolmetscht. Nur der Text wird auf diesem Gerät gespeichert. Sind Sie einverstanden?',
        agree: 'Einverstanden', welcome: 'Hallo, ich spreche über eine Dolmetscher-App.' },
  th: { name: '태국어', native: 'ภาษาไทย', bcp: 'th-TH',
        consent: 'บทสนทนานี้จะถูกแปลโดย AI แบบเรียลไทม์ จะบันทึกเฉพาะข้อความบนอุปกรณ์นี้ คุณยินยอมหรือไม่?',
        agree: 'ยินยอม', welcome: 'สวัสดีครับ ผมจะพูดผ่านแอปล่าม' },
};
export const KO = { name: '한국어', native: '한국어', bcp: 'ko-KR' };

export const DOMAINS = {
  general: { label: '💬 일반', prompt: 'General everyday conversation.' },
  pt: { label: '🩺 물리치료', prompt:
    'Physical therapy clinic or university physical therapy lecture. Use accurate clinical terms: pain location, VAS pain scale, onset, aggravating/relieving factors, ROM, MMT, posture, gait, exercise instructions (sets, reps, hold seconds), contraindications, red flags. Keep exercise instructions short and clear.' },
  ins: { label: '🛡 보험', prompt:
    'Korean life/health insurance consultation (Shinhan Life). Accurate terms: coverage, rider, premium, exclusions, waiting period, duty of disclosure (고지의무), beneficiary, surrender value, renewal vs non-renewal. Preserve numbers and amounts exactly (원/KRW). Do not add promises.' },
  tax: { label: '💼 상속·증여·세무', prompt:
    'Korean accounting firm consultation: inheritance tax, gift tax, deductions, resident vs non-resident, filing deadlines, bookkeeping (기장), VAT, comprehensive income tax. Preserve all numbers, dates, amounts exactly.' },
};

// 추정 단가(원/분) — 사용액 표시용
export const COST_PER_MIN = { free: 0, eco: 20, premium: 150 };

export const ENGINES = {
  free: { label: '① 무료', desc: 'Gemini + 폰 음성 · 0원 · 2~3초' },
  eco: { label: '② 절약', desc: 'OpenAI mini · 약 10~30원/분 · ~2초' },
  premium: { label: '③ 프리미엄', desc: 'OpenAI Realtime · 약 100~300원/분 · ~1초' },
};

// 자주 쓰는 문구 (한국어 → 탭하면 번역·재생)
export const QUICK = {
  general: ['안녕하세요, 만나서 반갑습니다.', '천천히 다시 한 번 말씀해 주시겠어요?', '잠시만 기다려 주세요.', '이해하셨나요?', '감사합니다. 좋은 하루 되세요.'],
  pt: ['어디가 아프세요? 손으로 가리켜 주세요.', '통증을 0부터 10까지 숫자로 말씀해 주세요.', '언제부터 아프셨어요?', '이 동작을 할 때 아프면 말씀해 주세요.', '천천히 숨을 내쉬면서 힘을 빼세요.', '이 운동을 하루 3번, 10회씩 해주세요.', '다음 예약은 언제가 편하세요?'],
  ins: ['현재 가입하신 보험이 있으신가요?', '최근 5년 내 병원 치료나 수술 이력이 있으신가요?', '월 보험료는 얼마 정도 생각하세요?', '이 부분은 보장이 되지 않습니다.', '서류를 이메일로 보내드려도 될까요?', '외국인등록증을 보여주시겠어요?'],
  tax: ['한국에 거주하신 기간이 어떻게 되시나요?', '해외에 있는 재산도 있으신가요?', '증여는 10년 단위로 합산됩니다.', '신고 기한은 이번 달 말일까지입니다.', '필요한 서류 목록을 보내드리겠습니다.', '매달 영수증을 보내주시면 장부를 정리해 드립니다.'],
};

// 사용자 용어집 (설정에서 추가) → 번역 프롬프트에 자동 반영
export function glossaryText() {
  try {
    const g = JSON.parse(localStorage.getItem('tyd_glossary') || '[]');
    return g.length ? `\nAlways use this glossary (Korean = preferred term): ${g.map(x => `${x.ko} = ${x.en}`).join('; ')}.` : '';
  } catch { return ''; }
}

export function translatePrompt(domainKey, fromName, toName) {
  return `You are a professional live interpreter. ${DOMAINS[domainKey].prompt}${glossaryText()}
Translate the user's utterance from ${fromName} into ${toName}.
Output ONLY the translation, natural spoken style, polite register. Keep numbers, names, amounts exact. No explanations, no quotes.`;
}

export function briefingPrompt(domainKey, partnerLangName) {
  return `당신은 ${DOMAINS[domainKey].label.replace(/^\S+\s/, '')} 분야 상담을 돕는 수석 비서입니다. 아래는 상담자(한국인, 물리치료사·교수·보험설계사·회계법인 근무)와 외국인 고객의 통역 대화 기록입니다.
반드시 아래 JSON 형식만 출력하세요(코드블록 없이):
{
 "title": "상담 제목(짧게)",
 "summary": ["핵심 요약 3줄"],
 "requests": ["고객의 요청·고민"],
 "agreements": ["합의·결정 사항"],
 "todos": ["다음 할 일(누가/언제)"],
 "checks": ["추가 확인이 필요한 정보"],
 "needs": ["말속에 드러난 숨은 니즈"],
 "proposals": ["상담자가 제안할 최적안(구체적으로)"],
 "questions": ["다음에 하면 좋을 질문"],
 "client_summary": "고객에게 보낼 정중한 요약문(${partnerLangName}로 작성, 5~8문장)"
}
의료·보험·세무 판단은 단정하지 말고 '권장/검토' 표현을 쓰세요. 대화에 없는 사실은 지어내지 마세요.`;
}
