/** 글(탭·글 목록)을 끌 때 싣는 전용 형식. 에디터 영역에 놓으면 나란히 띄운다. */
export const NOTE_DRAG_TYPE = "application/x-handy-note";

export const isNoteDrag = (event: { dataTransfer: DataTransfer | null }) => !!event.dataTransfer?.types.includes(NOTE_DRAG_TYPE);
