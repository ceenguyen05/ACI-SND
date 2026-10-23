import { h } from './dom';
import { sfx } from '../audio/Sfx';

export function seg<T extends string | number>(opts: { value: T; label: string }[], value: T, onChange: (v: T) => void): HTMLElement {
  const wrap = h('div', { class: 'seg' });
  const render = (cur: T) => {
    wrap.innerHTML = '';
    for (const o of opts) {
      wrap.append(h('button', {
        class: o.value === cur ? 'on' : '',
        onclick: () => { sfx.ui_click(); onChange(o.value); render(o.value); },
      }, o.label));
    }
  };
  render(value);
  return wrap;
}

export function slider(min: number, max: number, step: number, value: number, onChange: (v: number) => void, fmt: (v: number) => string = (v) => String(v)): HTMLElement {
  const val = h('span', { class: 'val' }, fmt(value));
  const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) }) as HTMLInputElement;
  input.addEventListener('input', () => { const v = Number(input.value); val.textContent = fmt(v); onChange(v); });
  return h('div', { class: 'slider' }, input, val);
}

export function toggle(value: boolean, onChange: (v: boolean) => void): HTMLElement {
  const b = h('button', { class: 'toggle' + (value ? ' on' : '') });
  b.addEventListener('click', () => { value = !value; b.classList.toggle('on', value); sfx.ui_click(); onChange(value); });
  return b;
}

export function swatches(colors: string[], value: string, onChange: (c: string) => void): HTMLElement {
  const wrap = h('div', { class: 'swatches' });
  const render = (cur: string) => {
    wrap.innerHTML = '';
    for (const c of colors) wrap.append(h('div', { class: 'swatch' + (c.toLowerCase() === cur.toLowerCase() ? ' on' : ''), style: { background: c }, onclick: () => { sfx.ui_click(); onChange(c); render(c); } }));
  };
  render(value);
  return wrap;
}

export function optRow(label: string, control: HTMLElement): HTMLElement[] {
  return [h('div', { class: 'muted' }, label), control];
}
