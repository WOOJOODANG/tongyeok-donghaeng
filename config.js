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

export function translatePrompt(domainKey, fromName, toName) {
  return `You are a professional live interpreter. ${DOMAINS[domainKey].prompt}
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
