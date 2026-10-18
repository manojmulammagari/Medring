'use client';
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

/** localStorage-backed state; loads after mount (no hydration mismatch) and never throws if storage is blocked. */
export function usePersistentState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
    const [value, setValue] = useState<T>(initial);
    const [ready, setReady] = useState(false);
    useEffect(() => {
        try {
            const raw = window.localStorage.getItem(key);
            if (raw !== null) setValue(JSON.parse(raw) as T);
        } catch {
            /* storage unavailable */
        }
        setReady(true);
    }, [key]);
    useEffect(() => {
        if (!ready) return;
        try {
            window.localStorage.setItem(key, JSON.stringify(value));
        } catch {
            /* storage unavailable */
        }
    }, [key, value, ready]);
    return [value, setValue];
}

export interface HudHandlers {
    onCalm(): void;
    onContrast(): void;
    onSpeak(): void;
    onPrev(): void;
    onNext(): void;
    onPreset(n: 1 | 2 | 3): void;
    onPrint(): void;
    onLang(): void;
    onScan(): void;
    onEscape(): void;
}

/** Global shortcuts. Ignored while typing and while a modifier is held; Space defers to focused buttons/links. */
export function useHudHotkeys(handlers: HudHandlers, enabled = true): void {
    const ref = useRef(handlers);
    ref.current = handlers;
    useEffect(() => {
        if (!enabled) return;
        const onKey = (e: KeyboardEvent): void => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const t = e.target as HTMLElement | null;
            const tag = t?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) {
                if (e.key === 'Escape') ref.current.onEscape();
                return;
            }
            if (e.repeat && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            const h = ref.current;
            switch (e.key) {
                case 'c':
                case 'C':
                    e.preventDefault();
                    h.onCalm();
                    break;
                case 'h':
                case 'H':
                    e.preventDefault();
                    h.onContrast();
                    break;
                case ' ':
                    if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY') return;
                    e.preventDefault();
                    h.onSpeak();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    h.onPrev();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    h.onNext();
                    break;
                case '1':
                case '2':
                case '3':
                    h.onPreset(Number(e.key) as 1 | 2 | 3);
                    break;
                case 'p':
                case 'P':
                    e.preventDefault();
                    h.onPrint();
                    break;
                case 'l':
                case 'L':
                    h.onLang();
                    break;
                case 's':
                case 'S':
                    e.preventDefault();
                    h.onScan();
                    break;
                case 'Escape':
                    h.onEscape();
                    break;
                default:
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [enabled]);
}