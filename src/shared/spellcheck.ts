export interface SpellIssue {
  /** 검사한 글에서의 시작과 끝(끝은 포함하지 않음). 틀린 부분이 들어 있는 한글 낱말 전체를 가리킨다. */
  start: number;
  end: number;
  /** 틀린 낱말 (예: 됬다) */
  text: string;
  /** 고친 낱말 (예: 됐다) */
  replacement: string;
  ruleId: string;
  /** 왜 틀렸는지 짧은 설명 */
  hint: string;
  /** 온라인 검사처럼 제안이 여러 개일 때의 전체 목록 (첫 번째가 replacement) */
  suggestions?: string[];
  /** rule·online은 맞춤법, style은 문장 다듬기 제안 */
  source?: "rule" | "online" | "style";
  /** 바꿀 말 없이 알려 주기만 하는 항목 (예: 너무 긴 문장). replacement는 text와 같다. */
  noFix?: boolean;
}

/** 맞춤법 탭 항목에 함께 보여줄 앞뒤 글의 길이 */
export const SPELL_CONTEXT = 16;

/** 맞춤법 탭에 보여줄 항목 하나 (에디터 문서 안의 위치와 함께) */
export interface SpellItem {
  issue: SpellIssue;
  from: number;
  to: number;
  /** 틀린 낱말 앞뒤의 글 (목록에서 어디인지 알아보게) */
  before: string;
  after: string;
}

interface Rule {
  id: string;
  pattern: RegExp;
  hint: string;
  /** 일치한 부분을 어떻게 바꿀지. null이면 이 일치는 건너뛴다. */
  fix: (match: RegExpExecArray) => string | null;
}

const HANGUL = /[가-힣]/;

