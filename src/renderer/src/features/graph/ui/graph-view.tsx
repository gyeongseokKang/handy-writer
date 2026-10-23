import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";

import { buildLinkGraph, type GraphNode } from "@/entities/note-index/lib/derive";
import { useNoteIndexStore } from "@/entities/note-index/model/use-note-index-store";
import { useWorkspaceStore } from "@/entities/note/model/use-workspace-store";

interface Colors {
  node: string;
  ghost: string;
  active: string;
  link: string;
  linkActive: string;
  label: string;
  dim: string;
}

function readColors(): Colors {
  const style = getComputedStyle(document.documentElement);
  const v = (name: string) => style.getPropertyValue(name).trim();
  return {
    node: v("--muted-foreground"),
    ghost: v("--border"),
    active: v("--primary"),
    link: v("--border"),
    linkActive: v("--muted-foreground"),
    label: v("--foreground"),
    dim: v("--border"),
  };
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSize({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, size] as const;
}

const LABEL_ZOOM = 1.1;

export function GraphView() {
  const entries = useNoteIndexStore((state) => state.entries);
  const activePath = useWorkspaceStore((state) => state.activePath);
  const openNote = useWorkspaceStore((state) => state.openNote);
  const createNote = useWorkspaceStore((state) => state.createNote);

  const [hideOrphans, setHideOrphans] = useState(false);
  const [showMissing, setShowMissing] = useState(true);
  const [search, setSearch] = useState("");
  const [hovered, setHovered] = useState<string | null>(null);
  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const colors = useMemo(readColors, []);

  // react-force-graph가 노드와 링크 객체를 직접 고치므로, 데이터가 바뀔 때마다 새로 만든다.
  const data = useMemo(() => {
    const graph = buildLinkGraph(entries);
    const nodes = graph.nodes
      .filter((node) => (showMissing || node.path !== null) && (!hideOrphans || node.degree > 0))
      .map((node) => ({ ...node }));
    const ids = new Set(nodes.map((node) => node.id));
    const links = graph.links.filter((link) => ids.has(link.source) && ids.has(link.target)).map((link) => ({ ...link }));
    return { nodes, links };
  }, [entries, hideOrphans, showMissing]);

  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const { source, target } of data.links) {
      const s = String(source);
      const t = String(target);
      (map.get(s) ?? map.set(s, new Set()).get(s))?.add(t);
      (map.get(t) ?? map.set(t, new Set()).get(t))?.add(s);
    }
    return map;
  }, [data]);

  const needle = search.trim().toLowerCase();
  const isMatch = (node: GraphNode) => needle !== "" && node.name.toLowerCase().includes(needle);
  const isNear = (id: string) => hovered !== null && (id === hovered || neighbors.get(hovered)?.has(id) === true);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden"
      data-node-count={data.nodes.length}
      data-link-count={data.links.length}
    >
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 rounded-lg border bg-card/90 p-3 text-sm shadow-sm backdrop-blur">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="그래프에서 글 찾기"
          aria-label="그래프에서 글 찾기"
          className="h-8 w-52 rounded-md border bg-background px-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={hideOrphans} onChange={(e) => setHideOrphans(e.target.checked)} />
          고립된 글 숨기기
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={showMissing} onChange={(e) => setShowMissing(e.target.checked)} />
          아직 없는 글 보기
        </label>
        <p className="text-xs text-muted-foreground">
          글 {data.nodes.filter((n) => n.path).length}개 · 링크 {data.links.length}개
        </p>
      </div>

      {data.nodes.length === 0 ? (
        <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
          표시할 글이 없어요. 글 안에서 [[로 다른 글을 연결해 보세요.
        </p>
      ) : (
        size.width > 0 && (
          <ForceGraph2D
            width={size.width}
            height={size.height}
            graphData={data}
            backgroundColor="transparent"
            cooldownTicks={120}
            nodeRelSize={4}
            nodeVal={(node) => 1 + (node as GraphNode).degree * 0.6}
            linkColor={(link) => {
              const s = typeof link.source === "object" ? (link.source as GraphNode).id : String(link.source);
              const t = typeof link.target === "object" ? (link.target as GraphNode).id : String(link.target);
              return hovered !== null && (s === hovered || t === hovered) ? colors.linkActive : colors.link;
            }}
            onNodeHover={(node) => setHovered(node ? (node as GraphNode).id : null)}
            onNodeClick={(node) => {
              const { path, name } = node as GraphNode;
              if (path) void openNote(path);
              else void createNote("", name);
            }}
            nodePointerAreaPaint={(node, color, ctx) => {
              const { x = 0, y = 0 } = node;
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(x, y, 4 * Math.sqrt(1 + (node as GraphNode).degree * 0.6) + 2, 0, 2 * Math.PI);
              ctx.fill();
            }}
            nodeCanvasObject={(node, ctx, scale) => {
              const n = node as GraphNode & { x: number; y: number };
              const radius = 4 * Math.sqrt(1 + n.degree * 0.6);
              const dimmed = hovered !== null && !isNear(n.id);
              const isActive = n.path !== null && n.path === activePath;

              ctx.beginPath();
              ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI);
              if (n.path === null) {
                ctx.strokeStyle = colors.node;
                ctx.setLineDash([2, 2]);
                ctx.lineWidth = 1 / scale;
                ctx.stroke();
                ctx.setLineDash([]);
              } else {
                ctx.fillStyle = isActive || isMatch(n) ? colors.active : dimmed ? colors.dim : colors.node;
                ctx.fill();
              }
              if (isActive) {
                ctx.beginPath();
                ctx.arc(n.x, n.y, radius + 3 / scale, 0, 2 * Math.PI);
                ctx.strokeStyle = colors.active;
                ctx.lineWidth = 1.5 / scale;
                ctx.stroke();
              }

              if (scale > LABEL_ZOOM || isNear(n.id) || isActive || isMatch(n)) {
                const fontSize = 12 / scale;
                ctx.font = `${fontSize}px sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "top";
                ctx.fillStyle = dimmed ? colors.dim : colors.label;
                ctx.fillText(n.name, n.x, n.y + radius + 2 / scale);
              }
            }}
          />
        )
      )}
    </div>
  );
}
