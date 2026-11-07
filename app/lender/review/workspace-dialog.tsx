"use client";
import { useEffect, useRef, type ReactNode } from "react";

export default function WorkspaceDialog({ open, title, busy, onClose, children }: { open: boolean; title: string; busy: boolean; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const pointer = useRef<number | null>(null);
  useEffect(() => {
    if (!open || !dialog.current) return;
    const element = dialog.current, opener = document.activeElement as HTMLElement | null;
    const x = window.scrollX, y = window.scrollY, body = document.body;
    const names = ["position", "top", "left", "width", "overflow", "padding-right"];
    const previous = names.map(name => [name, body.style.getPropertyValue(name), body.style.getPropertyPriority(name)]);
    const gap = innerWidth - document.documentElement.clientWidth;
    const padding = parseFloat(getComputedStyle(body).paddingRight) || 0;
    body.style.position = "fixed"; body.style.top = `-${y}px`; body.style.left = `-${x}px`; body.style.width = "100%"; body.style.overflow = "hidden";
    if (gap) body.style.paddingRight = `${padding + gap}px`;
    element.showModal(); element.scrollTop = 0; heading.current?.focus({ preventScroll: true });
    return () => {
      element.close(); pointer.current = null;
      for (const [name, value, priority] of previous) value ? body.style.setProperty(name, value, priority) : body.style.removeProperty(name);
      window.scrollTo({ left: x, top: y, behavior: "instant" });
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, [open]);
  function close() { if (!busy) onClose(); }
  return <dialog ref={dialog} className="l-workspace-dialog" aria-label={title} onCancel={event => {event.preventDefault();close();}}
    onPointerDown={event => {const r=event.currentTarget.getBoundingClientRect();pointer.current=event.isPrimary && event.button===0 && event.target===event.currentTarget && (event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) ? event.pointerId : null;}}
    onPointerUp={event => {const started=pointer.current===event.pointerId;pointer.current=null;const r=event.currentTarget.getBoundingClientRect();if(started && event.target===event.currentTarget && (event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom))close();}}
    onPointerCancel={() => {pointer.current=null;}}>
    <div className="l-dialog-heading"><h2 ref={heading} tabIndex={-1}>{title}</h2><button className="l-secondary" disabled={busy} onClick={close}>Close</button></div>
    {children}
  </dialog>;
}