/** 한글 음절의 받침이 ㄹ인지 */
function endsWithRieul(syllable: string) {
  const code = syllable.charCodeAt(0) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 === 8;
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 단어가 `wrong`을 포함하면 그 부분을 `right`로 바꾼다. */
const word = (id: string, wrong: string, right: string, hint: string): Rule => ({
  id,
  pattern: new RegExp(escapeRegExp(wrong), "g"),
  hint,
  fix: () => right,
});

/**
 * 거의 항상 틀린 표기만 넣는다. 맞을 수도 있는 표현(예: 안되다, 바램)이나 사람 이름과 겹칠 수 있는 낱말(예: 구지)은
 * 오탐이 더 괴로워서 일부러 뺐다.
 * 먼저 나온 규칙이 같은 자리를 먼저 차지한다 (예: 안되요는 되요보다 앞에 있어야 한다).
 */
const RULES: Rule[] = [
  word("wenji", "웬지", "왠지", "‘왜인지’의 준말이라 ‘왠지’가 맞아요."),
  word("waenil", "왠일", "웬일", "‘어찌 된 일’은 ‘웬일’이에요."),
  word("waenman", "왠만", "웬만", "‘웬만하다’가 맞아요."),
  word("myeochil", "몇일", "며칠", "날수를 물을 때는 ‘며칠’이에요."),
  word("dwaet", "됬", "됐", "‘되었’의 준말은 ‘됐’이에요."),
  word("eotteokhae", "어떻해", "어떡해", "‘어떻게 해’의 준말은 ‘어떡해’예요."),
  word("oraenman", "오랫만", "오랜만", "‘오래간만’의 준말은 ‘오랜만’이에요."),
  word("geumse", "금새", "금세", "‘금시에’의 준말은 ‘금세’예요."),
  word("seolrem", "설레임", "설렘", "‘설레다’의 명사형은 ‘설렘’이에요."),
  word("seolre", "설레이", "설레", "‘설레이다’가 아니라 ‘설레다’예요."),
  word("heuihan", "희안", "희한", "‘희한하다’가 맞아요."),
  word("eoi", "어의없", "어이없", "‘어이없다’가 맞아요."),
  word("yeokhal", "역활", "역할", "‘역할’이 맞아요."),
  word("iliri", "일일히", "일일이", "‘-이’로 끝나는 부사예요."),
  word("gomgomi", "곰곰히", "곰곰이", "‘곰곰이’가 맞아요."),
  word("kkaekkeusi", "깨끗히", "깨끗이", "‘깨끗이’가 맞아요."),
  word("teumteumi", "틈틈히", "틈틈이", "‘틈틈이’가 맞아요."),
  word("beonbeoni", "번번히", "번번이", "‘번번이’가 맞아요."),
  word("kkomkkomhi", "꼼꼼이", "꼼꼼히", "‘꼼꼼히’가 맞아요."),
  word("iljjigi", "일찌기", "일찍이", "‘일찍이’가 맞아요."),
  word("eojjaetdeun", "어쨋", "어쨌", "‘어쨌든’이 맞아요."),
  word("gaegujaengi", "개구장이", "개구쟁이", "‘-쟁이’가 맞아요."),
  word("meotjaengi", "멋장이", "멋쟁이", "‘멋쟁이’가 맞아요."),
  word("dakdal", "닥달", "닦달", "‘닦달’이 맞아요."),
  word("wicheung", "윗층", "위층", "‘위층’이 맞아요."),
  word("wijjok", "윗쪽", "위쪽", "‘위쪽’이 맞아요."),
  word("dwicheo", "뒤쳐", "뒤처", "‘뒤처지다’가 맞아요."),
  word("samga", "삼가하", "삼가", "‘삼가다’가 맞아요."),
  word("almatneun", "알맞는", "알맞은", "‘알맞다’는 형용사라 ‘알맞은’이에요."),
  word("geolmatneun", "걸맞는", "걸맞은", "‘걸맞다’는 형용사라 ‘걸맞은’이에요."),
  word("eubnida", "읍니다", "습니다", "‘-습니다’가 현재 표기예요."),
  word("anidwaeyo", "안되요", "안 돼요", "‘안’은 띄어 쓰고 ‘돼요’가 맞아요."),
  word("dwaeyo", "되요", "돼요", "‘되어요’의 준말은 ‘돼요’예요."),
  word("dwaeseo", "되서", "돼서", "‘되어서’의 준말은 ‘돼서’예요."),
  word("bwaeyo", "뵈요", "봬요", "‘뵈어요’의 준말은 ‘봬요’예요."),
  word("aniyeyo", "아니예요", "아니에요", "‘아니’ 뒤에는 ‘에요’를 써요."),
  word("anjoh", "않좋", "안 좋", "‘안’은 띄어 쓰는 부정 부사예요."),
  word("geureoryeo", "그럴려", "그러려", "‘-려’ 앞에 ㄹ을 붙이지 않아요."),
  word("ireoryeo", "이럴려", "이러려", "‘-려’ 앞에 ㄹ을 붙이지 않아요."),
  word("jeoreoryeo", "저럴려", "저러려", "‘-려’ 앞에 ㄹ을 붙이지 않아요."),
  word("halryeo", "할려", "하려", "‘하려고’가 맞아요."),
  word("hasilryeo", "하실려", "하시려", "‘하시려고’가 맞아요."),
  {
    // -ㄹ게 (할께 → 할게)
    id: "rieul-ge",
    pattern: /([가-힣])께(?=요|(?![가-힣]))/g,
    hint: "‘-ㄹ게’가 맞아요.",
    fix: (m) => (endsWithRieul(m[1] ?? "") ? `${m[1]}게` : null),
  },
  {
    // 할 수 있다 (할수있다 → 할 수 있다). ‘-ㄹ수록’은 붙여 쓰는 어미라 있/없이 뒤따를 때만 본다.
    id: "su-spacing",
    pattern: /([가-힣])수(있|없)/g,
    hint: "‘수’는 의존 명사라 앞뒤를 띄어 써요.",
    fix: (m) => (endsWithRieul(m[1] ?? "") ? `${m[1]} 수 ${m[2]}` : null),
  },
];

/** 검사에서 뺄 부분(주소, #태그, 인라인 코드)을 같은 길이의 빈 글자로 바꾼다. */
export function mask(text: string) {
  return text.replace(/https?:\/\/\S+|#[\p{L}\p{N}_/-]+|`[^`\n]*`/gu, (m) => "\u0000".repeat(m.length));
}

/** 일치한 부분이 속한 한글 낱말 전체의 범위 */
function wordBounds(text: string, start: number, end: number) {
  let from = start;
  let to = end;
  while (from > 0 && HANGUL.test(text[from - 1] ?? "")) from--;
  while (to < text.length && HANGUL.test(text[to] ?? "")) to++;
  return { from, to };
}

export function checkSpelling(text: string): SpellIssue[] {
  const masked = mask(text);
  const found: SpellIssue[] = [];
  const taken: Array<[number, number]> = [];

  for (const rule of RULES) {
    for (const match of masked.matchAll(rule.pattern)) {
      const replaced = rule.fix(match as RegExpExecArray);
      if (replaced === null) continue;
      const matchStart = match.index;
      const matchEnd = matchStart + match[0].length;
      const { from, to } = wordBounds(masked, matchStart, matchEnd);
      // 이미 앞선 규칙이 차지한 자리는 건너뛴다.
      if (taken.some(([s, e]) => from < e && to > s)) continue;
      taken.push([from, to]);
      found.push({
        start: from,
        end: to,
        text: text.slice(from, to),
        replacement: text.slice(from, matchStart) + replaced + text.slice(matchEnd, to),
        ruleId: rule.id,
        hint: rule.hint,
      });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

/** 무시한 항목을 기억하는 키. 같은 규칙으로 같은 낱말이면 같은 키다. */
export const issueKey = (issue: Pick<SpellIssue, "ruleId" | "text">) => `${issue.ruleId}:${issue.text}`;
