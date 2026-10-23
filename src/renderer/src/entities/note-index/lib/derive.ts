import type { NoteIndexEntry } from "@shared/types";
import { createLinkResolver } from "@shared/note-parser";

export interface GraphNode {
  /** 있는 글은 경로, 아직 없는 글은 `ghost:이름` */
  id: string;
  name: string;
  /** 없는 글(다른 글에서 링크만 된 대상)이면 null */
  path: string | null;
  tags: string[];
  /** 이 노드와 이어진 서로 다른 노드의 수 */
  degree: number;
}

export interface GraphLink {
  source: string;
  target: string;
}

export interface LinkGraph {
  nodes: GraphNode[];
  links: GraphLink[];
}

export function buildLinkGraph(entries: NoteIndexEntry[]): LinkGraph {
  const resolve = createLinkResolver(entries);
  const nodes = new Map<string, GraphNode>();
  for (const entry of entries) {
    nodes.set(entry.path, { id: entry.path, name: entry.name, path: entry.path, tags: entry.tags, degree: 0 });
  }

  const linkKeys = new Set<string>();
  const links: GraphLink[] = [];
  for (const entry of entries) {
    for (const target of entry.links) {
      const path = resolve(target);
      let targetId = path;
      if (!targetId) {
        targetId = `ghost:${target.toLowerCase()}`;
        if (!nodes.has(targetId)) nodes.set(targetId, { id: targetId, name: target, path: null, tags: [], degree: 0 });
      }
      if (targetId === entry.path) continue;
      const key = `${entry.path}\u0000${targetId}`;
      if (linkKeys.has(key)) continue;
      linkKeys.add(key);
      links.push({ source: entry.path, target: targetId });
    }
  }

  const neighbors = new Map<string, Set<string>>();
  for (const { source, target } of links) {
    (neighbors.get(source) ?? neighbors.set(source, new Set()).get(source))?.add(target);
    (neighbors.get(target) ?? neighbors.set(target, new Set()).get(target))?.add(source);
  }
  for (const node of nodes.values()) node.degree = neighbors.get(node.id)?.size ?? 0;

  return { nodes: [...nodes.values()], links };
}

/** 이 글을 가리키는 다른 글들 */
export function backlinksOf(entries: NoteIndexEntry[], path: string): NoteIndexEntry[] {
  const resolve = createLinkResolver(entries);
  return entries.filter((entry) => entry.path !== path && entry.links.some((target) => resolve(target) === path));
}

export interface OutgoingLink {
  target: string;
  /** 있는 글이면 경로, 없으면 null */
  path: string | null;
}

export function outgoingOf(entries: NoteIndexEntry[], entry: NoteIndexEntry): OutgoingLink[] {
  const resolve = createLinkResolver(entries);
  return entry.links.map((target) => ({ target, path: resolve(target) })).filter((link) => link.path !== entry.path);
}

export interface TagSummary {
  tag: string;
  paths: string[];
}

/** 태그별 글 목록. 대소문자는 무시하고, 글이 많은 태그가 앞에 온다. */
export function collectTags(entries: NoteIndexEntry[]): TagSummary[] {
  const groups = new Map<string, TagSummary>();
  for (const entry of entries) {
    for (const tag of entry.tags) {
      const key = tag.toLowerCase();
      const group = groups.get(key) ?? { tag, paths: [] };
      group.paths.push(entry.path);
      groups.set(key, group);
    }
  }
  return [...groups.values()].sort((a, b) => b.paths.length - a.paths.length || a.tag.localeCompare(b.tag, "ko"));
}
