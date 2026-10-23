type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, unknown> & { class?: string; style?: string | Partial<CSSStyleDeclaration> };

/** Tiny hyperscript helper for building DOM UI without a framework. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs | null = null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = String(v);
      else if (k === 'style') {
        if (typeof v === 'string') el.setAttribute('style', v);
        else Object.assign(el.style, v);
      } else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'html') el.innerHTML = String(v);
      else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function clear(el: HTMLElement) { while (el.firstChild) el.removeChild(el.firstChild); }

/** Set text only when changed (cheap per-frame HUD updates). */
export function setText(el: HTMLElement, text: string) { if (el.textContent !== text) el.textContent = text; }

export function money(n: number) { return '$' + n.toLocaleString('en-US'); }
