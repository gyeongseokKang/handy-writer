import { describe, expect, it } from "vitest";

import { suggestTags, terms } from "./tag-suggest";

const doc = (path: string, body: string, tags: string[] = []) => ({ path, name: path.replace(/\.md$/, ""), body, tags });

const DOCS = [
  doc("달리기 일지.md", "아침 달리기 5km. 무릎이 조금 아팠다. 페이스 조절과 스트레칭이 중요하다.", ["운동", "달리기"]),
  doc("마라톤 준비.md", "마라톤 대회 준비. 장거리 달리기 훈련과 페이스 조절, 스트레칭 루틴.", ["운동"]),
  doc("요리 기록.md", "된장찌개 레시피. 두부와 애호박, 된장 한 스푼.", ["요리"]),
  doc("책 메모.md", "소설 읽기. 문장이 아름답다.", ["독서", "기록/책"]),
];

describe("terms", () => {
  it("조사를 떼고, 코드·주소·흔한 말은 뺀다", () => {
    expect(terms("달리기를 했다. `코드` https://x.com 그리고 Running 기록이")).toEqual(["달리기", "running", "기록"]);
  });
});

describe("suggestTags", () => {
  it("비슷한 글에 붙은 기존 태그를 먼저 추천한다", () => {
    const result = suggestTags({ path: "새 글.md", text: "저녁에 장거리 훈련. 페이스 조절이 어려웠고 스트레칭을 길게 했다." }, DOCS);
    expect(result[0]).toMatchObject({ tag: "운동", kind: "existing" });
    expect(result.some((s) => s.tag === "요리")).toBe(false);
  });

  it("본문에 태그 이름이 나오면 크게 올린다 (중첩 태그는 마지막 이름으로)", () => {
    const result = suggestTags({ path: "새 글.md", text: "오늘 산 책 이야기. 요리 책이다." }, DOCS);
    const top = result.filter((s) => s.kind === "existing").map((s) => s.tag);
    expect(top.slice(0, 2).sort()).toEqual(["기록/책", "요리"]);
    expect(result.find((s) => s.tag === "요리")?.reason).toBe("본문에 ‘요리’가 나와요");
  });

  it("한 글자 태그는 다른 낱말의 일부로는 세지 않는다", () => {
    const result = suggestTags({ path: "새 글.md", text: "책임감에 대해." }, DOCS);
    expect(result.find((s) => s.tag === "기록/책")?.reason).not.toBe("본문에 ‘책’가 나와요");
  });

  it("이미 붙은 태그(저장된 태그, 본문의 #태그)는 빼고 대소문자를 가리지 않는다", () => {
    const docs = [...DOCS, doc("새 글.md", "", ["운동"])];
    const result = suggestTags({ path: "새 글.md", text: "달리기 페이스 조절 스트레칭 #달리기" }, docs);
    expect(result.map((s) => s.tag)).not.toContain("운동");
    expect(result.map((s) => s.tag)).not.toContain("달리기");
  });

  it("링크로 이어진 글의 태그를 더한다", () => {
    const index = [
      { path: "새 글.md", name: "새 글", links: ["책 메모"] },
      { path: "책 메모.md", name: "책 메모", links: [] },
    ];
    const result = suggestTags({ path: "새 글.md", text: "짧은 생각." }, DOCS, index);
    expect(result.find((s) => s.tag === "독서")).toMatchObject({ reason: "연결된 글 1개에 붙은 태그예요" });
  });

  it("이 글에 자주 나오고 기존 태그에 없는 낱말을 새 태그 후보로 덧붙인다", () => {
    const result = suggestTags({ path: "새 글.md", text: "제주 여행. 제주 바다와 제주 시장. 여행 계획." }, DOCS);
    const fresh = result.filter((s) => s.kind === "new").map((s) => s.tag);
    expect(fresh).toContain("제주");
    expect(fresh).toContain("여행");
  });

  it("태그가 하나도 없는 작업 폴더면 새 후보만 준다", () => {
    expect(suggestTags({ path: "a.md", text: "고양이 고양이 사료" }, [doc("b.md", "강아지")]).every((s) => s.kind === "new")).toBe(true);
  });
});
